// 密码**政策**模块（WeebPaint crypto-state + password-verifier 塌成一个；统一密码模型）。created 2026-09-03 by Claude Fable 5.1
//   · store 对密码非交互（seam 只要 getPassword）；本模块持有**内存**密码——永不持久化，关 tab / 锁定即忘。
//   · 「已经设过密码吗 / 密码是不是 X」= verifier 记录（跟账号走的 synced collection）：{v,salt,iv,ct}，
//     ct = AES-GCM(PBKDF2(pw,salt), 固定明文)，GCM tag 即验证。不存明文/密钥/可逆物。
//     发源地 = v1 的 `.crypto/verifier.bin` 同一思想（错密码绝不碰任何用户文件），只是搬进 collection。
//   · 忘记密码 = 内容永久找不回（无后门，user 2026-05 拍板「MS cannot know my key」）。
//   · **每篇可以有自己的密码**（7z 容器本来就各自封；user 2026-09-03「anti abandonware ritual 是每个文件可以有单独的密码」）：
//     内存表 name→密码，`getPassword(name)` = 这篇自己的 ?? 当前密码。三条规则：①保存永远用这篇打开时那把，绝不悄悄换钥匙；
//     ②「当前密码」只做新稿默认钥匙 + 打开旧稿第一把试的钥匙；③换钥匙只能是显式动作（横幅「换成当前密码」/ 设置页「更改密码」迁移）。
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
const _filePw = new Map<string, string>();   // 每篇自己的密码（与当前密码不同的才记；锁定即忘）
let _prompt: PasswordPrompt | null = null;
let _verifiers: VerifierStore | null = null;
const _subs = new Set<(unlocked: boolean) => void>();
function _notify() { for (const cb of _subs) { try { cb(_password != null); } catch { /* subscriber bug must not break lock state */ } } }

export function wireCryptoState(deps: { prompt: PasswordPrompt; verifiers: VerifierStore }): void { _prompt = deps.prompt; _verifiers = deps.verifiers; }
export function isUnlocked(): boolean { return _password != null; }
/** 锁定 = 忘掉密码（内存清除）。加密文件回到锁样式；保存路径会报 LOCKED 而非静默。 */
export function lock(): void { _password = null; _filePw.clear(); _notify(); }
export function onLockChange(cb: (unlocked: boolean) => void): () => void { _subs.add(cb); return () => _subs.delete(cb); }
/** store crypt seam：唯一密码源（同步、非交互）——这篇自己的密码优先，否则当前密码。 */
export function getPassword(name: string | null): string | null { return (name != null ? _filePw.get(name) : undefined) ?? _password; }
export function hasVerifier(): boolean { return _verifiers?.get() != null; }
export function currentPassword(): string | null { return _password; }
/** 记住「这篇用的是 pw」（等于当前密码则不必记）。 */
export function rememberFilePassword(name: string, pw: string): void { if (pw === _password) _filePw.delete(name); else _filePw.set(name, pw); }
export function forgetFilePassword(name: string): void { _filePw.delete(name); }
export function renameFilePassword(from: string, to: string): void { const pw = _filePw.get(from); if (pw != null) { _filePw.delete(from); _filePw.set(to, pw); } }
export function fileUsesOtherPassword(name: string): boolean { return _filePw.has(name); }
/** 更改当前密码：写新 verifier + 换内存密码；表里与新密码相同的条目自动消掉（它们已经等于当前）。已加密稿**不会**因此改钥匙（迁移是调用方的显式循环）。 */
export async function setCurrentPassword(pw: string): Promise<void> {
  if (!_verifiers) throw new Error("crypto-state not wired (wireCryptoState)");
  _verifiers.set(await createVerifierRecord(pw));
  _password = pw;
  for (const [n, p] of _filePw) if (p === pw) _filePw.delete(n);
  _notify();
}
/** 忘记密码 → 重置：清 verifier + 锁定。已有加密稿仍是各自旧密码（只有想起来才能开），调用方必须先警告。 */
export function resetVerifier(): void { if (!_verifiers) throw new Error("crypto-state not wired (wireCryptoState)"); _verifiers.set(null); lock(); }

/** 「这篇稿用的不是当前密码」循环（busy 外）：反复问到 verify 过（记进表）或取消。 */
export async function ensureFileUnlocked(name: string, labels: { title: string; hint: string; wrong: string; ok: string }, verify: (pw: string) => Promise<boolean>): Promise<boolean> {
  if (!_prompt) throw new Error("crypto-state not wired (wireCryptoState)");
  let error: string | undefined;
  for (;;) {
    const pw = await _prompt({ title: labels.title, message: labels.hint, error, okLabel: labels.ok });
    if (pw == null) return false;
    if (await verify(pw)) { rememberFilePassword(name, pw); return true; }
    error = labels.wrong;
  }
}

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
