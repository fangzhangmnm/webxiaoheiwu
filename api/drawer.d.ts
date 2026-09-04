import { type DocListItem } from "./docs.ts";
export type DrawerView = "closed" | "active" | "trash" | "settings";
export interface DrawerDeps {
    drawer: HTMLElement;
    backdrop: HTMLElement;
    title: HTMLElement;
    backButton: HTMLElement;
    docList: HTMLElement;
    docListEmpty: HTMLElement;
    docActions: HTMLElement;
    trashActions: HTMLElement;
    settingsView: HTMLElement;
    breadcrumb: HTMLElement;
    activeName: () => string | null;
    /** 当前稿所在夹（打开抽屉时列表跳到这里）。 */
    currentDir: () => string;
    /** 把一篇移到别的夹（当前稿由编辑器走 moveTo；其它稿 app 直接调 docs.moveDoc）。 */
    onMoveDoc: (name: string, toDir: string) => Promise<void>;
    onOpenDoc: (name: string) => Promise<void>;
    /** 当前稿被移入回收站/改名后：编辑器清空或切稿。 */
    onActiveTrashed: () => Promise<void>;
    onSettingsShown: () => void;
    focusEditor: () => void;
    setStatus: (text: string, opts?: {
        error?: boolean;
    }) => void;
}
export declare function createDrawer(d: DrawerDeps): {
    open: (next?: Exclude<DrawerView, "closed">) => void;
    close: () => void;
    refresh: () => void;
    subscribe: () => void;
    onEmptyTrash: () => Promise<void>;
    currentView: () => DrawerView;
    items: () => DocListItem[];
    firstFrame: () => Promise<void>;
    currentFolder: () => string;
    setFolder: (f: string) => void;
    newFolder: () => Promise<void>;
    findByName: (name: string) => DocListItem | null;
};
export type Drawer = ReturnType<typeof createDrawer>;
