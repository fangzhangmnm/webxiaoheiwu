// 开发工具：无头 chromium 截图图库屏（三种视口），给排版调试看。用法：node tools/screenshot-gallery.mjs → tmp/gallery-<w>x<h>.png
// created 2026-09-10 by Claude Fable 5.1（借 test/boot-smoke.mjs 的静态起服 + WeebPaint 的 playwright）。不进 bundle。
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
  try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;
const browser = await chromium.launch();
const sizes = process.argv.slice(2).length ? process.argv.slice(2).map((s) => s.split("x").map(Number)) : [[1280, 800], [820, 1180], [400, 800]];
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 });
  // 造两篇稿 + 一个夹（本地物化，无云）
  await page.click("#editor"); await page.keyboard.type("第一篇 hello"); await page.waitForTimeout(700);
  await page.evaluate(async () => { await window.__xhw.editor.newDoc(); }); await page.click("#editor"); await page.keyboard.type("第二篇 world"); await page.waitForTimeout(700);
  await page.click("#menuButton"); await page.waitForTimeout(1200);
  await page.screenshot({ path: `tmp/gallery-${w}x${h}.png` });
  const info = await page.evaluate(() => {
    const g = document.querySelector("#galleryMount .gallery-grid"); const t = document.querySelector("#galleryMount .gallery-tile");
    const cs = g ? getComputedStyle(g) : null;
    return { grid: cs ? { display: cs.display, cols: cs.gridTemplateColumns, gap: cs.gap } : null, tile: t ? t.getBoundingClientRect().toJSON() : null, tiles: document.querySelectorAll("#galleryMount .gallery-tile").length, thumbH: document.querySelector("#galleryMount .gallery-tile-thumb")?.getBoundingClientRect().height };
  });
  console.log(`${w}x${h}`, JSON.stringify(info));
  await ctx.close();
}
await browser.close(); srv.close();
