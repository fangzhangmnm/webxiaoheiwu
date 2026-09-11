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
    /** 「+ 兄弟」「+ 子节」（问名字 → mode.newSibling / newChild；散页上的子节 = 链出去）。返回 true = 已建/已跳。 */
    onAddSibling: () => Promise<boolean>;
    onAddChild: () => Promise<boolean>;
    /** 散页上的「归入主干」（当前页 → 树末尾；树空时 = 第一节点）。返回 true = 已进树。 */
    onJoinTrunk: () => Promise<boolean>;
    /** 「导出这一支…」（app 层：问名字 → 落库 / 下载）。 */
    onExportBranch: (name: string) => Promise<void>;
    /** txt 模式：把这篇草稿变成书（user 2026-09-10）。canLift = 有正文可 lift。 */
    onLift: () => Promise<boolean>;
    canLift: () => boolean;
    /** 无地的书：「下载一份」入口（store 的书不显示）。 */
    onDownload?: () => void;
}
export declare function createEdgeSidebar(d: EdgeSidebarDeps): {
    render: () => void;
    el: HTMLElement;
};
export type EdgeSidebar = ReturnType<typeof createEdgeSidebar>;
