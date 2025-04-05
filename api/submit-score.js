import { createClient } from 'redis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('方法不允许');
  }
  
  const { name, score, mode, date } = req.body;
  
  if (!name || !score || !mode) {
    return res.status(400).send('缺少必要参数');
  }
  
  let redis = null;
  
  try {
    // 获取用户IP地址
    const ip = getClientIP(req);
    
    // 创建Redis客户端并连接
    redis = await createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 5000, // 连接超时5秒
        reconnectStrategy: false // 禁用重连以避免挂起
      }
    }).connect();
    
    // 检查IP是否被屏蔽
    const blockedIpSetKey = 'blocked:ips';
    const blockedIpIndexKey = 'blocked:ips:index';
    
    // 优先使用新的索引，兼容旧数据
    let isBlocked = await redis.sIsMember(blockedIpIndexKey, ip);
    if (!isBlocked) {
      isBlocked = await redis.sIsMember(blockedIpSetKey, ip);
    }
    
    if (isBlocked) {
      console.log(`拒绝来自被屏蔽IP的分数提交: ${ip}, 用户: ${name}, 分数: ${score}，但返回成功响应`);
      if (redis) await redis.disconnect();
      // 返回成功消息，但实际不记录分数，用户无法察觉被屏蔽
      return res.status(200).json({ success: true });
    }
    
    // 确定要使用的有序集合键名
    // 1. 模式分数集合: 'scores:endless' 或 'scores:challenge'
    // 2. 每日挑战日期集合: 'scores:challenge:YYYY-MM-DD'
    const modeScoreKey = `scores:${mode}`;
    const dateScoreKey = mode === 'challenge' && date ? `scores:${mode}:${date}` : null;
    
    // 创建用户记录键 - 优化查询过程
    const userRecordKey = `user:${name}:${mode}${date ? ':' + date : ''}`;
    
    // 检查是否已存在该用户的记录
    let existingRecordId = await redis.get(userRecordKey);
    let existingRecord = null;
    let needToUpdateScore = false;
    
    // 如果找到记录ID，获取详细记录信息
    if (existingRecordId) {
      existingRecord = await redis.hGetAll(`score:${existingRecordId}`);
      if (existingRecord && parseInt(score) > parseInt(existingRecord.score)) {
        needToUpdateScore = true;
      }
    }
    
    const timestamp = Date.now();
    
    // 准备要保存的数据
    const scoreDataToSave = {
      name,
      score: parseInt(score),
      timestamp,
      mode,
      ip: ip || '未知IP' // 添加IP地址
    };
    
    // 如果是每日挑战模式，添加日期
    if (mode === 'challenge' && date) {
      scoreDataToSave.date = date;
    }
    
    // 计算排序分数：实际分数 * 10000000000（10位） + (10000000000 - 时间戳)
    // 这样保证分数高的排前面，分数相同时最新提交的排前面
    const sortScore = parseInt(score) * 10000000000 + (10000000000 - Math.floor(timestamp / 1000));
    
    // 处理记录
    if (existingRecord === null) {
      // 没有找到匹配记录，创建新记录
      console.log(`为用户 ${name} (IP: ${ip}) 创建新的分数记录: ${score}分, 模式: ${mode}${date ? ', 日期: ' + date : ''}`);
      
      const newId = Date.now().toString();
      
      // 使用多命令事务保证原子性
      const multi = redis.multi();
      
      // 保存分数记录
      multi.hSet(`score:${newId}`, scoreDataToSave);
      
      // 保存用户索引记录
      multi.set(userRecordKey, newId);
      
      // 添加到模式分数集合
      multi.zAdd(modeScoreKey, [{
        score: sortScore,
        value: newId
      }]);
      
      // 如果是每日挑战且有日期，添加到日期分数集合
      if (dateScoreKey) {
        multi.zAdd(dateScoreKey, [{
          score: sortScore,
          value: newId
        }]);
      }
      
      // 执行事务
      await multi.exec();
    } else if (needToUpdateScore) {
      // 找到匹配记录且新分数更高，更新记录
      console.log(`更新用户 ${name} (IP: ${ip}) 的分数记录: 从 ${existingRecord.score} 到 ${score}分, 模式: ${mode}${date ? ', 日期: ' + date : ''}`);
      
      // 使用多命令事务保证原子性
      const multi = redis.multi();
      
      // 更新分数记录
      multi.hSet(`score:${existingRecordId}`, scoreDataToSave);
      
      // 更新模式分数集合中的排序分数
      multi.zRem(modeScoreKey, existingRecordId);
      multi.zAdd(modeScoreKey, [{
        score: sortScore,
        value: existingRecordId
      }]);
      
      // 如果是每日挑战且有日期，更新日期分数集合中的排序分数
      if (dateScoreKey) {
        multi.zRem(dateScoreKey, existingRecordId);
        multi.zAdd(dateScoreKey, [{
          score: sortScore,
          value: existingRecordId
        }]);
      }
      
      // 执行事务
      await multi.exec();
    } else {
      // 找到匹配记录但新分数不高于现有分数，不做任何修改
      console.log(`用户 ${name} (IP: ${ip}) 提交的分数 ${score} 不高于现有记录 ${existingRecord.score}，保持不变`);
    }
    
    // 在记录分数逻辑完成后，先断开Redis连接并返回成功响应
    if (redis) await redis.disconnect();
    redis = null;
    
    // 如果是挑战模式，且分数大于50，异步执行IP屏蔽逻辑（不等待完成）
    if (mode === 'challenge' && parseInt(score) > 50) {
      // 使用非阻塞方式执行屏蔽操作，不影响响应返回
      setTimeout(() => {
        autoBlockIpAsync(ip, name, parseInt(score), date, timestamp).catch(error => {
          console.error(`IP屏蔽异步操作失败:`, error);
        });
      }, 10);
    }
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Redis错误:', error);
    // 确保Redis连接被关闭
    if (redis) {
      try {
        await redis.disconnect();
      } catch (disconnectError) {
        console.error('关闭Redis连接失败:', disconnectError);
      }
    }
    return res.status(500).json({ error: error.message });
  }
}

// 异步执行自动屏蔽IP的函数，与主请求处理分离
async function autoBlockIpAsync(ip, playerName, score, date, timestamp) {
  let redis = null;
  try {
    // 创建新的Redis连接
    redis = await createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 5000, // 连接超时5秒
        reconnectStrategy: false // 禁用重连以避免挂起
      }
    }).connect();
    
    const blockedIpSetKey = 'blocked:ips';
    const blockedIpIndexKey = 'blocked:ips:index';
    const blockedIpHashPrefix = 'blocked:ip:';
    const blockReason = `自动屏蔽：挑战模式得分超过50分（${score}分）`;
    
    console.log(`自动屏蔽IP: ${ip}, 原因: ${blockReason}`);
    
    // 使用多命令事务保证原子性
    const multi = redis.multi();
    
    // 添加到屏蔽索引
    multi.sAdd(blockedIpIndexKey, ip);
    // 为了兼容性，也添加到旧的集合中
    multi.sAdd(blockedIpSetKey, ip);
    
    // 存储屏蔽详细信息
    const blockInfo = {
      ip,
      timestamp,
      reason: blockReason,
      blockType: 'auto',
      score,
      playerName
    };
    
    if (date) {
      blockInfo.date = date;
    }
    
    multi.hSet(blockedIpHashPrefix + ip, blockInfo);
    
    // 执行事务
    await multi.exec();
    
    // 完成后关闭连接
    if (redis) await redis.disconnect();
    console.log(`完成IP ${ip} 的自动屏蔽`);
  } catch (error) {
    console.error(`自动屏蔽IP ${ip} 时出错:`, error);
    // 确保Redis连接被关闭
    if (redis) {
      try {
        await redis.disconnect();
      } catch (disconnectError) {
        console.error('关闭Redis连接失败:', disconnectError);
      }
    }
  }
}

// 获取客户端IP地址的辅助函数
function getClientIP(req) {
  // 从请求头获取IP地址
  // Vercel环境
  const vercelForwardedFor = req.headers['x-forwarded-for'];
  if (vercelForwardedFor) {
    return vercelForwardedFor.split(',')[0].trim();
  }
  
  // 标准 forwarded-for 头
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  // 直接连接
  if (req.connection && req.connection.remoteAddress) {
    return req.connection.remoteAddress;
  }
  
  // 套接字
  if (req.socket && req.socket.remoteAddress) {
    return req.socket.remoteAddress;
  }
  
  // 若无法获取，返回未知
  return '未知IP';
} 