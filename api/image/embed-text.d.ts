/** PNG：在 IHDR 后面插 iTXt 块。entries 里正文为空的不写。不是 PNG → 原样返回。 */
export declare function embedTextPng(png: Uint8Array, entries: {
    keyword: "Title" | "Software" | "Description";
    text: string;
}[]): Uint8Array;
/** JPEG：插 COM 段。不是 JPEG / 正文为空 → 原样返回。 */
export declare function embedTextJpeg(jpg: Uint8Array, text: string): Uint8Array;
/** 读回嵌进去的文字（PNG = Description 那一块；JPEG = 所有 COM 段接起来）。没有 → null。 */
export declare function readEmbeddedText(bytes: Uint8Array): string | null;
