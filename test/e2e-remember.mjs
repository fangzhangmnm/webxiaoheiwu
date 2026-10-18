// 无头 e2e：「在这台设备上记住密码」整链（真 IDB、真重载）+ CSP 零拦截。created 2026-10-17 by Claude Opus 5.5
// 用法：npm run e2e:remember（需先 build）。playwright 借 WeebPaint devDep（同 boot smoke）。
// 走一遍：首开不建库 → 设密码面板有勾、默认不勾 → 勾上 → 重开不用输、加密稿直接开 → 立即锁定 = 忘 → 重开是锁着的、不自动弹框
//   → 不勾解锁一次 → 重开仍锁着。全程任何 securitypolicyviolation = 红。
import { createRequire } from "node:module";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const wpRequire = createRequire(new URL("../../20260524 WeebPaint/package.json", import.meta.url));
const { chromium } = wpRequire("playwright");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".webmanifest": "application/manifest+json", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".map": "application/json" };
const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { "Content-Type": MIME[extname(p)] ?? "application/octet-stream" }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${srv.address().port}/index.html`;

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : "  " + detail}`); };
const PW = "e2e-remember-pw";
const t0 = Date.now();

const browser = await chromium.launch({ args: ["--disable-gpu"] });
const ctx = await browser.newContext();
await ctx.addInitScript(() => {
  try { localStorage.setItem("webxiaoheiwu-7c2e9a41b3d05f68:imeEnabled", "0"); } catch {}
  window.__csp = [];
  document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`));
});
const page = await ctx.newPage();
const pageErrors = [], csp = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") pageErrors.push("console.error: " + m.text()); });
const collectCsp = async () => { csp.push(...(await page.evaluate(() => window.__csp.splice(0)))); };
const open = async () => {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 });
  await page.evaluate(() => window.__xhw.fontReady);
  await page.waitForTimeout(1200);   // boot：恢复记着的密码 + 开上次那篇
};
const reload = async () => { await collectCsp(); await open(); };
const sheetShown = () => page.evaluate(() => !document.getElementById("sheet").classList.contains("hidden"));

try {
  await open();
  check("首开：没记过就不建库（0.2.2）", !(await page.evaluate(async () => (await indexedDB.databases()).some((d) => d.name === "webxiaoheiwu-remember"))));
  check("首开：没自动弹密码框", !(await sheetShown()));

  // 设密码：面板上有勾、默认不勾 → 勾上 → 文档加密
  const setup = await page.evaluate(async (pw) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const ed = document.getElementById("editor"); ed.focus(); ed.value = "remember me"; ed.dispatchEvent(new Event("input"));
    for (let i = 0; i < 50 && !window.__xhw.editor.state.name; i++) await wait(100);
    document.getElementById("cryptoToggle").click();
    const sheet = document.getElementById("sheet"), check = document.getElementById("sheetCheck"), box = document.getElementById("sheetCheckInput");
    for (let i = 0; i < 50 && sheet.classList.contains("hidden"); i++) await wait(100);
    const shape = { checkVisible: !check.classList.contains("hidden"), defaultChecked: box.checked, label: document.getElementById("sheetCheckLabel").textContent };
    box.checked = true;
    document.getElementById("sheetInput").value = pw; document.getElementById("sheetInput2").value = pw;
    document.getElementById("sheetConfirm").click();
    for (let i = 0; i < 100 && !window.__xhw.editor.state.encrypted; i++) await wait(100);
    for (let i = 0; i < 50 && window.__xhw.remember.until() == null; i++) await wait(100);
    await wait(2500);   // 本地自动落盘（没登录，不推云）
    return { ...shape, encrypted: window.__xhw.editor.state.encrypted, until: window.__xhw.remember.until(), name: window.__xhw.editor.state.name };
  }, PW);
  check("设密码面板有「在这台设备上记住」的勾，默认不勾", setup.checkVisible && !setup.defaultChecked && /30/.test(setup.label), JSON.stringify(setup));
  check("勾上 → 记到 30 天后", setup.encrypted && setup.until != null && Math.abs(setup.until - (t0 + 30 * 86400_000)) < 10 * 60_000, JSON.stringify(setup));

  // 重开：不用输、加密稿直接开
  await reload();
  const after = await page.evaluate(() => ({ unlocked: window.__xhw.isUnlocked(), until: window.__xhw.remember.until(), name: window.__xhw.editor.state.name, encrypted: window.__xhw.editor.state.encrypted, locked: !!window.__xhw.editor.state.locked, text: document.getElementById("editor").value }));
  check("重开：已解锁、没弹框、加密稿直接开", after.unlocked && !(await sheetShown()) && after.encrypted && !after.locked && after.text.includes("remember me"), JSON.stringify(after));
  check("重开：记到哪天没变", after.until === setup.until, `${after.until} vs ${setup.until}`);

  // 立即锁定 = 忘 → 重开是锁着的、不自动弹框
  const locked = await page.evaluate(async () => { await window.__xhw.lockNow(); return { unlocked: window.__xhw.isUnlocked(), until: window.__xhw.remember.until() }; });
  check("立即锁定：锁上 + 这台设备忘掉", !locked.unlocked && locked.until == null, JSON.stringify(locked));
  await reload();
  const afterLock = await page.evaluate(() => ({ unlocked: window.__xhw.isUnlocked(), until: window.__xhw.remember.until(), locked: !!window.__xhw.editor.state.locked }));
  check("锁定后重开：仍锁着、没自动弹框", !afterLock.unlocked && afterLock.until == null && afterLock.locked && !(await sheetShown()), JSON.stringify(afterLock));

  // 不勾解锁一次 → 重开仍锁着
  const plain = await page.evaluate(async (pw) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const p = window.__xhw.editor.open(window.__xhw.editor.state.name, { promptUnlock: true });
    const sheet = document.getElementById("sheet");
    for (let i = 0; i < 50 && sheet.classList.contains("hidden"); i++) await wait(100);
    const offered = !document.getElementById("sheetCheck").classList.contains("hidden") && !document.getElementById("sheetCheckInput").checked;
    document.getElementById("sheetInput").value = pw; document.getElementById("sheetConfirm").click();
    await p; await wait(300);
    return { offered, unlocked: window.__xhw.isUnlocked(), until: window.__xhw.remember.until() };
  }, PW);
  check("解锁面板也给勾、默认不勾；不勾 → 只这一次", plain.offered && plain.unlocked && plain.until == null, JSON.stringify(plain));
  await reload();
  check("不勾解锁后重开：锁着", !(await page.evaluate(() => window.__xhw.isUnlocked())));

  await collectCsp();
  check("全程 CSP 零拦截", csp.length === 0, csp.join(" | "));
  check("全程零页面错误", pageErrors.length === 0, pageErrors.slice(0, 5).join(" | "));
} catch (e) {
  check("e2e 跑完", false, String(e?.stack ?? e));
} finally {
  await browser.close(); srv.close();
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\ne2e-remember: ${failed.length} failed（${((Date.now() - t0) / 1000).toFixed(1)}s）` : `\ne2e-remember 全过（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
process.exit(failed.length ? 1 : 0);
