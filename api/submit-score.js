import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('方法不允许');
  }
  
  const { name, score } = req.body;
  
  if (!name || !score) {
    return res.status(400).send('缺少名字或分数');
  }
  
  // 生成唯一ID
  const id = Date.now().toString();
  
  // 存储分数
  await kv.hset(`score:${id}`, {
    name,
    score: parseInt(score),
    timestamp: Date.now()
  });
  
  // 将分数添加到排序集合中
  await kv.zadd('scores', { score: parseInt(score), member: id });
  
  return res.status(200).json({ success: true });
} 