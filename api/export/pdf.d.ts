import type { TtfFont } from "./ttf.ts";
export type Rgb = [number, number, number];
export interface PdfImage {
    jpeg: Uint8Array;
    w: number;
    h: number;
    components: 1 | 3 | 4;
}
/** 一页上的东西（页面坐标：左上原点，单位 pt）。text 的 y = 基线。 */
export type PdfOp = {
    op: "rect";
    x: number;
    y: number;
    w: number;
    h: number;
    color: Rgb;
} | {
    op: "line";
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: Rgb;
    width: number;
} | {
    op: "text";
    x: number;
    y: number;
    text: string;
    size: number;
    color: Rgb; /** 这一行在段落里的前文 / 后文（不画，只给注音字体按词选读音用——词可能正好被折行拆开）。 */
    before?: string;
    after?: string; /** 顺时针转 90°（以 x, y 为轴；竖排里侧躺的拉丁串 / 括号） */
    rotate?: 90; /** 先描一圈边再填（封面图上的书名：一圈纸色，字才看得清）。描边那一遍用另一个字体名 /F2（同一份字形，但它的 ToUnicode 全映到零宽空格）——否则阅读器抽字 / 复制时每个字出现两次。 */
    stroke?: {
        color: Rgb;
        width: number;
    }; /** 只描边不填（调用方想把一组字的描边排在前、填充排在后，让抽出来的字连在一起） */
    noFill?: boolean;
} | {
    op: "image";
    x: number;
    y: number;
    w: number;
    h: number;
    image: PdfImage;
};
/** 页内链接：这一页上的一块矩形（左上角坐标系，和 ops 一样），点了跳到第 page 页（从 0 起）。 */
export interface PdfLink {
    x: number;
    y: number;
    w: number;
    h: number;
    page: number;
}
export interface PdfPage {
    w: number;
    h: number;
    ops: PdfOp[];
    links?: PdfLink[];
}
export interface PdfOutlineItem {
    title: string;
    page: number;
}
export interface PdfDoc {
    title: string;
    pages: PdfPage[];
    outline?: PdfOutlineItem[];
    producer?: string;
}
export interface PdfStats {
    glyphs: number;
    missing: string[];
    fontBytes: number;
}
/** JPEG 的宽高和通道数（读 SOF 段）。不是 JPEG → null。 */
export declare function jpegInfo(b: Uint8Array): {
    w: number;
    h: number;
    components: 1 | 3 | 4;
} | null;
/** 把一份文档写成 PDF 字节。font = 解析好的 TTF（整份字体的字节在它里面，子集在这里取）。 */
export declare function writePdf(doc: PdfDoc, font: TtfFont, opts?: {
    stats?: PdfStats;
}): Uint8Array;
