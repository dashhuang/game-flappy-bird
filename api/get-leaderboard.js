import { createClient } from 'redis';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '方法不允许' });
  }
  
  try {
    // 获取分页参数 - 增加默认每页数量到50条
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
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
    
    // 用于存储排行榜数据
    const leaderboardData = [];
    
    // 根据排序方式获取不同的数据集
    if (sortBy === 'time') {
      // 先获取所有ID，这里暂时无法直接从Redis获取按时间戳排序的数据
      const allIds = await redis.zRange('scores', 0, -1, { REV: true });
      
      // 获取每个ID对应的详细信息
      for (const id of allIds) {
        const scoreData = await redis.hGetAll(`score:${id}`);
        if (scoreData) {
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
      
      // 按时间戳从新到旧排序
      leaderboardData.sort((a, b) => b.timestamp - a.timestamp);
    } else {
      // 按分数排序时，直接使用Redis的有序集合，直接获取当前页的数据
      const pageScoreIds = await redis.zRange('scores', skip, skip + pageSize - 1, { REV: true });
      
      // 获取每个ID对应的详细信息
      for (const id of pageScoreIds) {
        const scoreData = await redis.hGetAll(`score:${id}`);
        if (scoreData) {
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
    }
    
    // 如果是按时间排序，需要在内存中分页
    let paginatedData = leaderboardData;
    if (sortBy === 'time') {
      paginatedData = leaderboardData.slice(skip, skip + pageSize);
    }
    
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