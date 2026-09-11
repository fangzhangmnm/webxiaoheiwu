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
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
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
  await page.waitForFunction(() => !!window.__xhw && window.__xhw.editor.canEdit(), null, { timeout: 15000 });   // boot 开出新稿后才能打字（之前在 __xhw 一出现就打，字被「不可用」守卫吞掉 → 整轮没有 txt 稿）
  await page.click("#editor"); await page.keyboard.type("第一篇：她推开门。他在窗边。窗外是雨。"); await wait(700);
  probe(tag, "txt doc materialized after typing", !!(await page.evaluate(() => window.__xhw.editor.state.name)));
  // 页脚字数统计（user 2026-09-10）：打字后显示「N 字 M 词」；设置 toggle 关 → 隐藏；再开 → 回来
  probe(tag, "word count footer shows N 字 M 词 after typing", await page.evaluate(() => { const e = document.getElementById("wordCount"); return !e.hidden && /^\d+ 字 \d+ 词$/.test(e.textContent ?? ""); }), await page.evaluate(() => document.getElementById("wordCount").textContent));
  probe(tag, "mic floats above the word-count footer (no overlap when both visible)", await page.evaluate(() => { const m = document.getElementById("micButton"), f = document.getElementById("wordCount"); const was = m.hidden; m.hidden = false; const a = m.getBoundingClientRect(), b = f.getBoundingClientRect(); m.hidden = was; const overlap = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; return !f.hidden && getComputedStyle(f).display !== "none" && !overlap && a.bottom <= b.top + 1 && getComputedStyle(m).position === "absolute"; }), await page.evaluate(() => { const m = document.getElementById("micButton"), f = document.getElementById("wordCount"); const was = m.hidden; m.hidden = false; const a = m.getBoundingClientRect(), b = f.getBoundingClientRect(); m.hidden = was; return `mic ${Math.round(a.top)}-${Math.round(a.bottom)} foot ${Math.round(b.top)}-${Math.round(b.bottom)}`; }));
  probe(tag, "word count toggle off hides the footer, on brings it back", await page.evaluate(() => { const tg = document.getElementById("wordCountToggle"), e = document.getElementById("wordCount"); tg.click(); const off = e.hidden; tg.click(); return off && !e.hidden; }));
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
  // 侧栏 = 当前页的邻域（ADR-0014 §7）：`..`（顶层 = 书，不可点）/ 兄弟（当前高亮）/ + 兄弟 / 子节 / + 子节 / 链接；没有第三层
  await ensureSidebar(true); await shot("07-sidebar-project");
  probe(tag, "project pane visible", !(await page.evaluate(() => document.getElementById("edgePane").hidden)));
  { const pr = await parentRow(); probe(tag, "`..` row at top level = the book, not clickable", !!pr && pr.root && pr.disabled && pr.name === "作品", JSON.stringify(pr)); }
  probe(tag, "siblings block = [作品] (current), + sibling and + child rows present", JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["作品"]) && await page.evaluate(() => !!document.getElementById("edgeAddSibling") && !!document.getElementById("edgeAddChild") && document.querySelector("#edgeList .edge-row.current .edge-name")?.textContent === "作品"), JSON.stringify(await rowsIn("siblings")));
  probe(tag, "sidebar has no third layer (flat rows, blocks ⊆ parent/siblings/children/links/incoming)", (await noThirdLayer()) && (await blocks()).every((b) => ["parent", "siblings", "children", "links", "incoming"].includes(b)), JSON.stringify(await blocks()));
  { await page.click("#edgeSearch"); await page.keyboard.type("nihao"); await wait(300);
    const comp = await page.evaluate(() => { const c = document.getElementById("candidateBar"); return c ? getComputedStyle(c).display !== "none" && (c.textContent ?? "").trim().length > 0 : false; });
    const raw = await page.inputValue("#edgeSearch"); probe(tag, "ime on edgeSearch", comp || raw === "", `(value=${JSON.stringify(raw)})`);
    await page.keyboard.press("Escape"); await page.fill("#edgeSearch", ""); await wait(100); }
  await ensureSidebar(true);
  // 「+ 兄弟」→ 第二章（作品 的兄弟），章节名框全选 → 改名「序章」→ Enter
  await page.click("#edgeAddSibling"); await wait(400);
  probe(tag, "+ sibling → asks for a name (no chapter suggestion, not prefilled)", await page.evaluate(() => !document.getElementById("sheet").classList.contains("hidden") && !/章/.test(document.getElementById("sheetInput").placeholder) && document.getElementById("sheetInput").value === ""));
  await page.fill("#sheetInput", "第二章"); await page.click("#sheetConfirm"); await wait(400);
  probe(tag, "+ sibling → new page 第二章 opened as a sibling of 作品, empty file, title shows it", await page.evaluate(() => document.getElementById("nodeTitle").value === "第二章" && window.__xhw.project.current() === "第二章.txt" && document.getElementById("editor").value === "") && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["作品", "第二章"]), JSON.stringify(await rowsIn("siblings")));
  probe(tag, "sidebar stays open after + (no auto-close)", await sidebarShown());
  if (w < 900) await ensureSidebar(false);   // 窄屏浮层盖住章节名框，探针自己收
  await page.click("#nodeTitle"); await page.evaluate(() => document.getElementById("nodeTitle").select()); await page.keyboard.type("序章"); await page.keyboard.press("Enter"); await wait(300);
  probe(tag, "title Enter → renamed + focus body", await page.evaluate(() => document.activeElement?.id === "editor" && window.__xhw.project.current() === "序章.txt"), await page.evaluate(() => window.__xhw.project.current()));
  await clickEditor(); await page.keyboard.type("序章正文。"); await wait(300);
  await shot("08-after-plus-rename");
  // 回退 → 作品：兄弟块 = 作品(当前)、序章（无 .txt；改名重写了树）
  await page.keyboard.press("Alt+ArrowLeft"); await wait(300);
  await ensureSidebar(true);
  probe(tag, "back to 作品; siblings = 作品 (current), 序章 without .txt (rename rewrote the tree)", JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["作品", "序章"]) && (await cur()) === "作品.txt", JSON.stringify(await rowsIn("siblings")));
  probe(tag, "row shows modified time as small text", await page.evaluate(() => /\d+\/\d+ \d\d:\d\d/.test(document.querySelector("#edgeList .edge-row[data-block='siblings'] .edge-sub")?.textContent ?? "")));
  // 前进 = 回退的逆（user 2026-09-10「既然有 back 了也加一个右箭头」）：回退后前进亮 → 前进回到序章 → 再回退回作品；新导航清空前进栈
  probe(tag, "after back: sidebar forward button live (right of back); back grey (that stack held one entry)", await page.evaluate(() => { const f = document.getElementById("edgeForward"), b = document.getElementById("edgeBack"); return !!f && !f.disabled && b.disabled && b.getBoundingClientRect().right <= f.getBoundingClientRect().left + 1 && !!f.querySelector("use[href='#forward']"); }), await page.evaluate(() => `forward.disabled=${document.getElementById("edgeForward")?.disabled} back.disabled=${document.getElementById("edgeBack").disabled}`));
  await page.click("#edgeForward"); await wait(300);
  probe(tag, "forward → 序章 again; forward grey, back live", (await cur()) === "序章.txt" && await page.evaluate(() => document.getElementById("edgeForward").disabled && !document.getElementById("edgeBack").disabled), await cur());
  await page.click("#edgeBack"); await wait(300);
  probe(tag, "back again → 作品; forward live", (await cur()) === "作品.txt" && await page.evaluate(() => !document.getElementById("edgeForward").disabled), await cur());
  await page.evaluate(() => window.__xhw.project.jump("序章.txt")); await page.evaluate(() => window.__xhw.sidebar.render()); await wait(150);
  probe(tag, "a fresh jump clears the forward stack (back keeps)", await page.evaluate(() => document.getElementById("edgeForward").disabled && window.__xhw.project.canGoBack() && !window.__xhw.project.canGoForward()));
  await page.evaluate(() => window.__xhw.project.goBack()); await page.evaluate(() => window.__xhw.sidebar.render()); await wait(150);
  probe(tag, "…and back lands on 作品 again", (await cur()) === "作品.txt", await cur());
  // Ctrl+Enter 分裂已去掉（user 2026-09-10「先不要做去奇怪的静默行为」）：无入口
  if (w < 900) await ensureSidebar(false);
  await page.evaluate(() => { const el = document.getElementById("editor"); el.focus(); el.setSelectionRange(0, 5); });
  await page.keyboard.press("Control+Enter"); await wait(300);
  probe(tag, "Ctrl+Enter does nothing (no sheet, text intact)", await page.evaluate(() => document.getElementById("sheet").classList.contains("hidden") && document.getElementById("editor").value.startsWith("她推开门。")));
  // 顶栏「+」= 菜单（加兄弟页 / 加子节 / 从图片…）→ 加子节 → 她推开门。（作品 的孩子）
  await page.click("#addPageButton"); await wait(250);
  { const items = await page.evaluate(() => [...document.querySelectorAll(".popup-menu button")].map((b) => (b.textContent ?? "").trim()));
    probe(tag, "top-bar + opens a menu: 加兄弟页 / 加子节 / 从图片…", items.some((x) => /兄弟/.test(x)) && items.some((x) => /子节/.test(x)) && items.some((x) => /图片/.test(x)), JSON.stringify(items)); }
  await page.evaluate(() => { const it = [...document.querySelectorAll(".popup-menu button")].find((b) => /子节/.test(b.textContent ?? "")); it.click(); }); await wait(300);
  await page.fill("#sheetInput", "她推开门。"); await page.click("#sheetConfirm"); await wait(400);
  await ensureSidebar(true);
  probe(tag, "top-bar + → child 她推开门。 opened; `..` = 作品 (clickable); siblings block = just itself", (await page.inputValue("#nodeTitle")) === "她推开门。" && JSON.stringify(await parentRow()) === JSON.stringify({ name: "作品", root: false, disabled: false }) && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["她推开门。"]), `${await page.inputValue("#nodeTitle")} ${JSON.stringify(await parentRow())}`);
  await shot("09-after-topbar-add");
  await page.click("#edgeParent"); await wait(300);
  probe(tag, "`..` click → jumps to the parent 作品; children block = [她推开门。]", (await cur()) === "作品.txt" && JSON.stringify(await rowsIn("children")) === JSON.stringify(["她推开门。"]) && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["作品", "序章"]), JSON.stringify(await rowsIn("children")));
  // 树移动六件（行菜单）：序章 降级 → 作品 的孩子末尾；上移；升级 → 回顶层；到头 no-op 只 toast
  { let r = await rowMenu("siblings", "序章.txt", /降级/); probe(tag, "row menu 降级 → 序章 becomes the last child of 作品", r.hit && JSON.stringify(await rowsIn("children")) === JSON.stringify(["她推开门。", "序章"]) && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["作品"]), JSON.stringify(await rowsIn("children")));
    r = await rowMenu("children", "序章.txt", /上移/); probe(tag, "row menu 上移 → children = [序章, 她推开门。]", r.hit && JSON.stringify(await rowsIn("children")) === JSON.stringify(["序章", "她推开门。"]), JSON.stringify(await rowsIn("children")));
    r = await rowMenu("children", "序章.txt", /升级/); probe(tag, "row menu 升级 → 序章 back to top level right after 作品", r.hit && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["作品", "序章"]) && JSON.stringify(await rowsIn("children")) === JSON.stringify(["她推开门。"]), JSON.stringify(await rowsIn("siblings")));
    r = await rowMenu("siblings", "作品.txt", /上移/); probe(tag, "row menu 上移 at the top → no-op + toast, tree unchanged", r.hit && /到头/.test(await page.textContent("#toast")) && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["作品", "序章"]), await page.textContent("#toast"));
    r = await rowMenu("siblings", "作品.txt"); probe(tag, "tree row menu = 上移/下移/升级/降级/移出树/导出这一支 (no rename, no hard delete, no 移出丢引用)", r.opened && r.items.some((x) => /升级/.test(x.label)) && r.items.some((x) => /移出树/.test(x.label)) && r.items.some((x) => /导出这一支/.test(x.label)) && !r.items.some((x) => /改名|彻底|丢引用/.test(x.label)) && r.items.every((x) => !x.disabled), JSON.stringify(r.items)); await page.keyboard.press("Escape"); await wait(150); }
  await shot("10-tree-moves");
  // 上一页 / 下一页 = 全树前序 DFS（作品 → 她推开门。 → 序章）；首尾不绕回
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
    let r = await rowMenu("links", "序章.txt"); probe(tag, "link row of an in-tree page: 上移/下移/移出（丢引用）, no 归档 items", r.opened && r.items.some((x) => /丢引用/.test(x.label)) && !r.items.some((x) => /归档/.test(x.label)), JSON.stringify(r.items)); await page.keyboard.press("Escape"); await wait(150);
    r = await rowMenu("children", "她推开门。.txt", /移出树/); const names = await page.evaluate(() => window.__xhw.project.nodeNames());
    probe(tag, "row menu 移出树 → gone from children, file kept, NOT renamed, prev/next of the parent skip it", r.hit && (await rowsIn("children")).length === 0 && names.includes("她推开门。.txt") && !names.some((x) => /_废-/.test(x)) && (await navState()).next === false && (await page.evaluate(() => window.__xhw.project.neighborhood().next)) === "序章.txt", JSON.stringify(names));
    await page.fill("#edgeSearch", "她推"); await wait(300);
    r = await rowMenu("results", "她推开门。.txt"); probe(tag, "search finds the loose page; as an orphan its menu = 彻底删除 only", r.opened && r.items.length === 1 && /彻底删除/.test(r.items[0].label), JSON.stringify(r.items)); await page.keyboard.press("Escape"); await page.fill("#edgeSearch", ""); await wait(200);
    await page.evaluate(() => window.__xhw.project.addLink("她推开门。")); await page.evaluate(() => window.__xhw.sidebar.render()); await wait(150);
    r = await rowMenu("links", "她推开门。.txt", /归档到这页之下/); probe(tag, "link row of a loose page offers 归档到这页之后/之下 → files it back under 作品", r.hit && JSON.stringify(await rowsIn("children")) === JSON.stringify(["她推开门。"]) && /已归档/.test(await page.textContent("#toast")), `${JSON.stringify(await rowsIn("children"))} ${await page.textContent("#toast")}`);
    await rowMenu("children", "她推开门。.txt", /移出树/);
    const ok = await page.evaluate(() => window.__xhw.project.dropRef("她推开门。.txt")); await page.evaluate(() => window.__xhw.sidebar.render()); await wait(200);
    const names2 = await page.evaluate(() => window.__xhw.project.nodeNames());
    probe(tag, "drop reference (out of tree + last link) → orphan renamed _废-她推开门。, gone from list", ok && names2.includes("_废-她推开门。.txt") && !names2.includes("她推开门。.txt") && !(await rows()).includes("她推开门。"), JSON.stringify(names2));
    await page.fill("#edgeSearch", "废"); await wait(300);
    probe(tag, "search finds the orphan; its row menu = 彻底删除 only", (await rows()).includes("_废-她推开门。") && await page.evaluate(() => { const r = [...document.querySelectorAll("#edgeList .edge-row")].find((x) => /_废-她推开门/.test(x.textContent)); return !!r?.querySelector(".edge-more"); }));
    await page.click("#edgeList .edge-row .edge-more"); await wait(200);
    probe(tag, "orphan menu = 彻底删除 only", await page.evaluate(() => { const items = [...document.querySelectorAll(".popup-menu button")].map((b) => (b.textContent ?? "").trim()); return items.length === 1 && /彻底删除/.test(items[0]); }));
    await page.keyboard.press("Escape"); await page.fill("#edgeSearch", ""); await wait(200); }
  probe(tag, "no spawn/link/backlinks buttons in sidebar", await page.evaluate(() => !document.getElementById("edgeSpawn") && !document.getElementById("edgeLink") && !document.getElementById("edgeBacklinks") && document.getElementById("edgeFoot").hidden));
  // 检索：一个字就搜（孤儿也能扫）
  await page.fill("#edgeSearch", "章"); await wait(300); await shot("11-sidebar-search");
  probe(tag, "search with 1 char works", (await rows()).length >= 1 && (await rows()).includes("序章"), JSON.stringify(await rows()));
  await page.fill("#edgeSearch", ""); await wait(200);
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
  probe(tag, "project read-only: textarea+title readOnly, + refuses, tree moves refuse, row menu items grey", await page.evaluate(() => document.getElementById("editor").readOnly && document.getElementById("nodeTitle").readOnly && window.__xhw.project.readOnly() && window.__xhw.project.newNode("x") === false && window.__xhw.project.newSibling("x") === false && window.__xhw.project.treeMove("序章.txt", "up") === false) && await (async () => { await ensureSidebar(true); const r = await rowMenu("siblings", "序章.txt"); await page.keyboard.press("Escape"); await wait(100); return r.opened && r.items.filter((x) => !/导出/.test(x.label)).every((x) => x.disabled) && r.items.some((x) => /导出/.test(x.label) && !x.disabled); })());
  await page.click("#lockToggle"); await wait(300);
  probe(tag, "project read-only off again", await page.evaluate(() => !document.getElementById("editor").readOnly && !window.__xhw.project.readOnly()));
  await page.click("#lockToggle"); await wait(600);   // 锁上 → 刷新后仍锁（跟着作品进 zip）
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" }); await page.waitForFunction(() => !!window.__xhw, null, { timeout: 15000 }); await wait(1500);
  probe(tag, "read-only lock persisted inside the book (survives reload)", await page.evaluate(() => window.__xhw.project.readOnly() && document.getElementById("editor").readOnly));
  await page.click("#lockToggle"); await wait(600);
  probe(tag, "txt has no lock toggle", await page.evaluate(async () => { const it = window.__xhw.drawer.items().find((x) => /\.txt$/i.test(x.name)); if (!it) return false; await window.__xhw.openAny(it.name); return !window.__xhw.project.active() && document.getElementById("lockToggle").hidden; }));
  await page.evaluate(async () => { const it = window.__xhw.drawer.items().find((x) => /webxiaoheiwu\.zip$/i.test(x.name)); if (it) await window.__xhw.openAny(it.name); }); await wait(800);
  await ensureSidebar(true);
  probe(tag, "project rename keeps pages + tree + links", await page.evaluate(() => window.__xhw.project.current() === "作品.txt") && JSON.stringify(await rowsIn("siblings")) === JSON.stringify(["作品", "序章"]) && JSON.stringify(await rowsIn("links")) === JSON.stringify(["序章"]), JSON.stringify(await rows()));
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
  // 锁卡不串场（user 2026-09-10「一开始是 xxx 是加密稿，然后我开新书之后 editor 还是 xxx 是加密稿」）：txt 稿设密码 → 锁定 → 锁卡出现 → 书库新建书 → 锁卡必须消失
  await page.waitForFunction(() => window.__xhw.editor.canEdit(), null, { timeout: 15000 });
  const encOk = await page.evaluate(async () => {
    if (!window.__xhw.editor.state.name) return "no doc";
    const p = new Promise((resolve) => { const tick = setInterval(async () => { const sheet = document.getElementById("sheet"); if (!sheet.classList.contains("hidden")) { clearInterval(tick); document.getElementById("sheetInput").value = "audit-pw-1"; document.getElementById("sheetInput2").value = "audit-pw-1"; document.getElementById("sheetConfirm").click(); for (let i = 0; i < 100; i++) { await new Promise((r) => setTimeout(r, 200)); if (window.__xhw.editor.state.encrypted) return resolve("encrypted"); } resolve("timeout"); } }, 100); });
    document.getElementById("cryptoToggle").click();
    return await p;
  });
  probe(tag, "txt draft can be encrypted (audit precondition)", encOk === "encrypted", encOk);
  await page.evaluate(() => window.__xhw.lockNow()); await wait(1500);
  probe(tag, "locked encrypted draft shows the lock card", await page.evaluate(() => !document.getElementById("lockCard").hidden && /加密稿/.test(document.getElementById("lockCardText").textContent ?? "")));
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
  await ensureSidebar(true); await shot("21-image-page");
  await page.click("#edgeBack"); await wait(300);   // 回到 作品：它的出边列表里才有两张图
  probe(tag, "sidebar rows for image pages carry the image icon (in the links block)", await page.evaluate(() => [...document.querySelectorAll("#edgeList .edge-row[data-block='links']")].filter((r) => r.querySelector(".edge-kind")).length === 2), await page.evaluate(() => [...document.querySelectorAll("#edgeList .edge-row .edge-name")].map((e) => e.textContent).join("|")));
  await page.evaluate(() => { const r = [...document.querySelectorAll("#edgeList .edge-row .edge-main")].find((b) => /地图\.jpg/.test(b.textContent)); if (!r) throw new Error("地图 row missing"); r.click(); }); await page.waitForFunction(() => window.__xhw.project.current() === "地图.jpg", null, { timeout: 5000 }); await wait(300);
  // 设为封面
  if (w < 900) await ensureSidebar(false);   // 窄屏侧栏是浮层，盖着纸面上的钮
  await page.click("#pageImageCover"); await page.waitForFunction(() => !!window.__xhw.project.thumbnail(), null, { timeout: 30000 }); await wait(300);
  const thumb1 = await page.evaluate(() => Array.from(window.__xhw.project.thumbnail()));
  probe(tag, "set as cover → Thumbnails/thumbnail.png bytes present, PNG, ≤ 70 KB", thumb1.length > 0 && thumb1[1] === 0x50 && thumb1.length <= 70 * 1024, String(thumb1.length));
  // 替换图片（封面跟着换）：sheet → 确认 → file input
  if (w < 900) await ensureSidebar(false);
  await page.click("#pageImageReplace"); await wait(300); await page.click("#sheetConfirm"); await wait(200);
  await page.setInputFiles("#imageReplaceInput", [{ name: "地图2.png", mimeType: "image/png", buffer: makePng(2100, 1400, 11) }]);
  await page.waitForFunction(() => /已替换/.test(document.getElementById("toast").textContent), null, { timeout: 60000 }); await wait(300);
  const thumb2 = await page.evaluate(() => Array.from(window.__xhw.project.thumbnail()));
  probe(tag, "replace image on the cover page → cover regenerated (bytes differ), name kept", thumb2.length > 0 && thumb2.join() !== thumb1.join() && (await page.evaluate(() => window.__xhw.project.current())) === "地图.jpg", await page.textContent("#toast"));
  // 断入边：图片页的「谁指向这里」列出 作品 → 断开
  await ensureSidebar(true);
  probe(tag, "incoming section lists the page that links here", await page.evaluate(() => [...document.querySelectorAll("#edgeList .edge-row.header")].some((h) => /指向这里/.test(h.textContent))));
  await page.evaluate(() => { const rows = [...document.querySelectorAll("#edgeList .edge-row")]; const hi = rows.findIndex((r) => r.classList.contains("header") && /指向这里/.test(r.textContent)); rows[hi + 1].querySelector(".edge-more").click(); }); await wait(250);
  await page.evaluate(() => { const it = [...document.querySelectorAll(".popup-menu-item")].find((b) => /断开/.test(b.textContent)); if (!it) throw new Error("cut item missing"); it.click(); }); await wait(300);
  probe(tag, "cut incoming link → no backlinks left, page not renamed", await page.evaluate(() => window.__xhw.project.session().backlinksOf("地图.jpg").length === 0 && window.__xhw.project.nodeNames().includes("地图.jpg")));
  // 拖 txt → 新页；粘贴位图 → 日期码名图片页
  await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(["拖进来的正文"], "拖进来的.txt", { type: "text/plain" })); document.querySelector(".page").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); });
  await page.waitForFunction(() => window.__xhw.project.nodeNames().includes("拖进来的.txt"), null, { timeout: 10000 });
  probe(tag, "drop .txt onto the paper → new page with the file's text", (await page.evaluate(() => window.__xhw.project.session().bytesOf("拖进来的.txt") && new TextDecoder().decode(window.__xhw.project.session().bytesOf("拖进来的.txt")))) === "拖进来的正文");
  await page.evaluate(async () => { const c = new OffscreenCanvas(40, 30); const cx = c.getContext("2d"); cx.fillStyle = "#c33"; cx.fillRect(0, 0, 40, 30); const blob = await c.convertToBlob({ type: "image/png" }); const dt = new DataTransfer(); dt.items.add(new File([blob], "image.png", { type: "image/png" })); document.getElementById("editor").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); });
  await page.waitForFunction(() => window.__xhw.project.nodeNames().some((n) => /^\d{8}-[0-9a-f]{4}\.png$/.test(n)), null, { timeout: 15000 });
  probe(tag, "paste a bitmap → image page named by date code", true);
  await shot("22-after-drop-paste");
  // 书库：2:3 竖版、窄屏三列、封面缩略图露面
  await ensureSidebar(true); await page.click("#edgeLibrary"); await wait(2500);
  probe(tag, "library grid is tall (2:3) and narrow screens get 3 columns", await page.evaluate(() => { const g = document.querySelector("#galleryMount .gallery-grid"); const cols = getComputedStyle(g).gridTemplateColumns.split(" ").length; return g.classList.contains("tall") && (innerWidth >= 500 || cols === 3); }), await page.evaluate(() => getComputedStyle(document.querySelector("#galleryMount .gallery-grid")).gridTemplateColumns));
  await page.waitForFunction(() => [...document.querySelectorAll("#galleryMount .gallery-tile")].some((t) => /锁卡测试书/.test(t.textContent) && t.querySelector("img.gallery-tile-thumb")?.src), null, { timeout: 15000 }).catch(() => {});
  probe(tag, "library tile of the book shows the cover thumbnail", await page.evaluate(() => [...document.querySelectorAll("#galleryMount .gallery-tile")].some((t) => /锁卡测试书/.test(t.textContent) && !!t.querySelector("img.gallery-tile-thumb")?.src)));
  probe(tag, "active tile tag says 打开中 (not 编辑中)", await page.evaluate(() => { const tag = document.querySelector("#galleryMount .gallery-tile.active .gallery-tile-active-tag"); return !!tag && tag.textContent.trim() === "打开中"; }));
  await shot("23-library-covers");
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
  await ctx.close();
}
await browser.close(); srv.close();
console.log(errors.length ? "PAGE ERRORS/WARNINGS:\n" + errors.join("\n") : "no page errors");
console.log(fails ? `${fails} probe(s) FAILED` : "all probes ok");
process.exitCode = fails || errors.length ? 1 : 0;
