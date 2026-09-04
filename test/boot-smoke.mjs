// headless 启动冒烟：静态起服 → chromium 无头开页 → 断言 boot 链 / DOM 接线 / sheet / 零页面错误。created 2026-09-03 by Claude Fable 5.1
// playwright 借 WeebPaint devDep（家规：能自己验的先自己验完，不转嫁真机）。用法：npm run smoke（需先 build）。
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
  try {
    const b = await readFile(join(ROOT, p));
    res.writeHead(200, { "Content-Type": MIME[extname(p)] ?? "application/octet-stream" });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : "  " + detail}`); };

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") pageErrors.push("console.error: " + m.text()); });
try {
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 });
  check("boot：window.__xhw 出现", true);
  const version = await page.evaluate(() => window.__xhw.version);
  check("版本水印", /^v\d+\.\d+\.\d+-\d{4}-\d{2}-\d{2}$/.test(version), version);
  await page.waitForTimeout(800);
  const editable = await page.evaluate(() => { const e = document.getElementById("editor"); return !!e && !e.disabled && !e.classList.contains("locked"); });
  check("编辑器可编辑（无头浏览器不保证初始焦点，真机由用户点一下）", editable);
  const status = await page.textContent("#saveStatus");
  check("状态栏有文案", !!status && status.length > 0, status);
  const missingUse = await page.evaluate(() => {
    const ids = new Set([...document.querySelectorAll("symbol")].map((s) => s.id));
    return [...document.querySelectorAll("use")].map((u) => (u.getAttribute("href") || "").slice(1)).filter((id) => !ids.has(id));
  });
  check("所有 <use> 都有 symbol", missingUse.length === 0, missingUse.join(","));
  await page.click("#menuButton");
  await page.waitForTimeout(300);
  check("抽屉打开", await page.evaluate(() => !document.getElementById("drawer").classList.contains("hidden")));
  const emptyText = await page.textContent("#docListEmpty");
  check("列表空态文案", !!emptyText, emptyText);
  await page.click("#openSettingsButton");
  await page.waitForTimeout(200);
  check("设置视图显示 + 登录钮", await page.evaluate(() => !document.getElementById("settingsView").hidden && !!document.querySelector("#authRow button")));
  check("版本显示在设置页", (await page.textContent("#settingsBuild")).includes(version));
  await page.click("#drawerCloseButton");
  await page.waitForTimeout(200);
  // 新稿：打字 → 本地物化（无云）→ 抽屉里出现一条
  await page.click("#editor");
  await page.keyboard.type("hello smoke");
  await page.waitForTimeout(900);
  await page.click("#menuButton");
  await page.waitForTimeout(600);
  const rows = await page.evaluate(() => document.querySelectorAll("#docList .doc-row").length);
  check("打字后本地物化：列表出现 1 篇", rows === 1, `rows=${rows}`);
  await page.click("#drawerCloseButton");
  // 通用 sheet：多选 → 点第一项 → resolve
  const picked = await page.evaluate(async () => {
    const p = window.__xhw.choice("t", "m", [{ label: "A", value: 1 }, { label: "B", value: 2 }]);
    await new Promise((r) => setTimeout(r, 50));
    document.querySelector("#sheetChoices button").click();
    return await p;
  });
  check("choice sheet 可用", picked === 1, String(picked));
  // 确认 sheet：只有标题+文案+两个钮，输入框必须真的不显示（2026-09-03 user 截图：「强制更新？」露出两个密码框）
  const confirmShape = await page.evaluate(async () => {
    const p = window.__xhw.confirm("t", "m");
    await new Promise((r) => setTimeout(r, 50));
    const disp = (id) => getComputedStyle(document.getElementById(id)).display;
    const shape = { input: disp("sheetInput"), input2: disp("sheetInput2"), message: disp("sheetMessage"), choices: disp("sheetChoices") };
    document.getElementById("sheetCancel").click();
    return { ...shape, result: await p };
  });
  check("confirm sheet 形状：输入框隐藏、文案可见、取消→false", confirmShape.input === "none" && confirmShape.input2 === "none" && confirmShape.message !== "none" && confirmShape.choices === "none" && confirmShape.result === false, JSON.stringify(confirmShape));
  // 加密：设置密码（sheet 两次输入）→ 文档被加密（isEncrypted）
  const encOk = await page.evaluate(async () => {
    const st = window.__xhw.editor.state;
    if (!st.name) return "no doc";
    const toggle = document.getElementById("cryptoToggle");
    const p = new Promise((resolve) => {
      const tick = setInterval(async () => {
        const sheet = document.getElementById("sheet");
        if (!sheet.classList.contains("hidden")) {
          clearInterval(tick);
          document.getElementById("sheetInput").value = "smoke-password-1";
          document.getElementById("sheetInput2").value = "smoke-password-1";
          document.getElementById("sheetConfirm").click();
          for (let i = 0; i < 100; i++) { await new Promise((r) => setTimeout(r, 200)); if (window.__xhw.editor.state.encrypted) return resolve("encrypted"); }
          resolve("timeout");
        }
      }, 100);
    });
    toggle.click();
    return await p;
  });
  check("加密流程（设密码 → 7z 容器落地）", encOk === "encrypted", String(encOk));
  // 新建即加密（user 2026-09-03「加密是一开始就定好的」）：密码已在内存 → newDoc({encrypted}) 直接成 → 打字物化 → 文件落地就是密文
  const bornEncrypted = await page.evaluate(async () => {
    const ok = await window.__xhw.editor.newDoc({ encrypted: true });
    if (!ok) return "newDoc refused";
    if (!window.__xhw.editor.state.encrypted || window.__xhw.editor.state.name) return "pending state wrong";
    const ed = document.getElementById("editor"); ed.focus(); ed.value = "born encrypted"; ed.dispatchEvent(new Event("input"));
    for (let i = 0; i < 50; i++) { await new Promise((r) => setTimeout(r, 200)); if (window.__xhw.editor.state.name) break; }
    const st = window.__xhw.editor.state;
    if (!st.name) return "not materialized";
    let enc = false;
    for (let i = 0; i < 25 && !enc; i++) { enc = await window.__xhw.store().file(st.name, { isZip: false, mode: "existing" }).isEncrypted(); if (!enc) await new Promise((r) => setTimeout(r, 200)); }
    return st.encrypted && enc ? "born-encrypted" : `flag=${st.encrypted} file=${enc}`;
  });
  check("新建即加密：物化那一刻就是密文", bornEncrypted === "born-encrypted", String(bornEncrypted));
  await page.waitForTimeout(500);
  check("零页面错误", pageErrors.length === 0, pageErrors.join(" | "));
} catch (e) {
  check("smoke 异常", false, String(e));
} finally {
  await browser.close();
  srv.close();
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\nboot smoke: ${failed.length} failed` : "\nboot smoke 全过");
process.exit(failed.length ? 1 : 0);
