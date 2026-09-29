// 两台设备的同步冲突端到端测试。created 2026-09-29 by Claude Fable 5.1（user 2026-09-29「先确保现在如果有冲突的话会进 backup 文件夹」）
//   用法：node test/e2e-sync/run.mjs [场景名子串]。真 app + 真 store 库 + 真 IndexedDB；只有云是内存假云。
//   断言按数据安全词典序写（云端不丢 >> 当前操作不丢 > 自愈）：①云端赢家没被静默覆盖 ②输家字节有留底 ③之后还能继续写、继续推。
import { buildBundle, startServer, createWorld, makeChecker } from "./harness.mjs";
import { ensureZipLoaded } from "../zip-node.mjs";

const only = process.argv[2] ?? "";
const { check, failed } = makeChecker();
const TAKE_CLOUD = /云端覆盖本地/, KEEP_MINE = /本地覆盖云端/;
const dec = (u8) => new TextDecoder().decode(u8);

await buildBundle();
const server = await startServer();
ensureZipLoaded();
const { unpackProject } = await import("../../src/project/format.ts");
const bookPages = async (bytes) => { if (!bytes) return {}; const r = await unpackProject(new Blob([bytes])); if (r.kind !== "ok") throw new Error("cloud book unreadable: " + r.kind); const o = {}; for (const [k, v] of r.project.contents) o[k] = /\.txt$/i.test(k) ? new TextDecoder().decode(v) : `<${v.length} bytes>`; return o; };

const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

/** A 写一篇 txt 并推上云；B 启动后打开同一篇。返回稿名。 */
async function seedTxt(w, A, B, text) {
  await A.boot(server.url); await A.type(text); await A.wait(500); await A.pushNow(); await A.wait(300);
  const name = await A.eval(() => window.__xhw.editor.state.name);
  if (!(await w.cloudText(name))) throw new Error("seed: doc did not reach the cloud");
  await B.boot(server.url); await B.wait(800);
  await B.eval((n) => window.__xhw.openAny(n), name); await B.wait(500);
  return name;
}
/** A 建一本两页的书（第一章 / 第二章）并推上云；B 打开同一本。 */
async function seedBook(w, A, B) {
  await A.boot(server.url); await A.type("第一章原文。"); await A.wait(500);
  await A.page.click("#menuButton"); await A.wait(300); await A.page.click("#edgeLift"); await A.wait(300); await A.page.click("#sheetConfirm"); await A.wait(1200);
  await A.eval(() => window.__xhw.setSidebar(false));
  const ch1 = await A.eval(() => window.__xhw.project.current());
  await A.eval(() => window.__xhw.project.newSibling("第二章")); await A.wait(300);
  await A.type("第二章原文。"); await A.wait(500);
  await A.pushNow(); await A.wait(500);
  const name = await A.eval(() => window.__xhw.project.name());
  if (!(await w.cloudBytes(name))) throw new Error("seed: book did not reach the cloud");
  await B.boot(server.url); await B.wait(800);
  await B.eval((n) => window.__xhw.openAny(n), name); await B.wait(800);
  return { name, ch1, ch2: "第二章.txt" };
}
const jumpAndType = async (D, page, s) => { await D.eval((p) => window.__xhw.project.jump(p), page); await D.wait(150); await D.type(s); await D.wait(500); };

scenario("txt · 推送冲突 → 云端覆盖本地：输家进本机备份箱，之后还能继续写继续推", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const name = await seedTxt(w, A, B, "原文。");
  check("B 打开的是云端那一版", (await B.text()) === "原文。", await B.text());
  await A.type("A改了。"); await A.wait(500); await A.pushNow(); await A.wait(300);
  await B.type("B也改了。"); await B.wait(500);
  const push = B.pushNow();
  await B.resolveGate(TAKE_CLOUD); await push.catch(() => {}); await B.wait(1200);
  check("B 的编辑器换成云端版", (await B.text()) === "原文。A改了。", await B.text());
  const bk = await B.listBackup();
  check("B 输掉的那版进了备份箱（本机）", bk.some((b) => b.name === name), JSON.stringify(bk));
  check("云端仍是 A 的版本（没被覆盖）", (await w.cloudText(name)) === "原文。A改了。", await w.cloudText(name));
  await B.type("之后的字。"); await B.wait(700);
  const kind = await B.eval(() => window.__xhw.editor.syncKind());
  check("之后打的字落得了盘（保存链没有卡死）", await B.eval(() => window.__xhw.editor.state.name != null) && kind !== "none", kind);
  await Promise.race([B.pushNow(), B.wait(4000)]); await B.wait(300);
  check("之后打的字推得上云，且建立在云端赢家之上", (await w.cloudText(name)) === "原文。A改了。之后的字。", await w.cloudText(name));
  check("页面零报错", [...A.errors, ...B.errors].length === 0, [...A.errors, ...B.errors].join(" ; "));
  await A.close(); await B.close();
});

scenario("txt · 推送冲突 → 本地覆盖云端：云端输家进云端 .backup 夹", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const name = await seedTxt(w, A, B, "原文。");
  await A.type("A改了。"); await A.wait(500); await A.pushNow(); await A.wait(300);
  await B.type("B也改了。"); await B.wait(500);
  const push = B.pushNow();
  await B.resolveGate(KEEP_MINE); await push.catch(() => {}); await B.wait(800);
  check("云端换成 B 的版本", (await w.cloudText(name)) === "原文。B也改了。", await w.cloudText(name));
  const bk = await w.cloudList(".backup");
  const hit = bk.find((i) => i.name.startsWith(name.replace(/\.txt$/, "")) || i.name.includes(name));
  check("A 的版本进了云端 .backup 夹", !!hit, JSON.stringify(bk));
  if (hit) check("备份里的字节 = A 的那一版", (await w.cloudText(hit.path)) === "原文。A改了。", await w.cloudText(hit.path));
  await A.close(); await B.close();
});

scenario("txt · 上传途中又打了字 → 云端覆盖本地：途中打的字另存留底，云端赢家不被盖", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const name = await seedTxt(w, A, B, "原文。");
  await A.type("A改了。"); await A.wait(500); await A.pushNow(); await A.wait(300);
  await B.type("B也改了。"); await B.wait(500);
  let release; w.gate.holdUploads = new Promise((r) => (release = r));
  const push = B.pushNow(); await B.wait(300);
  await B.type("途中的字。"); await B.wait(100);
  w.gate.holdUploads = null; release();
  await B.resolveGate(TAKE_CLOUD); await push.catch(() => {}); await B.wait(1500);
  check("B 的编辑器换成云端版", (await B.text()) === "原文。A改了。", await B.text());
  await B.type("再写。"); await B.wait(700); await Promise.race([B.pushNow(), B.wait(4000)]); await B.wait(300);
  check("云端 = A 的版本 + B 之后写的（A 的修改没被静默盖掉）", (await w.cloudText(name)) === "原文。A改了。再写。", await w.cloudText(name));
  const all = await w.cloudList("");
  const local = await B.eval(async () => { const out = []; const s = window.__xhw.store(); await new Promise((res) => { const un = s.files.watchFolder("", (snap) => { out.push(...snap.items.map((i) => i.path)); setTimeout(() => { un(); res(); }, 0); }); }); return [...new Set(out)]; });
  const rescue = local.find((n) => n !== name && /留底/.test(n));
  check("途中打的字有一份留底稿", !!rescue, JSON.stringify(local));
  if (rescue) { const txt = await B.eval(async (n) => { const b = await window.__xhw.store().file(n, { isZip: false, mode: "existing" }).open(); return b ? await b.text() : null; }, rescue); check("留底稿里有途中打的字", !!txt && txt.includes("途中的字。"), txt); }
  void all;
  await A.close(); await B.close();
});

scenario("书 · 设备1改第一章、设备2改第二章 → 云端覆盖本地：输家整本进本机备份箱，云端赢家不被盖", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const { name, ch1, ch2 } = await seedBook(w, A, B);
  check("B 打开了同一本书", await B.eval(() => window.__xhw.project.active()), "");
  await jumpAndType(A, ch1, "A改第一章。"); await A.pushNow(); await A.wait(500);
  await jumpAndType(B, ch2, "B改第二章。");
  const push = B.pushNow();
  await B.resolveGate(TAKE_CLOUD); await push.catch(() => {}); await B.wait(1500);
  const cloud1 = await bookPages(await w.cloudBytes(name));
  check("云端仍是 A 的版本", cloud1[ch1] === "第一章原文。A改第一章。" && cloud1[ch2] === "第二章原文。", JSON.stringify(cloud1));
  const bk = await B.listBackup();
  check("B 输掉的整本进了备份箱（本机）", bk.some((b) => b.name === name), JSON.stringify(bk));
  await B.eval((p) => window.__xhw.project.jump(p), ch1); await B.wait(200);
  check("B 重开后看到 A 的第一章", (await B.text()) === "第一章原文。A改第一章。", await B.text());
  await jumpAndType(B, ch2, "B再写。"); await Promise.race([B.pushNow(), B.wait(5000)]); await B.wait(500);
  const cloud2 = await bookPages(await w.cloudBytes(name));
  check("B 之后的修改建立在云端赢家之上（A 的第一章还在）", cloud2[ch1] === "第一章原文。A改第一章。" && cloud2[ch2] === "第二章原文。B再写。", JSON.stringify(cloud2));
  check("页面零报错", [...A.errors, ...B.errors].length === 0, [...A.errors, ...B.errors].join(" ; "));
  await A.close(); await B.close();
});

scenario("书 · 推送冲突 → 本地覆盖云端：云端输家整本进云端 .backup 夹", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const { name, ch1, ch2 } = await seedBook(w, A, B);
  await jumpAndType(A, ch1, "A改第一章。"); await A.pushNow(); await A.wait(500);
  await jumpAndType(B, ch2, "B改第二章。");
  const push = B.pushNow();
  await B.resolveGate(KEEP_MINE); await push.catch(() => {}); await B.wait(1000);
  const cloud = await bookPages(await w.cloudBytes(name));
  check("云端换成 B 的版本", cloud[ch2] === "第二章原文。B改第二章。" && cloud[ch1] === "第一章原文。", JSON.stringify(cloud));
  const bk = await w.cloudList(".backup");
  check("云端 .backup 夹里多了一本", bk.length === 1, JSON.stringify(bk));
  if (bk[0]) { const pages = await bookPages(await w.cloudBytes(bk[0].path)); check("备份那本 = A 的版本（第一章的修改在里面）", pages[ch1] === "第一章原文。A改第一章。", JSON.stringify(pages)); }
  await A.close(); await B.close();
});

scenario("书 · 上传途中又打了字 → 云端覆盖本地：途中打的字另存留底，云端赢家不被盖", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const { name, ch1, ch2 } = await seedBook(w, A, B);
  await jumpAndType(A, ch1, "A改第一章。"); await A.pushNow(); await A.wait(500);
  await jumpAndType(B, ch2, "B改第二章。");
  let release; w.gate.holdUploads = new Promise((r) => (release = r));
  const push = B.pushNow(); await B.wait(300);
  await B.type("途中的字。"); await B.wait(100);
  w.gate.holdUploads = null; release();
  await B.resolveGate(TAKE_CLOUD); await push.catch(() => {}); await B.wait(1800);
  await jumpAndType(B, ch2, "再写。"); await Promise.race([B.pushNow(), B.wait(5000)]); await B.wait(500);
  const cloud = await bookPages(await w.cloudBytes(name));
  check("云端 = A 的版本 + B 之后写的（A 的第一章没被静默盖掉）", cloud[ch1] === "第一章原文。A改第一章。" && cloud[ch2] === "第二章原文。再写。", JSON.stringify(cloud));
  const local = await B.eval(async () => { const out = []; const s = window.__xhw.store(); await new Promise((res) => { const un = s.files.watchFolder("", (snap) => { out.push(...snap.items.map((i) => i.path)); setTimeout(() => { un(); res(); }, 0); }); }); return [...new Set(out)]; });
  const rescue = local.find((n) => /留底/.test(n));
  check("途中打的字有一份留底（一整本书）", !!rescue && /\.webxiaoheiwu\.zip$/.test(rescue), JSON.stringify(local));
  if (rescue) {
    const b64 = await B.eval(async (n) => { const b = await window.__xhw.store().file(n, { isZip: true, mode: "existing" }).open(); if (!b) return null; const u = new Uint8Array(await b.arrayBuffer()); let s = ""; for (const x of u) s += String.fromCharCode(x); return btoa(s); }, rescue);
    const pages = b64 ? await bookPages(new Uint8Array(Buffer.from(b64, "base64"))) : {};
    check("留底那本的第二章里有途中打的字，B 自己改的也在", pages[ch2] === "第二章原文。B改第二章。途中的字。", JSON.stringify(pages));
  }
  await A.close(); await B.close();
});

scenario("txt · 干净快进的下载途中打字：字不被静默吞掉，云端新版不被盖", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const name = await seedTxt(w, A, B, "原文。");
  await A.type("A改了。"); await A.wait(500); await A.pushNow(); await A.wait(300);
  let release; w.gate.holdDownloads = new Promise((r) => (release = r));
  const ref = B.eval(() => window.__xhw.editor.refreshIfClean()); await B.wait(400);
  await B.type("下载途中的字。"); await B.wait(400);
  const during = await B.text();
  w.gate.holdDownloads = null; release(); await ref.catch(() => {}); await B.wait(1200);
  const after = await B.text();
  check("下载途中编辑器是锁着的（字打不进去），或打进去的字没丢", during === "原文。" || after.includes("下载途中的字。"), `during=${during} after=${after}`);
  await B.type("之后。"); await B.wait(700); await Promise.race([B.pushNow(), B.wait(4000)]); await B.wait(300);
  const cloud = await w.cloudText(name);
  check("云端新版没有被静默覆盖（A 的修改还在）", !!cloud && cloud.includes("A改了。"), cloud);
  await A.close(); await B.close();
});

scenario("书 · 干净快进的下载途中打字：字不被静默吞掉，云端新版不被盖", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const { name, ch1, ch2 } = await seedBook(w, A, B);
  await jumpAndType(A, ch1, "A改第一章。"); await A.pushNow(); await A.wait(500);
  await B.eval((p) => window.__xhw.project.jump(p), ch2); await B.wait(300);
  let release; w.gate.holdDownloads = new Promise((r) => (release = r));
  const ref = B.eval(() => window.__xhw.project.refreshIfClean()); await B.wait(400);
  await B.type("下载途中的字。"); await B.wait(400);
  const during = await B.text();
  w.gate.holdDownloads = null; release(); await ref.catch(() => {}); await B.wait(1500);
  await B.eval((p) => window.__xhw.project.jump(p), ch2); await B.wait(200);
  const after = await B.text();
  check("下载途中编辑器是锁着的（字打不进去），或打进去的字没丢", during === "第二章原文。" || after.includes("下载途中的字。"), `during=${during} after=${after}`);
  await jumpAndType(B, ch2, "之后。"); await Promise.race([B.pushNow(), B.wait(5000)]); await B.wait(500);
  const cloud = await bookPages(await w.cloudBytes(name));
  check("云端新版没有被静默覆盖（A 的第一章还在）", cloud[ch1] === "第一章原文。A改第一章。", JSON.stringify(cloud));
  await A.close(); await B.close();
});

for (const s of scenarios) {
  if (only && !s.name.includes(only)) continue;
  console.log(`\n── ${s.name}`);
  const w = await createWorld();
  try { await Promise.race([s.fn(w), new Promise((_, rej) => setTimeout(() => rej(new Error("scenario timed out (60s)")), 60000))]); }
  catch (e) { check(`场景跑完`, false, String(e?.message ?? e)); }
  finally { await w.close().catch(() => {}); }
}
server.close();
console.log(`\n${failed() ? "✗" : "✓"} ${failed()} failed`);
process.exit(failed() ? 1 : 0);
