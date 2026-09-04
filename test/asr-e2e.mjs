// 离线语音 e2e（headless Chromium，不在 npm test 里——要下模型包）：设置页改模型源→点「下载语音包」→等「已就绪」→经 worker 解码 zh.wav 验文本。
// 用法：npm run e2e:asr [slug…]（默认 zh-14M + SenseVoice）。本地起服：仓库根 + /models/ → ../20260903 PWA Models。需先 build。
// created 2026-09-03 by Claude Fable 5.1
import { createRequire } from "node:module";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const wpRequire = createRequire(new URL("../../20260524 WeebPaint/package.json", import.meta.url));
const { chromium } = wpRequire("playwright");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MODELS = fileURLToPath(new URL("../../20260903 PWA Models", import.meta.url));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".wav": "audio/wav", ".css": "text/css" };
const KEYS = process.argv.slice(2).length ? process.argv.slice(2) : ["local-zh14m", "local-sensevoice"];

const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const fs = p.startsWith("/models/") ? join(MODELS, p.slice(8)) : join(ROOT, p);
  try { const b = await readFile(fs); res.writeHead(200, { "content-type": MIME[extname(fs)] || "application/octet-stream" }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;
const browser = await chromium.launch();
let failed = 0;
for (const key of KEYS) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (process.env.VERBOSE) console.log("  [page]", m.text().slice(0, 160)); });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__xhw?.asr, null, { timeout: 30_000 });
  // 设置页：开语音 → 选模型 → 模型源指向本地 → 下载
  await page.evaluate(() => { window.__xhw.drawer.open("settings"); document.getElementById("voiceConfigSection").open = true; });
  await page.waitForTimeout(400);   // 抽屉动画
  await page.evaluate((key) => {
    const sel = document.getElementById("voiceModelSelect"); sel.value = key; sel.dispatchEvent(new Event("change"));
    const src = document.getElementById("voiceSourceInput"); src.value = "/models"; src.dispatchEvent(new Event("change"));
  }, key);
  await page.waitForFunction(() => !document.getElementById("voicePackDownload").hidden && !document.getElementById("voicePackDownload").disabled, null, { timeout: 10_000 });
  const t0 = Date.now();
  await page.click("#voicePackDownload", { force: true });
  await page.waitForFunction(() => /已就绪|失败/.test(document.getElementById("voicePackStatus").textContent), null, { timeout: 600_000 });
  const statusText = await page.textContent("#voicePackStatus");
  const dlS = ((Date.now() - t0) / 1000).toFixed(1);
  // 经 worker 解码内置 wav（麦克风无头没有；这里验 worker/缓存/挂载/解码整条链）
  const r = await page.evaluate(async (key) => {
    const { asr, models } = window.__xhw; const m = models[key];
    const ab = await (await fetch("./probe/asr/wav/zh.wav")).arrayBuffer();
    const dv = new DataView(ab); let p = 12, data = null;
    while (p + 8 <= dv.byteLength) { const id = String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3)); const sz = dv.getUint32(p + 4, true); if (id === "data") { data = new Int16Array(ab, p + 8, sz / 2); break; } p += 8 + sz + (sz & 1); }
    const f = new Float32Array(data.length); for (let i = 0; i < f.length; i++) f[i] = data[i] / 32768;
    const st = await asr.status(m.slug);
    const load = await asr.load(m.slug, "zh");
    const dec = await asr.decode(f, "zh");
    return { st, load, dec };
  }, key);
  const ok = r.st.ready && !!r.dec.text && errors.length === 0 && /已就绪/.test(statusText);
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${key}: pack "${statusText}" in ${dlS}s · load ${r.load.createMs} ms (wasm ${r.load.wasmHeapMB} MB) · decode ${r.dec.computeMs} ms / ${r.dec.audioMs} ms → ${r.dec.text}${errors.length ? "  PAGE ERRORS: " + errors.join(" | ") : ""}`);
  // 删除 → 状态回「未下载」
  await page.evaluate(async (key) => { const { asr, models } = window.__xhw; await asr.delete(models[key].slug); }, key);
  const after = await page.evaluate(async (key) => { const { asr, models } = window.__xhw; return asr.status(models[key].slug); }, key);
  if (after.ready || after.bytesCached !== 0) { failed++; console.log(`✗ ${key}: delete left ${after.bytesCached} bytes`); }
  await ctx.close();
}
await browser.close(); srv.close();
console.log(failed ? `\n${failed} FAILED` : "\nASR e2e 全过");
process.exit(failed ? 1 : 0);
