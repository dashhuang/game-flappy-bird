import { createClient } from 'redis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '方法不允许' });
  }
  
  // 验证管理员密码
  const { password, ip, action } = req.body;
  
  // 检查必要参数
  if (!action) {
    return res.status(400).json({ 
      success: false,
      error: '缺少操作类型' 
    });
  }
  
  // 对于非list操作，还需要检查IP地址
  if (action !== 'list' && !ip) {
    return res.status(400).json({ 
      success: false,
      error: '缺少IP地址' 
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
    
    // 被屏蔽IP使用一个集合存储
    const blockedIpSetKey = 'blocked:ips';
    
    if (action === 'block') {
      // 添加IP到屏蔽列表
      await redis.sAdd(blockedIpSetKey, ip);
      console.log(`管理员已屏蔽IP: ${ip}`);
      
      // 关闭Redis连接
      await redis.disconnect();
      
      return res.status(200).json({
        success: true,
        message: `IP ${ip} 已被成功屏蔽`
      });
    } else if (action === 'unblock') {
      // 从屏蔽列表中移除IP
      await redis.sRem(blockedIpSetKey, ip);
      console.log(`管理员已解除屏蔽IP: ${ip}`);
      
      // 关闭Redis连接
      await redis.disconnect();
      
      return res.status(200).json({
        success: true,
        message: `IP ${ip} 已被解除屏蔽`
      });
    } else if (action === 'check') {
      // 检查IP是否在屏蔽列表中
      const isBlocked = await redis.sIsMember(blockedIpSetKey, ip);
      
      // 关闭Redis连接
      await redis.disconnect();
      
      return res.status(200).json({
        success: true,
        isBlocked: isBlocked
      });
    } else if (action === 'list') {
      // 获取所有被屏蔽的IP
      const blockedIps = await redis.sMembers(blockedIpSetKey);
      
      // 关闭Redis连接
      await redis.disconnect();
      
      return res.status(200).json({
        success: true,
        blockedIps: blockedIps
      });
    } else {
      // 关闭Redis连接
      await redis.disconnect();
      
      return res.status(400).json({
        success: false,
        error: '不支持的操作类型'
      });
    }
  } catch (error) {
    console.error('屏蔽IP操作错误:', error);
    return res.status(500).json({ 
      success: false,
      error: '服务器错误：' + error.message 
    });
  }
} 