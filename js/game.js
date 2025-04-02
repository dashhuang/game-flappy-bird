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

// 游戏常量
const GRAVITY = 0.4;             // 重力参数
const FLAP_POWER = -9;           // 跳跃力度
const PIPE_SPEED_INITIAL = 2.5;  // 初始管道速度
const PIPE_SPAWN_INTERVAL_INITIAL = 2000; // 初始管道生成间隔
const PIPE_GAP_INITIAL = 220;    // 初始管道间隙

// 难度最终值 - 提高难度
const PIPE_SPAWN_INTERVAL_FINAL = 1100; // 最终管道生成间隔（减少）
const PIPE_GAP_FINAL = 110;      // 最终管道间隙（减少）
const PIPE_SPEED_FINAL = 4.0;    // 最终管道速度（增加）

const PIPE_WIDTH = 80;
const BIRD_WIDTH = 40;
const BIRD_HEIGHT = 30;
const GROUND_HEIGHT = 50;

// 难度增加的频率（每通过多少对管道增加一次难度）
const DIFFICULTY_INCREASE_RATE = 5;

// 游戏状态
const GAME_STATE = {
    MENU: 0,
    PLAYING: 1,
    GAME_OVER: 2
};

// 游戏类
class FlappyBirdGame {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // 检测是否为移动设备
        this.isMobile = window.navigator.userAgent.match(/Mobile|Android|iPhone|iPad|iPod/i);
        
        // 游戏元素
        this.bird = {
            x: this.canvas.width / 3,
            y: this.canvas.height / 2,
            width: BIRD_WIDTH,
            height: BIRD_HEIGHT,
            velocity: 0,
            rotation: 0
        };
        
        this.pipes = [];
        this.score = 0;
        this.highScore = localStorage.getItem('flappyBirdHighScore') || 0;
        // 记录游戏开始时的初始最高分，用于判断是否打破纪录
        this.initialHighScore = this.highScore;
        this.gameState = GAME_STATE.MENU;
        
        // 难度控制
        this.pipesPassedCount = 0;
        this.currentPipeGap = PIPE_GAP_INITIAL;
        this.currentPipeSpawnInterval = PIPE_SPAWN_INTERVAL_INITIAL;
        this.currentPipeSpeed = PIPE_SPEED_INITIAL;
        
        // 初始化UI元素
        this.startScreen = document.getElementById('start-screen');
        this.gameOverScreen = document.getElementById('game-over-screen');
        this.scoreDisplay = document.getElementById('score-display');
        this.finalScore = document.getElementById('final-score');
        this.highScoreDisplay = document.getElementById('high-score');
        
        // 游戏结束时间控制
        this.gameJustEnded = false;
        this.canRestartAfterGameOver = true;
        
        // 排行榜数据
        this.leaderboardData = [];
        this.scoreThreshold = 2; // 更新排行榜的分数阈值
        this.leaderboardUpdated = false; // 跟踪本局游戏是否已更新过排行榜
        
        // 根据设备类型显示不同的控制提示
        this.updateControlsDisplay();
        
        // 事件监听
        this.setupEventListeners();
        
        // 随机生成颜色
        this.birdColor = this.getRandomColor();
        this.pipeColors = this.generatePipeColors();
        
        // 控制变量
        this.lastPipeSpawn = 0;
        
        // 动画帧请求ID
        this.animationFrameId = null;
        
        // 为移动设备进行调整
        this.adjustForMobile();
        
        // 在后台加载排行榜数据
        this.loadLeaderboardInBackground();
        
        // 开始游戏循环
        this.loop();
    }
    
    // 设置事件监听器
    setupEventListeners() {
        // 键盘事件
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.key === ' ') {
                if (this.gameState === GAME_STATE.MENU) {
                    this.startGame();
                } else if (this.gameState === GAME_STATE.PLAYING) {
                    this.flapBird();
                } else if (this.gameState === GAME_STATE.GAME_OVER && this.canRestartAfterGameOver) {
                    // 游戏结束状态下，按空格键重新开始（前提是可以重新开始）
                    this.resetGame();
                    this.startGame();
                }
            }
        });
        
        // 鼠标按下事件 - 替换click事件，提供更好的反应速度
        document.addEventListener('mousedown', (e) => {
            // 防止按钮点击事件重复触发
            if (e.target.tagName.toLowerCase() === 'button') {
                return;
            }
            
            if (this.gameState === GAME_STATE.PLAYING) {
                this.flapBird();
            }
        });
        
        // 触摸开始事件 - 针对移动设备
        document.addEventListener('touchstart', (e) => {
            // 防止按钮点击事件重复触发
            if (e.target.tagName.toLowerCase() === 'button') {
                return;
            }
            
            if (this.gameState === GAME_STATE.PLAYING) {
                this.flapBird();
                // 防止触摸事件的默认行为（如滚动）
                e.preventDefault();
            }
        }, { passive: false });
        
        // 开始按钮
        document.getElementById('start-button').addEventListener('click', () => {
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
        
        // 提交分数按钮
        document.getElementById('submit-score-button').addEventListener('click', () => {
            this.submitScore();
        });
        
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
        this.scoreDisplay.style.display = 'block';
        
        // 记录游戏开始时的最高分
        this.initialHighScore = this.highScore;
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
        // 2. 能够进入全球排行榜前10
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
        // 首先检查是否严格超过了游戏开始时的最高分（而非当前最高分）
        const beatsPersonalBest = this.score > this.initialHighScore;
        
        // 检查是否能进入全球排行榜前10
        const canEnterTopTen = this.isTopTenScore(this.score);
        
        console.log(`分数检查 - 当前: ${this.score}, 初始最高分: ${this.initialHighScore}, 当前最高分: ${this.highScore}, 超过最高分: ${beatsPersonalBest}, 能进前10: ${canEnterTopTen}`);
        
        // 显示或隐藏提交界面
        const nameInputContainer = document.getElementById('name-input-container');
        
        // 只有当两个条件都满足时才显示提交界面：1.严格打破最高分 2.能进入前10
        if (beatsPersonalBest && canEnterTopTen) {
            nameInputContainer.style.display = 'block';
            console.log('显示提交成绩界面：打破最高分并且能进入前10');
        } else {
            nameInputContainer.style.display = 'none';
            if (!beatsPersonalBest) {
                console.log('不显示提交界面：未打破最高分');
            } else if (!canEnterTopTen) {
                console.log('不显示提交界面：无法进入前10');
            }
        }
    }
    
    // 检查分数是否能进入前10
    isTopTenScore(score) {
        // 排行榜为空或没有数据的情况
        if (!this.leaderboardData || !Array.isArray(this.leaderboardData) || this.leaderboardData.length === 0) {
            // 如果排行榜数据还没加载或为空，任何非零分数都可以提交
            return score > 0;
        }
        
        // 如果排行榜还没有10个记录，任何非零分数都可以进入
        if (this.leaderboardData.length < 10) {
            return score > 0;
        }
        
        try {
            // 检查分数是否大于排行榜中最低的分数
            // 获取排行榜的最低分
            const sortedScores = [...this.leaderboardData]
                .sort((a, b) => parseInt(b.score) - parseInt(a.score));
            
            // 安全地获取第10名的分数，防止undefined
            const lowestTopScore = sortedScores.length >= 10 ? 
                parseInt(sortedScores[9].score) : 0;
            
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
            width: BIRD_WIDTH,
            height: BIRD_HEIGHT,
            velocity: 0,
            rotation: 0
        };
        
        this.pipes = [];
        this.score = 0;
        this.pipesPassedCount = 0;
        this.updateScore();
        this.lastPipeSpawn = 0;
        
        // 重置难度
        this.currentPipeGap = PIPE_GAP_INITIAL;
        this.currentPipeSpawnInterval = PIPE_SPAWN_INTERVAL_INITIAL;
        this.currentPipeSpeed = PIPE_SPEED_INITIAL;
        
        // 重置排行榜检查点状态
        this.leaderboardUpdated = false;
        
        // 记录当前的最高分
        this.initialHighScore = this.highScore;
        
        // 随机生成新颜色
        this.birdColor = this.getRandomColor();
        this.pipeColors = this.generatePipeColors();
    }
    
    // 小鸟扇动翅膀
    flapBird() {
        this.bird.velocity = FLAP_POWER;
        this.bird.rotation = -20; // 向上旋转
    }
    
    // 更新游戏状态
    update(deltaTime) {
        if (this.gameState !== GAME_STATE.PLAYING) return;
        
        // 使用固定重力值
        this.bird.velocity += GRAVITY;
        this.bird.y += this.bird.velocity;
        
        // 旋转小鸟（根据速度）
        if (this.bird.velocity < 0) {
            this.bird.rotation = -20; // 向上飞行
        } else {
            this.bird.rotation = Math.min(90, this.bird.rotation + 2); // 逐渐向下转
        }
        
        // 检查地面碰撞
        if (this.bird.y + this.bird.height > this.canvas.height - GROUND_HEIGHT) {
            this.bird.y = this.canvas.height - GROUND_HEIGHT - this.bird.height;
            this.gameOver();
        }
        
        // 检查天花板碰撞
        if (this.bird.y < 0) {
            this.bird.y = 0;
            this.bird.velocity = 0;
        }
        
        // 生成管道
        this.lastPipeSpawn += deltaTime;
        if (this.lastPipeSpawn > this.currentPipeSpawnInterval) {
            this.spawnPipe();
            this.lastPipeSpawn = 0;
        }
        
        // 更新管道位置并检查碰撞
        for (let i = 0; i < this.pipes.length; i++) {
            const pipe = this.pipes[i];
            pipe.x -= this.currentPipeSpeed;
            
            // 检查碰撞
            if (this.checkCollision(this.bird, pipe)) {
                this.gameOver();
            }
            
            // 计分 - 只对上管道计分，确保每对管道只加1分
            if (!pipe.passed && pipe.x + PIPE_WIDTH < this.bird.x && pipe.isTop) {
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
                console.log(`通过管道对数: ${this.pipesPassedCount}`);
                
                // 每通过DIFFICULTY_INCREASE_RATE对管道，增加难度
                if (this.pipesPassedCount % DIFFICULTY_INCREASE_RATE === 0) {
                    console.log(`达到难度增加点！(每${DIFFICULTY_INCREASE_RATE}对管道)`);
                    this.increaseDifficulty();
                }
                
                // 检查是否达到分数阈值且尚未更新过排行榜，如果是则更新排行榜（每局游戏只更新一次）
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
        this.pipes = this.pipes.filter(pipe => pipe.x + PIPE_WIDTH > 0);
        
        // 定期显示当前难度参数（与难度增加无关，仅用于信息显示）
        if (this.score > 0 && this.score % 5 === 0 && !this.scoreDisplayed) {
            this.scoreDisplayed = true;
            
            // 使用公共方法计算难度系数
            const difficultyFactor = this.calculateDifficultyFactor();
            
            // 80%的难度系数对应的管道数量阈值（20对管道）
            const phase1PipesCount = (DIFFICULTY_INCREASE_RATE * 5) * 0.8; // 20对管道
            
            // 计算当前高度变化范围
            const currentHeightVariation = 200 + difficultyFactor * 200;
            
            console.log(`--------- 当前状态 (得分: ${this.score}) ---------`);
            console.log(`难度系数: ${(difficultyFactor * 100).toFixed(1)}%`);
            console.log(`难度阶段: ${this.pipesPassedCount < phase1PipesCount ? "1-初始提升(0-80%)" : this.score < 20 ? "2-稳定期(80%)" : "3-最终提升(80-100%)"}`);
            console.log(`通过管道对数: ${this.pipesPassedCount}`);
            console.log(`管道间隙: ${this.currentPipeGap.toFixed(1)}像素`);
            console.log(`管道速度: ${this.currentPipeSpeed.toFixed(1)}`);
            console.log(`管道生成间隔: ${this.currentPipeSpawnInterval.toFixed(0)}毫秒`);
            console.log(`高度变化范围: ±${currentHeightVariation.toFixed(0)}像素`);
            console.log(`-----------------------------------------`);
        } else if (this.score % 5 !== 0) {
            this.scoreDisplayed = false;
        }
    }
    
    // 计算当前难度系数的工具方法，确保所有地方使用相同的计算逻辑
    calculateDifficultyFactor() {
        // 80%的难度系数对应的管道数量阈值（20对管道）
        const phase1PipesCount = (DIFFICULTY_INCREASE_RATE * 5) * 0.8; // 20对管道
        
        let difficultyFactor;
        
        if (this.pipesPassedCount < phase1PipesCount) {
            // 第一阶段：0-80%难度正常提升
            difficultyFactor = this.pipesPassedCount / (DIFFICULTY_INCREASE_RATE * 5);
        } else if (this.score < 20) {
            // 第二阶段：保持80%难度直到得分达到20
            difficultyFactor = 0.8;
        } else {
            // 第三阶段：得分超过20后继续提升难度到100%
            // 将剩余的20%难度分配在通过管道数量的剩余范围内
            const remainingFactor = (this.pipesPassedCount - phase1PipesCount) / (phase1PipesCount * 0.25);
            difficultyFactor = 0.8 + Math.min(remainingFactor, 1) * 0.2;
        }
        
        // 确保难度系数在0-1之间
        return Math.max(0, Math.min(difficultyFactor, 1));
    }
    
    // 增加游戏难度
    increaseDifficulty() {
        // 使用公共方法计算难度系数
        const difficultyFactor = this.calculateDifficultyFactor();
        
        // 80%的难度系数对应的管道数量阈值（20对管道）
        const phase1PipesCount = (DIFFICULTY_INCREASE_RATE * 5) * 0.8; // 20对管道
        
        // 逐渐调整管道间隙
        this.currentPipeGap = PIPE_GAP_INITIAL - difficultyFactor * (PIPE_GAP_INITIAL - PIPE_GAP_FINAL);
        
        // 逐渐调整管道生成间隔
        this.currentPipeSpawnInterval = PIPE_SPAWN_INTERVAL_INITIAL - difficultyFactor * (PIPE_SPAWN_INTERVAL_INITIAL - PIPE_SPAWN_INTERVAL_FINAL);
        
        // 逐渐调整管道速度
        this.currentPipeSpeed = PIPE_SPEED_INITIAL + difficultyFactor * (PIPE_SPEED_FINAL - PIPE_SPEED_INITIAL);
        
        // 计算当前高度变化范围
        const currentHeightVariation = 200 + difficultyFactor * 200;
        
        // 在控制台输出当前的难度和参数
        console.log(`--------- 难度更新 ---------`);
        console.log(`通过管道数: ${this.pipesPassedCount}`);
        console.log(`当前分数: ${this.score}`);
        console.log(`难度系数: ${(difficultyFactor * 100).toFixed(1)}%`);
        console.log(`难度阶段: ${this.pipesPassedCount < phase1PipesCount ? "1-初始提升(0-80%)" : this.score < 20 ? "2-稳定期(80%)" : "3-最终提升(80-100%)"}`);
        console.log(`管道间隙: ${this.currentPipeGap.toFixed(1)}像素`);
        console.log(`管道速度: ${this.currentPipeSpeed.toFixed(1)}`);
        console.log(`管道生成间隔: ${this.currentPipeSpawnInterval.toFixed(0)}毫秒`);
        console.log(`高度变化范围: ±${currentHeightVariation.toFixed(0)}像素`);
        console.log(`--------------------------`);
    }
    
    // 生成管道
    spawnPipe() {
        // 使用公共方法计算难度系数
        const difficultyFactor = this.calculateDifficultyFactor();
        
        // 根据难度调整间隙位置的随机范围
        // 难度越低，随机范围越小，位置变化越平缓
        // 难度越高，随机范围越大，位置变化越剧烈
        const minGapPos = 100; // 间隙最小高度位置
        const maxGapPos = this.canvas.height - GROUND_HEIGHT - this.currentPipeGap - 100; // 间隙最大高度位置
        
        // 根据上一个管道的位置来限制新管道的位置范围（确保高度变化适中）
        let newGapPosition;
        
        if (this.pipes.length >= 2) {
            // 获取最后一对管道的上管道高度
            const lastPipeHeight = this.pipes[this.pipes.length - 2].height;
            
            // 计算允许的高度变化范围 - 增加最高难度下的变化幅度
            // 简单难度下为±200像素，高难度下为±400像素
            const heightVariation = 200 + difficultyFactor * 200;
            
            // 计算新管道位置的合理范围
            const minNewPos = Math.max(minGapPos, lastPipeHeight - heightVariation);
            const maxNewPos = Math.min(maxGapPos, lastPipeHeight + heightVariation);
            
            // 生成新位置
            newGapPosition = minNewPos + Math.random() * (maxNewPos - minNewPos);
        } else {
            // 第一对管道，位置完全随机
            newGapPosition = minGapPos + Math.random() * (maxGapPos - minGapPos);
        }
        
        // 上管道
        this.pipes.push({
            x: this.canvas.width,
            y: 0,
            width: PIPE_WIDTH,
            height: newGapPosition,
            passed: false,
            isTop: true
        });
        
        // 下管道
        this.pipes.push({
            x: this.canvas.width,
            y: newGapPosition + this.currentPipeGap,
            width: PIPE_WIDTH,
            height: this.canvas.height - (newGapPosition + this.currentPipeGap) - GROUND_HEIGHT,
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
        this.ctx.fillRect(0, this.canvas.height - GROUND_HEIGHT, this.canvas.width, GROUND_HEIGHT);
        
        // 绘制草地
        this.ctx.fillStyle = '#32CD32'; // 绿色
        this.ctx.fillRect(0, this.canvas.height - GROUND_HEIGHT, this.canvas.width, 15);
        
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
        this.ctx.arc(x + size, y, size * 0.7, 0, Math.PI * 2);
        this.ctx.arc(x + size * 0.5, y + size * 0.4, size * 0.6, 0, Math.PI * 2);
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
            }
        } catch (error) {
            console.error('提交分数错误:', error);
            alert('连接服务器失败');
        }
    }
}

// 页面加载完成后初始化游戏
window.addEventListener('load', () => {
    new FlappyBirdGame();
});
