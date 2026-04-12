import { Config } from './config.js';

// 辅助函数: 16进制颜色转 RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
}

export class ThemeManager {
    constructor() {
        this.color = { ...Config.DEFAULT_COLOR };
    }

    update(imgUrl) {
        if (!imgUrl || imgUrl.endsWith('/')) {
            console.warn("[ThemeManager] 背景路径为空，跳过取色，使用默认颜色");
            this.color = { ...Config.DEFAULT_COLOR };
            return;
        }

        const img = new Image();
        img.crossOrigin = "Anonymous";
        
        img.onload = () => {
            try {
                const tempCanvas = document.createElement('canvas');
                const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                
                // 与 kps 插件保持一致：降低分辨率提取以优化性能
                tempCanvas.width = 50; 
                tempCanvas.height = 50;
                tCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
                
                const imgData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
                let rSum = 0, gSum = 0, bSum = 0, count = 0;
                
                // 步长为4 (R, G, B, A)
                for (let i = 0; i < imgData.length; i += 4) {
                    // 与 kps 插件保持一致：简单过滤掉过于偏黑或偏白的像素，避免主题色发灰
                    if ((imgData[i] < 30 && imgData[i+1] < 30 && imgData[i+2] < 30) || 
                        (imgData[i] > 230 && imgData[i+1] > 230 && imgData[i+2] > 230)) {
                        continue;
                    }
                    rSum += imgData[i];
                    gSum += imgData[i+1];
                    bSum += imgData[i+2];
                    count++;
                }
                
                if (count > 0) {
                    const rAvg = Math.floor(rSum / count);
                    const gAvg = Math.floor(gSum / count);
                    const bAvg = Math.floor(bSum / count);
                    
                    const offset = Config.COLOR_OFFSET || 0;
                    this.color = { 
                        r: Math.min(rAvg + offset, 255), 
                        g: Math.min(gAvg + offset, 255), 
                        b: Math.min(bAvg + offset, 255) 
                    };
                    console.log(`[ThemeManager] 背景取色成功: rgb(${this.color.r}, ${this.color.g}, ${this.color.b})`);
                } else {
                    this.color = { ...Config.DEFAULT_COLOR };
                }
            } catch (e) {
                console.error("[ThemeManager] 取色处理发生异常:", e);
                this.color = { ...Config.DEFAULT_COLOR };
            }
        };

        img.onerror = () => {
            console.warn(`[ThemeManager] 背景图片加载失败，可能是纯净谱面或跨域拦截: ${imgUrl}`);
            this.color = { ...Config.DEFAULT_COLOR };
        };

        img.src = imgUrl;
    }

    getColor() {
        if (Config.USE_FIXED_COLOR) {
            return hexToRgb(Config.FIXED_COLOR);
        }
        return this.color;
    }
}
