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
  // 模拟排行榜数据 (包含1-9分)
  const mockScores = [
    // 1-9分数据
    { name: "小九", score: "9", mode: "endless", timestamp: Date.now() - 1000 },
    { name: "小八", score: "8", mode: "endless", timestamp: Date.now() - 2000 },
    { name: "小七", score: "7", mode: "endless", timestamp: Date.now() - 3000 },
    { name: "小六", score: "6", mode: "endless", timestamp: Date.now() - 4000 },
    { name: "小五", score: "5", mode: "endless", timestamp: Date.now() - 5000 },
    { name: "小四", score: "4", mode: "endless", timestamp: Date.now() - 6000 },
    { name: "小三", score: "3", mode: "endless", timestamp: Date.now() - 7000 },
    { name: "小二", score: "2", mode: "endless", timestamp: Date.now() - 8000 },
    { name: "小一", score: "1", mode: "endless", timestamp: Date.now() - 9000 },
    // 其他高分数据
    { name: "张三", score: "98", mode: "endless", timestamp: Date.now() - 10000 },
    { name: "李四", score: "85", mode: "endless", timestamp: Date.now() - 20000 },
    { name: "王五", score: "75", mode: "endless", timestamp: Date.now() - 30000 },
    { name: "赵六", score: "70", mode: "endless", timestamp: Date.now() - 40000 },
    { name: "孙七", score: "65", mode: "endless", timestamp: Date.now() - 50000 }
  ];
  
  res.status(200).json(mockScores);
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