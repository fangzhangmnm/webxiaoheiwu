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
    activeName: () => string | null;
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
    findByName: (name: string) => DocListItem | null;
};
export type Drawer = ReturnType<typeof createDrawer>;
