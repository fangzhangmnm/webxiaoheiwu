// gate-faces.ts —— 锁屏位（#gateSheet）上「谁现在露着、谁在排队」的纯逻辑。不碰 DOM：画 / 收由 sheets.ts 注入。
// created 2026-11-12 by Claude Opus 5.5（小黑屋维修线，统筹 Claude Fable 5.2 重审裁定四；性质测试 test/gate-faces.test.mjs）
//   毛病（统筹用真的同步库跑过）：锁屏位只有一个，后叫的面直接盖掉先叫的、先叫的那个 promise 永远没人兑现——
//   冲突面没人回答 = 库那条推送一直等着、占着那一篇的写队，之后每一次保存（连只存本机的）都卡住，磁盘停在弹面前那一版。
//   规矩：
//   · 问人的面（冲突面、改名问旧文件、闸门拦下）一个都不许丢：前一个没回答，后一个排队，先来先答。
//   · 转圈的面（检查云端 / 核对网盘）在有问人的面时不出来（结果 = null）；问人的面来了，露着的转圈面让位，它的结果 = null，不许悬着。
//   · 只有两种方式结束一张面：人点了它上面的钮（answer），或者它的主人自己收回（withdraw，结果 = null）。别人不许关它。
//   · 每张面的结果恰好兑现一次。

export type FaceKind = "ask" | "spin";
export interface Face<O> { readonly id: number; readonly kind: FaceKind; readonly opts: O }
export interface FaceRenderer<O> {
  /** 把这张面画上锁屏位（锁屏位上原来那张直接被换掉；调用方保证那张已经结束）。 */
  show(face: Face<O>): void;
  /** 锁屏位上没有面了：收起来。 */
  hide(): void;
}
export interface GateFaces<O> {
  /** 叫一张面。返回它的号和结果（人点的值；被让位 / 收回 / 不出来 = null）。 */
  request(kind: FaceKind, opts: O): { id: number; result: Promise<unknown> };
  /** 人点了当前露着的那张上的钮。 */
  answer(id: number, value: unknown): void;
  /** 主人收回自己那张（露着或排着都行）；已经结束的 = 什么都不做。返回这一下有没有收掉东西。 */
  withdraw(id: number): boolean;
  /** 现在露着的那张。 */
  current(): Face<O> | null;
  /** 排着队的问人的面有几张。 */
  queued(): number;
}

interface Entry<O> extends Face<O> { settle(v: unknown): void; done: boolean }

export function createGateFaces<O>(r: FaceRenderer<O>): GateFaces<O> {
  let seq = 0;
  let cur: Entry<O> | null = null;
  const queue: Entry<O>[] = [];

  const finish = (e: Entry<O>, value: unknown): void => {
    if (e.done) return;
    e.done = true;
    e.settle(value);
  };
  /** 当前那张结束之后：排着的下一张露出来，没有就收起。 */
  const advance = (): void => {
    const next = queue.shift() ?? null;
    cur = next;
    if (next) r.show(next); else r.hide();
  };

  return {
    request(kind, opts) {
      let settle!: (v: unknown) => void;
      const result = new Promise<unknown>((res) => { settle = res; });
      const e: Entry<O> = { id: ++seq, kind, opts, settle, done: false };
      if (kind === "spin") {
        if ((cur && cur.kind === "ask") || queue.length) { finish(e, null); return { id: e.id, result }; }   // 有问人的面：转圈的不出来
        if (cur) finish(cur, null);   // 露着的是另一张转圈面：它让位（结果 null），换成新的
        cur = e; r.show(e);
        return { id: e.id, result };
      }
      if (!cur) { cur = e; r.show(e); }
      else if (cur.kind === "spin") { finish(cur, null); cur = e; r.show(e); }   // 转圈的让位给问人的
      else queue.push(e);                                                         // 前一个问人的还没答：排队
      return { id: e.id, result };
    },
    answer(id, value) {
      if (!cur || cur.id !== id || cur.done) return;   // 只认露着的那张（迟到的点击不串到下一张）
      finish(cur, value);
      advance();
    },
    withdraw(id) {
      if (cur && cur.id === id && !cur.done) { finish(cur, null); advance(); return true; }
      const i = queue.findIndex((x) => x.id === id);
      if (i < 0) return false;
      const [e] = queue.splice(i, 1);
      finish(e!, null);
      return true;
    },
    current: () => cur,
    queued: () => queue.length,
  };
}
