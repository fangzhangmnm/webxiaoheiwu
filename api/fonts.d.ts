/** CSS 里用的 family 名（styles.css `--font-editor` 的第一位）。按角色起名，不带品牌。 */
export declare const SANS_FAMILY = "XHW Sans";
/** 取字体字节（TTF）。拿不到（文件不在 / 离线且没缓存）→ null。每次调用都重新取——调用方自己决定留不留。 */
export declare function loadSansBytes(): Promise<Uint8Array | null>;
/** 把字体装进文档。只做一次；装好 → true，拿不到 / 浏览器不支持 → false（界面照旧用系统字体）。 */
export declare function installSansFont(): Promise<boolean>;
