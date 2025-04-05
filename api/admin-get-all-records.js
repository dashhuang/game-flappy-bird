import { createClient } from 'redis';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '方法不允许' });
  }

  // 设置响应头，避免缓存
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  // 获取限制参数
  const limit = parseInt(req.query.limit) || 100;
  
  // 创建超时处理
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('API执行超时，请尝试减少获取的数据量'));
    }, 8000); // 设置8秒超时，低于平台默认超时
  });
  
  try {
    // 创建Redis客户端并连接
    let redis;
    try {
      redis = await createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          connectTimeout: 5000, // 连接超时5秒
          reconnectStrategy: false // 不自动重连
        }
      }).connect();
    } catch (connError) {
      console.error('Redis连接错误:', connError);
      return res.status(500).json({ 
        error: '无法连接到数据库',
        details: connError.message 
      });
    }
    
    // 用于存储完整数据
    const allRecords = new Map(); // 使用Map避免重复记录
    let recordCount = 0;
    
    try {
      // 获取额外的数据库信息
      const dbInfo = {
        totalKeys: 0,
        collections: [],
        allSets: []
      };
      
      // 获取Redis中的所有键，但限制数量
      let allKeys;
      try {
        // 使用SCAN替代KEYS，更适合生产环境
        const keyResults = [];
        let cursor = '0';
        let scanCount = 0;
        
        // 最多扫描5次，每次最多获取100个键
        while (cursor !== '0' && scanCount < 5) {
          const result = await redis.scan(cursor, { COUNT: 100 });
          cursor = result.cursor;
          keyResults.push(...result.keys);
          scanCount++;
          
          if (keyResults.length > 300) break; // 最多获取300个键
        }
        
        allKeys = keyResults;
        dbInfo.totalKeys = allKeys.length;
      } catch (keysError) {
        console.warn('获取所有键出错，使用空数组代替:', keysError);
        allKeys = [];
      }
      
      // 识别所有集合前缀
      const collections = new Set();
      const scoreSets = []; // 存储所有scores相关的集合
      
      allKeys.forEach(key => {
        if (key.includes(':')) {
          const prefix = key.split(':')[0];
          collections.add(prefix);
        }
        
        // 识别所有分数相关的集合
        if (key === 'scores' || key.startsWith('scores:')) {
          scoreSets.push(key);
        }
      });
      
      // 如果没有找到任何scores集合，至少添加默认的scores
      if (scoreSets.length === 0) {
        scoreSets.push('scores');
      }
      
      dbInfo.collections = Array.from(collections);
      dbInfo.allSets = scoreSets;
      
      console.log('找到以下分数集合:', scoreSets);
      
      // 从所有分数集合中获取记录，但限制获取的记录总数
      for (const setKey of scoreSets) {
        if (recordCount >= limit) break; // 如果已达到限制，停止获取更多数据
        
        let setIds = [];
        try {
          // 只获取前500条记录
          const rangeLimit = Math.min(Math.floor(limit / scoreSets.length), 500);
          setIds = await redis.zRange(setKey, 0, rangeLimit - 1, { REV: true });
          console.log(`集合 ${setKey} 中获取 ${setIds.length} 条记录`);
        } catch (rangeError) {
          console.warn(`从集合 ${setKey} 获取ID出错，将跳过该集合:`, rangeError);
          continue;
        }
        
        // 获取每个记录的详情
        let processedCount = 0;
        for (const id of setIds) {
          if (recordCount >= limit) break; // 检查是否达到总限制
          
          // 如果这个ID已经处理过，跳过
          if (allRecords.has(id)) continue;
          
          try {
            const scoreData = await redis.hGetAll(`score:${id}`);
            if (Object.keys(scoreData).length > 0) {
              // 将所有字段原样保留，添加来源集合信息
              allRecords.set(id, {
                id: id,
                ...scoreData,
                sourceSet: setKey,
                // 添加一些格式化的字段，方便前端显示
                formatted: {
                  score: parseInt(scoreData.score) || 0,
                  timestamp: scoreData.timestamp ? parseInt(scoreData.timestamp) : 0,
                  date: scoreData.timestamp 
                    ? new Date(parseInt(scoreData.timestamp)).toISOString() 
                    : new Date().toISOString(),
                  mode: scoreData.mode || 'endless'
                }
              });
              
              recordCount++;
            }
            
            processedCount++;
            // 每处理50条记录检查一次是否接近超时
            if (processedCount % 50 === 0) {
              // 不再等待，避免处理太久
              if (processedCount >= 200) break;
            }
          } catch (dataError) {
            console.warn(`获取记录 ${id} 详情出错，将跳过该记录:`, dataError);
          }
        }
      }
      
      // 转换为数组
      const recordsArray = Array.from(allRecords.values());
      
      // 记录API调用
      console.log(`管理员API请求: /api/admin-get-all-records?limit=${limit}`);
      console.log(`返回 ${recordsArray.length} 条完整记录 (从 ${scoreSets.length} 个集合中)`);
      
      // 关闭Redis连接
      await redis.disconnect();
      
      // 清除超时
      clearTimeout(timeoutId);
      
      // 构造响应对象
      const responseData = {
        records: recordsArray,
        database: dbInfo,
        totalCount: recordsArray.length,
        limitReached: recordCount >= limit,
        message: recordCount >= limit ? `达到查询限制(${limit})，没有显示所有记录` : undefined
      };
      
      // 安全地序列化JSON，处理可能的循环引用
      const safeJson = JSON.stringify(responseData, (key, value) => {
        if (key === 'formatted' && typeof value === 'object') {
          // 确保格式化后的对象可以被序列化
          return {
            score: value.score || 0,
            timestamp: value.timestamp || 0,
            date: value.date || new Date().toISOString(),
            mode: value.mode || 'endless'
          };
        }
        return value;
      });
      
      // 发送响应
      return res.status(200).send(safeJson);
    } catch (mainError) {
      // 确保Redis连接关闭
      if (redis) {
        try {
          await redis.disconnect();
        } catch (disconnectError) {
          console.error('关闭Redis连接出错:', disconnectError);
        }
      }
      
      // 清除超时
      clearTimeout(timeoutId);
      
      throw mainError; // 重新抛出错误以便外层捕获
    }
  } catch (error) {
    // 如果有超时ID，清除它
    if (timeoutId) clearTimeout(timeoutId);
    
    console.error('获取管理员记录时出错:', error);
    return res.status(500).json({ 
      error: '服务器错误：' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 