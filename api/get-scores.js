import { createClient } from 'redis';

export default async function handler(req, res) {
  try {
    // 创建Redis客户端并连接
    const redis = await createClient({
      url: process.env.REDIS_URL
    }).connect();
    
    // 获取前10名高分
    const topScoreIds = await redis.zRange('scores', 0, 9, {
      REV: true // 降序排列
    });
    
    const scores = [];
    
    // 获取每个分数的详细信息
    for (const id of topScoreIds) {
      const scoreData = await redis.hGetAll(`score:${id}`);
      if (scoreData) {
        scores.push(scoreData);
      }
    }
    
    // 关闭连接
    await redis.disconnect();
    
    return res.status(200).json(scores);
  } catch (error) {
    console.error('Redis错误:', error);
    return res.status(500).json({ error: error.message });
  }
} 