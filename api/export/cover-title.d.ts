export interface CoverCell {
    text: string;
    x: number;
    y: number;
    size: number; /** 顺时针转 90°（以 x, y 为轴） */
    rotate?: 90; /** 这段字在书名里的前文 / 后文（注音字体按词选读音用） */
    before?: string;
    after?: string;
}
export interface CoverTitleLayout {
    vertical: boolean;
    size: number;
    cells: CoverCell[];
    date: CoverCell | null; /** 装订线的宽（0 = 没有） */
    spineW: number;
    truncated: boolean;
}
export interface CoverTitleOpts {
    title: string;
    date: string | null;
    W: number;
    H: number;
    /** 画不画装订线（书、且底下不是封面图）。 */
    spine: boolean;
    width: (text: string, size: number) => number;
    /** 汉字墨迹的上下伸（按 size）。 */
    ink: (size: number) => {
        asc: number;
        desc: number;
    };
    /** 横排折行（调用方给：long-image.wrapText）。 */
    wrap: (text: string, maxW: number, size: number) => string[];
    /** 注音字体：每个字头上的拼音带有多高（字的倍数）。缺省 0。 */
    ruby?: number;
}
export declare function layoutCoverTitle(o: CoverTitleOpts): CoverTitleLayout;
