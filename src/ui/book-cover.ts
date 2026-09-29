// 书库卡片的封面：没有封面图的书 / 稿，把名字印在封面上。created 2026-09-29 by Claude Fable 5.1
//   user 2026-09-29「封面上印书名，想一想英文怎么办，以及对 yyyymmdd-name 和 yyyymmdd name 都识别。然后配色用花璃同人的那个。但是更加哑一点，
//   不要渐变，扁平，不过花璃那本旁边的装订线很漂亮，保留。然后最好下面的日期 大小也收上来？」
//   落在哪一层：图库包早就留了「宿主自己画占位封面」的口子（ui.tilePlaceholderHtml）——印书名是宿主的排版，不进包。本文件只出一段 HTML（纯函数，无 DOM）；
//   颜色 / 字号 / 装订线 / 把包里的名字行挪到封面下沿，全在 styles.css「书库封面」一节。
// 排版规则：
//   · 名字先拆日期前缀（doc-model splitDatedName）：书名印大字，日期印小字。
//   · **汉字为主 → 竖排**（从右往左一列一列）；**拉丁字母为主 → 横排**、按词折行。判据：汉字 / 假名 / 谚文的个数 × 2 ≥ 其余非空白字符的个数。
//   · 竖排里的拉丁字母：一两个字符的小串（AI、12）立起来并排放在一格里（纵中横）；更长的串照竖排惯例侧躺。
//   · 字号按字数分四档，单位是卡片宽度的百分比（窄屏三列和宽屏大卡片都合适）。
//   · 书有装订线（左侧一条）；txt 稿是一张纸，没有。
import { splitDatedName } from "../doc-model.ts";

const CJK = /[぀-ヿ㐀-鿿가-힯豈-﫿]/;
const esc = (x: string): string => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export interface CoverPlan { date: string | null; title: string; vertical: boolean; size: "xl" | "l" | "m" | "s"; coded: boolean }
/** 这个名字的封面怎么排（纯函数，测试用它）。 */
export function planCover(stem: string): CoverPlan {
  const { date, title } = splitDatedName(stem);
  const chars = [...title].filter((c) => !/\s/.test(c));
  const cjk = chars.filter((c) => CJK.test(c)).length, other = chars.length - cjk;
  const vertical = cjk > 0 && cjk * 2 >= other;
  const n = chars.length;
  const size = vertical ? (n <= 5 ? "xl" : n <= 10 ? "l" : n <= 18 ? "m" : "s") : (n <= 8 ? "xl" : n <= 20 ? "l" : n <= 40 ? "m" : "s");
  return { date, title, vertical, size, coded: date == null && /^\d{8}-/.test(title) };
}
/** 竖排正文：把一两个字符的拉丁 / 数字小串包成纵中横。 */
function verticalRuns(title: string): string {
  return title.split(/([A-Za-z0-9]+)/).map((run, i) => (i % 2 === 1 && run.length <= 2 ? `<span class="tcy">${esc(run)}</span>` : esc(run))).join("");
}
/** 占位封面的 HTML。kind: book = 书（有装订线）；draft = txt 稿（一张纸）。 */
export function coverHtml(stem: string, kind: "book" | "draft"): string {
  const p = planCover(stem);
  const cls = `xhw-cover ${kind} ${p.vertical ? "v" : "h"} sz-${p.size}${p.coded ? " coded" : ""}`;
  const title = p.vertical ? verticalRuns(p.title) : esc(p.title);
  return `<span class="${cls}"><span class="xhw-cover-title"${p.vertical ? "" : ' lang="en"'}>${title}</span>${p.date ? `<span class="xhw-cover-date">${esc(p.date)}</span>` : ""}</span>`;
}
