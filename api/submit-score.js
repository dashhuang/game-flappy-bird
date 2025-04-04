import { createClient } from 'redis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('方法不允许');
  }
  
  const { name, score, mode, date } = req.body;
  
  if (!name || !score || !mode) {
    return res.status(400).send('缺少必要参数');
  }
  
  try {
    // 创建Redis客户端并连接
    const redis = await createClient({
      url: process.env.REDIS_URL
    }).connect();
    
    // 确定要使用的有序集合键名
    // 1. 模式分数集合: 'scores:endless' 或 'scores:challenge'
    // 2. 每日挑战日期集合: 'scores:challenge:YYYY-MM-DD'
    const modeScoreKey = `scores:${mode}`;
    const dateScoreKey = mode === 'challenge' && date ? `scores:${mode}:${date}` : null;
    
    // 检查是否已存在同名用户、相同模式的记录
    // 从特定模式集合中查找
    const allModeScoreIds = await redis.zRange(modeScoreKey, 0, -1);
    let existingRecord = null;
    let existingRecordId = null;
    let needToUpdateScore = false;
    
    // 搜索特定模式的分数记录，查找同名用户
    for (const id of allModeScoreIds) {
      const scoreData = await redis.hGetAll(`score:${id}`);
      if (scoreData && scoreData.name === name) {
        // 如果是每日挑战模式，还需匹配日期
        if (mode === 'challenge' && date && scoreData.date !== date) {
          continue; // 跳过不同日期的挑战
        }
        
        // 找到匹配的记录
        existingRecord = scoreData;
        existingRecordId = id;
        
        // 检查分数是否需要更新（只有新分数更高时才更新）
        if (parseInt(score) > parseInt(scoreData.score)) {
          needToUpdateScore = true;
        }
        
        // 找到第一个匹配记录后即跳出，避免处理多条记录
        break;
      }
    }
    
    const timestamp = Date.now();
    
    // 准备要保存的数据
    const scoreDataToSave = {
      name,
      score: parseInt(score),
      timestamp,
      mode
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
      console.log(`为用户 ${name} 创建新的分数记录: ${score}分, 模式: ${mode}${date ? ', 日期: ' + date : ''}`);
      
      const newId = Date.now().toString();
      await redis.hSet(`score:${newId}`, scoreDataToSave);
      
      // 添加到模式分数集合
      await redis.zAdd(modeScoreKey, [{
        score: sortScore,
        value: newId
      }]);
      
      // 如果是每日挑战且有日期，添加到日期分数集合
      if (dateScoreKey) {
        await redis.zAdd(dateScoreKey, [{
          score: sortScore,
          value: newId
        }]);
      }
    } else if (needToUpdateScore) {
      // 找到匹配记录且新分数更高，更新记录
      console.log(`更新用户 ${name} 的分数记录: 从 ${existingRecord.score} 到 ${score}分, 模式: ${mode}${date ? ', 日期: ' + date : ''}`);
      
      await redis.hSet(`score:${existingRecordId}`, scoreDataToSave);
      
      // 更新模式分数集合中的排序分数
      await redis.zRem(modeScoreKey, existingRecordId);
      await redis.zAdd(modeScoreKey, [{
        score: sortScore,
        value: existingRecordId
      }]);
      
      // 如果是每日挑战且有日期，更新日期分数集合中的排序分数
      if (dateScoreKey) {
        await redis.zRem(dateScoreKey, existingRecordId);
        await redis.zAdd(dateScoreKey, [{
          score: sortScore,
          value: existingRecordId
        }]);
      }
    } else {
      // 找到匹配记录但新分数不高于现有分数，不做任何修改
      console.log(`用户 ${name} 提交的分数 ${score} 不高于现有记录 ${existingRecord.score}，保持不变`);
    }
    
    // 关闭连接
    await redis.disconnect();
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Redis错误:', error);
    return res.status(500).json({ error: error.message });
  }
} 