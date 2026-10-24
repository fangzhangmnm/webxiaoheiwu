export declare function setQuoteStyle(style: "curly" | "corner"): void;
/** 系统输入法上屏的引号跟设置走（v2.3.57，user 2026-10-23「做，跟设置走」；接线 = input/pipeline.ts）：只换已经分好开闭的弯引号 / 直角引号（“”‘’ ↔ 「」『』）。
 *  ‘ ’ 前一个字是拉丁字母 = 英文撇号（it’s / rock ‘n’ roll）→ 不动（打字当下后一个字还没来，看不到，宁可漏换——漏的「规整标点」一键收）；直引号 " ' 不动（英文 / 代码）。
 *  prev = 插入点前一个字（文本框里的）。 */
export declare function quotesToStyle(text: string, prev?: string): string;
/** 一键规整（user 2026-10-16「一键把标点符号…全部正则化」「标点主要是引号的规范」）：同一套规则，顺带报改了几处。 */
export declare function tidyPunctuation(text: string): {
    text: string;
    changes: number;
};
/** 语音听写用（SenseVoice 在中文里偶尔吐 ASCII 标点）：和一键规整同一套规则。 */
export declare function chineseifyPunctuation(text: string): string;
