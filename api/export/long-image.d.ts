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
    /** 图宽（默认 1080 = 手机长图的通行宽度）。 */
    width?: number;
    /** 「一屏」多高（默认 1920）与每张最多几屏（默认 3）：超过就在行间切开。 */
    screenHeight?: number;
    screensPerSlice?: number;
    /** 页脚「第 i / n 张」的文案（只在切成多张时印）。 */
    sliceLabel: (i: number, n: number) => string;
}
export interface LongImageSlice {
    w: number;
    h: number;
    ops: SceneOp[];
}
export interface LongImagePlan {
    slices: LongImageSlice[];
    cjk: number;
    en: number;
    textPages: number;
    imagePages: number;
}
/** 按编辑器的规矩折一行：CJK 逐字可断、拉丁按词、超宽的词按字符断、断点处的空格丢掉、避头尾。 */
export declare function wrapText(text: string, maxW: number, style: TextStyle, m: TextMeasurer): string[];
export declare function planLongImage(spec: LongImageSpec, m: TextMeasurer): LongImagePlan;
