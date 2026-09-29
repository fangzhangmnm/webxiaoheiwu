export type PaperWidthPref = "auto" | "mode" | "wide";
export interface PaperDeps {
    page: HTMLElement;
    editor: HTMLTextAreaElement;
    /** 本机的稿纸宽度偏好：auto = 矮而宽的可用区自动加宽；mode = 只跟阅读节奏；wide = 总是加宽。 */
    widthPref(): PaperWidthPref;
    /** 屏幕底部被输入法那一块占掉的高度（px）。 */
    dockHeight(): number;
    /** 几何变了（行高 / 线位 / 宽窄档）：纸面上的件要重排。 */
    onChanged(): void;
}
export interface Paper {
    /** 重算（视口 / 缩放 / 字号档位 / 阅读节奏 / 软键盘露收 之后调）。 */
    refresh(): void;
    /** 一行的高度（CSS px，已对齐设备像素）。 */
    lineHeight(): number;
    /** 正文内容的高度（不碰正文框本身：量一个看不见的孪生框）。 */
    contentHeight(): number;
    /** 把一个件的上沿补到整像素（用 margin-top 补零点几像素）。纸面上方的章节名行高度带小数（字号 × 1.25 × 1.4），正文容器的上沿就落在零点几像素上；
     *  浏览器画字时各自取整，正文框和目录行会差出 1 像素（2026-09-29 量到：同一套线，目录的字比正文的字低 1–2 个像素）。上沿是整数就没有这回事。 */
    alignTop(el: HTMLElement): void;
}
export declare function createPaper(d: PaperDeps): Paper;
