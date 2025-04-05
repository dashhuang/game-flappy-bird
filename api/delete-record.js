import { createClient } from 'redis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '方法不允许' });
  }
  
  // 验证管理员密码
  const { password, id } = req.body;
  
  // 验证必要的参数
  if (!id) {
    return res.status(400).json({ 
      success: false,
      error: '缺少记录ID' 
    });
  }
  
  // 从环境变量获取密码
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
    // 创建Redis客户端并连接
    const redis = await createClient({
      url: process.env.REDIS_URL
    }).connect();
    
    // 首先确认记录是否存在
    const score = await redis.hGetAll(`score:${id}`);
    
    if (!Object.keys(score).length) {
      await redis.disconnect();
      return res.status(404).json({
        success: false,
        error: '找不到指定的记录'
      });
    }
    
    // 确定要从哪些集合中删除记录
    const setKeys = ['scores']; // 默认总排行榜
    
    // 如果有模式，也从模式排行榜中删除
    if (score.mode) {
      setKeys.push(`scores:${score.mode}`);
      
      // 如果是挑战模式且有日期，还需要从日期排行榜中删除
      if (score.mode === 'challenge' && score.date) {
        setKeys.push(`scores:${score.mode}:${score.date}`);
      }
    }
    
    // 从所有相关集合中删除记录
    for (const key of setKeys) {
      await redis.zRem(key, id);
    }
    
    // 删除记录详情
    await redis.del(`score:${id}`);
    
    // 记录操作日志
    console.log(`管理员删除记录: ID=${id}, 玩家=${score.name}, 分数=${score.score}`);
    
    // 关闭Redis连接
    await redis.disconnect();
    
    return res.status(200).json({
      success: true,
      message: `成功删除记录: 玩家=${score.name}, 分数=${score.score}`
    });
  } catch (error) {
    console.error('删除记录错误:', error);
    return res.status(500).json({ 
      success: false,
      error: '服务器错误：' + error.message 
    });
  }
} 