import type { ProjectMode } from "./mode.ts";
export interface EdgeSidebarDeps {
    el: HTMLElement;
    mode: ProjectMode;
    setStatus: (text: string, opts?: {
        error?: boolean;
    }) => void;
    focusEditor: () => void;
    /** 顶部两个入口。 */
    onLibrary: () => void;
    onSettings: () => void;
    /** 跳到某节点之后（窄屏浮层要收起）。 */
    afterNavigate?: () => void;
    /** 无地工程：「下载一份」入口（store 工程不显示）。 */
    onDownload?: () => void;
}
export declare function createEdgeSidebar(d: EdgeSidebarDeps): {
    render: () => void;
    el: HTMLElement;
};
export type EdgeSidebar = ReturnType<typeof createEdgeSidebar>;
