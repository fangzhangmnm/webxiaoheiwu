export declare const IMPORT_EDGE_MAX = 2048;
export declare const IMPORT_EDGE_MAX_HD = 4096;
export declare const IMPORT_JPEG_QUALITY = 85;
export declare const GIF_FAT_BYTES: number;
export type ImageType = "jpeg" | "png" | "webp" | "gif";
export declare const EXT_FOR_TYPE: Record<ImageType, string>;
/** 魔数嗅探；不认识 → null（不是图片，拒收）。 */
export declare function sniffImageType(b: Uint8Array): ImageType | null;
export type ImportPlan = {
    kind: "passthrough";
} | {
    kind: "strip";
} | {
    kind: "reencode";
    fw: number;
    fh: number;
    keepOriginalIfBigger: boolean;
};
/** w/h = 解码后（已按 EXIF 方向摆正）的尺寸；orientation = JPEG 的 EXIF Orientation（无 → null）。 */
export declare function planImageImport(o: {
    type: ImageType;
    w: number;
    h: number;
    orientation: number | null;
    hd: boolean;
}): ImportPlan;
export declare const isFatGif: (bytes: number) => boolean;
/** 进门页名：有名保名（去路径字符），扩展名以**实际字节类型**为准（改名 IMG.jpeg → 仍 .jpeg 保留；无扩展名 / 扩展名不符 → 补真实的）；无名（粘贴位图）→ `<date>-<hex4>.<ext>`。撞名由 graph 层 hex4。 */
export declare function importPageName(originalName: string | null, ext: string, fallbackStem: string): string;
