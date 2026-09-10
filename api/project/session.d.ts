import { type Project, type UnpackResult } from "./format.ts";
import { type NowFn } from "./graph.ts";
export interface ProjectSessionDeps {
    read(name: string): Promise<Blob | null>;
    write(name: string, blob: Blob, opts: {
        push: boolean;
    }): Promise<{
        pushed?: boolean;
    }>;
    now?: NowFn;
}
export type OpenResult = {
    kind: "ok";
    warnings: string[];
} | {
    kind: "unavailable";
} | Exclude<UnpackResult, {
    kind: "ok";
}>;
export declare function createProjectSession(d: ProjectSessionDeps): {
    open: (projectName: string) => Promise<OpenResult>;
    create: (projectName: string, firstNode: string) => void;
    close: () => void;
    flush: (push: boolean, opts?: {
        force?: boolean;
    }) => Promise<{
        wrote: boolean;
        pushed?: boolean;
    }>;
    toBlob: () => Promise<Blob>;
    adoptName: (newName: string) => void;
    setBack: (list: readonly string[]) => void;
    readonly name: string | null;
    readonly dirty: boolean;
    readonly readOnly: boolean;
    readonly project: Project;
    current: () => string | null;
    currentText: () => string;
    setCurrentText: (text: string) => boolean;
    jump: (target: string) => string;
    spawn: (newName: string, selectedText: string) => string;
    addLink: (to: string, at?: "bottom" | "top" | undefined) => boolean;
    removeLink: (to: string) => boolean;
    setLinksOrder: (list: string[]) => void;
    rename: (from: string, to: string) => void;
    remove: (target: string) => boolean;
    drop: (to: string, orphanPrefix: string) => string | null;
    purge: (target: string) => boolean;
    orphan: (target: string) => boolean;
    setReadOnly: (v: boolean) => void;
    cutIncoming: (from: string) => boolean;
    addBytesPage: (pageName: string, bytes: Uint8Array<ArrayBufferLike>) => string;
    replaceBytes: (target: string, bytes: Uint8Array<ArrayBufferLike>) => void;
    currentBytes: () => Uint8Array | null;
    bytesOf: (target: string) => Uint8Array | null;
    setThumbnail: (png: Uint8Array<ArrayBufferLike> | null) => void;
    thumbnail: () => Uint8Array | null;
    treeUp: (target: string) => boolean;
    treeDown: (target: string) => boolean;
    treeOutdent: (target: string) => boolean;
    treeIndent: (target: string) => boolean;
    treeDetach: (target: string) => boolean;
    archiveAfter: (target: string, anchor: string) => void;
    archiveUnder: (target: string, parent: string) => void;
    archiveAtEnd: (target: string) => void;
    newSibling: (newName: string) => import("./graph.ts").InsertResult;
    newChild: (newName: string) => import("./graph.ts").InsertResult;
    neighborhood: () => {
        current: null;
        inTree: boolean;
        parent: null;
        siblings: string[];
        children: string[];
        links: string[];
        incoming: string[];
        prev: null;
        next: null;
    } | {
        current: string;
        inTree: boolean;
        parent: string | null;
        siblings: string[];
        children: string[];
        links: string[];
        incoming: string[];
        prev: string | null;
        next: string | null;
    };
    sidebar: () => string[];
    backlinksOf: (target: string) => string[];
    find: (q: string, limit?: number) => string[];
    exists: (target: string) => boolean;
    pathOf: (target: string) => string[];
    isInTree: (target: string) => boolean;
    order: () => string[];
    exportBranch: (target: string) => string;
    canMutate: () => boolean;
};
export type ProjectSession = ReturnType<typeof createProjectSession>;
/** 作品上了修改锁（graph.json readOnly）。UI 捕获后提示「先解除只读」。 */
export declare class LockedBookError extends Error {
    name: string;
    constructor();
}
