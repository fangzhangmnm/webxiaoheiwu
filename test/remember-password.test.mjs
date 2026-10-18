// 「在这台设备上记住密码」政策（src/remember-password.ts）：开页先比 verifier、对不上就忘、锁定即忘、改密码跟着换且天数不变、没勾不记。
// keeper = @internal/encryption 的 createPasswordKeeper + 内存存储（真 WebCrypto）。created 2026-10-17 by Claude Opus 5.5
import { describe, it, eq, assert } from "./runner.mjs";
import { createPasswordKeeper } from "@internal/encryption";
import { createVerifierRecord, wireCryptoState, ensureUnlocked, ensureFileUnlocked, isUnlocked, lock, setCurrentPassword, currentPassword } from "../src/crypto-state.ts";
import { wireRememberPassword, restoreRemembered, rememberCurrent, forgetRemembered, rememberedUntil } from "../src/remember-password.ts";

const DAY = 86400_000;
function memStore() { let rec; return { get: async () => rec, put: async (r) => { rec = r; }, delete: async () => { rec = undefined; }, peek: () => rec }; }
function setup({ verifierPw = "real pw", t0 = 1_700_000_000_000 } = {}) {
  const clock = { t: t0 }; const now = () => clock.t;
  const store = memStore();
  const keeper = createPasswordKeeper({ dbName: "test", store, now });
  const errors = [];
  wireRememberPassword({ keeper: () => keeper, onError: (e) => errors.push(e), now });
  return { clock, store, keeper, errors, verifier: verifierPw ? createVerifierRecord(verifierPw) : Promise.resolve(null) };
}
async function wire(verifierRec, prompt = async () => null) {
  let rec = verifierRec;
  wireCryptoState({ prompt, verifiers: { get: () => rec, set: (r) => { rec = r; } } });
  lock();
  return { get: () => rec };
}
async function until(fn, ms = 2000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 10)); } return false; }

describe("remember-password · 开页", () => {
  it("没记 → none，仍锁着", async () => {
    const s = setup(); await wire(await s.verifier);
    eq(await restoreRemembered(), "none"); assert(!isUnlocked()); eq(rememberedUntil(), null);
  }, { timeout: 30_000 });
  it("记着且和 verifier 对得上 → 解锁；记到哪天可读", async () => {
    const s = setup(); await wire(await s.verifier);
    await s.keeper.remember("real pw");
    lock();   // 模拟重开页：内存里没有密码
    eq(await restoreRemembered(), "unlocked");
    assert(isUnlocked()); eq(currentPassword(), "real pw");
    eq(rememberedUntil(), s.clock.t + 30 * DAY);
  }, { timeout: 30_000 });
  it("记着的对不上（别的设备改过密码）→ stale，记录删掉，仍锁着", async () => {
    const s = setup({ verifierPw: "new pw elsewhere" }); await wire(await s.verifier);
    await s.keeper.remember("old pw");
    eq(await restoreRemembered(), "stale");
    assert(!isUnlocked()); eq(s.store.peek(), undefined, "坏的记录不留"); eq(rememberedUntil(), null);
  }, { timeout: 30_000 });
  it("记着却没 verifier（别处重置过）→ none，记录删掉", async () => {
    const s = setup({ verifierPw: null }); await wire(null);
    await s.keeper.remember("whatever");
    eq(await restoreRemembered(), "none"); eq(s.store.peek(), undefined); assert(!isUnlocked());
  }, { timeout: 30_000 });
  it("过期了 → none（30 天整到点）", async () => {
    const s = setup(); await wire(await s.verifier);
    await s.keeper.remember("real pw");
    lock(); s.clock.t += 30 * DAY;
    eq(await restoreRemembered(), "none"); assert(!isUnlocked());
  }, { timeout: 30_000 });
});

describe("remember-password · 跟着当前密码走", () => {
  it("锁定 = 忘掉", async () => {
    const s = setup(); await wire(await s.verifier);
    await setCurrentPassword("real pw"); await rememberCurrent("real pw");
    assert(rememberedUntil() != null);
    lock();
    await forgetRemembered();   // 订阅里的那次在飞 → 复用同一个
    eq(s.store.peek(), undefined); eq(rememberedUntil(), null);
  }, { timeout: 30_000 });
  it("改密码 → 记新的，过期日不变（剩下的天数）", async () => {
    const s = setup(); await wire(await s.verifier);
    await setCurrentPassword("real pw");
    const until0 = await rememberCurrent("real pw");
    s.clock.t += 10 * DAY;
    await setCurrentPassword("changed pw");
    assert(await until(async () => (await s.keeper.recall()) === "changed pw"), "记着的换成新密码");
    eq(rememberedUntil(), until0, "过期日不往后挪");
    eq(s.errors.length, 0);
  }, { timeout: 30_000 });
  it("没记的时候改密码 / 解锁 → 不会自己记", async () => {
    const s = setup(); await wire(await s.verifier);
    await setCurrentPassword("x1"); await setCurrentPassword("x2");
    await new Promise((r) => setTimeout(r, 50));
    eq(s.store.peek(), undefined); eq(rememberedUntil(), null);
  }, { timeout: 30_000 });
});

describe("remember-password · 面板", () => {
  it("解锁 / 首次设密码的面板给勾；每篇自己的密码不给", async () => {
    setup();
    const seen = [];
    const v = await wire(null, async (o) => { seen.push(o.offerRemember === true); return "pw-1"; });
    assert(await ensureUnlocked({ unlockTitle: "u", unlockHint: "", setupTitle: "s", setupHint: "", wrong: "W", mismatch: "M", okUnlock: "o", okSetup: "o" }));
    assert(v.get() != null);
    lock();
    assert(await ensureUnlocked({ unlockTitle: "u", unlockHint: "", setupTitle: "s", setupHint: "", wrong: "W", mismatch: "M", okUnlock: "o", okSetup: "o" }));
    await ensureFileUnlocked("a.txt", { title: "f", hint: "", wrong: "W", ok: "o" }, async () => true);
    eq(JSON.stringify(seen), JSON.stringify([true, true, false]));
  }, { timeout: 30_000 });
});
