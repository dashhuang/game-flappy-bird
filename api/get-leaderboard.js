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
    // 获取查询参数
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const mode = req.query.mode; // 'endless'或'challenge'或undefined(全部)
    const date = req.query.date; // 仅当mode为'challenge'时使用
    const sortBy = req.query.sortBy || 'score'; // 'score'或'time'
    
    // 创建Redis客户端并连接
    const redis = await createClient({
      url: process.env.REDIS_URL
    }).connect();
    
    const leaderboardData = [];
    
    // 首先确定查询范围
    if (mode) {
      // 特定模式
      let scoreKey = `scores:${mode}`;
      
      // 如果是挑战模式且指定了日期
      if (mode === 'challenge' && date) {
        scoreKey = `scores:${mode}:${date}`;
      }
      
      // 检查集合是否存在
      const keyExists = await redis.exists(scoreKey);
      if (keyExists) {
        await loadDataFromKey(scoreKey);
      }
    } else {
      // 全部模式 - 先获取无尽模式
      const endlessKey = 'scores:endless';
      if (await redis.exists(endlessKey)) {
        await loadDataFromKey(endlessKey);
      }
      
      // 获取挑战模式通用数据
      const challengeKey = 'scores:challenge';
      if (await redis.exists(challengeKey)) {
        await loadDataFromKey(challengeKey);
      }
      
      // 获取挑战模式日期数据
      const challengeDateKeys = await redis.keys('scores:challenge:*');
      for (const dateKey of challengeDateKeys) {
        await loadDataFromKey(dateKey);
      }
    }
    
    // 从指定键加载数据的内部函数
    async function loadDataFromKey(key) {
      const scoreIds = await redis.zRange(key, 0, -1, { REV: true });
      
      for (const id of scoreIds) {
        // 避免重复记录
        if (leaderboardData.some(item => item.id === id)) {
          continue;
        }
        
        const scoreData = await redis.hGetAll(`score:${id}`);
        if (Object.keys(scoreData).length > 0) {
          // 处理分数 - 保持与原始数据类型一致但确保是数值
          let scoreValue = scoreData.score;
          if (scoreValue) {
            // 尝试转换为数值用于排序，但保留原始格式
            const numericScore = Number(scoreValue);
            if (!isNaN(numericScore)) {
              scoreValue = numericScore;
            }
          } else {
            scoreValue = 0;
          }
          
          // 处理日期格式
          let dateValue = scoreData.date;
          if (!dateValue && scoreData.timestamp) {
            const timestamp = parseInt(scoreData.timestamp);
            if (!isNaN(timestamp)) {
              const date = new Date(timestamp);
              dateValue = date.toISOString().split('T')[0];
            }
          }
          
          // 将数据添加到结果集
          leaderboardData.push({
            id: id,
            playerName: scoreData.name || '未知玩家',
            score: scoreValue,
            originalScore: scoreData.score, // 保存原始分数字符串
            timestamp: scoreData.timestamp ? parseInt(scoreData.timestamp) : 0,
            date: dateValue || new Date().toISOString().split('T')[0],
            mode: scoreData.mode || 'endless',
            ip: scoreData.ip || '未知' // 添加IP地址
          });
        }
      }
    }
    
    // 根据排序选项排序
    if (sortBy === 'score') {
      // 按分数降序排列，与游戏前端保持一致
      leaderboardData.sort((a, b) => {
        // 如果是数值类型，直接比较
        if (typeof a.score === 'number' && typeof b.score === 'number') {
          return b.score - a.score;
        }
        // 如果是字符串，转换为数值比较
        return Number(b.score) - Number(a.score);
      });
    } else {
      // 按时间戳降序排列（从新到旧）
      leaderboardData.sort((a, b) => b.timestamp - a.timestamp);
    }
    
    // 计算分页信息
    const totalRecords = leaderboardData.length;
    const totalPages = Math.ceil(totalRecords / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = leaderboardData.slice(startIndex, endIndex);
    
    // 记录API调用日志
    console.log(`管理员API请求: /api/get-leaderboard (模式=${mode || '全部'}, 排序=${sortBy}, 页码=${page}, 每页=${pageSize})`);
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