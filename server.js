const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

// 提供静态文件
app.use(express.static('./'));
app.use(express.json());

// 保存模拟排行榜数据
let mockScoresData = {
  endless: [],
  challenge: {}
};

// 获取今天的日期字符串 (YYYY-MM-DD)
function getCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 初始化一些模拟数据
const currentDate = getCurrentDate();
mockScoresData.endless = [
  { name: "小明", score: 98, timestamp: Date.now() - 10000, mode: "endless" },
  { name: "小红", score: 85, timestamp: Date.now() - 20000, mode: "endless" },
  { name: "小张", score: 75, timestamp: Date.now() - 30000, mode: "endless" },
  { name: "小李", score: 70, timestamp: Date.now() - 40000, mode: "endless" },
  { name: "小王", score: 65, timestamp: Date.now() - 50000, mode: "endless" }
];

// 初始化当天的挑战模式数据
mockScoresData.challenge[currentDate] = [
  { name: "挑战者A", score: 48, timestamp: Date.now() - 15000, mode: "challenge", date: currentDate },
  { name: "挑战者B", score: 45, timestamp: Date.now() - 25000, mode: "challenge", date: currentDate },
  { name: "挑战者C", score: 40, timestamp: Date.now() - 35000, mode: "challenge", date: currentDate },
  { name: "挑战者D", score: 35, timestamp: Date.now() - 45000, mode: "challenge", date: currentDate },
  { name: "挑战者E", score: 30, timestamp: Date.now() - 55000, mode: "challenge", date: currentDate }
];

// 模拟游戏配置API
app.get('/api/game-config', (req, res) => {
  // 游戏版本号
  const gameVersion = "1.0.2";
  
  // 游戏配置参数
  const gameConfig = {
    // 游戏版本信息
    version: gameVersion,
    lastUpdated: new Date().toISOString(),
    
    // 重力与跳跃参数
    GRAVITY: 0.4,
    FLAP_POWER: -9,
    
    // 初始难度参数 (0-15分)
    PIPE_SPEED_INITIAL: 2.5,
    PIPE_SPAWN_INTERVAL_INITIAL: 2000,
    PIPE_GAP_INITIAL: 220,
    HEIGHT_VARIATION_INITIAL: 200,
    
    // 中等难度参数 (15-60分)
    PIPE_SPEED_MEDIUM: 3.0,
    PIPE_SPAWN_INTERVAL_MEDIUM: 1600,
    PIPE_GAP_MEDIUM: 180,
    HEIGHT_VARIATION_MEDIUM: 400,
    
    // 最终难度参数 (60分以上)
    PIPE_SPEED_FINAL: 3.0,
    PIPE_SPAWN_INTERVAL_FINAL: 1400,
    PIPE_GAP_FINAL: 120,
    HEIGHT_VARIATION_FINAL: 600,
    
    // 难度控制分数阈值
    SCORE_MEDIUM_DIFFICULTY: 15,
    SCORE_HARD_DIFFICULTY: 60,
    SCORE_DIFFICULTY_STEP: 5,
    
    // 其他游戏尺寸参数
    PIPE_WIDTH: 80,
    BIRD_WIDTH: 40,
    BIRD_HEIGHT: 30,
    GROUND_HEIGHT: 50
  };
  
  // 返回游戏配置
  res.status(200).json(gameConfig);
});

// 模拟获取分数API
app.get('/api/get-scores', (req, res) => {
  // 获取所有分数
  let allScores = [...mockScoresData.endless];
  
  // 添加所有日期的挑战模式分数
  Object.values(mockScoresData.challenge).forEach(dateScores => {
    allScores = allScores.concat(dateScores);
  });
  
  // 返回所有分数
  res.status(200).json(allScores);
});

// 模拟提交分数API
app.post('/api/submit-score', (req, res) => {
  const { name, score, mode, date } = req.body;
  
  if (!name || !score || !mode) {
    return res.status(400).send('缺少必要参数');
  }
  
  // 创建新的分数记录
  const newScore = {
    name,
    score: parseInt(score),
    timestamp: Date.now(),
    mode
  };
  
  // 根据模式保存分数
  if (mode === 'endless') {
    mockScoresData.endless.push(newScore);
    
    // 按分数排序
    mockScoresData.endless.sort((a, b) => b.score - a.score);
    
    // 保留前100个分数
    if (mockScoresData.endless.length > 100) {
      mockScoresData.endless = mockScoresData.endless.slice(0, 100);
    }
  } 
  else if (mode === 'challenge') {
    // 确保日期有效
    if (!date) {
      date = getCurrentDate();
    }
    
    // 添加日期到分数记录
    newScore.date = date;
    
    // 如果当天没有记录，初始化数组
    if (!mockScoresData.challenge[date]) {
      mockScoresData.challenge[date] = [];
    }
    
    // 添加分数
    mockScoresData.challenge[date].push(newScore);
    
    // 按分数排序
    mockScoresData.challenge[date].sort((a, b) => b.score - a.score);
    
    // 保留前100个分数
    if (mockScoresData.challenge[date].length > 100) {
      mockScoresData.challenge[date] = mockScoresData.challenge[date].slice(0, 100);
    }
  }
  
  console.log(`收到分数提交: ${name} - ${score}分, 模式: ${mode}${date ? ', 日期: ' + date : ''}`);
  
  // 获取所有分数作为响应
  let allScores = [...mockScoresData.endless];
  
  // 添加所有日期的挑战模式分数
  Object.values(mockScoresData.challenge).forEach(dateScores => {
    allScores = allScores.concat(dateScores);
  });
  
  // 返回成功响应和更新后的所有分数
  res.status(200).json({
    success: true,
    scores: allScores
  });
});

// 启动服务器
app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
  console.log(`打开浏览器访问上面的地址来玩Flappy Bird游戏！`);
}); 