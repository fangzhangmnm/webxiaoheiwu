// 端到端同步测试台（node 侧）：真 app + 真 IndexedDB + 内存假云，两个浏览器上下文 = 两台设备。created 2026-09-29 by Claude Fable 5.1
//   用法：node test/e2e-sync/run.mjs（不进 npm test：要起无头浏览器，几十秒）。
//   假云 = `@internal/store/testing` 的 createMockProvider（库自带的测试替身）；浏览器里的 app 经 test/e2e-sync/bridge.ts 把云端调用转过来。
import { createRequire } from "node:module";
import http from "node:http";
import { readFile, writeFile, rm, mkdir, cp, symlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createMockProvider } from "@internal/store/testing";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const wpRequire = createRequire(new URL("../../../20260524 WeebPaint/package.json", import.meta.url));
const { chromium } = wpRequire("playwright");
const WORK = join(ROOT, "tmp", "e2e-sync");
const KV = "webxiaoheiwu-7c2e9a41b3d05f68:";

/** 把产品源码拷一份、只换 app-store.ts 里造 provider 的那一行，打成测试 bundle。 */
export async function buildBundle() {
  await rm(WORK, { recursive: true, force: true });
  await mkdir(WORK, { recursive: true });
  await cp(join(ROOT, "src"), join(WORK, "src"), { recursive: true });
  await symlink(join(ROOT, "vendor"), join(WORK, "vendor"), "dir");   // 源码里的 ../vendor/… 相对路径照旧解析
  await cp(join(ROOT, "test", "e2e-sync", "bridge.ts"), join(WORK, "src", "e2e-bridge.ts"));
  const p = join(WORK, "src", "app-store.ts");
  let s = await readFile(p, "utf8");
  const re = /const od = createOneDriveProvider\([^\n]*\);/;
  if (!re.test(s)) throw new Error("app-store.ts: provider line not found — harness needs updating");
  s = s.replace(re, "const od = createBridgeProvider() as unknown as ReturnType<typeof createOneDriveProvider>;");
  s = `import { createBridgeProvider } from "./e2e-bridge.ts";\n` + s;
  await writeFile(p, s);
  execFileSync(join(ROOT, "tools/esbuild/esbuild"), [join(WORK, "src/app.ts"), "--bundle", "--format=esm", "--target=es2020", "--log-level=warning", `--outfile=${join(WORK, "app.mjs")}`], { cwd: ROOT, stdio: "inherit" });
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".png": "image/png", ".webmanifest": "application/manifest+json" };
export async function startServer() {
  const srv = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
    try {
      if (p === "/service-worker.js") { res.writeHead(404); res.end(); return; }   // 测试不要 SW 缓存
      if (p === "/index.html") {
        const html = (await readFile(join(ROOT, "index.html"), "utf8")).replace(/src="\.\/dist\/xiaoheiwu-[a-z0-9-]+\.mjs"/, 'src="./tmp/e2e-sync/app.mjs"');
        res.writeHead(200, { "content-type": MIME[".html"] }); res.end(html); return;
      }
      const b = await readFile(join(ROOT, p)); res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" }); res.end(b);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${srv.address().port}/index.html`, close: () => srv.close() };
}

// ── 线上编码（与 bridge.ts 对偶）──
const encW = (v) => { if (v === undefined) return { __u: true }; if (v == null || typeof v !== "object") return v; if (v instanceof Uint8Array) return { __b64: Buffer.from(v).toString("base64") }; if (v instanceof ArrayBuffer) return { __b64: Buffer.from(new Uint8Array(v)).toString("base64") }; if (Array.isArray(v)) return v.map(encW); const o = {}; for (const [k, x] of Object.entries(v)) o[k] = encW(x); return o; };
const decW = (v) => { if (v == null || typeof v !== "object") return v; if (Array.isArray(v)) return v.map(decW); if ("__u" in v) return undefined; if (typeof v.__b64 === "string") return new Uint8Array(Buffer.from(v.__b64, "base64")); const o = {}; for (const [k, x] of Object.entries(v)) o[k] = decW(x); return o; };

/** 一朵云 + 若干设备。cloud.provider = 内存云盘本体（测试可直接查 / 注入延迟）。 */
export async function createWorld() {
  const provider = createMockProvider();
  const gate = { delayMs: 0, holdUploads: null };   // holdUploads: Promise —— 上传在到达云端前先等它（模拟慢上传，用来在上传窗口里打字）
  const browser = await chromium.launch();
  const log = [];
  async function handle(op, json) {
    try {
      const args = decW(JSON.parse(json));
      if (gate.delayMs) await new Promise((r) => setTimeout(r, gate.delayMs));
      if (op === "upload" && gate.holdUploads) await gate.holdUploads;
      if ((op === "download") && gate.holdDownloads) await gate.holdDownloads;
      let r = await provider[op](...args);
      if (r instanceof Blob) r = new Uint8Array(await r.arrayBuffer());
      log.push(op + " " + (typeof args[0] === "string" ? args[0] : ""));
      return JSON.stringify({ ok: encW(r) });
    } catch (e) { return JSON.stringify({ err: { message: String(e?.message ?? e), status: e?.status, name: e?.name } }); }
  }
  async function device(tag, opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: opts.width ?? 1100, height: opts.height ?? 800 }, deviceScaleFactor: 1 });
    await ctx.exposeFunction("__e2eCloud", handle);
    await ctx.addInitScript((kv) => { try { localStorage.setItem(kv + "imeEnabled", "0"); } catch {} }, KV);   // 无头打字走裸字母
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`[${tag}] console.error: ${m.text()}`); });
    const dev = {
      tag, page, ctx, errors,
      async boot(url) { await page.goto(url, { waitUntil: "load" }); await page.waitForFunction(() => !!window.__xhw && (window.__xhw.editor.canEdit() || window.__xhw.project.active()), null, { timeout: 20000 }); await page.waitForTimeout(500); },
      wait: (ms) => page.waitForTimeout(ms),
      eval: (fn, arg) => page.evaluate(fn, arg),
      text: () => page.evaluate(() => document.getElementById("editor").value),
      /** 在编辑器末尾打字（真键盘事件 → input → 200ms 本地落盘）。 */
      async type(s) { await page.evaluate(() => { const e = document.getElementById("editor"); e.focus(); e.setSelectionRange(e.value.length, e.value.length); }); await page.keyboard.type(s); },
      pushNow: () => page.evaluate(() => (window.__xhw.project.active() ? window.__xhw.project.pushNow() : window.__xhw.editor.pushNow())),
      /** 等冲突面出来并点某个按钮（按文案正则）。 */
      async resolveGate(labelRe, timeout = 8000) {
        await page.waitForFunction(() => !document.getElementById("gateSheet").classList.contains("hidden") && document.querySelectorAll("#gateActions button").length > 0, null, { timeout });
        const labels = await page.evaluate(() => [...document.querySelectorAll("#gateActions button")].map((b) => b.textContent));
        const ok = await page.evaluate((src) => { const b = [...document.querySelectorAll("#gateActions button")].find((x) => new RegExp(src).test(x.textContent ?? "")); if (!b) return false; b.click(); return true; }, labelRe.source);
        if (!ok) throw new Error(`gate button ${labelRe} not found; have: ${labels.join(" | ")}`);
        return labels;
      },
      gateShown: () => page.evaluate(() => !document.getElementById("gateSheet").classList.contains("hidden")),
      listBackup: () => page.evaluate(async () => (await window.__xhw.store().files.listBackup()).map((b) => ({ name: b.name, side: b.side, ts: b.ts }))),
      close: () => ctx.close(),
    };
    return dev;
  }
  return {
    provider, gate, log, device,
    /** 云端某路径的字节（没有 → null）。 */
    async cloudBytes(path) { const it = await provider.getItemByPath(path); if (!it) return null; const b = await provider.download(it.ref); return new Uint8Array(b instanceof Blob ? await b.arrayBuffer() : b); },
    async cloudText(path) { const b = await this.cloudBytes(path); return b ? new TextDecoder().decode(b) : null; },
    async cloudList(folder = "") { return (await provider.list(folder)).map((i) => ({ name: i.name, path: i.path, isFolder: !!i.isFolder, size: i.size, eTag: i.eTag })); },
    close: () => browser.close(),
  };
}

export function makeChecker() {
  const results = [];
  const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : "  ← " + detail}`); };
  return { check, results, failed: () => results.filter((r) => !r.ok).length };
}
