import { createClient } from 'redis';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '方法不允许' });
  }
  
  try {
    // 创建Redis客户端并连接
    let redis;
    try {
      redis = await createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
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
    
    try {
      // 获取额外的数据库信息
      const dbInfo = {
        totalKeys: 0,
        collections: [],
        allSets: []
      };
      
      // 获取Redis中的所有键
      let allKeys;
      try {
        allKeys = await redis.keys('*');
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
      
      // 从所有分数集合中获取记录
      for (const setKey of scoreSets) {
        let setIds = [];
        try {
          setIds = await redis.zRange(setKey, 0, -1, { REV: true });
          console.log(`集合 ${setKey} 中有 ${setIds.length} 条记录`);
        } catch (rangeError) {
          console.warn(`从集合 ${setKey} 获取ID出错，将跳过该集合:`, rangeError);
          continue;
        }
        
        // 获取每个记录的详情
        for (const id of setIds) {
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
            }
          } catch (dataError) {
            console.warn(`获取记录 ${id} 详情出错，将跳过该记录:`, dataError);
          }
        }
      }
      
      // 转换为数组
      const recordsArray = Array.from(allRecords.values());
      
      // 记录API调用
      console.log(`管理员API请求: /api/admin-get-all-records`);
      console.log(`返回 ${recordsArray.length} 条完整记录 (从 ${scoreSets.length} 个集合中)`);
      
      // 关闭Redis连接
      await redis.disconnect();
      
      return res.status(200).json({
        records: recordsArray,
        database: dbInfo,
        totalCount: recordsArray.length
      });
    } catch (mainError) {
      // 确保Redis连接关闭
      if (redis) {
        try {
          await redis.disconnect();
        } catch (disconnectError) {
          console.error('关闭Redis连接出错:', disconnectError);
        }
      }
      throw mainError; // 重新抛出错误以便外层捕获
    }
  } catch (error) {
    console.error('获取管理员记录时出错:', error);
    return res.status(500).json({ 
      error: '服务器错误：' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 