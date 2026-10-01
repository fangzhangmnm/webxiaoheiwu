export interface TtfFont {
    unitsPerEm: number;
    /** hhea 的上下伸（字体单位）。注音字体会把拼音带算进去——排版别用它定汉字位置，用 inkOf。 */
    ascender: number;
    descender: number;
    capHeight: number;
    bbox: [number, number, number, number];
    numGlyphs: number;
    /** PostScript 名（name id 6；没有就 "Font"）。只含可打印 ASCII。 */
    psName: string;
    /** 码点 → 字形号；0 = 这款字体里没有。 */
    glyphId(codePoint: number): number;
    /** 字形的前进宽（字体单位）。 */
    advance(gid: number): number;
    /** 字形墨迹框 [xMin, yMin, xMax, yMax]（字体单位）；空字形 → null。 */
    inkOf(gid: number): [number, number, number, number] | null;
    /** 只留这些字形（外加 .notdef 与复合字形的部件）的 TTF。字形号不变。 */
    subset(gids: Iterable<number>): Uint8Array;
}
export declare class NotTrueTypeError extends Error {
    name: string;
}
export declare function parseTtf(bytes: Uint8Array): TtfFont;
