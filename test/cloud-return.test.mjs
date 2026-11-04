// 回来时没传的稿分三种（家族规则书 §1 第 15 条；工单 D4）：纯函数。created 2026-11-04 by Claude Opus 5.5
import { describe, it, eq } from "./runner.mjs";
import { planReturn, neverUploadedIds, afterPushAll } from "../src/cloud-return.ts";

describe("cloud-return · 回来时怎么办（规则书 §1 第 15 条）", () => {
  it("没有脏的 = 什么都不做", () => { eq(planReturn(0, 0, false).kind, "none"); eq(planReturn(0, 3, false).kind, "none", "float 数不会多过 dirty"); });
  it("只有传过的（b）= 直接续传，不问；问没问过都一样", () => {
    eq(JSON.stringify(planReturn(3, 0, false)), JSON.stringify({ kind: "resume", total: 3 }));
    eq(planReturn(3, 0, true).kind, "resume");
  });
  it("有从没传过的（a）= 问一次；面上把会一起推的（b）也算出来", () => {
    eq(JSON.stringify(planReturn(5, 2, false)), JSON.stringify({ kind: "ask", neverUploaded: 2, others: 3 }));
    eq(JSON.stringify(planReturn(2, 2, false)), JSON.stringify({ kind: "ask", neverUploaded: 2, others: 0 }));
  });
  it("这一页问过了 = 不再问、也不推（推了就是不问就把（a）传上去）", () => {
    eq(JSON.stringify(planReturn(5, 2, true)), JSON.stringify({ kind: "hold", neverUploaded: 2, others: 3 }));
  });
  it("列举和计数不同步（float 比 dirty 多）：按 dirty 封顶，不说多", () => { eq(JSON.stringify(planReturn(1, 4, false)), JSON.stringify({ kind: "ask", neverUploaded: 1, others: 0 })); });
  it("只认 float：local-only（从没同步、干净）/ unpushed / conflict 都不算从没传过", () => {
    const items = [
      { identifier: "a.txt", syncState: "float" }, { identifier: "b.txt", syncState: "local-only" },
      { identifier: "c.txt", syncState: "unpushed" }, { identifier: "d.txt", syncState: "conflict" }, { identifier: "e.txt", syncState: "float" },
      { identifier: "f.txt" },
    ];
    eq(neverUploadedIds(items).join(), "a.txt,e.txt");
  });
  it("推完：清零 = done；只剩网络的 = 之后再试不弹；有要人选的 = 带名单去处理", () => {
    eq(afterPushAll({ pushed: 3, failures: [] }, 0).kind, "done");
    eq(JSON.stringify(afterPushAll({ pushed: 1, failures: [{ name: "x.txt", reason: "network" }] }, 1)), JSON.stringify({ kind: "retryLater", pushed: 1, left: 1 }));
    eq(JSON.stringify(afterPushAll({ pushed: 1, failures: [{ name: "x.txt", reason: "network" }, { name: "y.txt", reason: "conflict" }, { name: "z.txt", reason: "collision" }] }, 3)),
      JSON.stringify({ kind: "attention", pushed: 1, left: 3, names: ["y.txt", "z.txt"] }));
    eq(afterPushAll({ pushed: 2, failures: [] }, 1).kind, "retryLater", "推的时候又改了（开着的那篇归心跳）");
    eq(afterPushAll(null, 2).kind, "attention", "pushAll 自己抛了 = 交给人看列表");
  });
});
