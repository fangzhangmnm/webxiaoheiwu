/** 正文里自己的 # 标题：shift = 加级（缺省）/ escape = 转义 / raw = 原样。 */
export type BodyHeadings = "shift" | "escape" | "raw";
export interface MarkdownPage {
    heading: string | null; /** 在目录树里的层级，相对这次导出的起点（0 = 最外层 = #） */
    level?: number;
    text: string;
}
/** 正文里的标题放到 pageLevel 级的页名底下：最高的一级已经比页名低就原样返回，否则整页一起往下挪到「最高的一级 = pageLevel + 1」。 */
export declare function shiftBodyHeadings(body: string, pageLevel: number): string;
/** 正文里的标题前面加 \（CommonMark 转义）：行首缩进留着，变成普通一行字。 */
export declare function escapeBodyHeadings(body: string): string;
/** 整棵树：每页 =「#」×（层级 + 1）+ 页名、空一行、正文（标题挪过的）；页与页之间空一行。正文头上的空行去掉（首行缩进留着）、尾巴空白收掉。 */
export declare function markdownTree(pages: MarkdownPage[], bodyHeadings?: BodyHeadings): string;
