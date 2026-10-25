export interface PipHost {
    /** 搬进小窗之后：宿主绑小窗的事件、装字体、量稿纸。 */
    onEnter(win: Window): void;
    /** 搬回来之后：宿主解绑、量稿纸、把焦点还给正文。 */
    onLeave(): void;
    /** 纸搬走后原位放的占位（一句话 + 「收回」）。 */
    placeholder(): HTMLElement;
    /** 第一次开多大（CSS 像素，小窗里面那块）。 */
    size(): {
        width: number;
        height: number;
    };
    /** 小窗现在这么高，离「整行」还差多少（正 = 要加高，负 = 要减）；已经对上 = 0。 */
    fit(innerHeight: number): number;
}
export interface Pip {
    readonly supported: boolean;
    /** 纸现在在小窗里。 */
    readonly active: boolean;
    /** 小窗的 window（没开 = null）。 */
    readonly window: Window | null;
    /** 开小窗（必须在用户手势里调）。返回是否真开了。 */
    open(): Promise<boolean>;
    /** 收回：纸搬回原位，小窗关掉。 */
    close(): void;
}
export declare const pipSupported: () => boolean;
/** 小窗高度收成整行：可用高 = 内高 − 上下边距；行数 = 四舍五入（至少 minRows 行）；返回要加 / 减多少像素（对上了 = 0，差半像素以内算对上）。纯函数，单测钉着。 */
export declare function fitToRows(innerHeight: number, lineHeight: number, pad: number, minRows?: number): number;
/** sheet = 纸（原位放占位）；extras（候选条）记下原来的父亲和下一个兄弟，收回时放回去。 */
export declare function createPip(sheet: HTMLElement, extras: HTMLElement[], host: PipHost): Pip;
