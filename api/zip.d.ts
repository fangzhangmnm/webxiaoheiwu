export declare function zipPack(entries: {
    path: string;
    data: Uint8Array | string;
}[]): Promise<Blob>;
export declare function zipUnpack(blob: Blob): Promise<Record<string, Uint8Array>>;
