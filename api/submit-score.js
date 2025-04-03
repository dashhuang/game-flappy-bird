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
    
    // 检查是否已存在同名用户、相同模式的记录
    const allScoreIds = await redis.zRange('scores', 0, -1);
    let existingRecord = null;
    let existingRecordId = null;
    let needToUpdateScore = false;
    
    // 搜索所有分数记录，查找同名用户且相同模式
    for (const id of allScoreIds) {
      const scoreData = await redis.hGetAll(`score:${id}`);
      if (scoreData && scoreData.name === name && scoreData.mode === mode) {
        // 如果是每日挑战模式，还需匹配日期
        if (mode === 'challenge' && (!date || scoreData.date !== date)) {
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
    const sortScore = parseInt(score) * 10000000000 + (10000000000 - Math.floor(timestamp / 1000));
    
    // 处理记录
    if (existingRecord === null) {
      // 没有找到匹配记录，创建新记录
      console.log(`为用户 ${name} 创建新的分数记录: ${score}分`);
      
      const newId = Date.now().toString();
      await redis.hSet(`score:${newId}`, scoreDataToSave);
      
      await redis.zAdd('scores', [{
        score: sortScore,
        value: newId
      }]);
    } else if (needToUpdateScore) {
      // 找到匹配记录且新分数更高，更新记录
      console.log(`更新用户 ${name} 的分数记录: 从 ${existingRecord.score} 到 ${score}分`);
      
      await redis.hSet(`score:${existingRecordId}`, scoreDataToSave);
      
      // 更新排序分数
      await redis.zRem('scores', existingRecordId);
      await redis.zAdd('scores', [{
        score: sortScore,
        value: existingRecordId
      }]);
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