export declare function showBusy(label: string, hint?: string): void;
export declare function hideBusy(): void;
export declare function isBusyActive(): boolean;
export declare function withBusy<T>(label: string, fn: () => Promise<T> | T, hint?: string): Promise<T>;
export declare function initSheets(labels: {
    ok: string;
    cancel: string;
}): void;
export interface ConfirmOpts {
    danger?: boolean;
    okLabel?: string;
    cancelLabel?: string;
    warning?: boolean; /** 一个勾（2.1「保留高清」）：结果经 openConfirmSheetEx 拿。 */
    checkbox?: {
        label: string;
        checked?: boolean;
    };
}
export declare function openConfirmSheet(title: string, message: string, opts?: ConfirmOpts): Promise<boolean>;
/** confirm + 可选一个复选框；返回 { ok, checked }。 */
export declare function openConfirmSheetEx(title: string, message: string, opts?: ConfirmOpts): Promise<{
    ok: boolean;
    checked: boolean;
}>;
export interface InputOpts {
    message?: string;
    placeholder?: string;
    password?: boolean;
    defaultValue?: string;
    okLabel?: string;
    /** 密码二次确认（首次设密码）。 */
    confirmField?: boolean;
    /** 同步校验：返回错误文案则不关 sheet（显示在 #sheetError）。 */
    validate?: (value: string, second: string) => string | null;
    /** 初始错误提示（上一轮密码错时重开）。 */
    error?: string;
    /** 副按钮（2.1 加页 sheet 的「从图片…」）：点了 resolve INPUT_SECONDARY。 */
    secondary?: {
        label: string;
    };
    /** 一个勾（v2.1.11 新建书「加密」）：勾态经 openInputSheetEx 的结果拿；openInputSheet 只返字串。 */
    checkbox?: {
        label: string;
        checked?: boolean;
    };
}
/** openInputSheet 的副按钮结果哨兵（不会和用户输入撞：含 NUL）。 */
export declare const INPUT_SECONDARY = "\0secondary";
/** 输入 sheet → string | null（取消）。密码态用 -webkit-text-security 打码（不用 type=password：绕开浏览器记密码弹窗——WeebPaint 教训）。 */
export declare function openInputSheet(title: string, opts?: InputOpts): Promise<string | null>;
/** 输入 sheet 带勾态 → { value, checked } | null（取消）；副按钮 → value = INPUT_SECONDARY。 */
export declare function openInputSheetEx(title: string, opts?: InputOpts): Promise<{
    value: string;
    checked: boolean;
} | null>;
/** onPick（2026-09-09，对账 WeebPaint sheets）：在按钮 click 监听器里**同步**调——iOS 的 redirect 登录起跳 必须在手势同步栈起跳，resolve 之后的微任务续体会丢手势。 */
export interface Choice<T> {
    label: string;
    value: T;
    primary?: boolean;
    danger?: boolean;
    onPick?: () => void;
}
export declare function openChoiceSheet<T>(title: string, message: string, choices: Choice<T>[]): Promise<T | null>;
/** 「范围 + 动作」sheet（created 2026-10-01 by Claude Fable 5.1；user「长图的选项帮我精简一下…页 支 本 字 图 pdf」）：
 *  一条段选（scopes，只有一项就不画）+ 一行小字（note(scope)，范围一换就重算）+ 一排动作钮（choices(scope)）。
 *  范围 × 动作是两条正交的轴：m + n 个控件，不是 m × n 个钮，也不用两层 sheet。取消 / Esc / 点空白 = null。 */
/** 第二条段选（可选）：一个和范围无关的小选项（导出的行宽）。带一个行首小标签；一点就 onChange（要记住的话调用方在这里记）。 */
export interface SegRow<X> {
    label: string;
    options: {
        label: string;
        value: X;
    }[];
    initial: X;
    onChange?: (value: X) => void;
}
export interface ScopedChoiceOpts<S, T, X = never> {
    scopes: {
        label: string;
        value: S;
    }[];
    initial: S;
    extra?: SegRow<X>;
    note: (scope: S) => string;
    choices: (scope: S) => Choice<T>[];
}
export declare function openScopedChoiceSheet<S, T, X = never>(title: string, opts: ScopedChoiceOpts<S, T, X>): Promise<{
    scope: S;
    value: T;
    extra: X | undefined;
} | null>;
/** 通用「搜索 + 选一项」sheet（user 2026-09-10「点之后弹一个对话框，搜索，下拉，选中，就 reparent 了」「通用件同意」「不用原生 select」；created 2026-09-10 by Claude Fable 5.1）。
 *  首用 = 挪到…（app.ts movePageFlow）；「链接到已有页」「移到夹」之类以后同一个件。列表自绘（iOS 原生 select 是滚轮、Quest 更糟）。
 *  rows 由 search(q) **同步**给（q 空 = 默认列表，调用方决定给什么）；点行 = 选中 → 列表下方出现该行的动作钮（actions(row)，按行算：固定行可以只有一个动作）。
 *  键盘：Enter 没选中 = 选第一行、已选中 = 主动作（primary，没有就第一个）；↑↓ 换行；Esc / 取消 / 点空白 = null。 */
export interface PickRow<T> {
    value: T;
    label: string;
    icon?: string;
}
export interface PickAction<A extends string> {
    id: A;
    label: string;
    primary?: boolean;
}
export interface PickOpts<T, A extends string> {
    message?: string;
    placeholder?: string;
    emptyText: string;
    search: (q: string) => PickRow<T>[];
    actions: (row: PickRow<T>) => PickAction<A>[];
}
export declare function openPickSheet<T, A extends string>(title: string, opts: PickOpts<T, A>): Promise<{
    value: T;
    action: A;
} | null>;
interface GateAction<T> {
    label: string;
    value: T;
    primary?: boolean;
}
interface GateOpts<T> {
    title: string;
    message: string;
    note?: string;
    showSpinner?: boolean;
    actions: GateAction<T>[];
}
export declare function lockSyncGate<T = string>({ title, message, note, showSpinner, actions }: GateOpts<T>): Promise<T>;
export declare function unlockSyncGate(): void;
export declare function settleSyncGate(value: unknown): void;
export {};
