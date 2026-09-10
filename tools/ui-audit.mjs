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
  probe(tag, "txt mode: project pane hidden", await page.evaluate(() => document.getElementById("edgePane").hidden));
  // 书库
  await page.click("#edgeLibrary"); await wait(1200); await shot("03-library");
  probe(tag, "library title says 书库", (await page.textContent(".gallery-chrome-title")).trim() === "书库");
  console.log(tag, "top element at center:", await page.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e ? `${e.tagName.toLowerCase()}#${e.id}.${[...e.classList].join(".")}` : null; }), "| top-bar covered:", await page.evaluate(() => { const tb = document.querySelector(".top-bar").getBoundingClientRect(); const e = document.elementFromPoint(tb.left + tb.width / 2, tb.top + tb.height / 2); return !!e?.closest("#galleryFull"); }));
  await page.click("#galleryNewBtn"); await wait(300); await shot("04-library-newmenu");
  await page.keyboard.press("Escape"); await wait(200);
  // 新建工程：菜单 → sheet（默认名「作品」）
  await page.click("#galleryNewBtn"); await wait(200);
  await page.evaluate(() => { const it = [...document.querySelectorAll("button")].find((b) => /新建工程/.test(b.textContent ?? "")); if (!it) throw new Error("new-project menu item not found"); it.click(); }); await wait(400);
  probe(tag, "new project sheet default = 作品", (await page.inputValue("#sheetInput")) === "作品");
  await shot("05-newproject-sheet");
  await page.click("#sheetConfirm"); await wait(1200);
  await shot("06-project-editor");
  probe(tag, "project created: top bar shows project name only", (await page.textContent("#docNameButton")).trim() === "作品", await page.textContent("#docNameButton"));
  probe(tag, "first node = 第一章 in title field (no .txt)", (await page.inputValue("#nodeTitle")) === "第一章", await page.inputValue("#nodeTitle"));
  probe(tag, "top-bar state not an error", !(await page.$eval("#saveStatus", (e) => e.classList.contains("error"))) && !/没有缓存/.test(await page.textContent("#saveStatus")), await page.textContent("#saveStatus"));
  probe(tag, "no warning banner", await page.evaluate(() => { const b = document.getElementById("errBanner"); return !b || b.classList.contains("hidden"); }));
  if (w >= 900) probe(tag, "wide: sidebar keeps the state it had when 书库 was opened from it", await sidebarShown()); else probe(tag, "narrow: sidebar closed after 书库", !(await sidebarShown()));
  // 工程：写 + 退格探针
  await page.click("#editor"); await page.keyboard.type("她推开门。他在窗边。窗外是雨。"); await wait(300);
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
  probe(tag, "+ → new node 第二章, title focused & selected", await page.evaluate(() => document.activeElement?.id === "nodeTitle" && document.getElementById("nodeTitle").value === "第二章" && document.getElementById("nodeTitle").selectionEnd === 3));
  if (w < 900) probe(tag, "narrow: sidebar auto-closes after +", !(await sidebarShown()));
  await page.keyboard.type("序章"); await page.keyboard.press("Enter"); await wait(300);
  probe(tag, "title Enter → renamed + focus body", await page.evaluate(() => document.activeElement?.id === "editor" && window.__xhw.project.current() === "序章.txt"), await page.evaluate(() => window.__xhw.project.current()));
  await page.keyboard.type("序章正文。"); await wait(300);
  await shot("08-after-plus-rename");
  // 回退 → 第一章：列表应有「序章」（无 .txt）
  await page.keyboard.press("Alt+ArrowLeft"); await wait(300);
  await ensureSidebar(true);
  probe(tag, "back to 第一章; list shows 序章 without .txt", JSON.stringify(await rows()) === JSON.stringify(["序章"]), JSON.stringify(await rows()));
  // spawn（Ctrl+Enter）：不弹框，名字 = 选中首行；边加末尾
  await page.evaluate(() => { const el = document.getElementById("editor"); el.focus(); el.setSelectionRange(0, 5); });
  await page.keyboard.press("Control+Enter"); await wait(400);
  probe(tag, "spawn without sheet; title = 她推开门。", await page.evaluate(() => document.getElementById("sheet").classList.contains("hidden") && document.getElementById("nodeTitle").value === "她推开门。"), await page.inputValue("#nodeTitle"));
  await shot("09-after-spawn");
  await page.keyboard.press("Escape"); await page.keyboard.press("Alt+ArrowLeft"); await wait(300);
  await ensureSidebar(true);
  probe(tag, "spawned edge appended at END", JSON.stringify(await rows()) === JSON.stringify(["序章", "她推开门。"]), JSON.stringify(await rows()));
  // 连接已有… → 占位符加末尾（虚线）
  await page.click("#edgeLink"); await wait(300); await page.fill("#sheetInput", "祭祀线"); await page.click("#sheetConfirm"); await wait(300);
  probe(tag, "link existing/new name → stub appended at end", await page.evaluate(() => { const r = [...document.querySelectorAll("#edgeList .edge-row.stub .edge-name")]; return r.length === 1 && r[0].textContent === "祭祀线"; }) && (await rows()).at(-1) === "祭祀线", JSON.stringify(await rows()));
  // 检索：一个字就搜（孤儿也能扫）
  await page.fill("#edgeSearch", "章"); await wait(300); await shot("10-sidebar-search");
  probe(tag, "search with 1 char works", (await rows()).length >= 2, JSON.stringify(await rows()));
  await page.fill("#edgeSearch", ""); await wait(200);
  await page.click("#edgeBacklinks"); await wait(300); await shot("11-sidebar-backlinks");
  await page.click("#edgeBacklinks"); await wait(200);
  await page.click(".edge-row .edge-more"); await wait(300); await shot("12-sidebar-rowmenu");
  probe(tag, "row menu has no rename item", await page.evaluate(() => ![...document.querySelectorAll(".popup-menu button")].some((b) => /改名/.test(b.textContent ?? ""))));
  await page.keyboard.press("Escape"); await wait(200);
  // 章节名撞名：改成已有名 → 提示、不改
  await ensureSidebar(false); await page.click("#nodeTitle"); await page.fill("#nodeTitle", "序章"); await wait(700);
  probe(tag, "title collision → refused + toast", await page.evaluate(() => window.__xhw.project.current() === "第一章.txt" && /同名/.test(document.getElementById("toast").textContent)), await page.evaluate(() => window.__xhw.project.current()));
  await page.keyboard.press("Escape"); await wait(100);
  probe(tag, "title Escape → reverted", (await page.inputValue("#nodeTitle")) === "第一章");
  // 顶栏改名工程 → 不重开，正文/边栏不动，顶栏即时换名
  await page.click("#docNameButton"); await wait(300); await page.fill("#sheetInput", "秋音"); const t0 = Date.now(); await page.click("#sheetConfirm");
  let renamedIn = -1; for (let i = 0; i < 50; i++) { await wait(100); if ((await page.textContent("#docNameButton")).trim() === "秋音") { renamedIn = Date.now() - t0; break; } }
  probe(tag, `project rename → top bar updates without reload (${renamedIn}ms)`, renamedIn >= 0, await page.textContent("#docNameButton"));
  probe(tag, "project rename keeps node + edges", await page.evaluate(() => window.__xhw.project.current() === "第一章.txt") && (await rows()).length === 3, JSON.stringify(await rows()));
  if (w >= 900) { await ensureSidebar(false);
    const centered = await page.evaluate(() => { const r = document.querySelector(".page").getBoundingClientRect(); return getComputedStyle(document.getElementById("edgeSidebar")).display === "none" && Math.abs(r.left - (innerWidth - r.width) / 2) < 2; });
    probe(tag, "wide: sidebar closed → page centered", centered); await shot("13-wide-sidebar-collapsed");
    const before = await page.evaluate(() => JSON.stringify(document.querySelector(".page").getBoundingClientRect()));
    await ensureSidebar(true);
    const overlay = await page.evaluate((b) => { const p = document.querySelector(".page").getBoundingClientRect(), s = document.getElementById("edgeSidebar").getBoundingClientRect(); return JSON.stringify(p) === b && s.right <= innerWidth && s.left > innerWidth / 2; }, before);
    probe(tag, "wide: sidebar is an overlay on the RIGHT, page does not move", overlay); await shot("13b-wide-sidebar-right"); await ensureSidebar(false); }
  // 刷新：boot 走 openAny(last) → 工程回来、章节名回来、无红条
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" }); await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 }); await wait(1500);
  probe(tag, "reload → project reopened at 第一章, title shown", await page.evaluate(() => document.body.dataset.project === "1" && document.getElementById("nodeTitle").value === "第一章"), await page.inputValue("#nodeTitle"));
  probe(tag, "reload → no error state / banner", await page.evaluate(() => { const b = document.getElementById("errBanner"); return (!b || b.classList.contains("hidden")) && !document.getElementById("saveStatus").classList.contains("error"); }), await page.textContent("#saveStatus"));
  probe(tag, "reload → sidebar closed", !(await sidebarShown()));
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
  await page.click("#galleryBack"); await wait(400); await shot("19-back-to-editor");
  await ctx.close();
}
await browser.close(); srv.close();
console.log(errors.length ? "PAGE ERRORS/WARNINGS:\n" + errors.join("\n") : "no page errors");
console.log(fails ? `${fails} probe(s) FAILED` : "all probes ok");
process.exitCode = fails || errors.length ? 1 : 0;
