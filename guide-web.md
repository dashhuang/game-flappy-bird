# 移动设备和网页适配实现文档

## 目录

1. [移动设备适配](#1-移动设备适配)
   - [1.1 视口配置](#11-视口配置)
   - [1.2 禁止页面滚动和缩放](#12-禁止页面滚动和缩放)
   - [1.3 处理安全区域和状态栏](#13-处理安全区域和状态栏)
   - [1.4 动态视口高度计算](#14-动态视口高度计算)
   - [1.5 iOS特定问题处理](#15-ios特定问题处理)
   - [1.6 屏幕尺寸检测和提示](#16-屏幕尺寸检测和提示)
   - [1.7 设备方向适配](#17-设备方向适配)
2. [社交媒体分享与预览](#2-社交媒体分享与预览)
   - [2.1 配置Open Graph和Twitter Card元标签](#21-配置open-graph和twitter-card元标签)
   - [2.2 社交分享预览效果](#22-社交分享预览效果)
   - [2.3 预览图片准备](#23-预览图片准备)
   - [2.4 动态预览内容](#24-动态预览内容)
   - [2.5 预览内容验证工具](#25-预览内容验证工具)

---

## 1. 移动设备适配

### 1.1 视口配置

在HTML头部添加了以下meta标签确保移动设备显示正确：

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-maxfps" content="120">
<meta name="apple-touch-fullscreen" content="yes">
```

### 1.2 禁止页面滚动和缩放

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

### 1.3 处理安全区域和状态栏

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

### 1.4 动态视口高度计算

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

### 1.5 iOS特定问题处理

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

### 1.6 屏幕尺寸检测和提示

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

### 1.7 设备方向适配

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

## 2. 社交媒体分享与预览

### 2.1 配置Open Graph和Twitter Card元标签

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

### 2.2 社交分享预览效果

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

### 2.3 预览图片准备

为获得最佳效果，预览图片应遵循以下规范：

- **尺寸**：1200×630像素（2:1宽高比）
- **文件大小**：建议小于1MB
- **格式**：PNG格式，支持透明度
- **内容**：
  - 包含游戏标志和特色元素
  - 文字简洁易读
  - 避免在重要内容区域使用透明度
  - 色彩鲜明以吸引注意力

### 2.4 动态预览内容

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

### 2.5 预览内容验证工具

分享前验证元标签的工具链接：

- [Facebook分享调试器](https://developers.facebook.com/tools/debug/)
- [Twitter Card验证器](https://cards-dev.twitter.com/validator)
- [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)
- [Open Graph检查工具](https://www.opengraph.xyz/)

---

通过这篇文档，开发者可以理解和实现游戏在移动设备上的适配，以及如何优化社交媒体分享体验，为游戏提供更好的可访问性和更广泛的传播渠道。 