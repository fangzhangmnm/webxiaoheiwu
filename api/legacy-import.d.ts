export interface LegacyVoiceJson {
    provider?: string;
    groqKey?: string;
    openaiKey?: string;
    vocab?: string;
}
/** 偏好 + 词库：登录后静默跑一次（幂等，marker 守卫；只填新家里**没有**的值）。返回导入了什么。 */
export declare function importLegacyPrefsAndDict(): Promise<{
    voice: boolean;
    dict: boolean;
}>;
export declare function legacyEncryptedImported(): boolean;
/** 旧 .enc/ 里有几份加密稿（不含 .enc/.trash）。null = 探不到（离线/未登录）。 */
export declare function countLegacyEncrypted(): Promise<number | null>;
export interface LegacyEncImportProgress {
    done: number;
    total: number;
    name?: string;
}
export type LegacyEncImportResult = {
    status: "ok";
    imported: number;
    failed: string[];
} | {
    status: "wrong-password";
} | {
    status: "no-setup";
} | {
    status: "nothing";
};
/** 导入旧加密稿：旧密码验 verifier（错密码不碰任何文件）→ 逐份解密 → 以新统一密码建 v2 加密稿。调用方须已解锁新密码（ensureUnlocked）。 */
export declare function importLegacyEncrypted(oldPassphrase: string, onProgress?: (p: LegacyEncImportProgress) => void): Promise<LegacyEncImportResult>;
