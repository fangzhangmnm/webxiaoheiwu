import type { SceneOp, TextMeasurer, TextStyle } from "../image/codec.ts";
export interface ImageRef {
    blob: Blob;
    w: number;
    h: number;
}
export type LongImageSection = {
    kind: "text";
    heading: string | null;
    text: string;
} | {
    kind: "image";
    heading: string | null;
    image: ImageRef;
};
/** 编辑器此刻的样子（app 层从 computed style 量来）。innerWidth = 正文框的 CSS 宽（折行的尺子）；lineHeight = paper.lineHeight()；ruleY = 写字线在一行里的位置（CSS px），rule = 线色或 null（没开写字线）。 */
export interface LongImageLook {
    family: string;
    fontPx: number;
    lineHeight: number;
    innerWidth: number;
    paper: string;
    ink: string;
    inkSoft: string;
    muted: string;
    rule: string | null;
    ruleY: number;
}
export interface LongImageSpec {
    title: string;
    date: string | null;
    cover: ImageRef | null;
    sections: LongImageSection[];
    look: LongImageLook;
    /** 图宽（默认 DEFAULT_WIDTH = 750）。 */
    width?: number;
    /** 页脚「第 i / n 张」的文案（只在切成多张时印）。 */
    sliceLabel: (i: number, n: number) => string;
}
/** hasImage：这张里有照片（封面 / 插图页）→ 调用方选 JPEG；纯文字 → 调色板 PNG（更小也更锐）。 */
export interface LongImageSlice {
    w: number;
    h: number;
    ops: SceneOp[];
    hasImage: boolean;
}
/** totalHeight = 不切时一整张的高（决定要不要问 user 切法）。 */
export interface LongImagePlan {
    slices: LongImageSlice[];
    totalHeight: number;
    cjk: number;
    en: number;
    textPages: number;
    imagePages: number;
}
export declare const DEFAULT_WIDTH = 750;
/** 单张上限（px 高）：手机图片管线的纹理上限 16384（Android 硬件位图 / iOS Metal），iOS Safari 画布面积 ≈ 16.7M px 在 750 宽下 ≈ 22k 不是瓶颈；留余量取 16000。超过 = 问 user 切法（user 2026-09-30「超上限了弹窗让用户决策吧」）。 */
export declare const SINGLE_IMAGE_MAX_HEIGHT = 16000;
/** 「一屏」= 宽 × 16/9（手机竖屏）。 */
export declare const screenHeightFor: (w: number) => number;
/** 社交切片：约三屏一张（朋友圈 / 小红书 feed 那种），user 明确选了才用。 */
export declare const socialSliceHeightFor: (w: number) => number;
/** 按编辑器的规矩折一行：CJK 逐字可断、拉丁按词、超宽的词按字符断、断点处的空格丢掉、避头尾。 */
export declare function wrapText(text: string, maxW: number, style: TextStyle, m: TextMeasurer): string[];
export declare function planLongImage(spec: LongImageSpec, m: TextMeasurer, opts?: {
    maxSliceHeight?: number;
}): LongImagePlan;
