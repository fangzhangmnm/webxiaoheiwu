import type { PackProgress, PackStatus, LoadResult, DecodeResult, AsrLang } from "./protocol.ts";
declare class AsrEngine {
    private worker;
    private seq;
    private pending;
    private ensureWorker;
    private call;
    status(slug: string): Promise<PackStatus>;
    download(slug: string, base: string, onProgress?: (p: PackProgress) => void): Promise<PackStatus>;
    importFiles(slug: string, files: File[], onProgress?: (p: PackProgress) => void): Promise<PackStatus>;
    delete(slug: string): Promise<void>;
    load(slug: string, lang: AsrLang): Promise<LoadResult>;
    decode(samples: Float32Array, lang: AsrLang): Promise<DecodeResult>;
    unload(): Promise<void>;
}
export declare const asr: AsrEngine;
export {};
