// 节点默认名 / 显示名（src/project/naming.ts）。created 2026-09-10 by Claude Fable 5.1
import { describe, it, eq } from "./runner.mjs";
const { chineseNumeral, chapterName, nextChapterName, nodeDisplayName, parseNumeral, chapterNumberOf } = await import("../src/project/naming.ts");

describe("project/naming · 第 N 章按语言生成、汉字数字、显示名去 .txt", () => {
  it("汉字数字", () => {
    const cases = { 1: "一", 2: "二", 9: "九", 10: "十", 11: "十一", 19: "十九", 20: "二十", 21: "二十一", 99: "九十九", 100: "一百", 101: "一百零一", 110: "一百一十", 111: "一百一十一", 200: "二百", 1000: "一千", 1001: "一千零一", 1010: "一千零一十", 1100: "一千一百", 9999: "九千九百九十九" };
    for (const [n, want] of Object.entries(cases)) eq(chineseNumeral(Number(n)), want, `n=${n}`);
    eq(chineseNumeral(0), "0"); eq(chineseNumeral(10000), "10000");
  });
  it("parseNumeral / chapterNumberOf：汉字、阿拉伯、Chapter N 都认", () => {
    for (const [s, n] of [["一", 1], ["十", 10], ["十二", 12], ["二十", 20], ["二十一", 21], ["一百零一", 101], ["一百一十", 110], ["九千九百九十九", 9999], ["12", 12], ["两", 2]]) eq(parseNumeral(s), n, s);
    eq(parseNumeral("abc"), null); eq(parseNumeral(""), null);
    eq(chapterNumberOf("第三章.txt"), 3); eq(chapterNumberOf("第 12 章.txt"), 12); eq(chapterNumberOf("Chapter 7.txt"), 7); eq(chapterNumberOf("序章.txt"), null); eq(chapterNumberOf("第三章-初稿.txt"), null);
  });
  it("chapterName（默认语言 zh）/ nextChapterName 按语义续号（最大章号 + 1），不数文件个数；撞名往后", () => {
    eq(chapterName(1), "第一章"); eq(chapterName(12), "第十二章");
    eq(nextChapterName([]), "第一章.txt");
    eq(nextChapterName(["第一章.txt"]), "第二章.txt");
    eq(nextChapterName(["第一章.txt", "她推开门。.txt", "路人.txt"]), "第二章.txt", "非章节名不算数（以前会数成第四章）");
    eq(nextChapterName(["序章.txt", "第二章.txt", "第三章.TXT"]), "第四章.txt");
    eq(nextChapterName(["第一章.txt", "Chapter 5.txt"]), "第六章.txt", "英文章名也续");
    eq(nextChapterName(["第一章.txt", "第三章.txt"]), "第四章.txt", "最大值 + 1，不填洞");
  });
  it("nodeDisplayName 只剥 .txt", () => { eq(nodeDisplayName("第一章.txt"), "第一章"); eq(nodeDisplayName("图.jpg"), "图.jpg"); eq(nodeDisplayName("a.TXT"), "a"); });
});
