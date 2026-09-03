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
/** store crypt seam：唯一密码源（同步、非交互）。 */
export declare function getPassword(_name: string | null): string | null;
export declare function hasVerifier(): boolean;
/** 解锁循环（**busy 外**）：有 verifier → 反复问到对或取消；无 verifier → 首次设密码（两次输入一致、≥8 位）→ 写 verifier。
 *  返回 true = 已解锁。错密码永不碰任何文件（verifier 是唯一被试的东西）。 */
export declare function ensureUnlocked(labels: {
    unlockTitle: string;
    unlockHint: string;
    setupTitle: string;
    setupHint: string;
    wrong: string;
    mismatch: string;
    tooShort: string;
    okUnlock: string;
    okSetup: string;
}): Promise<boolean>;
export {};
