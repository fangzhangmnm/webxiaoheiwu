// Fable 审计探针（不进仓）：第二台设备（稿还没下载过）在书库里真的连点两张卡片。用法：在被测的仓目录里 node <这个文件>
const ROOT = process.cwd();
const { buildBundle, startServer, createWorld, makeChecker } = await import(ROOT + "/test/e2e-sync/harness.mjs");
const { ensureZipLoaded } = await import(ROOT + "/test/zip-node.mjs");
const { check, failed } = makeChecker();
await buildBundle();
const server = await startServer();
ensureZipLoaded();
const { unpackProject } = await import(ROOT + "/src/project/format.ts");
const bookPages = async (bytes) => { if (!bytes) return {}; const r = await unpackProject(new Blob([bytes])); if (r.kind !== "ok") throw new Error("book unreadable: " + r.kind); const o = {}; for (const [k, v] of r.project.contents) o[k] = /\.txt$/i.test(k) ? new TextDecoder().decode(v) : "<bin>"; return o; };
const ORIG_A = "AAAA 文本稿原文。", BOOK_PAGE = "书的一页原文。改。";
const snap = (D) => D.eval(() => ({ name: window.__xhw.editor.state.name, parked: window.__xhw.editor.isParked(), projActive: window.__xhw.project.active(), projName: window.__xhw.project.name(), mode: document.body.dataset.mode ?? "", val: document.getElementById("editor").value }));
const localText = (D, n) => D.eval((x) => window.__xhw.store().file(x, { mode: "existing" }).open().then((b) => (b ? b.text() : null)), n);
const tiles = (D) => D.eval(() => [...document.querySelectorAll("#galleryMount .gallery-tile:not(.folder)")].map((el) => el.querySelector(".gallery-tile-name")?.getAttribute("title") ?? el.textContent.trim().slice(0, 40)));
const clickTile = async (D, title) => {
  const h = await D.page.evaluateHandle((n) => [...document.querySelectorAll("#galleryMount .gallery-tile:not(.folder)")].find((el) => (el.querySelector(".gallery-tile-name")?.getAttribute("title") ?? "") === n) ?? null, title);
  const el = h.asElement(); if (!el) throw new Error("tile not found: " + title);
  await el.click({ timeout: 3000 });   // 真指针事件：被别的东西盖住会抛
};
const w = await createWorld();
try {
  const A = await w.device("A");
  await A.boot(server.url); await A.type(ORIG_A); await A.wait(500); await A.pushNow(); await A.wait(300);
  const a = await A.eval(() => window.__xhw.editor.state.name);
  await A.eval(() => window.__xhw.newDraft({})); await A.wait(300);
  await A.type("书的一页原文。"); await A.wait(500);
  void A.eval(() => window.__xhw.liftDraft());
  await A.page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 8000 });
  await A.page.click("#sheetConfirm");
  await A.page.waitForFunction(() => window.__xhw.project.active(), null, { timeout: 8000 }); await A.wait(500);
  await A.eval(() => window.__xhw.setSidebar(false));
  await A.type("改。"); await A.wait(500); await A.pushNow(); await A.wait(600);
  const book = await A.eval(() => window.__xhw.project.name()), page = await A.eval(() => window.__xhw.project.current());
  await A.eval(() => window.__xhw.store().files.dirty.pushAll()); await A.wait(800);
  await A.close();
  // 第二台设备：什么都没下载过
  const B = await w.device("B");
  await B.boot(server.url); await B.wait(800);
  const boot = await snap(B);
  console.log("  第二台开机后:", JSON.stringify(boot));
  await B.page.click("#libraryButton"); await B.wait(1500);
  const names = await tiles(B);
  const stem = (n) => n.replace(/\.webxiaoheiwu\.zip$|\.txt$/i, "");
  console.log("  书库里的卡片:", JSON.stringify(names), "书:", book, "文本稿:", a);
  const order = (process.argv[2] ?? "book-first") === "txt-first" ? [a, book] : [book, a];
  const title = (n) => names.find((x) => x === n) ?? names.find((x) => x === stem(n)) ?? n;
  w.gate.delayMs = 3000;
  await clickTile(B, title(order[0]));          // 第一下：读得慢
  await B.wait(400);
  const afterFirst = await snap(B);
  const cover = await B.eval((n) => { const el = [...document.querySelectorAll("#galleryMount .gallery-tile:not(.folder)")].find((e) => (e.querySelector(".gallery-tile-name")?.getAttribute("title") ?? "") === n); if (!el) return "no tile"; const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const chain = []; for (let x = top; x && chain.length < 5; x = x.parentElement) chain.push(x.tagName.toLowerCase() + (x.id ? "#" + x.id : "") + (x.className && typeof x.className === "string" ? "." + x.className.trim().split(/\s+/).join(".") : "")); return { topChain: chain, tileHas: el.contains(top), pe: getComputedStyle(el).pointerEvents, busyText: document.querySelector(".busy:not(.hidden), #busy:not(.hidden), [class*=busy]:not(.hidden)")?.textContent?.trim().slice(0, 60) ?? null }; }, title(order[1]));
  console.log("  第二张卡片正中间最上面的元素:", JSON.stringify(cover));
  console.log("  这时的遮罩:", JSON.stringify(await B.eval(() => ({ busyHidden: document.getElementById("busyOverlay").classList.contains("hidden"), busyText: document.getElementById("busyOverlayText").textContent, gateHidden: document.getElementById("gateSheet").classList.contains("hidden"), gateTitle: document.getElementById("gateTitle").textContent, gateMsg: document.getElementById("gateMessage").textContent.slice(0, 60), gatePhase: window.__xhw.gate.phase() }))));
  w.gate.delayMs = order[1] === book ? 0 : 0;
  let second = "clicked";
  try { await clickTile(B, title(order[1])); } catch (e) { second = "blocked: " + String(e?.message ?? e).split("\n")[0]; }
  await B.wait(1200);
  const afterSecond = await snap(B);
  await B.wait(4500);
  const end = await snap(B);
  console.log("  点完第一下 0.4 秒:", JSON.stringify(afterFirst));
  console.log("  第二下:", second);
  console.log("  点完第二下 1.2 秒:", JSON.stringify(afterSecond));
  console.log("  都落定后:", JSON.stringify(end));
  check("前提：第一下还在读（书库还开着）", afterFirst.mode === "gallery" || (!afterFirst.projActive && afterFirst.name === null), JSON.stringify(afterFirst));
  check("第二下点得下去（界面没挡）", second === "clicked", second);
  check("落定后：没有两种模式同时管着编辑框", !(end.projActive && !end.parked), JSON.stringify(end));
  check("落定后：书开着时编辑框不是文本稿的字", !(end.projActive && end.val === ORIG_A), end.val);
  if (end.projActive) {
    await B.type("x"); await B.wait(900);
    await B.eval(() => window.__xhw.editor.pushNow()); await B.eval(() => window.__xhw.project.pushNow()); await B.wait(900);
    check("敲一个字之后：本机文本稿没变", (await localText(B, a)) === ORIG_A, await localText(B, a));
    check("敲一个字之后：网盘文本稿没变", (await w.cloudText(a)) === ORIG_A, await w.cloudText(a));
    const cb = await bookPages(await w.cloudBytes(book));
    check("敲一个字之后：网盘上书的那一页 = 原文 + x", cb[page] === BOOK_PAGE + "x", JSON.stringify(cb));
  }
  await B.close();
} catch (e) { check("场景跑完", false, String(e?.stack ?? e)); }
finally { await w.close().catch(() => {}); }
server.close();
console.log("\n" + (failed() ? "✗ " : "✓ ") + failed() + " failed");
process.exit(0);
