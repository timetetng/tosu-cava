export const Config = {
    // --- 1. API 与连接配置 ---
    WS_URL: 'ws://127.0.0.1:24050/ws',
    API_BASE: 'http://127.0.0.1:24050/Songs/',

    ALIGNMENT: 'Bottom',   // 对齐方式 ('Top', 'Bottom', 'Center')
    OPACITY: 100,          // 透明度 (0-100)
    SHOW_IN_MENU: true,    // 游戏外可见
    USE_FIXED_COLOR: false,// 是否固定颜色
    FIXED_COLOR: '#4db8ff',// 固定颜色值

    // --- 2. 渲染与物理系统配置 ---
    NUM_BARS: 30,          // 频谱条数量
    SENSITIVITY: 1.2,      // 全局灵敏度乘数
    EXPONENT: 3,           // 动态张力系数
    GRAVITY: 0.07,         // 物理重力下落速度
    NOISE_GATE: 0.02,      // 静音门限

    // --- 3. 音频分析配置  ---
    MIN_FREQ: 40,          // 最低频率
    MAX_FREQ: 12000,       // 最高频率
    FFT_SIZE: 4096,        // FFT大小
    SMOOTHING_TIME: 0.2,   // 原生时间平滑度

    // --- 4. 主题与颜色配置 ---
    DEFAULT_COLOR: { r: 255, g: 255, b: 255 }, 
    COLOR_OFFSET: 20,      
    MIN_LUMA: 40           
};
