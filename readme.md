# Flappy Bird 游戏

一个使用JavaScript和HTML5 Canvas开发的现代Flappy Bird游戏，具有渐进式难度系统、两种游戏模式（无尽模式和每日挑战）以及全球排行榜功能。

[在线试玩](https://flappybird.huang.co)

![Flappy Bird 游戏预览](assets/flappy-preview.png)

## 游戏特性

### 核心功能
- 🎮 基于HTML5 Canvas的流畅2D游戏体验
- 📱 全响应式设计，支持桌面和移动设备
- 🔄 智能适配横屏和竖屏模式
- 🌈 每次游戏随机生成小鸟颜色
- ☁️ 动态生成的云朵背景效果
- 🏆 全球排行榜，记录和展示最高分 (区分无尽模式和每日挑战)
- 🏅 **新增：每日挑战模式** - 每天都有固定种子生成的关卡，挑战50个管道！
- 🔄 **新增：实时排行榜更新** - 提交分数后显示排行榜更新动画
- 🔗 **新增：社交媒体分享预览** - 在Telegram、WhatsApp等平台分享链接时显示游戏预览
- ✨ **新增：两种构建目标**
  - **Vercel 版本**: 使用 Vercel Serverless Functions 和 Vercel KV 实现后端排行榜和配置加载（原有方式）。
  - **SCE 版本**: 使用 [SCE SDK](https://www.npmjs.com/package/sce-game-sdk) 实现玩家认证、云存储和排行榜，可作为纯静态网站部署到支持的平台。

### 游戏机制
- 🔄 精心设计的三阶段难度系统 (适用于无尽模式)
  - **初始难度 (0-15分)**: 友好的入门体验，管道间隙220像素，速度2.5
  - **中等难度 (15-60分)**: 适中的挑战，管道间隙180像素，速度3.0
  - **最终难度 (60分以上)**: 均衡挑战，管道间隙120像素，速度3.0
- 🎯 每5分增加一次难度，平滑的难度提升曲线
- 🌟 公平的判定系统：提供一定的容错空间，优化游戏体验
- 📈 管道高度变化动态调整：初级±200像素，中级±400像素，高级±600像素
- ⏱️ 管道生成频率渐进式调整：2000ms→1600ms→1400ms
- 📅 **每日挑战**：使用基于日期的随机种子生成固定关卡，共50个管道，难度固定在中等水平开始。

## 如何游玩

### 控制方式
- 💻 **桌面设备**：点击屏幕或按空格键使小鸟向上飞
- 📱 **移动设备**：轻触屏幕使小鸟向上飞

### 游戏目标
1.  引导小鸟穿过管道之间的间隙。
2.  **无尽模式**: 
    *   每成功通过一对管道得1分。
    *   尽可能获得高分，挑战更高的难度。
    *   当分数足够高（打破个人记录且能进入全球排行榜前20）时，可以提交成绩。
3.  **每日挑战**：
    *   成功通过全部50个管道，获得50分即为挑战成功。
    *   挑战成功或失败后，分数会被记录到当天的每日挑战排行榜（如果满足提交条件）。

## 技术实现

### 前端技术
- ⚡️ 纯原生JavaScript (ES6+)，无需任何框架
- 🎨 HTML5 Canvas进行高性能游戏渲染
- 🔄 `requestAnimationFrame` 实现平滑游戏循环
- 📱 响应式设计，适配各种设备和屏幕方向
- 💾 `localStorage` 保存本地最高分记录 (区分无尽模式和每日挑战模式)
- ⚙️ 根据构建目标选择后端实现 (Vercel API 或 SCE SDK)
- 📦 使用 Webpack 进行 JavaScript 模块打包

### 后端技术
- **Vercel 版本后端 (Vercel Serverless Functions)**:
  - ☁️ Vercel 托管和 Serverless Functions 部署
  - 📊 **数据库**: 使用 Vercel KV (基于 Redis) 存储全球排行榜数据。
  - 🔌 **API 接口** (`/api/`):
    - `game-config`: 获取游戏配置参数。
    - `get-scores`: 获取排行榜前20名数据。
    - `submit-score`: 提交玩家分数到排行榜。
    - `verify-admin`: 验证管理员密码。
    - `clear-leaderboard`: 清空排行榜数据。
- **SCE 版本后端**: 
  - ✨ 使用 [SCE SDK](https://www.npmjs.com/package/sce-game-sdk) 直接与星火对战平台服务交互，实现登录、数据存取和排行榜功能。

### 性能优化
- 🚀 高效的碰撞检测算法
- 🧹 自动清理屏幕外的游戏对象减少内存占用
- 📊 动态调整游戏参数以适应不同设备性能

## 环境配置 (SCE 版本)

如果你需要构建或测试 SCE 版本，需要在项目根目录创建一个 `.env` 文件，并配置以下环境变量：

```dotenv
# .env 文件内容

# 构建目标，用于本地构建 SCE 版本时设置为 'sce'
BUILD_TARGET=sce

# 你的 SCE 开发者令牌
# !! 请替换为你的真实令牌 !!
SCE_DEVELOPER_TOKEN=YOUR_DEVELOPER_TOKEN_HERE
```

**重要提示：** `.env` 文件已被添加到 `.gitignore` 中，请不要将其提交到版本控制系统，以保护你的开发者令牌。

## 构建项目

由于项目现在使用了 JavaScript 模块和 npm 包 (SCE SDK)，你需要先构建项目才能运行。

1.  **安装依赖**: 
    ```bash
    npm install
    ```
2.  **构建不同版本**:
    *   **构建 SCE 版本** (用于本地测试或静态部署):
      ```bash
      # 确保 .env 文件中 BUILD_TARGET=sce 并已配置 SCE_DEVELOPER_TOKEN
      npm run build 
      ```
      这将生成包含 SCE SDK 逻辑的 `dist/bundle.js` 文件。

    *   **构建 Vercel 版本** (用于部署到 Vercel 或本地测试模拟 API):
      ```bash
      npm run build:vercel
      ```
      这将生成包含调用 `/api/` 接口逻辑的 `dist/bundle.js` 文件。

## 本地开发与测试

1.  克隆仓库
    ```bash
    git clone https://github.com/dashhuang/game-flappy-bird.git
    cd game-flappy-bird
    ```

2.  安装依赖
    ```bash
    npm install
    ```

3.  **测试 Vercel 版本 (带模拟 API)**:
    *   首先，构建 Vercel 版本的前端代码:
      ```bash
      npm run build:vercel 
      ```
    *   然后，启动本地开发服务器 (包含模拟 API):
      ```bash
      npm run dev
      ```
    *   在浏览器中访问 `http://localhost:3000`。这个模式会使用 `server.js` 模拟 Vercel 的 API 接口，方便测试 Vercel 版本的排行榜和分数提交逻辑。

4.  **测试 SCE 版本 (纯静态)**:
    *   确保你已经在 `.env` 文件中正确配置了 `BUILD_TARGET=sce` 和 `SCE_DEVELOPER_TOKEN`。
    *   构建 SCE 版本:
      ```bash
      npm run build
      ```
    *   使用一个简单的静态文件服务器启动项目 (例如 `http-server`):
      ```bash
      # 如果未安装 http-server: npm install --global http-server
      npx http-server . -p 8080 
      ```
    *   在浏览器中访问 `http://localhost:8080`。这个模式会直接与 SCE 平台交互进行登录和排行榜操作。

**注意**: `server.js` 仅用于模拟 Vercel API，不包含 SCE SDK 逻辑。

## 部署

### 部署到 Vercel (Vercel 版本)

项目已配置为自动部署 Vercel 版本到 Vercel：
1.  推送到主分支的代码将自动触发 Vercel 部署。
2.  Vercel 会自动运行 `npm install` 和 `npm run build:vercel` 命令。
3.  排行榜功能依赖于 Vercel KV (需要在 Vercel 项目设置中创建并连接 KV 数据库)。
4.  管理功能 (清空排行榜) 需要在 Vercel 项目中设置名为 `ADMIN_PASSWORD` 的环境变量。

`vercel.json` 文件配置了构建命令、静态文件服务和 API 路由。

### 部署 SCE 版本 (静态部署)

1.  确保在构建环境中设置了正确的 `SCE_DEVELOPER_TOKEN` 环境变量。
2.  运行 SCE 构建命令: `npm run build`。
3.  将项目根目录下的**静态文件**部署到任何支持静态网站托管的平台。需要部署的文件包括：
    *   `index.html`
    *   `css/style.css`
    *   `assets/` 目录下的所有资源
    *   构建生成的 `dist/bundle.js` 文件
    *   (可选) `admin.html` (如果你的部署平台支持 Vercel 相关的管理功能环境变量)

## 管理功能

项目包含一个简单的管理页面 `admin.html` (访问 `/admin.html`)。

- **登录**: 需要输入在 Vercel 环境变量中设置的 `ADMIN_PASSWORD` 进行登录。
- **清空排行榜**: 登录后可以清空 **Vercel KV** 中的所有排行榜数据。**此操作不可逆，请谨慎使用！** (此功能仅对 Vercel 版本有效)

## 支持的浏览器

- ✅ Chrome / Edge (推荐)
- ✅ Firefox
- ✅ Safari
- ✅ iOS Safari / Android Chrome

## 贡献指南

欢迎提交 Pull Request 或 Issue！如有功能建议或 bug 报告，请在 GitHub 上提交 Issue。

## 许可

MIT License

---

开发者: [dashhuang](https://github.com/dashhuang)
