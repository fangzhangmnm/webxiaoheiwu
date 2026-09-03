import type { SevenZipModuleFactory } from "../vendor/7z-wasm/index.d.ts";
interface SevenZipConfig {
    factory: SevenZipModuleFactory;
    wasmBinary: ArrayBuffer;
}
type SevenZipLoader = () => Promise<SevenZipConfig>;
export declare function setSevenZipLoader(fn: SevenZipLoader): void;
type SevenZipData = Uint8Array | ArrayBuffer | string;
/** 打包加密 .7z：-t7z AES-256 · -mhe=on 加密头 · -mx=0 STORE。 */
export declare function pack7z(entries: {
    path: string;
    data: SevenZipData;
}[], password: string): Promise<Uint8Array>;
/** 解 .7z → { path: Uint8Array }。密码错 / 文件坏 → throw code=WRONG_PASSWORD（-mhe 加密头：错密码连目录都列不出）。 */
export declare function unpack7z(bytes: SevenZipData, password: string): Promise<Record<string, Uint8Array>>;
export {};
