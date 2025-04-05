import { createClient } from 'redis';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '方法不允许' });
  }
  
  try {
    // 创建Redis客户端并连接
    const redis = await createClient({
      url: process.env.REDIS_URL
    }).connect();
    
    // 获取数据库中的所有记录ID，无需分页
    const allIds = await redis.zRange('scores', 0, -1, { REV: true });
    
    // 获取总记录数
    const totalCount = allIds.length;
    
    // 用于存储完整数据
    const allRecords = [];
    
    // 获取额外的数据库信息
    const dbInfo = {
      totalKeys: 0,
      collections: []
    };
    
    // 尝试获取Redis数据库的基本信息
    try {
      // 获取所有键名
      const keys = await redis.keys('*');
      dbInfo.totalKeys = keys.length;
      
      // 识别集合（通过前缀分类）
      const collections = new Set();
      keys.forEach(key => {
        if (key.includes(':')) {
          collections.add(key.split(':')[0]);
        }
      });
      dbInfo.collections = Array.from(collections);
    } catch (error) {
      console.warn('获取数据库信息时出错:', error);
    }
    
    // 获取每条记录的完整详情
    for (const id of allIds) {
      const scoreData = await redis.hGetAll(`score:${id}`);
      
      if (scoreData) {
        // 将所有字段原样保留，不进行转换
        allRecords.push({
          id: id,
          ...scoreData,
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
    }
    
    // 记录API调用
    console.log(`管理员API请求: /api/admin-get-all-records`);
    console.log(`返回 ${allRecords.length} 条完整记录`);
    
    // 关闭Redis连接
    await redis.disconnect();
    
    return res.status(200).json({
      records: allRecords,
      database: dbInfo,
      totalCount: totalCount
    });
  } catch (error) {
    console.error('获取管理员记录时出错:', error);
    return res.status(500).json({ error: '服务器错误：' + error.message });
  }
} 