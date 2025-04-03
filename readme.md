# Flappy Bird 游戏

一个使用JavaScript和HTML5 Canvas开发的现代Flappy Bird游戏，具有渐进式难度系统和全球排行榜功能。

[在线试玩](https://game-flappy-bird-rho.vercel.app/)

![Flappy Bird 游戏截图](https://github.com/dashhuang/game-flappy-bird/raw/main/screenshots/gameplay.png)

## 游戏特性

### 核心功能
- 🎮 基于HTML5 Canvas的流畅2D游戏体验
- 📱 全响应式设计，支持桌面和移动设备
- 🔄 智能适配横屏和竖屏模式
- 🌈 每次游戏随机生成小鸟颜色
- ☁️ 动态生成的云朵背景效果
- 🏆 全球排行榜，记录和展示最高分

### 游戏机制
- 🔄 精心设计的三阶段难度系统
  - **初始难度 (0-15分)**: 友好的入门体验，管道间隙220像素，速度2.5
  - **中等难度 (15-100分)**: 适中的挑战，管道间隙180像素，速度3.0
  - **最终难度 (100分以上)**: 均衡挑战，管道间隙140像素，速度3.0
- 🎯 每5分增加一次难度，平滑的难度提升曲线
- 🌟 公平的判定系统：5像素的容错空间，提供更好的游戏体验
- 📈 管道高度变化动态调整：初级±200像素，中级±300像素，高级±500像素
- ⏱️ 管道生成频率渐进式调整：2000ms→1600ms→1400ms

## 如何游玩

### 控制方式
- 💻 **桌面设备**：点击屏幕或按空格键使小鸟向上飞
- 📱 **移动设备**：轻触屏幕使小鸟向上飞

### 游戏目标
1. 引导小鸟穿过管道之间的间隙
2. 每成功通过一对管道得1分
3. 尽可能获得高分，挑战100分突破最终难度
4. 当分数足够高时，可以提交成绩到全球排行榜

## 技术实现

### 前端技术
- ⚡️ 纯原生JavaScript (ES6+)，无需任何框架
- 🎨 HTML5 Canvas进行高性能游戏渲染
- 🔄 requestAnimationFrame实现平滑游戏循环
- 📱 响应式设计，适配各种设备和屏幕方向
- 🔒 localStorage保存本地最高分记录

### 后端技术
- ☁️ Vercel托管和部署
- 📊 使用Redis数据库存储全球排行榜数据
- 🔌 Serverless API接口实现排行榜数据读写

### 性能优化
- 🚀 高效的碰撞检测算法
- 🧹 自动清理屏幕外的游戏对象减少内存占用
- 📊 动态调整游戏参数以适应不同设备性能

## 本地开发

1. 克隆仓库
```bash
git clone https://github.com/dashhuang/game-flappy-bird.git
cd game-flappy-bird
```

2. 安装依赖（如需要）
```bash
npm install
```

3. 启动本地服务器
```bash
npm run dev
```

4. 在浏览器中访问 `http://localhost:3000`

## 部署

项目已配置为自动部署到Vercel：
1. 推送到主分支的代码将自动触发Vercel部署
2. 排行榜功能依赖于Vercel KV (Redis) 存储

## 支持的浏览器

- ✅ Chrome / Edge (推荐)
- ✅ Firefox
- ✅ Safari
- ✅ iOS Safari / Android Chrome

## 贡献指南

欢迎提交Pull Request或Issue！如有功能建议或bug报告，请在GitHub上提交Issue。

## 许可

MIT License

---

开发者: [dashhuang](https://github.com/dashhuang)
