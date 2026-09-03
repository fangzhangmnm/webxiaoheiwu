// crypto-state：verifier 记录（错密码 = GCM 不过 = false，不碰任何文件）+ 解锁循环（prompt 注入、verifier 注入）。created 2026-09-03 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
import { createVerifierRecord, verifyRecord, wireCryptoState, ensureUnlocked, isUnlocked, lock, getPassword, hasVerifier } from "../src/crypto-state.ts";

const LABELS = { unlockTitle: "u", unlockHint: "", setupTitle: "s", setupHint: "", wrong: "WRONG", mismatch: "MM", tooShort: "SHORT", okUnlock: "ok", okSetup: "ok" };

describe("crypto-state · verifier", () => {
  it("对的密码 true，错的 false，篡改记录 false", async () => {
    const rec = await createVerifierRecord("correct horse");
    assert(await verifyRecord(rec, "correct horse"));
    assert(!(await verifyRecord(rec, "wrong")));
    assert(!(await verifyRecord({ ...rec, ct: rec.ct.slice(0, -4) + "AAAA" }, "correct horse")));
  }, { timeout: 30_000 });
});

describe("crypto-state · 解锁循环", () => {
  it("无 verifier → 首次设密码（短密码被拒、再来一次成功）→ 之后 getPassword 有值；lock 清空", async () => {
    let store = null;
    const answers = ["short", "long enough pw"];
    wireCryptoState({ prompt: async (o) => { if (o.error === "SHORT") return answers[1]; return answers[0]; }, verifiers: { get: () => store, set: (r) => { store = r; } } });
    lock();
    assert(!hasVerifier());
    assert(await ensureUnlocked(LABELS));
    assert(isUnlocked()); eq(getPassword("x"), "long enough pw"); assert(hasVerifier());
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
