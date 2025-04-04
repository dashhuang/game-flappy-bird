import { createClient } from 'redis';

export default async function handler(req, res) {
  try {
    // 获取请求参数
    const mode = req.query.mode; // 'endless' 或 'challenge'
    const date = req.query.date; // 格式: YYYY-MM-DD
    
    // 基于请求参数确定查询的集合键
    let scoreKey = 'scores'; // 默认查询所有分数
    
    if (mode) {
      scoreKey = `scores:${mode}`; // 查询特定模式的分数
      
      // 如果是挑战模式且指定了日期，查询特定日期的分数
      if (mode === 'challenge' && date) {
        scoreKey = `scores:${mode}:${date}`;
      }
    }
    
    // 创建Redis客户端并连接
    const redis = await createClient({
      url: process.env.REDIS_URL
    }).connect();
    
    // 检查集合是否存在（避免查询不存在的集合）
    const keyExists = await redis.exists(scoreKey);
    
    // 如果集合不存在，返回空数组
    if (!keyExists) {
      console.log(`集合 ${scoreKey} 不存在，返回空结果`);
      await redis.disconnect();
      return res.status(200).json([]);
    }
    
    // 直接从对应集合获取前20名高分
    const topScoreIds = await redis.zRange(scoreKey, 0, 19, {
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
    
    // 记录日志以便调试
    console.log(`API请求: /api/get-scores ${scoreKey !== 'scores' ? `(${scoreKey})` : ''}`);
    console.log(`返回 ${scores.length} 条记录`);
    
    // 关闭连接
    await redis.disconnect();
    
    return res.status(200).json(scores);
  } catch (error) {
    console.error('Redis错误:', error);
    return res.status(500).json({ error: error.message });
  }
} 