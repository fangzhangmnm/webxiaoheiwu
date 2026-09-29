/** txt 稿：把编辑器里这一整篇另存成新稿。返回新稿身份。 */
export declare function rescueText(sourceName: string, text: string, opts: {
    encrypted: boolean;
}): Promise<string>;
/** 书：把屏幕上那一整本（含还没落盘的改动）另存成一本新书。返回新书身份。 */
export declare function rescueBook(sourceName: string, blob: Blob, opts: {
    encrypted: boolean;
}): Promise<string>;
