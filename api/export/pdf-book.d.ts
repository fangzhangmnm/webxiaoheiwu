import type { PdfDoc, PdfImage, Rgb } from "./pdf.ts";
import type { TtfFont } from "./ttf.ts";
import { type ExportTypeset } from "./long-image.ts";
import type { TextMeasurer } from "../image/codec.ts";
export type PdfSection = {
    kind: "text";
    heading: string | null;
    text: string; /** 子节目录：正文后面空一行列出来，每行链到那一节的第一页、行尾印页码。target = sections 里的序号。 */
    toc?: PdfTocEntry[];
} | {
    kind: "image";
    heading: null;
    image: PdfImage;
};
export interface PdfTocEntry {
    label: string;
    target: number;
}
export interface PdfBookLook {
    paper: string;
    ink: string;
    inkSoft: string;
    muted: string;
    rule: string | null; /** 目录链接的颜色（编辑器里子节目录那种）；不给 = 墨色 */
    link?: string;
}
export interface PdfBookSpec {
    title: string;
    date: string | null;
    cover: PdfImage | null;
    /** 封面页 + 书名页。整本 / 整篇才有；false = 第一页就是正文（这一页 / 这一支）。缺省 true。 */
    front?: boolean;
    sections: PdfSection[];
    look: PdfBookLook;
    typeset: ExportTypeset;
    font: TtfFont;
}
export interface PdfBookPlan {
    doc: PdfDoc;
    cjk: number;
    en: number;
    textPages: number;
    imagePages: number;
    pageCount: number;
    pageW: number;
    pageH: number;
}
/** 折行时带给注音字体的前后文长度（字）。萌神的词表最长四五个字。 */
export declare const CONTEXT_CHARS = 6;
/** 正文字号（pt）= 实体字号：按 100% 打印出来就是这么大（屏上阅读器贴屏宽显示，20 字档的页宽 78 mm ≈ 手机屏宽）。 */
export declare const PDF_FONT_PT = 9;
/** 页面宽高比（宽 : 高 = 1 : √2）。 */
export declare const PDF_PAGE_RATIO: number;
/** 留白（单位 = 字）：左右各 SIDE，上 TOP，下 BOTTOM（含页码）。 */
export declare const PDF_MARGIN_EM: {
    readonly side: 2.2;
    readonly top: 2.4;
    readonly bottom: 2.6;
};
/** 这一档的页面几何（pt）与每页行数。纯算术，不要字体。 */
export declare function pdfPageGeometry(typeset: ExportTypeset): {
    w: number;
    h: number;
    side: number;
    top: number;
    bottom: number;
    lineHeight: number;
    linesPerPage: number;
};
/** CSS 颜色串（`#rgb` / `#rrggbb` / `rgb()` / `rgba()` / `color(srgb r g b)`）→ 0..1 的 RGB；认不出 → 黑。 */
export declare function parseCssColor(s: string): Rgb;
/** 用字体自己的度量量字宽（给 wrapText）。没有的字按 .notdef 的宽算。 */
export declare function fontMeasurer(font: TtfFont): TextMeasurer;
export declare function planPdfBook(spec: PdfBookSpec): PdfBookPlan;
