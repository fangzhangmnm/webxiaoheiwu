export declare const ZERO_FULL_FORMS: readonly ["a", "ai", "an", "ang", "ao", "e", "ei", "en", "eng", "er", "o", "ou"];
export type ZeroFullForm = (typeof ZERO_FULL_FORMS)[number];
/** full = 全拼 → 该方案双拼键；alt = 方案还认的其它零声母双拼键（微软/加加的 o 引导形）。 */
export interface ZeroTable {
    full: Record<ZeroFullForm, string>;
    alt?: string[];
}
export declare const ZERO_TABLES: Record<string, ZeroTable>;
export type ZeroOp = {
    op: "key";
    key: string;
} | {
    op: "bs";
};
export declare class ZeroInitialRewriter {
    private typed;
    private sent;
    private odd;
    private readonly doubles;
    private readonly table;
    constructor(table: ZeroTable | null);
    get active(): boolean;
    reset(): void;
    /** 候选选走一段后剩余缓冲：末段单字符 = 停在音节中间（微软方案完整零声母也显示单字，此时判错只是少一次重写，无害）。 */
    syncFromPreedit(buffer: string): void;
    onKey(key: string): ZeroOp[];
    onBackspace(): ZeroOp[];
    private rewrite;
}
