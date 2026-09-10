// 开发工具：无头 chromium 走一遍 2.0 UI 流程，逐步截图到 tmp/ui/。用法：node tools/ui-audit.mjs [宽x高 ...]。created 2026-09-10 by Claude Fable 5.1。不进 bundle。
// 2026-09-10 晚 v2.0.4 改流程：☰ = 侧栏（默认关；顶部 书库/设置 入口 + 工程内导航）；新节点 = 列表末尾「+」；节点名 = 纸面顶部章节名框；显示不带 .txt；新边加末尾。
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
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") errors.push(`[${tag}] console.${m.type()}: ${m.text()}`); });
  const shot = (name) => page.screenshot({ path: `tmp/ui/${tag}-${name}.png` });
  const wait = (ms) => page.waitForTimeout(ms);
  const sidebarShown = () => page.evaluate(() => document.body.dataset.edges === "1" && getComputedStyle(document.getElementById("edgeSidebar")).display !== "none");
  const rows = () => page.evaluate(() => [...document.querySelectorAll("#edgeList .edge-row:not(.add):not(.header):not(.empty) .edge-name")].map((e) => e.textContent));
  const ensureSidebar = async (open) => { if ((await sidebarShown()) !== open) { await page.click("#menuButton"); await wait(300); } };
  const clickEditor = async () => { if (w < 900) await ensureSidebar(false); await page.click("#editor"); };   // 窄屏浮层不再自动收：点纸面前探针自己收
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__xhw && window.__xhw.editor.canEdit(), null, { timeout: 15000 });   // boot 开出新稿后才能打字（之前在 __xhw 一出现就打，字被「不可用」守卫吞掉 → 整轮没有 txt 稿）
  await page.click("#editor"); await page.keyboard.type("第一篇：她推开门。他在窗边。窗外是雨。"); await wait(700);
  probe(tag, "txt doc materialized after typing", !!(await page.evaluate(() => window.__xhw.editor.state.name)));
  await shot("01-editor-txt");
  probe(tag, "sidebar closed by default", !(await sidebarShown()));
  probe(tag, "no edgeToggle in top bar", await page.evaluate(() => !document.getElementById("edgeToggle")));
  probe(tag, "☰ is the rightmost top-bar control", await page.evaluate(() => { const m = document.getElementById("menuButton").getBoundingClientRect(); return [...document.querySelectorAll(".top-bar > *")].every((e) => e.id === "menuButton" || e.hidden || e.getBoundingClientRect().right <= m.left + 1); }));
  // ☰ → 侧栏（txt 稿：只有书库/设置两个入口）
  await page.click("#menuButton"); await wait(300); await shot("02-sidebar-txt");
  probe(tag, "☰ opens sidebar", await sidebarShown());
  probe(tag, "txt mode: project pane hidden, lift entry visible", await page.evaluate(() => document.getElementById("edgePane").hidden && !document.getElementById("edgeTxtPane").hidden));
  { const draftName = await page.evaluate(() => window.__xhw.editor.state.name); const draftText = await page.inputValue("#editor");
    await page.click("#edgeLift"); await wait(300);
    probe(tag, "lift sheet: book name defaults to the draft name", (await page.inputValue("#sheetInput")) === draftName.replace(/\.txt$/i, ""), await page.inputValue("#sheetInput"));
    await page.click("#sheetConfirm"); await wait(1200);
    probe(tag, "lift → book mode, first page = draft name, text carried over", await page.evaluate(({ dn, dt }) => window.__xhw.project.active() && document.getElementById("nodeTitle").value === dn.replace(/\.txt$/i, "") && document.getElementById("editor").value === dt, { dn: draftName, dt: draftText }), await page.evaluate(() => `active=${window.__xhw.project.active()} title=${document.getElementById("nodeTitle").value}`));
    probe(tag, "lift keeps the draft in the library", await page.evaluate((dn) => window.__xhw.drawer.items().some((x) => x.name === dn), draftName));
    await page.evaluate(async (dn) => { await window.__xhw.openAny(dn); }, draftName); await wait(500);   // 回到 txt 稿，后面的流程照旧
    await ensureSidebar(true); }
  // 书库
  await page.click("#edgeLibrary"); await wait(1200); await shot("03-library");
  probe(tag, "library title says 书库", (await page.textContent(".gallery-chrome-title")).trim() === "书库");
  console.log(tag, "top element at center:", await page.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e ? `${e.tagName.toLowerCase()}#${e.id}.${[...e.classList].join(".")}` : null; }), "| top-bar covered:", await page.evaluate(() => { const tb = document.querySelector(".top-bar").getBoundingClientRect(); const e = document.elementFromPoint(tb.left + tb.width / 2, tb.top + tb.height / 2); return !!e?.closest("#galleryFull"); }));
  await page.click("#galleryNewBtn"); await wait(300); await shot("04-library-newmenu");
  await page.keyboard.press("Escape"); await wait(200);
  // 新建工程：菜单 → sheet（默认名「作品」）
  await page.click("#galleryNewBtn"); await wait(200);
  await page.evaluate(() => { const it = [...document.querySelectorAll("button")].find((b) => /新建书/.test(b.textContent ?? "")); if (!it) throw new Error("new-project menu item not found"); it.click(); }); await wait(400);
  probe(tag, "new project sheet default = 作品", (await page.inputValue("#sheetInput")) === "作品");
  await shot("05-newproject-sheet");
  await page.click("#sheetConfirm"); await wait(1200);
  await shot("06-project-editor");
  probe(tag, "project created: top bar shows project name only", (await page.textContent("#docNameButton")).trim() === "作品", await page.textContent("#docNameButton"));
  probe(tag, "first page = 作品 in title field (no .txt)", (await page.inputValue("#nodeTitle")) === "作品", await page.inputValue("#nodeTitle"));
  probe(tag, "top-bar state not an error", !(await page.$eval("#saveStatus", (e) => e.classList.contains("error"))) && !/没有缓存/.test(await page.textContent("#saveStatus")), await page.textContent("#saveStatus"));
  probe(tag, "no warning banner", await page.evaluate(() => { const b = document.getElementById("errBanner"); return !b || b.classList.contains("hidden"); }));
  probe(tag, "sidebar keeps the state it had when 书库 was opened from it (no auto-close)", await sidebarShown());
  // 工程：写 + 退格探针
  probe(tag, "book mode: top-bar + (add page) visible, left of ☰", await page.evaluate(() => { const a = document.getElementById("addPageButton"), m = document.getElementById("menuButton"); return !a.hidden && a.getBoundingClientRect().right <= m.getBoundingClientRect().left + 1; }));
  await clickEditor(); await page.keyboard.type("她推开门。他在窗边。窗外是雨。"); await wait(300);
  { const before = await page.inputValue("#editor"); await page.keyboard.press("End"); await page.keyboard.press("Backspace"); await wait(100);
    const after = await page.inputValue("#editor"); probe(tag, "backspace in project", after.length === before.length - 1, `(${before.length}→${after.length})`); await page.keyboard.type("。"); }
  // 侧栏：工程内导航 + 「+」新节点 → 第二章，章节名框全选 → 改名「序章」→ Enter
  await ensureSidebar(true); await shot("07-sidebar-project");
  probe(tag, "project pane visible", !(await page.evaluate(() => document.getElementById("edgePane").hidden)));
  probe(tag, "empty list has + row", await page.evaluate(() => !!document.getElementById("edgeAdd")));
  { await page.click("#edgeSearch"); await page.keyboard.type("nihao"); await wait(300);
    const comp = await page.evaluate(() => { const c = document.getElementById("candidateBar"); return c ? getComputedStyle(c).display !== "none" && (c.textContent ?? "").trim().length > 0 : false; });
    const raw = await page.inputValue("#edgeSearch"); probe(tag, "ime on edgeSearch", comp || raw === "", `(value=${JSON.stringify(raw)})`);
    await page.keyboard.press("Escape"); await page.fill("#edgeSearch", ""); await wait(100); }
  await ensureSidebar(true);
  await page.click("#edgeAdd"); await wait(400);
  probe(tag, "+ → asks for a name (no chapter suggestion, not prefilled)", await page.evaluate(() => !document.getElementById("sheet").classList.contains("hidden") && !/章/.test(document.getElementById("sheetInput").placeholder) && document.getElementById("sheetInput").value === ""));
  await page.fill("#sheetInput", "第二章"); await page.click("#sheetConfirm"); await wait(400);
  probe(tag, "+ → new node 第二章 opened, title shows it", await page.evaluate(() => document.getElementById("nodeTitle").value === "第二章" && window.__xhw.project.current() === "第二章.txt"));
  probe(tag, "sidebar stays open after + (no auto-close)", await sidebarShown());
  if (w < 900) await ensureSidebar(false);   // 窄屏浮层盖住章节名框，探针自己收
  await page.click("#nodeTitle"); await page.evaluate(() => document.getElementById("nodeTitle").select()); await page.keyboard.type("序章"); await page.keyboard.press("Enter"); await wait(300);
  probe(tag, "title Enter → renamed + focus body", await page.evaluate(() => document.activeElement?.id === "editor" && window.__xhw.project.current() === "序章.txt"), await page.evaluate(() => window.__xhw.project.current()));
  await clickEditor(); await page.keyboard.type("序章正文。"); await wait(300);
  await shot("08-after-plus-rename");
  // 回退 → 作品：列表应有「序章」（无 .txt）
  await page.keyboard.press("Alt+ArrowLeft"); await wait(300);
  await ensureSidebar(true);
  probe(tag, "back to 作品; list shows 序章 without .txt", JSON.stringify(await rows()) === JSON.stringify(["序章"]), JSON.stringify(await rows()));
  probe(tag, "row shows modified time as small text", await page.evaluate(() => /\d+\/\d+ \d\d:\d\d/.test(document.querySelector("#edgeList .edge-row .edge-sub")?.textContent ?? "")));
  // Ctrl+Enter 分裂已去掉（user 2026-09-10「先不要做去奇怪的静默行为」）：无入口 → 顶栏「+」加第二页「她推开门。」
  if (w < 900) await ensureSidebar(false);
  await page.evaluate(() => { const el = document.getElementById("editor"); el.focus(); el.setSelectionRange(0, 5); });
  await page.keyboard.press("Control+Enter"); await wait(300);
  probe(tag, "Ctrl+Enter does nothing (no sheet, text intact)", await page.evaluate(() => document.getElementById("sheet").classList.contains("hidden") && document.getElementById("editor").value.startsWith("她推开门。")));
  await page.click("#addPageButton"); await wait(300); await page.fill("#sheetInput", "她推开门。"); await page.click("#sheetConfirm"); await wait(400);
  probe(tag, "top-bar + → page 她推开门。 opened", (await page.inputValue("#nodeTitle")) === "她推开门。", await page.inputValue("#nodeTitle"));
  await shot("09-after-topbar-add");
  await page.keyboard.press("Escape"); await page.keyboard.press("Alt+ArrowLeft"); await wait(300);
  await ensureSidebar(true);
  probe(tag, "added page appended at END", JSON.stringify(await rows()) === JSON.stringify(["序章", "她推开门。"]), JSON.stringify(await rows()));
  // 连边动词还在 mode（钮已按 user 2026-09-10 去掉）：占位符加末尾（虚线）
  await page.evaluate(() => window.__xhw.project.addLink("祭祀线")); await page.evaluate(() => window.__xhw.sidebar.render()); await wait(200);
  probe(tag, "addLink (no button) → stub appended at end", await page.evaluate(() => { const r = [...document.querySelectorAll("#edgeList .edge-row.stub .edge-name")]; return r.length === 1 && r[0].textContent === "祭祀线"; }) && (await rows()).at(-1) === "祭祀线", JSON.stringify(await rows()));
  probe(tag, "no spawn/link/backlinks buttons in sidebar", await page.evaluate(() => !document.getElementById("edgeSpawn") && !document.getElementById("edgeLink") && !document.getElementById("edgeBacklinks") && document.getElementById("edgeFoot").hidden));
  // 检索：一个字就搜（孤儿也能扫）
  await page.fill("#edgeSearch", "章"); await wait(300); await shot("10-sidebar-search");
  probe(tag, "search with 1 char works", (await rows()).length >= 1 && (await rows()).includes("序章"), JSON.stringify(await rows()));
  await page.fill("#edgeSearch", ""); await wait(200);
  await page.click(".edge-row .edge-more"); await wait(300); await shot("12-sidebar-rowmenu");
  probe(tag, "row menu = 上移/下移/移出 (no rename, no hard delete)", await page.evaluate(() => { const items = [...document.querySelectorAll(".popup-menu button")].map((b) => (b.textContent ?? "").trim()); return items.some((x) => /移出/.test(x)) && !items.some((x) => /改名|彻底/.test(x)); }), JSON.stringify(await page.evaluate(() => [...document.querySelectorAll(".popup-menu button")].map((b) => b.textContent.trim()))));
  await page.keyboard.press("Escape"); await wait(200);
  // 删除模型：移出（丢引用）→ 孤儿改名 _废-；检索能找到；孤儿行菜单 = 彻底删除
  { const ok = await page.evaluate(() => window.__xhw.project.dropRef("她推开门。.txt")); await page.evaluate(() => window.__xhw.sidebar.render()); await wait(200);
    const names = await page.evaluate(() => window.__xhw.project.nodeNames());
    probe(tag, "drop reference → orphan renamed _废-她推开门。, gone from list", ok && names.includes("_废-她推开门。.txt") && !names.includes("她推开门。.txt") && !(await rows()).includes("她推开门。"), JSON.stringify(names));
    await page.fill("#edgeSearch", "废"); await wait(300);
    probe(tag, "search finds the orphan; its row menu = 彻底删除 only", (await rows()).includes("_废-她推开门。") && await page.evaluate(() => { const r = [...document.querySelectorAll("#edgeList .edge-row")].find((x) => /_废-她推开门/.test(x.textContent)); return !!r?.querySelector(".edge-more"); }));
    await page.click("#edgeList .edge-row .edge-more"); await wait(200);
    probe(tag, "orphan menu = 彻底删除 only", await page.evaluate(() => { const items = [...document.querySelectorAll(".popup-menu button")].map((b) => (b.textContent ?? "").trim()); return items.length === 1 && /彻底删除/.test(items[0]); }));
    await page.keyboard.press("Escape"); await page.fill("#edgeSearch", ""); await wait(200); }
  // 章节名撞名：改成已有名 → 提示、不改
  await ensureSidebar(false); await page.click("#nodeTitle"); await page.fill("#nodeTitle", "序章"); await wait(700);
  probe(tag, "title collision → refused + toast", await page.evaluate(() => window.__xhw.project.current() === "作品.txt" && /同名/.test(document.getElementById("toast").textContent)), await page.evaluate(() => window.__xhw.project.current()));
  await page.keyboard.press("Escape"); await wait(100);
  probe(tag, "title Escape → reverted", (await page.inputValue("#nodeTitle")) === "作品");
  // 顶栏改名工程 → 不重开，正文/边栏不动，顶栏即时换名
  await page.click("#docNameButton"); await wait(300); await page.fill("#sheetInput", "秋音"); const tRename = performance.now(); await page.click("#sheetConfirm");
  let renamedIn = -1; for (let i = 0; i < 50; i++) { await wait(100); if ((await page.textContent("#docNameButton")).trim() === "秋音") { renamedIn = Math.round(performance.now() - tRename); break; } }
  probe(tag, `project rename → top bar updates without reload (${renamedIn}ms)`, renamedIn >= 0, `topbar=${await page.textContent("#docNameButton")} renamedIn=${renamedIn}`);
  // 0.x 的只读保护（user 2026-09-10「0.x 的锁写功能我们不小心丢了」）：工程也有，per-device
  await page.click("#lockToggle"); await wait(300);
  probe(tag, "project read-only: textarea+title readOnly, + refuses", await page.evaluate(() => document.getElementById("editor").readOnly && document.getElementById("nodeTitle").readOnly && window.__xhw.project.readOnly() && window.__xhw.project.newNode("x") === false));
  await page.click("#lockToggle"); await wait(300);
  probe(tag, "project read-only off again", await page.evaluate(() => !document.getElementById("editor").readOnly && !window.__xhw.project.readOnly()));
  await page.click("#lockToggle"); await wait(600);   // 锁上 → 刷新后仍锁（跟着作品进 zip）
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" }); await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 }); await wait(1500);
  probe(tag, "read-only lock persisted inside the book (survives reload)", await page.evaluate(() => window.__xhw.project.readOnly() && document.getElementById("editor").readOnly));
  await page.click("#lockToggle"); await wait(600);
  probe(tag, "txt has no lock toggle", await page.evaluate(async () => { const it = window.__xhw.drawer.items().find((x) => /\.txt$/i.test(x.name)); if (!it) return false; await window.__xhw.openAny(it.name); return !window.__xhw.project.active() && document.getElementById("lockToggle").hidden; }));
  await page.evaluate(async () => { const it = window.__xhw.drawer.items().find((x) => /webxiaoheiwu\.zip$/i.test(x.name)); if (it) await window.__xhw.openAny(it.name); }); await wait(800);
  probe(tag, "project rename keeps node + edges", await page.evaluate(() => window.__xhw.project.current() === "作品.txt") && (await rows()).length === 2, JSON.stringify(await rows()));
  if (w >= 900) { await ensureSidebar(false);
    const centered = await page.evaluate(() => { const r = document.querySelector(".page").getBoundingClientRect(); return getComputedStyle(document.getElementById("edgeSidebar")).display === "none" && Math.abs(r.left - (innerWidth - r.width) / 2) < 2; });
    probe(tag, "wide: sidebar closed → page centered", centered); await shot("13-wide-sidebar-collapsed");
    const before = await page.evaluate(() => JSON.stringify(document.querySelector(".page").getBoundingClientRect()));
    await ensureSidebar(true);
    const overlay = await page.evaluate((b) => { const p = document.querySelector(".page").getBoundingClientRect(), s = document.getElementById("edgeSidebar").getBoundingClientRect(); return JSON.stringify(p) === b && s.right <= innerWidth && s.left > innerWidth / 2; }, before);
    probe(tag, "wide: sidebar is an overlay on the RIGHT, page does not move", overlay); await shot("13b-wide-sidebar-right"); await ensureSidebar(false); }
  // 回退栈随保存写（不标脏）：跳进 序章 → 打一个字触发落盘 → 刷新后 Alt+← 仍能回 第一章
  await page.evaluate(() => window.__xhw.project.jump("序章.txt")); await page.click("#editor"); await page.keyboard.press("End"); await page.keyboard.type("。"); await wait(700);
  // 刷新：boot 走 openAny(last) → 书回来、章节名回来、无红条
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" }); await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 }); await wait(1500);
  probe(tag, "reload → book reopened at 序章 (last saved position), title shown", await page.evaluate(() => document.body.dataset.project === "1" && document.getElementById("nodeTitle").value === "序章"), await page.inputValue("#nodeTitle"));
  probe(tag, "reload → no error state / banner", await page.evaluate(() => { const b = document.getElementById("errBanner"); return (!b || b.classList.contains("hidden")) && !document.getElementById("saveStatus").classList.contains("error"); }), await page.textContent("#saveStatus"));
  probe(tag, "reload → sidebar closed", !(await sidebarShown()));
  // 上次那本打不开 → 新稿（不是顺位下一本）
  await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => /:last-open$/.test(x)); if (k) localStorage.setItem(k, "不存在的书.webxiaoheiwu.zip"); });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" }); await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 }); await wait(1500);
  probe(tag, "last-open unopenable → fresh new draft (not the next book)", await page.evaluate(() => !window.__xhw.project.active() && !window.__xhw.editor.state.name && !!window.__xhw.editor.state.pendingDate && document.getElementById("editor").value === ""), await page.evaluate(() => `project=${window.__xhw.project.active()} name=${window.__xhw.editor.state.name}`));
  await page.evaluate(async () => { const it = window.__xhw.drawer.items().find((x) => /webxiaoheiwu\.zip$/i.test(x.name)); if (it) await window.__xhw.openAny(it.name); }); await wait(800);
  probe(tag, "reload → back stack persisted with the book (Alt+← → 作品)", await page.evaluate(() => window.__xhw.project.canGoBack() && window.__xhw.project.goBack() && window.__xhw.project.current() === "作品.txt"), await page.evaluate(() => window.__xhw.project.current()));
  // last-open 真的生效：开一篇旧 txt 再刷新，回来的是它而不是最新的（2026-09-10 实锤：以前 JSON.parse 裸字符串永远 null）
  { const oldTxt = await page.evaluate(async () => { const it = window.__xhw.drawer.items().find((x) => /\.txt$/i.test(x.name)); if (!it) return null; await window.__xhw.editor.open(it.name); return it.name; });
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" }); await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 }); await wait(1500);
    probe(tag, "reload → reopens the last-open txt, not the newest item", !!oldTxt && (await page.evaluate(() => window.__xhw.editor.state.name)) === oldTxt, `${oldTxt} vs ${await page.evaluate(() => window.__xhw.editor.state.name)}`); }
  await shot("14-after-reload");
  // 书库：工程卡片名无扩展名；卡片菜单；回收站；设置叠书库
  await ensureSidebar(true); await page.click("#edgeLibrary"); await wait(1200); await shot("15-library-with-project");
  probe(tag, "library tile shows project stem", await page.evaluate(() => [...document.querySelectorAll("#galleryMount .gallery-tile:not(.folder)")].some((t) => /秋音/.test(t.textContent) && !/webxiaoheiwu/.test(t.textContent))));
  await page.click(".gallery-tile:not(.folder) .gallery-tile-menu-btn"); await wait(300); await shot("16-tile-menu");
  await page.mouse.click(w - 40, h - 40); await wait(200);
  await page.click("#galleryTrashBtn"); await wait(800); await shot("17-trash-view");
  await page.click("#galleryTrashBack"); await wait(500);
  await page.click("#gallerySettingsBtn"); await wait(500); await shot("18-settings-over-library");
  probe(tag, "settings drawer slides in from the RIGHT", await page.evaluate(() => { const r = document.getElementById("drawer").getBoundingClientRect(); return Math.abs(r.right - innerWidth) < 2 && r.left > 0; }));
  await page.click("#drawerCloseButton"); await wait(300);
  // 场景恢复：在书库里刷新 → 回来还在书库；从书库退回编辑器再刷新 → 回来在编辑器（user 2026-09-10「书库里面 refresh 时还是会进写作」）
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" }); await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 }); await wait(1800);
  probe(tag, "reload while in the library → comes back in the library", await page.evaluate(() => document.body.dataset.mode === "gallery" && !document.getElementById("galleryFull").classList.contains("hidden")));
  await shot("18b-library-after-reload");
  await page.click("#galleryBack"); await wait(400); await shot("19-back-to-editor");
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" }); await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 }); await wait(1800);
  probe(tag, "reload after leaving the library → comes back in the editor", await page.evaluate(() => document.body.dataset.mode !== "gallery" && document.getElementById("galleryFull").classList.contains("hidden")));
  await ctx.close();
}
await browser.close(); srv.close();
console.log(errors.length ? "PAGE ERRORS/WARNINGS:\n" + errors.join("\n") : "no page errors");
console.log(fails ? `${fails} probe(s) FAILED` : "all probes ok");
process.exitCode = fails || errors.length ? 1 : 0;
