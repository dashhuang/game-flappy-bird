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
}

// 初始设置和窗口大小变化时更新
setViewportHeight();
window.addEventListener('resize', setViewportHeight);

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

// 游戏类
class FlappyBirdGame {
    constructor() {
        // 游戏版本和配置状态
        this.gameVersion = "1.0.0";
        this.isConfigLoaded = false;
        this.configLastChecked = 0;
        this.configCheckInterval = 60000; // 每分钟检查一次配置更新
        
        // 游戏模式
        this.gameMode = GAME_MODE.ENDLESS;
        
        // 每日挑战特定参数
        this.dailyChallengeSeed = this.generateDailySeed();
        this.maxDailyChallengePipes = 50;
        this.pipeCount = 0;
        
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
        this.scoreThreshold = 2;
        this.leaderboardUpdated = false;
        this.scoreSubmitted = false;
        this.gameJustEnded = false;
        this.canRestartAfterGameOver = true;
        this.lastPipeSpawn = 0;
        this.scoreDisplayed = false;
        this.animationFrameId = null;
        
        // 设置事件监听
        this.setupEventListeners();
        
        // 启动配置检查定时器
        this.startConfigCheckTimer();
        
        // 在后台加载排行榜数据
        this.loadLeaderboardInBackground();
        
        // 初始化游戏循环
        this.lastTime = 0;
        requestAnimationFrame((t) => this.loop(t));
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
        
        // 鼠标/触摸事件
        this.canvas.addEventListener('click', () => {
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
        });
        
        // 无尽模式按钮
        document.getElementById('endless-mode-button').addEventListener('click', () => {
            this.gameMode = GAME_MODE.ENDLESS;
            this.startGame();
        });
        
        // 每日挑战按钮
        document.getElementById('daily-challenge-button').addEventListener('click', () => {
            this.gameMode = GAME_MODE.DAILY_CHALLENGE;
            // 重置种子以确保每次开始挑战时使用相同的随机序列
            this.resetDailyChallengeSeed();
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
            document.addEventListener('touchmove', function(e) {
                if (e.touches.length > 1) {
                    e.preventDefault();
                }
            }, { passive: false });
            
            // 立即更新视口高度
            setViewportHeight();
            
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
        
        // 记录游戏开始时的最高分
        this.initialHighScore = this.highScore;
        
        // 根据游戏模式设置难度
        if (this.gameMode === GAME_MODE.DAILY_CHALLENGE) {
            // 每日挑战从中等难度开始
            this.startDailyChallenge();
        }
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
        const today = new Date();
        return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    }
    
    // 重置每日挑战的随机种子
    resetDailyChallengeSeed() {
        this.dailyChallengeSeed = this.generateDailySeed();
        this.seededRandom = this.mulberry32(this.dailyChallengeSeed);
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
    }
    
    // 显示胜利界面
    showVictoryScreen() {
        this.gameState = GAME_STATE.VICTORY;
        document.getElementById('victory-screen').style.display = 'flex';
        document.getElementById('victory-score').textContent = this.score;
        this.gameOverScreen.style.display = 'none';
        
        // 更新最高分
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('flappyBirdHighScore', this.highScore);
        }
    }
    
    // 游戏结束
    gameOver() {
        this.gameState = GAME_STATE.GAME_OVER;
        this.gameOverScreen.style.display = 'flex';
        this.finalScore.textContent = this.score;
        this.highScoreDisplay.textContent = this.highScore;
        
        // 默认隐藏名字输入框
        document.getElementById('name-input-container').style.display = 'none';
        
        // 检查玩家分数是否满足条件：
        // 1. 超过了自己的最高分
        // 2. 能够进入全球排行榜前20
        this.checkIfScoreQualifies();
        
        // 显示排行榜数据
        this.displayLeaderboard(this.leaderboardData);
        
        // 移动设备上，确保"再玩一次"按钮可见
        if (this.isMobile) {
            // 延迟一点，等排行榜加载完成
            setTimeout(() => {
                // 滚动到底部确保按钮可见
                const gameOverScreen = document.getElementById('game-over-screen');
                const restartButton = document.getElementById('restart-button');
                
                // 如果内容过长，确保按钮可见
                if (gameOverScreen.scrollHeight > gameOverScreen.clientHeight) {
                    // 将"再玩一次"按钮放到可视范围内
                    restartButton.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }
            }, 500);
        }
        
        // 设置游戏刚刚结束的标志
        this.gameJustEnded = true;
        this.canRestartAfterGameOver = false;
        
        // 1秒后允许重新开始游戏
        setTimeout(() => {
            this.canRestartAfterGameOver = true;
            this.gameJustEnded = false;
        }, 1000);
    }
    
    // 检查分数是否有资格提交
    checkIfScoreQualifies() {
        // 如果分数已经提交过，不再显示提交界面
        if (this.scoreSubmitted) {
            document.getElementById('name-input-container').style.display = 'none';
            return;
        }
        
        // 首先检查是否严格超过了游戏开始时的最高分（而非当前最高分）
        const beatsPersonalBest = this.score > this.initialHighScore;
        
        // 检查是否能进入全球排行榜前20
        const canEnterTopTwenty = this.isTopTwentyScore(this.score);
        
        console.log(`分数检查 - 当前: ${this.score}, 初始最高分: ${this.initialHighScore}, 当前最高分: ${this.highScore}, 超过最高分: ${beatsPersonalBest}, 能进前20: ${canEnterTopTwenty}`);
        
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
    
    // 检查分数是否能进入前20名
    isTopTwentyScore(score) {
        // 排行榜为空或没有数据的情况
        if (!this.leaderboardData || !Array.isArray(this.leaderboardData) || this.leaderboardData.length === 0) {
            // 如果排行榜数据还没加载或为空，任何非零分数都可以提交
            return score > 0;
        }
        
        // 如果排行榜还没有20个记录，任何非零分数都可以进入
        if (this.leaderboardData.length < 20) {
            return score > 0;
        }
        
        try {
            // 检查分数是否大于排行榜中最低的分数
            // 获取排行榜的最低分
            const sortedScores = [...this.leaderboardData]
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
            rotation: 0
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
        }
        
        // 重置排行榜检查点状态
        this.leaderboardUpdated = false;
        // 重置分数提交状态
        this.scoreSubmitted = false;
        
        // 记录当前的最高分
        this.initialHighScore = this.highScore;
        
        // 随机生成新颜色
        this.birdColor = this.getRandomColor();
        this.pipeColors = this.generatePipeColors();
    }
    
    // 小鸟扇动翅膀
    flapBird() {
        this.bird.velocity = this.FLAP_POWER;
        this.bird.rotation = -20; // 向上旋转
    }
    
    // 更新游戏状态
    update(deltaTime) {
        if (this.gameState !== GAME_STATE.PLAYING) return;
        
        // 使用固定重力值
        this.bird.velocity += this.GRAVITY;
        this.bird.y += this.bird.velocity;
        
        // 旋转小鸟（根据速度）
        if (this.bird.velocity < 0) {
            this.bird.rotation = -20; // 向上飞行
        } else {
            this.bird.rotation = Math.min(90, this.bird.velocity * 2); // 向下坠落
        }
        
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
        for (let i = 0; i < this.pipes.length; i++) {
            const pipe = this.pipes[i];
            pipe.x -= this.currentPipeSpeed;
            
            // 检查碰撞
            if (this.checkCollision(this.bird, pipe)) {
                this.gameOver();
            }
            
            // 计分 - 只对上管道计分，确保每对管道只加1分
            if (!pipe.passed && pipe.x + this.PIPE_WIDTH < this.bird.x && pipe.isTop) {
                pipe.passed = true;
                // 同时标记对应的下管道为已通过
                if (i + 1 < this.pipes.length) {
                    this.pipes[i + 1].passed = true;
                }
                
                this.score++;
                this.updateScore();
                
                // 增加通过管道计数
                this.pipesPassedCount++;
                
                // 在控制台输出当前通过的管道数
                console.log(`通过管道对数: ${this.pipesPassedCount}, 当前分数: ${this.score}`);
                
                // 每日挑战模式下，检查是否完成挑战
                if (this.gameMode === GAME_MODE.DAILY_CHALLENGE && this.score >= 50) {
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
                
                // 检查是否达到分数阈值且尚未更新过排行榜
                if (this.score >= this.scoreThreshold && !this.leaderboardUpdated) {
                    this.leaderboardUpdated = true;
                    // 在后台更新排行榜数据，不阻塞游戏
                    console.log(`达到得分阈值: ${this.scoreThreshold}分，更新排行榜数据`);
                    this.loadLeaderboardInBackground();
                }
                
                // 更新最高分
                if (this.score > this.highScore) {
                    this.highScore = this.score;
                    localStorage.setItem('flappyBirdHighScore', this.highScore);
                }
            }
        }
        
        // 移除离开屏幕的管道
        this.pipes = this.pipes.filter(pipe => pipe.x + this.PIPE_WIDTH > 0);
        
        // 定期显示当前难度参数（与难度增加无关，仅用于信息显示）
        if (this.score > 0 && this.score % 5 === 0 && !this.scoreDisplayed) {
            this.scoreDisplayed = true;
            
            // 计算当前难度信息
            const difficultyInfo = this.calculateDifficultyFactor();
            
            // 计算高度变化范围
            const currentHeightVariation = this.calculateParameterValue(
                this.HEIGHT_VARIATION_INITIAL, 
                this.HEIGHT_VARIATION_MEDIUM, 
                this.HEIGHT_VARIATION_FINAL, 
                difficultyInfo
            );
            
            console.log(`--------- 当前状态 (得分: ${this.score}) ---------`);
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
            console.log(`-----------------------------------------`);
        } else if (this.score % 5 !== 0) {
            this.scoreDisplayed = false;
        }
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
        
        // 上管道
        this.pipes.push({
            x: this.canvas.width,
            y: 0,
            width: this.PIPE_WIDTH,
            height: newGapPosition,
            passed: false,
            isTop: true
        });
        
        // 下管道
        this.pipes.push({
            x: this.canvas.width,
            y: newGapPosition + this.currentPipeGap,
            width: this.PIPE_WIDTH,
            height: this.canvas.height - (newGapPosition + this.currentPipeGap) - this.GROUND_HEIGHT,
            passed: false,
            isTop: false
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
    
    // 渲染游戏
    render() {
        // 确保鸟和相关配置已初始化
        if (!this.bird || !this.birdColor) {
            // 如果缺少关键对象，记录错误并尝试重新初始化
            console.error('渲染错误：缺少关键游戏对象');
            
            // 如果配置已加载但游戏对象未初始化，尝试初始化
            if (this.isConfigLoaded && !this.bird) {
                console.log('尝试重新初始化游戏元素');
                this.initGameAfterConfigLoaded();
                if (!this.bird) return; // 如果仍然失败，放弃本次渲染
            } else {
                return; // 放弃本次渲染
            }
        }
        
        // 清除画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制背景（天空）
        this.ctx.fillStyle = '#87CEEB';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制云朵（简单版本）
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        for (let i = 0; i < 5; i++) {
            const x = (this.canvas.width * i / 4 + (Date.now() / 10000 * this.canvas.width) % this.canvas.width) % this.canvas.width;
            const y = this.canvas.height * 0.2 + Math.sin(Date.now() / 1000 + i) * 20;
            const size = 30 + Math.sin(Date.now() / 1000 + i * 2) * 10;
            
            this.drawCloud(x, y, size);
        }
        
        // 绘制管道
        for (const pipe of this.pipes) {
            const pipeColor = pipe.isTop ? this.pipeColors.top : this.pipeColors.bottom;
            const capHeight = 20;
            
            // 管道主体
            this.ctx.fillStyle = pipeColor.body;
            this.ctx.fillRect(pipe.x, pipe.y, pipe.width, pipe.height);
            
            // 管道边缘
            this.ctx.fillStyle = pipeColor.border;
            if (pipe.isTop) {
                this.ctx.fillRect(pipe.x - 5, pipe.y + pipe.height - capHeight, pipe.width + 10, capHeight);
            } else {
                this.ctx.fillRect(pipe.x - 5, pipe.y, pipe.width + 10, capHeight);
            }
        }
        
        // 绘制地面
        this.ctx.fillStyle = '#8B4513'; // 棕色
        this.ctx.fillRect(0, this.canvas.height - this.GROUND_HEIGHT, this.canvas.width, this.GROUND_HEIGHT);
        
        // 绘制草地
        this.ctx.fillStyle = '#32CD32'; // 绿色
        this.ctx.fillRect(0, this.canvas.height - this.GROUND_HEIGHT, this.canvas.width, 15);
        
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
    }
    
    // 游戏循环
    loop(timestamp) {
        // 计算帧间隔
        if (!this.lastTime) {
            this.lastTime = timestamp;
        }
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        // 更新游戏状态
        this.update(deltaTime);
        
        // 渲染游戏
        this.render();
        
        // 请求下一帧
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
            top: {
                body: '#3CB371', // 绿色
                border: '#2E8B57'
            },
            bottom: {
                body: '#3CB371', // 绿色
                border: '#2E8B57'
            }
        };
    }
    
    // 绘制云朵
    drawCloud(x, y, size) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, size, 0, Math.PI * 2);
        this.ctx.arc(x + size * 0.5, y - size * 0.4, size * 0.8, 0, Math.PI * 2);
        this.ctx.arc(x + size * 1.0, y, size * 0.9, 0, Math.PI * 2);
        this.ctx.arc(x + size * 0.5, y + size * 0.4, size * 0.8, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    // 在后台加载排行榜数据
    loadLeaderboardInBackground() {
        // 使用fetch API在后台加载排行榜
        fetch('/api/get-scores')
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
                return [];
            })
            .then(data => {
                this.leaderboardData = data;
                console.log("排行榜数据加载成功");
            })
            .catch(error => {
                // 只在控制台记录错误，不显示给用户
                console.error("加载排行榜失败:", error);
                // 失败时使用空数组
                this.leaderboardData = [];
            });
    }
    
    // 显示排行榜
    displayLeaderboard(scores) {
        const leaderboardContainer = document.getElementById('leaderboard-container');
        const leaderboardList = document.getElementById('leaderboard-list');
        
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
    async submitScore() {
        const nameInput = document.getElementById('player-name');
        const name = nameInput.value.trim();
        
        if (!name) {
            alert('请输入你的名字');
            return;
        }
        
        // 防止重复提交
        const submitButton = document.getElementById('submit-score-button');
        if (submitButton.disabled) {
            return; // 如果按钮已被禁用，说明正在提交中，直接返回
        }
        
        // 禁用按钮并更改文本
        submitButton.disabled = true;
        submitButton.textContent = '提交中...';
        
        try {
            const response = await fetch('/api/submit-score', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name,
                    score: this.score
                })
            });
            
            if (response.ok) {
                // 添加提交成功标记，防止再次提交
                this.scoreSubmitted = true;
                document.getElementById('name-input-container').style.display = 'none';
                
                // 重新获取并显示更新后的排行榜数据
                const leaderboardResponse = await fetch('/api/get-scores');
                if (leaderboardResponse.ok) {
                    const scores = await leaderboardResponse.json();
                    this.leaderboardData = scores;
                    this.displayLeaderboard(scores);
                }
            } else {
                alert('提交分数失败，请重试');
                // 恢复按钮状态，允许重试
                submitButton.disabled = false;
                submitButton.textContent = '提交分数';
            }
        } catch (error) {
            console.error('提交分数错误:', error);
            alert('连接服务器失败');
            // 恢复按钮状态，允许重试
            submitButton.disabled = false;
            submitButton.textContent = '提交分数';
        }
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
            rotation: 0
        };
        
        this.pipes = [];
        this.score = 0;
        this.highScore = localStorage.getItem('flappyBirdHighScore') || 0;
        // 记录游戏开始时的初始最高分，用于判断是否打破纪录
        this.initialHighScore = this.highScore;
        
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
        this.scoreThreshold = 2; // 更新排行榜的分数阈值
        this.leaderboardUpdated = false; // 跟踪本局游戏是否已更新过排行榜
        this.scoreSubmitted = false; // 跟踪分数是否已被提交
        
        // 随机生成颜色
        this.birdColor = this.getRandomColor();
        this.pipeColors = this.generatePipeColors();
        
        // 根据设备类型显示不同的控制提示
        this.updateControlsDisplay();
    }
}

// 页面加载完成后初始化游戏
window.addEventListener('load', () => {
    new FlappyBirdGame();
});
