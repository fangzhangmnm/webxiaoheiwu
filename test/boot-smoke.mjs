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
  await page.addInitScript(() => { try { localStorage.setItem("webxiaoheiwu-7c2e9a41b3d05f68:imeEnabled", "0"); } catch {} });   // 内置 IME 默认开（2026-09-03）：无头打字走裸字母，先用逃生开关关掉
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
  check("顶栏稿态存在且非错误（zen：干净态留白）", status !== null && !(await page.$eval("#saveStatus", (e) => e.classList.contains("error"))), status);
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
  await page.click("#settingsButton");   // 设置入口在抽屉头云图标旁（WeebPaint 布局）
  await page.waitForTimeout(300);
  check("抽屉头设置钮 → 设置视图显示 + 登录钮", await page.evaluate(() => !document.getElementById("settingsView").hidden && !!document.querySelector("#authRow button")));
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
  // 每篇密码（user 2026-09-03）：改密码但「保留各自旧密码」→ 当前这篇静默重载 + 横幅；忘掉后手势打开 → 问「这篇稿的密码」→ 输旧密码开 → 「换成当前密码」→ 文件换钥匙
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
    choices.querySelectorAll("button")[1].click();
    await p; await wait(300);
    let st = window.__xhw.editor.state;
    if (!(st.encrypted && !st.locked && document.getElementById("editor").value.includes("born encrypted"))) return "doc not silently reopened after keep";
    if (document.getElementById("keyBanner").hidden) return "banner hidden after keep";
    // 模拟新 session：忘掉这篇的密码 → 手势打开 → 必须被问
    window.__xhw.forgetFilePassword(name);
    const p2 = window.__xhw.editor.open(name, { promptUnlock: true });
    await waitSheet(); if (!vis(input)) return "step3 expected file-password sheet";
    input.value = "smoke-password-1"; document.getElementById("sheetConfirm").click();
    await p2; await wait(300);
    st = window.__xhw.editor.state;
    if (!(st.encrypted && !st.locked && document.getElementById("editor").value.includes("born encrypted"))) return "doc not reopened with own password";
    if (document.getElementById("keyBanner").hidden) return "banner hidden";
    const oldOk = await window.__xhw.verifyDocPassword(name, "smoke-password-1"), newOk = await window.__xhw.verifyDocPassword(name, "smoke-password-2");
    if (!(oldOk && !newOk)) return `before rekey: old=${oldOk} new=${newOk}`;
    document.getElementById("rekeyButton").click();
    for (let i = 0; i < 100; i++) { await wait(200); if (document.getElementById("keyBanner").hidden && document.getElementById("busyOverlay").classList.contains("hidden")) break; }
    const oldOk2 = await window.__xhw.verifyDocPassword(name, "smoke-password-1"), newOk2 = await window.__xhw.verifyDocPassword(name, "smoke-password-2");
    return !oldOk2 && newOk2 && document.getElementById("keyBanner").hidden ? "ok" : `after rekey: old=${oldOk2} new=${newOk2} banner=${document.getElementById("keyBanner").hidden}`;
  });
  check("每篇密码：保留旧密码静默重载+横幅 → 忘掉后手势打开被问 → 换成当前密码", perFile === "ok", String(perFile));
  // 多文件夹（ADR-0006）：新建夹 → 夹里新稿物化在夹下 → 移回根（撞名追加后缀）→ 删空夹（离线可能拒删：必须响亮，不静默）
  const folderFlow = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const { drawer, editor } = window.__xhw;
    const sheet = document.getElementById("sheet"), input = document.getElementById("sheetInput");
    drawer.open("active"); await wait(200);
    const p = drawer.newFolder();
    for (let i = 0; i < 50 && (sheet.classList.contains("hidden") || input.classList.contains("hidden")); i++) await wait(100);
    input.value = "测试夹"; document.getElementById("sheetConfirm").click(); await p; await wait(300);
    if (drawer.currentFolder() !== "测试夹") return "did not enter new folder: " + drawer.currentFolder();
    if (!document.getElementById("docBreadcrumb").textContent.includes("测试夹")) return "breadcrumb missing";
    await editor.newDoc({ dir: "测试夹" });
    const ed = document.getElementById("editor"); ed.focus(); ed.value = "in folder"; ed.dispatchEvent(new Event("input"));
    for (let i = 0; i < 50 && !editor.state.name; i++) await wait(200);
    if (!(editor.state.name || "").startsWith("测试夹/")) return "doc not materialized in folder: " + editor.state.name;
    for (let i = 0; i < 30 && !document.querySelector("#docList .doc-row:not(.folder-row)"); i++) await wait(200);
    if (!document.querySelector("#docList .doc-row:not(.folder-row)")) return "folder listing did not show the doc";
    const moved = await editor.moveTo("");
    if (!moved || moved.includes("/")) return "move to root failed: " + moved;
    drawer.setFolder(""); await wait(500);
    if (!document.querySelector(".folder-row")) return "root listing lost the folder row";
    let deleted = "", err = "";
    try { await window.__xhw.deleteFolder("测试夹"); deleted = "deleted"; } catch (e) { err = String(e?.message || e); }
    drawer.close();
    return deleted || (err ? "refused-loudly" : "silent");
  });
  check("多文件夹：建夹 → 夹内新稿 → 移回根 → 删夹（离线拒删须响亮）", folderFlow === "deleted" || folderFlow === "refused-loudly", String(folderFlow));
  // 内置 IME 三方案真跑（全拼 / 微软双拼 / 五笔86）：worker + wasm + 词典从本地服务加载，候选里必须有「你」
  const imeRun = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const { ime, setImeEnabled, editor } = window.__xhw;
    await editor.newDoc();
    await setImeEnabled(true);
    if (!ime.initialized || ime.initializeError) return "init failed: " + ime.initializeError;
    const ed = document.getElementById("editor"); ed.focus();
    const typeKeys = async (keys) => { for (const k of keys) { ed.dispatchEvent(new KeyboardEvent("keydown", { key: k, code: "Key" + k.toUpperCase(), bubbles: true, cancelable: true })); await wait(120); } await wait(400); };
    const cands = () => [...document.querySelectorAll("#candidateBar .candidate-chip")].map((c) => c.textContent.replace(/^\d/, ""));
    const out = {};
    await typeKeys(["n", "i"]); out.luna = cands().slice(0, 5); await ime.resetComposition();
    await ime.setSchema("double_pinyin_mspy"); await typeKeys(["n", "i"]); out.mspy = cands().slice(0, 5); await ime.resetComposition();
    await ime.setSchema("wubi86"); await typeKeys(["w", "q"]); out.wubi = cands().slice(0, 5); await ime.resetComposition();
    await ime.setSchema("luna_pinyin");
    // 简/繁开关真跑（zhe：简 这 / 繁 這）+ 候选里不该有 emoji
    await typeKeys(["z", "h", "e"]); out.simp = cands().slice(0, 5); await ime.backend.clear();
    await ime.setSimplified(false); await typeKeys(["z", "h", "e"]); out.trad = cands().slice(0, 5); await ime.backend.clear();
    await ime.setSimplified(true); await typeKeys(["z", "h", "e"]); out.simpAgain = cands().slice(0, 5); await ime.backend.clear();
    // 标点覆盖：` ~ → ·；方引号设置 → 「」『』 交替
    ed.value = ""; ime.quoteStyle = "corner"; await typeKeys(['"', '"', "'", "'", "~", "`"]); out.punct = ed.value; ime.quoteStyle = "curly"; ed.value = "";
    // 系统组字收编（Quest/安卓把实体键盘字母过系统输入法）：模拟 compositionend "nihao" → 裸字母被删、喂进 RIME、候选出「你好」
    ed.value = ""; ed.focus(); ed.value = "nihao"; ed.selectionStart = ed.selectionEnd = 5;
    ed.dispatchEvent(new CompositionEvent("compositionend", { data: "nihao", bubbles: true })); await wait(900);
    out.sysComp = { value: ed.value, cands: cands().slice(0, 3) }; ime.resetComposition(); await wait(150); ed.value = "";
    await setImeEnabled(false);
    return out;
  });
  check("系统组字收编：compositionend 'nihao' → 裸字母删掉、RIME 候选出「你好」", typeof imeRun === "object" && imeRun.sysComp?.value === "" && imeRun.sysComp?.cands?.includes("你好"), JSON.stringify(imeRun.sysComp));
  check("标点覆盖：方引号 「」『』 交替 + ~ 出「～」 + ` 出「·」", typeof imeRun === "object" && imeRun.punct === "「」『』～·", JSON.stringify(imeRun.punct));
  // undo 彻查（user 2026-09-04）：真按键。IME 提交后 Ctrl+Z 只撤最后一词、Ctrl+Shift+Z 重做；退格钮删的能撤；换稿不漏拼音
  const undoRun = await (async () => {
    const val = () => page.$eval("#editor", (e) => e.value);
    const slow = async (keys) => { for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(120); } await page.waitForTimeout(450); };
    await page.evaluate(async () => { const x = window.__xhw; await x.editor.newDoc(); await x.setImeEnabled(true); });
    await page.click("#editor");
    await slow(["n", "i", "Space"]); await slow(["h", "a", "o", "Space"]); const v0 = await val();
    await page.keyboard.press("Control+z"); await page.waitForTimeout(250); const v1 = await val();
    await page.keyboard.press("Control+Shift+z"); await page.waitForTimeout(250); const v2 = await val();
    await page.evaluate(() => window.__xhw.voiceBackspace()); await page.waitForTimeout(200); const v3 = await val();
    await page.keyboard.press("Control+z"); await page.waitForTimeout(250); const v4 = await val();
    await slow(["d", "e", "f"]); await page.evaluate(async () => { await window.__xhw.editor.newDoc(); }); await page.click("#editor"); await slow(["n", "i", "Space"]); const v5 = await val();
    await page.evaluate(async () => { await window.__xhw.setImeEnabled(false); });
    return { v0, v1, v2, v3, v4, v5 };
  })();
  // iOS 出血线（WeebPaint ADR-0010 移植）+ 双击放大：standalone 时顶栏/抽屉退到 ≥20px 地板；通配 touch-action: manipulation；viewport user-scalable=no
  const floors = await page.evaluate(() => {
    const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]);
    const tb = document.querySelector(".top-bar"), dr = document.getElementById("drawer"), pg = document.querySelector(".page"), ed = document.getElementById("editor");
    const before = { top: px(tb, "top"), drawerPad: px(dr, "paddingTop"), pageMt: px(pg, "marginTop") };
    document.documentElement.setAttribute("data-standalone", "");
    const after = { top: px(tb, "top"), drawerPad: px(dr, "paddingTop"), pageMt: px(pg, "marginTop") };
    document.documentElement.removeAttribute("data-standalone");
    return { before, after, ta: getComputedStyle(ed).touchAction, taMenu: getComputedStyle(document.getElementById("menuButton")).touchAction, vp: document.querySelector('meta[name="viewport"]').content };
  });
  check("iOS 出血线：standalone 顶栏 top 4→≥20、抽屉头下沉、纸面随顶栏；双击放大：编辑器/按钮 touch-action=manipulation + user-scalable=no", floors.before.top === 4 && floors.after.top >= 20 && floors.after.drawerPad >= 16 && floors.after.pageMt === floors.after.top + 36 && floors.ta === "manipulation" && floors.taMenu === "manipulation" && /user-scalable=no/.test(floors.vp), JSON.stringify(floors));
  // smart save 钮 + 软键盘缩纸面
  const smart = await page.evaluate(async () => {
    const w = (ms) => new Promise((r) => setTimeout(r, ms)); const x = window.__xhw; const btn = document.getElementById("saveButton");
    await x.editor.newDoc(); const ed = document.getElementById("editor"); ed.focus(); ed.value = "smart save"; ed.dispatchEvent(new Event("input")); await w(50);
    const kindDirty = x.editor.syncKind(), shown = !btn.hidden, icon = btn.querySelector("use")?.getAttribute("href");
    await x.smartSave(); await w(300);
    const toast = document.getElementById("toast").textContent, kindAfter = x.editor.syncKind();
    const pg = document.querySelector(".page"); const h0 = pg.getBoundingClientRect().height;
    document.documentElement.style.setProperty("--kb-offset", "300px"); const h1 = pg.getBoundingClientRect().height; document.documentElement.style.setProperty("--kb-offset", "0px");
    return { kindDirty, shown, icon, toast, kindAfter, shrink: Math.round(h0 - h1) };
  });
  check("smart save 钮：未登录=本机图标可见、点击落盘并 toast；--kb-offset 300 → 纸面缩 300", smart.kindDirty === "local" && smart.shown && smart.icon === "#database" && /已存本机|Saved on/.test(smart.toast) && smart.kindAfter === "local" && smart.shrink === 300, JSON.stringify(smart));
  const fs = await page.evaluate(async () => {
    const ed = document.getElementById("editor"); const sel = document.getElementById("fontScaleSelect");
    const f0 = parseFloat(getComputedStyle(ed).fontSize); sel.value = "1.3"; sel.dispatchEvent(new Event("change")); const f1 = parseFloat(getComputedStyle(ed).fontSize);
    const kv = localStorage.getItem("webxiaoheiwu-7c2e9a41b3d05f68:fontScale"); sel.value = "1"; sel.dispatchEvent(new Event("change"));
    return { f0, f1, kv, bgPos: getComputedStyle(ed).backgroundPosition };
  });
  check("字号档位：1.3 档字号 ×1.3、落 device-kv；写字线挪到字底", Math.abs(fs.f1 - fs.f0 * 1.3) < 0.6 && fs.kv === "1.3" && /-0\.4em|-\d+(\.\d+)?px/.test(fs.bgPos), JSON.stringify(fs));
  const resetPage = await browser.newPage();
  await resetPage.goto(`http://127.0.0.1:${port}/index.html?reset=1`, { waitUntil: "load" }); await resetPage.waitForFunction(() => !!window.__xhw); await resetPage.waitForTimeout(1200);
  const resetInfo = await resetPage.evaluate(() => ({ toast: document.getElementById("toast").textContent, search: location.search, v: window.__xhw.version }));
  await resetPage.close();
  check("强制更新回执：?reset= 启动 → toast 报版本、URL 清干净", resetInfo.toast.includes(resetInfo.v) && resetInfo.search === "", JSON.stringify(resetInfo));
  check("undo：IME 提交后 Ctrl+Z 只撤最后一词 / Ctrl+Shift+Z 重做 / 退格钮可撤 / 换稿不漏拼音", undoRun.v0 === "你好" && undoRun.v1 === "你" && undoRun.v2 === "你好" && undoRun.v3 === "你" && undoRun.v4 === "你好" && undoRun.v5 === "你", JSON.stringify(undoRun));
  const kbAway = await page.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); window.dispatchEvent(new Event("blur")); await w(50); const a = document.body.classList.contains("kb-away"); document.activeElement?.blur(); window.dispatchEvent(new Event("focus")); await w(50); return { a, b: !document.body.classList.contains("kb-away"), c: document.activeElement === document.getElementById("editor") }; });
  check("Quest 键盘提示：window blur → kb-away；focus → 撤提示 + 焦点回编辑器", kbAway.a && kbAway.b && kbAway.c, JSON.stringify(kbAway));
  const typeAnywhere = await page.evaluate(() => { document.activeElement?.blur(); document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true })); return document.activeElement === document.getElementById("editor"); });
  check("页内任意处敲键 → 焦点回编辑器", typeAnywhere);
  const vbs = await page.evaluate(() => { const ed = document.getElementById("editor"), bs = document.getElementById("voiceBackspaceButton"); const x = window.__xhw; ed.focus(); ed.value = "你好😀"; ed.selectionStart = ed.selectionEnd = ed.value.length; x.voiceBackspace(); const a = ed.value; x.voiceBackspace(); const b = ed.value; x.setVoiceMode(true); const shown = !bs.hidden; ed.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true })); const hiddenAfterKey = bs.hidden; x.setVoiceMode(false); return { a, b, shown, hiddenAfterKey }; });
  check("语音模式退格钮：emoji 整个删 / 汉字删一个；口述后可见、敲实体键即隐", vbs.a === "你好" && vbs.b === "你" && vbs.shown && vbs.hiddenAfterKey, JSON.stringify(vbs));
  // 锁卡护栏（user 2026-09-04「0.2 先做个护栏」）：加密稿物化 → 立即锁定 → 纸面盖锁卡、textarea readOnly、话筒收起；点「新建稿」→ 卡撤、可编辑
  const lockCard = await page.evaluate(async () => {
    const w = (ms) => new Promise((r) => setTimeout(r, ms)); const x = window.__xhw;
    if (!(await x.editor.newDoc({ encrypted: true }))) return "newDoc refused";
    const ed = document.getElementById("editor"); ed.focus(); ed.value = "to be locked"; ed.dispatchEvent(new Event("input"));
    for (let i = 0; i < 50 && !x.editor.state.name; i++) await w(200);
    if (!x.editor.state.name) return "not materialized";
    await x.lockNow(); await w(400);
    const card = document.getElementById("lockCard");
    const a = { card: !card.hidden, ro: ed.readOnly, mic: document.getElementById("micButton").hidden, text: document.getElementById("lockCardText").textContent };
    document.getElementById("lockCardNew").click(); await w(500);
    return { ...a, after: { card: !card.hidden, ro: ed.readOnly } };
  });
  check("锁卡护栏：锁定 → 锁卡 + readOnly + 话筒收起；新建稿 → 卡撤可编辑", typeof lockCard === "object" && lockCard.card && lockCard.ro && lockCard.mic && /加密稿|encrypted/.test(lockCard.text) && !lockCard.after.card && !lockCard.after.ro, JSON.stringify(lockCard));
  check("内置 IME 三方案：全拼 ni→你 / 微软双拼 ni→你 / 五笔 wq→你", typeof imeRun === "object" && imeRun.luna?.includes("你") && imeRun.mspy?.includes("你") && imeRun.wubi?.includes("你"), JSON.stringify(imeRun));
  check("简/繁开关：zhe 简→这 / 繁→這 / 切回→这，且无 emoji 候选", typeof imeRun === "object" && imeRun.simp?.[0] === "这" && imeRun.trad?.[0] === "這" && imeRun.simpAgain?.[0] === "这" && !imeRun.simp.some((c) => /\p{Extended_Pictographic}/u.test(c)), JSON.stringify({ simp: imeRun.simp, trad: imeRun.trad, again: imeRun.simpAgain }));
  // 还原出厂：有未同步稿（本页刚建的 local-only）→ 必须拒绝
  const frRefused = await page.evaluate(async () => { await window.__xhw.factoryReset(); return document.getElementById("toast").textContent; });
  check("还原出厂：有未同步稿时拒绝", /未同步|not synced/.test(frRefused), frRefused);
  await page.waitForTimeout(500);
  check("零页面错误", pageErrors.length === 0, pageErrors.join(" | "));
  // 还原出厂真跑：新 context（无稿）→ 两道 sheet → wipe → reload → 残留归零
  const ctx2 = await browser.newContext(); const page2 = await ctx2.newPage();
  await page2.addInitScript(() => { try { localStorage.setItem("webxiaoheiwu-7c2e9a41b3d05f68:imeEnabled", "0"); } catch {} });   // 关内置 IME：reload 后 boot 不重建 RIME 库，残留检查才有意义
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
    return document.getElementById("toast").textContent;
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
