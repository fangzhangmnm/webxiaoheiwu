/** 渲染用名字：剥 .txt。 */
export declare const nodeDisplayName: (name: string) => string;
/** 1..9999 → 汉字数字（一 / 十 / 十一 / 二十 / 一百零一 / 一百一十 / 一千零一…）；范围外 → 阿拉伯数字。 */
export declare function chineseNumeral(n: number): string;
/** 第 n 章（按当前语言）。 */
export declare function chapterName(n: number): string;
/** 汉字数字 / 阿拉伯数字 → 整数；解析不了 → null。（「十」=10、「十二」=12、「二十」=20、「一百零一」=101） */
export declare function parseNumeral(s: string): number | null;
/** 名字（不带 .txt）是「第 N 章 / Chapter N」→ N；不是 → null。中英都认，与界面语言无关。 */
export declare function chapterNumberOf(name: string): number | null;
/** 下一个章节文件名（带 .txt）：**按语义续号** = 已有「第 N 章」里最大的 N + 1（没有 → 第一章），撞名再往后。
 *  不数文件个数（user 2026-09-10「突然就来了个第四章，你是数了文件个数但是没有看语义吗」）。 */
export declare function nextChapterName(existing: Iterable<string>): string;
