import { Config } from './config.js';

export class PrecomputedAnalyzer {
    constructor() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.isReady = false;
        this.currentUrl = "";
        
        this.channelData = null;
        this.sampleRate = 44100;

        // 预分配内存，避免每秒 60 帧创建数组导致垃圾回收 (GC) 卡顿
        this.windowSize = Config.FFT_SIZE || 4096;
        this.re = new Float32Array(this.windowSize);
        this.im = new Float32Array(this.windowSize);
        this.magnitudes = new Float32Array(this.windowSize / 2);
    }

    async loadAndAnalyze(url) {
        if (this.currentUrl === url) return;
        this.currentUrl = url;
        this.isReady = false;
        this.channelData = null;

        try {
            console.log("[Analyzer] 开始获取并解码音频...");
            
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();

            // decodeAudioData 会在浏览器的底层 C++ 线程中飞速解码，完全不卡 JS 主线程
            const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);

            // 如果解码期间没有切歌，则装载数据
            if (this.currentUrl === url) {
                this.channelData = audioBuffer.getChannelData(0);
                this.sampleRate = audioBuffer.sampleRate;
                this.isReady = true;
                
                console.log("[Analyzer] 音频就绪！彻底告别预计算，开启即时渲染！");
            }
        } catch (err) {
            console.error("[Analyzer] 音频加载/解码失败:", err);
            this.isReady = false;
        }
    }

    // 在位 (in-place) 快速傅里叶变换，速度极快
    fft(re, im) {
        const N = re.length;
        let j = 0;
        for (let i = 0; i < N - 1; i++) {
            if (i < j) {
                let tr = re[j], ti = im[j];
                re[j] = re[i]; im[j] = im[i];
                re[i] = tr; im[i] = ti;
            }
            let m = N / 2;
            while (m <= j) { j -= m; m /= 2; }
            j += m;
        }
        for (let size = 2; size <= N; size *= 2) {
            let half = size / 2;
            let step = (-2 * Math.PI) / size;
            for (let i = 0; i < N; i += size) {
                let wRe = 1, wIm = 0;
                let wStepRe = Math.cos(step), wStepIm = Math.sin(step);
                for (let k = 0; k < half; k++) {
                    let match = i + k;
                    let matchHalf = match + half;
                    let tRe = wRe * re[matchHalf] - wIm * im[matchHalf];
                    let tIm = wRe * im[matchHalf] + wIm * re[matchHalf];
                    re[matchHalf] = re[match] - tRe;
                    im[matchHalf] = im[match] - tIm;
                    re[match] += tRe;
                    im[match] += tIm;
                    
                    let nextWRe = wRe * wStepRe - wIm * wStepIm;
                    let nextWIm = wRe * wStepIm + wIm * wStepRe;
                    wRe = nextWRe; wIm = nextWIm;
                }
            }
        }
    }

    mapToLogBands(magnitudes, sampleRate, windowSize, minFreq, maxFreq, numBars) {
        const logBands = new Array(numBars).fill(0);
        const nyquist = sampleRate / 2;
        const minLog = Math.log10(minFreq);
        const maxLog = Math.log10(maxFreq);
        const logRange = maxLog - minLog;
        const binFreq = nyquist / (windowSize / 2); 

        for (let i = 0; i < numBars; i++) {
            const startFreq = Math.pow(10, minLog + (i / numBars) * logRange);
            const endFreq = Math.pow(10, minLog + ((i + 1) / numBars) * logRange);

            const startIndex = Math.floor(startFreq / binFreq);
            let endIndex = Math.floor(endFreq / binFreq);
            if (endIndex <= startIndex) endIndex = startIndex + 1;

            let sum = 0;
            let maxMag = 0;
            let count = 0;
            for (let j = startIndex; j < endIndex && j < magnitudes.length; j++) {
                sum += magnitudes[j];
                if (magnitudes[j] > maxMag) maxMag = magnitudes[j];
                count++;
            }
            
            // 混合算法：70% 峰值 + 30% 平均值，保证高频细节
            logBands[i] = count > 0 ? (sum / count) * 0.3 + maxMag * 0.7 : 0;
        }
        return logBands;
    }

    // 每帧调用一次，实时抓取当前时间的波形进行单次 FFT 计算
    getFrame(time) {
        const numBars = Config.NUM_BARS || 30;
        
        if (!this.isReady || !this.channelData) {
            return new Array(numBars).fill(0);
        }

        // 检测配置是否动态修改了 FFT 大小
        if (this.windowSize !== (Config.FFT_SIZE || 4096)) {
            this.windowSize = Config.FFT_SIZE || 4096;
            this.re = new Float32Array(this.windowSize);
            this.im = new Float32Array(this.windowSize);
            this.magnitudes = new Float32Array(this.windowSize / 2);
        }

        // 定位当前时间在 PCM 数组中的索引
        const startIndex = Math.floor(time * this.sampleRate);
        const dataLen = this.channelData.length;
        
        // 装载当前时间的波形数据，并套用汉宁窗 (Hanning Window) 以平滑边缘
        for (let i = 0; i < this.windowSize; i++) {
            let sampleIndex = startIndex + i;
            let val = (sampleIndex >= 0 && sampleIndex < dataLen) ? this.channelData[sampleIndex] : 0;
            
            let multiplier = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (this.windowSize - 1)));
            this.re[i] = val * multiplier;
            this.im[i] = 0; 
        }

        // 仅对当前的这 4096 个点做一次极速 FFT
        this.fft(this.re, this.im);

        const half = this.windowSize / 2;
        for (let i = 0; i < half; i++) {
            let mag = Math.sqrt(this.re[i] * this.re[i] + this.im[i] * this.im[i]) * (2 / this.windowSize);
            
            // 频响均衡 (EQ Pre-emphasis)
            let currentFreq = i * (this.sampleRate / this.windowSize);
            let eqWeight = Math.max(1, Math.pow(currentFreq / 100, 0.45)); 
            mag = mag * eqWeight;
            
            // 转换为分贝并映射到 0~255
            let db = 20 * Math.log10(mag + 1e-6); 
            let mapped = ((db - (-85)) / ((-10) - (-85))) * 255;
            this.magnitudes[i] = Math.max(0, Math.min(255, mapped));
        }

        const minFreq = Config.MIN_FREQ || 40;
        const maxFreq = Math.min(Config.MAX_FREQ || 12000, this.sampleRate / 2);
        
        return this.mapToLogBands(this.magnitudes, this.sampleRate, this.windowSize, minFreq, maxFreq, numBars);
    }
}
