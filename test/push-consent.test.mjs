// 登录 / 回线后对没同步好的稿**提一次「去处理」**（v3.0.11，2026-10-26；家族周账 F-88 / F-98，user 10-26「列表面」）：10-21 的「问一次 → pushAll」是 / 否框撤了。
// 结构守卫：app 里**没有任何地方**调 files.dirty.pushAll()（批量推 = 替人选方向；每一份都在库的面里选）；offerPushLocalOnly 把人带进书库的「要处理的」视图（galleryHost.openAttention）；
//   登录后 / 回线 / 解锁三处入口仍走 offerPushLocalOnly。created 2026-10-21 by Claude Fable 5.1 · rewritten 2026-10-26 by Claude Fable 5.1
import { readFileSync } from "node:fs";
import { describe, it, assert, eq } from "./runner.mjs";
import { S } from "../src/i18n/strings.ts";
const app = readFileSync("src/app.ts", "utf8");

describe("push-consent · 没同步好的稿：提一次「去处理」，不批量推", () => {
  it("files.dirty.pushAll() 全 app 零调用（批量推已撤；每一份在库的面里选）", () => { eq((app.match(/files\.dirty\.pushAll\(\)/g) ?? []).length, 0); });
  it("offerPushLocalOnly 把人带进书库的「要处理的」视图，三处入口（登录后 / 回线 / 解锁）都走它", () => {
    assert(/async function offerPushLocalOnly\(/.test(app), "offerPushLocalOnly 在");
    assert(/await galleryHost\.openAttention\(\);/.test(app), "去处理 = galleryHost.openAttention()");
    assert(!/pushDirtyAll/.test(app), "pushDirtyAll 已删");
    assert(/then\(\(\) => offerPushLocalOnly\(\)\)/.test(app) && /await offerPushLocalOnly\(\);/.test(app) && /if \(unlocked\) void offerPushLocalOnly/.test(app), "三处入口都走闸门");
  });
  it("文案四条 zh/en 都在，且 ok 不再是方向动词", () => { for (const k of ["pushAll.askTitle", "pushAll.askMsg", "pushAll.ok", "pushAll.later"]) assert(S[k]?.zh && S[k]?.en, k); eq(S["pushAll.ok"].zh, "去处理"); });
});
