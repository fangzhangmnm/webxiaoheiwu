// 导出封面的书名排版（src/export/cover-title.ts）。created 2026-10-01 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
import { layoutCoverTitle } from "../src/export/cover-title.ts";
import { planCover, coverTypo } from "../src/ui/book-cover.ts";

const cjk = /[\u3400-\u9fff]/;
const width = (text, size) => [...text].reduce((a, c) => a + (cjk.test(c) || c.codePointAt(0) > 0x2e80 ? size : size * 0.5), 0);
const ink = (size) => ({ asc: size * 0.8, desc: size * 0.08 });
const wrap = (text, maxW, size) => { const out = []; let cur = ""; for (const w of text.split(" ")) { const t = cur ? cur + " " + w : w; if (width(t, size) > maxW && cur) { out.push(cur); cur = w; } else cur = t; } out.push(cur); return out; };
const lay = (title, extra = {}) => layoutCoverTitle({ title, date: "20261001", W: 200, H: 283, spine: true, width, ink, wrap, ...extra });
const s = (...cp) => String.fromCodePoint(...cp);

describe("export/cover-title", () => {
  it("规则和书架封面同一份：coverTypo = planCover 的竖横与字号档", () => {
    for (const name of ["20261001-" + s(0x6c14, 0x7403), "My Long English Title", s(0x6c14, 0x7403) + " AI", "20261001-0aa9"]) { const p = planCover(name), t = coverTypo(p.title); eq(t.vertical, p.vertical); eq(t.size, p.size); }
  });
  it("汉字书名竖排：从右上角起一字一格往下，格距相等；字号 = 宽度的 17%（五字以内）；都在封面里；日期在左下、装订线在左", () => {
    const title = s(0x6c14, 0x7403, 0x5192, 0x9669, 0x5bb6); const L = lay(title);
    assert(L.vertical && !L.truncated); eq(L.size, 34); eq(L.cells.map((c) => c.text).join(""), title);
    const xs = new Set(L.cells.map((c) => c.x.toFixed(2))); eq(xs.size, 1, "one column");
    const dy = L.cells.slice(1).map((c, i) => +(c.y - L.cells[i].y).toFixed(3)); assert(new Set(dy).size === 1 && dy[0] > 34, "equal pitch: " + dy.join());
    assert(L.cells[0].x + 34 <= 200 && L.cells[0].x > 200 * 0.7 && L.cells.at(-1).y < 283 - 200 * 0.15, "inside the cover, at the right");
    assert(L.date && L.date.text === "20261001" && L.date.x > L.spineW && L.date.y > 283 * 0.85); assert(L.spineW > 5 && L.spineW < 15);
    eq(lay(title, { spine: false }).spineW, 0);
  });
  it("排不下一列 → 往左换列；再排不下 → 缩字号；实在不行才截断", () => {
    const long = s(0x56fd).repeat(14); const L = lay(long);
    const cols = [...new Set(L.cells.map((c) => c.x.toFixed(1)))].map(Number); assert(cols.length >= 2 && cols[0] > cols[1], "columns go right to left: " + cols.join());
    eq(L.cells.length, 14); assert(L.cells.every((c) => c.x >= L.spineW && c.x + c.size <= 200 + 0.01 && c.y <= 283), "inside");
    const huge = lay(s(0x56fd).repeat(400)); assert(huge.truncated && huge.cells.length < 400 && huge.size < 20, `size ${huge.size}, ${huge.cells.length} cells`);
  });
  it("竖排里的拉丁：一两个字符立着放进一格（放不下缩小）；更长的侧躺；括号转 90°；逗号挪到右上只占半格；空格 = 一小段空", () => {
    const L = lay(s(0x6211, 0x7684) + "AI" + s(0x52a9, 0x624b));   // 我的AI助手
    const ai = L.cells.find((c) => c.text === "AI"); assert(ai && !ai.rotate && ai.size <= L.size, JSON.stringify(ai));
    const L2 = lay(s(0x6211, 0x7684) + "Robot" + s(0x670b, 0x53cb)); const r = L2.cells.find((c) => c.text === "Robot"); eq(r.rotate, 90);
    const L3 = lay(s(0x300a, 0x6c14, 0x7403, 0x300b)); eq(L3.cells[0].rotate, 90); eq(L3.cells[1].rotate, undefined); eq(L3.cells[3].rotate, 90);
    const L4 = lay(s(0x6c14, 0x7403, 0xff0c, 0x5192, 0x9669)); const gaps = L4.cells.slice(1).map((c, i) => c.y - L4.cells[i].y);
    assert(L4.cells[2].x > L4.cells[1].x, "comma sits to the right"); assert(L4.cells[3].y - L4.cells[1].y < 2 * (L4.cells[1].y - L4.cells[0].y), "comma takes less than a full cell: " + gaps.join());
    const L5 = lay(s(0x6c14, 0x7403) + " " + s(0x5192, 0x9669)); const g = L5.cells.slice(1).map((c, i) => c.y - L5.cells[i].y); assert(g[1] > g[0], "a space leaves a gap");
  });
  it("换列的避头尾：收尾的括号挂在上一列的列尾，不到下一列的列首；起头的括号不留在列尾", () => {
    // 高度正好放 6 格：国×5 + （ + 国 + ） → 「（」连同后面的字换到第二列；再试 国×6 + ）→ 「）」挂在第一列尾
    const g = s(0x56fd); const H = 200 * 0.09 + 200 * 0.15 + 6 * (200 * 0.14 * 1.08) + 1;
    const A = layoutCoverTitle({ title: g.repeat(5) + s(0xff08) + g + s(0xff09) + g, date: null, W: 200, H, spine: false, width, ink, wrap });
    const colOf = (L, i) => L.cells[i].rotate ? Math.round(L.cells[i].x + L.cells[i].size * 0.38) : Math.round(L.cells[i].x + L.cells[i].size / 2);
    eq(A.cells[5].text, s(0xff08)); assert(colOf(A, 5) < colOf(A, 4) && colOf(A, 5) === colOf(A, 6), "opening bracket moved to the next column with its follower");
    const B = layoutCoverTitle({ title: g.repeat(5) + s(0xff08) + g.repeat(5) + s(0xff09) + g, date: null, W: 200, H, spine: false, width, ink, wrap });
    const close = B.cells.findIndex((c) => c.text === s(0xff09)); assert(colOf(B, close) === colOf(B, close - 1), "closing bracket stays with the column it closes");
  });
  it("不留孤字：一列差一个字排不下时缩一档字号，而不是把最后一个字单独甩到下一列", () => {
    const t = s(0x6c14, 0x7403, 0x5192, 0x9669, 0x5bb6);   // 五个字，注音字体下格距变大，17% 那一档只放得下四个
    const L = lay(t, { ruby: 0.42 }); eq(new Set(L.cells.map((c) => c.x.toFixed(1))).size, 1, "one column"); assert(L.size < 34 && !L.truncated, String(L.size));
    eq(L.cells.length, 5);
  });
  it("拉丁为主的书名横排：左上角起、按词折行、不转；注音字体多留拼音的高度", () => {
    const L = lay("The Balloon Adventurer and the Glacier"); assert(!L.vertical && L.cells.length >= 2 && L.cells.every((c) => !c.rotate && Math.abs(c.x - L.cells[0].x) < 0.01));
    eq(L.cells.map((c) => c.text).join(" "), "The Balloon Adventurer and the Glacier"); assert(L.cells[0].x < 200 * 0.3 && L.cells[0].y < 283 * 0.3);
    const t = s(0x6c14, 0x7403, 0x5192, 0x9669, 0x5bb6), a = lay(t), b = lay(t, { ruby: 0.42 });
    assert(b.cells[1].y - b.cells[0].y > a.cells[1].y - a.cells[0].y, "ruby band widens the pitch");
    assert(a.cells[1].before === s(0x6c14) && a.cells[1].after === s(0x5192, 0x9669, 0x5bb6), "each cell carries its context for reading selection");
  });
});
