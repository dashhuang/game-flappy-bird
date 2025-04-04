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
9. [移动设备适配](#9-移动设备适配)
   - [9.1 视口配置](#91-视口配置)
   - [9.2 禁止页面滚动和缩放](#92-禁止页面滚动和缩放)
   - [9.3 处理安全区域和状态栏](#93-处理安全区域和状态栏)
   - [9.4 动态视口高度计算](#94-动态视口高度计算)
   - [9.5 iOS特定问题处理](#95-ios特定问题处理)
   - [9.6 屏幕尺寸检测和提示](#96-屏幕尺寸检测和提示)
   - [9.7 设备方向适配](#97-设备方向适配)
10. [社交媒体分享与预览](#10-社交媒体分享与预览)
    - [10.1 配置Open Graph和Twitter Card元标签](#101-配置open-graph和twitter-card元标签)
    - [10.2 社交分享预览效果](#102-社交分享预览效果)
    - [10.3 预览图片准备](#103-预览图片准备)
    - [10.4 动态预览内容](#104-动态预览内容)
    - [10.5 预览内容验证工具](#105-预览内容验证工具)

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

1. **分数验证**：只有更高分数才会更新记录
2. **管理功能密码保护**：需要环境变量`ADMIN_PASSWORD`验证
3. **防重复提交**：同一玩家同一模式只保留最高分

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

## 9. 移动设备适配

### 9.1 视口配置

在HTML头部添加了以下meta标签确保移动设备显示正确：

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-maxfps" content="120">
<meta name="apple-touch-fullscreen" content="yes">
```

### 9.2 禁止页面滚动和缩放

通过adjustForMobile方法防止游戏过程中意外的页面滚动和缩放：

```javascript
// 为移动设备进行额外调整
adjustForMobile() {
    if (this.isMobile) {
        // 防止页面滚动和弹跳
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = '0';
        document.body.style.left = '0';
        document.body.style.width = '100%';
        document.body.style.height = '100%';
        
        // 阻止所有默认滚动行为
        document.addEventListener('touchmove', function(e) {
            e.preventDefault();
        }, { passive: false });
        
        // 阻止双击缩放
        document.addEventListener('touchend', function(e) {
            const now = Date.now();
            if (now - this.lastTouchEnd <= 300) {
                e.preventDefault();
            }
            this.lastTouchEnd = now;
        }.bind(this), false);
        
        // 立即更新视口高度
        setViewportHeight();
    }
}
```

### 9.3 处理安全区域和状态栏

特别是在刘海屏和底部手势条设备上，通过CSS变量处理安全区域：

```javascript
// 检查是否有安全区域insets可用
if (window.CSS && CSS.supports('padding-top: env(safe-area-inset-top)')) {
    const safeAreaTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top')) || 0;
    
    // 如果有安全区域，调整游戏元素
    if (safeAreaTop > 0) {
        this.canvas.style.paddingTop = `${safeAreaTop}px`;
        // 调整分数显示位置，确保始终可见
        document.getElementById('score-display').style.top = `${Math.max(20, safeAreaTop)}px`;
    }
}
```

配套的CSS定义：

```css
@supports (padding-top: env(safe-area-inset-top)) {
    body {
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
    }
}
```

### 9.4 动态视口高度计算

由于移动浏览器地址栏显示/隐藏会改变视口高度，添加了动态调整函数：

```javascript
// 设置视口实际高度的辅助函数
function setViewportHeight() {
    // 计算实际视口高度
    let vh = window.innerHeight * 0.01;
    // 设置CSS变量
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    
    // 直接应用到游戏容器和canvas
    const gameContainer = document.getElementById('game-container');
    const canvas = document.getElementById('game-canvas');
    
    if (gameContainer) {
        gameContainer.style.height = `${window.innerHeight}px`;
    }
    
    if (canvas) {
        canvas.height = window.innerHeight;
    }
}

// 在初始化和窗口尺寸变化时调用
window.addEventListener('resize', setViewportHeight);
window.addEventListener('orientationchange', () => {
    // iOS上方向变化后需要延迟更新
    setTimeout(setViewportHeight, 100);
});
```

### 9.5 iOS特定问题处理

针对iOS设备的特殊处理：

```javascript
// 处理iOS Safari额外问题
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
if (isIOS) {
    // 当软键盘收起时
    window.addEventListener('focusout', function() {
        setViewportHeight();
    });
    
    // 在滚动结束后重新设置高度(iOS工具栏出现/消失)
    let scrollTimeout;
    window.addEventListener('scroll', function() {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(setViewportHeight, 100);
    });
    
    // iOS上工具栏出现/消失会触发resize事件
    window.addEventListener('resize', setViewportHeight);
}
```

### 9.6 屏幕尺寸检测和提示

为确保游戏体验，当屏幕高度不足时显示警告：

```javascript
// 检查屏幕高度是否足够
checkScreenHeight(height) {
    const MIN_HEIGHT = 500; // 最小高度要求，单位：像素
    
    // 如果高度不足
    if (height < MIN_HEIGHT) {
        console.log(`屏幕高度不足: ${height}像素 < ${MIN_HEIGHT}像素最低要求`);
        
        // 如果正在游戏中，则停止游戏并显示警告
        if (this.gameState === GAME_STATE.PLAYING) {
            this.showHeightWarning();
        } 
        // 如果未在游戏中但准备开始游戏，则显示警告并阻止游戏开始
        else if (this.gameState === GAME_STATE.MENU) {
            this.showHeightWarning();
        }
        
        return false;
    }
    
    return true;
}
```

相应的HTML和CSS实现:

```html
<!-- 屏幕高度不足警告界面 -->
<div id="height-warning-screen" class="screen" style="display: none;">
    <div class="warning-content">
        <h2>屏幕高度不足</h2>
        <p>无法提供正常的游戏体验。</p>
        <p id="desktop-height-tip" style="display: none;">请调整窗口大小。</p>
        <p id="mobile-height-tip" style="display: none;">请将设备竖屏使用。</p>
        <button id="back-to-menu-height-warning">返回主菜单</button>
    </div>
</div>
```

### 9.7 设备方向适配

针对设备方向变化做出调整：

```javascript
// 窗口大小改变
window.addEventListener('resize', () => {
    this.handleResize();
});

// 屏幕方向变化
window.addEventListener('orientationchange', () => {
    setTimeout(() => this.handleResize(), 100);
});
```

对应的CSS媒体查询：

```css
/* 响应式设计 - 横屏模式 */
@media (orientation: landscape) {
    .game-container {
        aspect-ratio: 16 / 9;
        max-height: 100vh;
        width: auto;
        margin: 0 auto;
    }
}

/* 响应式设计 - 竖屏模式 */
@media (orientation: portrait) {
    .game-container {
        aspect-ratio: auto;
        width: 100%;
        height: 100vh;
        margin: 0;
    }
    
    #score-display {
        top: 20px;
        right: 20px;
        font-size: 2.5rem;
    }
    
    h1, h2 {
        font-size: 2.8rem;
        margin-bottom: 30px;
    }
    
    p {
        font-size: 1.4rem;
        margin-bottom: 25px;
    }
    
    button {
        padding: 16px 36px;
        font-size: 1.5rem;
        border-radius: 10px;
        margin-top: 30px;
    }
}

/* 添加小屏幕手机适配 */
@media (max-height: 600px) and (orientation: portrait) {
    h1, h2 {
        font-size: 2.2rem;
        margin-bottom: 15px;
    }
    
    p {
        font-size: 1.2rem;
        margin-bottom: 15px;
    }
    
    button {
        padding: 12px 28px;
        font-size: 1.3rem;
        margin-top: 15px;
    }
}
```

## 10. 社交媒体分享与预览

### 10.1 配置Open Graph和Twitter Card元标签

在HTML头部添加元标签，提升在社交媒体平台的分享体验：

```html
<!-- 添加Open Graph元标签 -->
<meta property="og:title" content="Flappy Bird">
<meta property="og:description" content="来玩Flappy Bird! 无尽模式和每日挑战等着你！">
<meta property="og:image" content="https://flappybird.huang.co/assets/flappy-preview.png">
<meta property="og:url" content="https://flappybird.huang.co/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Flappy Bird Game">

<!-- 添加Twitter Card元标签 -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Flappy Bird">
<meta name="twitter:description" content="来玩Flappy Bird! 无尽模式和每日挑战等着你！">
<meta name="twitter:image" content="https://flappybird.huang.co/assets/flappy-preview.png">

<!-- 添加主题色和描述 -->
<meta name="theme-color" content="#87CEEB">
<meta name="description" content="经典小鸟游戏的现代版本，包含无尽模式和每日挑战，挑战你的朋友，冲击最高分！">
```

### 10.2 社交分享预览效果

这些元标签确保游戏链接在各平台上分享时具有吸引力：

1. **Telegram分享预览**：
   - 显示游戏标题、描述和预览图片
   - 图片使用专门设计的预览图，突出游戏特色

2. **WhatsApp分享**：
   - 显示简洁的游戏名称和描述
   - 预览图适应小尺寸显示

3. **微信/QQ分享**：
   - 支持在中文社交媒体平台上正确显示
   - 图片和标题适应平台要求

4. **Facebook/Twitter分享**：
   - 使用summary_large_image卡片类型
   - 增加视觉吸引力和点击率

### 10.3 预览图片准备

为获得最佳效果，预览图片应遵循以下规范：

- **尺寸**：1200×630像素（2:1宽高比）
- **文件大小**：建议小于1MB
- **格式**：PNG格式，支持透明度
- **内容**：
  - 包含游戏标志和特色元素
  - 文字简洁易读
  - 避免在重要内容区域使用透明度
  - 色彩鲜明以吸引注意力

### 10.4 动态预览内容

对于进阶实现，可以开发动态预览图片生成功能：

```javascript
// 示例：生成动态预览图片API
app.get('/api/preview-image', async (req, res) => {
  // 获取最新排行榜数据
  const topScores = await getTopScores(5);
  
  // 创建Canvas并绘制预览图
  const canvas = createCanvas(1200, 630);
  const ctx = canvas.getContext('2d');
  
  // 绘制背景、游戏标志和当前排行榜
  drawPreviewBackground(ctx);
  drawGameLogo(ctx);
  drawLeaderboard(ctx, topScores);
  
  // 输出为PNG图片
  res.setHeader('Content-Type', 'image/png');
  canvas.createPNGStream().pipe(res);
});
```

### 10.5 预览内容验证工具

分享前验证元标签的工具链接：

- [Facebook分享调试器](https://developers.facebook.com/tools/debug/)
- [Twitter Card验证器](https://cards-dev.twitter.com/validator)
- [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)
- [Open Graph检查工具](https://www.opengraph.xyz/)

---

通过这篇文档，开发者可以快速理解和实现类似的双模式游戏系统，包括不同模式的排行榜、数据存储结构、API设计和前端展示，从而在开发其他休闲游戏时重用这些模式和最佳实践。
