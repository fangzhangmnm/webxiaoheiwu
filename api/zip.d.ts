export declare const levelForPath: (path: string) => number;
export interface ZipPackOpts {
    /** 每个 entry 的压缩档；不给 = 全 STORE（加密外壳的旧行为）。工程 zip 传 levelForPath。 */
    levelFor?: (path: string) => number;
    /** entry 时间戳；工程 zip 钉 1980-01-01 UTC 让同内容同字节（抄 WeebPaint ora）。不给 = now。 */
    lastModDate?: Date;
}
/** 一个 entry 的**已压缩**字节 + 写 local header 所需的三个数（ADR-0015 增量重打：未改的 entry 用 passThrough 原样塞回，不再 deflate）。 */
export interface RawEntry {
    data: Uint8Array;
    method: number;
    size: number;
    crc: number;
}
export interface ZipEntryIn {
    path: string;
    data: Uint8Array | string; /** 给了就 passThrough：忽略 data 与 level，原样写 raw（同内容同字节：raw 就是上次的确定性输出）。 */
    raw?: RawEntry;
}
export declare function zipPack(entries: ZipEntryIn[], opts?: ZipPackOpts): Promise<Blob>;
/** 只读已压缩字节（不 inflate；给 packProject 收割刚 deflate 过的 entry 用）。paths 不给 = 全部。 */
export declare function zipReadRaw(blob: Blob, paths?: Iterable<string>): Promise<Record<string, RawEntry>>;
/** 解包 + 每个 entry 的已压缩字节（unpackProject 用它把 raw 留进 rawCache）。 */
export declare function zipUnpackRaw(blob: Blob): Promise<Record<string, {
    data: Uint8Array;
    raw: RawEntry;
}>>;
/** 只读一个 entry 的字节（按名；找不到 → null）。给 makePeek 抽封面用：不解整本书。 */
export declare function zipReadEntry(blob: Blob, path: string): Promise<Uint8Array | null>;
export declare function zipUnpack(blob: Blob): Promise<Record<string, Uint8Array>>;
