// 开发工具：量「写字线和字对不对得上」。created 2026-09-29 by Claude Fable 5.1。不进 bundle。
//   user 2026-09-29「现在稿纸的线其实还是和文字没对齐的」。手感 / 数学类问题先量再改（家规：禁止猜测式调试）：
//     输入 = 视口、设备像素比、阅读节奏（轻小说 1.9 / 标准 1.6）、字号档位；
//     输出 = 每一行「字的墨迹底边」到「它下面那条写字线」的距离（设备像素）。
//     合格 = 这个距离每一行都一样（逐行不漂），且线在字的下面（不切字脚、不悬在半空）。
//   量法：无头截图 → 解 PNG → 纸面右侧没有字的一条竖带里找线的行号、左侧有字的竖带里找每行墨迹的底边。
//   用法：node tools/ruled-audit.mjs（需先 build）。
import { createRequire } from "node:module";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
const wpRequire = createRequire(new URL("../../20260524 WeebPaint/package.json", import.meta.url));
const { chromium } = wpRequire("playwright");
const { default: UPNG } = await import("../vendor/upng/upng.esm.js");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" }); res.end(b); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${srv.address().port}/index.html`;
const browser = await chromium.launch();
const KV = "webxiaoheiwu-7c2e9a41b3d05f68:";

/** 一组条件下量一次。返回每行的 { 墨迹底边, 线, 距离 }（设备像素）。 */
async function measure({ w, h, dpr, mode, scale, paper, shot, book = false }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  await ctx.addInitScript(({ kv, scale }) => { try { localStorage.setItem(kv + "imeEnabled", "0"); if (scale !== "1") localStorage.setItem(kv + "fontScale", scale); } catch {} }, { kv: KV, scale });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__xhw && window.__xhw.editor.canEdit(), null, { timeout: 20000 });
  // 走真的设置控件（阅读节奏单选 / 稿纸宽度）：行高与线位要跟着重算
  await page.evaluate(({ mode, paper }) => { const r = document.querySelector(`#readingModePicker input[value="${mode}"]`); r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); const p = document.getElementById("paperWidthSelect"); p.value = paper; p.dispatchEvent(new Event("change")); const t = document.getElementById("wordCountToggle"); if (t.checked) t.click(); }, { mode, paper: paper ?? "mode" });
  if (!book) await page.evaluate(() => { const e = document.getElementById("editor"); e.value = Array.from({ length: 60 }, () => "国国国国").join("\n"); e.dispatchEvent(new Event("input", { bubbles: true })); e.scrollTop = 0; e.blur(); });
  if (book) {
    // 有子节的页：两行正文 + 空一行 + 三条子节链接（user 2026-09-29「章后面的超链接我也想做成就像文字一样就在线上的」）——量整个纸面容器，链接行也得坐在线上
    await page.evaluate(() => { const e = document.getElementById("editor"); e.focus(); e.value = "\u56fd\u56fd\u56fd\u56fd\n\u56fd\u56fd\u56fd\u56fd"; e.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForTimeout(500);
    await page.click("#menuButton"); await page.waitForTimeout(300); await page.click("#edgeLift"); await page.waitForTimeout(300); await page.click("#sheetConfirm"); await page.waitForTimeout(1200);
    await page.evaluate(() => window.__xhw.setSidebar(false));
    const parent = await page.evaluate(() => window.__xhw.project.current());
    for (const n of ["\u56fd\u56fd\u56fd\u4e00", "\u56fd\u56fd\u56fd\u4e8c", "\u56fd\u56fd\u56fd\u4e09"]) { await page.evaluate(({ p, n }) => { window.__xhw.project.jump(p); window.__xhw.project.newChild(n); }, { p: parent, n }); await page.waitForTimeout(200); }
    await page.evaluate((p) => { window.__xhw.project.jump(p); window.__xhw.renderPageKin(); document.activeElement?.blur(); }, parent);
  }
  await page.waitForTimeout(300);
  const box = await page.evaluate((book) => { const r = document.getElementById(book ? "pageBody" : "editor").getBoundingClientRect(); const cs = getComputedStyle(document.getElementById("editor")); return { x: r.left, y: r.top, w: r.width, h: r.height, font: parseFloat(cs.fontSize), lh: cs.lineHeight, tocRows: document.querySelectorAll("#childToc:not([hidden]) .child-toc-row").length }; }, book);
  if (shot) await page.screenshot({ path: `tmp/ui/${shot}.png` });
  const png = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.w, height: box.h } });
  await ctx.close();
  const img = UPNG.decode(png); const px = new Uint8Array(UPNG.toRGBA8(img)[0]); const W = img.width, H = img.height;
  const at = (x, y) => { const i = (y * W + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
  const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
  // 线：右侧 85%–95% 宽的竖带（没有字）里，比纸面暗一截的行
  // 线：一条没有字的竖带里，比纸面暗一截的行。正文页取右侧 85%–95%；有子节目录的页右侧有修改时间的小字，改取中间 55%–70%
  const [b0, b1] = book ? [0.55, 0.7] : [0.85, 0.95];
  const bg = lum(at(Math.floor(W * (b0 + b1) / 2), 2));
  const lineRows = [];
  for (let y = 0; y < H; y++) { let s = 0, n = 0; for (let x = Math.floor(W * b0); x < Math.floor(W * b1); x += 3) { s += lum(at(x, y)); n++; } if (bg - s / n > 6) lineRows.push({ y, depth: bg - s / n }); }
  // 合并相邻行（一条线可能跨两个设备像素行）：取最暗的那一行
  const lines = []; for (const r of lineRows) { const last = lines[lines.length - 1]; if (last && r.y - last.y1 <= 1) { last.y1 = r.y; if (r.depth > last.depth) { last.depth = r.depth; last.y = r.y; } } else lines.push({ y: r.y, y1: r.y, depth: r.depth, thick: 1 }); }
  for (const l of lines) l.thick = l.y1 - (lineRows.find((r) => r.y <= l.y && l.y - r.y <= 3 && r.y >= l.y1 - 3)?.y ?? l.y) + 1;
  // 墨迹：左侧 0–4 个字宽的竖带里有深色像素的行（字色 #555 → 亮度 < 120）
  const inkW = Math.min(W, Math.ceil(box.font * 4 * dpr));
  const inkRow = (y) => { for (let x = 0; x < inkW; x++) if (lum(at(x, y)) < 120) return true; return false; };
  const runs = []; let cur = null;
  for (let y = 0; y < H; y++) { const on = inkRow(y); if (on && !cur) cur = { top: y, bottom: y }; else if (on) cur.bottom = y; else if (cur) { runs.push(cur); cur = null; } }
  if (cur) runs.push(cur);
  // 贴着底边被裁掉半截的那一行不算（量到的是裁切线，不是字脚）
  const whole = runs.filter((r) => r.bottom < H - 2);
  const rows = whole.filter((r) => r.bottom - r.top > box.font * dpr * 0.5).map((r, i) => { const below = lines.find((l) => l.y > r.bottom - box.font * dpr * 0.25); return { i, inkBottom: r.bottom, line: below?.y ?? null, gap: below ? below.y - r.bottom : null }; })
    .filter((r) => r.gap != null && r.gap < box.font * dpr * 0.8)   // 最后一行底下那条线可能已经在框外：配到的是再下一条，不算
    .slice(0, -1);   // 屏上最后一行常被框底裁掉一截字脚（量到的是裁切线）：一律不算
  return { box, rows: book ? runs.filter((r) => r.bottom - r.top > box.font * dpr * 0.5).map((r, i) => { const below = lines.find((l) => l.y > r.bottom - box.font * dpr * 0.25); return { i, gap: below ? below.y - r.bottom : null }; }).filter((r) => r.gap != null && r.gap < box.font * dpr * 0.8) : rows, lineCount: lines.length };
}

const cases = [];
for (const dpr of [1, 1.25, 1.75, 2, 3]) for (const mode of ["novel", "classic"]) for (const scale of ["1", "1.15"]) cases.push({ w: 1100, h: 900, dpr, mode, scale });
cases.push({ w: 375, h: 667, dpr: 2, mode: "novel", scale: "1" }, { w: 744, h: 1133, dpr: 2, mode: "novel", scale: "1.15" });
// GPD Win Mini：7 寸 1920×1080，系统缩放 175% → 1097×617（全屏）/ 1097×537（装成 app 的窗口）/ 1097×480（浏览器标签页）；稿纸宽度「自动」
for (const h of [617, 537, 480]) cases.push({ w: 1097, h, dpr: 1.75, mode: "novel", scale: "1", paper: "auto", shot: `winmini-1097x${h}` });
// 有子节的页：正文两行 + 三条子节链接，链接行也要坐在线上
for (const [w, h, dpr] of [[1100, 900, 1], [744, 1133, 2], [1097, 537, 1.75], [375, 667, 3]]) cases.push({ w, h, dpr, mode: "novel", scale: "1", paper: "auto", book: true, shot: `toc-on-lines-${w}x${h}` });
let bad = 0;
for (const c of cases) {
  const m = await measure(c);
  const gaps = m.rows.map((r) => r.gap).filter((g) => g != null);
  const min = Math.min(...gaps), max = Math.max(...gaps);
  const em = m.box.font * c.dpr;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const drift = gaps.length >= 8 ? Math.abs(mean(gaps.slice(0, 4)) - mean(gaps.slice(-4))) : 0;
  const jitter = Number.isInteger(c.dpr) ? 1 : 2;   // 小数缩放比下线落在半个设备像素上，抗锯齿后「最暗的一行」会差 1
  const ok = (c.book ? gaps.length === 5 && m.box.tocRows === 3 : gaps.length >= 6) && max - min <= jitter && drift <= 0.75 && min >= 0 && max <= em * 0.34;   // 书：2 行正文 + 3 行链接 = 5 行字
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${c.book ? "[book+toc] " : ""}${c.w}x${c.h} dpr=${c.dpr} ${c.mode}${c.paper ? "/" + c.paper : ""} scale=${c.scale} drift=${drift.toFixed(2)} font=${m.box.font.toFixed(2)}px lh=${m.box.lh} lines=${gaps.length} gap(min..max)=${min}..${max} devpx (${(min / em).toFixed(2)}..${(max / em).toFixed(2)} em) first6=${gaps.slice(0, 6).join(",")} last3=${gaps.slice(-3).join(",")}`);
}
await browser.close(); srv.close();
console.log(bad ? `${bad} FAILED` : "all ok");
process.exit(bad ? 1 : 0);
