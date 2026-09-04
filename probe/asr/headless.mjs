// probe/asr/headless.mjs —— 桌面 headless Chromium 跑三档模型：加载/建器耗时、wasm 堆、RTF、渲染进程 VmHWM 峰值。
// 用法：node probe/asr/headless.mjs [slug…]（默认三档）。静态起服：仓库根 + /models/ → ../20260903 PWA Models。
// PROBE_URL=https://…/dev/probe/asr/index.html 则打线上页（模型源用页面默认 = pwa-models Pages）。
// created 2026-09-03 by Claude Fable 5.1
import { createRequire } from "node:module";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const wpRequire = createRequire(new URL("../../../20260524 WeebPaint/package.json", import.meta.url));
const { chromium } = wpRequire("playwright");
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MODELS = fileURLToPath(new URL("../../../20260903 PWA Models", import.meta.url));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".wav": "audio/wav" };
const SLUGS = process.argv.slice(2).length ? process.argv.slice(2) : ["zipformer-streaming-zh-14M-int8-20230223", "dolphin-base-ctc-int8-20250402", "sense-voice-small-int8-20240717"];

const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const fs = p.startsWith("/models/") ? join(MODELS, p.slice(8)) : join(ROOT, p);
  try { const b = await readFile(fs); res.writeHead(200, { "content-type": MIME[extname(fs)] || "application/octet-stream", "access-control-allow-origin": "*" }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;

function rendererPeaks(rootPid) {
  const ps = execSync("ps -e -o pid=,ppid=,args=").toString().trim().split("\n").map((l) => { const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/); return { pid: +m[1], ppid: +m[2], args: m[3] }; });
  const kids = new Set([rootPid]); let grew = true;
  while (grew) { grew = false; for (const p of ps) if (kids.has(p.ppid) && !kids.has(p.pid)) { kids.add(p.pid); grew = true; } }
  const out = [];
  for (const p of ps) if (kids.has(p.pid) && p.args.includes("--type=renderer")) {
    try { const s = execSync(`cat /proc/${p.pid}/status`).toString(); const g = (k) => +(s.match(new RegExp(k + ":\\s+(\\d+)")) || [0, 0])[1] / 1024; out.push({ pid: p.pid, rssMB: Math.round(g("VmRSS")), peakMB: Math.round(g("VmHWM")) }); } catch {}
  }
  return out;
}

function pidsOf(pattern) {
  return execSync("ps -e -o pid=,ppid=,args=").toString().trim().split("\n").map((l) => { const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/); return { pid: +m[1], ppid: +m[2], args: m[3] }; }).filter((p) => pattern.test(p.args));
}
const before = new Set(pidsOf(/chrom/i).map((p) => p.pid));
const browser = await chromium.launch();
// 这版 playwright 没有 browser.process()：启动前后对比进程表，新出现且父进程不在新集合里的 chromium 进程 = 根。
const fresh = pidsOf(/chrom/i).filter((p) => !before.has(p.pid)); const freshIds = new Set(fresh.map((p) => p.pid));
const rootPid = (fresh.find((p) => !freshIds.has(p.ppid)) || fresh[0]).pid;
const rows = [];
for (const slug of SLUGS) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const t0 = Date.now(); let result = null;
  page.on("console", (m) => { const t = m.text(); if (t.startsWith("PROBE_RESULT ")) result = JSON.parse(t.slice(13)); else if (process.env.VERBOSE) console.log("  [page]", t.slice(0, 200)); });
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  const url = process.env.PROBE_URL ? `${process.env.PROBE_URL}?auto=${slug}&wav=zh` : `http://127.0.0.1:${port}/probe/asr/index.html?auto=${slug}&base=/models&wav=zh`;
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__probeResult || window.__probeError, null, { timeout: 900_000 });
  const peaks = rendererPeaks(rootPid);
  const peak = Math.max(0, ...peaks.map((p) => p.peakMB));
  rows.push({ slug, wallS: ((Date.now() - t0) / 1000).toFixed(1), packMB: result?.packMB, fetchMs: result?.packFetchMs, sha256Ms: result?.packHashMs, fsWriteMs: result?.packWriteMs, createMs: result?.createMs, wasmHeapMB: result?.memAfterDecode?.wasmHeapMB, jsHeapMB: result?.memAfterDecode?.jsHeapMB, rendererPeakRssMB: peak, decodeMs: result?.wav?.zh?.ms, rtf: result?.wav?.zh?.rtf, text: result?.wav?.zh?.text, error: result?.error });
  console.log(JSON.stringify(rows[rows.length - 1]));
  await ctx.close();
}
await browser.close(); srv.close();
console.log("\n| 模型 | 包 MB | 下载 ms (sha256 / 写FS) | 建器 ms | wasm 堆 MB | 渲染进程峰值 RSS MB | 5.6s 音频 ms | RTF | 文本 |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.slug} | ${r.packMB} | ${r.fetchMs} (${r.sha256Ms} / ${r.fsWriteMs}) | ${r.createMs} | ${r.wasmHeapMB} | ${r.rendererPeakRssMB} | ${r.decodeMs} | ${r.rtf} | ${r.error ? "ERR " + r.error : r.text} |`);
