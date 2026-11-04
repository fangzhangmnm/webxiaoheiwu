export interface UserdbValue {
    c: number;
    d: number;
    t: number;
}
export interface ParsedUserdb {
    entries: Map<string, UserdbValue>;
    /** 这本词库的时钟（每上屏一次 +1），t 按它算。 */
    tick: number;
    maxSeq: number;
    /** 目录里 .ldb / .log 最大的文件号。 */
    maxFile: number;
}
/** 内存层此刻的样子：词库名（`luna_pinyin.userdb` 去掉后缀）→ 解析结果。 */
export type LayerSnapshot = Record<string, ParsedUserdb>;
/** 跨设备存的词条：词库名 → 键 → [c, d]。t 不存（各设备的时钟对不上），d 存「存的那一刻衰减到的值」。 */
export type DictEntries = Record<string, Record<string, [number, number]>>;
export interface UserdbFile {
    name: string;
    data: Uint8Array;
}
export declare function crc32c(bytes: Uint8Array): number;
export declare function parseValue(s: string): UserdbValue | null;
export declare const packValue: (v: UserdbValue) => string;
/** 一个词库目录里的 .ldb / .log → 每个键最新的那条。文件读不了（压缩块、魔数不对）= 抛：调用方不能把半本词库当整本。 */
export declare function parseUserdbFiles(files: UserdbFile[]): ParsedUserdb;
/** 一组键值 → 一份 LevelDB 日志的字节（序号从 startSeq 起）。 */
export declare function buildLogFile(records: [string, string][], startSeq: number): Uint8Array;
export declare const decayed: (v: UserdbValue, tick: number) => number;
/** 要灌进这本词库的词（已经在里面、而且更强的不写）：键 → 新值。t = 这本词库现在的时钟。 */
export declare function planLoad(cur: ParsedUserdb, incoming: Record<string, [number, number]> | undefined): Map<string, UserdbValue>;
/** 内存层相对 base 多出来 / 变了的词（t 或 c 变了 = 这次会话里真的用过）。 */
export declare function deltaOf(now: LayerSnapshot, base: LayerSnapshot): DictEntries;
export declare function mergeEntries(into: DictEntries, from: DictEntries | undefined): DictEntries;
export declare const emptyParsed: () => ParsedUserdb;
export declare const logFileName: (cur: ParsedUserdb) => string;
