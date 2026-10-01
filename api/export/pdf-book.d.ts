import type { PdfDoc, PdfImage, Rgb } from "./pdf.ts";
import type { TtfFont } from "./ttf.ts";
import { type ExportTypeset } from "./long-image.ts";
import type { TextMeasurer } from "../image/codec.ts";
export type PdfSection = {
    kind: "text";
    heading: string | null;
    text: string;
} | {
    kind: "image";
    heading: null;
    image: PdfImage;
};
export interface PdfBookLook {
    paper: string;
    ink: string;
    inkSoft: string;
    muted: string;
    rule: string | null;
}
export interface PdfBookSpec {
    title: string;
    date: string | null;
    cover: PdfImage | null;
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
/** 正文字号（pt）。PDF 是矢量：阅读器贴屏宽显示，这个数只定页面比例和打印出来的大小。 */
export declare const PDF_FONT_PT = 16;
/** CSS 颜色串（`#rgb` / `#rrggbb` / `rgb()` / `rgba()`）→ 0..1 的 RGB；认不出 → 黑。 */
export declare function parseCssColor(s: string): Rgb;
/** 用字体自己的度量量字宽（给 wrapText）。没有的字按 .notdef 的宽算。 */
export declare function fontMeasurer(font: TtfFont): TextMeasurer;
export declare function planPdfBook(spec: PdfBookSpec): PdfBookPlan;
