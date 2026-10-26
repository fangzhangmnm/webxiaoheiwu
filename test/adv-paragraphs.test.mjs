// 对话框模式的段落模型（src/adv/paragraphs.ts）。created 2026-10-25 by Claude Opus 5.5
import { describe, it, eq } from "./runner.mjs";
import { paragraphs, paraIndexAt, diffEdit } from "../src/adv/paragraphs.ts";

const texts = (t) => paragraphs(t).map((p) => t.slice(p.start, p.end));
const same = (a, b) => eq(JSON.stringify(a), JSON.stringify(b));   // 结构比较（本仓惯用法）

describe("adv/paragraphs · 哪一截算一段", () => {
  it("两个以上换行 = 分隔；单个换行留在段里", () => {
    same(texts("第一段\n\n第二段"), ["第一段", "第二段"]);
    same(texts("一行\n还是这一段\n\n下一段"), ["一行\n还是这一段", "下一段"]);
    same(texts("甲\n\n\n\n乙"), ["甲", "乙"]);
  });
  it("空文 = 一个空段；以分隔结尾 = 末尾一个空段（刚回车发出去的状态）；以分隔开头 = 开头一个空段", () => {
    same(paragraphs(""), [{ start: 0, end: 0 }]);
    same(texts("写完了\n\n"), ["写完了", ""]);
    same(paragraphs("写完了\n\n").at(-1), { start: 5, end: 5 });
    same(texts("\n\n开头空"), ["", "开头空"]);
  });
  it("段的区间不含分隔，拼回去逐字等于原文", () => {
    const t = "a\nb\n\nc\n\n\nd\n";
    const ps = paragraphs(t);
    let rebuilt = "";
    ps.forEach((p, i) => { rebuilt += t.slice(p.start, p.end); if (i + 1 < ps.length) rebuilt += t.slice(p.end, ps[i + 1].start); });
    eq(rebuilt, t);
    same(texts(t), ["a\nb", "c", "d\n"]);
  });
});

describe("adv/paragraphs · 光标落在第几段", () => {
  const t = "ab\n\ncd";   // [0,2) 分隔 [2,4) [4,6)
  const ps = paragraphs(t);
  it("段里、段首、段尾 = 这一段", () => {
    eq(paraIndexAt(ps, 0), 0); eq(paraIndexAt(ps, 2), 0);
    eq(paraIndexAt(ps, 4), 1); eq(paraIndexAt(ps, 6), 1);
  });
  it("落在两个换行中间 = 后一段", () => { eq(paraIndexAt(ps, 3), 1); });
  it("越界 = 最后一段", () => { eq(paraIndexAt(ps, 99), 1); });
});

describe("adv/paragraphs · 一次改字", () => {
  it("插、删、换都只剩中间那一截", () => {
    same(diffEdit("abc", "abXc"), { at: 2, del: 0, ins: "X" });
    same(diffEdit("abc", "ac"), { at: 1, del: 1, ins: "" });
    same(diffEdit("你好世界", "你好吗世界"), { at: 2, del: 0, ins: "吗" });
    same(diffEdit("aaa", "aaaa"), { at: 3, del: 0, ins: "a" });
    same(diffEdit("same", "same"), null);
  });
  it("回车：段尾插一个换行", () => { same(diffEdit("一句话", "一句话\n"), { at: 3, del: 0, ins: "\n" }); });
});
