export interface CoverPlan {
    date: string | null;
    title: string;
    vertical: boolean;
    size: "xl" | "l" | "m" | "s";
    coded: boolean;
}
/** 这个名字的封面怎么排（纯函数，测试用它）。 */
export declare function planCover(stem: string): CoverPlan;
/** 没有封面图时垫在下面的那张纸（图库包的占位槽）：只有颜色，不印字——字在上面那一层。 */
export declare function paperHtml(kind: "book" | "draft"): string;
/** 印在封面上的那一层（图库包的覆盖层槽）：书名 / 日期 / 装订线。底下是封面图还是纸，印法都一样。kind: book = 书（有装订线）；draft = txt 稿（一张纸）。 */
export declare function coverHtml(stem: string, kind: "book" | "draft"): string;
