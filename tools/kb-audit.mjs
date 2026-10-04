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
  await page.waitForFunction(() => !!window.__xhw && window.__xhw.editor.canEdit(), null, { timeout: 20000 }); await page.evaluate(() => window.__xhw.fontReady);
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
  // 页面外延底色（v2.3.33，Edge iPad「最下面还是空一点」= WebKit 用根背景色填底部安全区那一截）：键盘露着时根背景 = 键盘底色，那一截像键盘自己的底边
  probe(tag, "docked: the root (html) background equals the keyboard's own background (Edge's bottom safe-area strip continues the keyboard)", await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor === getComputedStyle(document.getElementById("imeDock")).backgroundColor), await page.evaluate(() => `${getComputedStyle(document.documentElement).backgroundColor} vs ${getComputedStyle(document.getElementById("imeDock")).backgroundColor}`));
  await shot("01-keyboard");
  // 键位几何照 iOS（v2.1.33，user「ios 的键位会宽一点，然后 s 和 z 对齐的」）：所有字母键等宽；z 的左边 == s 的左边；第二排两端各空半键
  // v2.3.29（user 2026-10-04 键位对齐肌肉记忆 + iPad mini / iPhone SE2 截图；「数字收到符号里面省空间吧」）：
  //   手机 = iPhone：回车在最右下角、宽 2.5 格；空格 3 格；字母层没有「收起」（在符号层话筒那格）。
  //   平板 = iPad：没有数字行（4 排）；⌫ 在第一排最右、回车在第二排最右、「收起」在最右下角；第二排缩进半个键宽；z 在 w 下面（左 ⇧ 一个键宽）；有 ← →。
  {
    const g = await page.evaluate(() => {
      const kb = document.querySelector("#imeDock .ime-keys"), all = [...kb.querySelectorAll(".ime-key")];
      const keys = all.filter((k) => /^[a-z]$/.test(k.textContent.trim()));
      const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, w: r.width }; };
      const rect = (ch) => R(keys.find((k) => k.textContent.trim() === ch));
      const aria = (a) => all.find((k) => k.getAttribute("aria-label") === a);
      const icon = (id) => all.some((k) => k.querySelector("use")?.getAttribute("href") === "#" + id);
      const widths = keys.map((k) => Math.round(k.getBoundingClientRect().width * 10) / 10);
      const rows = [...kb.querySelectorAll(".ime-row")], rowR = R(rows[0]);
      const q = rect("q"), w = rect("w"), a = rect("a"), s = rect("s"), z = rect("z"), key = q.w, gap = w.l - q.r;
      const bk = aria("退格（按住连删）"), en = aria("换行 / 确定"), hide = aria("收起键盘"), last = R(all.at(-1)), space = all.find((k) => k.classList.contains("space"));
      return { form: kb.dataset.form, nRows: rows.length, minW: Math.min(...widths), maxW: Math.max(...widths), zLeft: z.l, sLeft: s.l, wLeft: w.l, row2Offset: a.l - q.l, key, gap, pitch: key + gap, rowRight: rowR.r,
        bk: bk && R(bk), en: en && R(en), qTop: q.t, aTop: a.t, hide: hide && R(hide), lastIsEnter: all.at(-1) === en, lastIsHide: all.at(-1) === hide, last, space: space && R(space), arrows: icon("chevron-left") && icon("chevron-right"),
        mic: !!aria("语音输入"), commaOnLetters: all.some((k) => k.textContent === "，" || k.textContent === "。"),
        stripHide: (() => { const b = document.querySelector("#imeDock .ime-strip-hide"); return !!b && !b.hidden && b.getBoundingClientRect().width > 0; })(), floatingMic: !document.getElementById("micButton").hidden };
    });
    const near = (x, y, tol = 1) => Math.abs(x - y) <= tol;
    if (g.form === "phone") {
      probe(tag, "phone (iPhone): letter keys all the same width; z aligned under s; asdf row inset by half a key", g.maxW - g.minW <= 1 && near(g.zLeft, g.sLeft) && near(g.row2Offset, (g.key + g.gap) / 2), JSON.stringify(g));
      probe(tag, "phone (iPhone, v2.3.31): bottom row = 123 · 中英 · 话筒 · 空格(4 slots) · 回车(2.5 slots, bottom-right); no ，。 and no hide key on the letters layer", g.lastIsEnter && near(g.last.r, g.rowRight) && near(g.en.w, 2.5 * g.pitch - g.gap, 1.5) && near(g.space.w, 4 * g.pitch - g.gap, 1.5) && !g.hide && g.mic && !g.commaOnLetters, JSON.stringify(g));
      probe(tag, "phone: hide key sits at the right end of the candidate strip (iPhone ⌄); the floating mic on the paper steps aside while the keyboard (with its mic key) is up", g.stripHide && !g.floatingMic, JSON.stringify({ stripHide: g.stripHide, floatingMic: g.floatingMic }));
    } else {
      probe(tag, "tablet (iPad): 4 rows (no number row); letter keys same width; asdf inset by half a key; z under w", g.nRows === 4 && g.maxW - g.minW <= 1 && near(g.row2Offset, g.key / 2) && near(g.zLeft, g.wLeft), JSON.stringify(g));
      probe(tag, "tablet (iPad): backspace at the end of the q row, return at the end of the a row, hide key bottom-right, ← → present; no hide in the strip, floating mic stays on the paper", !!g.bk && near(g.bk.t, g.qTop) && near(g.bk.r, g.rowRight) && !!g.en && near(g.en.t, g.aTop) && near(g.en.r, g.rowRight) && g.lastIsHide && near(g.last.r, g.rowRight) && g.arrows && !g.stripHide && g.floatingMic, JSON.stringify(g));
    }
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
  const phoneForm = await page.evaluate(() => document.querySelector("#imeDock .ime-keys").dataset.form === "phone");
  await tapKeys("ni"); await tapKey("空格"); if (phoneForm) await tapKey("123"); await tapKey("。"); await wait(300);   // 手机的 。在 123 层（v2.3.31 iPhone 原样），点完自动回字母层
  const a3 = await ed();
  probe(tag, "ni + space + 。 → 你。 in that order", a3.v.slice(s0, s0 + 2) === "你。" && a3.s === s0 + 2, a3.v.slice(s0 - 2, s0 + 4));
  await tapKeys("woxiangquchifanranhou"); await wait(400);
  const long = await page.evaluate(() => { const c = document.querySelector("#imeDock .cand:not(.nav)"); const r = c?.getBoundingClientRect(); const strip = document.querySelector("#imeDock .ime-strip").getBoundingClientRect(); return { first: r ? { l: r.left, r: r.right, t: c.textContent } : null, stripLeft: strip.left, stripH: strip.height, smallPinyin: (() => { const p = document.querySelector("#imeDock .ime-preedit-small"); if (!p) return false; const cs = getComputedStyle(p); return p.textContent.length > 0 && parseFloat(cs.fontSize) <= (document.querySelector("#imeDock .ime-keys").dataset.form === "tablet" ? 12 : 11) && cs.position === "absolute"; })(), noHideInStrip: true, hideKey: document.querySelector("#imeDock .ime-keys").dataset.form === "phone" ? !document.querySelector("#imeDock .ime-strip-hide").hidden : !!document.querySelector("#imeDock .ime-key.hide") }; });   // 手机的「收起」在候选条右端（v2.3.31，照 iPhone），平板在键盘最右下
  probe(tag, "long pinyin: 1st candidate still starts at the strip's left edge and is fully on screen; pinyin shown as a small (≤11px) overlay that costs no width or height (v2.1.33, user「拼音还是用比较小的字体显示一下吧」); no hide column, strip ≤ 40px; hide key lives in the bottom row", !!long.first && long.first.l >= 0 && long.first.l - long.stripLeft < 12 && long.first.r <= w && long.smallPinyin && long.noHideInStrip && long.hideKey && long.stripH <= (phoneForm ? 40 : 60), JSON.stringify(long));   // 平板的候选条照 iPad 系统键盘 57（v2.3.32，user「候选字也太矮了？量一下截图」）；手机仍 ≤ 40
  await shot("03-long-pinyin");
  // 候选字号跟字号档（v2.3.20，user「候选条跟会有什么坏处吗」「好，那么做」）：现值 × 档（调小不缩、封顶 1.5）；条长高多少，键盘那一块就长高多少，纸面跟着让
  { const m = () => page.evaluate(() => { const c = document.querySelector("#imeDock .cand:not(.nav)"), dock = document.getElementById("imeDock"), small = document.querySelector("#imeDock .ime-preedit-small"), key = document.querySelector("#imeDock .ime-key"); return { cand: c ? parseFloat(getComputedStyle(c).fontSize) : null, strip: document.querySelector("#imeDock .ime-cands").getBoundingClientRect().height, dock: dock.getBoundingClientRect().height, dockTop: dock.getBoundingClientRect().top, dockVar: parseFloat(document.documentElement.style.getPropertyValue("--dock-h")), visBottom: innerHeight - parseFloat(getComputedStyle(document.querySelector("main.surface")).paddingBottom), small: small ? parseFloat(getComputedStyle(small).fontSize) : null, key: key.getBoundingClientRect().height, first: c ? c.getBoundingClientRect().right <= innerWidth : false }; });
    const setScale = async (v) => { await page.evaluate((v) => { const s = document.getElementById("fontScaleSelect"); s.value = v; s.dispatchEvent(new Event("change")); }, v); await wait(300); };
    const cur = await page.evaluate(() => document.getElementById("fontScaleSelect").value);
    await setScale("1"); const a = await m(); await setScale("1.5"); const b = await m(); await setScale("0.85"); const c = await m(); await setScale(cur);
    probe(tag, "candidate size follows the text-size setting: ×1.5 → candidates ×1.5 (19 → 28.5px; 17 → 25.5 on short screens), strip +8.5px, dock grows by the same amount and --dock-h follows, the visible paper still ends above the keyboard, keys unchanged; ×0.85 → same as standard (never shrinks)",
      (phoneForm ? (a.cand === 19 || a.cand === 17) : a.cand === 27) && Math.abs(b.cand - a.cand * 1.5) < 0.1 && Math.abs((b.strip - a.strip) - 8.5) < 0.6 && Math.abs((b.dock - a.dock) - (b.strip - a.strip)) < 0.6 && Math.abs(b.dockVar - Math.round(b.dock)) < 0.6 && b.visBottom <= b.dockTop + 1 && Math.abs(b.key - a.key) < 0.1 && Math.abs(b.small - (phoneForm ? 15 : 18)) < 0.1 && b.first && Math.abs(c.cand - a.cand) < 0.1 && Math.abs(c.strip - a.strip) < 0.1, JSON.stringify({ a, b, c })); }   // 平板的候选字 27px、拼音小字 12px（v2.3.32 照 iPad 系统键盘量的）
  await tapKey("空格"); await wait(300);

  // ③¾ 两条道（v2.3.32，user「我要的是app不拖垮键盘」→「分两条道」）：上屏那一下，键盘先画（候选条清空 = 键盘道）、app 对改字的反应后跑（正文 input 的监听者 = app 道）——
  //   给正文挂一个故意慢 120 ms 的 input 监听者，键盘那一下也不排在它后面。改之前的顺序正好相反（改字在键盘道里同步做、input 监听者先跑完键盘才画）。
  { await page.evaluate(() => { window.__laneLog = []; window.__slowApp = () => { window.__laneLog.push(["app", performance.now()]); const t = performance.now(); while (performance.now() - t < 120) { /* busy */ } }; document.getElementById("editor").addEventListener("input", window.__slowApp); window.__laneMo = new MutationObserver(() => window.__laneLog.push(["kb", performance.now()])); window.__laneMo.observe(document.querySelector("#imeDock .ime-cands"), { childList: true }); });
    const sL = (await ed()).s;
    await tapKeys("ni"); await wait(250); await page.evaluate(() => { window.__laneLog = []; });
    await tapKey("空格"); await wait(500);
    const log = await page.evaluate(() => { document.getElementById("editor").removeEventListener("input", window.__slowApp); window.__laneMo.disconnect(); return window.__laneLog; });
    const kb = log.find(([k]) => k === "kb"), app = log.find(([k]) => k === "app");
    probe(tag, "two lanes: on commit the keyboard redraws first (candidates cleared), the app's (deliberately slow, 120 ms) input listeners run after it; the word still lands at the caret", !!kb && !!app && kb[1] < app[1] && (await ed()).v.slice(sL, sL + 1) === "你", JSON.stringify({ log, around: (await ed()).v.slice(sL - 2, sL + 3) }));
  }

  // ③⅞ 回车 / 大写（v2.3.33，user 2026-10-04「那么和ios对齐，嗯和你建议一样」「空格收尾留空格，因为不想留的话可以用回车」）：
  //   组字中回车 = 原样上屏不换行（键帽写「确认」）；上档一次 = 临时英文（后面的字母原样接着），空格收尾带一个空格、回车收尾不带
  { const s5 = (await ed()).s;
    await tapKeys("ni"); await wait(250);
    const lab = await page.evaluate(() => [...document.querySelectorAll("#imeDock .ime-key.accent")].map((k) => k.textContent.trim()));
    await tapKey("换行 / 确定"); await wait(300);
    const a = await ed();
    probe(tag, "composing: the return key reads 确认; tapping it puts the letters in as typed (ni) — no candidate, no newline", lab.includes("确认") && a.v.slice(s5, s5 + 2) === "ni" && a.s === s5 + 2 && (await page.evaluate(() => [...document.querySelectorAll("#imeDock .ime-key.accent")].every((k) => k.textContent.trim() !== "确认"))), JSON.stringify({ lab, around: a.v.slice(s5, s5 + 4), s: a.s - s5 }));
    const s6 = (await ed()).s;
    await tapKeys("wo"); await wait(200); await tapKey("上档"); await tapKey("A"); await tapKey("上档"); await tapKey("I"); await wait(250);
    const mid = await page.evaluate(() => ({ buf: window.__xhw.ime.getState().buffer, chip: [...document.querySelectorAll("#imeDock .cand")].map((c) => c.textContent) }));
    await tapKey("空格"); await wait(300);
    const b = await ed();
    probe(tag, "wo + ⇧A ⇧I: 我 goes in, AI is a temporary English run (one raw chip); space ends it WITH a space → 我AI␠", b.v.slice(s6, s6 + 4) === "我AI " && b.s === s6 + 4 && mid.buf === "AI" && JSON.stringify(mid.chip) === JSON.stringify(["AI"]), JSON.stringify({ around: b.v.slice(s6, s6 + 6), mid }));
    const s7 = (await ed()).s;
    await tapKey("上档"); await tapKey("O"); await tapKey("k"); await tapKey("换行 / 确定"); await wait(300);
    const c = await ed();
    probe(tag, "⇧O k + return: Ok goes in with no space and no newline", c.v.slice(s7, s7 + 2) === "Ok" && c.s === s7 + 2, JSON.stringify({ around: c.v.slice(s7, s7 + 4) }));
  }

  // ③½ 拼不成字的拼音不再隐形（v2.3.29，user 2026-10-04「输入了不出字的拼音，会静默不显示拼音，但是得按退格才能消掉这些隐形的输入」）：
  //   RIME 把拼不成音节的字母放在 tail、选了半截的字放在 head，以前只画 body。现在拼音小字 = 全文；没有候选时候选行给一枚「原样上屏」芯片。
  {
    const pre = () => page.evaluate(() => ({ small: document.querySelector("#imeDock .ime-preedit-small").textContent, cands: [...document.querySelectorAll("#imeDock .cand")].map((c) => ({ t: c.textContent, raw: c.dataset.raw != null })), buffer: window.__xhw.ime.getState().buffer }));
    const s2 = (await ed()).s;
    await tapKeys("niv"); await wait(300);
    const p1 = await pre();
    probe(tag, "ni + v (no syllable): the stray v is shown in the pinyin (ni v), candidates still there", /^ni\s?v$/.test(p1.small) && p1.cands.length >= 3 && !p1.cands[0].raw, JSON.stringify(p1));
    await tapCand(0);
    const p2 = await pre();
    probe(tag, "pick 你 with the stray v left over: pinyin shows 你v, the strip offers one raw chip 你v (nothing silent)", p2.small === "你v" && p2.cands.length === 1 && p2.cands[0].raw && p2.cands[0].t === "你v", JSON.stringify(p2));
    await tapCand(0);
    const a35 = await ed(), p3 = await pre();
    probe(tag, "tap the raw chip → 你v lands at the caret, composition over (no invisible leftovers)", a35.v.slice(s2, s2 + 2) === "你v" && a35.s === s2 + 2 && p3.buffer === "" && p3.small === "", JSON.stringify({ around: a35.v.slice(s2 - 2, s2 + 4), p3 }));
    await tapKeys("ii"); await wait(300);
    const p4 = await pre();
    probe(tag, "ii (no candidates at all): pinyin shown and a raw chip ii in the strip", p4.small === "ii" && p4.cands.length === 1 && p4.cands[0].raw && p4.cands[0].t === "ii", JSON.stringify(p4));
    await tapKey("退格（按住连删）"); await tapKey("退格（按住连删）"); await wait(200);
    probe(tag, "backspace twice clears the visible ii (and nothing else)", (await pre()).buffer === "" && (await ed()).v.slice(s2, s2 + 2) === "你v" && (await ed()).s === s2 + 2, JSON.stringify({ p: await pre(), around: (await ed()).v.slice(s2 - 2, s2 + 4) }));
    if (await page.evaluate(() => document.querySelector("#imeDock .ime-keys").dataset.form === "tablet")) {
      const s3 = (await ed()).s;
      await tapKey("，"); await tapKey("上档"); await tapKey("。"); await wait(200);
      probe(tag, "tablet (iPad) ，/。 keys: tap = ，  shift + tap = ？ (the small one on top)", (await ed()).v.slice(s3, s3 + 2) === "，？", (await ed()).v.slice(s3, s3 + 3));
    }
  }

  // ④ 符号层 / 上档 / 退格 / 回车
  const s1 = (await ed()).s;
  await tapKey("123"); await wait(100); await shot("04-symbols");
  // 中文符号层按 user 小说里的频率排、全角；引号四格跟设置的引号风格（v2.3.31）
  { const rowsOf = () => page.evaluate(() => [...document.querySelectorAll("#imeDock .ime-keys .ime-row")].map((r) => [...r.querySelectorAll(".ime-key")].map((k) => k.getAttribute("aria-label") ?? k.textContent)));
    const r = await rowsOf(), tablet = !phoneForm;
    const row2 = r[1].filter((x) => x !== "换行 / 确定");
    probe(tag, "123 layer (zh, curly quotes): digits row, then “ ” ‘ ’ —— …… ： 、 first (frequency order, full-width)" + (tablet ? "" : "; ， 。 ？ ！ in row 3"), r[0].slice(0, 10).join("") === "1234567890" && JSON.stringify(row2.slice(0, 8)) === JSON.stringify(["“", "”", "‘", "’", "——", "……", "：", "、"]) && (tablet || JSON.stringify(r[2].slice(1, 5)) === JSON.stringify(["，", "。", "？", "！"])), JSON.stringify(r));
    await page.evaluate(() => { const s = document.getElementById("quoteStyleSelect"); s.value = "corner"; s.dispatchEvent(new Event("change")); }); await wait(150);
    const rc = await rowsOf();
    await tapKey("#+="); await wait(100); const r2c = await rowsOf(); await tapKey("123"); await wait(100);
    probe(tag, "corner quote style: the four quote keys become 「 」 『 』 (together); the curly set moves to the first row of #+= together", JSON.stringify(rc[1].slice(0, 4)) === JSON.stringify(["「", "」", "『", "』"]) && JSON.stringify(r2c[0].slice(0, 4)) === JSON.stringify(["“", "”", "‘", "’"]), JSON.stringify({ rc: rc[1], r2c: r2c[0] }));
    await page.evaluate(() => { const s = document.getElementById("quoteStyleSelect"); s.value = "curly"; s.dispatchEvent(new Event("change")); }); await wait(150); }
  await tapKeys("12"); await wait(100);
  probe(tag, "digits keep the 123 layer (numbers come in runs)", await page.evaluate(() => document.querySelector("#imeDock .ime-keys").dataset.layer === "sym1"));
  await tapKey("？"); await wait(150);
  probe(tag, "a punctuation key returns to the letters layer by itself (v2.3.31, user chose「标点后自动回」)", await page.evaluate(() => document.querySelector("#imeDock .ime-keys").dataset.layer === "letters"));
  await tapKey("上档"); await tapKey("A"); await tapKey("b"); await wait(200);
  const a4 = await ed();
  probe(tag, "123 layer digits + ？, back to letters; shift-once A then b = temporary English run Ab (v2.3.33), nothing in the paper yet", a4.v.slice(s1, s1 + 3) === "12？" && a4.s === s1 + 3 && (await page.evaluate(() => window.__xhw.ime.getState().buffer)) === "Ab", JSON.stringify({ around: a4.v.slice(s1, s1 + 5), buf: await page.evaluate(() => window.__xhw.ime.getState().buffer) }));
  await tapKey("退格（按住连删）"); await wait(150);   // 删掉临时英文的 b
  await tapKey("退格（按住连删）"); await wait(150);   // 删掉 A → 临时英文退出
  const a5 = await ed();
  probe(tag, "backspace eats the temporary English run letter by letter, the paper is untouched", a5.v.slice(s1, s1 + 3) === "12？" && a5.s === s1 + 3 && (await page.evaluate(() => window.__xhw.ime.getState().buffer)) === "", a5.v.slice(s1, s1 + 5));
  await tapKey("换行 / 确定"); await wait(150);
  probe(tag, "enter inserts a newline in the paper", (await ed()).v.slice(s1 + 3, s1 + 4) === "\n");
  await page.keyboard.press("Control+z").catch(() => {});   // 实体键：顺带验「实体键盘让位」在 ⑥

  // ⑤ 收起键盘 → 键盘钮在；点键盘钮 → 回来（手机的「收起」在候选条右端，v2.3.31）
  const isPhone = await page.evaluate(() => document.querySelector("#imeDock .ime-keys").dataset.form === "phone");
  if (!isPhone) await tapKey("收起键盘");   // 键盘此刻已被上面的实体键让位收掉（这一下点在藏起来的键上）；手机字母层没有「收起」，在下面召回后单独验
  await wait(400);
  probe(tag, "real key press (Ctrl+Z) made the soft keyboard step aside; hide button keeps it hidden; paper gets its height back", (await rectOf("#imeDock"))?.shown !== true && (await rectOf(".page")).b > h - 40, JSON.stringify(await rectOf(".page")));
  const tg = await rectOf("#kbToggle");
  probe(tag, "keyboard button shows at the paper's bottom-left while the keyboard is hidden", !!tg?.shown && tg.l < w / 2, JSON.stringify(tg));
  probe(tag, "keyboard hidden: the root background is back to the page color (--bg-0)", await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor !== getComputedStyle(document.getElementById("imeDock")).backgroundColor));
  await shot("05-hidden");
  await page.touchscreen.tap(tg.l + tg.w / 2, tg.t + tg.h / 2); await wait(400);
  probe(tag, "tap the keyboard button → keyboard back, focus in the paper", (await rectOf("#imeDock"))?.shown === true && (await ed()).active === "editor");
  if (isPhone) {   // v2.3.31：手机的「收起」= 候选条右端那枚 ⌄（照 iPhone）
    const sh = await rectOf("#imeDock .ime-strip-hide");
    await page.touchscreen.tap(sh.l + sh.w / 2, sh.t + sh.h / 2); await wait(400);
    probe(tag, "phone: the ⌄ at the strip's right end hides the keyboard, paper gets its height back, floating mic back on the paper", (await rectOf("#imeDock"))?.shown !== true && (await rectOf(".page")).b > h - 40 && await page.evaluate(() => !document.getElementById("micButton").hidden));
    const e2 = await rectOf("#editor"); await page.touchscreen.tap(e2.l + e2.w / 2, Math.min(e2.b - 10, h / 2)); await wait(400);
    probe(tag, "phone: tap the paper again → keyboard back on the letters layer", (await rectOf("#imeDock"))?.shown === true && await page.evaluate(() => document.querySelector("#imeDock .ime-keys").dataset.layer === "letters"));
  }

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
  // ⑧ 手机键盘的话筒键（v2.3.31「语音也收进来」）：点了 = 纸面话筒钮同一个动作；无头没有语音包 → 弹下载确认（取消即可，什么都不下）
  if (isPhone) {
    if (await page.evaluate(() => !document.getElementById("sheet").classList.contains("hidden"))) { await page.click("#sheetCancel").catch(() => {}); await wait(300); }
    const e3 = await rectOf("#editor"); await page.touchscreen.tap(e3.l + e3.w / 2, Math.min(e3.b - 10, h / 2)); await wait(400);
    await tapKey("语音输入"); await wait(800);
    probe(tag, "phone: the mic key in the keyboard does what the paper mic does (no pack here → the download sheet asks first)", await page.evaluate(() => !document.getElementById("sheet").classList.contains("hidden") && /语音识别模型/.test(document.getElementById("sheet").textContent ?? "")), await page.evaluate(() => (document.getElementById("sheet").textContent ?? "").replace(/\s+/g, " ").slice(0, 80)));
    await page.click("#sheetCancel").catch(() => {}); await wait(300);
  }
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
  await page.waitForFunction(() => !!window.__xhw && window.__xhw.editor.canEdit(), null, { timeout: 20000 }); await page.evaluate(() => window.__xhw.fontReady);
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
  await page.waitForFunction(() => !!window.__xhw && window.__xhw.editor.canEdit(), null, { timeout: 20000 }); await page.evaluate(() => window.__xhw.fontReady);
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
  probe(tag, "Enter while composing puts the letters in as typed (shu; v2.3.33 = iOS 确认 / 微软拼音) — no newline — and does NOT confirm the sheet", await page.evaluate(() => !document.getElementById("sheet").classList.contains("hidden")) && v === "shu", JSON.stringify(v));
  await page.keyboard.press("Enter"); await wait(900);
  probe(tag, "second Enter (not composing) confirms: file renamed", await page.evaluate((v) => document.getElementById("sheet").classList.contains("hidden") && document.getElementById("docNameButton").textContent === v, v), await page.evaluate(() => document.getElementById("docNameButton").textContent));

  // 实体键盘的大写 / 回车（v2.3.33）：Shift + 字母以前被折成小写塞进拼音（大写丢了）；现在 = 临时英文，空格收尾带空格；组字中回车 = 原样
  { await page.click("#editor"); await page.evaluate(() => { const e = document.getElementById("editor"); e.focus(); e.setSelectionRange(e.value.length, e.value.length); });
    const s0 = await page.evaluate(() => document.getElementById("editor").value.length);
    await page.keyboard.type("wo"); await wait(250); await page.keyboard.press("Shift+KeyA"); await page.keyboard.press("Shift+KeyI"); await wait(150); await page.keyboard.press("Space"); await wait(300);
    await page.keyboard.type("ni"); await wait(250); await page.keyboard.press("Enter"); await wait(300);
    const t = await page.evaluate((s0) => document.getElementById("editor").value.slice(s0), s0);
    probe(tag, "hardware: wo + Shift+A Shift+I + space → 我AI␠ (uppercase kept, temporary English); ni + Enter → ni (as typed, no newline)", t === "我AI ni", JSON.stringify(t));
  }
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
