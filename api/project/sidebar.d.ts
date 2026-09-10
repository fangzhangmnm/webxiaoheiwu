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
    /** 加一页（问名字 → mode.newNode）；顶栏「+」与列表末尾「+」同一个流程。返回 true = 已建/已跳。 */
    onAddPage: () => Promise<boolean>;
    /** txt 模式：把这篇草稿变成书（user 2026-09-10）。canLift = 有正文可 lift。 */
    onLift: () => Promise<boolean>;
    canLift: () => boolean;
    /** 无地工程：「下载一份」入口（store 工程不显示）。 */
    onDownload?: () => void;
}
export declare function createEdgeSidebar(d: EdgeSidebarDeps): {
    render: () => void;
    el: HTMLElement;
};
export type EdgeSidebar = ReturnType<typeof createEdgeSidebar>;
