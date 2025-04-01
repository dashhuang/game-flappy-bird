import { createClient } from 'redis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('方法不允许');
  }
  
  const { name, score } = req.body;
  
  if (!name || !score) {
    return res.status(400).send('缺少名字或分数');
  }
  
  try {
    // 创建Redis客户端并连接
    const redis = await createClient({
      url: process.env.REDIS_URL
    }).connect();
    
    // 生成唯一ID
    const id = Date.now().toString();
    
    // 存储分数
    await redis.hSet(`score:${id}`, {
      name,
      score: parseInt(score),
      timestamp: Date.now()
    });
    
    // 将分数添加到排序集合中
    await redis.zAdd('scores', [{
      score: parseInt(score),
      value: id
    }]);
    
    // 关闭连接
    await redis.disconnect();
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Redis错误:', error);
    return res.status(500).json({ error: error.message });
  }
} 