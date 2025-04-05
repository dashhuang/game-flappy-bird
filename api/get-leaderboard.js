import { createClient } from 'redis';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '方法不允许' });
  }
  
  try {
    // 获取分页参数
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const sortBy = req.query.sortBy || 'time'; // 'time' 或 'score'
    
    // 创建Redis客户端并连接
    const redis = await createClient({
      url: process.env.REDIS_URL
    }).connect();
    
    // 获取总记录数
    const totalCount = await redis.zCard('scores');
    
    // 计算分页信息
    const totalPages = Math.ceil(totalCount / pageSize);
    const skip = (page - 1) * pageSize;
    const limit = skip + pageSize - 1;
    
    // 从Redis获取分页后的记录ID
    const scoreIds = await redis.zRange('scores', 0, -1, {
      REV: true // 降序排列
    });
    
    const leaderboardData = [];
    
    // 获取每个分数的详细信息
    for (const id of scoreIds) {
      const scoreData = await redis.hGetAll(`score:${id}`);
      if (scoreData) {
        // 将ID添加到数据中，以便前端可以删除特定记录
        leaderboardData.push({
          id: id,
          playerName: scoreData.name || '未知玩家',
          score: parseInt(scoreData.score) || 0,
          timestamp: scoreData.timestamp ? parseInt(scoreData.timestamp) : 0,
          date: scoreData.timestamp ? new Date(parseInt(scoreData.timestamp)).toISOString() : new Date().toISOString(),
          mode: scoreData.mode || 'endless'
        });
      }
    }
    
    // 根据排序参数对数据进行排序
    if (sortBy === 'time') {
      // 按时间戳降序排列（从新到旧）
      leaderboardData.sort((a, b) => b.timestamp - a.timestamp);
    } else if (sortBy === 'score') {
      // 按分数降序排列（从高到低）
      leaderboardData.sort((a, b) => b.score - a.score);
    }
    
    // 分页处理
    const paginatedData = leaderboardData.slice(skip, skip + pageSize);
    
    // 记录API调用日志
    console.log(`管理员API请求: /api/get-leaderboard?page=${page}&pageSize=${pageSize}&sortBy=${sortBy}`);
    console.log(`返回 ${paginatedData.length} 条记录，总记录数: ${totalCount}`);
    
    // 关闭Redis连接
    await redis.disconnect();
    
    return res.status(200).json({
      data: paginatedData,
      pagination: {
        total: totalCount,
        currentPage: page,
        pageSize: pageSize,
        totalPages: totalPages
      }
    });
  } catch (error) {
    console.error('获取排行榜数据错误:', error);
    return res.status(500).json({ error: '服务器错误：' + error.message });
  }
} 