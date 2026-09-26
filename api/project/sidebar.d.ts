import type { ProjectMode } from "./mode.ts";
export interface EdgeSidebarDeps {
    el: HTMLElement;
    mode: ProjectMode;
    setStatus: (text: string, opts?: {
        error?: boolean;
    }) => void;
    focusEditor: () => void;
    /** 顶部三个入口（书库 / 导出 / 设置）。导出 = 当前页（txt 稿整篇 / 书的这一页 / 图片页的图）进剪贴板，app 层做。 */
    onLibrary: () => void;
    onExport: () => void;
    onSettings: () => void;
    /** 「+ 兄弟」「+ 子节」（问名字 → mode.newSibling / newChild；散页上的子节 = 链出去）。返回 true = 已建/已跳。 */
    onAddSibling: () => Promise<boolean>;
    onAddChild: () => Promise<boolean>;
    /** 「挪到…」（app 层：pick sheet 搜主干里的页 → 之下 / 之后 / 书的末尾；散页首行 + 树行菜单共用）。返回 true = 已挪。 */
    onMove: (name: string) => Promise<boolean>;
    /** 「导出这一支…」（app 层：问名字 → 落库 / 下载）。 */
    onExportBranch: (name: string) => Promise<void>;
    /** txt 模式：把这篇草稿变成书（user 2026-09-10）。canLift = 有正文可 lift。 */
    onLift: () => Promise<boolean>;
    canLift: () => boolean;
    /** 无地的书：「下载一份」入口（store 的书不显示）。 */
    onDownload?: () => void;
}
/** 页时间戳的短显示：今年 → M/D HH:mm；别的年 → YYYY/M/D。0 = 不知道 → 空。 */
export declare function fmtTime(ms: number): string;
export declare function createEdgeSidebar(d: EdgeSidebarDeps): {
    render: () => void;
    el: HTMLElement;
};
export type EdgeSidebar = ReturnType<typeof createEdgeSidebar>;
