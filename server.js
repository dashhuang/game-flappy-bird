const express = require('express');
const path = require('path');
const app = express();
const port = 3001;

// 提供静态文件
app.use(express.static('./'));
app.use(express.json());

// 模拟游戏配置API
app.get('/api/game-config', (req, res) => {
  // 游戏版本号
  const gameVersion = "1.0.0";
  
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
    
    // 中等难度参数 (15-100分)
    PIPE_SPEED_MEDIUM: 3.0,
    PIPE_SPAWN_INTERVAL_MEDIUM: 1600,
    PIPE_GAP_MEDIUM: 180,
    HEIGHT_VARIATION_MEDIUM: 400,
    
    // 最终难度参数 (100分以上)
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
  // 获取北京时间的日期字符串
  const getBeijingDate = () => {
    const now = new Date();
    // 获取当前UTC时间
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    // 转换为北京时间 (UTC+8)
    const beijingTime = new Date(utcTime + (8 * 3600000));
    
    const year = beijingTime.getUTCFullYear();
    const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const today = getBeijingDate();
  
  // 获取请求参数
  const mode = req.query.mode; // 'endless' 或 'challenge'
  const date = req.query.date || today; // 默认使用今天的日期
  
  // 模拟排行榜数据 
  const mockScoresAll = [
    // 无尽模式数据
    { name: "小十", score: "10", mode: "endless", timestamp: Date.now() - 1000 },
    { name: "小五", score: "5", mode: "endless", timestamp: Date.now() - 5000 },
    { name: "小三", score: "3", mode: "endless", timestamp: Date.now() - 7000 },
    
    // 每日挑战模式数据 - 添加日期字段，使用北京时间
    { name: "达世", score: "26", mode: "challenge", date: today, timestamp: Date.now() - 2000 },
    { name: "凯尔", score: "26", mode: "challenge", date: today, timestamp: Date.now() - 3000 },
    { name: "XD", score: "27", mode: "challenge", date: today, timestamp: Date.now() - 4000 },
    { name: "霍华德", score: "21", mode: "challenge", date: today, timestamp: Date.now() - 6000 },
    { name: "tyc", score: "10", mode: "challenge", date: today, timestamp: Date.now() - 8000 },
    { name: "3", score: "7", mode: "challenge", date: today, timestamp: Date.now() - 9000 }
  ];
  
  // 根据请求参数过滤数据
  let filteredScores = mockScoresAll;
  
  // 如果指定了模式，按模式过滤
  if (mode) {
    filteredScores = filteredScores.filter(score => score.mode === mode);
    
    // 如果是挑战模式且指定了日期，则按日期过滤
    if (mode === 'challenge' && date) {
      filteredScores = filteredScores.filter(score => score.date === date);
    }
  }
  
  // 根据分数排序（降序）
  filteredScores.sort((a, b) => parseInt(b.score) - parseInt(a.score));
  
  // 限制为最多20条记录
  filteredScores = filteredScores.slice(0, 20);
  
  console.log(`API请求: /api/get-scores${mode ? '?mode=' + mode : ''}${mode === 'challenge' && date ? '&date=' + date : ''}`);
  console.log(`返回${filteredScores.length}条记录`);
  
  res.status(200).json(filteredScores);
});

// 模拟提交分数API
app.post('/api/submit-score', (req, res) => {
  const { name, score } = req.body;
  
  if (!name || !score) {
    return res.status(400).send('缺少名字或分数');
  }
  
  console.log(`收到分数提交: ${name} - ${score}分`);
  
  // 模拟成功响应
  res.status(200).json({ success: true });
});

// 启动服务器
app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
  console.log(`打开浏览器访问上面的地址来玩Flappy Bird游戏！`);
}); 