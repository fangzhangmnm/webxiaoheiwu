// 长图排版纯函数（src/export/long-image.ts）：折行规矩 + 切片规矩，用假量尺（CJK 20 宽、拉丁 10 宽、空格 5 宽）。created 2026-09-30 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
import { estimateLongImageHeight, wrapText, planLongImage } from "../src/export/long-image.ts";

const cjkRe = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef\u2018-\u201f\u2026]/;
const widthOf = (text) => [...text].reduce((a, c) => a + (c === " " ? 5 : cjkRe.test(c) ? 20 : 10), 0);
const m = { width: (text) => widthOf(text), ascent: (st) => ({ asc: st.sizePx * 0.88, desc: st.sizePx * 0.24 }), ink: (st) => ({ asc: st.sizePx * 0.8, desc: st.sizePx * 0.1 }) };
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
  const look = { family: "x", paper: "#fff", ink: "#000", inkSoft: "#222", muted: "#888", rule: "#ccc" };
  // 假量尺 CJK 20 宽 → 像素/字 20 时一字一格；每行 20 字 → 正文 400 宽、边距 28、图宽 456；行距 2 → 行高 40
  const spec = (sections, extra = {}) => ({ title: "书", date: "20260930", cover: null, sections, look, typeset: { charsPerLine: 20, pxPerChar: 20, lineHeightRatio: 2 }, sliceLabel: (i, n) => `${i}/${n}`, ...extra });
  it("短文一张；页脚只印书名；字数按 CJK / 拉丁分别数", () => {
    const p = planLongImage(spec([{ kind: "text", heading: "一", text: "你好 world" }]), m);
    eq(p.slices.length, 1); eq(p.totalHeight, p.slices[0].h, "不切时 totalHeight = 那一张的高"); eq(p.width, 456, "图宽 = 字数 × 像素/字 + 2 × 1.4 字"); eq(p.slices[0].w, 456); eq(p.slices[0].hasImage, false); eq(p.cjk, 2); eq(p.en, 1); eq(p.textPages, 1); eq(p.imagePages, 0);
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
    eq(imgs.length, 2); eq(imgs[0].w, 456); eq(imgs[0].h, 684, "封面 ≤ 1.5 × 宽"); assert(imgs[0].crop, "太高的封面裁中段"); eq(imgs[1].w, 400); eq(imgs[1].h, 200); eq(p.imagePages, 1); eq(p.slices[0].hasImage, true, "有图的张 → 调用方走 JPEG");
  });
  it("front: false（这一页 / 这一支）→ 没有封面、书名、日期，从章节名直接开始；页脚小字仍是 title", () => {
    const tall = { blob: {}, w: 500, h: 2000 }; const sections = [{ kind: "text", heading: "一", text: "字" }];
    const full = planLongImage(spec(sections, { cover: tall }), m), bare = planLongImage(spec(sections, { cover: tall, front: false, title: "书 · 一" }), m);
    const texts = (p) => p.slices.flatMap((s) => s.ops.filter((o) => o.op === "text").map((o) => o.text));
    assert(texts(full).includes("书") && texts(full).includes("20260930"), "整本有书名和日期");
    eq(bare.slices.flatMap((s) => s.ops.filter((o) => o.op === "image")).length, 0, "no cover");
    eq(texts(bare).join("|"), "一|字|书 · 一", "章节名 → 正文 → 页脚");
    assert(bare.totalHeight < full.totalHeight - 600, "少了封面那一屏");
  });
  it("注音字体（annotate）：每一行画的是 annotate 的结果，拿到的前后文 = 同一段上一行的尾 / 下一行的头；折行和量宽用原文；不给就原样", () => {
    const text = "一二三四五六七八九十一二三四五六七八九十甲乙丙丁戊己庚辛壬癸甲乙丙丁戊己庚辛壬癸子丑寅卯";   // 44 字 → 20 / 20 / 4
    const calls = [];
    const p = planLongImage(spec([{ kind: "text", heading: "章", text }], { annotate: (b, line, a) => { calls.push([b, line, a]); return line + "*"; } }), m);
    const texts = p.slices.flatMap((s) => s.ops.filter((o) => o.op === "text").map((o) => o.text));
    const bodyCalls = calls.filter((c) => /^[一甲子]/.test(c[1]));
    eq(bodyCalls.length, 3); eq(bodyCalls.map((c) => [...c[1]].length).join(), "20,20,4", "wrapped on the plain text");
    eq(JSON.stringify(bodyCalls.map((c) => [c[0], c[2]])), JSON.stringify([["", "甲乙丙丁戊己"], ["五六七八九十", "子丑寅卯"], ["戊己庚辛壬癸", ""]]));
    assert(texts.includes("章*") && texts.includes("书*") && texts.includes("子丑寅卯*"), "title, heading and body all go through annotate: " + texts.join("|"));
    const plain = planLongImage(spec([{ kind: "text", heading: "章", text }]), m).slices.flatMap((s) => s.ops.filter((o) => o.op === "text").map((o) => o.text));
    assert(plain.includes("章") && plain.includes("子丑寅卯") && !plain.some((t) => t.endsWith("*")));
  });
  it("子节目录：正文后空一行、一节一行、链接色；纯目录页不空那一行；没有 link 色就用墨色", () => {
    const lookL = { ...look, link: "#7a3d14" };
    const p = planLongImage(spec([{ kind: "text", heading: "总", text: "正文", toc: [{ label: "甲" }, { label: "乙" }] }, { kind: "text", heading: "甲", text: "一" }], { look: lookL }), m);
    const ops = p.slices.flatMap((s) => s.ops.filter((o) => o.op === "text"));
    const body = ops.find((o) => o.text === "正文"), a = ops.find((o) => o.text === "甲" && o.style.color === "#7a3d14"), b = ops.find((o) => o.text === "乙");
    assert(body && a && b, ops.map((o) => o.text).join("|")); eq(b.style.color, "#7a3d14");
    eq(a.y - body.y, 2 * (b.y - a.y), "one blank line between body and toc"); assert(b.y > a.y);
    const q = planLongImage(spec([{ kind: "text", heading: "目录", text: "", toc: [{ label: "甲" }] }, { kind: "text", heading: "甲", text: "一" }]), m);
    const tq = q.slices.flatMap((s) => s.ops.filter((o) => o.op === "text")); const row = tq.filter((o) => o.text === "甲")[0];
    eq(row.style.color, look.ink, "no link colour given → ink"); assert(row.y < tq.filter((o) => o.text === "甲")[1].y, "toc row comes before the child's own heading");
  });
  it("落款印在页脚（书名 · 落款 · 第几张）；有封面图时书名压在图上、底下垫半透明的纸、图下面不再印书名；coverTitle 只换封面上的名字", () => {
    const img = { blob: {}, w: 600, h: 900 };
    const p = planLongImage(spec([{ kind: "text", heading: "一", text: "字" }], { cover: img, title: "书 · 第一章", coverTitle: "第一章", date: null, stamp: "2026-10-01 03:12 导出" }), m);
    const ops = p.slices[0].ops; const texts = ops.filter((o) => o.op === "text").map((o) => o.text);
    assert(texts.includes("书 · 第一章 · 2026-10-01 03:12 导出"), "footer: " + texts.join("|"));
    const iImg = ops.findIndex((o) => o.op === "image"), pads = ops.filter((o) => o.op === "rect" && o.alpha === 0.78);
    assert(iImg >= 0 && pads.length >= 1 && ops.indexOf(pads[0]) > iImg, "pads drawn after the image");
    const imgOp = ops[iImg]; const onCover = ops.filter((o) => o.op === "text" && o.y > imgOp.y && o.y < imgOp.y + imgOp.h).map((o) => o.text).join("");
    eq(onCover, "第一章", "cover carries coverTitle, one glyph per op"); eq(texts.filter((x) => x === "书 · 第一章").length, 0, "the title is not printed again under the image");
    const sliced = planLongImage(spec([{ kind: "text", heading: null, text: Array.from({ length: 200 }, () => "行").join("\n") }], { stamp: "S" }), m, { maxSliceHeight: 2000 });
    assert(sliced.slices.length > 1 && sliced.slices[0].ops.some((o) => o.op === "text" && o.text === `书 · S · 1/${sliced.slices.length}`), "sliced footer");
  });
  it("estimateLongImageHeight（导出前报「长图约多高」）：纯汉字的稿子和真排的高度一样——有 / 无封面图、不带书名段、章节名、目录、图片页、片尾空行", () => {
    const ts = { charsPerLine: 20, pxPerChar: 20, lineHeightRatio: 2 };
    const text = ("国".repeat(47) + "\n").repeat(9) + "\n" + "国".repeat(20);
    const img = { blob: {}, w: 1000, h: 500 }, tall = { blob: {}, w: 500, h: 2000 };
    const cases = [
      { front: true, cover: null, sections: [{ kind: "text", heading: "一", text }, { kind: "text", heading: null, text: "国" }] },
      { front: true, cover: tall, sections: [{ kind: "text", heading: "目录", text: "", toc: [{ label: "甲" }, { label: "乙" }] }, { kind: "text", heading: "甲", text, toc: [{ label: "乙" }] }, { kind: "image", heading: null, image: img }] },
      { front: false, cover: null, sections: [{ kind: "text", heading: "一", text }, { kind: "image", heading: null, image: tall }, { kind: "text", heading: "二", text: "国" }] },
      { front: false, cover: null, sections: [{ kind: "text", heading: null, text }] },
    ];
    for (const [k, c] of cases.entries()) {
      const real = planLongImage(spec(c.sections, { cover: c.cover, front: c.front, typeset: ts }), m);
      const est = estimateLongImageHeight({ title: "书", date: "20260930", front: c.front, cover: c.cover ? { w: c.cover.w, h: c.cover.h } : null, sections: c.sections.map((s) => (s.kind === "text" ? s : { kind: "image", w: s.image.w, h: s.image.h })) }, ts);
      eq(est.width, real.width, `case ${k} width`); eq(est.height, real.totalHeight, `case ${k} height`);
    }
  });
  it("每行字数只管折行，像素/字只管缩放：同一段字，20 字/行下 40 px/字的图宽是 20 px/字的两倍，行数相同；行距跟档走", async () => {
    const text = "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十";   // 30 字 → 20 字/行 = 2 行
    const m2 = { width: (t) => [...t].reduce((a, c) => a + (c === " " ? 10 : cjkRe.test(c) ? 40 : 20), 0), ascent: (st) => ({ asc: st.sizePx * 0.88, desc: st.sizePx * 0.24 }), ink: (st) => ({ asc: st.sizePx * 0.8, desc: st.sizePx * 0.1 }) };
    const a = planLongImage(spec([{ kind: "text", heading: null, text }]), m);
    const b = planLongImage(spec([{ kind: "text", heading: null, text }], { typeset: { charsPerLine: 20, pxPerChar: 40, lineHeightRatio: 2 } }), m2);
    const bodyLines = (p) => p.slices[0].ops.filter((o) => o.op === "text" && /^[一二三四五六七八九十]+$/.test(o.text)).length;
    eq(b.width, a.width * 2); eq(bodyLines(a), 2); eq(bodyLines(b), 2);
    const c = planLongImage(spec([{ kind: "text", heading: null, text }], { typeset: { charsPerLine: 10, pxPerChar: 20, lineHeightRatio: 2 } }), m);
    const { typesetFor } = await import("../src/export/long-image.ts");
    eq(typesetFor(14).lineHeightRatio, 1.9); eq(typesetFor(20).lineHeightRatio, 1.75); eq(typesetFor(28).lineHeightRatio, 1.6, "行距跟档走（user 2026-09-30）");
    // 注音带只往上加：行高 +0.5 字，汉字离行底的距离不变（基线 = 行底 − 同一个数）
    const plain = planLongImage(spec([{ kind: "text", heading: null, text: "一二三\n四五六" }]), m), ruby = planLongImage(spec([{ kind: "text", heading: null, text: "一二三\n四五六" }], { typeset: { charsPerLine: 20, pxPerChar: 20, lineHeightRatio: 2, rubyBand: 0.5 } }), m);
    const ys = (p) => p.slices[0].ops.filter((o) => o.op === "text" && /^[一二三四五六]+$/.test(o.text)).map((o) => o.y);
    eq(ys(plain)[1] - ys(plain)[0], 40); eq(ys(ruby)[1] - ys(ruby)[0], 50, "行高 = 基准 40 + 注音带 10");
    const lines = (p) => p.slices[0].ops.filter((o) => o.op === "line").map((o) => o.y1);
    eq(lines(plain)[0] - ys(plain)[0], lines(ruby)[0] - ys(ruby)[0], "写字线离基线的距离不变");
    eq(bodyLines(c), 3, "10 字/行 → 3 行");
  });
});
