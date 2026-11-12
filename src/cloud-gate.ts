// cloud-gate.ts —— 网盘掉登录 / 没网的闸门 + 逃生口。created 2026-11-03 by Claude Opus 5.5（家族工单 D；设计稿 = 家族根 ai-docs/20261103-cloud-gate-design.md，周账 F-100）
//   user 原话：「先用本地的启动，然后模糊屏幕，等 etag check…如果有 conflict 就弹窗，如果网卡可以切离线模式」（10-15）；「同意。然后就是卡网络的时候要有逃生口」（11-03）。
//   开机 / 醒来：本机那份摆着、罩住 → 静默续签 + 问一次云端 → 放行 / 库的冲突面 / 「网盘没连上」两个钮；选了「离线继续」= 放行 + 常驻条，网回来自动补。
//
//   边界：
//   · 这个文件不碰界面、不碰存储、不碰库：纯状态机，依赖全注入（单元测试 test/cloud-gate.test.mjs 直接跑）；界面在 cloud-gate-ui.ts，接线在 app.ts / store-ui.ts / app-store.ts。
//   · 「离线继续」只活在内存（下面 _userOffline；设计稿 §3「记忆只到网回来为止」，守卫 §8④ grep 这个文件没有存储 import）。刷新 = 重新走一遍。
//   · 有家 = 这台设备的 MSAL 里有账号（d.hasHome）。从没登录 / 主动登出的人永不闸（§2）。
//   · 每条等云端的路都和「硬超时 + 逃生钮」赛跑（§4 / 数据安全模型 A19）；守卫 §8① 看 run() 里的 race。
import { CLOUD_CHECK_TIMEOUT_MS, OFFLINE_RETRY_MS } from "./config.ts";

export type GateReason = "expired" | "offline" | "noResponse" | "content";
export type GatePhase = "open" | "checking" | "blocked";
/** 常驻条三态：不显示 / 离线（带份数）/ 已连上正在补传。 */
export type BarState = "hidden" | "offline" | "syncing";

// ── 全 app 共用的「现在该不该碰网盘」（app-store 的 isOnline、编辑器 / 书 / 图库 / 云钮都读这一处）──
let _userOffline = false;
const _offlineSubs = new Set<() => void>();
export function isUserOffline(): boolean { return _userOffline; }
export function rawOnline(): boolean { return typeof navigator === "undefined" || navigator.onLine !== false; }
/** 浏览器说有网 ∧ 人没选离线。原来散在各处的 `navigator.onLine` 云端判断都换成它（选了离线 = 一条网都不打）。 */
export function cloudOnline(): boolean { return rawOnline() && !_userOffline; }
function setUserOffline(on: boolean): void {
  if (_userOffline === on) return;
  _userOffline = on;
  for (const f of _offlineSubs) f();
}
export function onUserOfflineChange(f: () => void): () => void { _offlineSubs.add(f); return () => { _offlineSubs.delete(f); }; }

// ── 续签失败的原因码（§1 / §5：正文按真实原因，不许写死一句）──
//   库把每次静默续签失败写成一行日志（@internal/store base/providers/auth.js _logSilentFailure，level "log"），这是它唯一给的信号；store-ui.reportError 把这行递到 noteAuthFailure。
//   行格式被 test/cloud-gate.test.mjs 对着库的 dist 钉住：库改了格式 = 红。
const AUTH_LINE = /^\[auth\] silent token renewal failed \(([^)]*)\): name=(\S*) code=(\S*) sub=(\S*)/;
const NEEDS_INTERACTION = /^(interaction_required|login_required|consent_required|no_tokens_found|invalid_grant|bad_token|refresh_token_expired|token_refresh_required|no_account_error)$/;
export interface AuthFailure { where: string; name: string; code: string; sub: string; reason: GateReason }

// ── 文件内容下载不下来（v3.0.21，2026-11-12 小黑屋维修线施工单第 2 条；规矩 = 统筹 Claude Fable 5.2，代码 = Claude Opus 5.5）──
//   库 2.3.3 起，下载文件内容失败抛的 CloudNetworkError 带 stage "content"（微软发文件的那台服务器，和登录 / 列文件不是同一个地址）；
//   store-ui.reportError 把它递到这里。闸门判成「没回应」时，如果这一趟开始以后来过这种信号 → 说「云端连得上、文件内容刚才没下载下来」，
//   不说成网盘没回应 / 没网（11-12 办公室那台：列文件好好的，下载连着失败，闸门却说「网盘没有回应」）。
//   用计数不用钟（本机墙上钟会被往回拨）：这一趟开头记一下，判的时候比一下变没变。只在「没回应」上改判，没网 / 登录过期照旧。
let _contentFailures = 0;
export function noteContentFailure(): void { _contentFailures++; }
export function parseAuthFailure(message: string): AuthFailure | null {
  const m = AUTH_LINE.exec(message);
  if (!m) return null;
  const [, where = "", name = "", code = "", sub = ""] = m;
  const expired = name === "InteractionRequiredAuthError" || NEEDS_INTERACTION.test(code) || NEEDS_INTERACTION.test(sub);
  return { where, name, code, sub, reason: expired ? "expired" : "noResponse" };   // 网络错 / iframe 超时（monitor_window_timeout）= 微软那边没给说法，不当「过期」
}
let _lastFailure: AuthFailure | null = null;
/** 从库的日志行里捡原因码（不是这种行 = 不管）。回 true = 认出来了。 */
export function noteAuthFailure(message: string): AuthFailure | null {
  const f = parseAuthFailure(message);
  if (f) _lastFailure = f;
  return f;
}

// ── 状态机 ──
export interface GateUi {
  checking(onEscape: () => void): void;
  blocked(reason: GateReason, on: { signIn: () => void; offline: () => void }): void;
  /** 只关闸门自己那层（别的面——库的冲突面——不碰）。 */
  release(): void;
  /** 锁屏位上现在是别人的面（库的冲突面）：别抢。 */
  foreignFaceUp(): boolean;
  bar(state: BarState): void;
}
export interface CloudGateDeps {
  ui: GateUi;
  hasHome(): boolean;
  signedIn(): boolean;
  /** 静默续签一次。 */
  renew(): Promise<boolean>;
  /** 问云端一次；回库的终态串（"cloud-error" = 没问成）。 */
  check(): Promise<string | undefined>;
  /** 连上之后补一轮（快进 / 推开着的 / 排队回放 / 「去处理」）。 */
  catchUp(): Promise<void>;
  /** 交互登录。true = 已起跳（页面要走了）。 */
  signIn(): Promise<boolean | null>;
  /** 问云端一次、真走一趟网（不经库：选了离线时库不出网），不抛 = 通。续签可能直接用缓存的令牌，说明不了网通不通（设计稿 §3 硬要求，11-04）。 */
  reachable(): Promise<void>;
  /** 页面在前台？后台不定时再试（回前台那一下 wake 会试）。缺 = 当在前台。 */
  pageVisible?(): boolean;
  /** 定时器接缝（单测用假时钟）：每 ms 调一次 fn，返回停止函数。缺 = setInterval。 */
  every?(ms: number, fn: () => void): () => void;
  /** 离线态静默再试的间隔；缺 = OFFLINE_RETRY_MS。开定时器那一刻读（探针改得动）。 */
  offlineRetryMs?(): number;
  note(line: string): void;
  now?(): number;
  timeoutMs?: number;
}
export interface CloudGate {
  phase(): GatePhase;
  /** 罩 / 闸在上面（不许把焦点还给纸）。 */
  locked(): boolean;
  /** 开机（initAuth 落地后调）。 */
  boot(): Promise<void>;
  /** 醒来。lock = 先罩住（离开得久）；不罩 = 悄悄核，只有没连上才弹闸。 */
  wake(lock: boolean): Promise<void>;
  /** 网回来了。回 true = 闸门接手了（调用方别再走老路）。 */
  netBack(): boolean;
  netLost(): void;
  authChanged(signedIn: boolean, reason?: string): void;
  /** 云钮「重新连接」。 */
  reconnect(): Promise<void>;
  /** 给库的 offlineEscape 接缝（§4）：闸门在场时，库里那条「问云端」跟闸门的逃生钮赛跑，不另开一张面。 */
  storeEscape(): { probe: Promise<unknown>; settle: () => void } | null;
}

/** 黑匣子去重：同一个 key 连着来只写第一次；key 变了才写，第一行带上「上一种又来了几次、没写」。reset = 从头算。 */
// 心跳（user 11-10「那么可以加一句」）：同样的结果每重复 HEARTBEAT_EVERY 次留一行——离线重试每分钟一次 → 约半小时一行。
//   用处：网一直断着时，黑匣子里分得清「还在每分钟试、一直没连上」和「重试的定时器死了、根本没在试」。
export const HEARTBEAT_EVERY = 30;
function dedupeNotes(note: (s: string) => void, every = HEARTBEAT_EVERY): { note(key: string, lines: string[]): void; reset(): void } {
  let last: string | null = null, lastLine = "", repeats = 0;
  return {
    note(key, lines) {
      if (!lines.length) return;
      if (key === last) {
        repeats++;
        if (repeats % every === 0) note(`${lastLine} — still the same, repeated ${repeats}x so far (one line every ${every})`);
        return;
      }
      const tail = repeats ? ` (previous result repeated ${repeats}x, ${repeats >= every ? `one line every ${every}` : "not logged"})` : "";
      last = key; lastLine = lines[0] ?? ""; repeats = 0;
      lines.forEach((l, i) => note(i === 0 ? l + tail : l));
    },
    reset() { last = null; lastLine = ""; repeats = 0; },
  };
}

type Trigger = "boot" | "wake" | "retry";
const never = new Promise<never>(() => {});

export function createCloudGate(d: CloudGateDeps): CloudGate {
  const timeoutMs = d.timeoutMs ?? CLOUD_CHECK_TIMEOUT_MS;
  const now = d.now ?? (() => Date.now());
  let phase: GatePhase = "open";
  let runId = 0;                     // 每一趟一个号：迟到的结果认号，不是这一趟的不算
  let quietInFlight = false;
  let reconnecting = false;
  let reason: GateReason = "noResponse";
  let escaped: (() => void) | null = null;
  let probe: Promise<void> | null = null;
  const armEscape = (): Promise<void> => { probe = new Promise<void>((res) => { escaped = res; }); return probe; };

  /** 静默续签（已经登录着就跳过）。回 null = 登录好了；否则是没成的原因。
   *  log 缺 = 直接进黑匣子；给了 = 交给调用方（离线态重试拿去去重，key 是不带耗时的结果）。 */
  async function renewOnce(trigger: string, log?: (key: string, line: string) => void): Promise<GateReason | null> {
    if (d.signedIn()) return null;
    _lastFailure = null;
    const t0 = now();
    let ok = false;
    const out = log ?? ((_key: string, line: string) => d.note(line));
    try { ok = await d.renew(); } catch (e) { const msg = String((e as Error)?.message ?? e); out(`renew threw ${msg}`, `silent renew threw (${trigger}): ${msg}`); }
    const f = _lastFailure as AuthFailure | null;
    const code = f ? ` name=${f.name} code=${f.code} sub=${f.sub}` : "";
    out(`renew ${ok ? "ok" : "failed"}${code}`, `silent renew (${trigger}): ${ok ? "ok" : "failed"} elapsed=${now() - t0}ms${code}`);   // §1 / §7⑧：黑匣子里有每次的结果和原因码
    if (ok) return null;
    return !rawOnline() ? "offline" : (f?.reason ?? "expired");   // 没日志又没成 = 库手里没账号可续（不是网的事）
  }
  /** 续签 + 问云端。 */
  async function verify(trigger: string): Promise<"ok" | GateReason> {
    const r = await renewOnce(trigger);
    if (r) return r;
    const status = await d.check();
    d.note(`cloud check (${trigger}): ${String(status ?? "skipped")}`);
    return status === "cloud-error" ? (rawOnline() ? "noResponse" : "offline") : "ok";
  }

  function block(r: GateReason, why: string): void {
    if (d.ui.foreignFaceUp()) { phase = "open"; d.note(`gate: ${why} → ${r}, but another face is up (cloud answered) → stay out of the way`); return; }   // 冲突面占着 = 云端其实回话了，面归库
    phase = "blocked"; reason = r;
    d.note(`gate: blocked reason=${r} (${why})`);
    showBlocked();
  }
  function showBlocked(): void { d.ui.blocked(reason, { signIn: () => { void pressSignIn(); }, offline: () => chooseOffline("continue") }); }
  function chooseOffline(how: string): void {
    runId++;
    phase = "open";
    setUserOffline(true);
    d.note(`gate: offline chosen (${how})`);
    escaped?.();
    d.ui.release();
    d.ui.bar("offline");
    startOfflineRetry();
  }
  // ── 离线态静默再试（设计稿 §3 硬要求，11-04）：慢网误判离线时浏览器从没离线、online 事件永不来——不定时再试就卡到刷新。
  //   每 OFFLINE_RETRY_MS 一次（页面藏着不试；回前台那一下走 wake → reconnect）；失败不弹不扰，成功 = reconnect 里清离线、补一轮、收条。
  let stopRetry: (() => void) | null = null;
  // 黑匣子去重（家族周账 F-189，2026-11-09）：网一直不通时每分钟一次的重试，结果和上一次一样就不写——
  //   只记第一次、结果变了的那次（带上中间省掉几次）、连上的那次。续签超时之后才回来的结果另一路去重。
  const retryLog = dedupeNotes((s) => d.note(s)), lateLog = dedupeNotes((s) => d.note(s));
  function startOfflineRetry(): void {
    if (stopRetry) return;
    retryLog.reset(); lateLog.reset();   // 新的一段离线：第一次重试一定记
    const ms = d.offlineRetryMs?.() ?? OFFLINE_RETRY_MS;
    const every = d.every ?? ((t: number, fn: () => void) => { const h = setInterval(fn, t); (h as { unref?: () => void }).unref?.(); return () => clearInterval(h); });
    stopRetry = every(ms, () => {
      if (!_userOffline) { endOfflineRetry(); return; }
      if (d.pageVisible?.() === false) return;
      void reconnect().catch((e) => d.note(`gate: offline retry threw: ${String((e as Error)?.message ?? e)}`));
    });
  }
  function endOfflineRetry(): void { stopRetry?.(); stopRetry = null; }
  /** 云端答话了吗（硬超时：慢网上问不出来 = 还没回来，不许挂住）。null = 答了；否则是没答的原因（进黑匣子，一次一行）。 */
  async function cloudAnswers(): Promise<string | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<string>((res) => { timer = setTimeout(() => res(`no answer in ${timeoutMs}ms`), timeoutMs); });
    try { return await Promise.race([d.reachable().then(() => null, (e) => String((e as Error)?.message ?? e).slice(0, 80)), timedOut]); }
    finally { clearTimeout(timer); }
  }
  async function pressSignIn(): Promise<void> {
    if (!rawOnline() || d.signedIn()) { await run("retry", true); return; }   // 没网跳不了登录页 / 已经登录着（是网盘没回应）：再核一次，不跳走
    d.ui.release();   // 让开锁屏位：「去登录」那张面要有人看得见
    let went: boolean | null = null;
    try { went = await d.signIn(); } catch (e) { d.note(`gate: sign-in threw: ${String((e as Error)?.message ?? e)}`); }
    if (went !== true && phase === "blocked") showBlocked();   // 没跳走 = 回到闸（不许半路放行）
  }

  async function run(trigger: Trigger, lock: boolean): Promise<void> {
    if (!d.hasHome()) return;                        // §2 没挂库：永不闸
    if (_userOffline) { if (rawOnline()) await reconnect(); return; }   // §7⑥ 已选离线：不再弹闸（条还在）；有网就悄悄试一次
    if (phase === "checking" || (!lock && quietInFlight)) return;
    if (d.ui.foreignFaceUp()) return;
    const wasBlocked = phase === "blocked";
    const id = ++runId;
    const cf0 = _contentFailures;   // 这一趟开头：之后来的下载内容失败才算这一趟的
    if (!rawOnline()) { block("offline", trigger); return; }   // §7④ 没网：直接进闸，不等超时
    const esc = armEscape();
    if (lock) { phase = "checking"; d.ui.checking(() => chooseOffline("escape")); }
    else quietInFlight = true;
    const t0 = now();
    const work = verify(trigger).catch((e): GateReason => { d.note(`gate: verify threw: ${String((e as Error)?.message ?? e)}`); return "noResponse"; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((res) => { timer = setTimeout(() => res("timeout"), timeoutMs); });
    const r = await Promise.race([work, timedOut, esc.then(() => "escaped" as const)]);   // §4：每一趟都和硬超时 + 逃生钮赛跑
    clearTimeout(timer);
    if (!lock) quietInFlight = false;
    if (id !== runId || r === "escaped") return;     // 人选了离线 / 下一趟接管了
    if (r === "ok") {
      phase = "open";
      d.ui.release();
      d.note(`gate: released (${trigger}) after ${now() - t0}ms`);
      if (wasBlocked || trigger === "retry") void d.catchUp();
      return;
    }
    const base: GateReason = r === "timeout" ? "noResponse" : r;
    const contentNow = base === "noResponse" && _contentFailures !== cf0;   // 这一趟里文件内容下载失败过 → 不是「没回应」
    block(contentNow ? "content" : base, `${r === "timeout" ? `${trigger}: no answer in ${timeoutMs}ms` : trigger}${contentNow ? `; ${_contentFailures - cf0} content download failure(s) during this check` : ""}`);
    if (r === "timeout") {   // 迟到的好消息：云端终于回了 = 自己放行，不让人卡在闸上
      void work.then((late) => {
        if (id === runId && late === "ok" && phase === "blocked") { phase = "open"; d.ui.release(); d.note("gate: late answer → released"); void d.catchUp(); }
      });
    }
  }

  async function reconnect(): Promise<void> {
    if (!_userOffline || reconnecting || !rawOnline()) return;
    reconnecting = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((res) => { timer = setTimeout(() => res("timeout"), timeoutMs); });
    // 这一次的黑匣子行先攒着，收尾时按「结果」整条交给 retryLog 去重（F-189）；收尾之后才回来的（续签超时后）走 lateLog。
    const keys: string[] = [], lines: string[] = [];
    let settled = false;
    const log = (key: string, line: string): void => {
      if (settled) lateLog.note(key, [`${line} (late: the retry had already given up)`]);
      else { keys.push(key); lines.push(line); }
    };
    const settle = (): void => { if (!settled) { settled = true; retryLog.note(keys.join(" | "), lines); } };
    try {
      // ① 先试登录（不进库的网）；② 再问云端一次（不经库，硬超时）——两样都通才把「离线」放开（设计稿 §3：令牌可能是缓存的，云端不答 = 不清离线、不弹；§2 最后一行：失败 = 条还在，不再弹闸）
      const r = await Promise.race([renewOnce("reconnect", log), timedOut]);
      if (r !== null) { log(`still offline ${String(r)}`, `gate: reconnect: still offline (${String(r)})`); return; }
      const why = await cloudAnswers();
      if (why !== null) { log(`cloud did not answer ${why}`, `gate: reconnect: cloud did not answer (${why}) → stay offline`); return; }
      if (!_userOffline) return;   // 等云端那会儿别的路（登出）已经收了
      setUserOffline(false);
      endOfflineRetry();
      log("reconnected", "gate: reconnected → catching up");
      settle();
      d.ui.bar("syncing");
      try { await d.catchUp(); } catch (e) { d.note(`gate: catch-up threw: ${String((e as Error)?.message ?? e)}`); }
      d.ui.bar("hidden");
    } finally {
      settle();
      clearTimeout(timer);
      reconnecting = false;
    }
  }

  return {
    phase: () => phase,
    locked: () => phase !== "open",
    boot: () => run("boot", true),
    wake: (lock) => run("wake", lock),
    netBack: () => {
      if (_userOffline) { void reconnect(); return true; }
      if (phase === "blocked") { void run("retry", true); return true; }
      return false;
    },
    netLost: () => { if (phase === "checking") { runId++; block("offline", "went offline while checking"); } },
    authChanged: (signedIn, why) => {
      if (!signedIn) {
        if (why !== "signOut") return;
        runId++; phase = "open"; setUserOffline(false); endOfflineRetry(); d.ui.release(); d.ui.bar("hidden");   // 主动登出 = 没有家了，闸和条都不该在
        return;
      }
      if (_userOffline) { void reconnect(); return; }
      if (phase === "blocked") void run("retry", true);
    },
    reconnect,
    storeEscape: () => {
      if (phase === "open") return null;
      return { probe: probe ?? never, settle: () => {} };   // 关不关罩归闸门，库不许顺手关
    },
  };
}
