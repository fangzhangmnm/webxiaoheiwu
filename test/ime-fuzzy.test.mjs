// 模糊音：十对开关 → RIME 方案补丁（纯函数）。created 2026-10-19 by Claude Opus 5.5
// 真 RIME 里的效果（打 zi 出「之」、重开不重编、关掉还原、双拼 / 语句流）是浏览器探针验的，这里钉规则本身。
import { readFileSync } from "node:fs";
import { describe, it, eq as eqRaw, assert as ok } from "./runner.mjs";
const eq = (a, b, msg) => eqRaw(JSON.stringify(a), JSON.stringify(b), msg);   // runner 的 eq 是 ===，这里比的多是数组
import { FUZZY_PAIRS, normalizeFuzzy, fuzzyRules, readAlgebra, fuzzyCustomYaml, sourceSchemaYaml, fuzzyApplies, fuzzyArtifacts, isFuzzyArtifactPath } from "../src/ime-fuzzy.ts";

const contrib = (p) => readFileSync(new URL(`../vendor/rime-contrib/${p}`, import.meta.url), "utf8");
const LUNA = contrib("luna-pinyin/luna_pinyin.schema.yaml");
const MSPY = contrib("double-pinyin/double_pinyin_mspy.schema.yaml");

// 只够跑我们自己那几种算子的拼写运算模拟（RIME 的 derive = 保留原拼写再加一份改写的；xlit = 逐字换）
function spell(rules, syllables) {
  let items = syllables.map((s) => ({ spelling: s, syllable: s }));
  for (const rule of rules) {
    const [op, a, b] = rule.split("/");
    if (op === "derive") { const re = new RegExp(a); for (const it of [...items]) if (re.test(it.spelling)) items.push({ spelling: it.spelling.replace(re, b), syllable: it.syllable }); }
    else if (op === "xlit") items = items.map((it) => ({ ...it, spelling: [...it.spelling].map((c) => (a.indexOf(c) >= 0 ? b[a.indexOf(c)] : c)).join("") }));
    else throw new Error(`simulator does not know ${op}`);
  }
  return (typed) => [...new Set(items.filter((it) => it.spelling === typed).map((it) => it.syllable))].sort();
}
const SYL = ["zi", "zhi", "zen", "zeng", "zhen", "zheng", "lu", "nu", "ru", "lan", "nan", "ran", "fa", "ha", "fei", "hei", "wang", "huang", "wan", "huan", "jian", "jiang", "sen", "sheng", "shen", "seng", "jin", "jing", "ng"];

describe("ime-fuzzy", () => {
  it("偏好值清洗：认不得的丢掉、去重、按固定顺序", () => {
    eq(normalizeFuzzy(["ing-in", "zh-z", "bogus", "zh-z", 3]), ["zh-z", "ing-in"]);
    eq(normalizeFuzzy(undefined), []); eq(normalizeFuzzy("zh-z"), []);
    eq(FUZZY_PAIRS.length, 10);
  });
  it("不开 = 没有规则；开了 = 规则 + 最后一条转回小写", () => {
    eq(fuzzyRules([]), []);
    const r = fuzzyRules(["zh-z"]);
    eq(r.length, 3); ok(r.at(-1).startsWith("xlit/ABC"), r.at(-1));
  });
  it("读出方案里原有的拼写规则（全拼 12 条、微软双拼最后一条是 xlit）", () => {
    const luna = readAlgebra(LUNA); eq(luna.length, 12); eq(luna[0], "abbrev/^([a-z]).+$/$1/");
    const mspy = readAlgebra(MSPY); eq(mspy[0], "erase/^xx$/"); ok(mspy.at(-1).startsWith("xlit/QWRTY"), mspy.at(-1));
    let threw = false; try { readAlgebra("schema:\n  name: x\n"); } catch { threw = true; } ok(threw, "no speller → throws");
  });
  it("补丁 = 模糊音规则在前、原规则在后；不开 / 五笔 = 不要补丁", () => {
    eq(fuzzyCustomYaml("luna_pinyin", LUNA, []), null);
    eq(fuzzyCustomYaml("wubi86", LUNA, ["zh-z"]), null);
    const y = fuzzyCustomYaml("luna_pinyin", LUNA, ["eng-en", "zh-z"]);
    ok(y.includes("patch:\n  speller/algebra:\n"), y);
    const listed = y.split("\n").filter((l) => l.startsWith("    - ")).map((l) => JSON.parse(l.slice(6)));
    eq(listed, [...fuzzyRules(["zh-z", "eng-en"]), ...readAlgebra(LUNA)]);
  });
  it("部署用的源方案：去掉 import_preset，别的不动", () => {
    ok(/import_preset/.test(LUNA)); const s = sourceSchemaYaml(LUNA);
    ok(!/import_preset/.test(s)); eq(readAlgebra(s), readAlgebra(LUNA));
  });
  it("哪些方案适用；关掉时要删的文件含共用的 luna_pinyin prism", () => {
    ok(fuzzyApplies("luna_pinyin_fluency")); ok(fuzzyApplies("double_pinyin_pyjj")); ok(!fuzzyApplies("wubi86"));
    const a = fuzzyArtifacts(); ok(a.includes("build/luna_pinyin.prism.bin")); ok(a.includes("luna_pinyin_fluency.custom.yaml")); ok(!a.includes("build/luna_pinyin_fluency.prism.bin"));
    ok(isFuzzyArtifactPath("build")); ok(isFuzzyArtifactPath("build/luna_pinyin.prism.bin")); ok(isFuzzyArtifactPath("double_pinyin.custom.yaml"));
    ok(!isFuzzyArtifactPath("luna_pinyin.userdb/000003.log")); ok(!isFuzzyArtifactPath("user.yaml"));
  });
  it("一对开：双向", () => {
    const q = spell(fuzzyRules(["zh-z"]), SYL);
    eq(q("zi"), ["zhi", "zi"]); eq(q("zhi"), ["zhi", "zi"]);
    const w = spell(fuzzyRules(["wang-huang"]), SYL); eq(w("wang"), ["huang", "wang"]); eq(w("huang"), ["huang", "wang"]);
    const f = spell(fuzzyRules(["f-h"]), SYL); eq(f("ha"), ["fa", "ha"]); eq(f("fei"), ["fei", "hei"]);
    const an = spell(fuzzyRules(["ang-an"]), SYL); eq(an("jian"), ["jian", "jiang"]);
  });
  it("同一个位置不接力：n,l + l,r 同开，n 不会经 l 变成 r", () => {
    const q = spell(fuzzyRules(["n-l", "l-r"]), SYL);
    eq(q("nu"), ["lu", "nu"]); eq(q("ru"), ["lu", "ru"]); eq(q("lu"), ["lu", "nu", "ru"]);
  });
  it("不同位置叠加：zh,z + eng,en → zen 出 zheng；sh,s + eng,en → sen 出 sheng", () => {
    const q = spell(fuzzyRules(["zh-z", "sh-s", "eng-en"]), SYL);
    eq(q("zen"), ["zen", "zeng", "zhen", "zheng"]); eq(q("sen"), ["sen", "seng", "shen", "sheng"]);
  });
  it("n,l 不碰「嗯」(ng)", () => { const q = spell(fuzzyRules(["n-l"]), SYL); eq(q("lg"), []); eq(q("ng"), ["ng"]); });
});
