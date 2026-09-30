import "@internal/reference-window";
import type { WpReferenceWindow } from "@internal/reference-window";
import type { ProjectMode, ReferenceModeHooks } from "./project/mode.ts";
export interface ReferenceHostDeps {
    el: WpReferenceWindow;
    fileInput: HTMLInputElement;
    setStatus: (text: string, opts?: {
        error?: boolean;
    }) => void;
    /** 顶栏下缘（浮窗的出血区地板）。 */
    topFloor: () => number;
}
export declare function createReferenceHost(d: ReferenceHostDeps): {
    hooks: ReferenceModeHooks;
    bindMode: (m: ProjectMode) => void;
    sendPage: (name: string) => void;
    toggle: () => void;
    isOpen: () => boolean;
};
export type ReferenceHost = ReturnType<typeof createReferenceHost>;
