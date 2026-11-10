// Fable 审计探针（不进仓）：换稿修的几条边角。用法：在被测的仓目录里 node <这个文件> [T1|T2|T3]
const ROOT = process.cwd();
const { buildBundle, startServer, createWorld, makeChecker } = await import(ROOT + "/test/e2e-sync/harness.mjs");
const only = process.argv[2] ?? "";
const { check, failed } = makeChecker();
await buildBundle();
const server = await startServer();
const ORIG_A = "AAAA 第一篇原文。", ORIG_B = "BBBB 第二篇原文。";
const localText = (D, n) => D.eval((x) => window.__xhw.store().file(x, { mode: "existing" }).open().then((b) => (b ? b.text() : null)), n);
const ro = (D) => D.eval(() => document.getElementById("editor").readOnly);
const nameOf = (D) => D.eval(() => window.__xhw.editor.state.name);
const toast = (D) => D.eval(() => document.getElementById("toast")?.textContent ?? "");
const libraryNames = (D) => D.eval(async () => { const out = []; const s = window.__xhw.store(); await new Promise((res) => { const un = s.files.watchFolder("", (snap) => { out.length = 0; out.push(...snap.items.map((i) => i.identifier)); setTimeout(() => { un(); res(); }, 50); }); }); return out; });
async function seedTwo(w, A) {
  await A.boot(server.url); await A.type(ORIG_A); await A.wait(500); await A.pushNow(); await A.wait(300);
  const a = await nameOf(A);
  await A.eval(() => window.__xhw.newDraft({})); await A.wait(300);
  await A.type(ORIG_B); await A.wait(500); await A.pushNow(); await A.wait(300);
  const b = await nameOf(A);
  if ((await w.cloudText(a)) !== ORIG_A || (await w.cloudText(b)) !== ORIG_B) throw new Error("seedTwo: docs did not reach the cloud");
  return { a, b };
}
/** 让「写」失败：mode = "all"（什么都写不进，另存也失败）/ 稿名（只有这一篇写不进，另存能成）。 */
const breakSaves = (D, mode) => D.eval((m) => {
  const s = window.__xhw.store(), orig = s.file;
  window.__saveCalls = [];
  s.file = function (n, o) { const f = orig.call(s, n, o); if (m === "all" || n === m) { f.save = async () => { window.__saveCalls.push(n); throw new Error("e2e: write failed"); }; } return f; };
  window.__restoreSaves = () => { s.file = orig; };
  return s.file !== orig;
}, mode);
const scenarios = [];
scenarios.push({ name: "T1 存不上、另存也失败 → 不换稿、解冻、字还在；修好后能接着写、能换稿", fn: async (w) => {
  const A = await w.device("A");
  const { a, b } = await seedTwo(w, A);
  if (!(await breakSaves(A, "all"))) throw new Error("cannot patch store.file");
  await A.type("qq");
  const r = await A.eval((n) => window.__xhw.openAny(n).then((x) => "ret:" + x, (e) => "threw:" + (e?.message ?? e)), a);
  await A.wait(300);
  console.log("  换稿返回:", r, "| 提示:", await toast(A), "| 写失败的调用:", JSON.stringify(await A.eval(() => window.__saveCalls)));
  check("换稿没成（返回 false，不抛）", r === "ret:false", r);
  check("人还在第二篇上", (await nameOf(A)) === b, await nameOf(A));
  check("编辑框解冻了", (await ro(A)) === false);
  check("敲的字还在编辑框里", (await A.text()) === ORIG_B + "qq", await A.text());
  check("第一篇没被碰（本机）", (await localText(A, a)) === ORIG_A, await localText(A, a));
  await A.eval(() => window.__restoreSaves());
  await A.type("w"); await A.wait(700);
  check("修好后：接着敲的字连同之前的都存进第二篇", (await localText(A, b)) === ORIG_B + "qqw", await localText(A, b));
  const r2 = await A.eval((n) => window.__xhw.openAny(n), a); await A.wait(300);
  check("修好后：能换到第一篇，编辑框 = 第一篇原文", r2 === true && (await A.text()) === ORIG_A, `${r2} ${await A.text()}`);
  check("第二篇本机 = 原文 + qqw", (await localText(A, b)) === ORIG_B + "qqw", await localText(A, b));
  await A.close();
} });
scenarios.push({ name: "T2 这一篇存不上、另存能成 → 字另存成一份留底，换稿照常，两篇都没被写错", fn: async (w) => {
  const A = await w.device("A");
  const { a, b } = await seedTwo(w, A);
  if (!(await breakSaves(A, b))) throw new Error("cannot patch store.file");
  await A.type("qq");
  const r = await A.eval((n) => window.__xhw.openAny(n).then((x) => "ret:" + x, (e) => "threw:" + (e?.message ?? e)), a);
  await A.wait(400);
  await A.eval(() => window.__restoreSaves());
  console.log("  换稿返回:", r, "| 提示:", await toast(A));
  check("换稿成了", r === "ret:true", r);
  check("开着的是第一篇、编辑框 = 第一篇原文、能打字", (await nameOf(A)) === a && (await A.text()) === ORIG_A && (await ro(A)) === false, `${await nameOf(A)} ${await A.text()}`);
  const names = await libraryNames(A);
  const kept = names.filter((n) => n !== a && n !== b);
  console.log("  书库:", JSON.stringify(names));
  check("书库里多了一份留底", kept.length === 1, JSON.stringify(names));
  if (kept[0]) check("留底 = 第二篇原文 + 没存上的字", (await localText(A, kept[0])) === ORIG_B + "qq", await localText(A, kept[0]));
  check("第二篇本机还是原文（没存上，也没被写坏）", (await localText(A, b)) === ORIG_B, await localText(A, b));
  check("第一篇本机 = 原文", (await localText(A, a)) === ORIG_A, await localText(A, a));
  await A.close();
} });
scenarios.push({ name: "T3 连着点两篇（第一下还在读就点第二下）：落在第二下那篇，三篇都没被写错，没有冻住", fn: async (w) => {
  const A = await w.device("A");
  const { a, b } = await seedTwo(w, A);
  await A.eval(() => window.__xhw.newDraft({})); await A.wait(300);
  await A.type("CCCC 第三篇。"); await A.wait(600);
  const c = await nameOf(A);
  w.gate.delayMs = 1200;
  await A.eval((n) => { window.__o1 = window.__xhw.openAny(n); }, a);
  await A.wait(150);
  await A.type("z");                                                            // 冻着，敲不进
  const r2 = await A.eval((n) => window.__xhw.openAny(n), b);
  const r1 = await A.eval(() => window.__o1);
  w.gate.delayMs = 0; await A.wait(400);
  check("第一下被顶掉（false）、第二下成了（true）", r1 === false && r2 === true, `${r1} ${r2}`);
  check("开着的是第二篇、编辑框 = 第二篇原文、能打字", (await nameOf(A)) === b && (await A.text()) === ORIG_B && (await ro(A)) === false, `${await nameOf(A)} ${await A.text()} ro=${await ro(A)}`);
  await A.type("k"); await A.wait(700);
  check("第二篇本机 = 原文 + k", (await localText(A, b)) === ORIG_B + "k", await localText(A, b));
  check("第一篇本机 = 原文", (await localText(A, a)) === ORIG_A, await localText(A, a));
  check("第三篇本机 = 原样", (await localText(A, c)) === "CCCC 第三篇。", await localText(A, c));
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
} });
for (const s of scenarios) {
  if (only && !s.name.includes(only)) continue;
  console.log("\n── " + s.name);
  const w = await createWorld();
  try { await Promise.race([s.fn(w), new Promise((_, rej) => setTimeout(() => rej(new Error("timed out (90s)")), 90000))]); }
  catch (e) { check("场景跑完", false, String(e?.stack ?? e)); }
  finally { await w.close().catch(() => {}); }
}
server.close();
console.log("\n" + (failed() ? "✗ " : "✓ ") + failed() + " failed");
process.exit(0);
