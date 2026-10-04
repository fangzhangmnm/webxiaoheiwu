// 开发工具：软键盘延迟探针——抬手 → 候选更新 / 下一帧 / 上屏进正文，各段耗时；输入法 worker 每种往返的耗时；主线程长任务（≥ 50 ms）落在哪。
//   created 2026-10-04 by Claude Opus 5.5（user「我希望键盘反应尽量灵敏，不要被阻塞，不要卡。高实时要求」「关键是软键盘不应该被app卡」）。不进 bundle。
//   用法：node tools/kb-latency.mjs [CPU 降速倍数，缺省 4]（先 build）。场景：短稿 / 3 万字 txt / 书（7 页各 3 万字，每个词后停 260 ms 触发本地落盘）。
//   iPhone SE2 视口 + 触屏；14 键/秒快打 nihao 空格 women 空格 zoule 空格。降速 4 倍大致是中档手机；数是相对的，看改动前后比。
import { createRequire } from "node:module";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("..", import.meta.url)), THROTTLE = Number(process.argv[2] ?? 4);
const { chromium } = createRequire(join(ROOT, "../20260524 WeebPaint/package.json"))("playwright");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const srv = http.createServer(async (req, res) => { let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html"; try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" }); res.end(b); } catch { res.writeHead(404); res.end(); } });
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const browser = await chromium.launch();
for (const [docChars, book] of [[200, false], [30000, false], [30000, true]]) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
  await page.waitForFunction(() => !!window.__xhw && window.__xhw.editor.canEdit(), null, { timeout: 20000 }); await page.evaluate(() => window.__xhw.fontReady);
  await page.waitForTimeout(2500);
  const er = await page.evaluate(() => { const r = document.getElementById("editor").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 30 }; });
  await page.touchscreen.tap(er.x, er.y); await page.waitForTimeout(500);
  if (book) {
    await page.evaluate(async () => { document.getElementById("libraryButton").click(); });
    await page.waitForTimeout(900);
    await page.click("#galleryNewBtn"); await page.waitForTimeout(200);
    await page.evaluate(() => [...document.querySelectorAll(".popup-menu button")].find((b) => /新建书/.test(b.textContent ?? "")).click()); await page.waitForTimeout(400);
    await page.click("#sheetConfirm"); await page.waitForTimeout(1500);
    // 再加 6 页、每页 3 万字（整本 ≈ 21 万字），模拟一本写了一阵的书
    await page.evaluate(() => { const line = "她推开门，看见窗外的雨。他说：“我们走吧。”\n"; const big = line.repeat(1400); const ss = window.__xhw.project.session(); for (let i = 0; i < 6; i++) ss.spawn(`第${i + 2}章.txt`, big); window.__xhw.project.jump("目录.txt"); });
    await page.waitForTimeout(500);
    const er2 = await page.evaluate(() => { const r = document.getElementById("editor").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 30 }; });
    await page.touchscreen.tap(er2.x, er2.y); await page.waitForTimeout(500);
  }
  await page.evaluate((n) => { const e = document.getElementById("editor"); const line = "她推开门，看见窗外的雨。他说：“我们走吧。”\n"; e.value = line.repeat(Math.ceil(n / line.length)).slice(0, n); e.dispatchEvent(new Event("input", { bubbles: true })); e.setSelectionRange(e.value.length, e.value.length); }, docChars);
  await page.waitForTimeout(1500);
  // 仪表：抬手时刻 / 候选 DOM 变 / 下一帧 / 正文 input / RIME 往返 / 长任务
  await page.evaluate(() => {
    const L = window.__lat = { ups: [], cand: [], frame: [], input: [], rpc: [], long: [] };
    const kb = document.querySelector("#imeDock .ime-keys");
    kb.addEventListener("pointerup", () => L.ups.push(performance.now()), true);
    new MutationObserver(() => { const t = performance.now(); L.cand.push(t); requestAnimationFrame(() => L.frame.push(performance.now())); }).observe(document.querySelector("#imeDock .ime-cands"), { childList: true, subtree: true, characterData: true });
    document.getElementById("editor").addEventListener("input", () => L.input.push(performance.now()));
    const b = window.__xhw.ime.backend; const orig = b.call.bind(b);
    b.call = async (name, ...a) => { const t = performance.now(); try { return await orig(name, ...a); } finally { L.rpc.push([name, performance.now() - t]); } };
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) L.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask", buffered: false }); } catch {}
  });
  const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  const keyPos = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#imeDock .ime-key")].map((k) => { const r = k.getBoundingClientRect(); return [k.getAttribute("aria-label") ?? k.textContent, { x: r.left + r.width / 2, y: r.top + r.height / 2 }]; })));
  const seq = [..."nihao", "空格", ..."women", "空格", ..."zoule", "空格"];
  for (const k of seq) { const p = keyPos[k]; await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(k === "空格" && book ? 260 : 70); }   // ~14 键/秒的快打；书：每个词后停 260 ms（够触发本地落盘防抖）
  await page.waitForTimeout(1500);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const L = await page.evaluate(() => window.__lat);
  // 每次抬手之后的第一次候选变动 / 下一帧 / input
  const after = (arr, t, until) => arr.find((x) => x >= t && x < until);
  const rows = L.ups.map((t, i) => { const until = L.ups[i + 1] ?? Infinity; const c = after(L.cand, t, until + 400), f = after(L.frame, t, until + 400), inp = after(L.input, t, until + 400); return { key: seq[i], cand: c ? Math.round(c - t) : null, frame: f ? Math.round(f - t) : null, input: inp && seq[i] === "空格" ? Math.round(inp - t) : null }; });
  const med = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
  const max = (xs) => Math.max(...xs.filter((x) => x != null));
  const rpcBy = {}; for (const [n, d] of L.rpc) (rpcBy[n] ??= []).push(d);
  console.log(`\n=== ${book ? "BOOK page" : "txt"} ${docChars} chars, CPU ×${THROTTLE}, ${seq.length} taps @70ms`);
  console.log("per key (ms after lift):", rows.map((r) => `${r.key}:${r.cand ?? "-"}/${r.frame ?? "-"}${r.input != null ? " in" + r.input : ""}`).join("  "));
  console.log(`candidates updated: median ${med(rows.map((r) => r.cand))} max ${max(rows.map((r) => r.cand))}; next frame: median ${med(rows.map((r) => r.frame))} max ${max(rows.map((r) => r.frame))}; commit→text: ${rows.filter((r) => r.input != null).map((r) => r.input).join(", ")}`);
  console.log("RIME calls:", Object.entries(rpcBy).map(([n, ds]) => `${n}×${ds.length} median ${med(ds.map(Math.round))}ms max ${Math.round(Math.max(...ds))}ms`).join(" | "));
  const t0 = L.ups[0] ?? 0; console.log("long tasks (>50ms) [start rel. first lift, dur]:", L.long.length ? L.long.map(([st, d]) => `@${Math.round(st - t0)}:${d}`).join(", ") : "none", " lifts @", L.ups.map((t) => Math.round(t - t0)).join(","));
  await ctx.close();
}
await browser.close(); srv.close();
