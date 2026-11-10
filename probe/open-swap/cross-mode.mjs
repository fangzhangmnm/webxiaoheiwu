// Fable 审计探针（不进仓）：文本稿和书抢同一个编辑框。用法：在被测的仓目录里 node <这个文件> [P1|P2]
const ROOT = process.cwd();
const { buildBundle, startServer, createWorld, makeChecker } = await import(ROOT + "/test/e2e-sync/harness.mjs");
const { ensureZipLoaded } = await import(ROOT + "/test/zip-node.mjs");
const only = process.argv[2] ?? "";
const { check, failed } = makeChecker();
await buildBundle();
const server = await startServer();
ensureZipLoaded();
const { unpackProject } = await import(ROOT + "/src/project/format.ts");
const bookPages = async (bytes) => { if (!bytes) return {}; const r = await unpackProject(new Blob([bytes])); if (r.kind !== "ok") throw new Error("book unreadable: " + r.kind); const o = {}; for (const [k, v] of r.project.contents) o[k] = /\.txt$/i.test(k) ? new TextDecoder().decode(v) : "<bin>"; return o; };
const ORIG_A = "AAAA 文本稿原文。", BOOK_PAGE = "书的一页原文。改。";
const localText = (D, n) => D.eval((x) => window.__xhw.store().file(x, { mode: "existing" }).open().then((b) => (b ? b.text() : null)), n);
const localBook = async (D, n) => { const b64 = await D.eval(async (x) => { const b = await window.__xhw.store().file(x, { mode: "existing" }).open(); if (!b) return null; const u = new Uint8Array(await b.arrayBuffer()); let s = ""; for (const c of u) s += String.fromCharCode(c); return btoa(s); }, n); return b64 ? bookPages(Buffer.from(b64, "base64")) : {}; };
const snap = (D) => D.eval(() => ({ name: window.__xhw.editor.state.name, parked: window.__xhw.editor.isParked(), canEdit: window.__xhw.editor.canEdit(), projActive: window.__xhw.project.active(), projName: window.__xhw.project.name(), ro: document.getElementById("editor").readOnly, val: document.getElementById("editor").value }));
/** 一篇文本稿 + 一本一页的书，都推上网盘；最后停在一张空新稿上。 */
async function seed(w, A) {
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
  const before = await bookPages(await w.cloudBytes(book));
  if (before[page] !== BOOK_PAGE) throw new Error("seed: book page not on cloud: " + JSON.stringify(before));
  if ((await w.cloudText(a)) !== ORIG_A) throw new Error("seed: txt not on cloud");
  await A.eval(() => window.__xhw.newDraft({})); await A.wait(500);   // 空新稿（没物化）
  return { a, book, page };
}
const scenarios = [];
scenarios.push({ name: "P1 文本稿读得慢 → 接着开书，书先装好 → 文本稿的字后到", fn: async (w) => {
  const A = await w.device("A");
  const { a, book, page } = await seed(w, A);
  w.gate.delayMs = 2500;
  await A.eval((n) => { window.__p1 = window.__xhw.openAny(n).then((r) => "ok:" + r, (e) => "threw:" + (e?.message ?? e)); }, a);
  await A.wait(250);
  w.gate.delayMs = 0;
  const r2 = await A.eval((n) => window.__xhw.openAny(n), book);
  await A.wait(300);
  const mid = await snap(A);
  console.log("  书装好时:", JSON.stringify(mid));
  const r1 = await A.eval(() => window.__p1); await A.wait(300);
  const end = await snap(A);
  console.log("  文本稿读完后:", r1, JSON.stringify(end));
  check("前提：书先装好（书模式开着、编辑框 = 书的那一页）", r2 === true && mid.projActive && mid.val === BOOK_PAGE, JSON.stringify(mid));
  check("文本稿读完后：书模式里的编辑框还是书的那一页", end.val === BOOK_PAGE, end.val);
  // 不敲字，只翻一下页再推：书的那一页会不会变成文本稿的字
  await A.eval(() => window.__xhw.project.flushLocal()); await A.wait(300);
  await A.pushNow(); await A.wait(800);
  const lb = await localBook(A, book), cb = await bookPages(await w.cloudBytes(book));
  check("本机：书的那一页没变", lb[page] === BOOK_PAGE, JSON.stringify(lb));
  check("网盘：书的那一页没变", cb[page] === BOOK_PAGE, JSON.stringify(cb));
  check("网盘：文本稿没变", (await w.cloudText(a)) === ORIG_A, await w.cloudText(a));
  await A.close();
} });
scenarios.push({ name: "P2 书读得慢 → 接着开文本稿，文本稿先开好 → 书后到", fn: async (w) => {
  const A = await w.device("A");
  const { a, book, page } = await seed(w, A);
  w.gate.delayMs = 2500;
  await A.eval((n) => { window.__p1 = window.__xhw.openAny(n).then((r) => "ok:" + r, (e) => "threw:" + (e?.message ?? e)); }, book);
  await A.wait(250);
  w.gate.delayMs = 0;
  const r2 = await A.eval((n) => window.__xhw.openAny(n), a);
  await A.wait(300);
  const mid = await snap(A);
  console.log("  文本稿开好时:", JSON.stringify(mid));
  const r1 = await A.eval(() => window.__p1); await A.wait(300);
  const end = await snap(A);
  console.log("  书读完后:", r1, JSON.stringify(end));
  check("前提：文本稿先开好", r2 === true && mid.name === a && mid.val === ORIG_A, JSON.stringify(mid));
  check("书读完后：两种模式没有同时管着编辑框（书开着 ⇒ 文本稿编辑器放下了）", !(end.projActive && !end.parked), JSON.stringify({ projActive: end.projActive, parked: end.parked, name: end.name }));
  await A.type("x"); await A.wait(800);
  await A.eval(() => window.__xhw.editor.pushNow()); await A.wait(800);   // 文本稿编辑器自己那个 15 秒的推送定时器到点
  check("本机：文本稿没变", (await localText(A, a)) === ORIG_A, await localText(A, a));
  check("网盘：文本稿没变", (await w.cloudText(a)) === ORIG_A, await w.cloudText(a));
  await A.close();
} });
for (const s of scenarios) {
  if (only && !s.name.includes(only)) continue;
  console.log("\n── " + s.name);
  const w = await createWorld();
  try { await Promise.race([s.fn(w), new Promise((_, rej) => setTimeout(() => rej(new Error("timed out (90s)")), 90000))]); }
  catch (e) { check("场景跑完", false, String(e?.message ?? e)); }
  finally { await w.close().catch(() => {}); }
}
server.close();
console.log("\n" + (failed() ? "✗ " : "✓ ") + failed() + " failed");
process.exit(0);
