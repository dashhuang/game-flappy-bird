import { createClient } from 'redis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('方法不允许');
  }
  
  // 验证管理员密码
  const { password } = req.body;
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
    
    // 获取所有分数ID
    const allScoreIds = await redis.zRange('scores', 0, -1);
    
    // 记录删除的数量
    let deletedCount = 0;
    
    // 删除所有记录
    for (const id of allScoreIds) {
      // 从有序集合中删除
      await redis.zRem('scores', id);
      // 删除详细信息
      await redis.del(`score:${id}`);
      deletedCount++;
    }
    
    // 关闭连接
    await redis.disconnect();
    
    return res.status(200).json({
      success: true,
      message: `成功清空排行榜，共删除${deletedCount}条记录`,
      deletedCount
    });
  } catch (error) {
    console.error('Redis错误:', error);
    return res.status(500).json({ error: error.message });
  }
} 