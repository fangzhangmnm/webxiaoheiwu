// 长图排版纯函数（src/export/long-image.ts）：折行规矩 + 切片规矩，用假量尺（CJK 20 宽、拉丁 10 宽、空格 5 宽）。created 2026-09-30 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
import { wrapText, planLongImage } from "../src/export/long-image.ts";

const cjkRe = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef\u2018-\u201f\u2026]/;
const widthOf = (text) => [...text].reduce((a, c) => a + (c === " " ? 5 : cjkRe.test(c) ? 20 : 10), 0);
const m = { width: (text) => widthOf(text), ascent: (st) => ({ asc: st.sizePx * 0.88, desc: st.sizePx * 0.24 }) };
const style = { family: "x", sizePx: 20, color: "#000" };

describe("export/long-image · wrapText", () => {
  it("CJK 逐字折；拉丁按词折；折行点的空格不带到下一行开头；段首空格照留", () => {
    eq(wrapText("一二三四五六七", 100, style, m).join("|"), "一二三四五|六七");
    eq(wrapText("ab cd ef gh", 55, style, m).join("|"), "ab cd |ef gh");   // 折行点空格挂上一行末尾
    eq(wrapText("一二三四五 六七", 100, style, m).join("|"), "一二三四五|六七");   // 空格正好卡在断点 → 丢
    eq(wrapText("  缩进两格", 1000, style, m)[0], "  缩进两格");
    eq(wrapText("", 100, style, m).join("|"), "");
  });
  it("避头：句号 / 闭引号挂在本行末尾（宁可略出界）；避尾：开引号推到下一行", () => {
    eq(wrapText("一二三四五。六", 100, style, m).join("|"), "一二三四五。|六");
    eq(wrapText("一二三四「五六」", 100, style, m).join("|"), "一二三四|「五六」");
  });
  it("一个词比整行还宽 → 按字符断", () => {
    eq(wrapText("abcdefghijkl", 50, style, m).join("|"), "abcde|fghij|kl");
  });
});

describe("export/long-image · planLongImage 切片", () => {
  const look = { family: "x", fontPx: 20, lineHeight: 40, innerWidth: 468, paper: "#fff", ink: "#000", inkSoft: "#222", muted: "#888", rule: "#ccc", ruleY: 32 };
  const spec = (sections, extra = {}) => ({ title: "书", date: "20260930", cover: null, sections, look, sliceLabel: (i, n) => `${i}/${n}`, ...extra });
  it("短文一张；页脚只印书名；字数按 CJK / 拉丁分别数", () => {
    const p = planLongImage(spec([{ kind: "text", heading: "一", text: "你好 world" }]), m);
    eq(p.slices.length, 1); eq(p.totalHeight, p.slices[0].h, "不切时 totalHeight = 那一张的高"); eq(p.slices[0].w, 750, "默认宽 750"); eq(p.slices[0].hasImage, false); eq(p.cjk, 2); eq(p.en, 1); eq(p.textPages, 1); eq(p.imagePages, 0);
    const foot = p.slices[0].ops.filter((o) => o.op === "text").pop(); eq(foot.text, "书");
    assert(p.slices[0].ops.some((o) => o.op === "line"), "写字线");
  });
  it("默认不切（一张到底，totalHeight 报实高）；给了 maxSliceHeight 才切：只在行间切、每张高 ≤ 上限、章节名后面至少跟两行、页脚印 i/n", () => {
    const text = Array.from({ length: 200 }, (_, i) => `第${i}行`).join("\n");
    const sections = [{ kind: "text", heading: "章", text }, { kind: "text", heading: "尾章", text: "一\n二\n三" }];
    const one = planLongImage(spec(sections), m); eq(one.slices.length, 1, "默认一张"); assert(one.totalHeight > 5000, "200 行，一张很高"); eq(one.slices[0].h, one.totalHeight);
    const p = planLongImage(spec(sections), m, { maxSliceHeight: 2000 });
    assert(p.slices.length > 1, "切了"); eq(p.totalHeight, one.totalHeight, "切了 totalHeight 仍是整张的高");
    for (const s of p.slices) assert(s.h <= 2000, `slice too tall: ${s.h}`);
    const last = p.slices[p.slices.length - 1]; const texts = last.ops.filter((o) => o.op === "text").map((o) => o.text);
    eq(texts[texts.length - 1], `书 · ${p.slices.length}/${p.slices.length}`);
    // 章节名「尾章」不在任何一张的末尾（它后面至少跟两行）
    for (const s of p.slices) { const ts = s.ops.filter((o) => o.op === "text").map((o) => o.text); const i = ts.indexOf("尾章"); if (i >= 0) assert(ts.length - 1 - i >= 3, "heading orphaned: " + ts.slice(i).join("|")); }
  });
  it("图片页原位、不拆；封面铺满首屏（太高的裁中段）", () => {
    const img = { blob: {}, w: 1000, h: 500 }, tall = { blob: {}, w: 500, h: 2000 };
    const p = planLongImage(spec([{ kind: "text", heading: "一", text: "字" }, { kind: "image", heading: null, image: img }], { cover: tall }), m);
    const imgs = p.slices.flatMap((s) => s.ops.filter((o) => o.op === "image"));
    eq(imgs.length, 2); eq(imgs[0].w, 750); eq(imgs[0].h, 1125, "封面 ≤ 1.5 × 宽"); assert(imgs[0].crop, "太高的封面裁中段"); eq(imgs[1].w, 650); eq(imgs[1].h, 325); eq(p.imagePages, 1); eq(p.slices[0].hasImage, true, "有图的张 → 调用方走 JPEG");
  });
});
