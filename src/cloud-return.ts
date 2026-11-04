// cloud-return.ts —— 回来（登录好 / 网回来 / 解锁）时没传的稿怎么办。created 2026-11-04 by Claude Opus 5.5（家族工单 D4）
//   规矩 = 家族规则书 ai-docs/20261103-three-shapes-rulebook.md §1 第 15 条（11-03 夜改写）：没传的分三种，库现有的事实就分得开，不加 API——
//   (a) 从没传过（列举里 syncState = float；local-only 是干净的、pushAll 不推它，不算）→ 问一次「有 N 份只在这台设备，现在传上去？」，点了才传；一页只问一次。
//   (b) 传过、存了但当时没传成 → 自动续传不问。小黑屋是写作 app：心跳保存就是同意传（规则书同条「写作 / 建模 app 的心跳保存全算这种」），所以传过的脏稿全是 (b)。
//   (c) 只是自动保存、人没按过存 → 不传不问。小黑屋没有这一种（理由同上）；没传成的留在书库「要处理的」里看得见。
//   库的 pushAll 不分种类（不加筛选，user 11-03）：有 (a) 时它会把 (b) 一起推 → 面上两样都说真话，人点了才一起传；没点 = 都不推（(b) 跟着等，进列表）。
//   纯函数：node 直测（test/cloud-return.test.mjs）；接线在 app.ts offerPushLocalOnly。

export type ReturnPlan =
  | { kind: "none" }
  /** 只有 (b)：直接续传，不问。 */
  | { kind: "resume"; total: number }
  /** 有 (a)：问一次。others = 一起会被推的 (b)。 */
  | { kind: "ask"; neverUploaded: number; others: number }
  /** 有 (a)、这一页已经问过：不再问，也不推（推了就是不问就把 (a) 传上去）。 */
  | { kind: "hold"; neverUploaded: number; others: number };

/** dirty = 库 dirty.count()；neverUploaded = 列举里 float 的份数；asked = 这一页问过那一句没有。 */
export function planReturn(dirty: number, neverUploaded: number, asked: boolean): ReturnPlan {
  if (dirty <= 0) return { kind: "none" };
  const a = Math.min(Math.max(0, neverUploaded), dirty);
  if (a <= 0) return { kind: "resume", total: dirty };
  const others = dirty - a;
  return asked ? { kind: "hold", neverUploaded: a, others } : { kind: "ask", neverUploaded: a, others };
}

/** 列举里「从没传过、有字节要传」的身份。 */
export function neverUploadedIds(items: readonly { identifier: string; syncState?: string | null }[]): string[] {
  return items.filter((it) => it.syncState === "float").map((it) => it.identifier);
}

export interface PushFailureLike { name: string; reason: string }
export type AfterPush =
  | { kind: "done"; pushed: number }
  /** 只有网络这类「之后会再试」的：说一句，不弹。 */
  | { kind: "retryLater"; pushed: number; left: number }
  /** 有要人选的（别的设备改过 / 云端有同名 / 别的异常）：带名单、带「去处理」。 */
  | { kind: "attention"; pushed: number; left: number; names: string[] };

/** pushAll 之后：left = 再数一次的 dirty.count()（绿灯以它为准，不以返回值为准——库的注释）。 */
export function afterPushAll(r: { pushed: number; failures?: readonly PushFailureLike[] } | null, left: number): AfterPush {
  const pushed = r?.pushed ?? 0;
  if (left <= 0) return { kind: "done", pushed };
  if (!r) return { kind: "attention", pushed, left, names: [] };   // pushAll 自己抛了（已进黑匣子）：不知道是什么，交给人看列表
  const needsPerson = (r.failures ?? []).filter((f) => f.reason !== "network");
  if (needsPerson.length === 0) return { kind: "retryLater", pushed, left };   // 网络的 / 推的时候又改了（开着的那篇归心跳）：之后会再推
  return { kind: "attention", pushed, left, names: needsPerson.map((f) => f.name) };
}
