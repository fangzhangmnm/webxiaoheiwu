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
    warning?: boolean;
}
export declare function openConfirmSheet(title: string, message: string, opts?: ConfirmOpts): Promise<boolean>;
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
}
/** 输入 sheet → string | null（取消）。密码态用 -webkit-text-security 打码（不用 type=password：绕开浏览器记密码弹窗——WeebPaint 教训）。 */
export declare function openInputSheet(title: string, opts?: InputOpts): Promise<string | null>;
export interface Choice<T> {
    label: string;
    value: T;
    primary?: boolean;
    danger?: boolean;
}
export declare function openChoiceSheet<T>(title: string, message: string, choices: Choice<T>[]): Promise<T | null>;
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
