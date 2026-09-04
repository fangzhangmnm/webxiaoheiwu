// 密码**政策**模块（WeebPaint crypto-state + password-verifier 塌成一个；统一密码模型）。created 2026-09-03 by Claude Fable 5.1
//   · store 对密码非交互（seam 只要 getPassword）；本模块持有**内存**密码——永不持久化，关 tab / 锁定即忘。
//   · 「已经设过密码吗 / 密码是不是 X」= verifier 记录（跟账号走的 synced collection）：{v,salt,iv,ct}，
//     ct = AES-GCM(PBKDF2(pw,salt), 固定明文)，GCM tag 即验证。不存明文/密钥/可逆物。
//     发源地 = v1 的 `.crypto/verifier.bin` 同一思想（错密码绝不碰任何用户文件），只是搬进 collection。
//   · 忘记密码 = 内容永久找不回（无后门，user 2026-05 拍板「MS cannot know my key」）。
// 弹窗由 composition root 注入（无 DOM 依赖）；「弹框→验证→重试」循环在 busy 之外做。

export interface VerifierRecord { v: 1; salt: string; iv: string; ct: string }
export interface PromptOpts { title: string; message?: string; error?: string; confirmField?: boolean; okLabel?: string }
type PasswordPrompt = (opts: PromptOpts) => Promise<string | null>;
type VerifierStore = { get(): VerifierRecord | null; set(rec: VerifierRecord | null): void };

const PBKDF2_ITERS = 250_000;
const PLAINTEXT = "webxiaoheiwu-password-verifier-v1";
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function _deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const base = await subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return await subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: PBKDF2_ITERS },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// ── 纯密码学（node 可测）──
export async function createVerifierRecord(pw: string): Promise<VerifierRecord> {
  const salt = new Uint8Array(16), iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(salt); globalThis.crypto.getRandomValues(iv);
  const key = await _deriveKey(pw, salt);
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(PLAINTEXT)));
  return { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
export async function verifyRecord(rec: VerifierRecord, pw: string): Promise<boolean> {
  try {
    const key = await _deriveKey(pw, unb64(rec.salt));
    const plain = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.iv) as BufferSource }, key, unb64(rec.ct) as BufferSource);
    return new TextDecoder().decode(plain) === PLAINTEXT;
  } catch { return false; }
}

// ── 内存密码 ──
let _password: string | null = null;
let _prompt: PasswordPrompt | null = null;
let _verifiers: VerifierStore | null = null;
const _subs = new Set<(unlocked: boolean) => void>();
function _notify() { for (const cb of _subs) { try { cb(_password != null); } catch { /* subscriber bug must not break lock state */ } } }

export function wireCryptoState(deps: { prompt: PasswordPrompt; verifiers: VerifierStore }): void { _prompt = deps.prompt; _verifiers = deps.verifiers; }
export function isUnlocked(): boolean { return _password != null; }
/** 锁定 = 忘掉密码（内存清除）。加密文件回到锁样式；保存路径会报 LOCKED 而非静默。 */
export function lock(): void { _password = null; _notify(); }
export function onLockChange(cb: (unlocked: boolean) => void): () => void { _subs.add(cb); return () => _subs.delete(cb); }
/** store crypt seam：唯一密码源（同步、非交互）。 */
export function getPassword(_name: string | null): string | null { return _password; }
export function hasVerifier(): boolean { return _verifiers?.get() != null; }

/** 解锁循环（**busy 外**）：有 verifier → 反复问到对或取消；无 verifier → 首次设密码（两次输入一致、≥8 位）→ 写 verifier。
 *  返回 true = 已解锁。错密码永不碰任何文件（verifier 是唯一被试的东西）。 */
export async function ensureUnlocked(labels: {
  unlockTitle: string; unlockHint: string; setupTitle: string; setupHint: string; wrong: string; mismatch: string; okUnlock: string; okSetup: string;
}): Promise<boolean> {
  if (_password != null) return true;
  if (!_prompt || !_verifiers) throw new Error("crypto-state not wired (wireCryptoState)");
  const rec = _verifiers.get();
  let error: string | undefined;
  for (;;) {
    if (rec) {
      const pw = await _prompt({ title: labels.unlockTitle, message: labels.unlockHint, error, okLabel: labels.okUnlock });
      if (pw == null) return false;
      if (await verifyRecord(rec, pw)) { _password = pw; _notify(); return true; }
      error = labels.wrong;
    } else {
      const pw = await _prompt({ title: labels.setupTitle, message: labels.setupHint, error, confirmField: true, okLabel: labels.okSetup });
      if (pw == null) return false;
      // 无最少位数检查（user 2026-09-03：「去掉密码的最少位数检查」——密码强弱归用户自己判断）
      _verifiers.set(await createVerifierRecord(pw));
      _password = pw; _notify(); return true;
    }
  }
}
