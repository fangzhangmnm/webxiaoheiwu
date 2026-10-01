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
/** 编辑器贡献的「样子」（app 层从 computed style 量来）：字体栈、纸色 / 墨色、写字线颜色（null = 没开）。 */
export interface LongImageLook {
    family: string;
    paper: string;
    ink: string;
    inkSoft: string;
    muted: string;
    rule: string | null;
}
/** 排版引擎的输入：每行几个字 + 像素/字 + 行距倍数。charsPerLine = 设置 → 行宽（user「导出跟编辑器的行宽走啊」），其余由档推出。 */
export interface ExportTypeset {
    charsPerLine: number;
    pxPerChar: number;
    lineHeightRatio: number; /** 注音带（em）：加在行距上面的那一截——汉字照旧坐在线上、离行底不变，拼音往上长（2026-09-30 萌神对齐）。缺省 0。 */
    rubyBand?: number;
}
/** 像素/字定死（不是用户选项）：30 → 20 字/行 684 宽。 */
export declare const PX_PER_CHAR = 30;
/** 每行字数的离散选项（user「行宽还是三档吧。我这种有阅读写作障碍的用比手机还极端的第三档」「诗歌啊小故事啊，或者需要刻意自律篇幅的时候」「随便写一点看着就蛮多=点燃引擎」）：
 *  14 极端短行（诗 / 小故事 / 自律篇幅；user 数过「应该是 14」；800 字 ≈ 4 屏半）· 20 高考作文格 / 网文 app 默认区间（800 字 ≈ 2 屏）· 28 纸书 32 开（800 字 ≈ 1 屏）。 */
export declare const CHARS_PRESETS: readonly number[];
export declare const typesetFor: (charsPerLine: number) => ExportTypeset;
/** 图宽 = 字数 × 像素/字 + 两边各 1.4 字。 */
export declare const widthFor: (ts: ExportTypeset) => number;
export interface LongImageSpec {
    title: string;
    date: string | null;
    cover: ImageRef | null;
    /** 封面 + 书名 + 日期那一段。整本 / 整篇才有；false = 从第一页的章节名直接开始（这一页 / 这一支；user 2026-10-01「这一支的话是不是就应该没有书名和封面了」）。缺省 true。 */
    front?: boolean;
    /** 注音字体：把一行字换成「带读音标记」的同一行（多音字后面补变体选择符，见 ttf.ts annotate）。折行、量宽都用原文，只有画的时候用它的结果；
     *  before / after = 同一段里上一行的尾、下一行的头（词被折行拆开时靠它选对读音）。不给 = 原样画。 */
    annotate?: (before: string, line: string, after: string) => string;
    sections: LongImageSection[];
    look: LongImageLook;
    typeset: ExportTypeset;
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
/** totalHeight = 不切时一整张的高（决定要不要问 user 切法）；width = 图宽。 */
export interface LongImagePlan {
    slices: LongImageSlice[];
    width: number;
    totalHeight: number;
    cjk: number;
    en: number;
    textPages: number;
    imagePages: number;
}
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
