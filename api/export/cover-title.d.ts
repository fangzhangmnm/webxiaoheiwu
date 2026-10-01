export interface CoverCell {
    text: string;
    x: number;
    y: number;
    size: number; /** 顺时针转 90°（以 x, y 为轴） */
    rotate?: 90; /** 这段字在书名里的前文 / 后文（注音字体按词选读音用） */
    before?: string;
    after?: string;
}
export interface CoverPad {
    x: number;
    y: number;
    w: number;
    h: number; /** 圆角半径 */
    r: number;
}
export interface CoverTitleLayout {
    vertical: boolean;
    size: number;
    cells: CoverCell[];
    date: CoverCell | null; /** 装订线的宽（0 = 没有） */
    spineW: number;
    truncated: boolean;
    /** 字底下垫的圆角矩形：**书名整段一块**（所有列的包围盒——一列一块的话相邻两块叠在一起的地方颜色会加深，user 2026-10-01「两列字的交接处半透明overlap了，你能不能算一个bbox然后用圆角矩形」）+ 日期一块。
     *  书名压在封面图上时，调用方用半透明的纸色把它们先画出来（user「标题的字下面还是垫一个半透明吧」）。 */
    pads: CoverPad[];
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
