export interface ParsedDocName {
    /** 日期前缀 "YYYYMMDD"；不匹配 → null。 */
    date: string | null;
    /** 标题（不含日期与扩展名）；裸日期 → ""。不匹配 → 整个 stem。 */
    title: string;
    /** 去扩展名的显示名。 */
    stem: string;
}
export declare function isDocName(name: string): boolean;
export declare function parseDocName(name: string): ParsedDocName;
export declare function formatDate(ts: number): string;
/** 文件名里合法的标题片段：去路径字符、压空白、去前导点、截 200。 */
export declare function sanitizeTitle(s: string): string;
/** 由日期前缀 + 标题拼文件名（不含碰撞后缀）。 */
export declare function makeDocName(date: string, title: string): string;
/** 第 n 个碰撞候选：n=0 原名，n≥1 追加 " n"。 */
export declare function collisionCandidate(name: string, n: number): string;
/** 降序自然序比较器（新在前）。 */
export declare function compareDocNamesDesc(a: string, b: string): number;
/** 字数：CJK 按字、拉丁按词，标点空白不算。 */
export declare function statsForText(text: string): {
    cjk: number;
    en: number;
};
export type TextEncodingName = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be" | "gb18030" | "big5" | "utf-8-lossy";
/** BOM → UTF-8 严格 → GB18030 → Big5 → UTF-8 有损。写回永远 UTF-8（无 BOM）。 */
export declare function decodeTextBytes(buf: ArrayBuffer | Uint8Array): {
    text: string;
    encoding: TextEncodingName;
};
export declare function encodeText(text: string): Uint8Array;
/** 采纳云端字节前的验真（store validateAdopt，收**明文**）：挡 captive-portal HTML / 二进制垃圾覆盖好本地。
 *  txt 无魔数 → 判据 = 能按上面的编码链解出（非 lossy）且开头不是 HTML 文档。空文件合法。 */
export declare function looksLikeTextDoc(bytes: Uint8Array): boolean;
