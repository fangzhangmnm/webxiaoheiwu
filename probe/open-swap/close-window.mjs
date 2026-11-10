// Fable 审稿探针（审 v3.0.19，2026-11-10，Claude Fable 5.2）：书开着（有没存的字）时，「去文本稿」还在关旧书的那一下里，又来一次「开另一本书」。
//   用法：在被测的仓目录里 node probe/open-swap/close-window.mjs [G1|G1b|G1c]
//   看的是不变量丁：落定之后「书开着 ⇒ 文本稿编辑器放下了」。再看后果：敲字、进书库之后，文本稿的原文还在不在。
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
const ORIG_A = "AAAA 文本稿原文。";
const localText = (D, n) => D.eval((x) => window.__xhw.store().file(x, { mode: "existing" }).open().then((b) => (b ? b.text() : null)), n);
const localBook = async (D, n) => { const b64 = await D.eval(async (x) => { const b = await window.__xhw.store().file(x, { mode: "existing" }).open(); if (!b) return null; const u = new Uint8Array(await b.arrayBuffer()); let s = ""; for (const c of u) s += String.fromCharCode(c); return btoa(s); }, n); return b64 ? bookPages(Buffer.from(b64, "base64")) : {}; };
const snap = (D) => D.eval(() => ({ name: window.__xhw.editor.state.name, pending: window.__xhw.editor.state.pendingDate, parked: window.__xhw.editor.isParked(), projActive: window.__xhw.project.active(), projName: window.__xhw.project.name(), bookUi: document.body.dataset.project === "1", ro: document.getElementById("editor").readOnly, val: document.getElementById("editor").value }));
async function liftBook(A, text) {
  await A.eval(() => window.__xhw.newDraft({})); await A.wait(300);
  await A.type(text); await A.wait(500);
  void A.eval(() => window.__xhw.liftDraft());
  await A.page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 8000 });
  await A.page.click("#sheetConfirm");
  await A.page.waitForFunction(() => window.__xhw.project.active(), null, { timeout: 8000 }); await A.wait(500);
  await A.eval(() => window.__xhw.setSidebar(false));
  await A.pushNow(); await A.wait(600);
  return { book: await A.eval(() => window.__xhw.project.name()), page: await A.eval(() => window.__xhw.project.current()) };
}
/** 一篇文本稿 + 两本一页的书，都推上网盘；最后停在第二本书上。 */
async function seed(w, A) {
  await A.boot(server.url); await A.type(ORIG_A); await A.wait(500); await A.pushNow(); await A.wait(300);
  const a = await A.eval(() => window.__xhw.editor.state.name);
  const b1 = await liftBook(A, "第一本书的一页。");
  const b2 = await liftBook(A, "第二本书的一页。");
  if ((await w.cloudText(a)) !== ORIG_A) throw new Error("seed: txt not on cloud");
  return { a, b1, b2 };
}
async function settle(A, label) {
  await A.wait(1500);
  const s = await snap(A);
  console.log("  落定后 " + label + ":", JSON.stringify(s));
  return s;
}
async function aftermath(w, A, a, b1, s) {
  check("丁：书开着 ⇒ 文本稿编辑器放下了（不是两边都管着编辑框）", !(s.projActive && !s.parked), JSON.stringify({ projActive: s.projActive, parked: s.parked, editorName: s.name, projName: s.projName, bookUi: s.bookUi }));
  check("有一边接管了（不是两边都没接）", s.projActive || (!s.parked && (s.name !== null || s.pending !== null)), JSON.stringify(s));
  // 后果：敲一个字，再进书库（先关书、再让文本稿编辑器放下）
  await A.type("x"); await A.wait(800);
  await A.page.click("#libraryButton").catch(() => {}); await A.wait(1500);
  const lt = await localText(A, a);
  check("本机：文本稿还是它自己的字（原文，或原文加刚敲的那个 x）", lt === ORIG_A || (lt ?? "").replace("x", "") === ORIG_A, JSON.stringify(lt));
  const lb = await localBook(A, b1.book);
  check("本机：第一本书那一页没被换成别的", lb[b1.page] === "第一本书的一页。" || lb[b1.page] === "第一本书的一页。x" || lb[b1.page] === "x第一本书的一页。", JSON.stringify(lb));
  const errs = await A.eval(() => (window.__xhwErrors ?? []).slice(-6)).catch(() => []);
  if (errs.length) console.log("  报错:", JSON.stringify(errs));
}
const scenarios = [];
scenarios.push({ name: "G1 书开着（刚敲了字）→ 同一下里先「开文本稿」、再「开另一本书」", fn: async (w) => {
  const A = await w.device("A");
  const { a, b1, b2 } = await seed(w, A);
  await A.type("脏");   // 第二本书有没存的字：关它要真写一次盘
  const r = await A.eval(async ([txt, book]) => {
    const t = window.__xhw.openAny(txt).then((x) => "ret:" + x, (e) => "threw:" + String(e?.message ?? e));
    const b = window.__xhw.openAny(book).then((x) => "ret:" + x, (e) => "threw:" + String(e?.message ?? e));
    return { t: await t, b: await b };
  }, [a, b1.book]);
  console.log("  两次换稿的返回:", JSON.stringify(r));
  const s = await settle(A, "");
  await aftermath(w, A, a, b1, s);
  const lb2 = await localBook(A, b2.book);
  check("本机：第二本书刚敲的字存上了", /脏/.test(lb2[b2.page] ?? ""), JSON.stringify(lb2));
  await A.close();
} });
scenarios.push({ name: "G1b 书开着（刚敲了字）→ 先「新建稿」、关书的那一下里再「开另一本书」", fn: async (w) => {
  const A = await w.device("A");
  const { a, b1 } = await seed(w, A);
  await A.type("脏");
  const r = await A.eval(async ([book]) => {
    const t = window.__xhw.newDraft({}).then((x) => "ret:" + x, (e) => "threw:" + String(e?.message ?? e));
    const b = window.__xhw.openAny(book).then((x) => "ret:" + x, (e) => "threw:" + String(e?.message ?? e));
    return { t: await t, b: await b };
  }, [b1.book]);
  console.log("  两次换稿的返回:", JSON.stringify(r));
  const s = await settle(A, "");
  await aftermath(w, A, a, b1, s);
  await A.close();
} });
scenarios.push({ name: "G1c 反过来：书开着（刚敲了字）→ 先「开另一本书」、再「开文本稿」（后来的文本稿该赢）", fn: async (w) => {
  const A = await w.device("A");
  const { a, b1 } = await seed(w, A);
  await A.type("脏");
  const r = await A.eval(async ([txt, book]) => {
    const b = window.__xhw.openAny(book).then((x) => "ret:" + x, (e) => "threw:" + String(e?.message ?? e));
    const t = window.__xhw.openAny(txt).then((x) => "ret:" + x, (e) => "threw:" + String(e?.message ?? e));
    return { t: await t, b: await b };
  }, [a, b1.book]);
  console.log("  两次换稿的返回:", JSON.stringify(r));
  const s = await settle(A, "");
  check("后来的那次赢：开着的是文本稿", !s.projActive && !s.parked && s.name === a && s.val === ORIG_A, JSON.stringify(s));
  await aftermath(w, A, a, b1, s);
  await A.close();
} });
for (const s of scenarios) {
  if (only && !s.name.startsWith(only + " ")) continue;
  console.log("\n── " + s.name);
  const w = await createWorld();
  try { await Promise.race([s.fn(w), new Promise((_, rej) => setTimeout(() => rej(new Error("timed out (90s)")), 90000))]); }
  catch (e) { check("场景跑完", false, String(e?.message ?? e)); }
  finally { await w.close().catch(() => {}); }
}
server.close();
console.log("\n" + (failed() ? "✗ " : "✓ ") + failed() + " failed");
process.exit(0);
