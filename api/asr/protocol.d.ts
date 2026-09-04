export type AsrLang = "zh" | "en" | "auto";
export interface PackStatus {
    slug: string;
    ready: boolean;
    bytesCached: number;
    bytesTotal: number;
}
export interface PackProgress {
    done: number;
    total: number;
}
export interface LoadResult {
    slug: string;
    alreadyLoaded: boolean;
    createMs: number;
    wasmHeapMB: number;
}
export interface DecodeResult {
    text: string;
    computeMs: number;
    audioMs: number;
}
export type AsrRequest = {
    id: number;
    op: "status";
    slug: string;
} | {
    id: number;
    op: "download";
    slug: string;
    base: string;
} | {
    id: number;
    op: "import";
    slug: string;
    files: File[];
} | {
    id: number;
    op: "delete";
    slug: string;
} | {
    id: number;
    op: "load";
    slug: string;
    lang: AsrLang;
} | {
    id: number;
    op: "decode";
    samples: Float32Array;
    lang: AsrLang;
} | {
    id: number;
    op: "unload";
};
export type AsrResponse = {
    id: number;
    ok: true;
    result: unknown;
} | {
    id: number;
    ok: false;
    error: string;
} | {
    id: number;
    progress: PackProgress;
};
