// 节点默认名 / 显示名（src/project/naming.ts）。created 2026-09-10 by Claude Fable 5.1
import { describe, it, eq } from "./runner.mjs";
const { chineseNumeral, chapterName, nextChapterName, nodeDisplayName } = await import("../src/project/naming.ts");

describe("project/naming · 第 N 章按语言生成、汉字数字、显示名去 .txt", () => {
  it("汉字数字", () => {
    const cases = { 1: "一", 2: "二", 9: "九", 10: "十", 11: "十一", 19: "十九", 20: "二十", 21: "二十一", 99: "九十九", 100: "一百", 101: "一百零一", 110: "一百一十", 111: "一百一十一", 200: "二百", 1000: "一千", 1001: "一千零一", 1010: "一千零一十", 1100: "一千一百", 9999: "九千九百九十九" };
    for (const [n, want] of Object.entries(cases)) eq(chineseNumeral(Number(n)), want, `n=${n}`);
    eq(chineseNumeral(0), "0"); eq(chineseNumeral(10000), "10000");
  });
  it("chapterName（默认语言 zh）/ nextChapterName 从节点数+1 起数、撞名往后", () => {
    eq(chapterName(1), "第一章"); eq(chapterName(12), "第十二章");
    eq(nextChapterName([]), "第一章.txt");
    eq(nextChapterName(["第一章.txt"]), "第二章.txt");
    eq(nextChapterName(["序章.txt", "第二章.txt", "第三章.TXT"]), "第四章.txt");
    eq(nextChapterName(["a.txt", "b.txt", "第三章.txt"]), "第四章.txt", "撞名往后");
  });
  it("nodeDisplayName 只剥 .txt", () => { eq(nodeDisplayName("第一章.txt"), "第一章"); eq(nodeDisplayName("图.jpg"), "图.jpg"); eq(nodeDisplayName("a.TXT"), "a"); });
});
