// 「在这台设备上记住密码」政策。created 2026-10-17 by Claude Opus 5.5
// user 2026-10-17：「口令记忆功能，类似kudsrocket，这个是安全红线，我批，商量一下怎么存」→ 方案五条照建议 +「口令加一个过期时间，最多一个月」。
// 决策与威胁模型 = @internal/encryption 仓 ai-docs/adr/0001-device-remembers-password.md；本仓 ADR-0017。
// 规矩：
//   · 只记**当前密码**；每篇自己的密码照旧每次问。解锁 / 首次设密码的面板上一个勾，默认不勾；记 30 天（库的上限），到期自动忘。
//   · 开页：记着 → 先和 verifier 比（crypto-state.unlockWith），对了才算解锁；对不上（别的设备改过 / 重置过）→ 忘掉，照常问。
//   · 锁定（立即锁定 / 退出登录 / 忘记密码重置）= 忘掉；改密码 = 记新的（剩下的天数不变）；还原出厂 = 删库；清缓存 / 强制更新不碰。
//   · 2 分钟闲置锁屏本来就不忘密码，不变。
//   · keeper 由组装点（app.ts）注入 encryption.ts 的 passwordKeeper；全 app 只有本文件用它（test/storage-whitelist 守着）。本模块不打印密码。
import type { PasswordKeeper } from "@internal/encryption";
import { unlockWith, onCurrentPasswordChange, hasVerifier } from "./crypto-state.ts";

let _keeper: () => PasswordKeeper = () => { throw new Error("remember-password not wired (wireRememberPassword)"); };
let _now: () => number = () => Date.now();
let _until: number | null = null;   // 记到什么时候（UI 用）；null = 没记
let _pw: string | null = null;      // 记着的是哪一个（判断当前密码变了要不要跟着换）——内存里本来就有的那个
let _choice = false;                // 面板上那个勾这一轮勾没勾
let _forgetting: Promise<void> | null = null;
let _onError: (e: unknown) => void = () => {};
const _subs = new Set<() => void>();
const notify = () => { for (const cb of _subs) { try { cb(); } catch { /* UI 订阅者的错不能拖垮记忆状态 */ } } };

/** 组装点调一次；测试再调一次换成内存版（会清掉状态）。 */
export function wireRememberPassword(d: { keeper: () => PasswordKeeper; onError: (e: unknown) => void; now?: () => number }): void {
  _keeper = d.keeper; _onError = d.onError; _now = d.now ?? (() => Date.now());
  _until = null; _pw = null; _choice = false; _forgetting = null;
}
/** 记到什么时候（epoch ms）；null = 这台设备没记着。 */
export function rememberedUntil(): number | null { return _until; }
export function onRememberChange(cb: () => void): () => void { _subs.add(cb); return () => _subs.delete(cb); }
/** 密码面板交回勾态（重试时面板按它预勾）。 */
export function setRememberChoice(v: boolean): void { _choice = v; }
export function rememberChoice(): boolean { return _choice; }
/** 取走这一轮的勾（取一次就清）。 */
export function takeRememberChoice(): boolean { const v = _choice; _choice = false; return v; }

/** 开页：试记着的密码。"unlocked" = 已解锁；"none" = 没记 / 没东西可比；"stale" = 对不上，已忘。 */
export async function restoreRemembered(): Promise<"unlocked" | "none" | "stale"> {
  const k = _keeper();
  const pw = await k.recall();
  if (pw == null) { _until = null; _pw = null; notify(); return "none"; }
  if (!hasVerifier()) { await forgetRemembered(); return "none"; }   // 记着却没 verifier = 别处重置过密码；留着没用
  _pw = pw; _until = (await k.status()).expiresAt;
  if (await unlockWith(pw)) { notify(); return "unlocked"; }
  await forgetRemembered();
  return "stale";
}

/** 记住当前密码（面板上勾了）。返回记到什么时候。 */
export async function rememberCurrent(pw: string): Promise<number> {
  const { expiresAt } = await _keeper().remember(pw);
  _pw = pw; _until = expiresAt; notify();
  return expiresAt;
}

/** 忘掉（幂等；在飞的那次直接复用）。 */
export function forgetRemembered(): Promise<void> {
  _forgetting ??= (async () => {
    try { await _keeper().forget(); _pw = null; _until = null; notify(); }
    finally { _forgetting = null; }
  })();
  return _forgetting;
}

// 跟着当前密码走：锁定 = 忘；改了密码 = 记新的，剩下的天数不变（同意的是「从那天起最多一个月」）。
onCurrentPasswordChange((pw) => {
  if (_until == null) return;
  if (pw == null) { forgetRemembered().catch(_onError); return; }
  if (pw === _pw) return;
  const left = _until - _now();
  if (left <= 0) { forgetRemembered().catch(_onError); return; }
  _keeper().remember(pw, { ttlMs: left }).then(({ expiresAt }) => { _pw = pw; _until = expiresAt; notify(); }, _onError);
});
