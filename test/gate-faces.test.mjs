// 锁屏位上的面：谁露着、谁排队（src/gate-faces.ts）。created 2026-11-12 by Claude Opus 5.5（统筹 Claude Fable 5.2 重审裁定四）
//   性质测试：随机穿插问人的面 / 转圈的面 / 人点钮 / 主人收回 / 迟到的点击，断言——
//   ① 每一个问人的面恰好兑现一次，值 = 它露着时人点的那个（被主人收回 = null）；② 人答到的顺序 = 叫的先后（先来先答）；
//   ③ 问人的面露着时，只会因为被答 / 被主人收回而离开，从不被别的面顶掉；④ 转圈的面在有问人的面时从不露出来，最后全有结果（不悬着）；
//   ⑤ 收起锁屏位时确实一张都不剩。
import { describe, it, assert, eq } from "./runner.mjs";
import { createGateFaces } from "../src/gate-faces.ts";

function mulberry32(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const flush = () => new Promise((r) => setTimeout(r, 0));

function harness() {
  const log = [];          // 画 / 收的记录
  let shown = null;        // 渲染层现在画着的那张
  const g = createGateFaces({
    show: (f) => { log.push(["show", f.id, f.kind]); shown = f; },
    hide: () => { log.push(["hide"]); shown = null; },
  });
  return { g, log, shown: () => shown };
}

describe("锁屏位的面 · 例子", () => {
  it("问人的面排队、先来先答；后来的不顶掉先来的", async () => {
    const { g, shown } = harness();
    const a = g.request("ask", "A"), b = g.request("ask", "B");
    eq(shown().id, a.id, "A 露着"); eq(g.queued(), 1, "B 排队");
    g.answer(a.id, "a1");
    eq(await a.result, "a1"); eq(shown().id, b.id, "A 答完 B 才露");
    g.answer(b.id, "b1");
    eq(await b.result, "b1"); eq(shown(), null, "都答完 = 收起");
  });
  it("转圈的面：有问人的面时不出来（结果 null）；问人的面来了，露着的转圈面让位（结果 null）", async () => {
    const { g, shown } = harness();
    const s1 = g.request("spin", "S1");
    eq(shown().id, s1.id, "没人问时转圈的露着");
    const a = g.request("ask", "A");
    eq(await s1.result, null, "被问人的面顶掉 = null，不悬着"); eq(shown().id, a.id);
    const s2 = g.request("spin", "S2");
    eq(await s2.result, null, "有问人的面 = 不出来"); eq(shown().id, a.id, "问人的面还在");
  });
  it("主人收回：露着的收掉换下一张；排着的直接拿掉；别人的号收不动", async () => {
    const { g, shown } = harness();
    const a = g.request("ask", "A"), b = g.request("ask", "B"), c = g.request("ask", "C");
    eq(g.withdraw(b.id), true); eq(await b.result, null, "排着的被收回 = null");
    eq(g.withdraw(999), false, "不存在的号 = 什么都不做");
    eq(g.withdraw(a.id), true); eq(await a.result, null); eq(shown().id, c.id, "B 已收回，A 之后直接是 C");
    eq(g.withdraw(a.id), false, "收过的再收 = 什么都不做");
  });
  it("迟到的点击（那张已经不露着）不串到下一张", async () => {
    const { g, shown } = harness();
    const a = g.request("ask", "A"), b = g.request("ask", "B");
    g.answer(a.id, "x"); g.answer(a.id, "late");
    eq(await a.result, "x"); eq(shown().id, b.id, "B 还在等人答");
    let bDone = false; b.result.then(() => { bDone = true; }); await flush();
    assert(!bDone, "迟到的那一下没有替 B 回答");
  });
});

describe("锁屏位的面 · 性质测试（300 轮 × 80 步，固定种子）", () => {
  it("问人的面恰好兑现一次、值对、先来先答；从不被顶掉；转圈的不悬着", async () => {
    for (let run = 0; run < 300; run++) {
      const rnd = mulberry32(0xC0FFEE + run);
      const { g, log, shown } = harness();
      const asks = [];   // { id, result, settled, value, withdrawn, answeredAt }
      const spins = [];
      const answeredOrder = [];
      let step = 0;
      const askNow = () => { const r = g.request("ask", `a${asks.length}`); const e = { id: r.id, settled: 0, value: undefined, withdrawn: false }; r.result.then((v) => { e.settled++; e.value = v; }); asks.push(e); };
      const spinNow = () => { const r = g.request("spin", `s${spins.length}`); const e = { id: r.id, settled: 0, value: undefined }; r.result.then((v) => { e.settled++; e.value = v; }); spins.push(e); };
      let prevShown = null;
      const checkStep = () => {
        const cur = g.current();
        // ③ 问人的面露着时，只会因为被答 / 被收回而离开
        if (prevShown && prevShown.kind === "ask" && (!cur || cur.id !== prevShown.id)) {
          const e = asks.find((x) => x.id === prevShown.id);
          assert(e && (e.answered || e.withdrawn), `run ${run} step ${step}: 问人的面 ${prevShown.id} 被顶掉了`);
        }
        // ④ 有问人的面在场时，露着的不是转圈的
        if (g.queued() > 0) assert(cur && cur.kind === "ask", `run ${run} step ${step}: 有人排队时露着的必须是问人的面`);
        assert((shown()?.id ?? null) === (cur?.id ?? null), `run ${run} step ${step}: 渲染层和逻辑层对不上`);
        prevShown = cur;
      };
      for (step = 0; step < 80; step++) {
        const x = rnd();
        if (x < 0.30) askNow();
        else if (x < 0.50) spinNow();
        else if (x < 0.75) { const cur = g.current(); if (cur) { const v = `v${run}-${step}`; if (cur.kind === "ask") { const e = asks.find((q) => q.id === cur.id); e.answered = true; e.expect = v; answeredOrder.push(cur.id); } g.answer(cur.id, v); } }
        else if (x < 0.87) { const open = asks.filter((e) => !e.answered && !e.withdrawn); if (open.length) { const e = open[Math.floor(rnd() * open.length)]; e.withdrawn = true; g.withdraw(e.id); } }
        else { const ended = asks.filter((e) => e.answered || e.withdrawn); const old = ended[Math.floor(rnd() * ended.length)]; if (old) g.answer(old.id, "LATE"); }   // 迟到的点击：点在已经结束的面上
        checkStep();
      }
      // 收尾：人把剩下的一张张答完
      for (let guard = 0; g.current() && guard < 500; guard++) {
        const cur = g.current(); const v = `end-${cur.id}`;
        if (cur.kind === "ask") { const e = asks.find((q) => q.id === cur.id); e.answered = true; e.expect = v; answeredOrder.push(cur.id); }
        g.answer(cur.id, v); checkStep();
      }
      await flush();
      for (const e of asks) {
        eq(e.settled, 1, `run ${run}: 问人的面 ${e.id} 恰好兑现一次`);
        if (e.withdrawn && !e.answered) eq(e.value, null, `run ${run}: 收回的 ${e.id} = null`);
        else eq(e.value, e.expect, `run ${run}: ${e.id} 的值 = 它露着时人点的那个`);
      }
      const sorted = [...answeredOrder].sort((p, q) => p - q);
      eq(JSON.stringify(answeredOrder), JSON.stringify(sorted), `run ${run}: 人答到的顺序 = 叫的先后`);
      for (const e of spins) eq(e.settled, 1, `run ${run}: 转圈的面 ${e.id} 有结果（不悬着）`);
      eq(g.current(), null, `run ${run}: 都结束了`);
      eq(log.at(-1)?.[0] ?? "hide", "hide", `run ${run}: 最后一下是收起`);
    }
  });
});
