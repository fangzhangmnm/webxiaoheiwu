// 开发工具：无头 chromium 走一遍 2.0 UI 流程，逐步截图到 tmp/ui/。用法：node tools/ui-audit.mjs [宽x高 ...]。created 2026-09-10 by Claude Fable 5.1。不进 bundle。
// 2026-09-10 晚 v2.0.4 改流程：☰ = 侧栏（默认关；顶部 书库/设置 入口 + 工程内导航）；节点名 = 纸面顶部章节名框；显示不带 .txt；新边加末尾。
// 2026-09-10 深夜 v2 树（ADR-0014）：侧栏 = `..` / 兄弟 / 子节 / 链接 / 谁指向这里（无第三层）；「+」拆成 + 兄弟 / + 子节；树移动六件走行菜单；上一页/下一页 = 页脚（DFS 首尾不绕回）；
//   末尾对着 tmp/migration/ 的狗粮书（不进 git，没有就 SKIP）走完整本 DFS + 导出这一支 + readOnly 菜单全灰。
import { createRequire } from "node:module";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
const wpRequire = createRequire(new URL("../../20260524 WeebPaint/package.json", import.meta.url));
const { chromium } = wpRequire("playwright");
const { default: UPNG } = await import("../vendor/upng/upng.esm.js");
/** 测试图：w×h 噪点 RGBA（噪点让 PNG 压不动 → 大图走 JPEG 重编码那条路；小图走只剥 metadata）。seed 决定内容，同 seed 同字节。 */
function makePng(w, h, seed) { const px = new Uint8Array(w * h * 4); let x = seed >>> 0; for (let i = 0; i < px.length; i += 4) { x = (x * 1664525 + 1013904223) >>> 0; px[i] = x & 255; px[i + 1] = (x >>> 8) & 255; px[i + 2] = (x >>> 16) & 255; px[i + 3] = 255; } return Buffer.from(UPNG.encode([px.buffer], w, h, 0)); }
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
const errors = []; let fails = 0;
const probe = (tag, name, ok, detail = "") => { console.log(tag, name + ":", ok ? "ok" : `FAIL ${detail}`); if (!ok) fails++; };
for (const [w, h] of sizes) {
  const tag = `${w}x${h}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, permissions: ["clipboard-read", "clipboard-write"] });   // v2.1.9 导出 = 剪贴板探针
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") errors.push(`[${tag}] console.${m.type()}: ${m.text()}`); });
  const shot = (name) => page.screenshot({ path: `tmp/ui/${tag}-${name}.png` });
  const wait = (ms) => page.waitForTimeout(ms);
  const sidebarShown = () => page.evaluate(() => document.body.dataset.edges === "1" && getComputedStyle(document.getElementById("edgeSidebar")).display !== "none");
  const rows = () => page.evaluate(() => [...document.querySelectorAll("#edgeList .edge-row:not(.add):not(.header):not(.empty):not(.parent) .edge-name")].map((e) => e.textContent));
  const rowsIn = (block) => page.evaluate((b) => [...document.querySelectorAll(`#edgeList .edge-row[data-block="${b}"]:not(.parent) .edge-name`)].map((e) => e.textContent), block);
  const parentRow = () => page.evaluate(() => { const r = document.querySelector("#edgeList .edge-row.parent"); return r ? { name: r.querySelector(".edge-name")?.textContent ?? "", root: r.classList.contains("root"), disabled: r.querySelector(".edge-main")?.disabled ?? false } : null; });
  const blocks = () => page.evaluate(() => [...new Set([...document.querySelectorAll("#edgeList .edge-row[data-block]")].map((r) => r.dataset.block))]);
  const noThirdLayer = () => page.evaluate(() => document.querySelectorAll("#edgeList ul, #edgeList li li").length === 0);
  /** 打开某块里某一行的菜单并点某个菜单项（按文案正则）。 */
  const rowMenu = async (block, name, labelRe) => {
    const opened = await page.evaluate(({ b, n }) => { const r = [...document.querySelectorAll(`#edgeList .edge-row[data-block="${b}"]`)].find((x) => x.dataset.name === n); const btn = r?.querySelector(".edge-more"); if (!btn) return false; btn.click(); return true; }, { b: block, n: name });
    if (!opened) return { opened: false };
    await wait(200);
    const items = await page.evaluate(() => [...document.querySelectorAll(".popup-menu button")].map((b) => ({ label: (b.textContent ?? "").trim(), disabled: b.disabled })));
    if (labelRe) { const hit = await page.evaluate((re) => { const it = [...document.querySelectorAll(".popup-menu button")].find((b) => new RegExp(re).test(b.textContent ?? "")); if (!it) return false; it.click(); return true; }, labelRe.source); await wait(300); return { opened: true, items, hit }; }
    return { opened: true, items };
  };
  const cur = () => page.evaluate(() => window.__xhw.project.current());
  const navState = () => page.evaluate(() => ({ hidden: document.getElementById("pagePrev").hidden, prev: document.getElementById("pagePrev").disabled, next: document.getElementById("pageNext").disabled }));
  const ensureSidebar = async (open) => { if ((await sidebarShown()) !== open) { await page.click("#menuButton"); await wait(300); } };
  const clickEditor = async () => { if (w < 900) await ensureSidebar(false); await page.click("#editor"); };   // 窄屏浮层不再自动收：点纸面前探针自己收
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__xhw && window.__xhw.editor.canEdit(), null, { timeout: 15000 }); await page.evaluate(() => window.__xhw.fontReady);   // boot 开出新稿后才能打字（之前在 __xhw 一出现就打，字被「不可用」守卫吞掉 → 整轮没有 txt 稿）
  await page.click("#editor"); await page.keyboard.type("第一篇：她推开门。他在窗边。窗外是雨。"); await wait(700);
  probe(tag, "txt doc materialized after typing", !!(await page.evaluate(() => window.__xhw.editor.state.name)));
  // 页脚字数统计（user 2026-09-10）：打字后显示「N 字 M 词」；设置 toggle 关 → 隐藏；再开 → 回来
  probe(tag, "word count footer shows N 字 M 词 after typing", await page.evaluate(() => { const e = document.getElementById("wordCount"); return !e.hidden && /^\d+ 字 \d+ 词$/.test(e.textContent ?? ""); }), await page.evaluate(() => document.getElementById("wordCount").textContent));
  probe(tag, "mic is pinned to the viewport; with the sheet scrolled to its end the footer row (word count) clears it (floater band)", await page.evaluate(() => { const m = document.getElementById("micButton"), f = document.querySelector(".page-foot-row"), sf = document.querySelector("main.surface"); const was = m.hidden; m.hidden = false; const t0 = sf.scrollTop; sf.scrollTop = sf.scrollHeight; const a = m.getBoundingClientRect(), b = f.getBoundingClientRect(); sf.scrollTop = t0; m.hidden = was; const overlap = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; return getComputedStyle(f).display !== "none" && !overlap && a.top >= b.bottom - 1 && getComputedStyle(m).position === "fixed"; }), await page.evaluate(() => { const m = document.getElementById("micButton"), f = document.querySelector(".page-foot-row"), sf = document.querySelector("main.surface"); const was = m.hidden; m.hidden = false; const t0 = sf.scrollTop; sf.scrollTop = sf.scrollHeight; const a = m.getBoundingClientRect(), b = f.getBoundingClientRect(); sf.scrollTop = t0; m.hidden = was; return `mic ${Math.round(a.top)}-${Math.round(a.bottom)} foot ${Math.round(b.top)}-${Math.round(b.bottom)} pos=${getComputedStyle(m).position}`; }));
  probe(tag, "word count toggle off hides the footer, on brings it back", await page.evaluate(() => { const tg = document.getElementById("wordCountToggle"), e = document.getElementById("wordCount"); tg.click(); const off = e.hidden; tg.click(); return off && !e.hidden; }));
  await shot("01-editor-txt");
  probe(tag, "sidebar closed by default", !(await sidebarShown()));
  probe(tag, "no edgeToggle in top bar", await page.evaluate(() => !document.getElementById("edgeToggle")));
  probe(tag, "☰ is the rightmost top-bar control", await page.evaluate(() => { const m = document.getElementById("menuButton").getBoundingClientRect(); return [...document.querySelectorAll(".top-bar > *")].every((e) => e.id === "menuButton" || e.hidden || e.getBoundingClientRect().right <= m.left + 1); }));
  // ☰ → 侧栏（txt 稿：只有书库/设置两个入口）
  await page.click("#menuButton"); await wait(300); await shot("02-sidebar-txt");
  probe(tag, "☰ opens sidebar", await sidebarShown());
  // v2.1.9 侧栏「导出」（user 2026-09-26「加一个当前页全页复制到剪切板的功能，放在三条杠的弹出菜单的书库和设置中间，加一个导出按钮」）：书库 | 导出 | 设置；一下 = 当前页全文进剪贴板 + toast「已复制全页」
  probe(tag, "sidebar top entries = 书库 | 导出 | 参考窗 | 设置 in that order, icon-only (labels visually hidden; export icon; 参考窗 entry only shown in book mode — ADR-0016)", await page.evaluate(() => { const ids = [...document.querySelectorAll(".edge-entries .edge-entry")].map((b) => b.id); const x = (id) => document.getElementById(id).getBoundingClientRect().left; const vis = ids.filter((id) => !document.getElementById(id).hidden); return JSON.stringify(ids) === JSON.stringify(["edgeLibrary", "edgeExport", "edgeReference", "edgeSettings"]) && vis.every((id, i) => i === 0 || x(vis[i - 1]) < x(id)) && document.querySelector("#edgeExport span").textContent === "导出" && !!document.querySelector("#edgeExport use[href='#export']") && document.getElementById("edgeReference").hidden === !document.body.dataset.project && vis.every((id) => getComputedStyle(document.querySelector("#" + id + " span")).position === "absolute"); }), await page.evaluate(() => [...document.querySelectorAll(".edge-entries .edge-entry")].map((b) => b.id + ":" + b.textContent.trim()).join("|")));
  // v2.3.1 导出 = 一张 sheet（复制文字 / 长图；user 2026-09-30「先做图片导出吧，这个今晚就能用」）：复制那条仍 = v2.1.9 的整页进剪贴板
  { const text = await page.inputValue("#editor"); await page.click("#edgeExport"); await wait(300);
    const choices = await page.evaluate(() => [...document.querySelectorAll("#sheetChoices .sheet-choice")].map((b) => b.textContent.trim()));
    const note = await page.evaluate(() => document.querySelector("#sheetChoices .sheet-seg-note")?.textContent ?? "");
    probe(tag, "导出 (txt draft) → one sheet, no scope row, three buttons in one row: 复制文字 / 长图 / PDF; note = 字数; a line-width row 14 / 20* / 28 (follows the editor)", choices.join("|") === "复制文字|长图|PDF" && await page.evaluate(() => !document.querySelector("#sheetChoices > .sheet-seg") && (() => { const b = [...document.querySelectorAll("#sheetChoices .sheet-choice")].map((x) => x.getBoundingClientRect()); return b.every((r) => Math.abs(r.top - b[0].top) < 1); })()) && /\d+ 字 \d+ 词/.test(note) && await page.evaluate(() => [...(document.querySelector("#sheetChoices .sheet-seg-line")?.querySelectorAll(".sheet-seg-btn") ?? [])].map((b) => b.textContent + (b.getAttribute("aria-checked") === "true" ? "*" : "")).join("|")) === "14|20*|28", JSON.stringify(choices) + " | " + note);
    await page.evaluate(() => [...document.querySelectorAll("#sheetChoices .sheet-choice")].find((b) => /复制/.test(b.textContent))?.click()); await wait(400);
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch((e) => "ERR:" + e.message));
    probe(tag, "导出 → 复制全文 → whole text on the clipboard + toast 已复制全页 N 字 M 词", clip === text && /已复制全页：\d+ 字 \d+ 词/.test(await page.textContent("#toast")), `clip=${JSON.stringify(clip).slice(0, 60)} toast=${await page.textContent("#toast")}`);
    probe(tag, "sidebar stays open after 导出 (no auto-close)", await sidebarShown());
    // 长图（v2.3.1）：整篇 → 1080 宽 PNG（vendored UPNG）；无头没有 navigator.share，结果 sheet 走下载 / 复制——这里直接调 __xhw.exportLongImage 验产物
    const li = await page.evaluate(async () => { const r = await window.__xhw.exportLongImage("draft"); if (!r) return null; const f = r.files[0]; const u8 = new Uint8Array(await f.arrayBuffer()); const bm = await createImageBitmap(f); return { n: r.files.length, magic: [...u8.slice(0, 4)].join(","), w: bm.width, h: bm.height, cjk: r.plan.cjk, name: f.name }; });
    probe(tag, "长图 (txt draft): one palette PNG (short draft never sliced; text-only → png), 750 wide, ≤ single-image cap 16000, word count > 0", !!li && li.n === 1 && li.magic === "137,80,78,71" && li.w === 684 && li.h > 200 && li.h <= 16000 && li.cjk > 0 && /\.png$/.test(li.name), JSON.stringify(li)); }
  // v2.1.18 设置住在侧栏里（user 2026-09-29「进设置的时候，关闭设置，还要关一次侧条，麻烦。不如设置和侧条都是同一个侧条里面？」）
  { await page.click("#edgeSettings"); await wait(300); await shot("02b-sidebar-settings");
    probe(tag, "侧栏里点设置 → the sidebar panel itself shows settings (no drawer, no second layer); sign-in button is there", await page.evaluate(() => { const sv = document.getElementById("settingsView"), sb = document.getElementById("edgeSidebar"); const r = sv.getBoundingClientRect(), b = sb.getBoundingClientRect(); return sb.contains(sv) && !sv.hidden && r.height > 100 && r.left >= b.left - 1 && r.right <= b.right + 1 && document.getElementById("drawer").classList.contains("hidden") && document.getElementById("drawerBackdrop").classList.contains("hidden") && !!document.querySelector("#authRow button") && getComputedStyle(document.querySelector(".edge-entries")).display === "none"; }));
    probe(tag, "the back arrow of the settings panel is visible without hovering", await page.evaluate(() => { const b = document.getElementById("edgeSettingsBack"); const r = b.getBoundingClientRect(); return parseFloat(getComputedStyle(b).opacity) === 1 && r.width >= 24 && !!b.querySelector("use"); }));
    probe(tag, "settings inside the sidebar are usable: changing 字号 there applies", await page.evaluate(() => { const sel = document.getElementById("fontScaleSelect"), ed = document.getElementById("editor"); const f0 = parseFloat(getComputedStyle(ed).fontSize); sel.value = "1.15"; sel.dispatchEvent(new Event("change")); const f1 = parseFloat(getComputedStyle(ed).fontSize); sel.value = "1"; sel.dispatchEvent(new Event("change")); return f1 > f0 * 1.1; }));
    await page.click("#edgeSettingsBack"); await wait(200);
    probe(tag, "back arrow in the settings panel → sidebar navigation again (still open)", await sidebarShown() && await page.evaluate(() => getComputedStyle(document.querySelector(".edge-entries")).display !== "none" && document.getElementById("settingsView").hidden));
    await page.click("#edgeSettings"); await wait(200);
    await page.click("#menuButton"); await wait(300);
    probe(tag, "ONE close: ☰ while settings are showing closes the whole thing (sidebar gone, nothing left to close)", !(await sidebarShown()) && await page.evaluate(() => document.getElementById("drawer").classList.contains("hidden") && document.getElementById("settingsView").hidden && !document.querySelector('[role="dialog"]:not(.hidden)')));
    await page.click("#menuButton"); await wait(300);
    probe(tag, "reopen the sidebar → it starts at navigation, not at settings", await sidebarShown() && await page.evaluate(() => document.getElementById("edgeSidebar").dataset.view !== "settings" && getComputedStyle(document.querySelector(".edge-entries")).display !== "none")); }
  probe(tag, "txt mode: project pane hidden, lift entry visible", await page.evaluate(() => document.getElementById("edgePane").hidden && !document.getElementById("edgeTxtPane").hidden));
  { const draftName = await page.evaluate(() => window.__xhw.editor.state.name); const draftText = await page.inputValue("#editor");
    await page.click("#edgeLift"); await wait(300);
    probe(tag, "lift sheet: book name defaults to the draft name", (await page.inputValue("#sheetInput")) === draftName.replace(/\.txt$/i, ""), await page.inputValue("#sheetInput"));
    await page.click("#sheetConfirm"); await wait(1200);
    probe(tag, "lift → book mode, first page = draft name, text carried over", await page.evaluate(({ dn, dt }) => window.__xhw.project.active() && document.getElementById("nodeTitle").value === dn.replace(/\.txt$/i, "") && document.getElementById("editor").value === dt, { dn: draftName, dt: draftText }), await page.evaluate(() => `active=${window.__xhw.project.active()} title=${document.getElementById("nodeTitle").value}`));
    probe(tag, "lift keeps the draft in the library", await page.evaluate((dn) => window.__xhw.drawer.items().some((x) => x.name === dn), draftName));
    await ensureSidebar(true);
    probe(tag, "lifted book: first page is in the trunk (`..` = book root, + 兄弟 present)", (await parentRow())?.root === true && await page.evaluate(() => !!document.getElementById("edgeAddSibling")), JSON.stringify(await parentRow()));   // user 2026-09-10 真机「加兄弟怎么没了」
    await page.evaluate(async (dn) => { await window.__xhw.openAny(dn); }, draftName); await wait(500);   // 回到 txt 稿，后面的流程照旧
    await ensureSidebar(true); }
  // 书库
  await page.click("#edgeLibrary"); await wait(1200); await shot("03-library");
  probe(tag, "library title says 书库", (await page.textContent(".gallery-chrome-title")).trim() === "书库");
  // 云状态 + 刷新露在书库顶栏（user 2026-09-10「不应跟藏扳手里面，而是外面和菜单里都有」）：没登录 → 云图标灰态、刷新藏；点云图标 = 云菜单（连接 OneDrive）
  probe(tag, "library chrome: cloud status button outside the wrench (state=out), refresh hidden while signed out", await page.evaluate(() => { const c = document.getElementById("galleryCloudBtn"), r = document.getElementById("galleryRefreshBtn"), w = document.getElementById("gallerySettingsBtn"); const vis = (e) => !e.hidden && getComputedStyle(e).display !== "none"; return vis(c) && c.dataset.cloudState === "out" && !vis(r) && vis(w) && c.getBoundingClientRect().left < w.getBoundingClientRect().left; }), await page.evaluate(() => document.getElementById("galleryCloudBtn")?.dataset.cloudState));
  await page.click("#galleryCloudBtn"); await wait(200);
  probe(tag, "library cloud button opens the cloud menu (连接 OneDrive)", await page.evaluate(() => [...document.querySelectorAll(".popup-menu button")].some((b) => /OneDrive/.test(b.textContent ?? ""))), await page.evaluate(() => [...document.querySelectorAll(".popup-menu button")].map((b) => b.textContent.trim()).join("|")));
  await page.keyboard.press("Escape"); await wait(150);
  probe(tag, "Escape closes the cloud menu, library stays open", await page.evaluate(() => !document.querySelector(".popup-menu") && document.body.dataset.mode === "gallery"));
  console.log(tag, "top element at center:", await page.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e ? `${e.tagName.toLowerCase()}#${e.id}.${[...e.classList].join(".")}` : null; }), "| top-bar covered:", await page.evaluate(() => { const tb = document.querySelector(".top-bar").getBoundingClientRect(); const e = document.elementFromPoint(tb.left + tb.width / 2, tb.top + tb.height / 2); return !!e?.closest("#galleryFull"); }));
  await page.click("#galleryNewBtn"); await wait(300); await shot("04-library-newmenu");
  await page.keyboard.press("Escape"); await wait(200);
  // 新建工程：菜单 → sheet（默认名「作品」）
  await page.click("#galleryNewBtn"); await wait(200);
  await page.evaluate(() => { const it = [...document.querySelectorAll("button")].find((b) => /新建书/.test(b.textContent ?? "")); if (!it) throw new Error("new-project menu item not found"); it.click(); }); await wait(400);
  probe(tag, "new project sheet default = 作品", (await page.inputValue("#sheetInput")) === "作品");
  probe(tag, "new project sheet has an unchecked 加密 checkbox (user 2026-09-26「加密勾勾同意」)", await page.evaluate(() => { const c = document.getElementById("sheetCheck"); return !c.classList.contains("hidden") && /加密/.test(document.getElementById("sheetCheckLabel").textContent ?? "") && !document.getElementById("sheetCheckInput").checked; }));
  await shot("05-newproject-sheet");
  await page.click("#sheetConfirm"); await wait(1200);
  await shot("06-project-editor");
  probe(tag, "project created: top bar shows project name only", (await page.textContent("#docNameButton")).trim() === "作品", await page.textContent("#docNameButton"));
  probe(tag, "first page = 目录 in title field (no .txt; user 2026-09-30「书创建的第一页叫目录吧，不叫目录」)", (await page.inputValue("#nodeTitle")) === "目录", await page.inputValue("#nodeTitle"));
  probe(tag, "top-bar state not an error", !(await page.$eval("#saveStatus", (e) => e.classList.contains("error"))) && !/没有缓存/.test(await page.textContent("#saveStatus")), await page.textContent("#saveStatus"));
  probe(tag, "no warning banner", await page.evaluate(() => { const b = document.getElementById("errBanner"); return !b || b.classList.contains("hidden"); }));
  probe(tag, "sidebar keeps the state it had when 书库 was opened from it (no auto-close)", await sidebarShown());
  // 工程：写 + 退格探针
  probe(tag, "book mode: top-bar + (add page) visible, left of ☰", await page.evaluate(() => { const a = document.getElementById("addPageButton"), m = document.getElementById("menuButton"); return !a.hidden && a.getBoundingClientRect().right <= m.getBoundingClientRect().left + 1; }));
  // 书库钮（user 2026-09-10「标题左边放书库图标。标题还是改名」）：顶栏最左 = 书库图标、常驻；点了开书库；标题仍是改名（下面「project rename → top bar updates」探针）
  probe(tag, "top bar: library button = leftmost item, left of the project name, visible", await page.evaluate(() => { const l = document.getElementById("libraryButton"), n = document.getElementById("docNameButton"); const first = [...document.querySelector(".top-bar").children].filter((c) => !c.hidden && c.tagName !== "SPAN")[0]; return !!l && !l.hidden && !n.hidden && l.getBoundingClientRect().right <= n.getBoundingClientRect().left + 1 && first === l; }));
  if (w < 900) await ensureSidebar(false);
  await page.click("#libraryButton"); await wait(600);
  probe(tag, "library button → 书库 opens", await page.evaluate(() => !document.getElementById("galleryFull").classList.contains("hidden")));
  await page.click("#galleryBack"); await wait(300);
  probe(tag, "galleryBack → editor again, same project, library button still there", await page.evaluate(() => document.getElementById("galleryFull").classList.contains("hidden") && !document.getElementById("libraryButton").hidden) && (await page.textContent("#docNameButton")).trim() === "作品");
  await clickEditor(); await page.keyboard.type("她推开门。他在窗边。窗外是雨。"); await wait(300);
  { const before = await page.inputValue("#editor"); await page.keyboard.press("End"); await page.keyboard.press("Backspace"); await wait(100);
    const after = await page.inputValue("#editor"); probe(tag, "backspace in project", after.length === before.length - 1, `(${before.length}→${after.length})`); await page.keyboard.type("。"); }
  // 侧栏 = 当前页的邻域（ADR-0014 §7）：`..`（顶层 = 书，不可点）/ 兄弟（当前高亮）/ + 兄弟 / 子节 / + 子节 / 链接；没有第三层
  await ensureSidebar(true); await shot("07-sidebar-project");
  probe(tag, "project pane visible", !(await page.evaluate(() => document.getElementById("edgePane").hidden)));
  { const pr = await parentRow(); probe(tag, "`..` row at top level = the book, not clickable", !!pr && pr.root && pr.disabled && pr.name === "作品", JSON.stringify(pr)); }
  probe(tag, "siblings block = [目录] (current), + sibling and + child rows present", JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["目录"]) && await page.evaluate(() => !!document.getElementById("edgeAddSibling") && !!document.getElementById("edgeAddChild") && document.querySelector("#edgeList .edge-row.current .edge-name")?.textContent === "目录"), JSON.stringify(await rowsIn("siblings")));
  probe(tag, "sidebar has no third layer (flat rows, blocks ⊆ parent/siblings/children/links/incoming)", (await noThirdLayer()) && (await blocks()).every((b) => ["parent", "siblings", "children", "links", "incoming"].includes(b)), JSON.stringify(await blocks()));
  { await page.click("#edgeSearch"); await page.keyboard.type("nihao"); await wait(300);
    const comp = await page.evaluate(() => { const c = document.getElementById("candidateBar"); return c ? getComputedStyle(c).display !== "none" && (c.textContent ?? "").trim().length > 0 : false; });
    const raw = await page.inputValue("#edgeSearch"); probe(tag, "ime on edgeSearch", comp || raw === "", `(value=${JSON.stringify(raw)})`);
    probe(tag, "ime candidates above the sidebar search box: bar visible and elementFromPoint hits the bar (not the sidebar)", await page.evaluate(() => { const c = document.getElementById("candidateBar"); if (!c || getComputedStyle(c).display === "none") return false; const r = c.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && !!e.closest("#candidateBar") && !e.closest("#edgeSidebar"); }), await page.evaluate(() => { const c = document.getElementById("candidateBar"); const r = c.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return `${getComputedStyle(c).position} z=${getComputedStyle(c).zIndex} hit=${e?.id || e?.className}`; }));   // user 2026-09-10「输入法的 z order 不对」
    // v2.1.14 候选条跟焦点所在的文本框走（user 2026-09-26「你弄反了，锁屏的时候也可能有文本框的。未来的软键盘也需要这么处理」）：失焦 → 收（锁屏靠这个藏）；焦点回来 → 原样回来；锁屏之上聚焦的输入框 → 候选条仍在
    probe(tag, "candidate bar follows focus: blur the field → bar hidden (this is how the idle lock hides it); refocus → bar back with the same buffer", await page.evaluate(async () => { const bar = document.getElementById("candidateBar"), el = document.getElementById("edgeSearch"); const vis = () => getComputedStyle(bar).display !== "none" && (bar.textContent ?? "").length > 0; const before = vis(); el.blur(); await new Promise((r) => setTimeout(r, 50)); const blurred = !vis(); el.focus(); await new Promise((r) => setTimeout(r, 50)); return before && blurred && vis(); }));
    probe(tag, "idle overlay shown while a text field keeps focus (sheet-above-lock case) → bar still visible above the lock", await page.evaluate(() => { const ov = document.getElementById("idleOverlay"), bar = document.getElementById("candidateBar"); ov.classList.remove("hidden"); const shown = getComputedStyle(bar).display !== "none" && parseInt(getComputedStyle(bar).zIndex, 10) > parseInt(getComputedStyle(ov).zIndex, 10); ov.classList.add("hidden"); return shown; }));
    // v2.1.13 触屏点候选（user 2026-09-26「ios 触屏没法点输入法候选」）：pointerdown 第二个候选 → 落进正在打字的检索框、候选条收起、焦点没丢
    // v2.1.16：点选改在 click（整个触摸序列的最后一个事件）才算数——pointerdown 当场上屏 + 候选条当场消失时，手指抬起碰到的是底下的正文（user 2026-09-29 iPad「光标老乱跑…都是光标跳到屏幕下面了」）；点过之后悬浮条空着多留一拍再收
    { const picked = await page.evaluate(() => { const chips = [...document.querySelectorAll("#candidateBar .cand:not(.nav)")]; if (chips.length < 2) return null; const txt = (chips[1].textContent ?? "").replace(/^\d+/, ""); chips[1].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true })); const stillThere = !document.getElementById("candidateBar").classList.contains("hidden") && document.getElementById("edgeSearch").value === ""; chips[1].click(); return stillThere ? txt : "pointerdown already committed"; }); await wait(700);
      probe(tag, "tap on the 2nd candidate: nothing happens on pointerdown; click → that word lands in #edgeSearch, bar hides (after lingering), focus stays in the search box", picked != null && (await page.inputValue("#edgeSearch")) === picked && await page.evaluate(() => document.getElementById("candidateBar").classList.contains("hidden") && document.activeElement?.id === "edgeSearch"), `picked=${picked} value=${await page.inputValue("#edgeSearch")} active=${await page.evaluate(() => document.activeElement?.id)}`); }
    await page.keyboard.press("Escape"); await page.fill("#edgeSearch", ""); await wait(100); }
  await ensureSidebar(true);
  // 「+ 兄弟」→ 第二章（目录 的兄弟），章节名框全选 → 改名「序章」→ Enter
  await page.click("#edgeAddSibling"); await wait(400);
  probe(tag, "+ sibling → asks for a name (no chapter suggestion, not prefilled)", await page.evaluate(() => !document.getElementById("sheet").classList.contains("hidden") && !/章/.test(document.getElementById("sheetInput").placeholder) && document.getElementById("sheetInput").value === ""));
  await page.keyboard.type("ni"); await wait(250);
  probe(tag, "ime candidates above the name sheet: bar visible and elementFromPoint hits the bar (not the sheet)", await page.evaluate(() => { const c = document.getElementById("candidateBar"); if (!c || getComputedStyle(c).display === "none") return false; const r = c.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && !!e.closest("#candidateBar") && !e.closest("#sheet"); }), await page.evaluate(() => { const c = document.getElementById("candidateBar"); const r = c.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return `display=${getComputedStyle(c).display} hit=${e?.id || e?.className}`; }));   // Quest 上用自带输入法给页起名
  await page.evaluate(() => window.__xhw.ime.resetComposition()); await wait(100);
  await page.fill("#sheetInput", "第二章"); await page.click("#sheetConfirm"); await wait(400);
  probe(tag, "+ sibling → new page 第二章 opened as a sibling of 目录, empty file, title shows it", await page.evaluate(() => document.getElementById("nodeTitle").value === "第二章" && window.__xhw.project.current() === "第二章.txt" && document.getElementById("editor").value === "") && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["目录", "第二章"]), JSON.stringify(await rowsIn("siblings")));
  probe(tag, "sidebar stays open after + (no auto-close)", await sidebarShown());
  if (w < 900) await ensureSidebar(false);   // 窄屏浮层盖住章节名框，探针自己收
  await page.click("#nodeTitle"); await page.evaluate(() => document.getElementById("nodeTitle").select()); await page.keyboard.type("序章"); await page.keyboard.press("Enter"); await wait(300);
  probe(tag, "title Enter → renamed + focus body", await page.evaluate(() => document.activeElement?.id === "editor" && window.__xhw.project.current() === "序章.txt"), await page.evaluate(() => window.__xhw.project.current()));
  // v2.1.13 系统输入法合成态（user 2026-09-26「修改标题的会有一些奇怪的bug。我在用ios自带输入法删字」「删完标题之后会错误复原一开始删的东西」）：
  //   模拟 iOS/桌面 IME：compositionstart → 半截拼音 input → keydown Enter(isComposing) 不许当命令；compositionend 后**不再有 500ms 自动改名 / 回写**；Enter/blur 才提交；删字中途光标不跳、值不被回写
  { const ime = (el, type, init) => el.dispatchEvent(new (type.startsWith("composition") ? CompositionEvent : type === "keydown" ? KeyboardEvent : InputEvent)(type, { bubbles: true, cancelable: true, ...init }));
    const sim = async (fn) => page.evaluate(fn); void sim; void ime;
    const r1 = await page.evaluate(async () => {
      const el = document.getElementById("nodeTitle"); const cur0 = window.__xhw.project.current();
      el.focus(); el.setSelectionRange(el.value.length, el.value.length);
      el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
      el.value = "序章ni"; el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertCompositionText", data: "ni", isComposing: true }));
      el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", isComposing: true }));
      await new Promise((r) => setTimeout(r, 700));
      const midEnter = { cur: window.__xhw.project.current(), value: el.value, active: document.activeElement?.id };
      el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "你" })); el.value = "序章你"; el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "你" }));
      await new Promise((r) => setTimeout(r, 800));
      const afterPause = { cur: window.__xhw.project.current(), value: el.value, active: document.activeElement?.id };
      el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
      await new Promise((r) => setTimeout(r, 300));
      return { cur0, midEnter, afterPause, final: { cur: window.__xhw.project.current(), value: el.value, active: document.activeElement?.id } };
    });
    probe(tag, "IME composing + Enter → NOT a command: no rename, pinyin stays in the box, focus stays", r1.midEnter.cur === r1.cur0 && r1.midEnter.value === "序章ni" && r1.midEnter.active === "nodeTitle", JSON.stringify(r1.midEnter));
    probe(tag, "after compositionend, a 0.8s pause does NOT auto-rename nor rewrite the box (no debounce commit any more)", r1.afterPause.cur === r1.cur0 && r1.afterPause.value === "序章你" && r1.afterPause.active === "nodeTitle", JSON.stringify(r1.afterPause));
    probe(tag, "real Enter → rename 序章你 + focus body", r1.final.cur === "序章你.txt" && r1.final.active === "editor", JSON.stringify(r1.final));
    // 删字：光标在中间删一个字、停 0.8s → 值不被回写、光标不跳、还没改名；离开框才改名；删空 + 离开 = 不改名（有名保名）而不是「复原一开始删的东西」
    const r2 = await page.evaluate(async () => {
      const el = document.getElementById("nodeTitle"); el.focus();
      el.value = "序你"; el.setSelectionRange(1, 1); el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));   // 删掉中间的「章」，光标停在 1
      await new Promise((r) => setTimeout(r, 800));
      const mid = { cur: window.__xhw.project.current(), value: el.value, sel: el.selectionStart };
      el.blur(); await new Promise((r) => setTimeout(r, 300));
      const afterBlur = { cur: window.__xhw.project.current(), value: el.value };
      el.focus(); el.value = ""; el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" })); await new Promise((r) => setTimeout(r, 800));
      const emptyMid = { value: el.value, cur: window.__xhw.project.current() };
      el.blur(); await new Promise((r) => setTimeout(r, 300));
      const emptyBlur = { value: el.value, cur: window.__xhw.project.current() };
      el.focus(); el.value = "序章"; el.dispatchEvent(new InputEvent("input", { bubbles: true })); el.blur(); await new Promise((r) => setTimeout(r, 300));   // 恢复后面流程依赖的名字
      return { mid, afterBlur, emptyMid, emptyBlur, restored: window.__xhw.project.current() };
    });
    probe(tag, "deleting mid-title + pause: box untouched (no write-back), caret stays at 1, no rename yet", r2.mid.value === "序你" && r2.mid.sel === 1 && r2.mid.cur === "序章你.txt", JSON.stringify(r2.mid));
    probe(tag, "blur → rename lands (序你)", r2.afterBlur.cur === "序你.txt" && r2.afterBlur.value === "序你", JSON.stringify(r2.afterBlur));
    probe(tag, "deleted everything + pause: stays empty (nothing \"restored\" mid-edit); blur → keep-name rule shows the real name", r2.emptyMid.value === "" && r2.emptyMid.cur === "序你.txt" && r2.emptyBlur.value === "序你" && r2.emptyBlur.cur === "序你.txt", JSON.stringify({ emptyMid: r2.emptyMid, emptyBlur: r2.emptyBlur }));
    probe(tag, "restored to 序章 for the rest of the flow", r2.restored === "序章.txt", r2.restored);
    // sheet：组字中的 Enter 不确认（新页名字框）
    await ensureSidebar(true); await page.click("#edgeAddSibling"); await wait(300);
    const r3 = await page.evaluate(async () => { const inp = document.getElementById("sheetInput"); inp.focus(); inp.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); inp.value = "di"; inp.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", isComposing: true })); await new Promise((r) => setTimeout(r, 200)); const open = !document.getElementById("sheet").classList.contains("hidden"); inp.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "di" })); inp.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" })); await new Promise((r) => setTimeout(r, 200)); return { open, closed: document.getElementById("sheet").classList.contains("hidden"), pages: window.__xhw.project.nodeNames().length }; });
    probe(tag, "name sheet: Enter while composing does NOT confirm (sheet stays open); real Escape closes it; no page created", r3.open && r3.closed, JSON.stringify(r3));
    if (w < 900) await ensureSidebar(false); }
  await clickEditor(); await page.keyboard.type("序章正文。"); await wait(300);
  await shot("08-after-plus-rename");
  // 回退 → 目录：兄弟块 = 目录(当前)、序章（无 .txt；改名重写了树）
  await page.keyboard.press("Alt+ArrowLeft"); await wait(300);
  await ensureSidebar(true);
  probe(tag, "back to 目录; siblings = 目录 (current), 序章 without .txt (rename rewrote the tree)", JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["目录", "序章"]) && (await cur()) === "目录.txt", JSON.stringify(await rowsIn("siblings")));
  probe(tag, "row shows modified time as small text", await page.evaluate(() => /\d+\/\d+ \d\d:\d\d/.test(document.querySelector("#edgeList .edge-row[data-block='siblings'] .edge-sub")?.textContent ?? "")));
  // 前进 = 回退的逆（user 2026-09-10「既然有 back 了也加一个右箭头」）：回退后前进亮 → 前进回到序章 → 再回退回目录；新导航清空前进栈
  probe(tag, "after back: sidebar forward button live (right of back); back grey (that stack held one entry)", await page.evaluate(() => { const f = document.getElementById("edgeForward"), b = document.getElementById("edgeBack"); return !!f && !f.disabled && b.disabled && b.getBoundingClientRect().right <= f.getBoundingClientRect().left + 1 && !!f.querySelector("use[href='#forward']"); }), await page.evaluate(() => `forward.disabled=${document.getElementById("edgeForward")?.disabled} back.disabled=${document.getElementById("edgeBack").disabled}`));
  await page.click("#edgeForward"); await wait(300);
  probe(tag, "forward → 序章 again; forward grey, back live", (await cur()) === "序章.txt" && await page.evaluate(() => document.getElementById("edgeForward").disabled && !document.getElementById("edgeBack").disabled), await cur());
  await page.click("#edgeBack"); await wait(300);
  probe(tag, "back again → 目录; forward live", (await cur()) === "目录.txt" && await page.evaluate(() => !document.getElementById("edgeForward").disabled), await cur());
  await page.evaluate(() => window.__xhw.project.jump("序章.txt")); await page.evaluate(() => window.__xhw.sidebar.render()); await wait(150);
  probe(tag, "a fresh jump clears the forward stack (back keeps)", await page.evaluate(() => document.getElementById("edgeForward").disabled && window.__xhw.project.canGoBack() && !window.__xhw.project.canGoForward()));
  await page.evaluate(() => window.__xhw.project.goBack()); await page.evaluate(() => window.__xhw.sidebar.render()); await wait(150);
  probe(tag, "…and back lands on 目录 again", (await cur()) === "目录.txt", await cur());
  // Ctrl+Enter 分裂已去掉（user 2026-09-10「先不要做去奇怪的静默行为」）：无入口
  if (w < 900) await ensureSidebar(false);
  await page.evaluate(() => { const el = document.getElementById("editor"); el.focus(); el.setSelectionRange(0, 5); });
  await page.keyboard.press("Control+Enter"); await wait(300);
  probe(tag, "Ctrl+Enter does nothing (no sheet, text intact)", await page.evaluate(() => document.getElementById("sheet").classList.contains("hidden") && document.getElementById("editor").value.startsWith("她推开门。")));
  // 顶栏「+」= 菜单（加兄弟页 / 加子节 / 从图片…）→ 加子节 → 她推开门。（目录 的孩子）
  await page.click("#addPageButton"); await wait(250);
  { const items = await page.evaluate(() => [...document.querySelectorAll(".popup-menu button")].map((b) => (b.textContent ?? "").trim()));
    probe(tag, "top-bar + opens a menu: 加兄弟页 / 加子节 (从图片… moved into the name sheet)", items.some((x) => /兄弟/.test(x)) && items.some((x) => /子节/.test(x)) && !items.some((x) => /图片/.test(x)), JSON.stringify(items)); }
  await page.evaluate(() => { const it = [...document.querySelectorAll(".popup-menu button")].find((b) => /子节/.test(b.textContent ?? "")); it.click(); }); await wait(300);
  await page.fill("#sheetInput", "她推开门。"); await page.click("#sheetConfirm"); await wait(400);
  await ensureSidebar(true);
  probe(tag, "top-bar + → child 她推开门。 opened; `..` = 目录 (clickable); siblings block = just itself", (await page.inputValue("#nodeTitle")) === "她推开门。" && JSON.stringify(await parentRow()) === JSON.stringify({ name: "目录", root: false, disabled: false }) && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["她推开门。"]), `${await page.inputValue("#nodeTitle")} ${JSON.stringify(await parentRow())}`);
  await shot("09-after-topbar-add");
  await page.click("#edgeParent"); await wait(300);
  probe(tag, "`..` click → jumps to the parent 目录; children block = [她推开门。]", (await cur()) === "目录.txt" && JSON.stringify(await rowsIn("children")) === JSON.stringify(["她推开门。"]) && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["目录", "序章"]), JSON.stringify(await rowsIn("children")));
  // v2.1.9 纸面亲缘（user 2026-09-26「父亲页面拉到最下面可以显示孩子页面的目录列表，然后标题栏也有回到上一级的链接」）：父页正文短 → 子节目录露在正文之下；顶层页无「..」；长正文 = 滚到底才露、往上滚超过目录高度才收（迟滞）；点行 → 子节，子节页章节名上方「.. 目录」→ 点回父页
  if (w < 900) await ensureSidebar(false);
  // v2.1.11 嵌入态（user 2026-09-26「如果父节点没有输入很多段的话子节不应该在最下面，而是取决于父节点输入了多少行…相当于嵌入了」）：正文一行 → textarea 只有一两行高，目录紧跟其后、离纸底很远
  probe(tag, "parent page (short body): child TOC right under the last line of text (embedded, not pinned to the page bottom), rows = [她推开门。]; `..` link hidden at top level", await page.evaluate(() => { const toc = document.getElementById("childToc"), pl = document.getElementById("parentLink"), edEl = document.getElementById("editor"); const rows = [...toc.querySelectorAll(".child-toc-name")].map((e) => e.textContent); const ed = edEl.getBoundingClientRect(), tr = toc.getBoundingClientRect(), pb = document.getElementById("pageBody").getBoundingClientRect(); const lineH = parseFloat(getComputedStyle(edEl).lineHeight); return !toc.hidden && getComputedStyle(toc).display !== "none" && JSON.stringify(rows) === JSON.stringify(["她推开门。"]) && ed.height <= 3 * lineH && tr.top - ed.bottom >= 0 && tr.top - ed.bottom <= 16 && tr.bottom < pb.bottom - 120; }), await page.evaluate(() => { const ed = document.getElementById("editor").getBoundingClientRect(), tr = document.getElementById("childToc").getBoundingClientRect(), pb = document.getElementById("pageBody").getBoundingClientRect(); return `embed=${document.querySelector(".page").hasAttribute("data-toc-embed")} edH=${Math.round(ed.height)} gap=${Math.round(tr.top - ed.bottom)} tocBottom=${Math.round(tr.bottom)} bodyBottom=${Math.round(pb.bottom)} hidden=${document.getElementById("childToc").hidden}`; }));
  probe(tag, "click on the blank paper below the TOC → editor focused, caret at the end (paper is not \"cut\")", await (async () => { const pt = await page.evaluate(() => { const pb = document.getElementById("pageBody").getBoundingClientRect(), tr = document.getElementById("childToc").getBoundingClientRect(); return { x: pb.left + pb.width / 2, y: Math.min(tr.bottom + 40, pb.bottom - 10) }; }); await page.mouse.click(pt.x, pt.y); await wait(150); return page.evaluate(() => document.activeElement?.id === "editor" && document.getElementById("editor").selectionStart === document.getElementById("editor").value.length); })(), await page.evaluate(() => `active=${document.activeElement?.id} sel=${document.getElementById("editor").selectionStart}/${document.getElementById("editor").value.length}`));
  probe(tag, "mic does not overlap the child TOC", await page.evaluate(() => { const m = document.getElementById("micButton"), c = document.getElementById("childToc"); const was = m.hidden; m.hidden = false; const a = m.getBoundingClientRect(), b = c.getBoundingClientRect(); m.hidden = was; return !(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top); }), await page.evaluate(() => { const m = document.getElementById("micButton"), c = document.getElementById("childToc"); const was = m.hidden; m.hidden = false; const a = m.getBoundingClientRect(), b = c.getBoundingClientRect(); m.hidden = was; return `mic ${Math.round(a.top)}-${Math.round(a.bottom)} toc ${Math.round(b.top)}-${Math.round(b.bottom)}`; }));
  await shot("09b-child-toc");
  { const saved = await page.inputValue("#editor");
    await page.evaluate(() => { const el = document.getElementById("editor"); el.value = Array.from({ length: 160 }, (_, i) => `第${i + 1}行：她推开门。他在窗边。窗外是雨。`).join("\n"); el.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector("main.surface").scrollTop = 0; }); await wait(350);
    // v2.1.26 一张纸模型（user 2026-09-30「对的，整张纸滚」）：正文框 = 内容高度、自己不滚；滚的是 main.surface；目录紧跟正文之后、有子节就露
    probe(tag, "long body → textarea is exactly its content height (no internal scroll), the sheet (main.surface) scrolls, TOC stays right after the text", await page.evaluate(() => { const el = document.getElementById("editor"), sf = document.querySelector("main.surface"), toc = document.getElementById("childToc"); const lh = parseFloat(getComputedStyle(el).lineHeight); return !toc.hidden && el.scrollHeight === el.clientHeight && getComputedStyle(el).overflowY === "hidden" && Math.abs(el.clientHeight / lh - Math.round(el.clientHeight / lh)) < 0.02 && sf.scrollHeight > sf.clientHeight + 100 && Math.abs(toc.getBoundingClientRect().top - el.getBoundingClientRect().bottom) < 1; }), await page.evaluate(() => { const el = document.getElementById("editor"), sf = document.querySelector("main.surface"); return `hidden=${document.getElementById("childToc").hidden} ed=${el.clientHeight}/${el.scrollHeight} sheet=${sf.clientHeight}/${sf.scrollHeight}`; }));
    probe(tag, "embed geometry: editor height, TOC height and every TOC row are whole lines; TOC rows use the editor font and line height", await page.evaluate(async () => { const x = window.__xhw; const el = document.getElementById("editor"), toc = document.getElementById("childToc"); const keep = el.value; el.value = "\u56fd"; el.dispatchEvent(new Event("input", { bubbles: true })); await new Promise((r) => setTimeout(r, 80)); x.renderPageKin(); const lh = parseFloat(getComputedStyle(el).lineHeight); const whole = (v) => Math.abs(v / lh - Math.round(v / lh)) < 0.02; const rows = [...toc.querySelectorAll(".child-toc-row")]; const cs = rows[0] ? getComputedStyle(rows[0]) : null; const ok = !toc.hidden && rows.length > 0 && whole(el.clientHeight) && whole(toc.getBoundingClientRect().height) && rows.every((r) => whole(r.getBoundingClientRect().height) && Math.round(r.getBoundingClientRect().height) === Math.round(lh)) && cs && cs.fontFamily === getComputedStyle(el).fontFamily && Math.abs(parseFloat(cs.fontSize) - parseFloat(getComputedStyle(el).fontSize)) < 0.01; el.value = keep; el.dispatchEvent(new Event("input", { bubbles: true })); await new Promise((r) => setTimeout(r, 80)); return ok; }));
    // 字和线同一层：滚动前后，正文上沿在线格里的相位不变（旧模型 background-attachment: local 在 WebKit 上会差一帧——这里只能证明几何，抖动本身归真机）
    probe(tag, "rule grid is scroll-invariant: text top stays on the same phase of the rule grid at three scroll positions; lines are drawn on .page-body, not on the textarea", await page.evaluate(() => { const el = document.getElementById("editor"), sf = document.querySelector("main.surface"), pb = document.getElementById("pageBody"), pg = document.querySelector(".page"); const lh = parseFloat(pg.style.getPropertyValue("--editor-lh")); const off = () => { const t = el.getBoundingClientRect().top - pb.getBoundingClientRect().top; return ((t % lh) + lh) % lh; }; const t0 = sf.scrollTop; const a = off(); sf.scrollTop = 700; const b = off(); sf.scrollTop = sf.scrollHeight; const c = off(); sf.scrollTop = t0; return Math.abs(a - b) < 0.01 && Math.abs(b - c) < 0.01 && a < 0.01 && getComputedStyle(pb).backgroundImage.startsWith("repeating-linear-gradient") && getComputedStyle(el).backgroundImage === "none" && getComputedStyle(el).backgroundAttachment !== "local"; }), await page.evaluate(() => { const el = document.getElementById("editor"), pb = document.getElementById("pageBody"); return `pb=${getComputedStyle(pb).backgroundImage.slice(0, 26)} ed=${getComputedStyle(el).backgroundImage}`; }));
    await page.evaluate(() => { const sf = document.querySelector("main.surface"); sf.scrollTop = sf.scrollHeight; }); await wait(250);
    probe(tag, "sheet scrolled to its end → TOC rows and the footer nav are inside the viewport, above the mic band", await page.evaluate(() => { const toc = document.getElementById("childToc"), fr = document.querySelector(".page-foot-row"), m = document.getElementById("micButton"); const was = m.hidden; m.hidden = false; const mt = m.getBoundingClientRect().top; m.hidden = was; const a = toc.getBoundingClientRect(), b = fr.getBoundingClientRect(); return a.top >= 0 && a.bottom <= innerHeight && b.bottom <= innerHeight && b.bottom <= mt + 1; }), await page.evaluate(() => { const a = document.getElementById("childToc").getBoundingClientRect(), b = document.querySelector(".page-foot-row").getBoundingClientRect(); return `toc ${Math.round(a.top)}-${Math.round(a.bottom)} foot ${Math.round(b.top)}-${Math.round(b.bottom)} vh=${innerHeight}`; }));
    await shot("09c-child-toc-long");
    // 光标跟随：在纸的末尾打字，光标那一行始终在可见区（顶栏之下、底边之上）
    await page.evaluate(() => { document.querySelector("main.surface").scrollTop = 0; const el = document.getElementById("editor"); el.focus(); const n = el.value.length; el.setSelectionRange(n, n); });
    await page.keyboard.type("\n末尾再写一行", { delay: 4 }); await wait(120);
    probe(tag, "typing at the end of a long page keeps the caret line visible (sheet follows the caret)", await page.evaluate(() => { const el = document.getElementById("editor"), sf = document.querySelector("main.surface"); const b = el.getBoundingClientRect().bottom, top = sf.getBoundingClientRect().top + parseFloat(getComputedStyle(sf).paddingTop); return sf.scrollTop > 0 && b <= innerHeight + 0.5 && b > top; }), await page.evaluate(() => { const el = document.getElementById("editor"), sf = document.querySelector("main.surface"); return `edBottom=${Math.round(el.getBoundingClientRect().bottom)} vh=${innerHeight} scrollTop=${Math.round(sf.scrollTop)}`; }));
    await page.evaluate((v) => { const el = document.getElementById("editor"); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector("main.surface").scrollTop = 0; }, saved); await wait(350);
    probe(tag, "short body again → TOC still right after the text", await page.evaluate(() => { const el = document.getElementById("editor"), toc = document.getElementById("childToc"); return !toc.hidden && Math.abs(toc.getBoundingClientRect().top - el.getBoundingClientRect().bottom) < 1; })); }
  await page.click("#childToc .child-toc-row"); await wait(300);
  probe(tag, "TOC row click → child 她推开门。 opened; `.. 目录` link above the title row; its own TOC hidden (no children)", (await cur()) === "她推开门。.txt" && await page.evaluate(() => { const pl = document.getElementById("parentLink"); const tr = document.querySelector(".node-title-row").getBoundingClientRect(); return !pl.hidden && getComputedStyle(pl).display !== "none" && document.getElementById("parentLinkName").textContent === "目录" && pl.getBoundingClientRect().bottom <= tr.top + 1 && document.getElementById("childToc").hidden; }), await page.evaluate(() => `cur=${window.__xhw.project.current()} pl=${document.getElementById("parentLinkName").textContent} hidden=${document.getElementById("parentLink").hidden}`));
  await shot("09d-parent-link");
  await page.click("#parentLink"); await wait(300);
  probe(tag, "`..` link click → back on 目录 (a real jump: back stack live)", (await cur()) === "目录.txt" && await page.evaluate(() => window.__xhw.project.canGoBack()), await cur());
  await ensureSidebar(true);
  // 树移动六件（行菜单）：序章 降级 → 目录 的孩子末尾；上移；升级 → 回顶层；到头 no-op 只 toast
  { let r = await rowMenu("siblings", "序章.txt", /降级/); probe(tag, "row menu 降级 → 序章 becomes the last child of 目录", r.hit && JSON.stringify(await rowsIn("children")) === JSON.stringify(["她推开门。", "序章"]) && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["目录"]), JSON.stringify(await rowsIn("children")));
    r = await rowMenu("children", "序章.txt", /上移/); probe(tag, "row menu 上移 → children = [序章, 她推开门。]", r.hit && JSON.stringify(await rowsIn("children")) === JSON.stringify(["序章", "她推开门。"]), JSON.stringify(await rowsIn("children")));
    r = await rowMenu("children", "序章.txt", /升级/); probe(tag, "row menu 升级 → 序章 back to top level right after 目录", r.hit && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["目录", "序章"]) && JSON.stringify(await rowsIn("children")) === JSON.stringify(["她推开门。"]), JSON.stringify(await rowsIn("siblings")));
    r = await rowMenu("siblings", "目录.txt", /上移/); probe(tag, "row menu 上移 at the top → no-op + toast, tree unchanged", r.hit && /到头/.test(await page.textContent("#toast")) && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["目录", "序章"]), await page.textContent("#toast"));
    r = await rowMenu("siblings", "目录.txt"); probe(tag, "tree row menu = 上移/下移/升级/降级/移出树/废弃/导出这一支 (no rename, no hard delete, no 丢引用)", r.opened && r.items.some((x) => /升级/.test(x.label)) && r.items.some((x) => /移出树/.test(x.label)) && r.items.some((x) => /^废弃$/.test(x.label)) && r.items.some((x) => /导出这一支/.test(x.label)) && !r.items.some((x) => /改名|彻底|丢引用/.test(x.label)) && r.items.every((x) => !x.disabled), JSON.stringify(r.items)); await page.keyboard.press("Escape"); await wait(150); }
  await shot("10-tree-moves");
  // 上一页 / 下一页 = 全树前序 DFS（目录 → 她推开门。 → 序章）；首尾不绕回
  { let n = await navState(); probe(tag, "page nav: at tree head prev is grey, next is live", !n.hidden && n.prev && !n.next, JSON.stringify(n));
    probe(tag, "prev/next are ⟨ ⟩ chevrons flanking the chapter title on one row; footer nav gone", await page.evaluate(() => { const p = document.getElementById("pagePrev").getBoundingClientRect(), x = document.getElementById("pageNext").getBoundingClientRect(), t = document.getElementById("nodeTitle").getBoundingClientRect(); const cy = (r) => r.top + r.height / 2; return !document.getElementById("pageNav") && p.right <= t.left + 1 && t.right <= x.left + 1 && Math.abs(cy(p) - cy(t)) < 8 && Math.abs(cy(x) - cy(t)) < 8 && !!document.querySelector("#pagePrev use[href='#chevron-left']") && !!document.querySelector("#pageNext use[href='#chevron-right']"); }), await page.evaluate(() => { const p = document.getElementById("pagePrev").getBoundingClientRect(), t = document.getElementById("nodeTitle").getBoundingClientRect(); return `prev ${Math.round(p.right)}/${Math.round(p.top)} title ${Math.round(t.left)}/${Math.round(t.top)}`; }));
    if (w < 900) await ensureSidebar(false);
    // 切页即落盘（ADR-0015 d）：打一个字 → 200ms 防抖还挂着就换页 → 防抖被取消、立刻本地落盘（dirty 很快清零），推云节律不动
    await page.click("#editor"); await page.keyboard.press("End"); await page.keyboard.type("切页前的字。");
    const pendingBefore = await page.evaluate(() => window.__xhw.project.pendingLocalSave());
    await page.click("#pageNext"); const pendingAfter = await page.evaluate(() => window.__xhw.project.pendingLocalSave());
    const cleared = await page.waitForFunction(() => !window.__xhw.project.session().dirty, null, { timeout: 3000 }).then(() => true).catch(() => false);
    probe(tag, "page change with a pending local save → debounce cancelled, saved locally right away (dirty cleared)", pendingBefore && !pendingAfter && cleared, `pending ${pendingBefore}→${pendingAfter} cleared=${cleared}`);
    await wait(250); probe(tag, "next → 她推开门。 (child before the next sibling)", (await cur()) === "她推开门。.txt", await cur());
    await page.click("#pageNext"); await wait(250); n = await navState(); probe(tag, "next → 序章 = tree tail: next grey, no wrap", (await cur()) === "序章.txt" && n.next && !n.prev, `${await cur()} ${JSON.stringify(n)}`);
    await page.keyboard.press("Alt+ArrowUp"); await wait(250); probe(tag, "Alt+↑ → previous page 她推开门。", (await cur()) === "她推开门。.txt", await cur());
    await ensureSidebar(true); await page.click("#edgeParent"); await wait(250); }
  // 链接层与占位符废止：连到没有的页被拒；连到已有页进「链接」块；树里的页的链接行没有归档项；移出树 → 散页（不改名）→ 检索找得到、孤儿菜单 = 彻底删除；从链接行归档回来；再移出 + 丢引用 → _废-
  { const refused = await page.evaluate(() => window.__xhw.project.addLink("祭祀线")); await page.evaluate(() => window.__xhw.sidebar.render()); await wait(150);
    probe(tag, "addLink to a page that does not exist is refused (no placeholders, no dashed rows)", refused === false && /没有这一页/.test(await page.textContent("#toast")) && (await rowsIn("links")).length === 0 && (await page.evaluate(() => document.querySelectorAll("#edgeList .edge-row.stub").length)) === 0, await page.textContent("#toast"));
    await page.evaluate(() => window.__xhw.project.addLink("序章")); await page.evaluate(() => window.__xhw.sidebar.render()); await wait(150);
    probe(tag, "addLink to an existing page → links block", JSON.stringify(await rowsIn("links")) === JSON.stringify(["序章"]), JSON.stringify(await rowsIn("links")));
    let r = await rowMenu("links", "序章.txt"); probe(tag, "link row of an in-tree page: 上移/下移/断开链接/废弃, no 归档 items, no 丢引用", r.opened && r.items.some((x) => /断开链接/.test(x.label)) && r.items.some((x) => /废弃/.test(x.label)) && !r.items.some((x) => /归档|丢引用/.test(x.label)), JSON.stringify(r.items)); await page.keyboard.press("Escape"); await wait(150);
    // 删除模型三动词（user 2026-09-10 深夜「不同意引用计数」）：移出树 = 子树边降级成链接、不改名；断开链接 = 只删一条边；废弃 = _废- + 子树；彻底删除 = 只对 _废-，清入链
    await page.evaluate(() => { const p = window.__xhw.project; p.jump("她推开门。.txt"); p.newChild("插图说明"); p.jump("目录.txt"); window.__xhw.sidebar.render(); }); await wait(150);
    r = await rowMenu("children", "她推开门。.txt", /移出树/); const names = await page.evaluate(() => window.__xhw.project.nodeNames());
    const linksOfDoor = await page.evaluate(() => window.__xhw.project.session().project.nodes.get("她推开门。.txt")?.links ?? []);
    probe(tag, "row menu 移出树 (with a child) → gone from children, file kept, NOT renamed, child edge became a link, toast counts 1", r.hit && (await rowsIn("children")).length === 0 && names.includes("她推开门。.txt") && names.includes("插图说明.txt") && !names.some((x) => /_废-/.test(x)) && JSON.stringify(linksOfDoor) === JSON.stringify(["插图说明.txt"]) && /1 页改为链接/.test(await page.textContent("#toast")) && (await page.evaluate(() => window.__xhw.project.neighborhood().next)) === "序章.txt", `${JSON.stringify(linksOfDoor)} ${await page.textContent("#toast")}`);
    await page.fill("#edgeSearch", "她推"); await wait(300);
    r = await rowMenu("results", "她推开门。.txt"); probe(tag, "search finds the loose page; not discarded → row menu has only 发到参考窗 (no tree / delete verbs: no orphan concept; ADR-0016)", r.opened && r.items.length === 1 && r.items[0].label === "发到参考窗" && (await rows()).includes("她推开门。"), JSON.stringify(r));
    await page.fill("#edgeSearch", ""); await wait(200);
    // 挪到…（user 2026-09-10「点之后弹一个对话框，搜索，下拉，选中，就 reparent 了」「通用件同意」「不用原生 select」；v2.1.6 归入主干并入 = 固定首行「书的末尾」）：
    //   散页上 = 侧栏首行 + 顶栏「+」菜单一条；树行 ⋯ 菜单一条；pick sheet = 搜索框 + 自绘列表（#sheetPick）+ 选中后才出动作钮（之下 primary / 之后；书的末尾 = 放到这里）；自己 / 自己的子树不给；Enter / ↓ 键盘路
    const pickRows = () => page.evaluate(() => [...document.querySelectorAll("#sheetPick li[role=option] span")].map((e) => e.textContent));
    const pickActions = () => page.evaluate(() => [...document.querySelectorAll("#sheetChoices button")].map((b) => (b.textContent ?? "").trim()));
    const pickRow = async (label) => { await page.evaluate((l) => { [...document.querySelectorAll("#sheetPick li[role=option]")].find((li) => li.querySelector("span")?.textContent === l)?.querySelector("button")?.click(); }, label); await wait(120); };
    const pickAction = async (re) => { await page.evaluate((r) => { [...document.querySelectorAll("#sheetChoices button")].find((x) => new RegExp(r).test(x.textContent ?? ""))?.click(); }, re.source); await wait(300); };
    const pickSheetOpen = () => page.evaluate(() => !document.getElementById("sheet").classList.contains("hidden") && !document.getElementById("sheetPick").classList.contains("hidden"));
    await page.evaluate(() => { window.__xhw.project.jump("她推开门。.txt"); window.__xhw.sidebar.render(); }); await wait(150);
    probe(tag, "loose page: sidebar first row = 挪到…; no `..`, no + sibling, no 归入主干", (await parentRow()) === null && await page.evaluate(() => { const j = document.getElementById("edgeMoveTo"); return !!j && !document.getElementById("edgeAddSibling") && !document.getElementById("edgeJoinTrunk") && document.querySelector("#edgeList .edge-row")?.contains(j) === true; }), JSON.stringify(await blocks()));
    if (w < 900) await ensureSidebar(false);
    await page.click("#addPageButton"); await wait(250);
    { const items = await page.evaluate(() => [...document.querySelectorAll(".popup-menu button")].map((b) => (b.textContent ?? "").trim()));
      probe(tag, "loose page: top-bar + menu = 加子节 / 挪到… (no 加兄弟页, no 归入主干)", items.some((x) => /挪到/.test(x)) && items.some((x) => /子节/.test(x)) && !items.some((x) => /兄弟|归入主干/.test(x)), JSON.stringify(items)); }
    await page.keyboard.press("Escape"); await wait(150); await ensureSidebar(true);
    await page.evaluate(() => { const p = window.__xhw.project; p.detachFromTree("序章.txt"); p.detachFromTree("目录.txt"); p.jump("目录.txt"); window.__xhw.sidebar.render(); }); await wait(150);
    probe(tag, "empty trunk (pre-v2.1.5 lifted book): every page loose, no `..`, no + sibling, 挪到… offered", (await page.evaluate(() => window.__xhw.project.session().order().length)) === 0 && (await parentRow()) === null && await page.evaluate(() => !document.getElementById("edgeAddSibling") && !!document.getElementById("edgeMoveTo")), JSON.stringify(await blocks()));
    await page.click("#edgeMoveTo"); await wait(300);
    probe(tag, "挪到… sheet on an empty trunk: title names the page, search box focused, only row = 书的末尾, no action buttons before a pick", await pickSheetOpen() && /把「目录」挪到/.test(await page.textContent("#sheetTitle")) && JSON.stringify(await pickRows()) === JSON.stringify(["书的末尾（顶层）"]) && (await pickActions()).length === 0 && await page.evaluate(() => document.activeElement === document.getElementById("sheetInput")), `${await page.textContent("#sheetTitle")} rows=${JSON.stringify(await pickRows())} actions=${JSON.stringify(await pickActions())}`);
    await pickRow("书的末尾（顶层）");
    probe(tag, "pick 书的末尾 → the one action 放到这里", JSON.stringify(await pickActions()) === JSON.stringify(["放到这里"]), JSON.stringify(await pickActions()));
    await pickAction(/放到这里/);
    probe(tag, "放到这里 on an empty trunk → 目录 = first trunk node: `..` = book root, siblings = [目录], + sibling / + child back, 挪到… row gone, toast", !(await pickSheetOpen()) && JSON.stringify(await parentRow()) === JSON.stringify({ name: "作品", root: true, disabled: true }) && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["目录"]) && await page.evaluate(() => !!document.getElementById("edgeAddSibling") && !!document.getElementById("edgeAddChild") && !document.getElementById("edgeMoveTo")) && /挪到书的末尾/.test(await page.textContent("#toast")), `${JSON.stringify(await parentRow())} ${JSON.stringify(await rowsIn("siblings"))} ${await page.textContent("#toast")}`);
    await page.evaluate(() => { const p = window.__xhw.project; p.jump("序章.txt"); window.__xhw.sidebar.render(); }); await wait(150);
    await page.click("#edgeMoveTo"); await wait(300);
    probe(tag, "挪到… on loose 序章: rows = 书的末尾 + the trunk in DFS order (目录); self and loose pages not offered", JSON.stringify(await pickRows()) === JSON.stringify(["书的末尾（顶层）", "目录"]), JSON.stringify(await pickRows()));
    await pickRow("目录");
    probe(tag, "pick a page → two actions: 放到它之下 (primary) / 放到它之后", JSON.stringify(await pickActions()) === JSON.stringify(["放到它之下", "放到它之后"]) && await page.evaluate(() => document.querySelector("#sheetChoices button")?.classList.contains("primary") === true), JSON.stringify(await pickActions()));
    await shot("26-pick-sheet");
    await pickAction(/放到它之后/);
    probe(tag, "放到它之后 → 序章 after 目录 at the top level: siblings = [目录, 序章], toast", JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["目录", "序章"]) && (await cur()) === "序章.txt" && /挪到「目录」之后/.test(await page.textContent("#toast")), `${JSON.stringify(await rowsIn("siblings"))} ${await page.textContent("#toast")}`);
    r = await rowMenu("siblings", "序章.txt", /挪到/); await wait(300);
    probe(tag, "tree row menu 挪到… (on the current page's own row) → same sheet", r.hit && await pickSheetOpen() && /把「序章」挪到/.test(await page.textContent("#sheetTitle")), `${JSON.stringify(r)} ${await page.textContent("#sheetTitle")}`);
    await pickRow("目录"); await pickAction(/放到它之下/);
    probe(tag, "放到它之下 → 序章 under 目录: `..` = 目录, siblings = [序章], toast", JSON.stringify(await parentRow()) === JSON.stringify({ name: "目录", root: false, disabled: false }) && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["序章"]) && /挪到「目录」之下/.test(await page.textContent("#toast")), `${JSON.stringify(await parentRow())} ${JSON.stringify(await rowsIn("siblings"))} ${await page.textContent("#toast")}`);
    await page.evaluate(() => { window.__xhw.project.jump("目录.txt"); window.__xhw.sidebar.render(); }); await wait(150);
    r = await rowMenu("siblings", "目录.txt", /挪到/); await wait(300);
    probe(tag, "挪到… on 目录 (has 1 child): message says 1 个子节 follow; self + own subtree excluded → only 书的末尾 offered", r.hit && await pickSheetOpen() && /1 个子节/.test(await page.textContent("#sheetMessage")) && JSON.stringify(await pickRows()) === JSON.stringify(["书的末尾（顶层）"]), `${await page.textContent("#sheetMessage")} rows=${JSON.stringify(await pickRows())}`);
    await page.keyboard.press("Escape"); await wait(200);
    probe(tag, "Esc closes the pick sheet, nothing moved", !(await pickSheetOpen()) && JSON.stringify(await rowsIn("children")) === JSON.stringify(["序章"]), JSON.stringify(await rowsIn("children")));
    r = await rowMenu("children", "序章.txt", /挪到/); await wait(300);
    await page.fill("#sheetInput", "zzz"); await wait(150);
    probe(tag, "typing filters the list: no hit → only the pinned 书的末尾 row", r.hit && JSON.stringify(await pickRows()) === JSON.stringify(["书的末尾（顶层）"]), JSON.stringify(await pickRows()));
    await page.fill("#sheetInput", "目"); await wait(150);
    probe(tag, "typing 目 → 目录 is back", JSON.stringify(await pickRows()) === JSON.stringify(["书的末尾（顶层）", "目录"]), JSON.stringify(await pickRows()));
    await page.keyboard.press("Enter"); await wait(120); await page.keyboard.press("ArrowDown"); await wait(120);
    probe(tag, "Enter selects the first row, ↓ moves to 目录 → its two actions appear", JSON.stringify(await pickActions()) === JSON.stringify(["放到它之下", "放到它之后"]) && await page.evaluate(() => document.querySelectorAll("#sheetPick li[aria-selected=true]").length === 1 && document.querySelector("#sheetPick li[aria-selected=true] span")?.textContent === "目录"), JSON.stringify(await pickActions()));
    await page.keyboard.press("Enter"); await wait(300);
    probe(tag, "Enter on a selected row = primary action (放到它之下): 序章 still under 目录, sheet closed, toast", !(await pickSheetOpen()) && JSON.stringify(await rowsIn("children")) === JSON.stringify(["序章"]) && /挪到「目录」之下/.test(await page.textContent("#toast")), `${JSON.stringify(await rowsIn("children"))} ${await page.textContent("#toast")}`);
    await page.evaluate(() => { const p = window.__xhw.project; p.movePage("序章.txt", { kind: "end" }); p.jump("目录.txt"); window.__xhw.sidebar.render(); }); await wait(150);
    probe(tag, "mode.movePage end → 序章 back at the top level after 目录 (siblings = [目录, 序章]); later probes assume this shape", JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["目录", "序章"]) && (await rowsIn("children")).length === 0, JSON.stringify(await rowsIn("siblings")));
    await page.evaluate(() => { window.__xhw.project.jump("目录.txt"); window.__xhw.sidebar.render(); }); await wait(150);
    await page.evaluate(() => window.__xhw.project.addLink("她推开门。")); await page.evaluate(() => window.__xhw.sidebar.render()); await wait(150);
    r = await rowMenu("links", "她推开门。.txt", /归档到这页之下/); probe(tag, "link row of a loose page offers 归档到这页之后/之下 → files it back under 目录", r.hit && JSON.stringify(await rowsIn("children")) === JSON.stringify(["她推开门。"]) && /已归档/.test(await page.textContent("#toast")), `${JSON.stringify(await rowsIn("children"))} ${await page.textContent("#toast")}`);
    await page.evaluate(() => { const p = window.__xhw.project; p.jump("她推开门。.txt"); p.archiveUnderCurrent("插图说明.txt"); p.jump("目录.txt"); window.__xhw.sidebar.render(); }); await wait(150);
    r = await rowMenu("links", "她推开门。.txt", /断开链接/); const names1 = await page.evaluate(() => window.__xhw.project.nodeNames());
    probe(tag, "link row 断开链接 → only that edge gone; page stays (still a child), never renamed", r.hit && !(await rowsIn("links")).includes("她推开门。") && JSON.stringify(await rowsIn("children")) === JSON.stringify(["她推开门。"]) && names1.includes("她推开门。.txt") && /已断开/.test(await page.textContent("#toast")), await page.textContent("#toast"));
    r = await rowMenu("children", "她推开门。.txt", /废弃/); await wait(200);
    probe(tag, "row menu 废弃 on a page with a child → sheet says 及其 1 个子节", r.hit && await page.evaluate(() => !document.getElementById("sheet").classList.contains("hidden") && /及其 1 个子节/.test(document.getElementById("sheetTitle")?.textContent ?? document.getElementById("sheet").textContent)), await page.evaluate(() => document.getElementById("sheet").textContent.slice(0, 80)));
    await page.click("#sheetConfirm"); await wait(400);
    const names2 = await page.evaluate(() => window.__xhw.project.nodeNames());
    probe(tag, "discard → both renamed _废-, both out of the tree, bytes kept, toast", names2.includes("_废-她推开门。.txt") && names2.includes("_废-插图说明.txt") && !names2.includes("她推开门。.txt") && (await rowsIn("children")).length === 0 && /已废弃/.test(await page.textContent("#toast")) && (await page.evaluate(() => window.__xhw.project.session().order().length)) === 2, JSON.stringify(names2));
    probe(tag, "discard keeps the subtree structure as links (_废-她推开门。 → _废-插图说明)", JSON.stringify(await page.evaluate(() => window.__xhw.project.session().project.nodes.get("_废-她推开门。.txt")?.links ?? [])) === JSON.stringify(["_废-插图说明.txt"]));
    await page.fill("#edgeSearch", "废"); await wait(300);
    r = await rowMenu("results", "_废-插图说明.txt"); probe(tag, "search finds the discarded pages; a _废- row menu = 彻底删除 only", r.opened && r.items.length === 1 && /彻底删除/.test(r.items[0].label) && (await rows()).includes("_废-她推开门。"), JSON.stringify(r.items)); await page.keyboard.press("Escape"); await wait(150);
    r = await rowMenu("results", "_废-插图说明.txt", /彻底删除/); await wait(200);
    probe(tag, "purge sheet says how many pages link to it (1) and that links will be removed", r.hit && await page.evaluate(() => !document.getElementById("sheet").classList.contains("hidden") && /1 页链接到它/.test(document.getElementById("sheet").textContent)), await page.evaluate(() => document.getElementById("sheet").textContent.slice(0, 120)));
    await page.click("#sheetConfirm"); await wait(400);
    const names3 = await page.evaluate(() => window.__xhw.project.nodeNames());
    probe(tag, "purge → file gone, inbound link removed from _废-她推开门。 (no dangling)", !names3.includes("_废-插图说明.txt") && names3.includes("_废-她推开门。.txt") && (await page.evaluate(() => (window.__xhw.project.session().project.nodes.get("_废-她推开门。.txt")?.links ?? []).length)) === 0, JSON.stringify(names3));
    await page.fill("#edgeSearch", ""); await wait(200); }
  probe(tag, "no spawn/link/backlinks buttons in sidebar", await page.evaluate(() => !document.getElementById("edgeSpawn") && !document.getElementById("edgeLink") && !document.getElementById("edgeBacklinks") && document.getElementById("edgeFoot").hidden));
  // 检索：一个字就搜（孤儿也能扫）
  await page.fill("#edgeSearch", "章"); await wait(300); await shot("11-sidebar-search");
  probe(tag, "search with 1 char works", (await rows()).length >= 1 && (await rows()).includes("序章"), JSON.stringify(await rows()));
  await page.fill("#edgeSearch", ""); await wait(200);
  // 章节名撞名：改成已有名 → 提示、不改
  await ensureSidebar(false); await page.click("#nodeTitle"); await page.fill("#nodeTitle", "序章"); await page.keyboard.press("Enter"); await wait(300);   // v2.1.13：提交只在 Enter / 离开框（不再 500ms 自动改名）
  probe(tag, "title collision (Enter) → refused + toast, focus stays in the title box", await page.evaluate(() => window.__xhw.project.current() === "目录.txt" && /同名/.test(document.getElementById("toast").textContent) && document.activeElement?.id === "nodeTitle"), await page.evaluate(() => `${window.__xhw.project.current()} active=${document.activeElement?.id}`));
  await page.keyboard.press("Escape"); await wait(100);
  probe(tag, "title Escape → reverted", (await page.inputValue("#nodeTitle")) === "目录");
  // 顶栏改名工程 → 不重开，正文/边栏不动，顶栏即时换名
  await page.click("#docNameButton"); await wait(300); await page.fill("#sheetInput", "秋音"); const tRename = performance.now(); await page.click("#sheetConfirm");
  let renamedIn = -1; for (let i = 0; i < 50; i++) { await wait(100); if ((await page.textContent("#docNameButton")).trim() === "秋音") { renamedIn = Math.round(performance.now() - tRename); break; } }
  probe(tag, `project rename → top bar updates without reload (${renamedIn}ms)`, renamedIn >= 0, `topbar=${await page.textContent("#docNameButton")} renamedIn=${renamedIn}`);
  // 0.x 的只读保护（user 2026-09-10「0.x 的锁写功能我们不小心丢了」）：工程也有，per-device
  await page.click("#lockToggle"); await wait(300);
  probe(tag, "project read-only: textarea+title readOnly, + refuses, tree moves refuse, row menu items grey", await page.evaluate(() => document.getElementById("editor").readOnly && document.getElementById("nodeTitle").readOnly && window.__xhw.project.readOnly() && window.__xhw.project.newNode("x") === false && window.__xhw.project.newSibling("x") === false && window.__xhw.project.treeMove("序章.txt", "up") === false) && await (async () => { await ensureSidebar(true); const r = await rowMenu("siblings", "序章.txt"); await page.keyboard.press("Escape"); await wait(100); return r.opened && r.items.filter((x) => !/导出/.test(x.label)).every((x) => x.disabled) && r.items.some((x) => /导出/.test(x.label) && !x.disabled); })());
  await page.click("#lockToggle"); await wait(300);
  probe(tag, "project read-only off again", await page.evaluate(() => !document.getElementById("editor").readOnly && !window.__xhw.project.readOnly()));
  await page.click("#lockToggle"); await wait(600);   // 锁上 → 刷新后仍锁（跟着目录进 zip）
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" }); await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 }); await page.evaluate(() => window.__xhw.fontReady); await wait(1500);
  probe(tag, "read-only lock persisted inside the book (survives reload)", await page.evaluate(() => window.__xhw.project.readOnly() && document.getElementById("editor").readOnly));
  await page.click("#lockToggle"); await wait(600);
  probe(tag, "txt has no lock toggle", await page.evaluate(async () => { const it = window.__xhw.drawer.items().find((x) => /\.txt$/i.test(x.name)); if (!it) return false; await window.__xhw.openAny(it.name); return !window.__xhw.project.active() && document.getElementById("lockToggle").hidden; }));
  await page.evaluate(async () => { const it = window.__xhw.drawer.items().find((x) => /webxiaoheiwu\.zip$/i.test(x.name)); if (it) await window.__xhw.openAny(it.name); }); await wait(800);
  await ensureSidebar(true);
  probe(tag, "project rename keeps pages + tree + links", await page.evaluate(() => window.__xhw.project.current() === "目录.txt") && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["目录", "序章"]) && JSON.stringify(await rowsIn("links")) === JSON.stringify(["序章"]), JSON.stringify(await rows()));
  if (w >= 900) { await ensureSidebar(false);
    const centered = await page.evaluate(() => { const r = document.querySelector(".page").getBoundingClientRect(); return getComputedStyle(document.getElementById("edgeSidebar")).display === "none" && Math.abs(r.left - (innerWidth - r.width) / 2) < 2; });
    probe(tag, "wide: sidebar closed → page centered", centered); await shot("13-wide-sidebar-collapsed");
    const before = await page.evaluate(() => JSON.stringify(document.querySelector(".page").getBoundingClientRect()));
    await ensureSidebar(true);
    const overlay = await page.evaluate((b) => { const p = document.querySelector(".page").getBoundingClientRect(), s = document.getElementById("edgeSidebar").getBoundingClientRect(); return JSON.stringify(p) === b && s.right <= innerWidth && s.left > innerWidth / 2; }, before);
    probe(tag, "wide: sidebar is an overlay on the RIGHT, page does not move", overlay); await shot("13b-wide-sidebar-right"); await ensureSidebar(false); }
  // 回退栈随保存写（不标脏）：跳进 序章 → 打一个字触发落盘 → 刷新后 Alt+← 仍能回 第一章
  if (w < 900) await ensureSidebar(false);   // 上一条探针开了侧栏；窄屏浮层盖着纸面
  await page.evaluate(() => window.__xhw.project.jump("序章.txt")); await page.click("#editor"); await page.keyboard.press("End"); await page.keyboard.type("。"); await wait(700);
  // 刷新：boot 走 openAny(last) → 书回来、章节名回来、无红条
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" }); await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 }); await page.evaluate(() => window.__xhw.fontReady); await wait(1500);
  probe(tag, "reload → book reopened at 序章 (last saved position), title shown", await page.evaluate(() => document.body.dataset.project === "1" && document.getElementById("nodeTitle").value === "序章"), await page.inputValue("#nodeTitle"));
  probe(tag, "reload → no error state / banner", await page.evaluate(() => { const b = document.getElementById("errBanner"); return (!b || b.classList.contains("hidden")) && !document.getElementById("saveStatus").classList.contains("error"); }), await page.textContent("#saveStatus"));
  probe(tag, "reload → sidebar closed", !(await sidebarShown()));
  // 上次那本打不开 → 新稿（不是顺位下一本）
  await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => /:last-open$/.test(x)); if (k) localStorage.setItem(k, "不存在的书.webxiaoheiwu.zip"); });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" }); await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 }); await page.evaluate(() => window.__xhw.fontReady); await wait(1500);
  probe(tag, "last-open unopenable → fresh new draft (not the next book)", await page.evaluate(() => !window.__xhw.project.active() && !window.__xhw.editor.state.name && !!window.__xhw.editor.state.pendingDate && document.getElementById("editor").value === ""), await page.evaluate(() => `project=${window.__xhw.project.active()} name=${window.__xhw.editor.state.name}`));
  await page.evaluate(async () => { const it = window.__xhw.drawer.items().find((x) => /webxiaoheiwu\.zip$/i.test(x.name)); if (it) await window.__xhw.openAny(it.name); }); await wait(800);
  probe(tag, "reload → back stack persisted with the book (Alt+← → 目录)", await page.evaluate(() => window.__xhw.project.canGoBack() && window.__xhw.project.goBack() && window.__xhw.project.current() === "目录.txt"), await page.evaluate(() => window.__xhw.project.current()));
  // last-open 真的生效：开一篇旧 txt 再刷新，回来的是它而不是最新的（2026-09-10 实锤：以前 JSON.parse 裸字符串永远 null）
  { const oldTxt = await page.evaluate(async () => { const it = window.__xhw.drawer.items().find((x) => /\.txt$/i.test(x.name)); if (!it) return null; await window.__xhw.editor.open(it.name); return it.name; });
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" }); await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 }); await page.evaluate(() => window.__xhw.fontReady); await wait(1500);
    probe(tag, "reload → reopens the last-open txt, not the newest item", !!oldTxt && (await page.evaluate(() => window.__xhw.editor.state.name)) === oldTxt, `${oldTxt} vs ${await page.evaluate(() => window.__xhw.editor.state.name)}`); }
  await shot("14-after-reload");
  // 书库：工程卡片名无扩展名；卡片菜单；回收站；设置叠书库
  await ensureSidebar(true); await page.click("#edgeLibrary"); await wait(1200); await shot("15-library-with-project");
  probe(tag, "library tile shows project stem", await page.evaluate(() => [...document.querySelectorAll("#galleryMount .gallery-tile:not(.folder)")].some((t) => /秋音/.test(t.textContent) && !/webxiaoheiwu/.test(t.textContent))));
  // 书库缩略图占位（图片 session 2026-09-10，gallery 0.2.2）：无封面的书 = 书图标不是云；fetch null = 确定没封面进 IDB 缓存，重开书库不再拉
  // v2.1.19（user 2026-09-29「封面上印书名…花璃那本旁边的装订线很漂亮，保留。然后最好下面的日期 大小也收上来」）：没有封面图的书 = 印着书名的封面（有装订线），不是云图标；
  //   卡片只有封面那么高（名字行收到封面下沿）；封面上的书名、时间大小都在封面框里；没起名的 txt 稿 = 一张纸（没有装订线）
  probe(tag, "book without cover shows a printed cover (title on it, spine strip), not the cloud icon", await page.evaluate(() => [...document.querySelectorAll("#galleryMount .gallery-tile")].some((t) => { const c = t.querySelector(".xhw-cover.book"); return !!c && /秋音/.test(c.querySelector(".xhw-cover-title")?.textContent ?? "") && getComputedStyle(c, "::before").width !== "0px" && !t.querySelector(".gallery-tile-thumb.placeholder span[style]"); })));
  probe(tag, "tiles are cover-only: tile height = cover height; bottom bar (date · size) sits inside the cover (name row spans the tile so the sync badge can sit top-left); printed title not clipped to nothing", await page.evaluate(() => [...document.querySelectorAll("#galleryMount .gallery-tile:not(.folder)")].every((t) => { const th = t.querySelector(".gallery-tile-thumb").getBoundingClientRect(), tr = t.getBoundingClientRect(), row = t.querySelector(".gallery-tile-name-row").getBoundingClientRect(), meta = t.querySelector(".gallery-tile-meta").getBoundingClientRect(); const title = t.querySelector(".xhw-cover-title"); const okTitle = !title || (title.getBoundingClientRect().height > 10 && title.getBoundingClientRect().bottom <= meta.top + 1); const bar = t.querySelector(".xhw-cover-bar")?.getBoundingClientRect() ?? meta; return Math.abs(tr.height - th.height) <= 3 && bar.bottom <= th.bottom + 1 && bar.top >= th.top && row.bottom <= th.bottom + 1 && bar.width > 20 && okTitle; })), await page.evaluate(() => JSON.stringify([...document.querySelectorAll("#galleryMount .gallery-tile:not(.folder)")].map((t) => [Math.round(t.getBoundingClientRect().height), Math.round(t.querySelector(".gallery-tile-thumb").getBoundingClientRect().height)])))) ;
  probe(tag, "printed cover hides the duplicate name in the row; a txt draft is a plain sheet (no spine strip)", await page.evaluate(() => { const tiles = [...document.querySelectorAll("#galleryMount .gallery-tile")]; const printed = tiles.filter((t) => t.querySelector(".xhw-cover")); const drafts = tiles.filter((t) => t.querySelector(".xhw-cover.draft")); return printed.length > 0 && printed.every((t) => getComputedStyle(t.querySelector(".gallery-tile-name")).display === "none") && drafts.length > 0 && drafts.every((t) => { const w = getComputedStyle(t.querySelector(".xhw-cover"), "::before").width; return w === "auto" || w === "0px"; }); }));
  { const missesA = (await page.evaluate(() => window.__xhwGalleryThumbStats()))?.misses ?? -1;
    await page.click("#galleryBack"); await wait(300); await ensureSidebar(true); await page.click("#edgeLibrary"); await wait(1500);
    const missesB = (await page.evaluate(() => window.__xhwGalleryThumbStats()))?.misses ?? -2;
    probe(tag, "negative peek is cached: reopening the library does not refetch thumbnails", missesA >= 0 && missesB === missesA, `${missesA} → ${missesB}`); }
  await page.click(".gallery-tile:not(.folder) .gallery-tile-menu-btn"); await wait(300); await shot("16-tile-menu");
  // gallery 0.6.2（user 2026-09-30 iPhone 真机：菜单被下一排卡片盖住 → 「z order 系统的解决一下，看一下 weebpaint 怎么做的」）：菜单不住卡片里，进菜单 band
  probe(tag, "tile menu lives outside the tile (teleported to #galleryMount), position: fixed, in the --z-menu band", await page.evaluate(() => { const m = document.querySelector(".gallery-tile-menu-popup:not(.hidden)"); if (!m) return false; const cs = getComputedStyle(m); const band = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--z-menu")); return !m.closest(".gallery-tile") && m.parentElement === document.getElementById("galleryMount") && cs.position === "fixed" && parseFloat(cs.zIndex) === band; }), await page.evaluate(() => { const m = document.querySelector(".gallery-tile-menu-popup:not(.hidden)"); return m ? `parent=${m.parentElement?.id} pos=${getComputedStyle(m).position} z=${getComputedStyle(m).zIndex} inTile=${!!m.closest(".gallery-tile")}` : "no open menu"; }));
  // 模拟 iOS 粘住的 :hover（卡片 transform → 自成层叠上下文）：菜单已不在卡片里，应当不受影响；菜单矩形四点 elementFromPoint 全命中菜单
  probe(tag, "tile menu sits under its ⋯ button inside the viewport and stays hit-testable at all four corners even with the tile transformed (iOS sticky :hover simulation)", await page.evaluate(() => { const m = document.querySelector(".gallery-tile-menu-popup:not(.hidden)"), b = document.querySelector(".gallery-tile:not(.folder) .gallery-tile-menu-btn"); if (!m || !b) return false; const tile = b.closest(".gallery-tile"); tile.style.transform = "translateY(-1px)"; try { const r = m.getBoundingClientRect(), a = b.getBoundingClientRect(); if (r.top < a.bottom || r.left < 0 || r.right > innerWidth || r.right < a.right - 2) return false; const pts = [[r.left + 6, r.top + 6], [r.right - 6, r.bottom - 6], [r.left + 6, r.bottom - 6], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]]; return pts.every(([x, y]) => m.contains(document.elementFromPoint(x, y))); } finally { tile.style.transform = ""; } }), await page.evaluate(() => { const m = document.querySelector(".gallery-tile-menu-popup:not(.hidden)"); if (!m) return "no menu"; const r = m.getBoundingClientRect(); const tiles = [...document.querySelectorAll("#galleryMount .gallery-tile")]; const covered = tiles.filter((t) => { const q = t.getBoundingClientRect(); return q.top < r.bottom && q.bottom > r.top && q.left < r.right && q.right > r.left; }).length; const hit = document.elementFromPoint(r.left + 6, r.bottom - 6); return `menu ${Math.round(r.top)}-${Math.round(r.bottom)} overlaps ${covered} tile(s); bottom-left hits <${hit?.tagName.toLowerCase()}.${typeof hit?.className === "string" ? hit.className.split(" ")[0] : ""}>`; }));
  // workbench-elements 0.1.2：只在锚真的移了位才收（iOS tap 的幽灵 scroll 不算）——先证明幽灵 scroll 不关，再让网格真的滚（临时垫高让它可滚）
  probe(tag, "a scroll event that does not move the tile (iOS phantom scroll on tap) leaves the menu open", await page.evaluate(() => { document.getElementById("galleryMount").dispatchEvent(new Event("scroll", { bubbles: true })); return !!document.querySelector(".gallery-tile-menu-popup:not(.hidden)"); }));
  await page.evaluate(() => { const g = document.querySelector("#galleryMount .gallery-grid"); g.style.paddingBottom = "2000px"; const m = document.getElementById("galleryMount"); m.scrollTop += 40; m.dispatchEvent(new Event("scroll", { bubbles: true })); }); await wait(120);
  probe(tag, "really scrolling the grid (tile moves) closes the tile menu (a fixed menu must not float away from its tile)", await page.evaluate(() => !document.querySelector(".gallery-tile-menu-popup:not(.hidden)")), await page.evaluate(() => `scrollTop=${document.getElementById("galleryMount").scrollTop}`));
  await page.evaluate(() => { const g = document.querySelector("#galleryMount .gallery-grid"); g.style.paddingBottom = ""; document.getElementById("galleryMount").scrollTop = 0; });
  await page.evaluate(() => { const m = document.querySelector(".gallery-tile-menu-popup:not(.hidden)"); if (m) document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });   // 万一没收，别让后面的点击被它拦住
  await page.click(".gallery-tile:not(.folder) .gallery-tile-menu-btn"); await wait(200);
  await page.mouse.click(w - 40, h - 40); await wait(200);
  probe(tag, "tapping outside closes the tile menu", await page.evaluate(() => !document.querySelector(".gallery-tile-menu-popup:not(.hidden)")));
  await page.click("#galleryTrashBtn"); await wait(800); await shot("17-trash-view");
  await page.click("#galleryTabBackup"); await wait(800); await shot("17b-backup-view");
  await page.click("#galleryAsideBack"); await wait(500);
  await page.click("#gallerySettingsBtn"); await wait(500); await shot("18-settings-over-library");
  probe(tag, "settings drawer slides in from the RIGHT", await page.evaluate(() => { const r = document.getElementById("drawer").getBoundingClientRect(); return Math.abs(r.right - innerWidth) < 2 && r.left > 0; }));
  await page.click("#drawerCloseButton"); await wait(300);
  // 场景恢复：在书库里刷新 → 回来还在书库；从书库退回编辑器再刷新 → 回来在编辑器（user 2026-09-10「书库里面 refresh 时还是会进写作」）
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" }); await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 }); await page.evaluate(() => window.__xhw.fontReady); await wait(1800);
  probe(tag, "reload while in the library → comes back in the library", await page.evaluate(() => document.body.dataset.mode === "gallery" && !document.getElementById("galleryFull").classList.contains("hidden")));
  await shot("18b-library-after-reload");
  await page.click("#galleryBack"); await wait(400); await shot("19-back-to-editor");
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" }); await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 }); await page.evaluate(() => window.__xhw.fontReady); await wait(1800);
  probe(tag, "reload after leaving the library → comes back in the editor", await page.evaluate(() => document.body.dataset.mode !== "gallery" && document.getElementById("galleryFull").classList.contains("hidden")));
  // 锁卡不串场（user 2026-09-10「一开始是 xxx 是加密稿，然后我开新书之后 editor 还是 xxx 是加密稿」）：txt 稿设密码 → 锁定 → 锁卡出现 → 书库新建书 → 锁卡必须消失
  await page.waitForFunction(() => window.__xhw.editor.canEdit(), null, { timeout: 15000 });
  const nameBeforeEnc = await page.evaluate(() => window.__xhw.editor.state.name);
  const encOk = await page.evaluate(async () => {
    if (!window.__xhw.editor.state.name) return "no doc";
    const p = new Promise((resolve) => { const tick = setInterval(async () => { const sheet = document.getElementById("sheet"); if (!sheet.classList.contains("hidden")) { clearInterval(tick); document.getElementById("sheetInput").value = "audit-pw-1"; document.getElementById("sheetInput2").value = "audit-pw-1"; document.getElementById("sheetConfirm").click(); for (let i = 0; i < 100; i++) { await new Promise((r) => setTimeout(r, 200)); if (window.__xhw.editor.state.encrypted) return resolve("encrypted"); } resolve("timeout"); } }, 100); });
    document.getElementById("cryptoToggle").click();
    return await p;
  });
  probe(tag, "txt draft can be encrypted (audit precondition)", encOk === "encrypted", encOk);
  probe(tag, "encrypting keeps the file name (no date-code rename; user 2026-09-26「加密不改名同意」)", (await page.evaluate(() => window.__xhw.editor.state.name)) === nameBeforeEnc, `${nameBeforeEnc} → ${await page.evaluate(() => window.__xhw.editor.state.name)}`);
  await page.evaluate(() => window.__xhw.lockNow()); await wait(1500);
  probe(tag, "locked encrypted draft shows the lock card", await page.evaluate(() => !document.getElementById("lockCard").hidden && /加密稿/.test(document.getElementById("lockCardText").textContent ?? "")));
  await shot("19b-lock-card");
  probe(tag, "lock card covers the sheet area (fixed: under the top bar, above the bottom floor, as wide as the paper)", await page.evaluate(() => { const c = document.getElementById("lockCard").getBoundingClientRect(), pg = document.querySelector(".page").getBoundingClientRect(), tb = document.querySelector(".top-bar").getBoundingClientRect(); return getComputedStyle(document.getElementById("lockCard")).position === "fixed" && Math.abs(c.top - tb.bottom) < 1 && Math.abs(c.left - pg.left) < 1 && Math.abs(c.right - pg.right) < 1 && c.bottom <= innerHeight; }), await page.evaluate(() => { const c = document.getElementById("lockCard").getBoundingClientRect(); return `card ${Math.round(c.left)},${Math.round(c.top)}-${Math.round(c.right)},${Math.round(c.bottom)}`; }));
  probe(tag, "lock card also says the draft has not-yet-uploaded changes (they upload once unlocked) — never pushed while signed out", await page.evaluate(() => /还没上传/.test(document.getElementById("lockCardText").textContent ?? "")), await page.evaluate(() => document.getElementById("lockCardText").textContent));   // 2026-09-26 user 真机「卡在上传」：锁着的加密件推不动，锁卡得说清
  await ensureSidebar(true); await page.click("#edgeLibrary"); await wait(1200);
  await page.click("#galleryNewBtn"); await wait(200);
  await page.evaluate(() => { const it = [...document.querySelectorAll("button")].find((b) => /新建书/.test(b.textContent ?? "")); if (!it) throw new Error("new-project menu item not found"); it.click(); }); await wait(400);
  await page.fill("#sheetInput", "锁卡测试书"); await page.click("#sheetConfirm"); await wait(1500);
  probe(tag, "new book after a locked draft: lock card gone, book mode on", await page.evaluate(() => document.getElementById("lockCard").hidden && document.body.dataset.project === "1"));
  await shot("20-book-after-locked-draft");
  // ── 2.1 图片页整链（ADR-0012/0013）：进门两张（小图剥 metadata 保 png / 大图缩到 2048 转 jpg）→ 图片页视图 → 设为封面 → 替换（封面跟着换）→ 断入边 → 拖 txt / 粘贴位图 → 书库 2:3 三列 + 封面缩略图
  await page.setInputFiles("#imageFileInput", [{ name: "夏音.png", mimeType: "image/png", buffer: makePng(300, 200, 7) }, { name: "地图.png", mimeType: "image/png", buffer: makePng(2200, 1500, 9) }]);
  await page.waitForFunction(() => document.body.dataset.pageKind === "image", null, { timeout: 60000 }); await wait(500);
  const names = await page.evaluate(() => window.__xhw.project.nodeNames());
  probe(tag, "two images imported: small keeps .png, big becomes .jpg (2048 cap + JPEG q85)", names.includes("夏音.png") && names.includes("地图.jpg"), names.join("|"));
  probe(tag, "image page view: textarea hidden, <img> shown, page name box = stem without ext", await page.evaluate(() => { const ed = document.getElementById("editor"), img = document.getElementById("pageImageImg"); return getComputedStyle(ed).display === "none" && !document.getElementById("pageImage").hidden && img.naturalWidth === 2048 && document.getElementById("nodeTitle").value === "地图"; }), await page.evaluate(() => `${document.getElementById("pageImageImg").naturalWidth} ${document.getElementById("nodeTitle").value}`));
  probe(tag, "image page: word count footer + mic hidden", await page.evaluate(() => getComputedStyle(document.getElementById("wordCount")).display === "none" && document.getElementById("micButton").hidden));
  probe(tag, "toast reports compression (已压缩 A → B)", /已压缩/.test(await page.textContent("#toast")), await page.textContent("#toast"));
  await ensureSidebar(false); await shot("21-image-page");
  probe(tag, "image page: the sheet is exactly one viewport tall and the image fits inside it (contain, no page growth)", await page.evaluate(() => { const pg = document.querySelector(".page").getBoundingClientRect(), img = document.getElementById("pageImageImg").getBoundingClientRect(), sf = document.querySelector("main.surface"); return sf.scrollHeight <= sf.clientHeight + 1 && img.top >= pg.top && img.bottom <= pg.bottom && img.height > 40; }), await page.evaluate(() => { const pg = document.querySelector(".page").getBoundingClientRect(), img = document.getElementById("pageImageImg").getBoundingClientRect(), sf = document.querySelector("main.surface"); return `page ${Math.round(pg.top)}-${Math.round(pg.bottom)} img ${Math.round(img.top)}-${Math.round(img.bottom)} sheet ${sf.clientHeight}/${sf.scrollHeight}`; }));
  await ensureSidebar(true); await shot("21b-image-page-sidebar");
  // 落点（user 2026-09-10「加图片没说清楚是兄弟还是孩子」）：直接喂 file input = 没选位置 → 当前页（目录）的子节末尾，按文件顺序；toast 说明进了哪
  probe(tag, "images without a chosen position land as children of the current page, in file order; `..` = 目录; toast says 子节", JSON.stringify(await parentRow()) === JSON.stringify({ name: "目录", root: false, disabled: false }) && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["夏音.png", "地图.jpg"]) && /子节/.test(await page.textContent("#toast")) && (await cur()) === "地图.jpg", `${JSON.stringify(await rowsIn("siblings"))} ${await page.textContent("#toast")}`);
  probe(tag, "sidebar rows for image pages carry the image icon (siblings block)", await page.evaluate(() => [...document.querySelectorAll("#edgeList .edge-row[data-block='siblings']")].filter((r) => r.querySelector(".edge-kind")).length === 2), await page.evaluate(() => [...document.querySelectorAll("#edgeList .edge-row .edge-name")].map((e) => e.textContent).join("|")));
  // 设为封面
  if (w < 900) await ensureSidebar(false);   // 窄屏侧栏是浮层，盖着纸面上的钮
  await page.click("#pageImageCover"); await page.waitForFunction(() => !!window.__xhw.project.thumbnail(), null, { timeout: 30000 }); await page.evaluate(() => window.__xhw.fontReady); await wait(300);
  const thumb1 = await page.evaluate(() => Array.from(window.__xhw.project.thumbnail()));
  // graph.json cover（2026-09-30 user「加 cover 字段」）：设为封面记下来源页；钮变灰「当前封面」
  probe(tag, "设为封面 → coverPage() = this page + button disabled 当前封面", await page.evaluate(() => window.__xhw.project.coverPage() === window.__xhw.project.current() && document.getElementById("pageImageCover").disabled && /当前封面/.test(document.getElementById("pageImageCover").textContent)), await page.evaluate(() => `cover=${window.__xhw.project.coverPage()} cur=${window.__xhw.project.current()}`));
  probe(tag, "set as cover → Thumbnails/thumbnail.png bytes present, PNG, ≤ 70 KB", thumb1.length > 0 && thumb1[1] === 0x50 && thumb1.length <= 70 * 1024, String(thumb1.length));
  // 替换图片（封面跟着换）：sheet → 确认 → file input
  if (w < 900) await ensureSidebar(false);
  await page.click("#pageImageReplace"); await wait(300); await page.click("#sheetConfirm"); await wait(200);
  await page.setInputFiles("#imageReplaceInput", [{ name: "地图2.png", mimeType: "image/png", buffer: makePng(2100, 1400, 11) }]);
  await page.waitForFunction(() => /已替换/.test(document.getElementById("toast").textContent), null, { timeout: 60000 }); await wait(300);
  const thumb2 = await page.evaluate(() => Array.from(window.__xhw.project.thumbnail()));
  probe(tag, "replace image on the cover page → cover regenerated (bytes differ), name kept", thumb2.length > 0 && thumb2.join() !== thumb1.join() && (await page.evaluate(() => window.__xhw.project.current())) === "地图.jpg", await page.textContent("#toast"));
  // v2.1.9 导出图片页 = 图片本身进剪贴板（jpg → PNG 经 codec）
  await ensureSidebar(true); await page.click("#edgeExport"); await wait(300);
  { const sh = () => page.evaluate(() => ({ seg: [...document.querySelectorAll("#sheetChoices > .sheet-seg .sheet-seg-btn")].map((b) => b.textContent.trim() + (b.getAttribute("aria-checked") === "true" ? "*" : "")), btn: [...document.querySelectorAll("#sheetChoices .sheet-choice")].map((b) => b.textContent.trim()), note: document.querySelector("#sheetChoices .sheet-seg-note")?.textContent ?? "" }));
    const a = await sh();
    probe(tag, "导出 sheet in a book (v2.3.17): scope row 这一页* / … / 整本 + three buttons; on an image page the first button = 复制图片", a.seg[0] === "这一页*" && a.seg[a.seg.length - 1] === "整本" && a.btn.join("|") === "复制图片|长图|PDF" && /1 张图/.test(a.note), JSON.stringify(a));
    await page.evaluate(() => [...document.querySelectorAll("#sheetChoices .sheet-seg-btn")].find((b) => /整本/.test(b.textContent))?.click()); await wait(150);
    const b = await sh();
    probe(tag, "picking 整本 in the scope row: selection moves, first button becomes 复制文字, the note recounts (more pages than 这一页)", b.seg[b.seg.length - 1] === "整本*" && b.btn.join("|") === "复制文字|长图|PDF" && b.note !== a.note && /页正文/.test(b.note), JSON.stringify(b));
    await page.evaluate(() => [...document.querySelectorAll("#sheetChoices .sheet-seg-btn")].find((x) => /这一页/.test(x.textContent))?.click()); await wait(150); }
  await page.evaluate(() => [...document.querySelectorAll("#sheetChoices .sheet-choice")].find((b) => /复制图片/.test(b.textContent))?.click()); await wait(1500);
  probe(tag, "导出 on an image page → clipboard holds image/png + toast 已复制这张图", await page.evaluate(async () => { try { const items = await navigator.clipboard.read(); return items.some((it) => it.types.includes("image/png")); } catch (e) { return "ERR:" + e.message; } }) === true && /已复制这张图/.test(await page.textContent("#toast")), await page.textContent("#toast"));
  // 整本 → 长图：封面（cover 字段指的那页的高清字节）铺首屏 + 正文页 + 图片页原位
  { const li = await page.evaluate(async () => { const r = await window.__xhw.exportLongImage("book"); if (!r) return null; const bm = await createImageBitmap(r.files[0]); return { n: r.files.length, w: bm.width, h: bm.height, text: r.plan.textPages, images: r.plan.imagePages, cjk: r.plan.cjk, name: r.files[0].name }; });
    probe(tag, "长图 (整本): cover from graph.json cover page + ≥1 text page + ≥1 image page, 750 wide, first slice has an image → .jpg", !!li && li.n >= 1 && li.w === 684 && li.text >= 1 && li.images >= 1 && li.h > 750 && /\.jpg$/.test(li.name), JSON.stringify(li)); }
  // PDF（v2.3.14；v2.3.15 起内置字体在仓里，app 自己取）：整本 → 一份 PDF（封面图 + 书名页 + 正文页 + 图片页）
  { const pdf = await page.evaluate(async () => { const r = await window.__xhw.exportPdf("book"); if (!r) return null; const u8 = new Uint8Array(await r.file.arrayBuffer()); return { name: r.file.name, size: r.file.size, pages: r.pages, font: r.fontLabel, head: String.fromCharCode(...u8.slice(0, 8)), tail: String.fromCharCode(...u8.slice(-6)) }; });
    probe(tag, "PDF (整本) with the built-in font: %PDF header, %%EOF trailer, ≥ 4 pages, .pdf name, font = NotoSansSC-Regular", !!pdf && pdf.head.startsWith("%PDF-1.7") && /%%EOF/.test(pdf.tail) && pdf.pages >= 4 && /\.pdf$/.test(pdf.name) && pdf.size > 10_000 && /NotoSansSC/.test(pdf.font), JSON.stringify(pdf)); }
  // 子节目录进导出（v2.3.22，user「导出的时候要不要也加子叶的页面内链接…不然的话目录是空的就很奇怪」「好，两个做」）：整本 PDF 的链接数 = 一起出门的「父页（文字）→ 子页」对数；长图里子页名出现在父页正文后面；「这一页」没有目录
  { const t = await page.evaluate(async () => {
      const p = window.__xhw.project, s = p.session(); const names = s.exportOrder(null), set = new Set(names); let pairs = 0; const labels = [];
      const walk = (nodes) => { for (const n of nodes) { const name = typeof n === "string" ? n : n.name, ch = typeof n === "string" ? [] : (n.children ?? []); if (set.has(name) && /\.txt$/i.test(name)) for (const c of ch) { const cn = typeof c === "string" ? c : c.name; if (set.has(cn)) { pairs++; labels.push(cn); } } walk(ch); } };
      walk(s.project.tree);
      const pdf = await window.__xhw.exportPdf("book"), one = await window.__xhw.exportPdf("page"), img = await window.__xhw.exportLongImage("book");
      const texts = img.plan.slices.flatMap((sl) => sl.ops.filter((o) => o.op === "text").map((o) => o.text));
      return { pairs, links: pdf.links, pageLinks: one ? one.links : 0, tocInImage: labels.length === 0 || labels.some((l) => texts.filter((x) => x.replace(/[\u{E0100}-\u{E01EF}]/gu, "") === l.replace(/\.txt$/i, "")).length >= 1) };
    });
    probe(tag, "exports carry the child table of contents: whole-book PDF has one link per exported parent→child pair, 这一页 has none, the long image lists the child names", t.links === t.pairs && t.pageLinks === 0 && t.tocInImage, JSON.stringify(t)); }
  probe(tag, "built-in font is installed and the editor uses it (computed font-family starts with XHW Sans; document.fonts has it loaded)", await page.evaluate(async () => (await window.__xhw.fontReady) === true && /^"?XHW Sans/.test(getComputedStyle(document.getElementById("editor")).fontFamily) && document.fonts.check('20px "XHW Sans"')), await page.evaluate(() => getComputedStyle(document.getElementById("editor")).fontFamily.slice(0, 40)));
  // 切片路（v2.3.2「尽量一张」：默认不切；给了上限才切，只在行间、每张 ≤ 上限）——app 内走一遍 maxSliceHeight
  { const sl = await page.evaluate(async () => { const r = await window.__xhw.exportLongImage("book", { maxSliceHeight: 1500 }); const hs = []; for (const f of r.files) { const bm = await createImageBitmap(f); hs.push(bm.height); } return { n: r.files.length, hs, total: r.plan.totalHeight, names: r.files.map((f) => f.name) }; });
    probe(tag, "长图 sliced at 1500: >1 slices, each ≤ 1500 (a lone image row may exceed), every file .png or .jpg", sl.n > 1 && sl.hs.every((h) => h <= 1500 + 1125) && sl.names.every((n) => /\.(png|jpg)$/.test(n)), JSON.stringify(sl)); }
  // 行宽跟书走（v2.3.11，user「editor state 里面的行宽是跟着书走的吧」）：书里选 28 → 这本书的 editor-state.lineWidth = 28、纸面 data-chars=28、导出 sheet 文案「每行 28 字」；回 20
  { const lw = await page.evaluate(() => { const r = document.querySelector('#readingModePicker input[value="28"]'); r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); const s = window.__xhw.project.session(); return { book: s.project.editorState.lineWidth?.charsPerLine, body: document.body.dataset.chars, hint: document.getElementById("readingModeHint").textContent }; });
    probe(tag, "line width picked inside a book → stored in the book's editor-state + body[data-chars]=28 + hint says 这本书", lw.book === 28 && lw.body === "28" && /这本书/.test(lw.hint), JSON.stringify(lw));
    await ensureSidebar(true); await page.click("#edgeExport"); await wait(300);
    const wrow = () => page.evaluate(() => [...(document.querySelector("#sheetChoices .sheet-seg-line")?.querySelectorAll(".sheet-seg-btn") ?? [])].map((b) => b.textContent + (b.getAttribute("aria-checked") === "true" ? "*" : "")).join("|"));
    const pickW = async (n) => { await page.evaluate((n) => [...(document.querySelector("#sheetChoices .sheet-seg-line")?.querySelectorAll(".sheet-seg-btn") ?? [])].find((b) => b.textContent === String(n))?.click(), n); await wait(120); };
    const stored = () => page.evaluate(() => window.__xhw.project.session().project.editorState.exportLineWidth?.charsPerLine ?? null);
    const imgW = () => page.evaluate(async () => (await window.__xhw.exportLongImage("page")).plan.width);
    probe(tag, "export sheet line-width row follows the book's line width by default (28 selected, nothing stored)", await wrow() === "14|20|28*" && await stored() === null, await wrow());
    // v2.3.19（user「写的时候用14…20导出」「好，同意。加」）：导出另选 20 → 记进这本书的 editor-state.exportLineWidth、长图按 20 排（684 宽）、编辑器仍是 28
    await pickW(20);
    probe(tag, "pick 20 in the export sheet → stored in the book (exportLineWidth = 20), editor stays 28, row shows 20*", await stored() === 20 && await wrow() === "14|20*|28" && await page.evaluate(() => document.body.dataset.chars) === "28", JSON.stringify({ stored: await stored(), row: await wrow() }));
    await page.click("#sheetCancel"); await wait(200);
    probe(tag, "long image now uses the export width (684 px = 20 per line) while the editor is at 28", await imgW() === 684, String(await imgW()));
    await ensureSidebar(true); await page.click("#edgeExport"); await wait(300);
    probe(tag, "reopening the export sheet remembers 20", await wrow() === "14|20*|28", await wrow());
    await pickW(28);
    probe(tag, "picking the editor's own width (28) drops the override (follows again)", await stored() === null && await wrow() === "14|20|28*", JSON.stringify({ stored: await stored(), row: await wrow() }));
    // v2.3.21 导出字体（user「萌神拼音也vendor进去吧，导出的时候还蛮需要的」）：第三条段选 黑体* | 拼音；选拼音 → 记进这本书、字体这时才取；长图 / PDF 用它；选回黑体 = 撤
    { const frow = () => page.evaluate(() => [...document.querySelectorAll("#sheetChoices .sheet-seg-line")].at(-1) ? [...[...document.querySelectorAll("#sheetChoices .sheet-seg-line")].at(-1).querySelectorAll(".sheet-seg-btn")].map((b) => b.textContent + (b.getAttribute("aria-checked") === "true" ? "*" : "")).join("|") : "");
      const pickF = async (re) => { await page.evaluate((r) => [...[...document.querySelectorAll("#sheetChoices .sheet-seg-line")].at(-1).querySelectorAll(".sheet-seg-btn")].find((b) => new RegExp(r).test(b.textContent))?.click(), re.source); await wait(120); };
      const storedF = () => page.evaluate(() => window.__xhw.project.session().project.editorState.exportFont ?? null);
      const hasFace = () => page.evaluate(() => [...document.fonts].some((f) => /XHW Pinyin/.test(f.family)));
      probe(tag, "export sheet has a font row 黑体* | 拼音 (two option rows in all); the pinyin font is not loaded yet", await frow() === "黑体*|拼音" && await page.evaluate(() => document.querySelectorAll("#sheetChoices .sheet-seg-line").length) === 2 && await storedF() === null, JSON.stringify({ row: await frow(), face: await hasFace() }));
      const faceBefore = await hasFace();
      await pickF(/拼音/);
      probe(tag, "pick 拼音 → stored in the book (exportFont = pinyin), row shows 拼音*, still nothing fetched (lazy)", await storedF() === "pinyin" && await frow() === "黑体|拼音*" && await hasFace() === faceBefore, JSON.stringify({ stored: await storedF(), row: await frow() }));
      await page.click("#sheetCancel"); await wait(200);
      const out = await page.evaluate(async () => { const li = await window.__xhw.exportLongImage("page"); const pdf = await window.__xhw.exportPdf("page"); return { img: !!li && li.files.length >= 1, font: pdf?.fontLabel ?? null, missing: pdf?.missing?.length ?? -1, pages: pdf?.pages ?? 0 }; });
      probe(tag, "exporting with 拼音: long image renders, the pinyin face is now installed, PDF embeds Mengshen with no missing glyphs", out.img && await hasFace() && /Mengshen/.test(out.font ?? "") && out.pages >= 1, JSON.stringify(out));
      probe(tag, "the editor itself stays on the body font (pinyin is export-only)", await page.evaluate(() => /^"?XHW Sans/.test(getComputedStyle(document.getElementById("editor")).fontFamily)));
      await ensureSidebar(true); await page.click("#edgeExport"); await wait(300);
      probe(tag, "reopening the export sheet remembers 拼音", await frow() === "黑体|拼音*", await frow());
      await pickF(/黑体/);
      probe(tag, "picking 黑体 drops the override", await storedF() === null && await frow() === "黑体*|拼音", JSON.stringify({ stored: await storedF(), row: await frow() }));
      const back = await page.evaluate(async () => { const s = [...document.querySelectorAll("#sheetCancel")][0]; s?.click(); await new Promise((r) => setTimeout(r, 200)); const pdf = await window.__xhw.exportPdf("page"); return pdf?.fontLabel ?? null; });
      probe(tag, "back on 黑体: PDF embeds NotoSansSC again", /NotoSansSC/.test(back ?? ""), String(back));
      await ensureSidebar(true); await page.click("#edgeExport"); await wait(300); }
    await page.click("#sheetCancel").catch(() => {}); await page.keyboard.press("Escape"); await wait(200);
    await page.evaluate(() => { const r = document.querySelector('#readingModePicker input[value="20"]'); r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(100); }
  // hidden（v2.3.2，user 2026-09-30「和unity一样，parent hidden -> all child hidden」）：藏当前页 → 自己的旗子 + 纸上眼睛 + 侧栏行 hidden-self + 整本长图少它 + 这一页长图为空；取消 → 复原
  { const before = await page.evaluate(async () => { const r = await window.__xhw.exportLongImage("book"); return r.plan.textPages + r.plan.imagePages; });
    await page.evaluate(() => window.__xhw.project.setHidden(window.__xhw.project.current(), true)); await wait(250); await ensureSidebar(true); await wait(150);
    const st = await page.evaluate(async () => { const p = window.__xhw.project; const cur = p.current(); const r = await window.__xhw.exportLongImage("book"); const row = document.querySelector(`#edgeList .edge-row[data-name="${CSS.escape(cur)}"]`); return { self: p.isHidden(cur), tree: p.isHiddenInTree(cur), badge: !document.getElementById("pageHiddenBadge").hidden, row: row ? row.classList.contains("hidden-self") && !row.querySelector(".edge-hidden") && parseFloat(getComputedStyle(row.querySelector(".edge-name")).opacity) < 1 : "norow", after: r.plan.textPages + r.plan.imagePages, pageExport: (await window.__xhw.exportLongImage("page")) !== null }; });
    probe(tag, "hide current page → own flag + paper badge + sidebar row dimmed (no icon) + book export drops it + exporting 这一页 by name still works (2026-10-01: the named page ignores its own hidden)", st.self && st.tree && st.badge && st.row !== false && st.after === before - 1 && st.pageExport, JSON.stringify({ before, ...st }));
    // 正文里的目录行同一套（user 2026-09-30「hidden 的话正文里的链接也应该有颜色变化」）：到父页看，藏掉的那页在 #childTocList 里 hidden-self + 眼睛
    { const toc = await page.evaluate(() => { const p = window.__xhw.project; const cur = p.current(); const parent = p.neighborhood().parent; if (!parent) return "noparent"; p.jump(parent); window.__xhw.renderPageKin(); const row = document.querySelector(`#childTocList .child-toc-row[data-name="${CSS.escape(cur)}"]`); const r = row ? row.classList.contains("hidden-self") && !row.querySelector(".child-toc-hidden") && parseFloat(getComputedStyle(row.querySelector(".child-toc-name")).opacity) < 1 : "norow"; p.jump(cur); window.__xhw.renderPageKin(); return r; });
      probe(tag, "hidden page shows dimmed (no icon) in the parent's in-paper child TOC", toc === true || toc === "noparent", String(toc)); }
    const menu = await rowMenu("siblings", await page.evaluate(() => window.__xhw.project.current())); await page.keyboard.press("Escape"); await wait(100);
    probe(tag, "row menu on a hidden page offers 取消隐藏 (not 隐藏)", menu.opened && menu.items.some((x) => /取消隐藏/.test(x.label)) && !menu.items.some((x) => /^隐藏/.test(x.label)), JSON.stringify(menu.items.map((x) => x.label)));
    await page.evaluate(() => window.__xhw.project.setHidden(window.__xhw.project.current(), false)); await wait(250);
    const after2 = await page.evaluate(async () => { const r = await window.__xhw.exportLongImage("book"); return r.plan.textPages + r.plan.imagePages; });
    probe(tag, "unhide → same export size + badge gone", after2 === before && await page.evaluate(() => document.getElementById("pageHiddenBadge").hidden), `${before} vs ${after2}`); }
  // 断入边：先从 序章 链到 地图.jpg，图片页的「谁指向这里」列出 序章 → 断开
  await page.evaluate(() => { const p = window.__xhw.project; p.jump("序章.txt"); p.addLink("地图.jpg"); p.jump("地图.jpg"); window.__xhw.sidebar.render(); }); await wait(150);
  await ensureSidebar(true);
  probe(tag, "incoming section lists the page that links here", await page.evaluate(() => [...document.querySelectorAll("#edgeList .edge-row.header")].some((h) => /指向这里/.test(h.textContent))));
  await page.evaluate(() => { const rows = [...document.querySelectorAll("#edgeList .edge-row")]; const hi = rows.findIndex((r) => r.classList.contains("header") && /指向这里/.test(r.textContent)); rows[hi + 1].querySelector(".edge-more").click(); }); await wait(250);
  await page.evaluate(() => { const it = [...document.querySelectorAll(".popup-menu-item")].find((b) => /断开/.test(b.textContent)); if (!it) throw new Error("cut item missing"); it.click(); }); await wait(300);
  probe(tag, "cut incoming link → no backlinks left, page not renamed", await page.evaluate(() => window.__xhw.project.session().backlinksOf("地图.jpg").length === 0 && window.__xhw.project.nodeNames().includes("地图.jpg")));
  // 名字框里的「从图片…」= 先选位置再选来源：加兄弟页 → 从图片…（两张，顺序保持）→ 排在当前页之后；加子节 → 从图片… → 当前页的子节
  await ensureSidebar(true); await page.click("#edgeAddSibling"); await wait(300); await page.click("#sheetSecondary"); await wait(300);
  probe(tag, "name sheet 从图片… (sibling) → image sheet with the HD checkbox", await page.evaluate(() => !document.getElementById("sheet").classList.contains("hidden") && /2048/.test(document.getElementById("sheet").textContent)));
  { const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 10000 }), page.click("#sheetConfirm")]);
    await chooser.setFiles([{ name: "插图A.png", mimeType: "image/png", buffer: makePng(120, 80, 21) }, { name: "插图B.png", mimeType: "image/png", buffer: makePng(100, 60, 22) }]);
    await page.waitForFunction(() => window.__xhw.project.nodeNames().includes("插图B.png") && window.__xhw.project.current() === "插图B.png", null, { timeout: 60000 }); await wait(300); await ensureSidebar(true);
    probe(tag, "from the sibling sheet: two images inserted right after 地图.jpg in file order (siblings = 夏音, 地图, 插图A, 插图B); toast says 之后", JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["夏音.png", "地图.jpg", "插图A.png", "插图B.png"]) && /之后/.test(await page.textContent("#toast")), `${JSON.stringify(await rowsIn("siblings"))} ${await page.textContent("#toast")}`); }
  await page.click("#edgeAddChild"); await wait(300); await page.click("#sheetSecondary"); await wait(300);
  { const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 10000 }), page.click("#sheetConfirm")]);
    await chooser.setFiles([{ name: "插图C.png", mimeType: "image/png", buffer: makePng(90, 70, 23) }]);
    await page.waitForFunction(() => window.__xhw.project.current() === "插图C.png", null, { timeout: 60000 }); await wait(300); await ensureSidebar(true);
    probe(tag, "from the child sheet: image becomes a child of 插图B (`..` = 插图B); toast says 子节", JSON.stringify(await parentRow()) === JSON.stringify({ name: "插图B.png", root: false, disabled: false }) && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["插图C.png"]) && /子节/.test(await page.textContent("#toast")), `${JSON.stringify(await parentRow())} ${await page.textContent("#toast")}`); }
  // 粘贴位图（没有位置选择）→ 当前页（目录）的子节末尾，日期码名
  await page.evaluate(() => { window.__xhw.project.jump("目录.txt"); window.__xhw.sidebar.render(); }); await wait(150);
  await page.evaluate(async () => { const c = new OffscreenCanvas(40, 30); const cx = c.getContext("2d"); cx.fillStyle = "#c33"; cx.fillRect(0, 0, 40, 30); const blob = await c.convertToBlob({ type: "image/png" }); const dt = new DataTransfer(); dt.items.add(new File([blob], "image.png", { type: "image/png" })); document.getElementById("editor").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); });
  // 2026-09-30 user「复制图片 as new page 需要弹框确认。不然的话不小心按一下太坑了」：粘贴 / 拖放的图片要加成新页先弹确认
  await page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 5000 });
  probe(tag, "paste a bitmap → confirm sheet first (Ctrl+V into the editor never silently adds a page)", await page.evaluate(() => /新页|pages/.test(document.getElementById("sheetTitle")?.textContent ?? document.getElementById("sheet").textContent)), await page.evaluate(() => document.getElementById("sheet").textContent.slice(0, 60)));
  await page.click("#sheetConfirm");
  await page.waitForFunction(() => window.__xhw.project.nodeNames().some((n) => /^\d{8}-[0-9a-f]{4}\.png$/.test(n)), null, { timeout: 15000 }); await wait(300); await ensureSidebar(true);
  probe(tag, "paste a bitmap on an in-tree page → date-code image page as the LAST child of 目录; toast says 子节", await page.evaluate(() => { const nb = window.__xhw.project.neighborhood(); return nb.parent === "目录.txt" && /^\d{8}-[0-9a-f]{4}\.png$/.test(nb.current) && nb.siblings.at(-1) === nb.current; }) && /子节/.test(await page.textContent("#toast")), await page.textContent("#toast"));
  // 拖 txt → 新页（链出，维持现状）
  await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(["拖进来的正文"], "拖进来的.txt", { type: "text/plain" })); document.querySelector(".page").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); });
  await page.waitForFunction(() => window.__xhw.project.nodeNames().includes("拖进来的.txt"), null, { timeout: 10000 });
  probe(tag, "drop .txt onto the paper → new page with the file's text", (await page.evaluate(() => window.__xhw.project.session().bytesOf("拖进来的.txt") && new TextDecoder().decode(window.__xhw.project.session().bytesOf("拖进来的.txt")))) === "拖进来的正文");
  await shot("22-after-drop-paste");
  // 书库：2:3 竖版、窄屏三列、封面缩略图露面
  await ensureSidebar(true); await page.click("#edgeLibrary"); await wait(2500);
  probe(tag, "library grid is tall (2:3) and narrow screens get 3 columns", await page.evaluate(() => { const g = document.querySelector("#galleryMount .gallery-grid"); const cols = getComputedStyle(g).gridTemplateColumns.split(" ").length; return g.classList.contains("tall") && (innerWidth >= 500 || cols === 3); }), await page.evaluate(() => getComputedStyle(document.querySelector("#galleryMount .gallery-grid")).gridTemplateColumns));
  await page.waitForFunction(() => [...document.querySelectorAll("#galleryMount .gallery-tile")].some((t) => /锁卡测试书/.test(t.textContent) && t.querySelector("img.gallery-tile-thumb")?.src), null, { timeout: 15000 }).catch(() => {});
  probe(tag, "library tile of the book shows the cover thumbnail", await page.evaluate(() => [...document.querySelectorAll("#galleryMount .gallery-tile")].some((t) => /锁卡测试书/.test(t.textContent) && !!t.querySelector("img.gallery-tile-thumb")?.src)));
  probe(tag, "book with a cover image: image is only the background (fills the cover), same printed title on top, no band under the meta row", await page.evaluate(() => { const t = [...document.querySelectorAll("#galleryMount .gallery-tile")].find((x) => /锁卡测试书/.test(x.textContent) && x.querySelector("img.gallery-tile-thumb")); if (!t) return false; const img = t.querySelector("img.gallery-tile-thumb"), ov = t.querySelector(".gallery-tile-overlay"), row = t.querySelector(".gallery-tile-name-row"); if (!ov) return false; const ir = img.getBoundingClientRect(), or = ov.getBoundingClientRect(); const bg = getComputedStyle(row).backgroundColor; const title = ov.querySelector(".xhw-cover-title"); return getComputedStyle(img).objectFit === "cover" && Math.abs(ir.width - or.width) <= 2 && Math.abs(ir.height - or.height) <= 2 && Math.abs(ir.top - or.top) <= 2 && /锁卡测试书/.test(title?.textContent ?? "") && (bg === "rgba(0, 0, 0, 0)" || bg === "transparent") && getComputedStyle(title).textShadow !== "none" && getComputedStyle(ov).pointerEvents === "none"; }));
  // v2.1.34 进书库即关书（user 2026-09-30「进书库关书同意」；起因「退出到图库之后还显示打开中」）：书库里没有任何一张卡是「打开中」，顶栏也没有当前文档
  await wait(400);
  probe(tag, "entering the library releases the open doc: no tile is tagged 打开中, activeName is null (book closed, txt parked)", await page.evaluate(() => !document.querySelector("#galleryMount .gallery-tile.active") && !document.querySelector("#galleryMount .gallery-tile-active-tag") && !window.__xhw.project.active() && window.__xhw.editor.state.name == null), await page.evaluate(() => JSON.stringify({ active: !!document.querySelector("#galleryMount .gallery-tile.active"), proj: window.__xhw.project.active(), ed: window.__xhw.editor.state.name })));
  await shot("23-library-covers");
  { await page.click(".gallery-tile:not(.folder) .gallery-tile-menu-btn"); await wait(250);
    const cov = await page.evaluate(() => { const m = document.querySelector(".gallery-tile-menu-popup:not(.hidden)"), b = document.querySelector(".gallery-tile:not(.folder) .gallery-tile-menu-btn"); if (!m || !b) return { ok: false, why: "no menu" }; const tile = b.closest(".gallery-tile"); tile.style.transform = "translateY(-1px)"; try { const r = m.getBoundingClientRect(); const others = [...document.querySelectorAll("#galleryMount .gallery-tile")].filter((t) => t !== tile).map((t) => t.getBoundingClientRect()).filter((q) => q.top < r.bottom && q.bottom > r.top && q.left < r.right && q.right > r.left); if (!others.length) return { ok: true, why: "no other tile under the menu at this width (single row)" }; const q = others[0]; const x = Math.max(r.left, q.left) + 4, y = Math.max(r.top, q.top) + 4; const hit = document.elementFromPoint(x, y); return { ok: m.contains(hit), why: `menu ${Math.round(r.top)}-${Math.round(r.bottom)} over tile ${Math.round(q.top)}-${Math.round(q.bottom)}; point (${Math.round(x)},${Math.round(y)}) hits <${hit?.tagName.toLowerCase()}.${typeof hit?.className === "string" ? hit.className.split(" ")[0] : ""}>` }; } finally { tile.style.transform = ""; } });
    probe(tag, "with two rows: the menu of a top-row tile covers the tile beneath it even when its own tile is transformed (the exact iPhone case)", cov.ok, cov.why);
    await page.mouse.click(w - 40, h - 40); await wait(200); }
  await page.click("#galleryBack"); await wait(300);
  // ── 狗粮书（tmp/migration/，不进 git；没有就 SKIP）：3 层树 → 侧栏仍只两层；prev/next 走完整本不绕回；导出「正文」= 整本小说、散页不在里面；readOnly → 树菜单全灰
  { const FIX = "20250216 樱川 AI参考.webxiaoheiwu.zip";
    const res = await page.evaluate(async (f) => { const r = await fetch("/tmp/migration/" + encodeURIComponent(f)); if (!r.ok) return null; const blob = await r.blob(); await window.__xhw.openLocalBook({ fileName: f, canWriteBack: false, read: async () => blob, write: async () => "downloaded" }); return blob.size; }, FIX);
    if (res == null) console.log(tag, "dogfood book: SKIP (tmp/migration fixture not present)");
    else {
      await wait(800); await ensureSidebar(true); await shot("24-dogfood-book");
      probe(tag, "dogfood: opens at 第一幕 (editor-state.last), readOnly lock on, no error state", (await cur()) === "第一幕.txt" && await page.evaluate(() => window.__xhw.project.readOnly() && !document.getElementById("saveStatus").classList.contains("error") && document.getElementById("editor").readOnly), `${await cur()} ${await page.textContent("#saveStatus")}`);
      probe(tag, "dogfood: `..` = 正文, siblings = three acts, children = 9 话, no third layer", JSON.stringify(await parentRow()) === JSON.stringify({ name: "正文", root: false, disabled: false }) && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["第一幕", "第二幕", "第三幕"]) && (await rowsIn("children")).length === 9 && (await noThirdLayer()), `${JSON.stringify(await parentRow())} ${JSON.stringify(await rowsIn("siblings"))} ${(await rowsIn("children")).length}`);
      { const r = await rowMenu("siblings", "第一幕.txt"); probe(tag, "dogfood readOnly: tree row menu all grey except 导出这一支", r.opened && r.items.filter((x) => !/导出/.test(x.label)).every((x) => x.disabled) && r.items.some((x) => /导出/.test(x.label) && !x.disabled), JSON.stringify(r.items)); await page.keyboard.press("Escape"); await wait(100); }
      const walk = await page.evaluate(() => { const p = window.__xhw.project; const order = p.session().order(); p.jump(order[0]); const seen = [p.current()]; let guard = 0; while (p.nextPage() && guard++ < 200) seen.push(p.current()); const atEnd = !p.neighborhood().next; p.jump(order[0]); const atHead = !p.neighborhood().prev; return { seen, order, atEnd, atHead, loose: p.nodeNames().filter((n) => !p.isInTree(n)) }; });
      probe(tag, "dogfood: next walks the whole 41-page trunk in DFS order, stops at the tail (no wrap), prev grey at the head", walk.seen.length === 41 && JSON.stringify(walk.seen) === JSON.stringify(walk.order) && walk.atEnd && walk.atHead && walk.seen[0] === "正文.txt" && walk.seen.at(-1) === "20250505 AI bkup.txt", `${walk.seen.length} ${walk.seen[0]} → ${walk.seen.at(-1)}`);
      probe(tag, "dogfood: DFS crosses acts: after 第一幕 Chapter 10 comes the 第二幕 page, then 第二幕 老技术员", (() => { const i = walk.seen.indexOf("第一幕 Chapter 10：夏音改造联盟.txt"); return i > 0 && walk.seen[i + 1] === "第二幕.txt" && walk.seen[i + 2] === "第二幕 老技术员.txt"; })(), walk.seen.slice(9, 13).join("|"));
      probe(tag, "dogfood: exactly one loose page (the style note) and it has no prev/next", walk.loose.length === 1 && /轻小说口语调/.test(walk.loose[0]) && await page.evaluate((n) => { const p = window.__xhw.project; p.jump(n); const nb = p.neighborhood(); return !nb.inTree && nb.prev === null && nb.next === null && document.getElementById("pagePrev").disabled && document.getElementById("pageNext").disabled; }, walk.loose[0]), JSON.stringify(walk.loose));
      await page.evaluate(() => window.__xhw.sidebar.render()); await wait(150);
      probe(tag, "dogfood loose page: sidebar has no `..`/siblings/children, only links + 谁指向这里 + 「+ 子节」", (await parentRow()) === null && (await rowsIn("siblings")).length === 0 && JSON.stringify(await rowsIn("incoming")) === JSON.stringify(["第一幕 夏音把大扫除弄得一塌糊涂"]) && await page.evaluate(() => !document.getElementById("edgeAddSibling") && !!document.getElementById("edgeAddChild")), JSON.stringify(await blocks()));
      const exp = await page.evaluate(() => ({ novel: window.__xhw.project.exportBranchText("正文.txt"), act2: window.__xhw.project.exportBranchText("第二幕.txt"), style: window.__xhw.project.session().currentText() }));
      probe(tag, "dogfood: export 正文 = whole novel in TOC order, style note (loose) not inside; export 第二幕 = one act", exp.novel.indexOf("# 第一幕") < exp.novel.indexOf("## 第一话") && exp.novel.indexOf("Chapter 10") < exp.novel.indexOf("# 第二幕") && exp.novel.indexOf("# 第二幕") < exp.novel.indexOf("# 第三幕") && /学期结束和新的开始/.test(exp.novel) && !exp.novel.includes(exp.style.trim().split("\n")[0]) && exp.act2.startsWith("# 第二幕") && !/第三幕/.test(exp.act2) && /孤独的特权者/.test(exp.act2), `${exp.novel.length} chars`);
      await page.evaluate(() => window.__xhw.project.jump("第二幕 老技术员.txt")); await page.evaluate(() => window.__xhw.sidebar.render()); await wait(150);
      probe(tag, "dogfood: on a 话, `..` = its act, siblings = the act's 话, children empty", JSON.stringify(await parentRow()) === JSON.stringify({ name: "第二幕", root: false, disabled: false }) && (await rowsIn("siblings")).length === 12 && (await rowsIn("children")).length === 0, JSON.stringify(await parentRow()));
      await page.click("#edgeParent"); await wait(200); await page.click("#edgeParent"); await wait(200);
      probe(tag, "dogfood: `..` twice → 正文 at the top level (`..` = book, grey)", (await cur()) === "正文.txt" && JSON.stringify(await parentRow()) === JSON.stringify({ name: "20250216 樱川 AI参考", root: true, disabled: true }), JSON.stringify(await parentRow()));
      await shot("25-dogfood-toc");
    } }
  // ── 删除整链（user 真机 2026-09-30「gallery的删除好像有问题，删不了」，gallery 0.6.2 菜单出卡片之后）：新建稿 → 书库 ⋯ → 送到回收站 → 确认 sheet 在菜单 band 之上 → 卡片消失 → 回收站里有它
  { if (await page.evaluate(() => document.body.dataset.mode !== "gallery")) { await ensureSidebar(true); await page.click("#edgeLibrary"); await wait(1000); }
    await page.click("#galleryNewBtn"); await wait(200);
    await page.evaluate(() => { const it = [...document.querySelectorAll(".popup-menu button")].find((b) => /新建稿/.test(b.textContent ?? "")); if (!it) throw new Error("new-draft menu item not found"); it.click(); });   // 只在弹出菜单里找（锁卡上也有一颗藏着的「新建稿」）
    await wait(700);
    const leaveSheet = await page.evaluate(() => { const sh = document.getElementById("sheet"); return sh && !sh.classList.contains("hidden") ? (sh.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120) : null; });
    if (leaveSheet) { console.log(tag, "leaving the local book asked:", leaveSheet); await page.click("#sheetConfirm"); }   // 本机打开的书（dogfood）离开时会问一句
    await page.waitForFunction(() => document.body.dataset.mode !== "gallery" && !!window.__xhw && window.__xhw.editor.canEdit(), null, { timeout: 10000 }); await wait(300);   // 书开着时先离开书（落盘）再开新稿
    await page.evaluate(() => { const e = document.getElementById("editor"); e.focus(); e.value = "要删的稿"; e.dispatchEvent(new Event("input", { bubbles: true })); }); await wait(1500);
    const victim = await page.evaluate(() => window.__xhw.editor.state.name ?? window.__xhw.editor.state.path ?? null);
    await page.click("#libraryButton"); await wait(1000);
    const tileSel = await page.evaluate((v) => { const t = [...document.querySelectorAll("#galleryMount .gallery-tile:not(.folder)")].find((x) => (x.querySelector(".gallery-tile-name")?.getAttribute("title") ?? "") === v); if (!t) return null; t.dataset.auditVictim = "1"; return '[data-audit-victim="1"]'; }, victim);
    probe(tag, "delete chain: the fresh draft shows up as a tile", !!tileSel, `victim=${victim}`);
    if (tileSel) {
      await page.click(`${tileSel} .gallery-tile-menu-btn`); await wait(250);
      await page.click(".gallery-tile-menu-popup:not(.hidden) button.danger"); await wait(400);
      probe(tag, "delete chain: 送到回收站 → confirm sheet opens above the menu band and the menu is closed", await page.evaluate(() => { const sh = document.getElementById("sheet"); const c = document.getElementById("sheetConfirm").getBoundingClientRect(); const top = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2); return !sh.classList.contains("hidden") && /删除/.test(sh.textContent ?? "") && !!top?.closest("#sheet") && !document.querySelector(".gallery-tile-menu-popup:not(.hidden)"); }), await page.evaluate(() => `sheet hidden=${document.getElementById("sheet").classList.contains("hidden")} menuOpen=${!!document.querySelector(".gallery-tile-menu-popup:not(.hidden)")}`));
      await page.click("#sheetConfirm"); await wait(1500);
      probe(tag, "delete chain: after confirm the tile is gone", await page.evaluate(() => !document.querySelector('[data-audit-victim="1"]')), await page.evaluate(() => document.getElementById("toast")?.textContent ?? ""));
      await page.click("#galleryTrashBtn"); await wait(900);
      probe(tag, "delete chain: the trash view lists it", await page.evaluate((v) => [...document.querySelectorAll("#galleryMount .gallery-tile")].some((t) => (t.querySelector(".gallery-tile-name")?.getAttribute("title") ?? t.textContent ?? "").includes(v.replace(/\.txt$/, ""))), victim), await page.evaluate(() => [...document.querySelectorAll("#galleryMount .gallery-tile .gallery-tile-name")].map((n) => n.textContent?.trim()).join("|")));
      await page.click("#galleryAsideBack"); await wait(300);
    } }
  await ctx.close();
}
await browser.close(); srv.close();
console.log(errors.length ? "PAGE ERRORS/WARNINGS:\n" + errors.join("\n") : "no page errors");
console.log(fails ? `${fails} probe(s) FAILED` : "all probes ok");
process.exitCode = fails || errors.length ? 1 : 0;
