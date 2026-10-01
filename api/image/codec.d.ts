import type { RgbaImage } from "@internal/gallery";
export type { RgbaImage };
/** 解码边界：浏览器解码 + canvas 读出**一次** → straight RGBA 字节。GIF 取首帧。 */
export declare function decodeToRgba(blob: Blob): Promise<RgbaImage>;
/** 只读尺寸（不读像素）。 */
export declare function probeSize(blob: Blob): Promise<{
    w: number;
    h: number;
}>;
/** JPEG 编码（vendored jpeg-js，惰性加载）。输入不透明 RGBA（alpha 忽略，调用方先拍平白底）。 */
export declare function encodeJpeg(rgba: Uint8ClampedArray, w: number, h: number, quality: number): Promise<Uint8Array>;
/** PNG 编码（vendored UPNG，惰性加载）：colors=0 无损 RGBA8；>0 调色板量化（封面缩略图预算档）。 */
export declare function encodePng(rgba: Uint8ClampedArray, w: number, h: number, colors: number): Promise<Uint8Array>;
export interface TextStyle {
    family: string;
    sizePx: number;
    weight?: number | string;
    color: string;
}
export type SceneOp = {
    op: "rect";
    x: number;
    y: number;
    w: number;
    h: number;
    color: string; /** 不透明度 0..1（缺省 1） */
    alpha?: number;
} | {
    op: "line";
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
    width: number;
} | {
    op: "text";
    x: number;
    y: number;
    text: string;
    style: TextStyle;
    align?: "left" | "center" | "right"; /** 顺时针转 90°（以 x, y 为轴） */
    rotate?: 90;
} | {
    op: "image";
    x: number;
    y: number;
    w: number;
    h: number;
    blob: Blob;
    crop?: {
        sx: number;
        sy: number;
        sw: number;
        sh: number;
    };
};
export interface TextMeasurer {
    width(text: string, style: TextStyle): number;
    ascent(style: TextStyle): {
        asc: number;
        desc: number;
    }; /** 汉字本体的墨迹上下伸（量「国」；不看字体自报的 ascent——注音字体会把拼音带算进去，各平台取的表还不一样）。 */
    ink(style: TextStyle): {
        asc: number;
        desc: number;
    };
}
/** 量字宽（一个 8×8 的量尺 canvas，单字宽度有缓存）。ascent = 字体的上下伸（浏览器不给 fontBoundingBox 就按 CJK 常见比例估）。 */
export declare function createTextMeasurer(): TextMeasurer;
/** 把显示列表画成一张 RGBA（bg 先铺满）。图片 op 经浏览器解码器 + drawImage（高质量重采样）；画完读出一次。 */
export declare function paintScene(w: number, h: number, bg: string, ops: SceneOp[]): Promise<RgbaImage>;
