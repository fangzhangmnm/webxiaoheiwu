export interface LocalHome {
    readonly fileName: string;
    readonly canWriteBack: boolean;
    read(): Promise<Blob | null>;
    write(blob: Blob): Promise<"written" | "downloaded">;
}
export declare const hasFsa: () => boolean;
export declare function triggerDownload(blob: Blob, filename: string): void;
/** 写回被浏览器拒绝（readwrite 权限没拿到：句柄来自 open picker 默认只读，第一次写要在用户手势里授权；无手势的写（idle 推）拿不到就是这个）。 */
export declare class LocalWriteDeniedError extends Error {
    name: string;
    constructor();
}
/** 挑一个本机 `.webxiaoheiwu.zip`。取消 → null。 */
export declare function pickLocalProject(accept?: string): Promise<LocalHome | null>;
