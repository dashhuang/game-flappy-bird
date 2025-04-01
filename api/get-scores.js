import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // 获取前10名高分
  const topScoreIds = await kv.zrange('scores', 0, 9, {
    rev: true // 降序排列
  });
  
  const scores = [];
  
  // 获取每个分数的详细信息
  for (const id of topScoreIds) {
    const scoreData = await kv.hgetall(`score:${id}`);
    if (scoreData) {
      scores.push(scoreData);
    }
  }
  
  return res.status(200).json(scores);
} 