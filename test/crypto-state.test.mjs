// crypto-state：verifier 记录（错密码 = GCM 不过 = false，不碰任何文件）+ 解锁循环（prompt 注入、verifier 注入）。created 2026-09-03 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
import { createVerifierRecord, verifyRecord, wireCryptoState, ensureUnlocked, isUnlocked, lock, getPassword, hasVerifier, rememberFilePassword, forgetFilePassword, renameFilePassword, fileUsesOtherPassword, setCurrentPassword, currentPassword, resetVerifier } from "../src/crypto-state.ts";

const LABELS = { unlockTitle: "u", unlockHint: "", setupTitle: "s", setupHint: "", wrong: "WRONG", mismatch: "MM", okUnlock: "ok", okSetup: "ok" };

describe("crypto-state · verifier", () => {
  it("对的密码 true，错的 false，篡改记录 false", async () => {
    const rec = await createVerifierRecord("correct horse");
    assert(await verifyRecord(rec, "correct horse"));
    assert(!(await verifyRecord(rec, "wrong")));
    assert(!(await verifyRecord({ ...rec, ct: rec.ct.slice(0, -4) + "AAAA" }, "correct horse")));
  }, { timeout: 30_000 });
});

describe("crypto-state · 解锁循环", () => {
  it("无 verifier → 首次设密码（无最少位数检查：短密码一次通过，user 2026-09-03）→ 之后 getPassword 有值；lock 清空", async () => {
    let store = null;
    let prompts = 0;
    wireCryptoState({ prompt: async (o) => { prompts++; assert(!o.error, "no rejection expected"); return "ab"; }, verifiers: { get: () => store, set: (r) => { store = r; } } });
    lock();
    assert(!hasVerifier());
    assert(await ensureUnlocked(LABELS));
    eq(prompts, 1, "short password accepted on first prompt");
    assert(isUnlocked()); eq(getPassword("x"), "ab"); assert(hasVerifier());
    lock(); assert(!isUnlocked()); eq(getPassword("x"), null);
  }, { timeout: 30_000 });
  it("有 verifier → 错密码重问、取消返回 false、对的返回 true", async () => {
    let store = await createVerifierRecord("real pw");
    const seq = ["nope", null];
    wireCryptoState({ prompt: async () => seq.shift(), verifiers: { get: () => store, set: (r) => { store = r; } } });
    lock();
    eq(await ensureUnlocked(LABELS), false);
    wireCryptoState({ prompt: async () => "real pw", verifiers: { get: () => store, set: (r) => { store = r; } } });
    eq(await ensureUnlocked(LABELS), true);
    lock();
  }, { timeout: 30_000 });
});

describe("crypto-state · 每篇密码表", () => {
  it("getPassword(name)：这篇自己的优先；等于当前的不记；rename 跟随；lock 清表", async () => {
    let store = await createVerifierRecord("cur");
    wireCryptoState({ prompt: async () => "cur", verifiers: { get: () => store, set: (r) => { store = r; } } });
    lock(); assert(await ensureUnlocked(LABELS)); eq(currentPassword(), "cur");
    eq(getPassword("a.txt"), "cur");
    rememberFilePassword("a.txt", "old"); eq(getPassword("a.txt"), "old"); eq(getPassword("b.txt"), "cur"); assert(fileUsesOtherPassword("a.txt"));
    rememberFilePassword("b.txt", "cur"); assert(!fileUsesOtherPassword("b.txt"));
    renameFilePassword("a.txt", "a2.txt"); eq(getPassword("a2.txt"), "old"); eq(getPassword("a.txt"), "cur");
    forgetFilePassword("a2.txt"); eq(getPassword("a2.txt"), "cur");
    rememberFilePassword("c.txt", "old"); lock(); assert(!fileUsesOtherPassword("c.txt")); eq(getPassword("c.txt"), null);
  }, { timeout: 30_000 });
  it("setCurrentPassword：新 verifier + 表里等于新密码的条目消掉；resetVerifier：清 verifier 并锁定", async () => {
    let store = await createVerifierRecord("cur");
    wireCryptoState({ prompt: async () => "cur", verifiers: { get: () => store, set: (r) => { store = r; } } });
    lock(); assert(await ensureUnlocked(LABELS));
    rememberFilePassword("x.txt", "next"); rememberFilePassword("y.txt", "other");
    await setCurrentPassword("next");
    eq(currentPassword(), "next"); assert(!fileUsesOtherPassword("x.txt")); assert(fileUsesOtherPassword("y.txt"));
    assert(await verifyRecord(store, "next")); assert(!(await verifyRecord(store, "cur")));
    resetVerifier(); assert(!hasVerifier()); assert(!isUnlocked());
  }, { timeout: 30_000 });
});
