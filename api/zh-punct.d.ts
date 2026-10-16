export declare function setQuoteStyle(style: "curly" | "corner"): void;
/** 一键规整（user 2026-10-16「一键把标点符号…全部正则化」「标点主要是引号的规范」）：同一套规则，顺带报改了几处。 */
export declare function tidyPunctuation(text: string): {
    text: string;
    changes: number;
};
/** 语音听写用（SenseVoice 在中文里偶尔吐 ASCII 标点）：和一键规整同一套规则。 */
export declare function chineseifyPunctuation(text: string): string;
