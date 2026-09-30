// 开发工具：app 内软键盘 / 候选的无头探针——触屏仿真下逐键点按、截图到 tmp/ui-kb/。created 2026-09-29 by Claude Fable 5.1。不进 bundle。
//   用法：node tools/kb-audit.mjs（需先 build）。尺寸 = iPhone SE2 竖 / 横、iPad mini 竖 / 横（user 2026-09-29「你看一下 ipad mini，iphone se2 怎么办」）。
//   ⚠ 无头 Chromium 的触屏仿真**不是** iOS Safari：iOS 原生文字手势（点一下挪光标）这里复现不了。这里验的是结构（键盘常驻、底下没有正文、点选在 click 才算数）
//     和逻辑（落字位置、顺序、焦点），真机手感仍要上机。
import { createRequire } from "node:module";
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
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
const url = `http://127.0.0.1:${srv.address().port}/index.html`;
await mkdir(join(ROOT, "tmp/ui-kb"), { recursive: true });
const browser = await chromium.launch();
let fails = 0; const errors = [];
const probe = (tag, name, ok, detail = "") => { console.log(tag, name + ":", ok ? "ok" : `FAIL ${detail}`); if (!ok) fails++; };

const SIZES = [[375, 667, "se2-portrait"], [667, 375, "se2-landscape"], [744, 1133, "ipadmini-portrait"], [1133, 744, "ipadmini-landscape"]];
for (const [w, h, tag] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${tag}] console.error: ${m.text()}`); });
  const wait = (ms) => page.waitForTimeout(ms);
  const shot = (name) => page.screenshot({ path: `tmp/ui-kb/${tag}-${name}.png` });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__xhw && window.__xhw.editor.canEdit(), null, { timeout: 20000 });
  await wait(1500);   // RIME 起
  const rectOf = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, shown: getComputedStyle(e).display !== "none" && r.height > 0 }; }, sel);
  /** 点一个键：按键帽上的字 / aria-label 找。 */
  const tapKey = async (label) => {
    const pos = await page.evaluate((lab) => { const k = [...document.querySelectorAll("#imeDock .ime-key")].find((e) => (e.getAttribute("aria-label") ?? e.textContent) === lab); if (!k) return null; const r = k.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, label);
    if (!pos) throw new Error(`key "${label}" not on screen; have: ` + (await page.evaluate(() => [...document.querySelectorAll("#imeDock .ime-key")].map((e) => e.getAttribute("aria-label") ?? e.textContent).join(" "))));
    await page.touchscreen.tap(pos.x, pos.y); await wait(90);
  };
  const tapKeys = async (s) => { for (const c of s) await tapKey(c); };
  const tapCand = async (i) => { const pos = await page.evaluate((i) => { const c = [...document.querySelectorAll("#imeDock .cand:not(.nav)")][i]; if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: c.textContent }; }, i); if (!pos) throw new Error("no candidate " + i); await page.touchscreen.tap(pos.x, pos.y); await wait(250); return pos.t; };
  const ed = () => page.evaluate(() => { const e = document.getElementById("editor"); return { v: e.value, s: e.selectionStart, e: e.selectionEnd, active: document.activeElement?.id, inputmode: e.getAttribute("inputmode") }; });

  // ① 点正文 → 键盘露出；正文 inputmode=none；纸面让出键盘的高度
  const er = await rectOf("#editor");
  await page.touchscreen.tap(er.l + er.w / 2, er.t + 30); await wait(400);
  const dock = await rectOf("#imeDock"), pg = await rectOf(".page");
  probe(tag, "tap the paper → soft keyboard docked at the bottom", !!dock?.shown && Math.abs(dock.b - h) < 1 && dock.l === 0 && Math.abs(dock.r - w) < 1, JSON.stringify(dock));
  probe(tag, "editor has inputmode=none (system keyboard never pops) and keeps focus", (await ed()).inputmode === "none" && (await ed()).active === "editor", JSON.stringify(await ed()));
  probe(tag, "paper ends above the keyboard (nothing of the paper lies under it)", pg.b <= dock.t + 0.5, `page.bottom=${pg.b} dock.top=${dock.t}`);
  probe(tag, "paper keeps a usable height above the keyboard", pg.h >= (h < 500 ? 110 : 200), `page.h=${pg.h}`);
  const keysFit = await page.evaluate(() => [...document.querySelectorAll("#imeDock .ime-key")].every((k) => { const r = k.getBoundingClientRect(); return r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.width >= 24 && r.height >= 30; }));
  probe(tag, "every key is on screen and at least 24×30", keysFit, await page.evaluate(() => JSON.stringify([...document.querySelectorAll("#imeDock .ime-key")].map((k) => { const r = k.getBoundingClientRect(); return [k.textContent, Math.round(r.width), Math.round(r.height)]; }).filter((x) => x[1] < 24 || x[2] < 30))));
  await shot("01-keyboard");
  // 键位几何照 iOS（v2.1.33，user「ios 的键位会宽一点，然后 s 和 z 对齐的」）：所有字母键等宽；z 的左边 == s 的左边；第二排两端各空半键
  {
    const g = await page.evaluate(() => {
      const keys = [...document.querySelectorAll(".ime-keys[data-layer=letters] .ime-key")].filter((k) => /^[a-z]$/.test(k.textContent.trim()));
      const rect = (ch) => keys.find((k) => k.textContent.trim() === ch).getBoundingClientRect();
      const widths = keys.map((k) => Math.round(k.getBoundingClientRect().width * 10) / 10);
      const row2 = rect("a").left - rect("q").left, key = rect("q").width, gap = rect("w").left - rect("q").right;
      return { minW: Math.min(...widths), maxW: Math.max(...widths), zLeft: rect("z").left, sLeft: rect("s").left, row2Offset: row2, halfKey: (key + gap) / 2, gap };
    });
    probe(tag, "letter keys all the same width; z aligned under s; asdf row inset by half a key (iOS geometry)", g.maxW - g.minW <= 1 && Math.abs(g.zLeft - g.sLeft) <= 1 && Math.abs(g.row2Offset - g.halfKey) <= 1, JSON.stringify(g));
  }

  // ② 多行正文、光标放在第 2 行末 → 打「nihao」点首选 → 字落在光标处、光标紧跟其后（不乱跑）
  await page.evaluate(() => { const e = document.getElementById("editor"); e.focus(); const v = Array.from({ length: 40 }, (_, i) => `第${i + 1}行：她推开门。`).join("\n"); e.setRangeText(v, 0, e.value.length, "end"); e.dispatchEvent(new Event("input", { bubbles: true })); const p = v.indexOf("\n", v.indexOf("\n") + 1); e.setSelectionRange(p, p); e.scrollTop = 0; });
  const before = await ed();
  await tapKeys("nihao"); await wait(300);
  const strip = await page.evaluate(() => { const c = [...document.querySelectorAll("#imeDock .cand:not(.nav)")].map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent, l: r.left, r: r.right }; }); return { pre: window.__xhw.ime.getState().buffer, c, floatHidden: document.getElementById("candidateBar").classList.contains("hidden") }; });
  probe(tag, "composing: candidates in the strip (pinyin not shown in the dock, v2.1.24), floating bar hidden", /ni\s?hao/.test(strip.pre) && strip.c.length >= 3 && strip.floatHidden, JSON.stringify(strip));
  probe(tag, "first candidate fully on screen at the left", strip.c[0] && strip.c[0].l >= 0 && strip.c[0].r <= w, JSON.stringify(strip.c[0]));
  await shot("02-composing");
  const picked = await tapCand(0);
  const after = await ed();
  probe(tag, "tap 1st candidate → word lands at the caret, caret right after it, focus stays", after.v.slice(before.s, before.s + picked.length) === picked && after.s === before.s + picked.length && after.s === after.e && after.active === "editor", `picked=${picked} before=${before.s} after=${JSON.stringify({ s: after.s, e: after.e, a: after.active })} around=${after.v.slice(before.s - 4, before.s + 6)}`);
  probe(tag, "keyboard + strip stay docked after the pick (nothing to fall through to)", (await rectOf("#imeDock"))?.shown === true && (await page.evaluate(() => document.querySelector("#imeDock .ime-cands").children.length)) === 0);
  // v2.1.26 一张纸模型：正文框不滚、纸滚。光标所在行（第 2 行末）刚上了字 → 那一行在顶栏之下、键盘之上（纸跟着光标）
  probe(tag, "sheet follows the caret: the line just typed on sits between the top bar and the keyboard", await page.evaluate(() => { const e = document.getElementById("editor"), sf = document.querySelector("main.surface"), dock = document.getElementById("imeDock"); const lh = parseFloat(getComputedStyle(e).lineHeight); const before = e.value.slice(0, e.selectionEnd); const lines = before.split("\n").length; const top = e.getBoundingClientRect().top + (lines - 1) * lh, bottom = top + lh; const viewTop = sf.getBoundingClientRect().top + parseFloat(getComputedStyle(sf).paddingTop), dockTop = dock.getBoundingClientRect().top; return top >= viewTop - 0.5 && bottom <= dockTop + 0.5; }), await page.evaluate(() => { const e = document.getElementById("editor"), sf = document.querySelector("main.surface"), dock = document.getElementById("imeDock"); const lh = parseFloat(getComputedStyle(e).lineHeight); const lines = e.value.slice(0, e.selectionEnd).split("\n").length; const top = e.getBoundingClientRect().top + (lines - 1) * lh; return `caretLine ${Math.round(top)}-${Math.round(top + lh)} view ${Math.round(sf.getBoundingClientRect().top + parseFloat(getComputedStyle(sf).paddingTop))}-${Math.round(dock.getBoundingClientRect().top)} scrollTop=${Math.round(sf.scrollTop)}`; }));
  // 在纸的末尾续打：光标行仍在键盘之上（浏览器自己的光标跟随 + app 的兜底）
  const nEnd = await page.evaluate(() => { const e = document.getElementById("editor"); const n = e.value.length; e.setSelectionRange(n, n); return n; });
  await tapKeys("ni"); await tapKey("空格"); await wait(250);
  probe(tag, "typing at the very end: the last line stays above the keyboard", await page.evaluate(() => { const e = document.getElementById("editor"), dock = document.getElementById("imeDock"); return e.getBoundingClientRect().bottom <= dock.getBoundingClientRect().top + 0.5 && e.getBoundingClientRect().bottom > 0; }), await page.evaluate(() => { const e = document.getElementById("editor"), dock = document.getElementById("imeDock"); return `edBottom=${Math.round(e.getBoundingClientRect().bottom)} dockTop=${Math.round(dock.getBoundingClientRect().top)}`; }));
  await page.evaluate((n) => { const e = document.getElementById("editor"); e.setRangeText("", n, e.value.length, "end"); e.dispatchEvent(new Event("input", { bubbles: true })); const q = e.value.indexOf("\n", e.value.indexOf("\n") + 1); e.setSelectionRange(q, q); }, nEnd);   // 撤掉末尾刚打的字、光标回第 2 行末（后面的探针接着量第 2 行）

  // ③ 连打「ni 空格 。」顺序不乱；长拼音首选仍在屏内
  const s0 = (await ed()).s;
  await tapKeys("ni"); await tapKey("空格"); await tapKey("。"); await wait(300);
  const a3 = await ed();
  probe(tag, "ni + space + 。 → 你。 in that order", a3.v.slice(s0, s0 + 2) === "你。" && a3.s === s0 + 2, a3.v.slice(s0 - 2, s0 + 4));
  await tapKeys("woxiangquchifanranhou"); await wait(400);
  const long = await page.evaluate(() => { const c = document.querySelector("#imeDock .cand:not(.nav)"); const r = c?.getBoundingClientRect(); const strip = document.querySelector("#imeDock .ime-strip").getBoundingClientRect(); return { first: r ? { l: r.left, r: r.right, t: c.textContent } : null, stripLeft: strip.left, stripH: strip.height, smallPinyin: (() => { const p = document.querySelector("#imeDock .ime-preedit-small"); if (!p) return false; const cs = getComputedStyle(p); return p.textContent.length > 0 && parseFloat(cs.fontSize) <= 11 && cs.position === "absolute"; })(), noHideInStrip: !document.querySelector("#imeDock .ime-strip .ime-hide"), hideKey: !!document.querySelector("#imeDock .ime-key.hide") }; });
  probe(tag, "long pinyin: 1st candidate still starts at the strip's left edge and is fully on screen; pinyin shown as a small (≤11px) overlay that costs no width or height (v2.1.33, user「拼音还是用比较小的字体显示一下吧」); no hide column, strip ≤ 40px; hide key lives in the bottom row", !!long.first && long.first.l >= 0 && long.first.l - long.stripLeft < 12 && long.first.r <= w && long.smallPinyin && long.noHideInStrip && long.hideKey && long.stripH <= 40, JSON.stringify(long));
  await shot("03-long-pinyin");
  await tapKey("空格"); await wait(300);

  // ④ 符号层 / 上档 / 退格 / 回车
  const s1 = (await ed()).s;
  await tapKey("123"); await wait(100); await shot("04-symbols");
  await tapKeys("12"); await tapKey("？"); await tapKey("ABC"); await wait(100);
  await tapKey("上档"); await tapKey("A"); await tapKey("b"); await wait(200);
  const a4 = await ed();
  probe(tag, "123 layer digits + ？, back to letters, shift-once A then lowercase b goes to the IME", a4.v.slice(s1, s1 + 4) === "12？A" && (await page.evaluate(() => window.__xhw.ime.getState().buffer)) === "b", a4.v.slice(s1, s1 + 6));
  await tapKey("退格（按住连删）"); await wait(150);   // 删掉拼音 b
  await tapKey("退格（按住连删）"); await wait(150);   // 删掉 A
  const a5 = await ed();
  probe(tag, "backspace: first the pinyin, then the letter before the caret", a5.v.slice(s1, s1 + 3) === "12？" && a5.s === s1 + 3, a5.v.slice(s1, s1 + 5));
  await tapKey("换行 / 确定"); await wait(150);
  probe(tag, "enter inserts a newline in the paper", (await ed()).v.slice(s1 + 3, s1 + 4) === "\n");
  await page.keyboard.press("Control+z").catch(() => {});   // 实体键：顺带验「实体键盘让位」在 ⑥

  // ⑤ 收起键盘 → 键盘钮在；点键盘钮 → 回来
  await tapKey("收起键盘"); await wait(400);
  probe(tag, "real key press (Ctrl+Z) made the soft keyboard step aside; hide button keeps it hidden; paper gets its height back", (await rectOf("#imeDock"))?.shown !== true && (await rectOf(".page")).b > h - 40, JSON.stringify(await rectOf(".page")));
  const tg = await rectOf("#kbToggle");
  probe(tag, "keyboard button shows at the paper's bottom-left while the keyboard is hidden", !!tg?.shown && tg.l < w / 2, JSON.stringify(tg));
  await shot("05-hidden");
  await page.touchscreen.tap(tg.l + tg.w / 2, tg.t + tg.h / 2); await wait(400);
  probe(tag, "tap the keyboard button → keyboard back, focus in the paper", (await rectOf("#imeDock"))?.shown === true && (await ed()).active === "editor");

  // ⑥ 实体键盘让位：组字中候选回到 PC 式悬浮条；悬浮条两行、首选在屏内
  await page.keyboard.type("nihao"); await wait(400);
  const fl = await page.evaluate(() => { const b = document.getElementById("candidateBar"); const r = b.getBoundingClientRect(); const c = b.querySelector(".cand:not(.nav)")?.getBoundingClientRect(); return { dockHidden: document.getElementById("imeDock").classList.contains("hidden"), shown: !b.classList.contains("hidden"), l: r.left, r: r.right, first: c ? { l: c.left, r: c.right } : null, pre: b.querySelector(".ime-preedit").textContent }; });
  probe(tag, "hardware typing → soft keyboard hidden, floating bar shows pinyin + candidates inside the screen", fl.dockHidden && fl.shown && fl.l >= 0 && fl.r <= w && !!fl.first && fl.first.l >= 0 && fl.first.r <= w && /ni\s?hao/.test(fl.pre), JSON.stringify(fl));
  await shot("06-hardware-floating");
  await page.keyboard.press("Escape"); await wait(200);

  // ⑦ sheet 里的输入框：键盘在 sheet 之上、sheet 的卡片整个在键盘上方；键盘打的字进 sheet 的框；回车 = 确定
  await page.evaluate(() => { localStorage.removeItem("webxiaoheiwu-7c2e9a41b3d05f68:softKeyboardHidden"); });
  const tg2 = await rectOf("#kbToggle"); if (tg2?.shown) { await page.touchscreen.tap(tg2.l + tg2.w / 2, tg2.t + tg2.h / 2); await wait(300); }
  await page.evaluate(() => document.getElementById("docNameButton").click()); await wait(500);
  const sh = await page.evaluate(() => { const c = document.getElementById("sheetCard").getBoundingClientRect(), d = document.getElementById("imeDock").getBoundingClientRect(); return { active: document.activeElement?.id, cardBottom: c.bottom, cardTop: c.top, dockTop: d.top, dockShown: !document.getElementById("imeDock").classList.contains("hidden"), inputmode: document.getElementById("sheetInput").getAttribute("inputmode") }; });
  probe(tag, "rename sheet: its input is focused, keyboard docked, the whole card sits above the keyboard", sh.active === "sheetInput" && sh.dockShown && sh.cardBottom <= sh.dockTop + 0.5 && sh.cardTop >= 0 && sh.inputmode === "none", JSON.stringify(sh));
  probe(tag, "rename sheet: input and both buttons are visible above the keyboard", await page.evaluate(() => { const d = document.getElementById("imeDock").getBoundingClientRect(); return ["sheetInput", "sheetConfirm", "sheetCancel"].every((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.top >= 0 && r.bottom <= d.top + 0.5; }); }));
  await shot("07-sheet");
  await page.evaluate(() => { const i = document.getElementById("sheetInput"); i.setSelectionRange(0, i.value.length); });
  await tapKeys("shu"); await wait(250); const word = await tapCand(0); await wait(200);
  probe(tag, "typing into the sheet input through the soft keyboard replaces the selection with the picked word", (await page.inputValue("#sheetInput")) === word, `${await page.inputValue("#sheetInput")} vs ${word}`);
  await tapKey("换行 / 确定"); await wait(900);
  probe(tag, "enter on the soft keyboard confirms the sheet (file renamed)", await page.evaluate((wd) => document.getElementById("sheet").classList.contains("hidden") && (document.getElementById("docNameButton").textContent ?? "").includes(wd), word), await page.evaluate(() => document.getElementById("docNameButton").textContent));
  await ctx.close();
}
// ── VR 输入模态（user 2026-09-29「不过不要忘了 vr 的输入模态」）：Quest 浏览器 = 手柄射线 / 手势捏合，一次一个指针、按鼠标指针算、没有多点触控。
//   默认当「有实体键盘」（一直如此：不弹任何键盘）；纯手柄的人点纸面左下角的键盘钮把软键盘召出来，用射线逐键点；实体键盘一敲，软键盘让位。
{
  const tag = "quest-1280x720";
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, userAgent: "Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/35.0 Chrome/126.0 VR Safari/537.36" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${tag}] console.error: ${m.text()}`); });
  const wait = (ms) => page.waitForTimeout(ms);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__xhw && window.__xhw.editor.canEdit(), null, { timeout: 20000 });
  await wait(1500);
  await page.click("#editor"); await wait(300);
  probe(tag, "focus the paper: no soft keyboard by default, editor inputmode=none (no system keyboard either), keyboard button visible", await page.evaluate(() => document.getElementById("imeDock").classList.contains("hidden") && document.getElementById("editor").getAttribute("inputmode") === "none" && !document.getElementById("kbToggle").hidden));
  await page.click("#kbToggle"); await wait(400);
  probe(tag, "click the keyboard button → soft keyboard docked, focus in the paper", await page.evaluate(() => !document.getElementById("imeDock").classList.contains("hidden") && document.activeElement?.id === "editor"));
  const clickKey = async (label) => { const pos = await page.evaluate((lab) => { const k = [...document.querySelectorAll("#imeDock .ime-key")].find((e) => (e.getAttribute("aria-label") ?? e.textContent) === lab); const r = k.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, label); await page.mouse.move(pos.x, pos.y); await page.mouse.down(); await page.mouse.up(); await wait(80); };
  for (const c of "zhe") await clickKey(c); await wait(300);
  const hover = await page.evaluate(() => { const k = [...document.querySelectorAll("#imeDock .ime-key")].find((e) => e.textContent === "e"); return getComputedStyle(k).backgroundColor !== getComputedStyle([...document.querySelectorAll("#imeDock .ime-key")].find((e) => e.textContent === "q")).backgroundColor; });
  probe(tag, "pointer (laser) over a key highlights it", hover);
  const c0 = await page.evaluate(() => { const c = document.querySelector("#imeDock .cand:not(.nav)"); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: c.textContent }; });
  await page.mouse.click(c0.x, c0.y); await wait(300);
  probe(tag, "point-and-click typing: z h e + click 1st candidate → the word is in the paper, focus kept", await page.evaluate((t) => document.getElementById("editor").value === t && document.activeElement?.id === "editor", c0.t), await page.inputValue("#editor"));
  await page.screenshot({ path: `tmp/ui-kb/${tag}-keyboard.png` });
  await page.keyboard.type("ni"); await wait(300);
  probe(tag, "a real key press → soft keyboard steps aside, candidates float PC-style", await page.evaluate(() => document.getElementById("imeDock").classList.contains("hidden") && !document.getElementById("candidateBar").classList.contains("hidden")));
  await ctx.close();
}
// ── 桌面实体键盘：输入法吃掉的键别人不再当命令（sheet / 章节名框的 Enter、Esc）──
{
  const tag = "desktop-1280x800";
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${tag}] console.error: ${m.text()}`); });
  const wait = (ms) => page.waitForTimeout(ms);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__xhw && window.__xhw.editor.canEdit(), null, { timeout: 20000 });
  await wait(1500);
  await page.click("#editor"); await page.keyboard.type("ni"); await wait(300); await page.keyboard.press("Space"); await wait(300);
  probe(tag, "desktop: no soft keyboard, no keyboard button; typing ni + space gives 你", await page.evaluate(() => document.getElementById("imeDock").classList.contains("hidden") && document.getElementById("kbToggle").hidden && document.getElementById("editor").value === "你"), await page.inputValue("#editor"));
  await wait(600);
  await page.click("#docNameButton"); await wait(500);
  await page.keyboard.press("Control+a"); await page.keyboard.type("shu"); await wait(300);
  await page.keyboard.press("Escape"); await wait(300);
  probe(tag, "Esc while composing in the sheet input cancels the pinyin only; the sheet stays open", await page.evaluate(() => !document.getElementById("sheet").classList.contains("hidden") && document.getElementById("candidateBar").classList.contains("hidden")));
  await page.keyboard.type("shu"); await wait(300); await page.keyboard.press("Enter"); await wait(400);
  const v = await page.inputValue("#sheetInput");
  probe(tag, "Enter while composing commits the first candidate into the input (no newline, no space) and does NOT confirm the sheet", await page.evaluate(() => !document.getElementById("sheet").classList.contains("hidden")) && /^[\u4e00-\u9fff]+$/.test(v), JSON.stringify(v));
  await page.keyboard.press("Enter"); await wait(900);
  probe(tag, "second Enter (not composing) confirms: file renamed", await page.evaluate((v) => document.getElementById("sheet").classList.contains("hidden") && document.getElementById("docNameButton").textContent === v, v), await page.evaluate(() => document.getElementById("docNameButton").textContent));

  // 光标跟随（v2.1.33，user 2026-09-30「打字的时候为什么页面会往下滚」）：纸末尾连按回车，每次 scrollTop 的增量必须 == 一行（以前多滚一行 = 2 × lh）
  {
    await page.evaluate(() => { const e = document.getElementById("editor"); e.focus(); e.value = Array.from({ length: 30 }, (_, i) => `第 ${i + 1} 行`).join("\n"); e.dispatchEvent(new Event("input", { bubbles: true })); e.setSelectionRange(e.value.length, e.value.length); });
    await wait(500); await page.keyboard.press("Enter"); await wait(300);   // 先让光标贴到底边
    const lh = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".page")).getPropertyValue("--editor-lh")));
    const deltas = [];
    for (let i = 0; i < 4; i++) { const before = await page.evaluate(() => document.querySelector("main.surface").scrollTop); await page.keyboard.press("Enter"); await wait(300); deltas.push(Math.round((await page.evaluate(() => document.querySelector("main.surface").scrollTop)) - before)); }
    probe(tag, "typing at the paper's end: each newline scrolls exactly one line (delta == lh), never two", deltas.every((d) => Math.abs(d - lh) <= 1), `lh=${lh} deltas=${deltas.join(",")}`);
  }
  await ctx.close();
}
await browser.close(); srv.close();
if (errors.length) { console.log("page errors:\n" + errors.join("\n")); fails += errors.length; } else console.log("no page errors");
console.log(fails ? `${fails} FAILED` : "all probes ok");
process.exit(fails ? 1 : 0);
