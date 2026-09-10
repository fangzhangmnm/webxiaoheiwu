export declare const levelForPath: (path: string) => number;
export interface ZipPackOpts {
    /** 每个 entry 的压缩档；不给 = 全 STORE（加密外壳的旧行为）。工程 zip 传 levelForPath。 */
    levelFor?: (path: string) => number;
    /** entry 时间戳；工程 zip 钉 1980-01-01 UTC 让同内容同字节（抄 WeebPaint ora）。不给 = now。 */
    lastModDate?: Date;
}
export declare function zipPack(entries: {
    path: string;
    data: Uint8Array | string;
}[], opts?: ZipPackOpts): Promise<Blob>;
export declare function zipUnpack(blob: Blob): Promise<Record<string, Uint8Array>>;
