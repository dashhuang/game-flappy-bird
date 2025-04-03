import { createClient } from 'redis';

export default async function handler(req, res) {
  try {
    // 创建Redis客户端并连接
    const redis = await createClient({
      url: process.env.REDIS_URL
    }).connect();
    
    // 获取前20名高分（修改为20名）
    const topScoreIds = await redis.zRange('scores', 0, 19, {
      REV: true // 降序排列
    });
    
    const scores = [];
    
    // 获取每个分数的详细信息
    for (const id of topScoreIds) {
      const scoreData = await redis.hGetAll(`score:${id}`);
      if (scoreData) {
        // 确保所有必要字段都存在
        if (!scoreData.mode) {
          scoreData.mode = 'endless'; // 默认为无尽模式
        }
        // 对于挑战模式，确保日期存在
        if (scoreData.mode === 'challenge' && !scoreData.date) {
          // 使用一个默认日期，或从ID中提取时间戳作为日期
          const timestamp = parseInt(id);
          if (!isNaN(timestamp)) {
            const date = new Date(timestamp);
            scoreData.date = date.toISOString().split('T')[0]; // 格式: YYYY-MM-DD
          } else {
            scoreData.date = '2023-01-01'; // 默认日期
          }
        }
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