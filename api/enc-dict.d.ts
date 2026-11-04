import { type Verdict } from "./project/migrate/index.ts";
import { type DictEntries, type LayerSnapshot } from "./rime-userdb.ts";
export declare const ENC_DICT_IDLE_MS = 60000;
export interface EncDictPayload {
    version: number;
    minor?: number;
    patch?: number;
    entries: DictEntries;
    savedAt: number;
    device: string;
    clearedAt?: number;
    [k: string]: unknown;
}
export type LayerResult = {
    status: "ok";
    base: LayerSnapshot;
} | {
    status: "composing";
} | {
    status: "off";
};
/** 输入法那边（ime.ts）。 */
export interface EncDictLayer {
    memoryOnly(): boolean;
    /** 把词灌进内存层，回 base = delta 的起点（灌之前的词 + 灌进去的词）。正在组字 = 等会儿再来（重开引擎会丢组字）。 */
    load(entries: DictEntries): Promise<LayerResult>;
    /** 内存层此刻的样子；flush = 先重开一次把挂着的词提交（正在组字就不重开）。不在内存层模式 = null。 */
    read(flush: boolean): Promise<LayerSnapshot | null>;
    /** 丢掉内存层学到的和灌进去的，回到进加密稿时的样子，再灌 entries。 */
    reset(entries: DictEntries): Promise<LayerResult>;
}
export interface EncDictDeps {
    collection: {
        keys(): string[];
        getItem<V = unknown>(id: string): V | undefined;
        setItem(id: string, value: unknown): void;
    };
    layer: EncDictLayer;
    password(): string | null;
    /** JSON 字节 → 容器的 base64。 */
    seal(json: Uint8Array, password: string): Promise<string>;
    /** 打不开（口令不对 / 坏了）= null，不抛。 */
    unseal(value: string, password: string): Promise<Uint8Array | null>;
    device(): string;
    kvGet(key: string): string | null;
    kvSet(key: string, value: string): void;
    newId(): string;
    now(): number;
    note(line: string): void;
    report(e: unknown): void;
    /** 有一把键是更新版本写的（minor 更大）：能用，说一次。 */
    tellNewer(): void;
    sleep(ms: number): Promise<void>;
    setTimer(fn: () => void, ms: number): unknown;
    clearTimer(t: unknown): void;
}
/** 读一把键的明文：坏的 / major 比本版新 = null。verdict 给调用方看是不是更新的 minor。 */
export declare function decodePayload(bytes: Uint8Array): {
    payload: EncDictPayload;
    verdict: Verdict;
} | null;
/** 永远写本版的拍；不认识的键（payload 里带着的）原样带回。 */
export declare function encodePayload(p: EncDictPayload): Uint8Array;
/** 并集：clearedAt 没跟上最新一次清空的键，词作废。 */
export declare function unionOf(payloads: EncDictPayload[]): {
    entries: DictEntries;
    clearedAt: number;
};
export interface EncDict {
    /** 幂等：加密稿开着 + 口令在 + 还没灌 → 灌。 */
    ensureLoaded(): void;
    /** 这次会话灌好了吗（测试 / 诊断）。 */
    loaded(): boolean;
    /** 上屏了一个词：空闲 60 s 后封。 */
    poke(): void;
    /** 现在就封（切后台 / 锁定前）。 */
    sealNow(flush?: boolean): Promise<void>;
    /** 关稿：snapshot = 输入法丢内存层之前最后的样子。 */
    leave(snapshot: Promise<LayerSnapshot | null>): Promise<void>;
    /** 口令没了：灌进去的从内存层丢掉。 */
    onLocked(): Promise<void>;
    /** 重灌（明文词库清空会把内存层一起换掉）。 */
    reload(): Promise<void>;
    /** 「清空加密词库」。口令不在 = false。 */
    clear(): Promise<boolean>;
    /** 换口令：读得开的键全换成新口令封。 */
    rekey(oldPassword: string, newPassword: string): Promise<void>;
    /** 同步文件变了。 */
    noteChanged(ids: string[]): void;
    /** 一把键都还没有（设置页不用问口令就能说「是空的」）。 */
    isEmpty(): boolean;
}
export declare function createEncDict(d: EncDictDeps): EncDict;
