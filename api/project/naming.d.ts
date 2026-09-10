/** 1..9999 → 汉字数字（一 / 十 / 十一 / 二十 / 一百零一 / 一百一十 / 一千零一…）；范围外 → 阿拉伯数字。 */
export declare function chineseNumeral(n: number): string;
/** 第 n 章（按当前语言）。 */
export declare function chapterName(n: number): string;
/** 下一个不撞名的章节文件名（带 .txt）：从「已有节点数 + 1」起数，撞了就往后。 */
export declare function nextChapterName(existing: Iterable<string>): string;
/** 渲染用名字：剥 .txt。 */
export declare const nodeDisplayName: (name: string) => string;
