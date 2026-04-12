import { Config } from './config.js';

export class PrecomputedAnalyzer {
    constructor() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.globalSpectrum = []; 
        this.fps = 60; 
        this.isProcessing = false;
        this.currentUrl = "";
    }

    async loadAndAnalyze(url) {
        if (this.currentUrl === url) return;
        this.currentUrl = url;
        this.isProcessing = true;
        this.globalSpectrum = []; 

        try {
            console.log("开始预加载音频并离线分析...");
            
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();

            const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
            const channelData = audioBuffer.getChannelData(0); 
            const sampleRate = audioBuffer.sampleRate;
            const duration = audioBuffer.duration;

            const frameCount = Math.ceil(duration * this.fps);
            const windowSize = 2048; 
            const tempSpectrum = new Array(frameCount);
            
            const minFreq = Config.MIN_FREQ || 40;
            const maxFreq = Math.min(Config.MAX_FREQ || 12000, sampleRate / 2);
            const numBars = Config.NUM_BARS;

            for (let f = 0; f < frameCount; f++) {
                const startIndex = Math.floor((f / this.fps) * sampleRate);
                const re = new Float32Array(windowSize);
                const im = new Float32Array(windowSize);

                for (let i = 0; i < windowSize; i++) {
                    let val = channelData[startIndex + i] || 0;
                    let multiplier = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)));
                    re[i] = val * multiplier;
                }

                this.fft(re, im);

                const half = windowSize / 2;
                const magnitudes = new Float32Array(half);
                for (let i = 0; i < half; i++) {
                    let mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]) * (2 / windowSize);
                    
                    // --- 核心修复 1: 频响均衡 (EQ Pre-emphasis) ---
                    // 模拟人耳听觉特性，按照频率的指数级逐渐放大高频振幅
                    // 这样就能把隐藏在微小物理能量中的高频节奏给“拔”出来
                    let currentFreq = i * (sampleRate / windowSize);
                    let eqWeight = Math.max(1, Math.pow(currentFreq / 100, 0.45)); 
                    mag = mag * eqWeight;
                    // ---------------------------------------------
                    
                    let db = 20 * Math.log10(mag + 1e-6); 
                    
                    let mapped = ((db - (-85)) / ((-10) - (-85))) * 255;
                    magnitudes[i] = Math.max(0, Math.min(255, mapped));
                }

                tempSpectrum[f] = this.mapToLogBands(magnitudes, sampleRate, windowSize, minFreq, maxFreq, numBars);
            }

            this.globalSpectrum = tempSpectrum;
            this.isProcessing = false;
            console.log(`全量预分析完成！共生成 ${frameCount} 帧数据。`);

        } catch (err) {
            console.error("音频预计算失败:", err);
            this.isProcessing = false;
        }
    }

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
                // 记录该频段内的最大峰值
                if (magnitudes[j] > maxMag) maxMag = magnitudes[j];
                count++;
            }
            
            // 越靠右的柱子，包含的频率跨度越大（对数特性）。如果纯算平均值，高频的一声脆响会被周围静音的频带稀释掉。
            // 这里采用 70%峰值 + 30%平均值 的混合算法，确保高频细节能冲破重围显示出来
            logBands[i] = count > 0 ? (sum / count) * 0.3 + maxMag * 0.7 : 0;
        }
        return logBands;
    }

    getFrame(time) {
        if (this.isProcessing || this.globalSpectrum.length === 0) {
            return new Array(Config.NUM_BARS).fill(0);
        }
        const frameIndex = Math.floor(time * this.fps);
        const safeIndex = Math.max(0, Math.min(frameIndex, this.globalSpectrum.length - 1));
        return this.globalSpectrum[safeIndex];
    }
}
