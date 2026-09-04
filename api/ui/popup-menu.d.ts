export interface PopupMenuItem<Id extends string = string> {
    id: Id;
    label: string;
    icon?: string;
    hidden?: boolean;
    disabled?: boolean;
    danger?: boolean;
    separatorBefore?: boolean;
}
export interface PopupMenuOpts<Id extends string = string> {
    anchor: HTMLElement;
    align?: "left" | "right";
    offsetY?: number;
    swallowOutsideTap?: boolean;
    onClose?: () => void;
    ariaLabel?: string;
    items: () => PopupMenuItem<Id>[];
    onPick: (id: Id, item: PopupMenuItem<Id>) => void | "keep";
}
export interface PopupMenuHandle {
    close(): void;
    refresh(): void;
    readonly isOpen: boolean;
    readonly el: HTMLElement;
    readonly anchor: HTMLElement;
}
export declare function currentPopupMenu(): PopupMenuHandle | null;
export declare function closePopupMenu(): void;
export declare function togglePopupMenu<Id extends string>(opts: PopupMenuOpts<Id>): PopupMenuHandle | null;
export declare function openPopupMenu<Id extends string>(opts: PopupMenuOpts<Id>): PopupMenuHandle;
