import { createClient } from 'redis';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '方法不允许' });
  }
  
  // 验证管理员密码（从请求头中获取）
  const password = req.headers['admin-password'];
  const correctPassword = process.env.ADMIN_PASSWORD;
  
  // 如果环境变量中没有设置密码，则返回错误
  if (!correctPassword) {
    console.error('未设置管理员密码环境变量(ADMIN_PASSWORD)');
    return res.status(500).json({
      success: false,
      error: '服务器配置错误：未设置管理员密码'
    });
  }
  
  // 验证密码
  if (!password || password !== correctPassword) {
    return res.status(401).json({
      success: false,
      error: '密码错误或未提供密码'
    });
  }
  
  try {
    // 获取分页参数
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    
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
    
    // 计算分页信息
    const totalRecords = leaderboardData.length;
    const totalPages = Math.ceil(totalRecords / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = leaderboardData.slice(startIndex, endIndex);
    
    // 记录API调用日志
    console.log(`管理员API请求: /api/get-leaderboard (页码=${page}, 每页=${pageSize})`);
    console.log(`返回 ${paginatedData.length}/${totalRecords} 条记录`);
    
    // 关闭Redis连接
    await redis.disconnect();
    
    // 返回带有分页信息的数据
    return res.status(200).json({
      data: paginatedData,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        pageSize
      }
    });
  } catch (error) {
    console.error('获取排行榜数据错误:', error);
    return res.status(500).json({ error: '服务器错误：' + error.message });
  }
} 