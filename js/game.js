/**
 * Flappy Bird 游戏
 * 具有响应式设计，支持桌面和移动设备，横屏和竖屏模式
 */

// 修复移动设备100vh问题
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

// 初始设置和窗口大小变化时更新
setViewportHeight();
window.addEventListener('resize', setViewportHeight);
window.addEventListener('orientationchange', () => {
    // iOS上方向变化后需要延迟更新
    setTimeout(setViewportHeight, 100);
});

// 游戏状态
const GAME_STATE = {
    MENU: 0,
    PLAYING: 1,
    GAME_OVER: 2,
    LOADING: 3,  // 加载状态
    VICTORY: 4   // 胜利状态（挑战模式完成）
};

// 游戏模式
const GAME_MODE = {
    ENDLESS: 0,  // 无尽模式
    DAILY_CHALLENGE: 1  // 每日挑战模式
};

// 游戏各种延迟时间常量（单位：毫秒）
const GAME_OVER_DELAY = 500; // 游戏结束后按钮显示的延迟时间

// 旗子颜色列表
const FLAG_COLORS = [
    // 原有10种颜色
    '#E74C3C', // 红色
    '#3498DB', // 蓝色
    '#F1C40F', // 黄色
    '#9B59B6', // 紫色
    '#2ECC71', // 翠绿色
    '#E67E22', // 橙色
    '#1ABC9C', // 青色
    '#EC407A', // 粉色
    '#BDC3C7', // 浅灰色
    '#F39C12', // 琥珀色
    
    // 新增10种颜色
    '#16A085', // 深青色
    '#27AE60', // 森林绿
    '#2980B9', // 钢蓝色
    '#8E44AD', // 深紫色
    '#D35400', // 深橙色
    '#C0392B', // 深红色
    '#7F8C8D', // 深灰色
    '#2C3E50', // 深蓝灰
    '#FFC300', // 金黄色
    '#FF5733'  // 珊瑚红
];

// 简单的字符串哈希函数 (用于名字到颜色的映射)
function simpleStringHash(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

// 游戏类
class FlappyBirdGame {
    constructor() {
        // 游戏版本和配置状态
        this.gameVersion = "1.0.0";
        this.isConfigLoaded = false;
        this.configLastChecked = 0;
        this.configCheckInterval = 60000; // 每分钟检查一次配置更新
        
        // 使用帧率独立的物理计算
        this.useFrameRateIndependentPhysics = true;
        this.physicsDeltaTime = 1000 / 60; // 基于60FPS的物理更新时间
        
        // 防止渲染闪烁的标志
        this.isRendering = false;
        
        // 游戏模式
        this.gameMode = GAME_MODE.ENDLESS;
        
        // 每日挑战特定参数
        this.dailyChallengeSeed = this.generateDailySeed();
        this.maxDailyChallengePipes = 50;
        this.pipeCount = 0;
        this.currentChallengeDate = this.getCurrentChallengeDate();
        
        // 分数存储 - 区分不同模式
        this.endlessHighScore = localStorage.getItem('flappyBirdEndlessHighScore') || 0;
        this.challengeHighScore = this.getChallengeHighScore();
        
        // 初始化默认配置（用于回退）
        this.initDefaultConfig();
        
        // 从服务器加载配置
        this.loadGameConfig();
        
        // 初始化游戏画布
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // 检测是否为移动设备
        this.isMobile = window.navigator.userAgent.match(/Mobile|Android|iPhone|iPad|iPod/i);
        
        // 初始化UI元素
        this.startScreen = document.getElementById('start-screen');
        this.gameOverScreen = document.getElementById('game-over-screen');
        this.scoreDisplay = document.getElementById('score-display');
        this.finalScore = document.getElementById('final-score');
        this.highScoreDisplay = document.getElementById('high-score');
        this.loadingScreen = document.getElementById('loading-screen');
        
        // 设置游戏状态
        this.gameState = GAME_STATE.LOADING;
        
        // 游戏数据初始化
        this.pipes = [];
        this.score = 0;
        this.highScore = localStorage.getItem('flappyBirdHighScore') || 0;
        this.initialHighScore = this.highScore;
        this.leaderboardData = [];
        // 新增：存储排行榜墓碑位置信息
        this.tombstones = [];
        this.scoreThreshold = 10; // 修改阈值从2改为10
        this.leaderboardUpdated = false;
        this.scoreSubmitted = false;
        this.gameJustEnded = false;
        this.canRestartAfterGameOver = true;
        this.lastPipeSpawn = 0;
        this.scoreDisplayed = false;
        this.animationFrameId = null;
        
        // 小鸟旋转平滑过渡参数
        this.rotationSpeed = 0.15; // 旋转速度因子（0-1之间，越大越快）
        
        // 设置事件监听
        this.setupEventListeners();
        
        // 启动配置检查定时器
        this.startConfigCheckTimer();
        
        // 在后台加载排行榜数据 - 移除这行，避免游戏启动就加载排行榜
        // this.loadLeaderboardInBackground();
        
        // 初始化游戏循环
        this.lastTime = 0;
        requestAnimationFrame((t) => this.loop(t));
        
        // 新增：记录生成的管道对总数
        this.pipePairSpawnCount = 0;
    }
    
    // 设置事件监听器
    setupEventListeners() {
        // 键盘事件
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                if (this.gameState === GAME_STATE.MENU) {
                    // 移除直接开始，改为等待用户选择模式
                    // this.startGame();
                } else if (this.gameState === GAME_STATE.PLAYING) {
                    this.flapBird();
                } else if (this.gameState === GAME_STATE.GAME_OVER && this.canRestartAfterGameOver) {
                    this.resetGame();
                    this.startGame();
                } else if (this.gameState === GAME_STATE.VICTORY) {
                    this.resetGame();
                    this.startGame();
                }
            }
        });
        
        // 鼠标按下事件 - 替换click事件
        this.canvas.addEventListener('mousedown', () => {
            if (this.gameState === GAME_STATE.MENU) {
                // 不做任何操作，让用户选择模式
            } else if (this.gameState === GAME_STATE.PLAYING) {
                this.flapBird();
            } else if (this.gameState === GAME_STATE.GAME_OVER && this.canRestartAfterGameOver) {
                this.resetGame();
                this.startGame();
            } else if (this.gameState === GAME_STATE.VICTORY) {
                this.resetGame();
                this.startGame();
            }
        });
        
        // 触摸开始事件 - 为移动设备
        this.canvas.addEventListener('touchstart', (e) => {
            // 防止触摸事件同时触发鼠标事件
            e.preventDefault();
            
            if (this.gameState === GAME_STATE.MENU) {
                // 不做任何操作，让用户选择模式
            } else if (this.gameState === GAME_STATE.PLAYING) {
                this.flapBird();
            } else if (this.gameState === GAME_STATE.GAME_OVER && this.canRestartAfterGameOver) {
                this.resetGame();
                this.startGame();
            } else if (this.gameState === GAME_STATE.VICTORY) {
                this.resetGame();
                this.startGame();
            }
        }, { passive: false });
        
        // 无尽模式按钮
        document.getElementById('endless-mode-button').addEventListener('click', () => {
            // 先保存当前模式，检查是否从每日挑战切换过来
            const wasInDailyChallenge = this.gameMode === GAME_MODE.DAILY_CHALLENGE;
            
            // 设置为无尽模式
            this.gameMode = GAME_MODE.ENDLESS;
            
            // 如果是从每日挑战切换过来，重置相关数据
            if (wasInDailyChallenge) {
                // 清空旗子数据，强制重新加载
                this.tombstones = [];
                this.leaderboardUpdated = false;
                
                // 立即加载无尽模式排行榜并强制处理，确保旗子正确显示
                this.loadLeaderboardInBackground(true);
            }
            
            // 开始游戏
            this.startGame();
        });
        
        // 每日挑战按钮
        document.getElementById('daily-challenge-button').addEventListener('click', () => {
            // 先保存当前模式，检查是否从无尽模式切换过来
            const wasInEndlessMode = this.gameMode === GAME_MODE.ENDLESS;
            
            // 设置为每日挑战模式
            this.gameMode = GAME_MODE.DAILY_CHALLENGE;
            
            // 重置种子以确保每次开始挑战时使用相同的随机序列
            this.resetDailyChallengeSeed();
            
            // 如果是从无尽模式切换过来，强制加载每日挑战排行榜
            if (wasInEndlessMode) {
                // tombstones和leaderboardUpdated已在resetDailyChallengeSeed重置
                // 立即加载每日挑战排行榜并强制处理
                this.loadLeaderboardInBackground(true);
            }
            
            // 重置管道计数
            this.pipeCount = 0;
            this.startGame();
        });
        
        // 重新开始按钮
        document.getElementById('restart-button').addEventListener('click', () => {
            // 只有在允许重新开始的情况下才能点击
            if (this.canRestartAfterGameOver) {
                this.resetGame();
                this.startGame();
            }
        });
        
        // 胜利界面的重新开始按钮
        document.getElementById('victory-restart-button').addEventListener('click', () => {
            this.resetGame();
            this.startGame();
        });
        
        // 胜利界面返回主菜单按钮
        document.getElementById('back-to-menu-button').addEventListener('click', () => {
            this.resetGame();
            this.showMainMenu();
        });
        
        // 游戏结束界面返回主菜单按钮
        document.getElementById('back-to-menu-button-gameover').addEventListener('click', () => {
            this.resetGame();
            this.showMainMenu();
        });
        
        // 提交分数按钮
        document.getElementById('submit-score-button').addEventListener('click', () => {
            this.submitScore();
        });
        
        // 关闭更新通知按钮
        const closeNotificationButton = document.getElementById('close-notification');
        if (closeNotificationButton) {
            closeNotificationButton.addEventListener('click', () => {
                const notification = document.getElementById('update-notification');
                if (notification) {
                    notification.style.display = 'none';
                }
            });
        }
        
        // 窗口大小改变
        window.addEventListener('resize', () => {
            this.handleResize();
        });
        
        // 屏幕方向变化
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.handleResize(), 100);
        });
    }
    
    // 处理窗口大小改变
    handleResize() {
        // 更新视口高度变量
        setViewportHeight();
        
        // 获取视窗的实际尺寸
        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;
        
        // 设置canvas尺寸
        this.canvas.width = viewWidth;
        this.canvas.height = viewHeight;
        
        // 重新计算鸟的位置
        this.bird.x = viewWidth / 3;
        
        // 如果在菜单状态，重置鸟的位置
        if (this.gameState === GAME_STATE.MENU) {
            this.bird.y = viewHeight / 2;
        }
        
        // 对于移动设备，进行额外的调整
        this.adjustForMobile();
    }
    
    // 更新控制提示显示
    updateControlsDisplay() {
        const desktopControls = document.getElementById('desktop-controls');
        const mobileControls = document.getElementById('mobile-controls');
        
        if (this.isMobile) {
            // 移动设备：隐藏桌面提示，显示移动提示
            if (desktopControls) desktopControls.style.display = 'none';
            if (mobileControls) mobileControls.style.display = 'block';
        } else {
            // 桌面设备：显示桌面提示，隐藏移动提示
            if (desktopControls) desktopControls.style.display = 'block';
            if (mobileControls) mobileControls.style.display = 'none';
        }
    }
    
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
            
            // 处理iOS Safari额外问题
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIOS) {
                // 添加iOS特定处理
                window.addEventListener('focusout', function() {
                    // 当软键盘收起时
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
        }
    }
    
    // 开始游戏
    startGame() {
        this.gameState = GAME_STATE.PLAYING;
        this.startScreen.style.display = 'none';
        this.gameOverScreen.style.display = 'none';
        document.getElementById('victory-screen').style.display = 'none';
        this.scoreDisplay.style.display = 'block';
        
        // 记录游戏开始时的最高分 - 基于当前模式
        this.initialHighScore = this.getCurrentModeHighScore();
        
        // 确保提交状态重置
        this.scoreSubmitted = false;
        
        // 重置提交按钮状态
        const submitButton = document.getElementById('submit-score-button');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = '提交分数';
        }
        
        // 不需要每次开始游戏都重新加载排行榜数据
        // 在切换游戏模式时已经处理了排行榜加载
        // this.loadLeaderboardInBackground();
        
        // 根据游戏模式设置难度
        if (this.gameMode === GAME_MODE.DAILY_CHALLENGE) {
            // 每日挑战从中等难度开始
            this.startDailyChallenge();
        }
    }
    
    // 获取当前模式的最高分
    getCurrentModeHighScore() {
        return this.gameMode === GAME_MODE.ENDLESS ? this.endlessHighScore : this.challengeHighScore;
    }
    
    // 更新当前模式的最高分
    updateCurrentModeHighScore(score) {
        if (this.gameMode === GAME_MODE.ENDLESS) {
            // 无尽模式
            if (score > this.endlessHighScore) {
                this.endlessHighScore = score;
                localStorage.setItem('flappyBirdEndlessHighScore', score);
                return true; // 表示更新了最高分
            }
        } else {
            // 每日挑战模式 - 按日期存储
            if (score > this.challengeHighScore) {
                this.challengeHighScore = score;
                localStorage.setItem(`flappyBirdChallengeHighScore_${this.currentChallengeDate}`, score);
                return true; // 表示更新了最高分
            }
        }
        return false; // 表示没有更新最高分
    }
    
    // 设置每日挑战的初始状态
    startDailyChallenge() {
        // 从中等难度开始
        const mediumDifficultyFactor = {
            stage: 1,
            progress: 0
        };
        
        // 设置难度参数为中等难度
        this.currentPipeGap = this.PIPE_GAP_MEDIUM;
        this.currentPipeSpawnInterval = this.PIPE_SPAWN_INTERVAL_MEDIUM;
        this.currentPipeSpeed = this.PIPE_SPEED_MEDIUM;
    }
    
    // 生成基于日期的种子
    generateDailySeed() {
        const today = this.getCurrentChallengeDate();
        const [year, month, day] = today.split('-').map(Number);
        return year * 10000 + month * 100 + day;
    }
    
    // 获取北京时间（GMT+8）的日期字符串（YYYY-MM-DD格式）
    getCurrentChallengeDate() {
        const now = new Date();
        const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const year = beijingTime.getUTCFullYear();
        const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
        const day = String(beijingTime.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    // 获取当前日期的每日挑战高分
    getChallengeHighScore() {
        const date = this.currentChallengeDate;
        return localStorage.getItem(`flappyBirdChallengeHighScore_${date}`) || 0;
    }
    
    // 重置每日挑战的随机种子
    resetDailyChallengeSeed() {
        // 更新当前挑战日期
        this.currentChallengeDate = this.getCurrentChallengeDate();
        // 重新获取当前日期的高分
        this.challengeHighScore = this.getChallengeHighScore();
        // 生成种子
        this.dailyChallengeSeed = this.generateDailySeed();
        this.seededRandom = this.mulberry32(this.dailyChallengeSeed);
        
        // 重置旗子数据，确保加载正确的每日挑战旗子
        this.tombstones = [];
        // 重置排行榜更新标志，确保可以加载新数据
        this.leaderboardUpdated = false;
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
    
    // 使用种子生成随机数
    getSeededRandom(min, max) {
        if (!this.seededRandom) {
            this.seededRandom = this.mulberry32(this.dailyChallengeSeed);
        }
        return min + this.seededRandom() * (max - min);
    }
    
    // 显示主菜单
    showMainMenu() {
        this.gameState = GAME_STATE.MENU;
        this.startScreen.style.display = 'flex';
        this.gameOverScreen.style.display = 'none';
        document.getElementById('victory-screen').style.display = 'none';
        this.scoreDisplay.style.display = 'none';
        
        // 如果排行榜数据还未加载，则加载数据以显示在主菜单
        if (!this.leaderboardData || this.leaderboardData.length === 0) {
            console.log("在主菜单加载排行榜数据...");
            this.loadLeaderboardInBackground(true);
        }
    }
    
    // 显示胜利界面
    showVictoryScreen() {
        this.gameState = GAME_STATE.VICTORY;
        document.getElementById('victory-screen').style.display = 'flex';
        document.getElementById('victory-score').textContent = this.score;
        
        // 显示当前游戏模式和日期
        const victoryModeDisplay = document.getElementById('victory-mode-display');
        const victoryDateDisplay = document.getElementById('victory-date-display');
        
        if (victoryModeDisplay) {
            victoryModeDisplay.textContent = '每日挑战';
        }
        
        if (victoryDateDisplay) {
            victoryDateDisplay.textContent = this.currentChallengeDate;
        }
        
        // 获取并显示当前模式的最高分
        const highScoreDisplay = document.getElementById('victory-high-score');
        if (highScoreDisplay) {
            highScoreDisplay.textContent = this.challengeHighScore;
        }
        
        this.gameOverScreen.style.display = 'none';
        
        // 更新最高分
        this.updateCurrentModeHighScore(this.score);
    }
    
    // 游戏结束
    gameOver() {
        this.gameState = GAME_STATE.GAME_OVER;
        this.gameOverScreen.style.display = 'flex';
        this.finalScore.textContent = this.score;
        
        // 在游戏结束且分数超过阈值时加载排行榜数据
        if (this.score >= this.scoreThreshold && !this.leaderboardUpdated) {
            this.leaderboardUpdated = true;
            console.log(`游戏结束，分数(${this.score})超过${this.scoreThreshold}分，更新排行榜数据`);
            this.loadLeaderboardInBackground();
        }
        
        // 获取并显示当前模式的最高分
        const currentHighScore = this.getCurrentModeHighScore();
        this.highScoreDisplay.textContent = currentHighScore;
        
        // 显示当前游戏模式和日期
        const modeDisplay = document.getElementById('game-mode-display');
        const dateDisplay = document.getElementById('challenge-date-display');
        
        if (modeDisplay) {
            modeDisplay.textContent = this.gameMode === GAME_MODE.ENDLESS ? '无尽模式' : '每日挑战';
        }
        
        // 如果是每日挑战模式，显示日期
        if (dateDisplay) {
            if (this.gameMode === GAME_MODE.DAILY_CHALLENGE) {
                dateDisplay.textContent = this.currentChallengeDate;
                dateDisplay.parentElement.style.display = 'block';
            } else {
                dateDisplay.parentElement.style.display = 'none';
            }
        }
        
        // 默认隐藏名字输入框
        document.getElementById('name-input-container').style.display = 'none';
        
        // 确保按钮容器可见但内容不可见（保留布局空间）
        const buttonContainer = document.querySelector('.restart-button-container');
        if (buttonContainer) {
            buttonContainer.style.visibility = 'hidden';
            // 确保按钮容器已经显示（防止初次加载时没有正确显示）
            buttonContainer.style.display = 'flex';
        }
        
        // 设置游戏刚刚结束的标志
        this.gameJustEnded = true;
        this.canRestartAfterGameOver = false;
        
        // 检查玩家分数是否满足条件
        this.checkIfScoreQualifies();
        
        // 显示当前模式的排行榜数据
        this.displayLeaderboard(this.getLeaderboardForCurrentMode());
        
        // 检查是否需要延迟显示按钮
        const needsDelay = this.shouldDelayButtons();
        
        if (needsDelay) {
            // 有资格提交分数时，延迟显示按钮
            setTimeout(() => {
                this.showGameOverButtons(buttonContainer);
            }, GAME_OVER_DELAY);
        } else {
            // 没有资格提交分数时，立即显示按钮
            this.showGameOverButtons(buttonContainer);
        }
    }
    
    // 显示游戏结束按钮
    showGameOverButtons(buttonContainer) {
        // 显示按钮（使用visibility而不是display）
        if (buttonContainer) {
            buttonContainer.style.visibility = 'visible';
            
            // 移动设备上，确保"再玩一次"按钮可见
            if (this.isMobile) {
                // 滚动到底部确保按钮可见
                const gameOverScreen = document.getElementById('game-over-screen');
                const restartButton = document.getElementById('restart-button');
                
                // 如果内容过长，确保按钮可见
                if (gameOverScreen.scrollHeight > gameOverScreen.clientHeight) {
                    // 将按钮放到可视范围内
                    restartButton.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }
            }
        }
        
        this.canRestartAfterGameOver = true;
        this.gameJustEnded = false;
    }
    
    // 判断是否需要延迟显示按钮
    shouldDelayButtons() {
        // 如果分数已提交，不需要延迟
        if (this.scoreSubmitted) {
            return false;
        }
        
        // 检查是否打破最高分且能进入前20名
        const beatsPersonalBest = this.score > this.initialHighScore;
        const canEnterTopTwenty = this.isTopTwentyScore(this.score);
        
        // 只有当同时满足两个条件时才需要延迟
        return beatsPersonalBest && canEnterTopTwenty;
    }
    
    // 检查分数是否有资格提交
    checkIfScoreQualifies() {
        // 重置提交按钮状态，防止状态残留
        const submitButton = document.getElementById('submit-score-button');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = '提交分数';
        }
        
        // 如果分数已经提交过，不再显示提交界面
        if (this.scoreSubmitted) {
            document.getElementById('name-input-container').style.display = 'none';
            return;
        }
        
        // 首先检查是否严格超过了游戏开始时的最高分（而非当前最高分）
        const beatsPersonalBest = this.score > this.initialHighScore;
        
        // 检查是否能进入当前模式的全球排行榜前20
        const canEnterTopTwenty = this.isTopTwentyScore(this.score);
        
        console.log(`分数检查 - 当前: ${this.score}, 初始最高分: ${this.initialHighScore}, 当前最高分: ${this.getCurrentModeHighScore()}, 超过最高分: ${beatsPersonalBest}, 能进前20: ${canEnterTopTwenty}`);
        
        // 更新当前模式的最高分
        this.updateCurrentModeHighScore(this.score);
        
        // 显示或隐藏提交界面
        const nameInputContainer = document.getElementById('name-input-container');
        
        // 只有当两个条件都满足时才显示提交界面：1.严格打破最高分 2.能进入前20
        if (beatsPersonalBest && canEnterTopTwenty) {
            nameInputContainer.style.display = 'block';
            console.log('显示提交成绩界面：打破最高分并且能进入前20');
        } else {
            nameInputContainer.style.display = 'none';
            if (!beatsPersonalBest) {
                console.log('不显示提交界面：未打破最高分');
            } else if (!canEnterTopTwenty) {
                console.log('不显示提交界面：无法进入前20');
            }
        }
    }
    
    // 获取当前模式的排行榜数据
    getLeaderboardForCurrentMode() {
        if (!this.leaderboardData || !Array.isArray(this.leaderboardData)) {
            return [];
        }
        
        // 根据当前模式筛选排行榜数据
        let filteredData = this.leaderboardData.filter(entry => 
            entry.mode === (this.gameMode === GAME_MODE.ENDLESS ? 'endless' : 'challenge')
        );
        
        // 如果是每日挑战模式，还需要按日期筛选
        if (this.gameMode === GAME_MODE.DAILY_CHALLENGE) {
            filteredData = filteredData.filter(entry => {
                // 添加调试日志
                if (this.currentChallengeDate && entry.date !== this.currentChallengeDate) {
                    console.log(`日期不匹配: 需要${this.currentChallengeDate}, 实际${entry.date || '未设置'}`);
                }
                return entry.date === this.currentChallengeDate;
            });
            
            // 如果日期筛选后没有数据，可能是API中没有date字段，取消日期筛选
            if (filteredData.length === 0) {
                console.log(`警告: 每日挑战模式按日期筛选后没有数据，尝试使用所有挑战模式数据`);
                filteredData = this.leaderboardData.filter(entry => 
                    entry.mode === 'challenge'
                );
            }
        }
        
        return filteredData;
    }
    
    // 检查分数是否能进入前20名
    isTopTwentyScore(score) {
        // 获取当前模式的排行榜数据
        const modeLeaderboard = this.getLeaderboardForCurrentMode();
        
        // 排行榜为空或没有数据的情况
        if (!modeLeaderboard || modeLeaderboard.length === 0) {
            // 如果排行榜数据还没加载或为空，任何非零分数都可以提交
            return score > 0;
        }
        
        // 如果排行榜还没有20个记录，任何非零分数都可以进入
        if (modeLeaderboard.length < 20) {
            return score > 0;
        }
        
        try {
            // 检查分数是否大于排行榜中最低的分数
            // 获取排行榜的最低分
            const sortedScores = [...modeLeaderboard]
                .sort((a, b) => parseInt(b.score) - parseInt(a.score));
            
            // 安全地获取第20名的分数，防止undefined
            const lowestTopScore = sortedScores.length >= 20 ? 
                parseInt(sortedScores[19].score) : 0;
            
            return score > lowestTopScore;
        } catch (error) {
            console.error('比较排行榜分数时出错:', error);
            // 出错时保守处理，允许提交
            return true;
        }
    }
    
    // 重置游戏
    resetGame() {
        this.bird = {
            x: this.canvas.width / 3,
            y: this.canvas.height / 2,
            width: this.BIRD_WIDTH,
            height: this.BIRD_HEIGHT,
            velocity: 0,
            rotation: 0,
            targetRotation: 0 // 添加目标旋转角度
        };
        
        this.pipes = [];
        this.score = 0;
        this.pipesPassedCount = 0;
        this.updateScore();
        this.lastPipeSpawn = 0;
        
        // 重置难度
        this.currentPipeGap = this.PIPE_GAP_INITIAL;
        this.currentPipeSpawnInterval = this.PIPE_SPAWN_INTERVAL_INITIAL;
        this.currentPipeSpeed = this.PIPE_SPEED_INITIAL;
        
        // 如果是每日挑战模式，重置管道计数并设置中等难度
        if (this.gameMode === GAME_MODE.DAILY_CHALLENGE) {
            this.pipeCount = 0;
            this.resetDailyChallengeSeed();
            this.currentPipeGap = this.PIPE_GAP_MEDIUM;
            this.currentPipeSpawnInterval = this.PIPE_SPAWN_INTERVAL_MEDIUM;
            this.currentPipeSpeed = this.PIPE_SPEED_MEDIUM;
            
            // 重新加载每日挑战模式的排行榜数据
            this.loadLeaderboardInBackground(true);
        } else {
            // 重置旗子的放置状态，使它们能在新游戏中再次生成
            if (this.tombstones && this.tombstones.length > 0) {
                this.tombstones.forEach(tombstone => {
                    tombstone.placed = false;
                });
            }
        }
        
        // 重置排行榜检查点状态
        this.leaderboardUpdated = false;
        // 重置分数提交状态
        this.scoreSubmitted = false;
        
        // 重置提交按钮状态 - 修复Bug
        const submitButton = document.getElementById('submit-score-button');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = '提交分数';
        }
        
        // 记录当前的最高分
        this.initialHighScore = this.getCurrentModeHighScore();
        
        // 随机生成新颜色
        this.birdColor = this.getRandomColor();
        this.pipeColors = this.generatePipeColors();
        
        // 新增：重置管道对计数器
        this.pipePairSpawnCount = 0;
    }
    
    // 小鸟跳跃
    flapBird() {
        if (this.gameState === GAME_STATE.PLAYING) {
            // 使用帧率独立的跳跃力量
            if (this.useFrameRateIndependentPhysics) {
                this.bird.velocity = this.FLAP_POWER;
            } else {
                this.bird.velocity = this.FLAP_POWER;
            }
            
            // 设置目标旋转角度为向上姿态
            this.bird.targetRotation = -20;
        } else if (this.gameState === GAME_STATE.MENU) {
            this.startGame();
        } else if (this.gameState === GAME_STATE.GAME_OVER && this.canRestartAfterGameOver && !this.gameJustEnded) {
            this.resetGame();
            this.startGame();
        }
    }
    
    // 更新游戏状态 - 修改为基于时间的物理计算
    update(deltaTime) {
        if (this.gameState !== GAME_STATE.PLAYING) return;
        
        // 转换为帧率独立的物理计算
        const dt = this.useFrameRateIndependentPhysics ? deltaTime / this.physicsDeltaTime : 1;
        
        // 使用时间步长来更新物理
        this.bird.velocity += this.GRAVITY * dt;
        this.bird.y += this.bird.velocity * dt;
        
        // 计算小鸟旋转的目标角度（根据速度）
        if (this.bird.velocity < 0) {
            // 向上飞行
            this.bird.targetRotation = -20;
        } else {
            // 向下坠落 - 角度随速度变化，但最大为90度
            this.bird.targetRotation = Math.min(90, this.bird.velocity * 2);
        }
        
        // 平滑旋转过渡 - 使用线性插值(lerp)
        // 如果尚未设置targetRotation，则初始化为当前rotation
        if (this.bird.targetRotation === undefined) {
            this.bird.targetRotation = this.bird.rotation || 0;
        }
        
        // 计算当前旋转角度与目标角度之间的差值
        const rotationDiff = this.bird.targetRotation - this.bird.rotation;
        
        // 根据旋转速度和帧率独立性计算本帧的旋转变化量
        const rotationChange = rotationDiff * this.rotationSpeed * dt;
        
        // 更新当前旋转角度
        this.bird.rotation += rotationChange;
        
        // 碰到天花板或地面时结束游戏
        if (this.bird.y < 0 || this.bird.y + this.bird.height > this.canvas.height - this.GROUND_HEIGHT) {
            this.gameOver();
            return;
        }
        
        // 生成管道
        if (Date.now() - this.lastPipeSpawn > this.currentPipeSpawnInterval) {
            // 每日挑战模式下，检查是否达到管道上限
            if (this.gameMode === GAME_MODE.DAILY_CHALLENGE) {
                if (this.pipeCount < this.maxDailyChallengePipes) {
                    this.spawnPipe();
                    this.pipeCount++;
                    this.lastPipeSpawn = Date.now();
                }
            } else {
                // 无尽模式，正常生成管道
                this.spawnPipe();
                this.lastPipeSpawn = Date.now();
            }
        }
        
        // 更新管道位置
        for (const pipe of this.pipes) {
            // 使用帧率独立的速度更新
            pipe.x -= this.currentPipeSpeed * dt;
            
            // 碰撞检测
            if (this.checkCollision(this.bird, pipe)) {
                this.gameOver();
                return;
            }
            
            // 检查是否通过管道 - 只对上管道(isTop为true)加分，避免一组管道加2分
            if (!pipe.passed && pipe.x + this.PIPE_WIDTH < this.bird.x) {
                pipe.passed = true;
                
                // 只对上管道加分，确保每组管道只加1分
                if (pipe.isTop) {
                    this.score++;
                    this.updateScore();
                    this.pipesPassedCount++;
                    
                    // 每日挑战模式下的通关判断
                    if (this.gameMode === GAME_MODE.DAILY_CHALLENGE && this.pipeCount >= this.maxDailyChallengePipes && this.pipesPassedCount >= this.maxDailyChallengePipes) {
                        this.showVictoryScreen();
                        return;
                    }
                    
                    // 每日挑战模式下的难度调整
                    if (this.gameMode === GAME_MODE.DAILY_CHALLENGE) {
                        // 40分后达到最高难度
                        const progressToMax = Math.min(1, this.score / 40);
                        
                        // 根据进度计算难度
                        this.currentPipeGap = this.PIPE_GAP_MEDIUM - progressToMax * (this.PIPE_GAP_MEDIUM - this.PIPE_GAP_FINAL);
                        this.currentPipeSpeed = this.PIPE_SPEED_MEDIUM + progressToMax * (this.PIPE_SPEED_FINAL - this.PIPE_SPEED_MEDIUM);
                        this.currentPipeSpawnInterval = this.PIPE_SPAWN_INTERVAL_MEDIUM - progressToMax * (this.PIPE_SPAWN_INTERVAL_MEDIUM - this.PIPE_SPAWN_INTERVAL_FINAL);
                    } else {
                        // 无尽模式下的难度调整
                        // 每SCORE_DIFFICULTY_STEP分增加一次难度
                        if (this.score % this.SCORE_DIFFICULTY_STEP === 0) {
                            console.log(`达到难度增加点！(每${this.SCORE_DIFFICULTY_STEP}分)`);
                            this.increaseDifficulty();
                        }
                    }
                    
                    // 更新最高分
                    if (this.score > this.highScore) {
                        this.highScore = this.score;
                        localStorage.setItem('flappyBirdHighScore', this.highScore);
                    }
                }
            }
        }
        
        // 移除离开屏幕的管道
        this.pipes = this.pipes.filter(pipe => {
            // 如果是带有墓碑的管道，需要考虑墓碑的宽度
            if (pipe.isTop && pipe.hasTombstone) {
                // 墓碑在管道右侧60像素，加上墓碑自身宽度（约30像素）
                return pipe.x + this.PIPE_WIDTH + 90 > 0;
            }
            // 普通管道正常移除
            return pipe.x + this.PIPE_WIDTH > 0;
        });
    }
    
    // 计算当前难度系数的工具方法，确保所有地方使用相同的计算逻辑
    calculateDifficultyFactor() {
        // 基于得分的三阶段难度系统，返回0-1之间的两个值：阶段和阶段内进度
        let stage, progress;
        
        if (this.score < this.SCORE_MEDIUM_DIFFICULTY) {
            // 第一阶段：初始难度到中等难度过渡 (0-15分)
            stage = 0; // 第一阶段
            progress = this.score / this.SCORE_MEDIUM_DIFFICULTY; // 0-1之间的进度
        } else if (this.score < this.SCORE_HARD_DIFFICULTY) {
            // 第二阶段：中等难度到最终难度过渡 (15-50分)
            stage = 1; // 第二阶段
            progress = (this.score - this.SCORE_MEDIUM_DIFFICULTY) / (this.SCORE_HARD_DIFFICULTY - this.SCORE_MEDIUM_DIFFICULTY); // 0-1之间的进度
        } else {
            // 第三阶段：保持最终难度 (50分以上)
            stage = 2; // 第三阶段
            progress = 1.0; // 已达到最大难度
        }
        
        return { stage, progress };
    }
    
    // 根据难度阶段和进度计算特定参数的值
    calculateParameterValue(initialValue, mediumValue, finalValue, difficultyInfo) {
        const { stage, progress } = difficultyInfo;
        
        if (stage === 0) {
            // 第一阶段：初始值到中等值的线性插值
            return initialValue + progress * (mediumValue - initialValue);
        } else if (stage === 1) {
            // 第二阶段：中等值到最终值的线性插值
            return mediumValue + progress * (finalValue - mediumValue);
        } else {
            // 第三阶段：返回最终值
            return finalValue;
        }
    }
    
    // 增加游戏难度
    increaseDifficulty() {
        // 计算当前难度信息
        const difficultyInfo = this.calculateDifficultyFactor();
        
        // 使用独立的参数计算管道间隙
        this.currentPipeGap = this.calculateParameterValue(
            this.PIPE_GAP_INITIAL, 
            this.PIPE_GAP_MEDIUM, 
            this.PIPE_GAP_FINAL, 
            difficultyInfo
        );
        
        // 使用独立的参数计算管道生成间隔
        this.currentPipeSpawnInterval = this.calculateParameterValue(
            this.PIPE_SPAWN_INTERVAL_INITIAL, 
            this.PIPE_SPAWN_INTERVAL_MEDIUM, 
            this.PIPE_SPAWN_INTERVAL_FINAL, 
            difficultyInfo
        );
        
        // 使用独立的参数计算管道速度
        this.currentPipeSpeed = this.calculateParameterValue(
            this.PIPE_SPEED_INITIAL, 
            this.PIPE_SPEED_MEDIUM, 
            this.PIPE_SPEED_FINAL, 
            difficultyInfo
        );
        
        // 使用独立的参数计算高度变化范围
        const currentHeightVariation = this.calculateParameterValue(
            this.HEIGHT_VARIATION_INITIAL, 
            this.HEIGHT_VARIATION_MEDIUM, 
            this.HEIGHT_VARIATION_FINAL, 
            difficultyInfo
        );
        
        // 在控制台输出当前的难度和参数
        console.log(`--------- 难度更新 ---------`);
        console.log(`当前分数: ${this.score}`);
        console.log(`难度阶段: ${
            difficultyInfo.stage === 0 ? 
                `1-初始到中等过渡(0-${this.SCORE_MEDIUM_DIFFICULTY}分, 进度:${(difficultyInfo.progress * 100).toFixed(1)}%)` : 
            difficultyInfo.stage === 1 ? 
                `2-中等到最终过渡(${this.SCORE_MEDIUM_DIFFICULTY}-${this.SCORE_HARD_DIFFICULTY}分, 进度:${(difficultyInfo.progress * 100).toFixed(1)}%)` : 
                `3-最终难度(${this.SCORE_HARD_DIFFICULTY}分以上)`
        }`);
        console.log(`管道间隙: ${this.currentPipeGap.toFixed(1)}像素`);
        console.log(`管道速度: ${this.currentPipeSpeed.toFixed(1)}`);
        console.log(`管道生成间隔: ${this.currentPipeSpawnInterval.toFixed(0)}毫秒`);
        console.log(`高度变化范围: ±${currentHeightVariation.toFixed(0)}像素`);
        console.log(`游戏版本: ${this.gameVersion}`);
        console.log(`--------------------------`);
    }
    
    // 生成管道
    spawnPipe() {
        // 增加生成对数计数器
        this.pipePairSpawnCount++;
        const pipeNumber = this.pipePairSpawnCount; // 使用计数器作为管道编号

        // 移除调试日志
        // console.log(`【调试】spawnPipe called for Pair #${pipeNumber}. Current pipes.length: ${currentPipeLength}`);

        // 确保必要的属性存在
        if (!this.PIPE_WIDTH) this.PIPE_WIDTH = 80;
        if (!this.GROUND_HEIGHT) this.GROUND_HEIGHT = 50;
        
        // 计算当前难度信息
        let difficultyInfo;
        if (this.gameMode === GAME_MODE.ENDLESS) {
            difficultyInfo = this.calculateDifficultyFactor();
        } else {
            // 每日挑战模式使用固定难度计算
            const progressToMax = Math.min(1, this.score / 40);
            difficultyInfo = {
                stage: progressToMax >= 1 ? 2 : 1,
                progress: progressToMax >= 1 ? 1 : progressToMax
            };
        }
        
        // 根据难度调整间隙位置的随机范围
        const minGapPos = 100; // 间隙最小高度位置
        const maxGapPos = this.canvas.height - this.GROUND_HEIGHT - this.currentPipeGap - 100; // 间隙最大高度位置
        
        // 根据上一个管道的位置来限制新管道的位置范围（确保高度变化适中）
        let newGapPosition;
        
        // 安全检查 - 确保高度变化参数有默认值
        if (!this.HEIGHT_VARIATION_INITIAL) this.HEIGHT_VARIATION_INITIAL = 200;
        if (!this.HEIGHT_VARIATION_MEDIUM) this.HEIGHT_VARIATION_MEDIUM = 400;
        if (!this.HEIGHT_VARIATION_FINAL) this.HEIGHT_VARIATION_FINAL = 600;
        
        if (this.pipes.length >= 2) {
            // 获取最后一对管道的上管道高度
            const lastPipeHeight = this.pipes[this.pipes.length - 2].height;
            
            // 计算允许的高度变化范围 - 使用独立的参数
            const heightVariation = this.calculateParameterValue(
                this.HEIGHT_VARIATION_INITIAL, 
                this.HEIGHT_VARIATION_MEDIUM, 
                this.HEIGHT_VARIATION_FINAL, 
                difficultyInfo
            );
            
            // 计算新管道位置的合理范围
            const minNewPos = Math.max(minGapPos, lastPipeHeight - heightVariation);
            const maxNewPos = Math.min(maxGapPos, lastPipeHeight + heightVariation);
            
            // 生成新位置 (使用固定种子随机数或普通随机数)
            if (this.gameMode === GAME_MODE.DAILY_CHALLENGE) {
                newGapPosition = minNewPos + this.getSeededRandom(0, 1) * (maxNewPos - minNewPos);
            } else {
                newGapPosition = minNewPos + Math.random() * (maxNewPos - minNewPos);
            }
        } else {
            // 第一对管道，位置完全随机
            if (this.gameMode === GAME_MODE.DAILY_CHALLENGE) {
                newGapPosition = minGapPos + this.getSeededRandom(0, 1) * (maxGapPos - minGapPos);
            } else {
                newGapPosition = minGapPos + Math.random() * (maxGapPos - minGapPos);
            }
        }
        
        // 不再需要根据 pipes.length 重新计算 pipeNumber
        // const pipeNumber = this.pipes.length / 2 + 1;

        // 移除条件日志
        // if (pipeNumber >= 8) { 
        //     console.log(`【调试】(Conditional >= 8 Log Check) 即将生成第 ${pipeNumber} 对管道。当前墓碑数据:`, this.tombstones ? JSON.stringify(this.tombstones) : '墓碑数据不存在');
        // }

        let hasTombstone = false;
        let tombstoneName = '';
        let tombstoneColor = '#E74C3C';

        if (this.tombstones && this.tombstones.length > 0) {
            // 移除调试日志
            // if (pipeNumber === 10) {
            //     console.log(`【调试】尝试为第 ${pipeNumber} 对管道查找旗子。当前墓碑数据（确认查找前）:`, JSON.stringify(this.tombstones));
            // }
            
            const tombstone = this.tombstones.find(t => t.score === pipeNumber && !t.placed);
            
            // 移除调试日志
            // if (pipeNumber === 10) {
            //     console.log(`【调试】查找第 ${pipeNumber} 对管道的旗子结果:`, tombstone ? JSON.stringify(tombstone) : '未找到');
            // }
            
            if (tombstone) {
                hasTombstone = true;
                tombstoneName = tombstone.name;
                tombstoneColor = tombstone.color;
                tombstone.placed = true;
                console.log(`【调试】为第${pipeNumber}对管道添加旗子，玩家:"${tombstoneName}"，分数:${tombstone.score}`); // 保留这个有用的日志
            }
        } else {
            // 移除调试日志
            // if (pipeNumber >= 8) {
            //     console.log(`【调试】无法查找旗子，因为 this.tombstones 不存在或为空。 PipeNumber: ${pipeNumber}`);
            // }
        }
        
        // 上管道
        this.pipes.push({
            x: this.canvas.width,
            y: 0,
            width: this.PIPE_WIDTH,
            height: newGapPosition,
            passed: false,
            isTop: true,
            pipeNumber: pipeNumber,
            hasTombstone: hasTombstone,
            tombstoneName: tombstoneName,
            tombstoneColor: tombstoneColor // 传递颜色信息
        });
        
        // 下管道
        this.pipes.push({
            x: this.canvas.width,
            y: newGapPosition + this.currentPipeGap,
            width: this.PIPE_WIDTH,
            height: this.canvas.height - (newGapPosition + this.currentPipeGap) - this.GROUND_HEIGHT,
            passed: false,
            isTop: false,
            pipeNumber: pipeNumber
        });
    }
    
    // 检查碰撞
    checkCollision(bird, pipe) {
        // 固定的容错空间（5像素）
        const tolerance = 5;
        
        return (
            bird.x + tolerance < pipe.x + pipe.width &&
            bird.x + bird.width - tolerance > pipe.x &&
            bird.y + tolerance < pipe.y + pipe.height &&
            bird.y + bird.height - tolerance > pipe.y
        );
    }
    
    // 更新分数显示
    updateScore() {
        this.scoreDisplay.textContent = this.score;
    }
    
    // 渲染游戏 - 改进帧率独立性
    render() {
        // 如果已经在渲染中，避免重复渲染造成闪烁
        if (this.isRendering) {
            return;
        }
        
        this.isRendering = true;
        
        // 验证游戏元素是否初始化
        if (!this.bird) {
            if (this.isConfigLoaded && !this.bird) {
                console.log('尝试重新初始化游戏元素');
                this.initGameAfterConfigLoaded();
                if (!this.bird) {
                    this.isRendering = false;
                    return; // 如果仍然失败，放弃本次渲染
                }
            } else {
                this.isRendering = false;
                return; // 放弃本次渲染
            }
        }
        
        // 获取deltaTime用于平滑动画
        const currentTime = Date.now();
        const deltaTime = currentTime - (this.lastRenderTime || currentTime);
        this.lastRenderTime = currentTime;
        
        // 避免过大的deltaTime值导致不平滑的渲染
        // 如果deltaTime过大（例如页面切换回来后），限制它以避免闪烁
        const maxDeltaTime = 50; // 限制最大时间增量为50ms
        const smoothDeltaTime = Math.min(deltaTime, maxDeltaTime);
        
        // 清除画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 使用双缓冲技术避免闪烁
        // 然后继续正常渲染...
        
        // 绘制背景（天空）
        this.ctx.fillStyle = '#87CEEB';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制云朵 - 使用平滑的时间增量
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        const screenWidth = this.canvas.width;
        const cloudCount = screenWidth < 500 ? 3 : Math.min(Math.floor(screenWidth / 250) + 2, 5);
        for (let i = 0; i < cloudCount; i++) {
            if (!this.cloudPositions) {
                this.cloudPositions = [];
                for (let j = 0; j < cloudCount; j++) {
                    const initialOffset = (j / cloudCount) * (screenWidth + 400); 
                    this.cloudPositions.push({
                        x: initialOffset,
                        y: this.canvas.height * 0.2 + Math.sin(j) * 20,
                        size: 30 + Math.sin(j * 2) * 10,
                        speed: 0.14 + Math.random() * 0.04, // 随机速度范围 [0.14, 0.18]
                        cloudType: Math.floor(Math.random() * 3) // 为每朵云分配固定类型
                    });
                }
            }
            const cloud = this.cloudPositions[i];
            cloud.x -= cloud.speed * smoothDeltaTime;
            if (cloud.x < -cloud.size * 4) {
                cloud.x = screenWidth + cloud.size * 2;
                cloud.y = this.canvas.height * 0.2 + Math.sin(Date.now() / 1000 + i) * 20;
                cloud.size = 30 + Math.sin(Date.now() / 1000 + i * 2) * 10;
                if (Math.random() < 0.3) {
                    cloud.cloudType = Math.floor(Math.random() * 3);
                }
            }
            this.drawCloud(cloud.x, cloud.y, cloud.size, cloud.cloudType);
        }
        
        // 绘制管道
        for (const pipe of this.pipes) {
            // 获取此管道的颜色
            const pipeColor = this.pipeColors.pipe;
            const capHeight = 30; // 管道帽子高度
            
            // 管道主体
            this.ctx.fillStyle = pipeColor.main;
            this.ctx.fillRect(pipe.x, pipe.y, pipe.width, pipe.height);
            
            // 管道边缘
            this.ctx.fillStyle = pipeColor.border;
            if (pipe.isTop) {
                this.ctx.fillRect(pipe.x - 5, pipe.y + pipe.height - capHeight, pipe.width + 10, capHeight);
            } else {
                this.ctx.fillRect(pipe.x - 5, pipe.y, pipe.width + 10, capHeight);
            }
        }
        
        // 绘制地面（包括旗子）
        this.drawGround();
        
        // 绘制小鸟
        this.ctx.save();
        this.ctx.translate(this.bird.x + this.bird.width / 2, this.bird.y + this.bird.height / 2);
        this.ctx.rotate(this.bird.rotation * Math.PI / 180);
        
        // 绘制小鸟身体
        this.ctx.fillStyle = this.birdColor.body;
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, this.bird.width / 2, this.bird.height / 2, 0, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 绘制小鸟眼睛
        this.ctx.fillStyle = 'white';
        this.ctx.beginPath();
        this.ctx.ellipse(this.bird.width / 4, -this.bird.height / 6, 5, 5, 0, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 绘制小鸟眼球
        this.ctx.fillStyle = 'black';
        this.ctx.beginPath();
        this.ctx.ellipse(this.bird.width / 4 + 2, -this.bird.height / 6, 2, 2, 0, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 绘制小鸟嘴
        this.ctx.fillStyle = this.birdColor.beak;
        this.ctx.beginPath();
        this.ctx.moveTo(this.bird.width / 2, 0);
        this.ctx.lineTo(this.bird.width / 2 + 10, -5);
        this.ctx.lineTo(this.bird.width / 2 + 10, 5);
        this.ctx.closePath();
        this.ctx.fill();
        
        // 绘制小鸟翅膀
        this.ctx.fillStyle = this.birdColor.wing;
        this.ctx.beginPath();
        const wingOffset = Math.sin(Date.now() / 100) * 5;
        this.ctx.ellipse(-this.bird.width / 4, wingOffset, this.bird.width / 3, this.bird.height / 3, 0, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.restore();
        
        // 在函数最后重置渲染标志
        this.isRendering = false;
    }
    
    // 游戏循环 - 优化性能和支持高帧率
    loop(timestamp) {
        // 计算帧间隔
        if (!this.lastTime) {
            this.lastTime = timestamp;
        }
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        // 限制deltaTime，避免页面不活跃后回来时的大幅更新导致闪烁
        const maxDeltaTime = 50; // 限制最大时间增量为50ms
        const smoothDeltaTime = Math.min(deltaTime, maxDeltaTime);
        
        // 更新游戏状态
        this.update(smoothDeltaTime);
        
        // 渲染游戏
        this.render();
        
        // 请求下一帧 - 使用最新的API选项
        this.animationFrameId = requestAnimationFrame((t) => this.loop(t));
    }
    
    // 辅助方法 - 生成随机颜色
    getRandomColor() {
        const colors = [
            { body: '#FF5733', wing: '#C70039', beak: '#FFC300' }, // 红色
            { body: '#3498DB', wing: '#2980B9', beak: '#F1C40F' }, // 蓝色
            { body: '#2ECC71', wing: '#27AE60', beak: '#F39C12' }, // 绿色
            { body: '#9B59B6', wing: '#8E44AD', beak: '#F1C40F' }, // 紫色
            { body: '#E74C3C', wing: '#C0392B', beak: '#F39C12' }  // 红色
        ];
        
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    // 生成管道颜色
    generatePipeColors() {
        return {
            pipe: {
                main: '#3CB371', // 绿色
                border: '#2E8B57'
            }
        };
    }
    
    // 绘制云朵
    drawCloud(x, y, size, cloudType) {
        // 保存当前绘图状态
        this.ctx.save();
        
        // 使用source-over模式合并云朵部分
        this.ctx.globalCompositeOperation = 'source-over';
        
        // 设置云朵颜色和透明度
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        
        // 根据云朵类型绘制不同形状
        if (cloudType === 0) { // 基础蓬松云
            // 中心圆
            this.ctx.beginPath();
            this.ctx.arc(x, y, size, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 右上圆
            this.ctx.beginPath();
            this.ctx.arc(x + size * 0.55, y - size * 0.4, size * 0.75, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 右侧圆
            this.ctx.beginPath();
            this.ctx.arc(x + size * 1.1, y, size * 0.85, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 右下圆
            this.ctx.beginPath();
            this.ctx.arc(x + size * 0.55, y + size * 0.4, size * 0.75, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 左下圆
            this.ctx.beginPath();
            this.ctx.arc(x - size * 0.3, y + size * 0.25, size * 0.65, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 最右侧圆
            this.ctx.beginPath();
            this.ctx.arc(x + size * 1.4, y + size * 0.1, size * 0.5, 0, Math.PI * 2);
            this.ctx.fill();
        }
        else if (cloudType === 1) { // 长条云
            // 左侧圆
            this.ctx.beginPath();
            this.ctx.arc(x, y, size * 0.7, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 左中圆
            this.ctx.beginPath();
            this.ctx.arc(x + size * 0.8, y - size * 0.2, size * 0.85, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 中间圆
            this.ctx.beginPath();
            this.ctx.arc(x + size * 1.6, y, size * 0.75, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 右侧圆
            this.ctx.beginPath();
            this.ctx.arc(x + size * 2.4, y - size * 0.1, size * 0.75, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 底部圆
            this.ctx.beginPath();
            this.ctx.arc(x + size * 1.3, y + size * 0.3, size * 0.9, 0, Math.PI * 2);
            this.ctx.fill();
        }
        else if (cloudType === 2) { // 聚集云
            // 中心圆
            this.ctx.beginPath();
            this.ctx.arc(x, y, size * 0.9, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 右上圆
            this.ctx.beginPath();
            this.ctx.arc(x + size * 0.7, y - size * 0.4, size * 0.9, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 左上圆
            this.ctx.beginPath();
            this.ctx.arc(x - size * 0.2, y - size * 0.4, size * 0.7, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 右下圆
            this.ctx.beginPath();
            this.ctx.arc(x + size * 0.5, y + size * 0.3, size, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 左下圆
            this.ctx.beginPath();
            this.ctx.arc(x - size * 0.4, y + size * 0.25, size * 0.8, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // 恢复绘图状态
        this.ctx.restore();
    }
    
    // 在后台加载排行榜数据
    loadLeaderboardInBackground(forceProcess = false) {
        const currentMode = this.gameMode === GAME_MODE.ENDLESS ? '无尽模式' : '每日挑战';
        const dateInfo = this.gameMode === GAME_MODE.DAILY_CHALLENGE ? ` (${this.currentChallengeDate})` : '';
        console.log(`加载${currentMode}${dateInfo}排行榜数据...`);
        
        fetch('/api/get-scores')
            .then(response => {
                if (!response.ok) {
                    console.error("获取排行榜数据失败，状态码:", response.status);
                    throw new Error('获取排行榜数据失败');
                }
                return response.json();
            })
            .then(data => {
                this.leaderboardData = data;
                
                // 显示筛选后的数据条数
                const filteredData = this.getLeaderboardForCurrentMode();
                console.log(`${currentMode}${dateInfo}排行榜数据加载成功，共 ${filteredData.length} 条记录`);
                
                if (this.gameState !== GAME_STATE.PLAYING || forceProcess) {
                    this.processLeaderboardForTombstones();
                } else {
                    console.log("游戏进行中，延迟处理旗子数据以避免闪烁");
                }
            })
            .catch(error => {
                console.error("加载排行榜失败:", error);
                this.leaderboardData = [];
            });
    }
    
    // 显示排行榜
    displayLeaderboard(scores) {
        const leaderboardContainer = document.getElementById('leaderboard-container');
        const leaderboardList = document.getElementById('leaderboard-list');
        const leaderboardMode = document.getElementById('leaderboard-mode');
        
        // 更新排行榜模式显示
        if (leaderboardMode) {
            let modeText = this.gameMode === GAME_MODE.ENDLESS ? '无尽模式' : '每日挑战';
            // 如果是每日挑战，添加日期
            if (this.gameMode === GAME_MODE.DAILY_CHALLENGE) {
                modeText += ` (${this.currentChallengeDate})`;
            }
            leaderboardMode.textContent = modeText;
        }
        
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
    
    // 提交分数
    submitScore() {
        const nameInput = document.getElementById('player-name');
        const submitButton = document.getElementById('submit-score-button');
        
        // 验证输入
        if (!nameInput || !nameInput.value.trim()) {
            alert('请输入您的名字');
            return;
        }
        
        // 禁用按钮防止重复提交
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = '提交中...';
        }
        
        // 准备提交数据
        const scoreData = {
            name: nameInput.value.trim(),
            score: this.score.toString(),
            mode: this.gameMode === GAME_MODE.ENDLESS ? 'endless' : 'challenge'
        };
        
        // 如果是每日挑战模式，添加日期信息 (使用北京时间)
        if (this.gameMode === GAME_MODE.DAILY_CHALLENGE) {
            scoreData.date = this.currentChallengeDate;
        }
        
        // 发送请求
        fetch('/api/submit-score', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(scoreData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('提交失败');
            }
            return response.json();
        })
        .then(data => {
            // 标记为已提交
            this.scoreSubmitted = true;
            
            // 更新按钮文本
            if (submitButton) {
                submitButton.textContent = '✓ 已提交';
            }
            
            // 隐藏输入框
            const nameInputContainer = document.getElementById('name-input-container');
            if (nameInputContainer) {
                nameInputContainer.style.display = 'none';
            }
            
            // 重新加载排行榜
            this.loadLeaderboardInBackground(true);
        })
        .catch(error => {
            console.error('提交分数失败:', error);
            alert('提交失败，请重试');
            
            // 重置按钮状态
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = '提交分数';
            }
        });
    }
    
    // 初始化默认配置（用作回退）
    initDefaultConfig() {
        // 重力与跳跃参数
        this.GRAVITY = 0.4;
        this.FLAP_POWER = -9;
        
        // 初始难度参数 (0-15分)
        this.PIPE_SPEED_INITIAL = 2.5;
        this.PIPE_SPAWN_INTERVAL_INITIAL = 2000;
        this.PIPE_GAP_INITIAL = 220;
        this.HEIGHT_VARIATION_INITIAL = 200;
        
        // 中等难度参数 (15-100分)
        this.PIPE_SPEED_MEDIUM = 3.0;
        this.PIPE_SPAWN_INTERVAL_MEDIUM = 1600;
        this.PIPE_GAP_MEDIUM = 180;
        this.HEIGHT_VARIATION_MEDIUM = 400;
        
        // 最终难度参数 (100分以上)
        this.PIPE_SPEED_FINAL = 3.0;
        this.PIPE_SPAWN_INTERVAL_FINAL = 1400;
        this.PIPE_GAP_FINAL = 120;
        this.HEIGHT_VARIATION_FINAL = 600;
        
        // 难度控制分数阈值
        this.SCORE_MEDIUM_DIFFICULTY = 15;
        this.SCORE_HARD_DIFFICULTY = 60;
        this.SCORE_DIFFICULTY_STEP = 5;
        
        // 其他游戏尺寸参数
        this.PIPE_WIDTH = 80;
        this.BIRD_WIDTH = 40;
        this.BIRD_HEIGHT = 30;
        this.GROUND_HEIGHT = 50;
    }
    
    // 从服务器加载游戏配置
    async loadGameConfig() {
        try {
            // 显示加载状态
            this.gameState = GAME_STATE.LOADING;
            if (this.loadingScreen) {
                this.loadingScreen.style.display = 'flex';
            }
            
            // 获取服务器配置
            const response = await fetch(`/api/game-config?v=${Date.now()}`);
            if (!response.ok) {
                throw new Error('无法加载游戏配置');
            }
            
            const config = await response.json();
            
            // 更新游戏配置
            this.updateGameConfig(config);
            
            // 标记配置已加载
            this.isConfigLoaded = true;
            this.configLastChecked = Date.now();
            
            // 初始化游戏（仅在第一次加载时）
            if (this.gameState === GAME_STATE.LOADING) {
                this.initGameAfterConfigLoaded();
            }
            
            console.log(`游戏配置已加载 - 版本: ${config.version}`);
            
            // 隐藏加载界面，显示开始界面
            if (this.loadingScreen) {
                this.loadingScreen.style.display = 'none';
            }
            
            if (this.gameState === GAME_STATE.LOADING) {
                this.gameState = GAME_STATE.MENU;
                this.startScreen.style.display = 'flex';
            }
            
            // 如果已经在游戏中，显示更新通知
            if (this.gameState === GAME_STATE.PLAYING && this.gameVersion !== config.version) {
                this.showUpdateNotification();
            }
            
            return true;
        } catch (error) {
            console.error('加载游戏配置失败:', error);
            
            // 使用默认配置
            console.log('使用默认配置继续游戏');
            // 确保无论如何都初始化游戏
            this.initGameAfterConfigLoaded();
            
            if (this.loadingScreen) {
                this.loadingScreen.style.display = 'none';
            }
            
            this.gameState = GAME_STATE.MENU;
            this.startScreen.style.display = 'flex';
            
            return false;
        }
    }
    
    // 更新游戏配置
    updateGameConfig(config) {
        // 保存版本信息
        this.gameVersion = config.version;
        
        // 更新所有配置参数
        for (const key in config) {
            if (key !== 'version' && key !== 'lastUpdated') {
                this[key] = config[key];
            }
        }
    }
    
    // 启动配置检查定时器
    startConfigCheckTimer() {
        setInterval(() => {
            // 检查是否需要更新配置
            if (Date.now() - this.configLastChecked > this.configCheckInterval) {
                this.checkConfigUpdate();
            }
        }, 10000); // 每10秒检查一次定时器状态
    }
    
    // 检查配置更新
    async checkConfigUpdate() {
        // 避免频繁检查
        if (Date.now() - this.configLastChecked < this.configCheckInterval) {
            return;
        }
        
        // 如果正在游戏中，避免更新配置导致闪烁
        if (this.gameState === GAME_STATE.PLAYING) {
            return;
        }
        
        this.configLastChecked = Date.now();
        
        try {
            const response = await fetch(`/api/game-config?currentVersion=${this.gameVersion}&t=${Date.now()}`);
            if (!response.ok) return;
            
            const config = await response.json();
            
            // 检查版本是否有变化
            if (config.version !== this.gameVersion) {
                console.log(`发现新游戏配置 - 当前: ${this.gameVersion}, 新版本: ${config.version}`);
                
                // 更新配置
                this.updateGameConfig(config);
                
                // 显示更新通知
                this.showUpdateNotification();
            }
        } catch (error) {
            console.error('检查配置更新失败:', error);
        }
    }
    
    // 显示更新通知
    showUpdateNotification() {
        // 在控制台显示日志
        console.log('游戏配置已更新，下一局游戏将使用新配置');
        
        // 显示界面通知
        const notification = document.getElementById('update-notification');
        if (notification) {
            notification.style.display = 'flex';
            
            // 5秒后自动隐藏
            setTimeout(() => {
                notification.style.display = 'none';
            }, 5000);
        }
    }
    
    // 配置加载后初始化游戏
    initGameAfterConfigLoaded() {
        console.log('初始化游戏元素');
        // 游戏元素
        this.bird = {
            x: this.canvas.width / 3,
            y: this.canvas.height / 2,
            width: this.BIRD_WIDTH || 40,  // 使用默认值防止undefined
            height: this.BIRD_HEIGHT || 30,
            velocity: 0,
            rotation: 0,
            targetRotation: 0 // 添加目标旋转角度
        };
        
        this.pipes = [];
        this.score = 0;
        this.highScore = 0; // 不再使用
        this.initialHighScore = 0; // 会在开始游戏时设置
        
        // 难度控制
        this.pipesPassedCount = 0;
        this.currentPipeGap = this.PIPE_GAP_INITIAL || 220;
        this.currentPipeSpawnInterval = this.PIPE_SPAWN_INTERVAL_INITIAL || 2000;
        this.currentPipeSpeed = this.PIPE_SPEED_INITIAL || 2.5;
        
        // 游戏结束时间控制
        this.gameJustEnded = false;
        this.canRestartAfterGameOver = true;
        
        // 排行榜数据
        this.leaderboardData = [];
        this.scoreThreshold = 10; // 更新排行榜的分数阈值 
        this.leaderboardUpdated = false; // 跟踪本局游戏是否已更新过排行榜
        this.scoreSubmitted = false; // 跟踪分数是否已被提交
        
        // 随机生成颜色
        this.birdColor = this.getRandomColor();
        this.pipeColors = this.generatePipeColors();
        
        // 根据设备类型显示不同的控制提示
        this.updateControlsDisplay();
        
        // 新增：初始化管道对计数器
        this.pipePairSpawnCount = 0;
        
        // 初始化时加载排行榜数据
        this.loadLeaderboardInBackground(true);
    }
    
    // 处理排行榜数据，创建墓碑位置信息
    processLeaderboardForTombstones() {
        const currentMode = this.gameMode === GAME_MODE.ENDLESS ? '无尽模式' : '每日挑战';
        const dateInfo = this.gameMode === GAME_MODE.DAILY_CHALLENGE ? ` (${this.currentChallengeDate})` : '';
        console.log(`开始为${currentMode}${dateInfo}创建旗子数据...`);
        
        if (!this.leaderboardData || !Array.isArray(this.leaderboardData)) {
            console.warn("排行榜数据不存在或不是数组，无法创建旗子");
            return;
        }
        
        this.tombstones = [];
        
        const modeLeaderboard = this.getLeaderboardForCurrentMode();
        if (modeLeaderboard.length === 0) {
            console.warn(`${currentMode}${dateInfo}没有排行榜数据，不创建旗子`);
            return;
        }
        
        const scoreGroups = {};
        modeLeaderboard.forEach(entry => {
            const score = parseInt(entry.score);
            if (!scoreGroups[score]) {
                scoreGroups[score] = entry;
            }
        });
        
        // 输出分数列表
        const scoreList = Object.keys(scoreGroups).map(Number).sort((a, b) => a - b);
        console.log(`${currentMode}${dateInfo}有 ${scoreList.length} 个不同分数: ${scoreList.join(', ')}`);
        
        for (const score in scoreGroups) {
            const entry = scoreGroups[score];
            const name = entry.name;
            const colorIndex = simpleStringHash(name) % FLAG_COLORS.length;
            const flagColor = FLAG_COLORS[colorIndex];
            
            const scoreInt = parseInt(score);
            
            this.tombstones.push({
                score: scoreInt,
                name: name,
                placed: false,
                color: flagColor
            });
        }
        
        console.log(`为${currentMode}${dateInfo}创建了 ${this.tombstones.length} 个旗子数据`);
    }
    
    // 绘制地面
    drawGround() {
        // 绘制基本地面
        this.ctx.fillStyle = '#8B4513'; // 棕色
        this.ctx.fillRect(0, this.canvas.height - this.GROUND_HEIGHT, this.canvas.width, this.GROUND_HEIGHT);
        
        // 绘制草地
        this.ctx.fillStyle = '#32CD32'; // 绿色
        this.ctx.fillRect(0, this.canvas.height - this.GROUND_HEIGHT, this.canvas.width, 15);
        
        // 绘制旗子（如果有）
        this.drawFlags(); // 调用新的函数名
    }
    
    // 绘制旗子 (替代 drawTombstones)
    drawFlags() { // 重命名函数更贴切
        if (!this.pipes || this.pipes.length === 0) {
            return;
        }
        
        let flagsDrawn = 0;
        for (const pipe of this.pipes) {
            if (!pipe.isTop || !pipe.hasTombstone) {
                continue;
            }
            
            // 找到对应的下一个管道（如果存在）
            let nextPipe = null;
            for (const p of this.pipes) {
                if (p.isTop && p.pipeNumber === pipe.pipeNumber + 1) {
                    nextPipe = p;
                    break;
                }
            }
            
            // 计算墓碑位置（管道之后的位置）
            let flagX = pipe.x + this.PIPE_WIDTH + 60; // 管道后方60像素
            
            // 如果旗子在屏幕外，跳过绘制
            if (flagX < 0 || flagX > this.canvas.width) {
                continue;
            }
            
            // 绘制旗杆
            this.ctx.fillStyle = '#8A5722'; // 棕色旗杆
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
            this.ctx.fillStyle = pipe.tombstoneColor || '#E74C3C'; // 使用存储的颜色，提供默认值
            this.ctx.beginPath();
            this.ctx.moveTo(flagX, this.canvas.height - this.GROUND_HEIGHT - 45 + 5);
            this.ctx.lineTo(flagX + 30, this.canvas.height - this.GROUND_HEIGHT - 45 + 5 + 20/2);
            this.ctx.lineTo(flagX, this.canvas.height - this.GROUND_HEIGHT - 45 + 5 + 20);
            this.ctx.closePath();
            this.ctx.fill();
            
            // 添加旗子小圆球装饰
            this.ctx.fillStyle = '#F9E076'; // 金色球
            this.ctx.beginPath();
            this.ctx.arc(flagX, this.canvas.height - this.GROUND_HEIGHT - 45, 4, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 绘制玩家名字（放在旗面下方靠近旗杆）
            this.ctx.fillStyle = '#666666'; // 更淡的灰色
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(pipe.tombstoneName, flagX + 20, this.canvas.height - this.GROUND_HEIGHT - 45 + 5 + 20 + 15);
            
            flagsDrawn++;
        }
        
        // 移除这个日志，保留【调试】当前屏幕绘制了...更佳
        // if (flagsDrawn > 0 && (!this.lastFlagsDrawn || this.lastFlagsDrawn !== flagsDrawn)) {
        //     console.log(`【调试】当前屏幕绘制了${flagsDrawn}个旗子`); 
        //     this.lastFlagsDrawn = flagsDrawn;
        // }
        // 保留更详细的日志
        if (flagsDrawn > 0 && (!this.lastFlagsDrawn || this.lastFlagsDrawn !== flagsDrawn)) {
            console.log(`【调试】当前屏幕绘制了${flagsDrawn}个旗子`);
            this.lastFlagsDrawn = flagsDrawn;
        }
    }
}

// 页面加载完成后初始化游戏
window.addEventListener('load', () => {
    new FlappyBirdGame();
});
