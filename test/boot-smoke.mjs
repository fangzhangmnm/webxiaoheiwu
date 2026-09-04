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
  // 每篇密码（user 2026-09-03）：改密码但「保留各自旧密码」→ 重开这篇时问「这篇稿的密码」→ 输旧密码开 → 横幅 → 「换成当前密码」→ 文件换钥匙
  const perFile = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const sheet = document.getElementById("sheet"), input = document.getElementById("sheetInput"), input2 = document.getElementById("sheetInput2"), choices = document.getElementById("sheetChoices");
    const vis = (el) => !el.classList.contains("hidden");
    const waitSheet = async () => { for (let i = 0; i < 100; i++) { if (vis(sheet) && (vis(input) || vis(choices))) return; await wait(100); } throw new Error("sheet never showed"); };
    const name = window.__xhw.editor.state.name;
    const p = window.__xhw.changePassword();
    await waitSheet(); if (!vis(input)) return "step1 expected input sheet";        // 新密码（两次）
    input.value = "smoke-password-2"; input2.value = "smoke-password-2"; document.getElementById("sheetConfirm").click(); await wait(300);
    await waitSheet(); if (!vis(choices)) return "step2 expected choice sheet";      // 已有稿怎么办 → 保留
    choices.querySelectorAll("button")[1].click(); await wait(300);
    await waitSheet(); if (!vis(input)) return "step3 expected file-password sheet"; // 重开这篇 → 这篇稿的密码
    input.value = "smoke-password-1"; document.getElementById("sheetConfirm").click();
    await p; await wait(300);
    const st = window.__xhw.editor.state;
    if (!(st.encrypted && !st.locked && document.getElementById("editor").value.includes("born encrypted"))) return "doc not reopened with own password";
    if (document.getElementById("keyBanner").hidden) return "banner hidden";
    const oldOk = await window.__xhw.verifyDocPassword(name, "smoke-password-1"), newOk = await window.__xhw.verifyDocPassword(name, "smoke-password-2");
    if (!(oldOk && !newOk)) return `before rekey: old=${oldOk} new=${newOk}`;
    document.getElementById("rekeyButton").click();
    for (let i = 0; i < 100; i++) { await wait(200); if (document.getElementById("keyBanner").hidden && !document.getElementById("busyOverlay").classList.contains("hidden") === false) break; }
    const oldOk2 = await window.__xhw.verifyDocPassword(name, "smoke-password-1"), newOk2 = await window.__xhw.verifyDocPassword(name, "smoke-password-2");
    return !oldOk2 && newOk2 && document.getElementById("keyBanner").hidden ? "ok" : `after rekey: old=${oldOk2} new=${newOk2} banner=${document.getElementById("keyBanner").hidden}`;
  });
  check("每篇密码：改密码保留旧密码 → 问这篇的密码 → 横幅 → 换成当前密码", perFile === "ok", String(perFile));
  // 还原出厂：有未同步稿（本页刚建的 local-only）→ 必须拒绝
  const frRefused = await page.evaluate(async () => { await window.__xhw.factoryReset(); return document.getElementById("saveStatus").textContent; });
  check("还原出厂：有未同步稿时拒绝", /未同步|not synced/.test(frRefused), frRefused);
  await page.waitForTimeout(500);
  check("零页面错误", pageErrors.length === 0, pageErrors.join(" | "));
  // 还原出厂真跑：新 context（无稿）→ 两道 sheet → wipe → reload → 残留归零
  const ctx2 = await browser.newContext(); const page2 = await ctx2.newPage();
  await page2.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
  await page2.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 });
  await page2.waitForTimeout(800);
  const frResult = await page2.evaluate(async () => {
    const p = window.__xhw.factoryReset();
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 50 && document.getElementById("sheet").classList.contains("hidden"); i++) await wait(100);
    document.getElementById("sheetConfirm").click();   // 说明 → 继续
    await wait(200);
    for (let i = 0; i < 50 && document.getElementById("sheetInput").classList.contains("hidden"); i++) await wait(100);
    document.getElementById("sheetInput").value = document.getElementById("sheetInput").placeholder;   // 逐字 consent
    document.getElementById("sheetConfirm").click();
    await p;
    return document.getElementById("saveStatus").textContent;
  });
  check("还原出厂：跑完报「验证归零」", /归零|zero residue/.test(frResult), frResult);
  await page2.waitForTimeout(2500);   // 1.2s 后 reload
  // reload 后 app 会立刻重建一个空的 webxiaoheiwu.defaultStore（正常）；归零证据是流程内的 scanAppNamespace（上一条）。这里只看 RIME 库/前缀键/抽屉空。
  await page2.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 });
  const residue = await page2.evaluate(async () => ({
    rime: (await indexedDB.databases()).map((d) => d.name).filter((n) => n === "ime" || n === "/rime"),
    docs: window.__xhw.drawer.items().length,
  }));
  check("还原出厂后：无 RIME 库、抽屉空（store 库由 boot 重建为空）", residue.rime.length === 0 && residue.docs === 0, JSON.stringify(residue));
  await ctx2.close();
} catch (e) {
  check("smoke 异常", false, String(e));
} finally {
  await browser.close();
  srv.close();
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\nboot smoke: ${failed.length} failed` : "\nboot smoke 全过");
process.exit(failed.length ? 1 : 0);
