export interface PackFile {
    path: string;
    bytes: number;
    offset: number;
    sha256: string;
}
export interface PackChunk {
    name: string;
    bytes: number;
    sha256: string;
}
export interface PackManifest {
    v: number;
    slug: string;
    name: string;
    task: string;
    lang: string[];
    engine: string;
    engineConfig: {
        type: "offline" | "online";
        modelConfig: Record<string, unknown> & {
            tokens: string;
        };
        [k: string]: unknown;
    };
    files: PackFile[];
    chunkBytes: number;
    chunks: PackChunk[];
    totalBytes: number;
    sha256: string;
    license: {
        name: string;
        file: string;
        sha256: string;
        attribution: string;
    };
    source: {
        model: string;
        converted: string;
        file: string;
    };
    notes: string;
    createdAt: string;
    createdBy: string;
}
export declare const PACK_MANIFESTS: Record<string, {
    packId: string;
    manifest: PackManifest;
}>;
