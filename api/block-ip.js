import { createClient } from 'redis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '方法不允许' });
  }
  
  // 验证管理员密码
  const { password, ip, action, reason, score, date } = req.body;
  
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
    
    // 旧的IP集合键名 - 用于兼容性
    const blockedIpSetKey = 'blocked:ips';
    // 新的IP详情哈希表前缀
    const blockedIpHashPrefix = 'blocked:ip:';
    // 被屏蔽IP的索引集合
    const blockedIpIndexKey = 'blocked:ips:index';
    
    if (action === 'block') {
      // 获取屏蔽信息
      const blockReason = reason || '管理员手动屏蔽';
      const timestamp = Date.now();
      const blockInfo = {
        ip,
        timestamp,
        reason: blockReason,
        blockType: 'manual'
      };
      
      // 如果有附加信息（自动屏蔽时的得分等）
      if (score) blockInfo.score = score;
      if (date) blockInfo.date = date;
      
      // 添加IP到屏蔽索引
      await redis.sAdd(blockedIpIndexKey, ip);
      // 为兼容性，保留旧的集合
      await redis.sAdd(blockedIpSetKey, ip);
      // 存储IP详细屏蔽信息
      await redis.hSet(blockedIpHashPrefix + ip, blockInfo);
      
      console.log(`已屏蔽IP: ${ip}，原因: ${blockReason}`);
      
      // 关闭Redis连接
      await redis.disconnect();
      
      return res.status(200).json({
        success: true,
        message: `IP ${ip} 已被成功屏蔽`
      });
    } else if (action === 'unblock') {
      // 从屏蔽索引中移除IP
      await redis.sRem(blockedIpIndexKey, ip);
      // 为兼容性，从旧集合中移除
      await redis.sRem(blockedIpSetKey, ip);
      // 删除IP详情哈希表
      await redis.del(blockedIpHashPrefix + ip);
      
      console.log(`管理员已解除屏蔽IP: ${ip}`);
      
      // 关闭Redis连接
      await redis.disconnect();
      
      return res.status(200).json({
        success: true,
        message: `IP ${ip} 已被解除屏蔽`
      });
    } else if (action === 'check') {
      // 检查IP是否在屏蔽索引中
      const isBlocked = await redis.sIsMember(blockedIpIndexKey, ip);
      
      let blockInfo = null;
      if (isBlocked) {
        // 获取IP详细屏蔽信息
        blockInfo = await redis.hGetAll(blockedIpHashPrefix + ip);
      }
      
      // 关闭Redis连接
      await redis.disconnect();
      
      return res.status(200).json({
        success: true,
        isBlocked,
        blockInfo
      });
    } else if (action === 'list') {
      // 获取所有被屏蔽的IP
      const blockedIps = await redis.sMembers(blockedIpIndexKey);
      
      // 获取每个IP的详细屏蔽信息
      const blockedIpsDetails = [];
      for (const ip of blockedIps) {
        const details = await redis.hGetAll(blockedIpHashPrefix + ip);
        
        // 如果没有详细信息（可能是旧数据），则创建一个基本信息
        if (!details || Object.keys(details).length === 0) {
          blockedIpsDetails.push({
            ip,
            reason: '未知原因',
            timestamp: 0,
            blockType: 'manual'
          });
        } else {
          blockedIpsDetails.push(details);
        }
      }
      
      // 关闭Redis连接
      await redis.disconnect();
      
      return res.status(200).json({
        success: true,
        blockedIps: blockedIpsDetails
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