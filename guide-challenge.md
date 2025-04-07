# 游戏模式与排行榜系统实现文档

## 目录

1. [游戏模式架构](#1-游戏模式架构)
   - [1.1 游戏模式类型](#11-游戏模式类型)
   - [1.2 模式切换代码结构](#12-模式切换代码结构)
2. [数据存储设计](#2-数据存储设计)
   - [2.1 Redis数据模型](#21-redis数据模型)
   - [2.2 排行榜数据示例](#22-排行榜数据示例)
3. [服务器API设计](#3-服务器api设计)
   - [3.1 API端点概览](#31-api端点概览)
   - [3.2 排行榜数据获取](#32-排行榜数据获取)
   - [3.3 分数提交逻辑](#33-分数提交逻辑)
4. [前端排行榜实现](#4-前端排行榜实现)
   - [4.1 排行榜数据加载](#41-排行榜数据加载)
   - [4.2 排行榜界面展示](#42-排行榜界面展示)
5. [游戏内旗子标记系统](#5-游戏内旗子标记系统)
   - [5.1 旗子数据处理](#51-旗子数据处理)
   - [5.2 旗子生成与绘制](#52-旗子生成与绘制)
6. [重要的数据流程](#6-重要的数据流程)
   - [6.1 分数提交流程](#61-分数提交流程)
   - [6.2 北京时间处理(GMT+8)](#62-北京时间处理gmt8)
   - [6.3 每日挑战种子生成](#63-每日挑战种子生成)
   - [6.4 每日挑战难度递增机制](#64-每日挑战难度递增机制)
7. [最佳实践与注意事项](#7-最佳实践与注意事项)
   - [7.1 性能优化](#71-性能优化)
   - [7.2 可扩展性考虑](#72-可扩展性考虑)
   - [7.3 时区处理](#73-时区处理)
   - [7.4 安全考虑](#74-安全考虑)
8. [部署要点](#8-部署要点)


---

## 1. 游戏模式架构

### 1.1 游戏模式类型

| 模式 | 特点 | 难度机制 | 终止条件 |
|------|------|----------|----------|
| **无尽模式** | 经典玩法，无限管道 | 分数越高难度越大 | 碰撞障碍物或地面 |
| **每日挑战** | 固定种子生成，50个管道 | 从中等难度开始，逐渐提高到最高难度 | 通过50个管道或碰撞 |

### 1.2 模式切换代码结构

```javascript
// 每日挑战按钮
document.getElementById('daily-challenge-button').addEventListener('click', () => {
  // 保存当前模式状态
  const wasInEndlessMode = this.gameMode === GAME_MODE.ENDLESS;
  
  // 切换模式
  this.gameMode = GAME_MODE.DAILY_CHALLENGE;
  
  // 重置种子以确保每天固定随机序列
  this.resetDailyChallengeSeed();
  
  // 加载对应排行榜
  if (wasInEndlessMode) {
    this.loadLeaderboardInBackground(true);
  }
});
```

## 2. 数据存储设计

### 2.1 Redis数据模型

**基本数据结构**：
* **哈希表** - 存储分数详细信息：`score:{id}`
* **有序集合** - 存储排序的分数索引

**集合键名设计**：
* 模式集合: `scores:{mode}` 
  * 例: `scores:endless`、`scores:challenge`
* 每日挑战日期集合: `scores:challenge:{date}` 
  * 例: `scores:challenge:2025-04-04`

### 2.2 排行榜数据示例

```
// 分数哈希表
score:1680123456789 -> {
  name: "玩家1",
  score: "27",
  timestamp: 1680123456789,
  mode: "challenge",
  date: "2025-04-04"
}

// 有序集合关系
scores:challenge -> [
  {value: "1680123456789", score: 27000000000},
  {value: "1680123456790", score: 26000000000},
  ...
]

scores:challenge:2025-04-04 -> [
  {value: "1680123456789", score: 27000000000},
  ...
]
```

## 3. 服务器API设计

### 3.1 API端点概览

| API端点 | 方法 | 参数 | 功能 |
|---------|------|------|------|
| `/api/game-config` | GET | - | 获取游戏配置参数 |
| `/api/get-scores` | GET | mode, date | 获取排行榜数据 |
| `/api/submit-score` | POST | name, score, mode, date | 提交玩家分数 |
| `/api/verify-admin` | POST | password | 验证管理员密码 |
| `/api/clear-leaderboard` | POST | password | 清空排行榜 |

### 3.2 排行榜数据获取

```javascript
// 获取分数API
export default async function handler(req, res) {
  try {
    // 获取请求参数
    const mode = req.query.mode; // 'endless' 或 'challenge'
    const date = req.query.date; // 格式: YYYY-MM-DD
    
    // 基于请求参数确定查询的集合键
    let scoreKey = 'scores'; // 默认查询所有分数
    
    if (mode) {
      scoreKey = `scores:${mode}`; // 查询特定模式的分数
      
      // 如果是挑战模式且指定了日期，查询特定日期的分数
      if (mode === 'challenge' && date) {
        scoreKey = `scores:${mode}:${date}`;
      }
    }
    
    // 创建Redis客户端并连接
    const redis = await createClient({url: process.env.REDIS_URL}).connect();
    
    // 检查集合是否存在
    const keyExists = await redis.exists(scoreKey);
    if (!keyExists) {
      await redis.disconnect();
      return res.status(200).json([]);
    }
    
    // 直接从对应集合获取前20名高分
    const topScoreIds = await redis.zRange(scoreKey, 0, 19, {REV: true});
    
    // 获取详细信息
    const scores = [];
    for (const id of topScoreIds) {
      const scoreData = await redis.hGetAll(`score:${id}`);
      if (scoreData) {
        scores.push(scoreData);
      }
    }
    
    await redis.disconnect();
    return res.status(200).json(scores);
  } catch (error) {
    return res.status(500).json({error: error.message});
  }
}
```

### 3.3 分数提交逻辑

```javascript
// 提交分数API
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('方法不允许');
  }
  
  const { name, score, mode, date } = req.body;
  
  // 确定要使用的有序集合键名
  const modeScoreKey = `scores:${mode}`;
  const dateScoreKey = mode === 'challenge' && date ? `scores:${mode}:${date}` : null;
  
  // 检查是否已存在同名用户记录
  // ...
  
  // 计算排序分数（确保高分在前，同分按提交时间排序）
  const sortScore = parseInt(score) * 10000000000 + (10000000000 - Math.floor(timestamp / 1000));
  
  // 创建新记录或更新现有记录
  // ...
  
  // 添加到对应集合
  await redis.zAdd(modeScoreKey, [{score: sortScore, value: id}]);
  if (dateScoreKey) {
    await redis.zAdd(dateScoreKey, [{score: sortScore, value: id}]);
  }
  
  return res.status(200).json({ success: true });
}
```

## 4. 前端排行榜实现

### 4.1 排行榜数据加载

```javascript
// 加载排行榜数据
loadLeaderboardInBackground(forceProcess = false) {
  const currentMode = this.gameMode === GAME_MODE.ENDLESS ? '无尽模式' : '每日挑战';
  const dateInfo = this.gameMode === GAME_MODE.DAILY_CHALLENGE ? ` (${this.currentChallengeDate})` : '';
  
  // 构建API URL，添加模式和日期参数
  let apiUrl = '/api/get-scores?mode=' + (this.gameMode === GAME_MODE.ENDLESS ? 'endless' : 'challenge');
  
  // 如果是每日挑战模式，添加日期参数
  if (this.gameMode === GAME_MODE.DAILY_CHALLENGE && this.currentChallengeDate) {
    apiUrl += `&date=${this.currentChallengeDate}`;
  }
  
  fetch(apiUrl)
    .then(response => response.json())
    .then(data => {
      this.leaderboardData = data;
      this.processLeaderboardForFlags();
      
      if (this.gameState === GAME_STATE.GAME_OVER || forceProcess) {
        this.displayLeaderboard(data);
      }
    })
    .catch(error => {
      console.error('加载排行榜数据失败:', error);
      if (this.gameState === GAME_STATE.GAME_OVER) {
        this.displayLeaderboard([]);
      }
    });
}
```

### 4.2 排行榜界面展示

```javascript
displayLeaderboard(scores) {
  const leaderboardContainer = document.getElementById('leaderboard-container');
  const leaderboardList = document.getElementById('leaderboard-list');
  const leaderboardMode = document.getElementById('leaderboard-mode');
  
  // 更新排行榜模式显示
  if (leaderboardMode) {
    let modeText = this.gameMode === GAME_MODE.ENDLESS ? '无尽模式' : '每日挑战';
    if (this.gameMode === GAME_MODE.DAILY_CHALLENGE) {
      modeText += ` (${this.currentChallengeDate})`;
    }
    leaderboardMode.textContent = modeText;
  }
  
  // 构建排行榜表格
  leaderboardList.innerHTML = '';
  if (scores.length === 0) {
    leaderboardList.innerHTML = '<p>暂无记录</p>';
  } else {
    const table = document.createElement('table');
    table.innerHTML = `
      <tr>
        <th>排名</th>
        <th>名字</th>
        <th>分数</th>
      </tr>
    `;
    
    scores.forEach((score, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${score.name}</td>
        <td>${score.score}</td>
      `;
      table.appendChild(row);
    });
    
    leaderboardList.appendChild(table);
  }
  
  leaderboardContainer.style.display = 'block';
}
```

## 5. 游戏内旗子标记系统

### 5.1 旗子数据处理

```javascript
// 处理排行榜数据为旗子位置信息
processLeaderboardForFlags() {
  if (!this.leaderboardData || !Array.isArray(this.leaderboardData)) {
    return;
  }
  
  // 重置旗子数据
  this.flags = [];
  
  // 为每个不同分数创建一个旗子
  const scoreGroups = {};
  this.leaderboardData.forEach(entry => {
    const score = parseInt(entry.score);
    if (!scoreGroups[score]) {
      scoreGroups[score] = entry;
    }
  });
  
  // 创建旗子数据
  for (const score in scoreGroups) {
    const entry = scoreGroups[score];
    const colorIndex = simpleStringHash(entry.name) % FLAG_COLORS.length;
    
    this.flags.push({
      score: parseInt(score),
      name: entry.name,
      placed: false,
      color: FLAG_COLORS[colorIndex]
    });
  }
}
```

### 5.2 旗子生成与绘制

```javascript
// 生成管道时添加旗子
spawnPipe() {
  // 增加生成对数计数器
  this.pipePairSpawnCount++;
  const pipeNumber = this.pipePairSpawnCount;
  
  // 确定是否需要在此管道对添加旗子
  let hasFlag = false;
  let flagName = '';
  let flagColor = '#E74C3C';
  
  if (this.flags && this.flags.length > 0) {
    const flag = this.flags.find(t => t.score === pipeNumber && !t.placed);
    if (flag) {
      hasFlag = true;
      flagName = flag.name;
      flagColor = flag.color;
      flag.placed = true;
    }
  }
  
  // 创建管道对象，包含旗子信息
  this.pipes.push({
    // ... 管道基本属性
    hasFlag: hasFlag,
    flagName: flagName,
    flagColor: flagColor
  });
}

// 绘制旗子
drawFlags() {
  if (!this.pipes || this.pipes.length === 0) return;
  
  for (const pipe of this.pipes) {
    if (!pipe.isTop || !pipe.hasFlag) continue;
    
    // 计算旗子位置（管道之后的位置）
    let flagX = pipe.x + this.PIPE_WIDTH + 60;
    
    // 如果旗子在屏幕外，跳过绘制
    if (flagX < 0 || flagX > this.canvas.width) continue;
    
    // 绘制旗杆
    this.ctx.fillStyle = '#8A5722';
    this.ctx.beginPath();
    this.ctx.roundRect(
      flagX - 2, 
      this.canvas.height - this.GROUND_HEIGHT - 45, 
      4, 
      45, 
      [2, 2, 0, 0]
    );
    this.ctx.fill();
    
    // 绘制旗子（三角形）
    this.ctx.fillStyle = pipe.flagColor;
    this.ctx.beginPath();
    this.ctx.moveTo(flagX, this.canvas.height - this.GROUND_HEIGHT - 45 + 5);
    this.ctx.lineTo(flagX + 30, this.canvas.height - this.GROUND_HEIGHT - 45 + 5 + 20/2);
    this.ctx.lineTo(flagX, this.canvas.height - this.GROUND_HEIGHT - 45 + 5 + 20);
    this.ctx.closePath();
    this.ctx.fill();
    
    // 绘制玩家名字
    this.ctx.fillStyle = '#666666';
    this.ctx.font = 'bold 14px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(pipe.flagName, flagX + 20, this.canvas.height - this.GROUND_HEIGHT - 45 + 5 + 20 + 15);
  }
}
```

## 6. 重要的数据流程

### 6.1 分数提交流程

1. 玩家游戏结束或完成每日挑战
2. 检查分数是否够高（高于个人记录且能进入前20）
3. 显示名字输入框
4. 玩家输入名字并点击提交
5. 前端调用`/api/submit-score`提交数据
6. 后端API接收数据，添加到对应Redis集合中
7. 提交成功后，前端重新加载排行榜并显示

### 6.2 北京时间处理(GMT+8)

```javascript
// 获取北京时间（GMT+8）的日期字符串
getCurrentChallengeDate() {
  const now = new Date();
  // 获取当前UTC时间
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  // 转换为北京时间 (UTC+8)
  const beijingTime = new Date(utcTime + (8 * 3600000));
  
  const year = beijingTime.getUTCFullYear();
  const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

### 6.3 每日挑战种子生成

```javascript
// 生成基于日期的种子
generateDailySeed() {
  const today = this.getCurrentChallengeDate();
  const [year, month, day] = today.split('-').map(Number);
  return year * 10000 + month * 100 + day;
}

// 伪随机数生成器 (Mulberry32算法)
mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```

### 6.4 每日挑战难度递增机制

```javascript
// 每日挑战模式的难度调整（在update函数内）
if (this.gameMode === GAME_MODE.DAILY_CHALLENGE) {
  // 40分后达到最高难度
  const progressToMax = Math.min(1, this.score / 40);
  
  // 根据进度计算难度
  this.currentPipeGap = this.PIPE_GAP_MEDIUM - progressToMax * (this.PIPE_GAP_MEDIUM - this.PIPE_GAP_FINAL);
  this.currentPipeSpeed = this.PIPE_SPEED_MEDIUM + progressToMax * (this.PIPE_SPEED_FINAL - this.PIPE_SPEED_MEDIUM);
  this.currentPipeSpawnInterval = this.PIPE_SPAWN_INTERVAL_MEDIUM - progressToMax * (this.PIPE_SPAWN_INTERVAL_MEDIUM - this.PIPE_SPAWN_INTERVAL_FINAL);
}
```

## 7. 最佳实践与注意事项

### 7.1 性能优化

1. **直接查询特定集合**：避免获取所有数据后再过滤
2. **限制返回数量**：每次最多返回20条记录
3. **惰性加载**：只在需要时加载排行榜数据
4. **按需加载旗子**：只创建必要的旗子，避免绘制屏幕外对象

### 7.2 可扩展性考虑

1. **集合键名模式**：`scores:{mode}:{date}` 模式便于添加新的游戏模式
2. **配置参数服务器化**：游戏参数通过API获取，便于调整
3. **数据分离存储**：不同模式数据分开存储，确保查询效率

### 7.3 时区处理

1. 使用北京时间(GMT+8)作为标准时间
2. 正确计算UTC偏移以处理不同时区用户

### 7.4 安全考虑

1. **分数验证**：
   - 后端应对提交的分数进行合理性校验，例如检查分数是否在可能达到的范围内，防止提交异常高分。
   - 可以记录游戏时长等信息，辅助判断分数的有效性。
2. **管理功能密码保护**：需要环境变量`ADMIN_PASSWORD`验证。
3. **防重复提交与刷分**：
   - 同一玩家同一模式只保留最高分记录。
   - 后端可以实现API速率限制（Rate Limiting），例如限制同一IP地址在短时间内的提交次数，防止恶意刷分。
4. **IP屏蔽机制**：
   - 后台应提供接口或管理界面，允许管理员手动屏蔽可疑的IP地址。
   - 可考虑实现自动屏蔽策略，例如当某个IP地址触发过多的无效提交或速率限制时，自动将其加入黑名单一段时间。
5. **数据传输安全**：虽然此项目可能不涉及高度敏感信息，但在生产环境中，考虑使用HTTPS确保数据传输过程的加密。

## 8. 部署要点

1. **环境变量**：
   - `REDIS_URL`: Redis连接URL
   - `ADMIN_PASSWORD`: 管理功能密码

2. **Vercel配置**：
   - 使用`vercel.json`配置API路由和静态文件服务
   - 连接Vercel KV(Redis)服务

3. **本地开发**：
   - 使用`server.js`提供本地API模拟
   - 通过`npm run dev`启动本地服务器

---

通过这篇文档，开发者可以快速理解和实现类似的双模式游戏系统，包括不同模式的排行榜、数据存储结构、API设计和前端展示，从而在开发其他休闲游戏时重用这些模式和最佳实践。
