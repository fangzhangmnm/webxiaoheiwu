export interface CoverPlan {
    date: string | null;
    title: string;
    vertical: boolean;
    size: "xl" | "l" | "m" | "s";
    coded: boolean;
}
/** 这个名字的封面怎么排（纯函数，测试用它）。 */
/** 书名（已经拆掉日期）竖排还是横排、字号第几档。书架封面和导出封面（export/cover-title.ts）共用这一条规则。 */
export declare function coverTypo(title: string): {
    vertical: boolean;
    size: CoverPlan["size"];
};
export declare function planCover(stem: string): CoverPlan;
/** 没有封面图时垫在下面的那张纸（图库包的占位槽）：只有颜色，不印字——字在上面那一层。 */
export declare function paperHtml(kind: "book" | "draft"): string;
/** 印在封面上的那一层（图库包的覆盖层槽）：书名 / 日期 / 装订线。底下是封面图还是纸，印法都一样。kind: book = 书（有装订线）；draft = txt 稿（一张纸）。 */
/** 底栏内容（user 2026-09-30「上次编辑我觉的可以不显示，可以做 tooltip，然后左边是 yyyymmdd，右边是 size」「半透明背景垫底…很窄的一条贴着底部」）：
 *  文字由宿主排好给进来（本模块不认识字节数 / 相对时间的格式），没有就不印那一格；editedText 进根元素的 title（悬停 tooltip）。 */
export interface CoverExtra {
    sizeText?: string;
    editedText?: string;
}
export declare function coverHtml(stem: string, kind: "book" | "draft", extra?: CoverExtra): string;
