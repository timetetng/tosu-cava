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
            console.warn("背景路径为空，跳过取色，使用默认颜色");
            this.color = { ...Config.DEFAULT_COLOR };
            return;
        }

        const img = new Image();
        img.crossOrigin = "Anonymous";
        
        img.onload = () => {
            try {
                const tempCanvas = document.createElement('canvas');
                const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                tempCanvas.width = 1; 
                tempCanvas.height = 1;
                
                // 开启平滑抗锯齿，强制让浏览器进行像素混合
                tCtx.imageSmoothingEnabled = true;
                tCtx.imageSmoothingQuality = 'high';

                const cropW = img.width * 0.5;
                const cropH = img.height * 0.5;
                const startX = img.width * 0.25;
                const startY = img.height * 0.25;
                
                tCtx.drawImage(img, startX, startY, cropW, cropH, 0, 0, 1, 1);
                const [r, g, b] = tCtx.getImageData(0, 0, 1, 1).data;
                
                const offset = Config.COLOR_OFFSET;
                this.color = { 
                    r: Math.min(r + offset, 255), 
                    g: Math.min(g + offset, 255), 
                    b: Math.min(b + offset, 255) 
                };
                console.log(`[ThemeManager] 背景取色成功: rgb(${this.color.r}, ${this.color.g}, ${this.color.b})`);
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
