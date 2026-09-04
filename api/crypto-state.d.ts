export interface VerifierRecord {
    v: 1;
    salt: string;
    iv: string;
    ct: string;
}
export interface PromptOpts {
    title: string;
    message?: string;
    error?: string;
    confirmField?: boolean;
    okLabel?: string;
}
type PasswordPrompt = (opts: PromptOpts) => Promise<string | null>;
type VerifierStore = {
    get(): VerifierRecord | null;
    set(rec: VerifierRecord | null): void;
};
export declare function createVerifierRecord(pw: string): Promise<VerifierRecord>;
export declare function verifyRecord(rec: VerifierRecord, pw: string): Promise<boolean>;
export declare function wireCryptoState(deps: {
    prompt: PasswordPrompt;
    verifiers: VerifierStore;
}): void;
export declare function isUnlocked(): boolean;
/** 锁定 = 忘掉密码（内存清除）。加密文件回到锁样式；保存路径会报 LOCKED 而非静默。 */
export declare function lock(): void;
export declare function onLockChange(cb: (unlocked: boolean) => void): () => void;
/** store crypt seam：唯一密码源（同步、非交互）——这篇自己的密码优先，否则当前密码。 */
export declare function getPassword(name: string | null): string | null;
export declare function hasVerifier(): boolean;
export declare function currentPassword(): string | null;
/** 记住「这篇用的是 pw」（等于当前密码则不必记）。 */
export declare function rememberFilePassword(name: string, pw: string): void;
export declare function forgetFilePassword(name: string): void;
export declare function renameFilePassword(from: string, to: string): void;
export declare function fileUsesOtherPassword(name: string): boolean;
/** 更改当前密码：写新 verifier + 换内存密码；表里与新密码相同的条目自动消掉（它们已经等于当前）。已加密稿**不会**因此改钥匙（迁移是调用方的显式循环）。 */
export declare function setCurrentPassword(pw: string): Promise<void>;
/** 忘记密码 → 重置：清 verifier + 锁定。已有加密稿仍是各自旧密码（只有想起来才能开），调用方必须先警告。 */
export declare function resetVerifier(): void;
/** 「这篇稿用的不是当前密码」循环（busy 外）：反复问到 verify 过（记进表）或取消。 */
export declare function ensureFileUnlocked(name: string, labels: {
    title: string;
    hint: string;
    wrong: string;
    ok: string;
}, verify: (pw: string) => Promise<boolean>): Promise<boolean>;
/** 解锁循环（**busy 外**）：有 verifier → 反复问到对或取消；无 verifier → 首次设密码（两次输入一致、≥8 位）→ 写 verifier。
 *  返回 true = 已解锁。错密码永不碰任何文件（verifier 是唯一被试的东西）。 */
export declare function ensureUnlocked(labels: {
    unlockTitle: string;
    unlockHint: string;
    setupTitle: string;
    setupHint: string;
    wrong: string;
    mismatch: string;
    okUnlock: string;
    okSetup: string;
}): Promise<boolean>;
export {};
