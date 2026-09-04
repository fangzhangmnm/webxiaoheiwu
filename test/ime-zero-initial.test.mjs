// 双拼零声母重写状态机契约（键表已由 2026-09-04 探针逐条验证；这里测状态机本身）。created 2026-09-04 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
import { ZeroInitialRewriter, ZERO_TABLES, ZERO_FULL_FORMS } from "../src/ime-zero-initial.ts";

const fmt = (ops) => ops.map((o) => (o.op === "bs" ? "⌫" : o.key)).join("");
const feed = (rw, keys) => JSON.stringify(keys.split("").map((k) => fmt(rw.onKey(k))));
const rime = (rw, keys) => { let buf = ""; for (const k of keys) for (const o of rw.onKey(k)) buf = o.op === "bs" ? buf.slice(0, -1) : buf + o.key; return buf; };

describe("ime-zero-initial", () => {
  it("键表：五方案 × 12 音节都有 2 键且不与别的全拼撞（除加加 er=en 按方案语义）", () => {
    for (const [name, t] of Object.entries(ZERO_TABLES)) {
      for (const f of ZERO_FULL_FORMS) { const d = t.full[f]; assert(d && d.length === 2, `${name}.${f}`); }
      for (const f of ZERO_FULL_FORMS) for (const g of ZERO_FULL_FORMS) if (f !== g && t.full[f] === g) assert(name === "double_pinyin_pyjj" && f === "en" && g === "er", `${name}: ${f}→${g} 撞全拼`);
    }
  });
  it("微软：aimili → al mi li（全拼零声母被重写成双拼键）", () => {
    const rw = new ZeroInitialRewriter(ZERO_TABLES.double_pinyin_mspy);
    eq(feed(rw, "aimili"), JSON.stringify(["aa", "⌫⌫al", "m", "i", "l", "i"]));
    eq(rime(new ZeroInitialRewriter(ZERO_TABLES.double_pinyin_mspy), "aimili"), "almili");
  });
  it("微软：原生 ol / al / oa 照旧认；ang/eng 三键与 an+g 分界", () => {
    const rw = new ZeroInitialRewriter(ZERO_TABLES.double_pinyin_mspy);
    eq(rime(rw, "olmili"), "olmili"); rw.reset();
    eq(rime(rw, "almili"), "almili"); rw.reset();
    eq(rime(rw, "oa"), "oa"); rw.reset();
    eq(feed(rw, "angm"), JSON.stringify(["aa", "⌫⌫aj", "⌫⌫ah", "m"])); rw.reset();
    eq(rime(rw, "anmi"), "ajmi"); rw.reset();          // an 收口后 m 另起音节
    eq(rime(rw, "enggu"), "eggu"); rw.reset();
    eq(rime(rw, "aba"), "aaba");                        // 啊 + ba：全拼 a 单独成节
  });
  it("边界：只有音节起点的 a/e/o 走零声母；音节中间的 a/e/o 是韵母键", () => {
    const rw = new ZeroInitialRewriter(ZERO_TABLES.double_pinyin_mspy);
    eq(rime(rw, "maai"), "maal");   // ma + ai
    rw.reset(); eq(rime(rw, "mo"), "mo"); rw.reset(); eq(rime(rw, "hk"), "hk"); rw.reset(); eq(rime(rw, "hoa"), "hoaa");   // ho + 啊
  });
  it("退格：挂起音节回退一档；普通键退格翻转奇偶", () => {
    const rw = new ZeroInitialRewriter(ZERO_TABLES.double_pinyin_mspy);
    feed(rw, "an"); eq(fmt(rw.onBackspace()), "⌫⌫aa"); eq(fmt(rw.onBackspace()), "⌫⌫"); eq(rime(rw, "mi"), "mi");
    rw.reset(); feed(rw, "m"); eq(fmt(rw.onBackspace()), "⌫"); eq(rime(rw, "ai"), "al");   // 退回边界后 a 又是零声母
  });
  it("自然码 / 小鹤 / ABC / 加加 各自键表；加加 er 键 = en（方案语义优先）", () => {
    eq(rime(new ZeroInitialRewriter(ZERO_TABLES.double_pinyin), "aimili"), "almili");
    eq(rime(new ZeroInitialRewriter(ZERO_TABLES.double_pinyin_flypy), "aimili"), "admili");
    eq(rime(new ZeroInitialRewriter(ZERO_TABLES.double_pinyin_abc), "aimili"), "olmili");
    eq(rime(new ZeroInitialRewriter(ZERO_TABLES.double_pinyin_abc), "ou"), "ob");
    eq(rime(new ZeroInitialRewriter(ZERO_TABLES.double_pinyin_pyjj), "aimili"), "asmili");
    eq(rime(new ZeroInitialRewriter(ZERO_TABLES.double_pinyin_pyjj), "er"), "er");     // = en
    eq(rime(new ZeroInitialRewriter(ZERO_TABLES.double_pinyin_pyjj), "eq"), "eq");     // = er
  });
  it("非双拼方案：直通", () => {
    const rw = new ZeroInitialRewriter(null);
    eq(feed(rw, "aimili"), JSON.stringify(["a", "i", "m", "i", "l", "i"])); eq(fmt(rw.onBackspace()), "⌫"); assert(!rw.active);
  });
  it("syncFromPreedit：末段单字符 = 音节中间", () => {
    const rw = new ZeroInitialRewriter(ZERO_TABLES.double_pinyin_mspy);
    rw.syncFromPreedit("ni m"); eq(rime(rw, "a"), "a");          // 中间：a 是韵母键
    rw.syncFromPreedit("ni mi"); eq(rime(rw, "a"), "aa");        // 边界：零声母
  });
});
