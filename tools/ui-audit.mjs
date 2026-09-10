// 开发工具：无头 chromium 走一遍 2.0 UI 流程，逐步截图到 tmp/ui/。用法：node tools/ui-audit.mjs [宽x高 ...]。created 2026-09-10 by Claude Fable 5.1。不进 bundle。
import { createRequire } from "node:module";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
const wpRequire = createRequire(new URL("../../20260524 WeebPaint/package.json", import.meta.url));
const { chromium } = wpRequire("playwright");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" }); res.end(b); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;
const browser = await chromium.launch();
const sizes = process.argv.slice(2).length ? process.argv.slice(2).map((s) => s.split("x").map(Number)) : [[1280, 800], [400, 800]];
const errors = [];
for (const [w, h] of sizes) {
  const tag = `${w}x${h}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
  const shot = (name) => page.screenshot({ path: `tmp/ui/${tag}-${name}.png` });
  const wait = (ms) => page.waitForTimeout(ms);
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 });
  await page.click("#editor"); await page.keyboard.type("第一篇：她推开门。他在窗边。窗外是雨。"); await wait(700);
  await shot("01-editor-txt");
  await page.evaluate(async () => { await window.__xhw.editor.newDoc(); }); await page.click("#editor"); await page.keyboard.type("第二篇 world"); await wait(700);
  // 图库
  await page.click("#menuButton"); await wait(1200); await shot("02-gallery");
  console.log(tag, "top element at center:", await page.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e ? `${e.tagName.toLowerCase()}#${e.id}.${[...e.classList].join(".")}` : null; }), "| top-bar covered:", await page.evaluate(() => { const tb = document.querySelector(".top-bar").getBoundingClientRect(); const e = document.elementFromPoint(tb.left + tb.width / 2, tb.top + tb.height / 2); return !!e?.closest("#galleryFull"); }));
  await page.click("#galleryNewBtn"); await wait(300); await shot("03-gallery-newmenu");
  await page.keyboard.press("Escape"); await wait(200);
  // 新建工程：走菜单 → sheet
  await page.click("#galleryNewBtn"); await wait(200);
  await page.evaluate(() => { const it = [...document.querySelectorAll("button")].find((b) => /新建工程/.test(b.textContent ?? "")); if (!it) throw new Error("new-project menu item not found"); it.click(); }); await wait(400);
  await shot("04-newproject-sheet");
  await page.fill("#sheetInput", "夏音"); await page.click("#sheetConfirm"); await wait(1200);
  await shot("05-project-editor-wide");
  if (w < 900) { await page.click("#edgeToggle"); await wait(300); await shot("05b-narrow-sidebar-open"); }   // 窄屏默认收起，先开
  // 工程：写 + spawn
  await page.click("#editor"); await page.keyboard.type("她推开门。他在窗边。窗外是雨。"); await wait(300);
  // 探针：工程模式退格 / 输入法挂到边栏输入框 / 宽屏 toggle 真收起（user 2026-09-10 三条）
  { const before = await page.inputValue("#editor"); await page.keyboard.press("End"); await page.keyboard.press("Backspace"); await wait(100);
    const after = await page.inputValue("#editor"); console.log(tag, "backspace in project:", after.length === before.length - 1 ? "ok" : `FAIL (${before.length}→${after.length})`);
    await page.keyboard.type("。"); }
  { await page.click("#edgeSearch"); await page.keyboard.type("nihao"); await wait(300);
    const comp = await page.evaluate(() => { const c = document.getElementById("candidateBar"); return c ? getComputedStyle(c).display !== "none" && (c.textContent ?? "").trim().length > 0 : false; });
    const raw = await page.inputValue("#edgeSearch"); console.log(tag, "ime on edgeSearch:", comp || raw === "" ? "ok" : `FAIL (value=${JSON.stringify(raw)})`);
    await page.keyboard.press("Escape"); await page.fill("#edgeSearch", ""); }
  if (w >= 900) { await page.click("#edgeToggle"); await wait(200);
    const hidden = await page.evaluate(() => { const r = document.querySelector(".page").getBoundingClientRect(); return getComputedStyle(document.getElementById("edgeSidebar")).display === "none" && Math.abs(r.left - (innerWidth - r.width) / 2) < 2; });   // 收起后纸面回到居中
    console.log(tag, "wide sidebar toggle:", hidden ? "ok" : "FAIL"); await shot("05c-wide-sidebar-collapsed"); await page.click("#edgeToggle"); await wait(200); }
  await page.evaluate(() => { const el = document.getElementById("editor"); el.focus(); el.setSelectionRange(0, 5); });
  await page.keyboard.press("Control+Enter"); await wait(400); await shot("06-spawn-sheet");
  await page.click("#sheetConfirm"); await wait(600); await shot("07-after-spawn");
  await page.click("#edgeBack"); await wait(400); await shot("08-back-to-source");
  await page.fill("#edgeAddInput", "祭祀线"); await page.press("#edgeAddInput", "Enter"); await wait(300);
  await page.fill("#edgeSearch", "窗边"); await wait(300); await shot("09-sidebar-search");
  await page.fill("#edgeSearch", ""); await wait(200);
  await page.click("#edgeBacklinks"); await wait(300); await shot("10-sidebar-backlinks");
  await page.click("#edgeBacklinks"); await wait(200);
  await page.click(".edge-row .edge-more"); await wait(300); await shot("11-sidebar-rowmenu");
  await page.keyboard.press("Escape"); await wait(200);
  if (w < 900) { await page.click("#edgeToggle"); await wait(300); await shot("12-narrow-sidebar-collapsed"); }
  // 回图库：工程卡片 + 卡片菜单 + 回收站 + 设置抽屉叠图库
  await page.click("#menuButton"); await wait(1200); await shot("13-gallery-with-project");
  await page.click(".gallery-tile:not(.folder) .gallery-tile-menu-btn"); await wait(300); await shot("14-tile-menu");
  await page.mouse.click(w - 40, h - 40); await wait(200);   // 点空白关卡片菜单（Escape 会关整个图库）
  await page.click("#galleryTrashBtn"); await wait(800); await shot("15-trash-view");
  await page.click("#galleryTrashBack"); await wait(500);
  await page.click("#gallerySettingsBtn"); await wait(500); await shot("16-settings-over-gallery");
  await page.click("#drawerCloseButton"); await wait(300);
  await page.click("#galleryBack"); await wait(400); await shot("17-back-to-editor");
  await ctx.close();
}
await browser.close(); srv.close();
console.log(errors.length ? "PAGE ERRORS:\n" + errors.join("\n") : "no page errors");
