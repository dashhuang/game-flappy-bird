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
    
    // 获取所有游戏模式的键
    const keys = await redis.keys('scores:*');
    
    // 添加总分数键
    keys.push('scores');
    
    // 去重
    const uniqueKeys = [...new Set(keys)];
    
    const leaderboardData = [];
    
    // 处理每个集合键
    for (const key of uniqueKeys) {
      // 从Redis获取分数ID，按排序分数降序排列
      const scoreIds = await redis.zRange(key, 0, -1, {
        REV: true // 降序排列
      });
      
      // 获取每个分数的详细信息
      for (const id of scoreIds) {
        // 避免重复记录
        if (leaderboardData.some(item => item.id === id)) {
          continue;
        }
        
        const scoreData = await redis.hGetAll(`score:${id}`);
        if (scoreData && Object.keys(scoreData).length > 0) {
          // 将ID添加到数据中，以便前端可以删除特定记录
          leaderboardData.push({
            id: id,
            playerName: scoreData.name || '未知玩家',
            score: scoreData.score || '0',
            timestamp: scoreData.timestamp ? parseInt(scoreData.timestamp) : 0,
            date: scoreData.date || (scoreData.timestamp ? new Date(parseInt(scoreData.timestamp)).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
            mode: scoreData.mode || 'endless'
          });
        }
      }
    }
    
    // 按时间戳降序排列（从新到旧）
    leaderboardData.sort((a, b) => b.timestamp - a.timestamp);
    
    // 记录API调用日志
    console.log(`管理员API请求: /api/get-leaderboard`);
    console.log(`返回 ${leaderboardData.length} 条记录`);
    
    // 关闭Redis连接
    await redis.disconnect();
    
    return res.status(200).json(leaderboardData);
  } catch (error) {
    console.error('获取排行榜数据错误:', error);
    return res.status(500).json({ error: '服务器错误：' + error.message });
  }
} 