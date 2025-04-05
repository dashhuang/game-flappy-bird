import { createClient } from 'redis';

export default async function handler(req, res) {
  // 设置响应头，避免缓存
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  // 获取限制参数
  const limit = parseInt(req.query.limit) || 100;
  
  // 存储调试信息
  const debugInfo = {
    steps: [],
    collections: [],
    errors: []
  };
  
  const addDebugStep = (step, data) => {
    debugInfo.steps.push({ step, data, time: new Date().toISOString() });
    console.log(`[DEBUG] ${step}:`, data);
  };
  
  const addError = (step, error) => {
    debugInfo.errors.push({ step, error: error.message, time: new Date().toISOString() });
    console.error(`[ERROR] ${step}:`, error);
  };
  
  try {
    addDebugStep('开始API处理', { method: req.method, limit });
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: '方法不允许' });
    }
  
    // 创建Redis客户端并连接
    let redis;
    try {
      addDebugStep('连接Redis', { url: process.env.REDIS_URL ? '已配置' : '未配置' });
      
      redis = await createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          connectTimeout: 10000, // 连接超时10秒
          reconnectStrategy: false // 不自动重连
        }
      }).connect();
      
      addDebugStep('Redis连接成功', { connected: !!redis });
    } catch (connError) {
      addError('Redis连接失败', connError);
      return res.status(500).json({ 
        error: '无法连接到数据库',
        details: connError.message,
        debug: debugInfo
      });
    }
    
    // 测试Redis连接
    try {
      const pingResult = await redis.ping();
      addDebugStep('Redis Ping测试', { result: pingResult });
    } catch (pingError) {
      addError('Redis Ping失败', pingError);
    }
    
    // 用于存储完整数据
    const allRecords = new Map(); // 使用Map避免重复记录
    let recordCount = 0;
    
    // 获取额外的数据库信息
    const dbInfo = {
      totalKeys: 0,
      collections: [],
      allSets: []
    };
    
    // 首先尝试获取所有键
    let allKeys = [];
    try {
      // 使用SCAN替代KEYS
      let cursor = '0';
      let scanCount = 0;
      const maxScanCount = 10; // 增加扫描次数
      
      addDebugStep('开始扫描Redis键', { maxScanCount });
      
      while (scanCount < maxScanCount) {
        const result = await redis.scan(cursor, { COUNT: 200 });
        cursor = result.cursor;
        
        if (result.keys && Array.isArray(result.keys)) {
          allKeys.push(...result.keys);
          addDebugStep(`SCAN #${scanCount+1}`, { 
            cursor,
            keysFound: result.keys.length, 
            totalSoFar: allKeys.length 
          });
        }
        
        scanCount++;
        
        // 如果游标返回'0'，表示扫描完成
        if (cursor === '0') {
          addDebugStep('SCAN完成', { scanCount, totalKeys: allKeys.length });
          break;
        }
      }
      
      if (scanCount >= maxScanCount && cursor !== '0') {
        addDebugStep('SCAN达到最大次数限制', { maxScanCount, totalKeys: allKeys.length });
      }
      
      dbInfo.totalKeys = allKeys.length;
    } catch (keysError) {
      addError('获取键列表失败', keysError);
      // 错误时继续尝试其他方法
    }
    
    addDebugStep('获取到的所有键', { keys: allKeys.slice(0, 50), totalCount: allKeys.length });
    
    // 识别所有集合前缀和scores相关集合
    const collections = new Set();
    let scoreSets = []; // 存储所有scores相关的集合
    
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
    
    // 如果没有找到scores集合，尝试使用TYPE命令查看键类型
    if (scoreSets.length === 0) {
      addDebugStep('未找到scores集合，尝试检查键类型', {});
      
      try {
        // 检查可能是有序集合的键
        for (const key of allKeys) {
          try {
            const keyType = await redis.type(key);
            if (keyType === 'zset') {
              addDebugStep(`找到有序集合`, { key, type: keyType });
              scoreSets.push(key);
            }
          } catch (typeError) {
            addError(`检查键类型失败: ${key}`, typeError);
          }
        }
      } catch (typeCheckError) {
        addError('检查键类型过程失败', typeCheckError);
      }
    }
    
    // 如果仍然没找到，至少添加默认的scores
    if (scoreSets.length === 0) {
      addDebugStep('未找到任何有序集合，添加默认scores集合', {});
      scoreSets.push('scores');
    }
    
    dbInfo.collections = Array.from(collections);
    dbInfo.allSets = scoreSets;
    debugInfo.collections = scoreSets;
    
    addDebugStep('找到的分数集合', { sets: scoreSets });
    
    // 从所有分数集合中获取记录
    for (const setKey of scoreSets) {
      if (recordCount >= limit) {
        addDebugStep(`达到记录限制，停止处理`, { limit, current: recordCount });
        break; 
      }
      
      let setIds = [];
      try {
        // 检查集合是否存在
        const exists = await redis.exists(setKey);
        if (!exists) {
          addDebugStep(`集合不存在`, { set: setKey });
          continue;
        }
        
        // 获取集合类型
        const keyType = await redis.type(setKey);
        addDebugStep(`集合类型`, { set: setKey, type: keyType });
        
        if (keyType !== 'zset') {
          addDebugStep(`集合不是有序集合，跳过`, { set: setKey, type: keyType });
          continue;
        }
        
        // 获取集合大小
        const setSize = await redis.zCard(setKey);
        addDebugStep(`集合大小`, { set: setKey, size: setSize });
        
        if (setSize === 0) {
          addDebugStep(`集合为空，跳过`, { set: setKey });
          continue;
        }
        
        // 获取集合成员
        const rangeLimit = Math.min(Math.floor(limit / scoreSets.length), 1000);
        setIds = await redis.zRange(setKey, 0, rangeLimit - 1, { REV: true });
        addDebugStep(`获取集合成员`, { 
          set: setKey, 
          requestedLimit: rangeLimit,
          membersFound: setIds.length 
        });
      } catch (setError) {
        addError(`处理集合失败: ${setKey}`, setError);
        continue;
      }
      
      // 获取每个记录的详情
      addDebugStep(`开始处理集合成员`, { set: setKey, members: setIds.length });
      
      for (const id of setIds) {
        if (recordCount >= limit) break;
        
        // 如果这个ID已经处理过，跳过
        if (allRecords.has(id)) continue;
        
        try {
          // 构建记录键名
          const recordKey = `score:${id}`;
          
          // 检查记录是否存在
          const recordExists = await redis.exists(recordKey);
          if (!recordExists) {
            addDebugStep(`记录不存在`, { id, key: recordKey });
            continue;
          }
          
          // 获取记录详情
          const scoreData = await redis.hGetAll(recordKey);
          const fieldCount = Object.keys(scoreData).length;
          
          addDebugStep(`获取记录详情`, { 
            id, 
            fieldsFound: fieldCount,
            sample: fieldCount > 0 ? Object.keys(scoreData).slice(0, 3) : []
          });
          
          if (fieldCount > 0) {
            // 添加记录
            allRecords.set(id, {
              id: id,
              ...scoreData,
              sourceSet: setKey,
              // 添加格式化字段
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
        } catch (recordError) {
          addError(`处理记录失败: ${id}`, recordError);
        }
      }
    }
    
    // 如果仍然没有数据，尝试获取所有hash类型的键
    if (allRecords.size === 0) {
      addDebugStep('未找到任何记录，尝试查找所有哈希类型的键', {});
      
      try {
        for (const key of allKeys) {
          if (recordCount >= limit) break;
          
          try {
            // 检查是否为哈希类型
            const keyType = await redis.type(key);
            if (keyType === 'hash' && key.startsWith('score:')) {
              const id = key.substring(6); // 移除 "score:" 前缀
              const scoreData = await redis.hGetAll(key);
              
              if (Object.keys(scoreData).length > 0) {
                allRecords.set(id, {
                  id: id,
                  ...scoreData,
                  sourceSet: '通过hash键发现',
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
                addDebugStep(`通过hash键发现记录`, { id, key });
              }
            }
          } catch (hashError) {
            addError(`检查hash键失败: ${key}`, hashError);
          }
        }
      } catch (hashScanError) {
        addError('扫描hash键过程失败', hashScanError);
      }
    }
    
    // 转换为数组
    const recordsArray = Array.from(allRecords.values());
    
    addDebugStep('数据处理完成', { 
      totalRecords: recordsArray.length,
      setsProcessed: scoreSets.length
    });
    
    // 关闭Redis连接
    try {
      await redis.disconnect();
      addDebugStep('Redis连接已关闭', {});
    } catch (disconnectError) {
      addError('关闭Redis连接失败', disconnectError);
    }
    
    // 构造响应对象
    const responseData = {
      records: recordsArray,
      database: dbInfo,
      totalCount: recordsArray.length,
      limitReached: recordCount >= limit,
      message: recordCount >= limit ? `达到查询限制(${limit})，没有显示所有记录` : undefined,
      debug: debugInfo
    };
    
    // 安全地序列化JSON
    try {
      const safeJson = JSON.stringify(responseData);
      return res.status(200).send(safeJson);
    } catch (jsonError) {
      addError('JSON序列化失败', jsonError);
      
      // 尝试更安全的序列化方式
      const safeData = {
        records: recordsArray.map(r => ({
          id: r.id,
          name: r.name || '未知',
          score: r.score || '0',
          mode: r.mode || 'endless',
          sourceSet: r.sourceSet
        })),
        database: dbInfo,
        totalCount: recordsArray.length,
        debug: debugInfo,
        error: '完整数据序列化失败，返回简化版本'
      };
      
      return res.status(200).json(safeData);
    }
  } catch (error) {
    addError('API执行过程中出现未捕获的错误', error);
    
    return res.status(500).json({ 
      error: '服务器错误：' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      debug: debugInfo
    });
  }
} 