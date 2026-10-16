export declare function setQuoteStyle(style: "curly" | "corner"): void;
/** 一键规整用：这段文字里会被 chineseifyPunctuation 换掉的西文标点有几个（给 toast 报数；0 = 没有要改的）。 */
export declare function countWesternPunctuation(before: string, after: string): number;
export declare function chineseifyPunctuation(text: string): string;
