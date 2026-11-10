// Fable 审计探针（不进仓）：冷启动时上次那篇读的时候网盘报错。用法：在被测的仓目录里 node <这个文件>
const ROOT = process.cwd();
const { buildBundle, startServer, createWorld, makeChecker } = await import(ROOT + "/test/e2e-sync/harness.mjs");
const { check, failed } = makeChecker();
await buildBundle();
const server = await startServer();
const ORIG_A = "AAAA 第一篇原文。";
const snap = (D) => D.eval(() => ({ name: window.__xhw.editor.state.name, pending: window.__xhw.editor.state.pendingDate, canEdit: window.__xhw.editor.canEdit(), ro: document.getElementById("editor").readOnly, val: document.getElementById("editor").value, toast: document.getElementById("toast")?.textContent ?? "", gate: !document.getElementById("gateSheet").classList.contains("hidden") ? document.getElementById("gateTitle").textContent : "", phase: window.__xhw.gate.phase() }));
const w = await createWorld();
try {
  const A = await w.device("A");
  await A.boot(server.url); await A.type(ORIG_A); await A.wait(500); await A.pushNow(); await A.wait(300);
  const a = await A.eval(() => window.__xhw.editor.state.name);
  for (const mode of ["getItemByPath 抛 500", "download 抛 500"]) {
    const op = mode.startsWith("getItem") ? "getItemByPath" : "download";
    const orig = w.provider[op].bind(w.provider);
    w.provider[op] = async (...args) => { if (String(args[0]).includes(a.replace(/\.txt$/, ""))) { const e = new Error("e2e: 500"); e.status = 500; throw e; } return orig(...args); };
    await A.page.goto(server.url, { waitUntil: "load" });
    await A.page.waitForFunction(() => !!window.__xhw, null, { timeout: 20000 });
    await A.wait(6000);
    const s = await snap(A);
    console.log(`  [${mode}] 6 秒后:`, JSON.stringify(s), "| 报错:", A.errors.slice(-2).join(" ; ").slice(0, 300) || "无");
    check(`[${mode}] 冷启动后有一篇能写的稿（上次那篇或新稿）`, s.canEdit === true || !!s.gate, JSON.stringify(s));
    w.provider[op] = orig; A.errors.length = 0;
  }
  await A.close();
} catch (e) { check("场景跑完", false, String(e?.stack ?? e)); }
finally { await w.close().catch(() => {}); }
server.close();
console.log("\n" + (failed() ? "✗ " : "✓ ") + failed() + " failed");
process.exit(0);
