export type FontId = "sans" | "pinyin" | "pixel";
/** CSS / canvas 里用的 family 名。按角色起名，不带品牌。 */
export declare const FONT_FAMILY: Record<FontId, string>;
export declare const FONT_IDS: readonly FontId[];
export declare const SANS_FAMILY: string;
/** 取字体字节（TTF）。拿不到（文件不在 / 离线且没缓存）→ null。每次调用都重新取——调用方自己决定留不留。 */
export declare function loadFontBytes(id: FontId): Promise<Uint8Array | null>;
/** 把字体装进文档。每款只做一次；装好 → true，拿不到 / 浏览器不支持 → false（装失败的下次调用会重试）。 */
export declare function installFont(id: FontId): Promise<boolean>;
/** 把已经装进主页面的字体再装一份进另一个文档（小窗，v2.3.60）。FontFace 属于创建它的那个窗口，要用那个窗口自己的 FontFace 构造；
 *  不装的话小窗里落到系统字体，稿纸行高和横线都对不上。字节重新取一次（走 HTTP / SW 缓存）。 */
export declare function installFontsInto(doc: Document): Promise<void>;
export declare const loadSansBytes: () => Promise<Uint8Array | null>;
export declare const installSansFont: () => Promise<boolean>;
