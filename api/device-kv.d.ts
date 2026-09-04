export declare function deviceKvGet(key: string): string | null;
/** v=null 删键。写失败（配额/隐私模式中途翻脸）→ 落内存层，绝不 throw（device 层是便利不是红线）。 */
export declare function deviceKvSet(key: string, v: string | null): void;
export declare function deviceKvGetJson<T>(key: string, fallback: T): T;
export declare function deviceKvSetJson(key: string, v: unknown): void;
/** 还原出厂：清掉本 app 前缀下全部 localStorage 键（localStorage 只准本文件碰）。返回删掉的键数。 */
export declare function deviceKvWipeAll(): number;
/** 残留扫描：本 app 前缀下还有几个键。 */
export declare function deviceKvCount(): number;
