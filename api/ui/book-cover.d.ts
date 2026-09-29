export interface CoverPlan {
    date: string | null;
    title: string;
    vertical: boolean;
    size: "xl" | "l" | "m" | "s";
    coded: boolean;
}
/** 这个名字的封面怎么排（纯函数，测试用它）。 */
export declare function planCover(stem: string): CoverPlan;
/** 占位封面的 HTML。kind: book = 书（有装订线）；draft = txt 稿（一张纸）。 */
export declare function coverHtml(stem: string, kind: "book" | "draft"): string;
