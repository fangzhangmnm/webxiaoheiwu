import { type Split } from "./paragraphs.ts";
export interface AdvBoxDeps {
    /** 正文框：唯一的真相。 */
    editor: HTMLTextAreaElement;
    /** 对话框里那个框。 */
    input: HTMLTextAreaElement;
    /** 现在能不能改正文（锁 / 只读 / 世界线守卫；= app 的 canEditNow）。 */
    canEdit(): boolean;
    /** 当前页 / 稿的身份：变了 = 换页，从正文的光标（开页落在开头）重取。 */
    pageKey(): string;
    /** 怎么分段（设置「逐段怎么分段」：一个换行 / 空一行）。随时读：改了设置宿主调 sync()。 */
    split(): Split;
    /** 第几段 / 共几段变了（画 ‹ › 的可点状态）；beat = 这一段是新的一拍（单回车分段时前面隔着空行；v3.0.7）。 */
    onPosition?(index: number, count: number, beat: boolean): void;
    /** 光标所在的那一行（框里按换行切的一行；段首那一行带上收起来的标记）可能变了：宿主拿去认说话人、画名字牌（v3.0.5）。 */
    onLine?(line: string): void;
    /** 这一段前面的正文（到上一段末尾为止，最多几千字；第一段 = 空）：宿主拿去在框上方淡淡地显示前文（v3.0.8）。换段 / 别处改了正文都会再报。 */
    onContext?(before: string): void;
    /** 段首那一行开头有几个字是说话人标记（收进名字牌、不进框；v3.0.6，user「小月：  不进文本框啊」）。没有 / 不收 = 0。 */
    tagLength?(firstLine: string): number;
}
export interface AdvBox {
    readonly active: boolean;
    /** 开 / 关这扇窗。开 = 落在正文光标所在的那一段（user 2026-10-26「切换框的时候应该根据光标的位置，而不是跳到最后」）。 */
    setActive(on: boolean): void;
    /** 宿主重画时调（换页 / 换稿 / 锁变了）：页变了 = 从正文的光标重取；没变但框和正文对不上 = 重取；对得上 = 不动（不清撤销栈）。 */
    sync(): void;
    /** 框里的光标写回正文（语音起录前、离开模式前；平时每次改字 / 抬键 / 点击也写）。 */
    pushCaret(): void;
    prev(): void;
    next(): void;
    focus(): void;
    position(): {
        index: number;
        count: number;
    };
}
export declare function createAdvBox(d: AdvBoxDeps): AdvBox;
