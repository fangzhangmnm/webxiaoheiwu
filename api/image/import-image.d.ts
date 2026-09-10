import { type ImageType } from "./policy.ts";
import { encodePng } from "./codec.ts";
export declare class NotAnImageError extends Error {
    name: string;
    constructor();
}
export interface SlimResult {
    bytes: Uint8Array;
    type: ImageType;
    ext: string;
    from: number;
    to: number;
    /** 像素被缩过 / 重编码过（状态行「已压缩 A → B」用）。 */
    scaled: boolean;
    reencoded: boolean;
    /** GIF 直通且 > 2 MB（UI 二次确认）。 */
    fatGif: boolean;
}
export declare function slimImage(file: Blob, opts: {
    hd: boolean;
}): Promise<SlimResult>;
/** 封面 PNG：白底、≤256²、≤70 KB（gallery 包阶梯）；可带腰封（iTXt Description）。GIF 取首帧。 */
export declare function makeCoverPng(bytes: Uint8Array, blurb?: string | null): Promise<Uint8Array>;
export { encodePng };
