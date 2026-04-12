import { Config } from './config.js';
import { ThemeManager } from './ThemeManager.js';
import { PrecomputedAnalyzer } from './PrecomputedAnalyzer.js';
import { SpectrumRenderer } from './SpectrumRenderer.js';

class TosuApp {
    constructor() {
        this.analyzer = new PrecomputedAnalyzer();
        
        const rendererOptions = {
            numBars: Config.NUM_BARS,
            sensitivity: Config.SENSITIVITY,
            exponent: Config.EXPONENT,
            gravity: Config.GRAVITY,
            noiseGate: Config.NOISE_GATE
        };
        this.renderer = new SpectrumRenderer('spectrum-canvas', rendererOptions);
        this.themeManager = new ThemeManager();
        
        this.isPlaying = false;
        this.shouldDisplay = false; 
        this.currentAudioPath = "";
        this.currentTime = 0; 
        
        this.drawLoop = this.drawLoop.bind(this);
    }

    encodePath(path) {
        return path ? path.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/') : "";
    }

connectSettings() {
        const rawPath = window.COUNTER_PATH || new URLSearchParams(window.location.search).get('l') || '';
        const counterPath = encodeURI(rawPath);
        
        // 确保 WebSocket 连接带有正确的编码路径
        const settingsSocket = new WebSocket(`ws://127.0.0.1:24050/websocket/commands?l=${counterPath}`);

        settingsSocket.onopen = () => {
            console.log("配置通道已连接，正在请求初始设置...");
            settingsSocket.send(`getSettings:${counterPath}`);
        };

        settingsSocket.onmessage = (msg) => {
            try {
                const data = JSON.parse(msg.data);
                
                // 监听 Tosu 下发的 getSettings 指令
                if (data.command === 'getSettings' && data.message) {
                    const settings = data.message;
                    console.log("收到最新设置:", settings);
                    
                    // 实时覆盖全局配置
                    if (settings.alignment) Config.ALIGNMENT = settings.alignment;
                    if (settings.opacity !== undefined) Config.OPACITY = settings.opacity;
                    if (settings.showInMenu !== undefined) Config.SHOW_IN_MENU = settings.showInMenu;
                    if (settings.useFixedColor !== undefined) Config.USE_FIXED_COLOR = settings.useFixedColor;
                    if (settings.fixedColor) Config.FIXED_COLOR = settings.fixedColor;
                    
                    if (settings.numBars) Config.NUM_BARS = settings.numBars;
                    if (settings.sensitivity) Config.SENSITIVITY = settings.sensitivity;
                    if (settings.exponent) Config.EXPONENT = settings.exponent;
                    if (settings.gravity) Config.GRAVITY = settings.gravity;
                    if (settings.noiseGate !== undefined) Config.NOISE_GATE = settings.noiseGate;

                    // 如果当前处于显示状态，立即更新透明度
                    if (this.shouldDisplay && this.renderer) {
                        this.renderer.setOpacity(Config.OPACITY / 100);
                    }

                    if (this.renderer && typeof this.renderer.updateOptions === 'function') {
                        this.renderer.updateOptions({
                            numBars: Config.NUM_BARS,
                            sensitivity: Config.SENSITIVITY,
                            exponent: Config.EXPONENT,
                            gravity: Config.GRAVITY,
                            noiseGate: Config.NOISE_GATE
                        });
                    }
                }
            } catch (err) {
                console.error("解析设置数据失败:", err);
            }
        };

        settingsSocket.onclose = () => setTimeout(() => this.connectSettings(), 2000);
    }
    // 常规的游戏数据监听通道
    connectData() {
        const socket = new WebSocket(Config.WS_URL);

        socket.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            
            const isV2 = data.state !== undefined;
            const state = isV2 ? data.state.number : (data.menu ? data.menu.state : 0);
            const paused = isV2 ? data.game.paused : false;
            
            // 状态 2: 游玩中, 11: 多人游玩中
            this.isPlaying = (state === 2 || state === 11) && !paused;
            
            // 状态 5: 选歌, 0: 主界面, 7: 结算界面, 12: 多人房间
            const isMenuOrResult = [0, 5, 7, 12].includes(state); 
            
            // 核心可见性逻辑：受实时控制台配置影响
            this.shouldDisplay = this.isPlaying || (Config.SHOW_IN_MENU && isMenuOrResult);

            if (!this.shouldDisplay) {
                this.renderer.setOpacity(0);
                return;
            }

            // 实时应用透明度
            this.renderer.setOpacity(Config.OPACITY / 100);

            const folder = isV2 ? data.folders?.beatmap : data.menu?.bm?.path?.folder;
            const audio = isV2 ? data.files?.audio : data.menu?.bm?.path?.audio;
            const bg = isV2 ? data.files?.background : data.menu?.bm?.path?.bg;
            
            this.currentTime = (isV2 ? data.beatmap?.time?.live : data.menu?.bm?.time?.current) / 1000;

            if (folder && audio) {
                const encodedFolder = encodeURIComponent(folder);
                const audioUrl = `${Config.API_BASE}${encodedFolder}/${this.encodePath(audio)}`;
                
                if (audioUrl !== this.currentAudioPath) {
                    this.currentAudioPath = audioUrl;
                    this.themeManager.update(`${Config.API_BASE}${encodedFolder}/${this.encodePath(bg)}`);
                    this.analyzer.loadAndAnalyze(audioUrl); 
                }
            }
        };

        socket.onclose = () => setTimeout(() => this.connectData(), 2000);
    }

    drawLoop() {
        requestAnimationFrame(this.drawLoop);
        if (!this.shouldDisplay) return;

        const logBands = this.analyzer.getFrame(this.currentTime);
        const themeColor = this.themeManager.getColor();
        this.renderer.draw(logBands, themeColor);
    }

    start() {
        // 分别启动设置通道和数据通道
        this.connectSettings();
        this.connectData();
        this.drawLoop();
    }
}

const app = new TosuApp();
app.start();
