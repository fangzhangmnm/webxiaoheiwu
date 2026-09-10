export interface LocalHome {
    readonly fileName: string;
    readonly canWriteBack: boolean;
    read(): Promise<Blob | null>;
    write(blob: Blob): Promise<"written" | "downloaded">;
}
export declare const hasFsa: () => boolean;
export declare function triggerDownload(blob: Blob, filename: string): void;
/** 挑一个本机 `.webxiaoheiwu.zip`。取消 → null。 */
export declare function pickLocalProject(accept?: string): Promise<LocalHome | null>;
