import { createClient } from 'redis';

export default async function handler(req, res) {
  // 设置响应头
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  const debug = {
    steps: []
  };
  
  const log = (step, data) => {
    debug.steps.push({ step, time: new Date().toISOString(), data });
    console.log(`[${step}]`, data);
  };
  
  try {
    log('开始处理', { url: req.url });
    
    // 创建Redis客户端
    let redis = null;
    try {
      log('连接Redis', {});
      redis = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          connectTimeout: 3000,
          reconnectStrategy: false
        }
      });
      
      // 设置全局超时，确保API能在时间限制内返回
      const timeout = setTimeout(() => {
        log('执行超时', {});
        if (redis && redis.isOpen) {
          redis.disconnect();
        }
        return res.status(200).json({ 
          error: '执行超时，请稍后重试',
          debug
        });
      }, 8000);
      
      // 连接Redis
      await redis.connect();
      log('Redis连接成功', {});
      
      // 执行一个简单命令测试连接
      const ping = await redis.ping();
      log('Ping测试', { result: ping });
      
      // 获取键列表
      let keys = [];
      try {
        // 使用一次SCAN操作获取有限数量的键
        const scanResult = await redis.scan(0, { COUNT: 100 });
        keys = scanResult.keys || [];
        log('获取键列表', { count: keys.length });
      } catch (keysError) {
        log('获取键列表失败', { error: keysError.message });
      }
      
      // 查找score相关键
      const scoreKeys = keys.filter(k => k.startsWith('score:'));
      log('找到score键', { count: scoreKeys.length });
      
      // 查找zset类型键
      const zsetKeys = [];
      for (const key of keys) {
        try {
          const type = await redis.type(key);
          if (type === 'zset') {
            zsetKeys.push(key);
          }
        } catch (e) {
          // 忽略错误，继续处理下一个
        }
      }
      log('找到zset键', { count: zsetKeys.length, keys: zsetKeys });
      
      // 仅获取少量记录
      const records = [];
      const limit = 20; // 非常保守的限制
      
      // 从score:前缀的键获取记录
      for (let i = 0; i < Math.min(scoreKeys.length, limit); i++) {
        try {
          const key = scoreKeys[i];
          const data = await redis.hGetAll(key);
          if (Object.keys(data).length > 0) {
            records.push({
              id: key.substring(6), // 移除"score:"前缀
              ...data,
              sourceKey: key
            });
          }
        } catch (e) {
          // 忽略错误，继续处理下一个
        }
      }
      
      // 获取zset集合信息
      const zsetInfo = [];
      for (const key of zsetKeys) {
        try {
          const count = await redis.zCard(key);
          zsetInfo.push({ key, count });
        } catch (e) {
          // 忽略错误，继续处理下一个
        }
      }
      
      // 关闭Redis连接
      await redis.disconnect();
      log('Redis连接已关闭', {});
      
      // 清除超时
      clearTimeout(timeout);
      
      // 返回数据
      return res.status(200).json({
        records,
        zsetInfo,
        keysFound: keys.length,
        scoreKeysFound: scoreKeys.length,
        zsetKeysFound: zsetKeys.length,
        debug
      });
    } catch (redisError) {
      log('Redis操作失败', { error: redisError.message });
      
      // 确保关闭Redis连接
      if (redis && redis.isOpen) {
        try {
          await redis.disconnect();
        } catch (e) {
          // 忽略断开连接时的错误
        }
      }
      
      return res.status(200).json({
        error: '数据库操作失败: ' + redisError.message,
        debug
      });
    }
  } catch (error) {
    console.error('API处理错误:', error);
    return res.status(200).json({
      error: '服务器错误: ' + error.message,
      debug
    });
  }
} 