import type { ImageType } from "./policy.ts";
export declare function stripJpeg(b: Uint8Array): Uint8Array;
/** EXIF Orientation（1–8）；没有 / 解析不了 → null。 */
export declare function readJpegOrientation(b: Uint8Array): number | null;
export declare function stripPng(b: Uint8Array): Uint8Array;
export declare function stripWebp(b: Uint8Array): Uint8Array;
/** 按类型剥（GIF 原样）。剥不动 / 不认识 → 原字节。 */
export declare function stripMetadata(b: Uint8Array, type: ImageType): Uint8Array;
