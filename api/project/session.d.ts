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
    addLink: (to: string, at?: "top" | "bottom" | undefined) => boolean;
    removeLink: (to: string) => boolean;
    setLinksOrder: (links: string[]) => void;
    rename: (from: string, to: string) => void;
    remove: (target: string) => boolean;
    drop: (to: string, orphanPrefix: string) => string | null;
    purge: (target: string) => boolean;
    orphan: (target: string) => boolean;
    setReadOnly: (v: boolean) => void;
    sidebar: () => {
        name: string;
        stub: boolean;
    }[];
    backlinksOf: (target: string) => string[];
    find: (q: string, limit?: number) => string[];
    exists: (target: string) => boolean;
    canMutate: () => boolean;
};
export type ProjectSession = ReturnType<typeof createProjectSession>;
/** 作品上了修改锁（graph.json readOnly）。UI 捕获后提示「先解除只读」。 */
export declare class LockedBookError extends Error {
    name: string;
    constructor();
}
