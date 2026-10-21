// 登录 / 回线后对「只在本机」的稿问一次再 pushAll（v2.3.52，2026-10-21；user 答统筹稿问题 3 = 全家「登录 / 回线后问一次」；JRB 0.2.20 同款）。
// 结构守卫：files.dirty.pushAll() 只在 pushDirtyAll 里；pushDirtyAll 只经 offerPushLocalOnly 调（登录后 / 回线 / 解锁三处都走闸门）。created 2026-10-21 by Claude Fable 5.1
import { readFileSync } from "node:fs";
import { describe, it, assert, eq } from "./runner.mjs";
import { S } from "../src/i18n/strings.ts";
const app = readFileSync("src/app.ts", "utf8");
describe("push-consent · 只在本机的稿：问一次再补传", () => {
  it("files.dirty.pushAll() 全 app 只有 pushDirtyAll 一处调", () => { eq((app.match(/files\.dirty\.pushAll\(\)/g) ?? []).length, 1); });
  it("pushDirtyAll 只从 offerPushLocalOnly 里调（登录后 / 回线 / 解锁三处都改走闸门）", () => {
    const calls = app.match(/\bpushDirtyAll\((?:opts|\{ verbose: true \}|)\)/g) ?? [];
    eq(calls.length, 2, `pushDirtyAll 调用处：${calls.join(" | ")}`);   // offerPushLocalOnly 里两处（consented 直推 / 点了传上去）
    assert(!/drainOfflineQueue\(\)[^\n]*then\(\(\) => pushDirtyAll\(\)\)/.test(app), "登录后不再静默 pushAll");
    assert(/then\(\(\) => offerPushLocalOnly\(\)\)/.test(app) && /await offerPushLocalOnly\(\);/.test(app) && /if \(unlocked\) void offerPushLocalOnly/.test(app), "三处入口都走闸门");
  });
  it("文案四条 zh/en 都在", () => { for (const k of ["pushAll.askTitle", "pushAll.askMsg", "pushAll.ok", "pushAll.later"]) assert(S[k]?.zh && S[k]?.en, k); });
});
