import { Config } from './config.js';

export class SpectrumRenderer {
    constructor(target, options = {}) {
        this.canvas = typeof target === 'string' ? document.getElementById(target) : target;
        this.ctx = this.canvas.getContext('2d');

        this.smoothHeights = [];
        this.velocities = []; 

        this.resize();
        this._resizeHandler = this.resize.bind(this);
        window.addEventListener('resize', this._resizeHandler);
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        
        this.width = rect.width;
        this.height = rect.height;
    }

    setOpacity(opacity) {
        this.canvas.style.opacity = opacity;
    }

    draw(logBands, themeColor) {
        this.ctx.clearRect(0, 0, this.width, this.height);

        // 实时读取最新的配置
        const numBars = Config.NUM_BARS;
        const sensitivity = Config.SENSITIVITY;
        const exponent = Config.EXPONENT;
        const gravity = Config.GRAVITY;
        const noiseGate = Config.NOISE_GATE;
        const alignment = (Config.ALIGNMENT || 'Bottom').toLowerCase(); // top, bottom, center

        // 如果用户在控制台修改了条数，动态调整数组大小
        if (this.smoothHeights.length !== numBars) {
            this.smoothHeights = new Array(numBars).fill(0);
            this.velocities = new Array(numBars).fill(0);
        }
        
        const barWidth = (this.width / numBars) * 0.6; 
        const gap = (this.width / numBars) * 0.4;      
        
        // 发光与渐变预留 padding
        const padding = barWidth * 2; 
        const maxHeight = this.height - padding * 2; 
        const minHeight = barWidth; 

        let { r, g, b } = themeColor;
        
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const minLuma = Config.MIN_LUMA; 
        if (luma < minLuma) {
            const ratio = minLuma / (luma || 1);
            r = Math.min(255, r * ratio);
            g = Math.min(255, g * ratio);
            b = Math.min(255, b * ratio);
        }

        const offset = Config.COLOR_OFFSET;
        const lightR = Math.min(255, r + offset);
        const lightG = Math.min(255, g + offset);
        const lightB = Math.min(255, b + offset);

        this.ctx.shadowBlur = barWidth * 1.5;
        this.ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.7)`; 

        // 根据对齐方式调整渐变方向
        let gradient;
        if (alignment === 'top') {
            gradient = this.ctx.createLinearGradient(0, padding, 0, padding + maxHeight);
        } else if (alignment === 'center') {
            gradient = this.ctx.createLinearGradient(0, this.height - padding, 0, padding);
        } else {
            // bottom 默认
            gradient = this.ctx.createLinearGradient(0, this.height - padding, 0, this.height - padding - maxHeight);
        }
        
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.5)`); 
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.9)`); 
        gradient.addColorStop(1, `rgba(${lightR}, ${lightG}, ${lightB}, 1.0)`); 
        
        this.ctx.fillStyle = gradient;

        for (let i = 0; i < numBars; i++) {
            let value = (logBands[i] || 0) / 255.0;
            if (value <= noiseGate) {
                value = 0;
            } else {
                value = (value - noiseGate) / (1 - noiseGate);
            }

            let targetHeight = Math.pow(value, exponent) * sensitivity * maxHeight;
            targetHeight = Math.min(targetHeight, maxHeight); 

            if (targetHeight > this.smoothHeights[i]) {
                this.smoothHeights[i] += (targetHeight - this.smoothHeights[i]) * 0.45;
                this.velocities[i] = 0; 
            } else {
                this.velocities[i] += gravity * maxHeight * 0.05; 
                this.smoothHeights[i] -= this.velocities[i];      
            }

            if (this.smoothHeights[i] < minHeight) {
                this.smoothHeights[i] = minHeight;
                this.velocities[i] = 0; 
            }

            const h = this.smoothHeights[i];
            const x = i * (barWidth + gap) + gap / 2;
            
            let y;
            if (alignment === 'top') {
                y = padding; // 从上往下画
            } else if (alignment === 'center') {
                y = (this.height - h) / 2; // 从中间画
            } else { // bottom
                y = this.height - padding - h; // 从下往上画
            }

            this.ctx.beginPath();
            if (this.ctx.roundRect) {
                this.ctx.roundRect(x, y, barWidth, h, barWidth / 2);
            } else {
                this.ctx.rect(x, y, barWidth, h);
            }
            
            this.ctx.fill();
        }
    }

    dispose() {
        window.removeEventListener('resize', this._resizeHandler);
    }
}
