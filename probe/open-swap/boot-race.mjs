// Fable 审计探针（不进仓）：冷启动——这台上次开的是书（读得慢），别的设备最后写的是一篇文本稿（登录后自动跳过去）。
// 用法：在被测的仓目录里 node <这个文件>
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
const snap = (D) => D.eval(() => ({ name: window.__xhw.editor.state.name, parked: window.__xhw.editor.isParked(), canEdit: window.__xhw.editor.canEdit(), projActive: window.__xhw.project.active(), projName: window.__xhw.project.name(), val: document.getElementById("editor").value }));
const localText = (D, n) => D.eval((x) => window.__xhw.store().file(x, { mode: "existing" }).open().then((b) => (b ? b.text() : null)), n);
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
  await A.eval(() => window.__xhw.store().files.dirty.pushAll()); await A.wait(800);   // 这台停在书上（上次开的 = 书）
  // 第二台：开那篇文本稿 → 「最后写的那篇」变成它
  const B = await w.device("B");
  await B.boot(server.url); await B.wait(800);
  await B.eval((n) => window.__xhw.openAny(n), a); await B.wait(600);
  await B.type("。"); await B.wait(500); await B.pushNow(); await B.wait(2500);
  const TXT = ORIG_A + "。";
  if ((await w.cloudText(a)) !== TXT) throw new Error("seed: B's edit did not reach the cloud: " + (await w.cloudText(a)));
  await B.close();
  // 只拖慢书：这台冷启动时书读 4 秒，别的照常
  const stem = book.replace(/\.webxiaoheiwu\.zip$/i, "");
  for (const op of ["getItemByPath", "download"]) {
    const orig = w.provider[op].bind(w.provider);
    w.provider[op] = async (...args) => { if (String(args[0]).includes(stem + ".webxiaoheiwu")) await new Promise((r) => setTimeout(r, 4000)); return orig(...args); };
  }
  const t0 = Date.now(); const trace = [];
  await A.page.goto(server.url, { waitUntil: "load" });
  await A.page.waitForFunction(() => !!window.__xhw, null, { timeout: 20000 });
  for (let i = 0; i < 14; i++) { const s = await snap(A); trace.push(`${((Date.now() - t0) / 1000).toFixed(1)}s name=${s.name ? "文本稿" : "-"} parked=${s.parked} 书=${s.projActive} 框=${s.val.slice(0, 6)}`); await A.wait(600); }
  console.log("  冷启动过程:\n    " + trace.join("\n    "));
  const end = await snap(A);
  console.log("  落定后:", JSON.stringify(end));
  check("落定后：没有两种模式同时管着编辑框（书开着 ⇒ 文本稿编辑器放下了）", !(end.projActive && !end.parked), JSON.stringify({ projActive: end.projActive, parked: end.parked, name: end.name }));
  check("落定后：编辑框里的字属于开着的那一份", end.projActive ? end.val === BOOK_PAGE : (end.name === a ? end.val === TXT : true), JSON.stringify(end));
  await A.page.evaluate(() => { const g = document.getElementById("gateSheet"); if (!g.classList.contains("hidden")) [...document.querySelectorAll("#gateActions button")][0]?.click(); });
  await A.type("x"); await A.wait(900);
  await A.eval(() => window.__xhw.editor.pushNow()); await A.wait(900);
  const lt = await localText(A, a), ct = await w.cloudText(a);
  check("敲一个字之后：本机文本稿里没有书的字", lt === TXT || lt === TXT + "x", lt);
  check("敲一个字之后：网盘文本稿里没有书的字", ct === TXT || ct === TXT + "x", ct);
  console.log("  页面报错:", A.errors.length ? A.errors.join(" ; ").slice(0, 400) : "无");
  await A.close();
} catch (e) { check("场景跑完", false, String(e?.stack ?? e)); }
finally { await w.close().catch(() => {}); }
server.close();
console.log("\n" + (failed() ? "✗ " : "✓ ") + failed() + " failed");
process.exit(0);
