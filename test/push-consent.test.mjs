// 回来（登录后 / 回线 / 解锁）时没传的稿（家族规则书 §1 第 15 条，11-03 夜改写；工单 D4，2026-11-04）：结构守卫。
//   历史：10-21（v2.3.52）「问一次 → pushAll」→ 10-26（v3.0.11）只问「去处理」、app 零 pushAll → 11-04（D4）按三种分：
//   传过的（写作 app 心跳保存 = 同意传）直接续传；从没传过的（float）问一次、点了才传；pushAll 全 app 只有一处，且只在「没有从没传过的」或「人点了现在传」之后。
//   分法本身是纯函数 src/cloud-return.ts（test/cloud-return.test.mjs）；真 app 整条链 = test/e2e-sync/run.mjs「回来」那几组。
//   created 2026-10-21 by Claude Fable 5.1 · rewritten 2026-10-26 by Claude Fable 5.1 · rewritten 2026-11-04 by Claude Opus 5.5
import { readFileSync } from "node:fs";
import { describe, it, assert, eq } from "./runner.mjs";
import { S } from "../src/i18n/strings.ts";
const app = readFileSync("src/app.ts", "utf8");
const all = ["src/app.ts", "src/docs.ts", "src/gallery-host.ts", "src/store-ui.ts", "src/cloud-gate.ts", "src/cloud-gate-ui.ts", "src/app-store.ts", "src/project/mode.ts", "src/editor.ts"].map((p) => [p, readFileSync(p, "utf8")]);

describe("push-consent · 回来时没传的稿：传过的续传、从没传过的问一次", () => {
  it("dirty.pushAll() 全 app 只有一处，在 settleReturn 里", () => {
    const hits = all.flatMap(([p, s]) => (s.match(/dirty\.pushAll\(\)/g) ?? []).map(() => p));
    eq(hits.join(), "src/app.ts", "只在 app.ts");
    eq((app.match(/dirty\.pushAll\(\)/g) ?? []).length, 1, "app.ts 里只有一处");
    const body = /async function settleReturn\(\)[\s\S]*?\n\}/.exec(app)?.[0] ?? "";
    assert(/dirty\.pushAll\(\)/.test(body), "那一处在 settleReturn 里");
  });
  it("推之前先分：从没传过的（float）在场 = 先问，人点了才推；问过一次的这一页不再推", () => {
    const body = /async function settleReturn\(\)[\s\S]*?\n\}/.exec(app)?.[0] ?? "";
    const iPlan = body.indexOf("planReturn("), iAsk = body.indexOf('plan.kind === "ask"'), iPush = body.indexOf("dirty.pushAll()");
    assert(iPlan > 0 && iAsk > iPlan && iPush > iAsk, "先 planReturn、再按 ask 问、最后才推");
    assert(/if \(plan\.kind === "none" \|\| plan\.kind === "hold"\) return;/.test(body), "hold（问过了还有从没传过的）= 不推");
    assert(/if \(!go\) \{[^\n]*return; \}/.test(body), "稍后 = 不推");
    assert(/neverUploadedDocs\(\)/.test(body) && /dirtyDocCount\(\)/.test(body), "两个数都从库现有的事实来（列举的 float + dirty.count），不加接口");
  });
  it("跟上网盘的路不等人答（闸门的「正在同步」条、词库偏好对齐都在这条路上；2026-11-03 D3 核 F-182）", () => {
    const body = /async function resumeSync\(\)[\s\S]*?\n\}/.exec(app)?.[0] ?? "";
    assert(/void offerPushLocalOnly\(\)/.test(body) && !/await offerPushLocalOnly\(\)/.test(body), "resumeSync 不 await 问句");
    assert(body.indexOf("reconcileCollections") < body.indexOf("void offerPushLocalOnly"), "该对齐的先对齐，再问");
    assert(body.indexOf("pushNowAny") < body.indexOf("void offerPushLocalOnly") && body.indexOf("drainOfflineQueue") < body.indexOf("void offerPushLocalOnly"), "开着的那篇、离线补推队列先走完再数");
  });
  it("三处入口（登录后 / 回线 / 解锁）都走 offerPushLocalOnly；没传成的「去处理」= 书库「要处理的」", () => {
    assert(/then\(\(\) => offerPushLocalOnly\(\)\)/.test(app) && /void offerPushLocalOnly\(\);/.test(app) && /if \(unlocked\) void offerPushLocalOnly\(\)/.test(app), "三处入口");
    assert(/await galleryHost\.openAttention\(\);/.test(app), "去处理 = galleryHost.openAttention()");
    assert(!/pushDirtyAll/.test(app), "pushDirtyAll 不复活");
  });
  it("文案 zh/en 都在；问句就是规则书那一句；方向动词不出现", () => {
    for (const k of ["pushAll.askOnly", "pushAll.askAlso", "pushAll.askNote", "pushAll.now", "pushAll.later", "pushAll.inList", "pushAll.allDone", "pushAll.retryLater", "pushAll.partialTitle", "pushAll.partialMsg", "pushAll.partialNames", "pushAll.ok"]) assert(S[k]?.zh && S[k]?.en, k);
    eq(S["pushAll.askOnly"].zh, "有 {n} 份只在这台设备，现在传上去？");
    eq(S["pushAll.ok"].zh, "去处理");
    for (const k of Object.keys(S).filter((x) => x.startsWith("pushAll."))) assert(!/覆盖|用这台的|推一把/.test(S[k].zh), `${k} 不许出现方向动词：${S[k].zh}`);
  });
});
