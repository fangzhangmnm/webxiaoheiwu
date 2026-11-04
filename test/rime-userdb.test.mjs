// RIME 用户词库字节读写（src/rime-userdb.ts）：读真 RIME 写出来的文件、写出来的日志读得回来、合并规矩。created 2026-11-03 by Claude Opus 5.5（家族工单 D3）
//   真 RIME 重放我们写的日志 = test/e2e-sync/run.mjs「加密词库」。
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./runner.mjs";
import { parseUserdbFiles, buildLogFile, planLoad, deltaOf, mergeEntries, packValue, parseValue, logFileName, crc32c, decayed, emptyParsed } from "../src/rime-userdb.ts";

const DIR = fileURLToPath(new URL("./fixtures/rime-userdb/", import.meta.url));
const real = () => fs.readdirSync(DIR).map((name) => ({ name, data: new Uint8Array(fs.readFileSync(DIR + name)) }));
const log = (records, seq, name = "000020.log") => ({ name, data: buildLogFile(records, seq) });

describe("rime-userdb · 读", () => {
  it("真 RIME 写出来的词库（两个 .ldb + 空日志）：七个字、时钟 7、元数据不算词", () => {
    const p = parseUserdbFiles(real());
    assert(p.entries.size === 7 && p.tick === 7, `${p.entries.size} / ${p.tick}`);
    assert(p.entries.get("ni \t你")?.c === 1 && p.entries.get("wu \t無")?.t === 7);
    assert(![...p.entries.keys()].some((k) => k.startsWith("\x01")), "元数据不进词条");
    assert(p.maxSeq === 19 && p.maxFile === 11, `${p.maxSeq} / ${p.maxFile}`);
  });
  it("序号大的赢：日志盖过 .ldb", () => {
    const p = parseUserdbFiles([...real(), log([["ni \t你", "c=5 d=2 t=9"]], 100)]);
    assert(p.entries.get("ni \t你")?.c === 5 && p.maxSeq === 100);
  });
  it("压缩块 / 魔数不对 = 抛（不把半本词库当整本）", () => {
    const f = real().find((x) => x.name === "000008.ldb"), copy = f.data.slice();
    copy[copy.length - 1] ^= 0xff;
    let threw = false; try { parseUserdbFiles([{ name: f.name, data: copy }]); } catch { threw = true; }
    assert(threw, "魔数不对");
  });
});
describe("rime-userdb · 写", () => {
  it("写出来的日志读得回来；跨 32 KiB 块（几千条、分片）也对", () => {
    const records = [];
    for (let i = 0; i < 6000; i++) records.push([`code${i} \t字${i}`, `c=${i % 7} d=0.${i % 9}5 t=${i}`]);
    const p = parseUserdbFiles([log(records, 1000)]);
    assert(p.entries.size === 6000, String(p.entries.size));
    assert(p.entries.get("code5999 \t字5999")?.t === 5999 && p.maxSeq === 1000 + 5999, String(p.maxSeq));
  });
  it("crc 错了那一段不读（同 LevelDB：不把垃圾当词）", () => {
    const f = log([["ni \t你", "c=1 d=1 t=1"]], 1);
    const bad = f.data.slice(); bad[bad.length - 1] ^= 0xff;
    assert(parseUserdbFiles([f]).entries.size === 1);
    assert(parseUserdbFiles([{ name: f.name, data: bad }]).entries.size === 0);
  });
  it("crc32c = 标准值（RFC 3720 的全零 32 字节）", () => { assert(crc32c(new Uint8Array(32)) === 0x8a9136aa, crc32c(new Uint8Array(32)).toString(16)); });
  it("新日志的编号比目录里谁都大；空目录也不撞 MANIFEST-000001", () => {
    assert(logFileName(parseUserdbFiles(real())) === "000012.log");
    assert(logFileName(emptyParsed()) === "000002.log");
  });
  it("值的形状照 RIME 自己的写法", () => { assert(packValue({ c: 2, d: 0.5, t: 7 }) === "c=2 d=0.5 t=7"); assert(parseValue("c=2 d=1.5e-05 t=7")?.d === 1.5e-5); assert(parseValue("garbage") === null); });
});
describe("rime-userdb · 合并", () => {
  const cur = () => ({ entries: new Map([["a \tA", { c: 3, d: 2, t: 10 }], ["b \tB", { c: 1, d: 1, t: 10 }]]), tick: 10, maxSeq: 5, maxFile: 3 });
  it("灌：新词进、次数和新鲜度取大、t = 这本词库现在的时钟；这边已经更强的不写", () => {
    const plan = planLoad(cur(), { "a \tA": [1, 0.5], "b \tB": [4, 3], "c \tC": [2, 1] });
    assert(!plan.has("a \tA"), "这边更强");
    assert(plan.get("b \tB")?.c === 4 && plan.get("b \tB")?.d === 3 && plan.get("b \tB")?.t === 10);
    assert(plan.get("c \tC")?.c === 2 && plan.get("c \tC")?.t === 10);
  });
  it("新鲜度按各自的时钟衰减", () => { assert(decayed({ c: 1, d: 1, t: 0 }, 200) < 0.37 && decayed({ c: 1, d: 1, t: 200 }, 200) === 1); });
  it("delta：只有新词和这次用过的（c / t 变了）", () => {
    const base = { luna: cur() };
    const now = { luna: { ...cur(), tick: 12, entries: new Map([["a \tA", { c: 3, d: 2, t: 10 }], ["b \tB", { c: 2, d: 1.5, t: 11 }], ["n \tN", { c: 1, d: 1, t: 12 }]]) } };
    const d = deltaOf(now, base);
    assert(!("a \tA" in d.luna), "没用过的不算");
    assert(d.luna["b \tB"][0] === 2 && d.luna["n \tN"][0] === 1);
    assert(Object.keys(deltaOf(base, base)).length === 0, "没变 = 空");
  });
  it("并集：按键取大；坏形状跳过", () => {
    const m = mergeEntries({ luna: { "a \tA": [1, 3] } }, { luna: { "a \tA": [2, 1], "x \tX": "bad" }, other: { "o \tO": [1, 1] } });
    assert(m.luna["a \tA"][0] === 2 && m.luna["a \tA"][1] === 3 && !("x \tX" in m.luna) && m.other["o \tO"][0] === 1);
  });
});
