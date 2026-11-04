// 加密词库的规矩（src/enc-dict.ts，家族工单 D3）：假的内存层 + 假的封口，核谁写哪把键、写的是不是封着的、清空怎么跟。created 2026-11-03 by Claude Opus 5.5
//   真 RIME + 真容器 + 两台设备 = test/e2e-sync/run.mjs「加密词库」。
import { describe, it, assert } from "./runner.mjs";
import { createEncDict, decodePayload, encodePayload, unionOf, ENC_DICT_IDLE_MS } from "../src/enc-dict.ts";
import { FORMAT } from "../src/project/migrate/index.ts";

const dec = new TextDecoder(), enc = new TextEncoder();
const seal = async (json, pw) => `SEALED:${pw}:${dec.decode(json)}`;
const unseal = async (v, pw) => (v.startsWith(`SEALED:${pw}:`) ? enc.encode(v.slice(`SEALED:${pw}:`.length)) : null);

function sharedCloud() { const m = new Map(), subs = []; return { m, subs, keys: () => [...m.keys()], getItem: (k) => m.get(k), setItem(k, v) { m.set(k, v); for (const s of subs) s([k]); }, writes: [] }; }
function device(cloud, { pw = "pw", on = true, label = "d" } = {}) {
  const kv = new Map(), layer = { on, composing: 0, words: new Map(), base: new Map(), loads: [], resets: 0, tick: 10 };
  const snap = () => ({ luna: { tick: layer.tick, maxSeq: 0, maxFile: 0, entries: new Map(layer.words) } });
  const merged = (entries) => { for (const [k, e] of Object.entries(entries.luna ?? {})) layer.words.set(k, { c: e[0], d: e[1], t: layer.tick }); };
  let pass = pw, id = 0, timers = [], status = 0;
  const D = createEncDict({
    collection: cloud,
    layer: {
      memoryOnly: () => layer.on,
      load: async (e) => { if (!layer.on) return { status: "off" }; if (layer.composing > 0) { layer.composing--; return { status: "composing" }; } layer.loads.push(e); merged(e); return { status: "ok", base: snap() }; },
      read: async () => (layer.on ? snap() : null),
      reset: async (e) => { if (!layer.on) return { status: "off" }; layer.resets++; layer.words.clear(); merged(e); return { status: "ok", base: snap() }; },
    },
    password: () => pass, seal, unseal, device: () => label,
    kvGet: (k) => kv.get(k) ?? null, kvSet: (k, v) => kv.set(k, v),
    newId: () => `${label}${++id}`, now: () => ++clock, note() {}, report: (e) => { throw e; }, tellNewer: () => { status++; },
    sleep: async () => {}, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => { timers = []; },
  });
  const learn = (key, c = 1) => { layer.tick++; layer.words.set(key, { c, d: 1, t: layer.tick }); };
  return { D, layer, learn, snap, kv, setPw: (p) => { pass = p; }, timers: () => timers, newer: () => status, settle: async () => { D.ensureLoaded(); await D.sealNow(); } };
}
let clock = 1000;
const payloads = async (cloud, pw = "pw") => { const out = {}; for (const [k, v] of cloud.m) out[k] = decodePayload(await unseal(v, pw))?.payload ?? null; return out; };
const hasWord = (ps, w) => Object.values(ps).some((p) => p && Object.values(p.entries).some((m) => w in m));

describe("加密词库 · 谁写哪把键", () => {
  it("没学词 = 一个字节不写；学了 = 只写自己这一把、值是封着的", async () => {
    const c = sharedCloud(), A = device(c);
    await A.settle();
    assert(A.D.loaded() && c.m.size === 0, "没东西不写");
    A.learn("mi \t米"); await A.D.sealNow();
    assert(c.m.size === 1, String(c.m.size));
    const [[k, v]] = [...c.m];
    assert(k.startsWith("dict.") && v.startsWith("SEALED:pw:"), v.slice(0, 20));
    assert(!k.includes("米"), "键名里没有词");
    assert((await payloads(c))[k].entries.luna["mi \t米"][0] === 1);
  });
  it("没新词不重写；连着封只多新学的", async () => {
    const c = sharedCloud(), A = device(c);
    await A.settle();
    A.learn("a \tA"); await A.D.sealNow();
    const once = [...c.m.values()][0];
    await A.D.sealNow();
    assert([...c.m.values()][0] === once, "没新词 = 字节不动");
    A.learn("b \tB"); await A.D.sealNow();
    const p = Object.values(await payloads(c))[0];
    assert("a \tA" in p.entries.luna && "b \tB" in p.entries.luna, "累积");
  });
  it("两台各学一个词：各写各的键；第三次打开并集里两个都有", async () => {
    const c = sharedCloud(), A = device(c, { label: "a" }), B = device(c, { label: "b" });
    await A.settle(); A.learn("a \tA"); await A.D.sealNow();
    await B.settle(); B.learn("b \tB"); await B.D.sealNow();
    assert(c.m.size === 2, "一机一键");
    const C = device(c, { label: "c" });
    await C.settle();
    const loaded = C.layer.loads[0].luna;
    assert("a \tA" in loaded && "b \tB" in loaded, JSON.stringify(Object.keys(loaded)));
  });
  it("别的设备的词灌进来不算自己学的（不抄进自己的键）", async () => {
    const c = sharedCloud(), A = device(c, { label: "a" }), B = device(c, { label: "b" });
    await A.settle(); A.learn("a \tA"); await A.D.sealNow();
    await B.settle(); B.learn("b \tB"); await B.D.sealNow();
    const ps = await payloads(c), bKey = Object.keys(ps).find((k) => "b \tB" in ps[k].entries.luna);
    assert(!("a \tA" in ps[bKey].entries.luna), "B 的键只有 B 学的");
  });
  it("空闲 60 s 才封：上屏重新计时", async () => {
    const c = sharedCloud(), A = device(c);
    await A.settle();
    A.learn("a \tA"); A.D.poke(); A.D.poke();
    assert(A.timers().length === 1 && A.timers()[0].ms === ENC_DICT_IDLE_MS, `${A.timers().length}`);
    assert(c.m.size === 0, "到点之前不写");
    A.timers()[0].fn(); await A.D.sealNow();
    assert(c.m.size === 1, "到点封了");
  });
  it("关稿：用输入法丢内存层之前最后那一眼封", async () => {
    const c = sharedCloud(), A = device(c);
    await A.settle();
    A.learn("z \tZ");
    const last = A.snap();
    A.layer.on = false; A.layer.words.clear();
    await A.D.leave(Promise.resolve(last));
    assert(hasWord(await payloads(c), "z \tZ"), "最后一眼进了键");
    assert(!A.D.loaded(), "会话结束");
  });
  it("正在组字不灌（重开引擎会丢组字）：等一下再来", async () => {
    const c = sharedCloud(), A = device(c); A.layer.composing = 2;
    await A.settle();
    assert(A.D.loaded() && A.layer.composing === 0, "等到了");
  });
});
describe("加密词库 · 口令不在", () => {
  it("没口令：不加载、不写", async () => {
    const c = sharedCloud(); c.setItem("dict.x", await seal(encodePayload({ version: 1, entries: { luna: { "a \tA": [1, 1] } }, savedAt: 1, device: "x" }), "pw"));
    const before = [...c.m.values()].join(), A = device(c, { pw: null });
    await A.settle();
    assert(!A.D.loaded() && A.layer.loads.length === 0, "不加载");
    A.learn("s \tS"); await A.D.sealNow(); await A.D.leave(Promise.resolve(A.snap()));
    assert([...c.m.values()].join() === before, "字节不变");
  });
  it("明文稿期间不加载", async () => {
    const c = sharedCloud(), A = device(c, { on: false });
    await A.settle();
    assert(!A.D.loaded() && A.layer.loads.length === 0);
  });
  it("锁定：灌进去的立刻从内存层丢；解锁再开才回来", async () => {
    const c = sharedCloud(), A = device(c);
    await A.settle(); A.learn("a \tA"); await A.D.sealNow();
    A.setPw(null); await A.D.onLocked();
    assert(!A.D.loaded() && A.layer.resets === 1 && A.layer.words.size === 0, "丢了");
    A.setPw("pw"); await A.settle();
    assert(A.D.loaded() && A.layer.words.has("a \tA"), "回来了");
  });
  it("别的口令封的键：读不了就跳过；自己的键读不了 = 换新名字，绝不覆盖", async () => {
    const c = sharedCloud(), A = device(c);
    await A.settle(); A.learn("a \tA"); await A.D.sealNow();
    const oldKey = [...c.m.keys()][0], oldValue = c.m.get(oldKey);
    await A.D.leave(Promise.resolve(null));
    A.setPw("other"); A.layer.words.clear();
    await A.settle();
    assert(A.D.loaded(), "照样能用");
    A.learn("b \tB"); await A.D.sealNow();
    assert(c.m.get(oldKey) === oldValue, "旧键没被盖");
    assert(c.m.size === 2, "写到了新名字");
  });
  it("换口令：读得开的键全换成新口令封", async () => {
    const c = sharedCloud(), A = device(c);
    await A.settle(); A.learn("a \tA"); await A.D.sealNow();
    await A.D.rekey("pw", "new");
    assert([...c.m.values()].every((v) => v.startsWith("SEALED:new:")));
    assert(hasWord(await payloads(c, "new"), "a \tA"), "词还在");
  });
});
describe("加密词库 · 清空", () => {
  it("清空：自己的键写 clearedAt、词没了、内存层也没了", async () => {
    const c = sharedCloud(), A = device(c);
    await A.settle(); A.learn("a \tA"); await A.D.sealNow();
    assert(await A.D.clear());
    const p = Object.values(await payloads(c))[0];
    assert(p.clearedAt > 0 && Object.keys(p.entries).length === 0, JSON.stringify(p));
    assert(A.layer.words.size === 0 && A.layer.resets === 1);
  });
  it("别的设备不把词传回来：打开时先清自己的键，并集里没有旧词", async () => {
    const c = sharedCloud(), A = device(c, { label: "a" }), B = device(c, { label: "b" });
    await A.settle(); await B.settle();
    B.learn("old \t旧"); await B.D.sealNow(); await B.D.leave(Promise.resolve(null));
    assert(await A.D.clear());
    const C = device(c, { label: "c" }); await C.settle();
    assert(!("luna" in (C.layer.loads[0] ?? {})) && !C.layer.words.has("old \t旧"), "B 还没跟上：它的词也作废");
    B.layer.words.clear(); await B.settle();
    assert(!B.layer.words.has("old \t旧") && !hasWord(await payloads(c), "old \t旧"), "B 打开：自己的键清了");
    assert(Object.values(await payloads(c)).every((p) => (p.clearedAt ?? 0) > 0), "都跟上了");
    B.learn("new \t新"); await B.D.sealNow();
    const D3 = device(c, { label: "d" }); await D3.settle();
    assert(D3.layer.words.has("new \t新"), "清空之后学的照常");
  });
  it("稿子开着的时候别的设备清了：下一次封先跟，不把这段时间的词传回去", async () => {
    const c = sharedCloud(), A = device(c, { label: "a" }), B = device(c, { label: "b" });
    await A.settle(); await B.settle();
    B.learn("mid \t中"); await B.D.sealNow();
    B.learn("later \t后");
    await A.D.clear();
    B.D.noteChanged(c.keys()); await B.D.sealNow();
    assert(!hasWord(await payloads(c), "later \t后") && !hasWord(await payloads(c), "mid \t中"), "没传回去");
    assert(B.layer.resets === 1 && !B.layer.words.has("later \t后"), "内存层也清了");
  });
  it("时钟不准也不怕：只比 clearedAt，不比 savedAt", () => {
    const u = unionOf([{ version: 1, entries: { l: { x: [1, 1] } }, savedAt: 9e12, device: "快钟", clearedAt: 5 }, { version: 1, entries: {}, savedAt: 1, device: "清的", clearedAt: 6 }]);
    assert(u.clearedAt === 6 && !u.entries.l, JSON.stringify(u));
  });
});
describe("加密词库 · 格式纪律", () => {
  const stamp = (o) => enc.encode(JSON.stringify(o));
  it("写本版的拍", () => { const j = JSON.parse(dec.decode(encodePayload({ version: 1, entries: {}, savedAt: 1, device: "d" }))); assert(j.version === FORMAT.encDict.major && j.minor === FORMAT.encDict.minor && j.patch === FORMAT.encDict.patch); });
  it("minor 更新：能读、未知键原样带回、说一次", async () => {
    const c = sharedCloud(), A = device(c);
    A.kv.set("rimeEncDictKey", "dict.me");
    c.setItem("dict.me", await seal(stamp({ version: 1, minor: 9, entries: { luna: { "a \tA": [2, 1] } }, savedAt: 1, device: "x", futureKey: { keep: 1 } }), "pw"));
    await A.settle();
    assert(A.layer.words.has("a \tA") && A.newer() === 1, "能读 + 说一次");
    A.learn("b \tB"); await A.D.sealNow();
    const p = JSON.parse(dec.decode(await unseal(c.m.get("dict.me"), "pw")));
    assert(p.futureKey?.keep === 1 && p.minor === FORMAT.encDict.minor, JSON.stringify(p).slice(0, 120));
  });
  it("major 更新：不读、不覆盖，自己换新键", async () => {
    const c = sharedCloud(), A = device(c);
    A.kv.set("rimeEncDictKey", "dict.me");
    const v = await seal(stamp({ version: 99, entries: { luna: { "a \tA": [2, 1] } }, savedAt: 1, device: "x" }), "pw");
    c.setItem("dict.me", v);
    await A.settle();
    assert(!A.layer.words.has("a \tA"), "不读");
    A.learn("b \tB"); await A.D.sealNow();
    assert(c.m.get("dict.me") === v && c.m.size === 2, "没盖");
  });
  it("冻结样本：1.0.0 的形状永远读得出来", async () => {
    const fs = await import("node:fs");
    const bytes = fs.readFileSync(new URL("./fixtures/format/enc-dict-1.0.0.json", import.meta.url));
    const got = decodePayload(new Uint8Array(bytes));
    assert(got && got.verdict === "same", JSON.stringify(got?.verdict));
    assert(got.payload.entries.luna_pinyin["mi \t米"][0] === 2 && got.payload.device === "frozen sample" && got.payload.clearedAt === 1700000000000);
  });
});
