import { createClient } from 'redis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('方法不允许');
  }
  
  const { name, score } = req.body;
  
  if (!name || !score) {
    return res.status(400).send('缺少名字或分数');
  }
  
  try {
    // 创建Redis客户端并连接
    const redis = await createClient({
      url: process.env.REDIS_URL
    }).connect();
    
    // 检查是否已存在同名用户的所有记录
    const allScoreIds = await redis.zRange('scores', 0, -1);
    const sameNameIds = []; // 存储所有同名用户的ID
    let highestScore = parseInt(score); // 假设当前提交的分数最高
    let highestScoreId = null; // 最高分对应的ID
    
    // 搜索所有分数记录，查找同名用户
    for (const id of allScoreIds) {
      const scoreData = await redis.hGetAll(`score:${id}`);
      if (scoreData && scoreData.name === name) {
        sameNameIds.push(id);
        const currentScore = parseInt(scoreData.score);
        // 找出最高分及其ID
        if (currentScore > highestScore) {
          highestScore = currentScore;
          highestScoreId = id;
        }
      }
    }
    
    // 处理记录
    if (sameNameIds.length === 0) {
      // 没有同名记录，创建新记录
      const newId = Date.now().toString();
      const timestamp = Date.now();
      
      await redis.hSet(`score:${newId}`, {
        name,
        score: parseInt(score),
        timestamp
      });
      
      // 计算排序分数：实际分数 * 10000000000（10位） + (10000000000 - 时间戳)
      // 这样可以保证分数相同时，先提交的排在前面
      // 时间戳从10000000000减去是为了让更早的时间戳得到更高的值
      const sortScore = parseInt(score) * 10000000000 + (10000000000 - Math.floor(timestamp / 1000));
      
      await redis.zAdd('scores', [{
        score: sortScore,
        value: newId
      }]);
    } else {
      // 已有同名记录，判断新分数是否为最高分
      if (parseInt(score) >= highestScore) {
        // 新分数是最高分，创建新记录
        const newId = Date.now().toString();
        const timestamp = Date.now();
        
        await redis.hSet(`score:${newId}`, {
          name,
          score: parseInt(score),
          timestamp
        });
        
        // 计算排序分数
        const sortScore = parseInt(score) * 10000000000 + (10000000000 - Math.floor(timestamp / 1000));
        
        await redis.zAdd('scores', [{
          score: sortScore,
          value: newId
        }]);
        
        // 将新ID添加到需要保留的列表中
        highestScoreId = newId;
      }
      
      // 删除所有同名用户中，不是最高分的记录
      for (const id of sameNameIds) {
        if (id !== highestScoreId) {
          // 从有序集合中删除
          await redis.zRem('scores', id);
          // 删除详细信息
          await redis.del(`score:${id}`);
        }
      }
    }
    
    // 关闭连接
    await redis.disconnect();
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Redis错误:', error);
    return res.status(500).json({ error: error.message });
  }
} 