// 网盘闸门（家族设计稿 ai-docs/20261103-cloud-gate-design.md §7 §8）：状态机单元 + 结构守卫。created 2026-11-03 by Claude Opus 5.5（家族工单 D）
//   状态机是纯逻辑（依赖全注入），这里直接跑；真 app 的整条链在 test/e2e-sync/run.mjs「闸门」那组。
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, assert, eq } from "./runner.mjs";
import { S } from "../src/i18n/strings.ts";
import { createCloudGate, cloudOnline, isUserOffline, noteAuthFailure, parseAuthFailure, rawOnline } from "../src/cloud-gate.ts";

let net = true;
Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, get: () => net });
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function makeGate(over = {}) {
  const calls = { checking: 0, blocked: [], release: 0, bars: [], renew: 0, check: 0, catchUp: 0, signIn: 0 };
  let onEscape = null, on = null, foreign = false;
  const ui = {
    checking: (e) => { calls.checking++; onEscape = e; },
    blocked: (r, h) => { calls.blocked.push(r); on = h; },
    release: () => { calls.release++; },
    foreignFaceUp: () => foreign,
    bar: (s) => { calls.bars.push(s); },
  };
  let signed = over.signed ?? false;
  const gate = createCloudGate({
    ui, timeoutMs: over.timeoutMs ?? 40, note: () => {},
    hasHome: () => over.home ?? true,
    signedIn: () => signed,
    renew: over.renew ?? (async () => { calls.renew++; signed = true; return true; }),
    check: over.check ?? (async () => { calls.check++; return "in-sync"; }),
    catchUp: async () => { calls.catchUp++; },
    signIn: over.signIn ?? (async () => { calls.signIn++; return null; }),
  });
  return { gate, calls, escape: () => onEscape(), press: () => on, setForeign: (v) => { foreign = v; }, setSigned: (v) => { signed = v; } };
}
/** 每个用例结束把全局「离线」放回去（它是模块级的，同 app 一个）。 */
async function resetOffline() { net = true; const { gate } = makeGate({ signed: true }); gate.authChanged(false, "signOut"); await tick(); }

describe("闸门 · 什么时候闸（§2）", () => {
  it("没有家：开机 / 醒来都零动作（§7①、§8②）", async () => {
    const t = makeGate({ home: false });
    await t.gate.boot(); await t.gate.wake(true); await t.gate.wake(false);
    eq(t.calls.checking, 0); eq(t.calls.blocked.length, 0); eq(t.calls.renew, 0); eq(t.calls.check, 0); eq(t.gate.phase(), "open");
  });
  it("登录好 + 云端没动：罩一下放行，不闸（§7②）", async () => {
    const t = makeGate({ signed: true });
    await t.gate.boot();
    eq(t.calls.checking, 1); eq(t.calls.blocked.length, 0); eq(t.calls.release, 1); eq(t.calls.renew, 0, "已登录不续签"); eq(t.calls.check, 1); eq(t.gate.phase(), "open");
  });
  it("续签成功 → 问云端 → 放行", async () => {
    const t = makeGate();
    await t.gate.boot();
    eq(t.calls.renew, 1); eq(t.calls.check, 1); eq(t.gate.phase(), "open"); eq(t.calls.blocked.length, 0);
  });
  it("没网：直接进闸，不续签、不等超时（§7④）", async () => {
    net = false;
    const t = makeGate();
    await t.gate.boot();
    eq(t.calls.checking, 0, "不罩"); eq(t.calls.blocked[0], "offline"); eq(t.calls.renew, 0); eq(t.gate.phase(), "blocked"); assert(t.gate.locked());
    await resetOffline();
  });
});

describe("闸门 · 正文按真实原因（§5）", () => {
  it("续签要交互 = 登录过期", async () => {
    const t = makeGate({ renew: async () => { noteAuthFailure("[auth] silent token renewal failed (retry-silent): name=InteractionRequiredAuthError code=login_required sub= msg=x"); return false; } });
    await t.gate.boot();
    eq(t.calls.blocked[0], "expired"); eq(t.calls.check, 0, "没续签上就别问云端");
  });
  it("续签撞网络错 = 网盘没有回应", async () => {
    const t = makeGate({ renew: async () => { noteAuthFailure("[auth] silent token renewal failed (retry-silent): name=BrowserAuthError code=network_error sub= msg=x"); return false; } });
    await t.gate.boot();
    eq(t.calls.blocked[0], "noResponse");
  });
  it("上一趟的原因不串到这一趟", async () => {
    noteAuthFailure("[auth] silent token renewal failed (retry-silent): name=BrowserAuthError code=network_error sub= msg=x");
    const t = makeGate({ renew: async () => false });
    await t.gate.boot();
    eq(t.calls.blocked[0], "expired", "这一趟没日志 = 库手里没账号可续");
  });
  it("问云端回 cloud-error = 网盘没有回应", async () => {
    const t = makeGate({ signed: true, check: async () => "cloud-error" });
    await t.gate.boot();
    eq(t.calls.blocked[0], "noResponse");
  });
  it("原因码解析：表里没有的错不当「过期」", () => {
    eq(parseAuthFailure("[auth] silent token renewal failed (boot-probe): name=BrowserAuthError code=monitor_window_timeout sub= msg=t").reason, "noResponse");
    eq(parseAuthFailure("[auth] silent token renewal failed (boot-probe): name=ServerError code=x sub=consent_required msg=t").reason, "expired");
    eq(parseAuthFailure("别的日志"), null);
  });
});

describe("闸门 · 逃生口（§4）", () => {
  it("云端挂起：8 s（这里 40 ms）自动进闸（§7⑤）", async () => {
    const t = makeGate({ signed: true, check: () => new Promise(() => {}) });
    await t.gate.boot();
    eq(t.calls.blocked[0], "noResponse");
  });
  it("续签挂起同样有超时", async () => {
    const t = makeGate({ renew: () => new Promise(() => {}) });
    await t.gate.boot();
    eq(t.calls.blocked[0], "noResponse");
  });
  it("罩从第一下起就有逃生钮：点了立刻放行 + 常驻条（§7⑤）", async () => {
    const t = makeGate({ signed: true, check: () => new Promise(() => {}), timeoutMs: 5000 });
    const p = t.gate.boot();
    eq(t.gate.phase(), "checking"); eq(t.calls.checking, 1);
    t.escape();
    await p;
    eq(t.gate.phase(), "open"); eq(t.calls.release, 1); eq(t.calls.bars.at(-1), "offline"); eq(t.calls.blocked.length, 0);
    assert(isUserOffline()); assert(!cloudOnline(), "选了离线 = cloudOnline 假"); assert(rawOnline(), "浏览器还是有网");
    await resetOffline();
  });
  it("库的 offlineEscape 接缝：闸门在场时跟闸门赛跑、不许库顺手关罩", async () => {
    const t = makeGate({ signed: true, check: () => new Promise(() => {}), timeoutMs: 5000 });
    eq(t.gate.storeEscape(), null, "没闸门 = 库走自己那张面");
    const p = t.gate.boot();
    const esc = t.gate.storeEscape();
    assert(esc && esc.probe, "有 probe");
    let done = false; void esc.probe.then(() => { done = true; });
    esc.settle();
    eq(t.calls.release, 0, "settle 不关罩");
    t.escape();
    await p; await tick();
    assert(done, "逃生钮 → probe 赢");
    await resetOffline();
  });
  it("迟到的好消息：进闸之后云端回了 = 自己放行 + 补一轮", async () => {
    let answer; const t = makeGate({ signed: true, check: () => new Promise((r) => { answer = r; }) });
    await t.gate.boot();
    eq(t.gate.phase(), "blocked");
    answer("in-sync"); await tick();
    eq(t.gate.phase(), "open"); eq(t.calls.release, 1); eq(t.calls.catchUp, 1);
  });
  it("冲突面占着锁屏位：超时不抢，归库", async () => {
    const t = makeGate({ signed: true, check: () => new Promise(() => {}) });
    const p = t.gate.boot();
    t.setForeign(true);
    await p;
    eq(t.calls.blocked.length, 0); eq(t.gate.phase(), "open");
  });
  it("冲突面开着时醒来：不抢", async () => {
    const t = makeGate({ signed: true });
    t.setForeign(true);
    await t.gate.wake(true);
    eq(t.calls.checking, 0); eq(t.calls.check, 0);
  });
  it("核的时候断网：立刻进闸", async () => {
    const t = makeGate({ signed: true, check: () => new Promise(() => {}), timeoutMs: 5000 });
    void t.gate.boot();
    net = false; t.gate.netLost();
    eq(t.calls.blocked[0], "offline"); eq(t.gate.phase(), "blocked");
    await resetOffline();
  });
});

describe("闸门 · 两个钮", () => {
  it("离线继续：放行 + 条；再醒来且没网 = 不再弹闸（§7⑥）", async () => {
    const t = makeGate({ renew: async () => false });
    await t.gate.boot();
    t.press().offline();
    eq(t.gate.phase(), "open"); eq(t.calls.bars.at(-1), "offline");
    net = false;
    const n = t.calls.blocked.length;
    await t.gate.wake(true); await t.gate.wake(false);
    eq(t.calls.blocked.length, n, "不再弹闸"); eq(t.calls.checking, 1, "也不再罩");
    await resetOffline();
  });
  it("重新登录 · 有网：让开锁屏位去登录；没跳走 = 回到闸（不半路放行）", async () => {
    const t = makeGate({ renew: async () => false });
    await t.gate.boot();
    t.press().signIn(); await tick();
    eq(t.calls.signIn, 1); eq(t.calls.release, 1); eq(t.calls.blocked.length, 2, "回到闸"); eq(t.gate.phase(), "blocked");
  });
  it("重新登录 · 没网：不跳走，再核一次", async () => {
    net = false;
    const t = makeGate({ renew: async () => false });
    await t.gate.boot();
    t.press().signIn(); await tick();
    eq(t.calls.signIn, 0); eq(t.calls.blocked.length, 2);
    await resetOffline();
  });
  it("重新登录 · 已经登录着（是网盘没回应）：不跳走，再核一次", async () => {
    let n = 0; const t = makeGate({ signed: true, check: async () => (n++ === 0 ? "cloud-error" : "in-sync") });
    await t.gate.boot();
    t.press().signIn(); await tick();
    eq(t.calls.signIn, 0); eq(t.gate.phase(), "open"); eq(t.calls.catchUp, 1);
  });
  it("闸着时登录好了（别的路）：自己放行", async () => {
    const t = makeGate({ renew: async () => false });
    await t.gate.boot();
    t.setSigned(true);
    t.gate.authChanged(true, "silent"); await tick();
    eq(t.gate.phase(), "open"); eq(t.calls.catchUp, 1);
  });
  it("闸着时回线：再核一次", async () => {
    net = false;
    const t = makeGate();
    await t.gate.boot();
    net = true;
    eq(t.gate.netBack(), true);
    await tick();
    eq(t.gate.phase(), "open");
    await resetOffline();
  });
});

describe("闸门 · 网回来（§2 最后一行）", () => {
  it("续签成功 → 放开离线、问云端、补一轮、条收掉（§7③）", async () => {
    let ok = false;
    const t = makeGate({ renew: async () => ok });
    await t.gate.boot();
    t.press().offline();
    assert(isUserOffline());
    ok = true; t.setSigned(false);
    eq(t.gate.netBack(), true, "闸门接手");
    await tick(); await tick();
    assert(!isUserOffline()); assert(cloudOnline()); eq(t.calls.catchUp, 1); eq(t.calls.bars.slice(-2).join(), "syncing,hidden");
    await resetOffline();
  });
  it("续签没成：条还在、不弹闸", async () => {
    const t = makeGate({ renew: async () => false });
    await t.gate.boot();
    t.press().offline();
    const n = t.calls.blocked.length;
    t.gate.netBack(); await tick();
    assert(isUserOffline()); eq(t.calls.blocked.length, n); eq(t.calls.bars.at(-1), "offline");
    await resetOffline();
  });
  it("续签成了、云端问不成：收回离线、条还在", async () => {
    const t = makeGate({ signed: true, check: async () => "cloud-error" });
    await t.gate.boot();
    t.press().offline();
    t.gate.netBack(); await tick(); await tick();
    assert(isUserOffline(), "还是离线"); eq(t.calls.catchUp, 0); eq(t.calls.bars.at(-1), "offline");
    await resetOffline();
  });
  it("主动登出：闸、条、离线都收掉", async () => {
    const t = makeGate({ renew: async () => false });
    await t.gate.boot();
    t.press().offline();
    t.gate.authChanged(false, "signOut");
    assert(!isUserOffline()); eq(t.calls.bars.at(-1), "hidden"); eq(t.gate.phase(), "open");
  });
  it("令牌过期的广播不动闸（闸只在开机 / 醒来弹，§2）", async () => {
    const t = makeGate({ signed: true });
    t.gate.authChanged(false, "expired");
    eq(t.calls.blocked.length, 0); eq(t.gate.phase(), "open");
  });
});

describe("闸门 · 结构守卫（§8）", () => {
  const read = (p) => readFileSync(p, "utf8");
  const gateSrc = read("src/cloud-gate.ts"), uiSrc = read("src/cloud-gate-ui.ts"), app = read("src/app.ts"), appStore = read("src/app-store.ts"), storeUi = read("src/store-ui.ts");
  function* walk(dir) { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) yield* walk(p); else yield p; } }

  it("§8① 每一趟等云端都和硬超时 + 逃生钮赛跑；boot() 自己不 await 云端", () => {
    assert(/Promise\.race\(\[work, timedOut, esc\.then/.test(gateSrc), "run() 的 race");
    assert(/Promise\.race\(\[renewOnce\("reconnect"\), timedOut\]\)/.test(gateSrc) && /Promise\.race\(\[d\.check\(\), timedOut\]\)/.test(gateSrc), "reconnect 的 race");
    const m = /^async function boot\(\): Promise<void> \{\n([\s\S]*?)^\}/m.exec(app);
    assert(m, "找得到 boot()");
    const topLevel = m[1].split("\n").filter((l) => /^ {2}\S/.test(l));   // 只看函数体最外层（输入法那段 then 里的不挡启动）
    for (const l of topLevel) assert(!/await\s+(auth\.|afterSignIn|resumeSync|refreshIfCleanAny|pullUserDict|reconcileCollections|gate\.)/.test(l), `boot() 不许等云端：${l.slice(0, 80)}`);
    assert(/void gate\.boot\(\);/.test(app), "开机走闸门，不等它");
  });
  it("§8② 有家才闸：run() 第一句看 hasHome，有家 = MSAL 有账号（不新增存储）", () => {
    assert(/async function run\(trigger: Trigger, lock: boolean\): Promise<void> \{\n\s*if \(!d\.hasHome\(\)\) return;/.test(gateSrc));
    assert(/homeKnown = st\.signedIn \|\| !!\(st as \{ probing\?: boolean \}\)\.probing;/.test(app), "有家的判据");
  });
  it("§8③ 文案：两语都有、原因三句分开、标题不写失败 / 错误、没有指挥句", () => {
    const keys = ["gate.checking", "gate.skipOffline", "gate.title", "gate.reasonExpired", "gate.reasonOffline", "gate.reasonNoResponse", "gate.signIn", "gate.offline", "gate.bar", "gate.barZero", "gate.barSyncing", "gate.reconnect"];
    for (const k of keys) assert(S[k]?.zh && S[k]?.en, `缺 ${k}`);
    const reasons = ["gate.reasonExpired", "gate.reasonOffline", "gate.reasonNoResponse"];
    eq(new Set(reasons.map((k) => S[k].zh)).size, 3); eq(new Set(reasons.map((k) => S[k].en)).size, 3);
    for (const k of keys) {
      assert(!/失败|错误|请检查|请先|请/.test(S[k].zh), `${k} 中文不许这样写：${S[k].zh}`);
      assert(!/fail|error|please|check your|make sure/i.test(S[k].en), `${k} 英文不许这样写：${S[k].en}`);
    }
    assert(S["gate.bar"].zh.includes("{n}") && S["gate.bar"].en.includes("{n}"), "条上带份数");
  });
  it("§8④ 「离线继续」不落盘：闸门两个文件不碰任何存储，全仓没有写它的地方", () => {
    for (const [n, s] of [["cloud-gate.ts", gateSrc], ["cloud-gate-ui.ts", uiSrc]]) {
      assert(!/device-kv|deviceKv|localStorage|sessionStorage|indexedDB|app-store|prefs\b/.test(s.replace(/\/\/[^\n]*/g, "")), `${n} 不许碰存储`);
    }
    for (const p of walk("src")) {
      if (!/\.ts$/.test(p)) continue;
      const s = read(p);
      assert(!/(deviceKvSet\w*|setItem)\([^)\n]*(userOffline|isUserOffline|cloudOffline)/.test(s), `${p} 把离线写进存储了`);
    }
  });
  it("接线：库的 isOnline = cloudOnline；云端判断不再散在 navigator.onLine", () => {
    assert(/isOnline: cloudOnline,/.test(appStore), "app-store 接 isOnline");
    assert(/const od = createOneDriveProvider\([^\n]*\);/.test(appStore), "e2e 测试台靠这一行换假云");
    const allowed = new Set(["src/cloud-gate.ts", "src/factory-reset.ts"]);   // 还原出厂看的是真网（要重新拉壳），和云端无关
    for (const p of walk("src")) {
      if (!/\.ts$/.test(p) || allowed.has(p.replaceAll("\\", "/"))) continue;
      assert(!/navigator\.onLine/.test(read(p).replace(/\/\/[^\n]*/g, "")), `${p} 还在直接看 navigator.onLine（云端判断走 cloudOnline）`);
    }
  });
  it("接线：续签失败的原因码经 store-ui.reportError 进来；行格式对着库的 dist 钉住", () => {
    assert(/noteAuthFailure\(String\(/.test(storeUi), "store-ui 递原因码");
    assert(/const viaGate = _gate\?\.storeEscape\(\);/.test(storeUi), "offlineEscape 认闸门");
    const dist = "node_modules/@internal/store/dist/base/providers/auth.js";
    assert(existsSync(dist), "store 的 dist 在");
    const auth = read(dist);
    assert(auth.includes("`[auth] silent token renewal failed (${where}): name=${String(err?.name ?? \"?\")} code=${String(err?.errorCode ?? \"?\")} sub=${String(err?.subError ?? \"\")} msg="), "库改了日志格式 = 这里红（闸门靠它分「登录过期」和「没回应」）");
    assert(/reportStoreError\(new Error\(lines\.join\("\\n"\)\), "log"\)/.test(auth), "库经 reportError 递这一行");
    const multi = parseAuthFailure("[auth] silent token renewal failed (retry-silent): name=InteractionRequiredAuthError code=interaction_required sub= msg=AADSTS\n  account=abc…");
    eq(multi?.reason, "expired", "多行日志只看第一行");
  });
  it("§5 位置：罩和闸都走 lockSyncGate 那个锁屏位，不弹第二层面", () => {
    eq((uiSrc.match(/lockSyncGate</g) ?? []).length, 2);
    assert(!/openChoiceSheet|openConfirmSheet/.test(uiSrc));
  });
});
