// 两台设备的同步冲突端到端测试。created 2026-09-29 by Claude Fable 5.1（user 2026-09-29「先确保现在如果有冲突的话会进 backup 文件夹」）
//   用法：node test/e2e-sync/run.mjs [场景名子串]。真 app + 真 store 库 + 真 IndexedDB；只有云是内存假云。
//   断言按数据安全词典序写（云端不丢 >> 当前操作不丢 > 自愈）：①云端赢家没被静默覆盖 ②输家字节有留底 ③之后还能继续写、继续推。
//   分区 / 并行（2026-11-10，Claude Fable 5.2；规矩 = ai-docs/20261110-test-tiers.md）：
//     node test/e2e-sync/run.mjs                 整套，并行（推开发版之后跑）
//     node test/e2e-sync/run.mjs @swap @gate     只跑这几区（区表 = ./areas.mjs；--list 看每区有哪些场景）
//     node test/e2e-sync/run.mjs --changed       看 git 改了什么（相对 HEAD + 没跟踪的；--changed=main 相对 main），按区表推出该跑哪几区
//     node test/e2e-sync/run.mjs "换稿 ㉑"        场景名子串（照旧）
//     --jobs=N 并行几条（默认 min(12, 核数 − 4)）；--serial = 一条一条跑（查偶发红时用）
import { AsyncLocalStorage } from "node:async_hooks";
import { availableParallelism } from "node:os";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { buildBundle, startServer, createWorld } from "./harness.mjs";
import { AREAS, SOLO, areasOf, areasForPath } from "./areas.mjs";
import { ensureZipLoaded } from "../zip-node.mjs";

// 每个场景一份输出：并行时各场景的行先攒着，跑完整块打出来（场景里的 console.log 也收进来）。
const scope = new AsyncLocalStorage();
const rawLog = console.log.bind(console);
console.log = (...a) => { const c = scope.getStore(); if (c) c.lines.push(a.map(String).join(" ")); else rawLog(...a); };
const check = (name, ok, detail = "") => { const c = scope.getStore(); if (c) c.checks.push(!!ok); console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : "  ← " + detail}`); };
const TAKE_CLOUD = /云端覆盖本地/, KEEP_MINE = /本地覆盖云端/;
const dec = (u8) => new TextDecoder().decode(u8);

let server = null;   // 选好要跑哪些场景之后才打包、起服务（--list / 没有要跑的 = 不起）
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
  const local = await B.eval(async () => { const out = []; const s = window.__xhw.store(); await new Promise((res) => { const un = s.files.watchFolder("", (snap) => { out.push(...snap.items.map((i) => i.identifier)); setTimeout(() => { un(); res(); }, 0); }); }); return [...new Set(out)]; });
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
  const local = await B.eval(async () => { const out = []; const s = window.__xhw.store(); await new Promise((res) => { const un = s.files.watchFolder("", (snap) => { out.push(...snap.items.map((i) => i.identifier)); setTimeout(() => { un(); res(); }, 0); }); }); return [...new Set(out)]; });
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

// ── 备份箱界面（图库包的搁置区视图）：冲突里输掉的那一版，用户自己在书库里找得到、取得回来 ──
const STAMPED = (stem, ext) => new RegExp("^" + stem.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + " \\[\\d{8}-\\d{6}(?:-\\d+)?\\]" + ext.replace(/\./g, "\\.") + "$");
/** 打开书库 → 回收站 / 备份箱 → 备份箱页签。返回备份箱里的卡片（名字 + 副行文字）。 */
async function openBackupBox(D) {
  if (!(await D.eval(() => document.body.dataset.mode === "gallery"))) { await D.page.click("#libraryButton"); await D.wait(900); }
  await D.page.click("#galleryTrashBtn"); await D.wait(400);
  await D.page.click("#galleryTabBackup"); await D.wait(900);
  return D.eval(() => [...document.querySelectorAll("#galleryMount .gallery-tile.aside-backup")].map((el) => ({ name: el.querySelector(".gallery-tile-name")?.getAttribute("title") ?? "", meta: el.querySelector(".gallery-tile-meta")?.textContent ?? "", printed: el.querySelector(".gallery-tile-overlay .xhw-cover-title")?.textContent ?? "" })));
}
/** 在备份箱第 i 张卡片上点 ⋯ → 恢复。 */
async function restoreFromBackupBox(D, i = 0) {
  await D.eval((k) => { const tile = document.querySelectorAll("#galleryMount .gallery-tile.aside-backup")[k]; tile.querySelector(".gallery-tile-menu-btn").click(); }, i); await D.wait(250);
  await D.eval(() => { const pop = document.querySelector("#galleryMount .gallery-tile-menu-popup:not(.hidden)"); pop.querySelector("button:not(.danger)").click(); }); await D.wait(1500);
}
const libraryNames = (D) => D.eval(async () => { const out = []; const s = window.__xhw.store(); await new Promise((res) => { const un = s.files.watchFolder("", (snap) => { out.length = 0; out.push(...snap.items.map((i) => i.identifier)); setTimeout(() => { un(); res(); }, 50); }); }); return out; });

scenario("备份箱 · txt 冲突选了云端 → 书库的备份箱里看得到输家，取回来是一篇认得出的稿", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const name = await seedTxt(w, A, B, "原文。");
  await A.type("A改了。"); await A.wait(500); await A.pushNow(); await A.wait(300);
  await B.type("B也改了。"); await B.wait(500);
  const push = B.pushNow();
  await B.resolveGate(TAKE_CLOUD); await push.catch(() => {}); await B.wait(1200);
  const tiles = await openBackupBox(B);
  check("备份箱里有一张卡片，就是这篇稿", tiles.length === 1 && tiles[0].name === name, JSON.stringify(tiles));
  check("副行说的是什么时候留的底（不是未知时间）", tiles.length === 1 && /留底/.test(tiles[0].meta) && !/未知/.test(tiles[0].meta), JSON.stringify(tiles));
  check("栏上亮着的页签是备份箱", await B.eval(() => document.getElementById("galleryTabBackup").classList.contains("is-on") && !document.getElementById("galleryTabTrash").classList.contains("is-on")));
  await restoreFromBackupBox(B);
  const names = await libraryNames(B);
  const stem = name.replace(/\.txt$/, "");
  const back = names.find((n) => n !== name && STAMPED(stem, ".txt").test(n));
  check("取回来的稿名 = 原名 + 时间戳，扩展名还是 .txt", !!back, JSON.stringify(names));
  if (back) {
    const txt = await B.eval(async (n) => { const b = await window.__xhw.store().file(n, { isZip: false, mode: "existing" }).open(); return b ? await b.text() : null; }, back);
    check("取回来的内容 = B 输掉的那一版", txt === "原文。B也改了。", String(txt));
  }
  check("原稿没被动（仍是云端赢家）", (await B.eval(async (n) => { const b = await window.__xhw.store().file(n, { isZip: false, mode: "existing" }).open(); return b ? await b.text() : null; }, name)) === "原文。A改了。");
  check("取走之后备份箱空了", (await B.eval(() => document.querySelectorAll("#galleryMount .gallery-tile.aside-backup").length)) === 0 && (await B.listBackup()).length === 0, JSON.stringify(await B.listBackup()));
  await B.page.click("#galleryAsideBack"); await B.wait(600);
  check("回到文件：栏收起，取回来的稿在书库里", await B.eval((n) => document.getElementById("galleryAsideBar").classList.contains("hidden") && [...document.querySelectorAll("#galleryMount .gallery-tile-name")].some((e) => e.getAttribute("title") === n), back ?? ""));
  check("页面零报错", [...A.errors, ...B.errors].length === 0, [...A.errors, ...B.errors].join(" ; "));
  await A.close(); await B.close();
});

scenario("备份箱 · 书冲突选了云端 → 取回来仍是一本书（时间戳插在扩展名前），里面是输掉的那一版", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const { name, ch1, ch2 } = await seedBook(w, A, B);
  await jumpAndType(A, ch1, "A改第一章。"); await A.pushNow(); await A.wait(500);
  await jumpAndType(B, ch2, "B改第二章。");
  const push = B.pushNow();
  await B.resolveGate(TAKE_CLOUD); await push.catch(() => {}); await B.wait(1500);
  const tiles = await openBackupBox(B);
  check("备份箱里有这本书", tiles.length === 1 && tiles[0].name === name, JSON.stringify(tiles));
  check("卡片封面上印着书名（和书库里同一套排版）", tiles.length === 1 && tiles[0].printed.length > 0, JSON.stringify(tiles));
  await restoreFromBackupBox(B);
  const names = await libraryNames(B);
  const stem = name.replace(/\.webxiaoheiwu\.zip$/, "");
  const back = names.find((n) => n !== name && STAMPED(stem, ".webxiaoheiwu.zip").test(n));
  check("取回来的名字 = 书名 + 时间戳 + .webxiaoheiwu.zip", !!back, JSON.stringify(names));
  if (back) {
    const bytes = await B.eval(async (n) => { const b = await window.__xhw.store().file(n, { isZip: true, mode: "existing" }).open(); return b ? Array.from(new Uint8Array(await b.arrayBuffer())) : null; }, back);
    const pages = await bookPages(bytes ? new Uint8Array(bytes) : null);
    check("取回来的书里第二章是 B 改过的那一版", pages[ch2] === "第二章原文。B改第二章。", JSON.stringify(pages));
    check("取回来的书里第一章是 B 当时看到的那一版（没有 A 的修改）", pages[ch1] === "第一章原文。", JSON.stringify(pages));
    await B.page.click("#galleryAsideBack"); await B.wait(600);
    const opened = await B.eval(async (n) => { const ok = await window.__xhw.openAny(n); return ok && window.__xhw.project.active() && window.__xhw.project.name() === n; }, back); await B.wait(600);
    check("取回来的书能当书打开", opened === true, String(opened));
  }
  const cloud = await bookPages(await w.cloudBytes(name));
  check("云端原书没被动（A 的第一章还在）", cloud[ch1] === "第一章原文。A改第一章。", JSON.stringify(cloud));
  check("页面零报错", [...A.errors, ...B.errors].length === 0, [...A.errors, ...B.errors].join(" ; "));
  await A.close(); await B.close();
});

scenario("备份箱 · 书冲突选了本地 → 云端输家在备份箱（云端那一端），从云端取回来仍是一本书", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const { name, ch1, ch2 } = await seedBook(w, A, B);
  await jumpAndType(A, ch1, "A改第一章。"); await A.pushNow(); await A.wait(500);
  await jumpAndType(B, ch2, "B改第二章。");
  const push = B.pushNow();
  await B.resolveGate(KEEP_MINE); await push.catch(() => {}); await B.wait(1500);
  const tiles = await openBackupBox(B);
  check("备份箱里有这本书，标的是云端", tiles.length === 1 && tiles[0].name === name && /云端/.test(tiles[0].meta), JSON.stringify(tiles));
  await restoreFromBackupBox(B);
  const cloudNames = (await w.cloudList("")).map((i) => i.name);
  const stem = name.replace(/\.webxiaoheiwu\.zip$/, "");
  const back = cloudNames.find((n) => n !== name && STAMPED(stem, ".webxiaoheiwu.zip").test(n));
  check("云端多了一本：书名 + 时间戳 + .webxiaoheiwu.zip", !!back, JSON.stringify(cloudNames));
  if (back) {
    const pages = await bookPages(await w.cloudBytes(back));
    check("它是 A 输掉的那一版（第一章有 A 的修改）", pages[ch1] === "第一章原文。A改第一章。" && pages[ch2] === "第二章原文。", JSON.stringify(pages));
  }
  const cloud = await bookPages(await w.cloudBytes(name));
  check("云端原书 = B 的版本", cloud[ch2] === "第二章原文。B改第二章。", JSON.stringify(cloud));
  check("页面零报错", [...A.errors, ...B.errors].length === 0, [...A.errors, ...B.errors].join(" ; "));
  await A.close(); await B.close();
});

// ── 挂机（闲置锁屏）三场景，2026-10-16（user「wxhw 挂机之后还是有要你本地覆盖云端的 bug，这之间我没有动其他的东西」）──
//   锁屏 = __xhw.idle.show()（onIdle：推送）；醒来 = __xhw.idle.dismiss()（onResume：resumeSync）。不等 2 分钟。
const uploadsOf = (w, name) => w.log.filter((l) => l === "upload " + name).length;

scenario("txt · 挂机：别的设备改过、这台干净 → 醒来静默快进、不弹面、不白推", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const name = await seedTxt(w, A, B, "原文。");
  await A.type("A改了。"); await A.wait(500); await A.pushNow(); await A.wait(300);
  const before = uploadsOf(w, name);
  await B.eval(() => window.__xhw.idle.show()); await B.wait(1500);          // 锁屏那一下：这台干净，什么都不该推
  check("锁屏时不弹冲突面", !(await B.gateShown()));
  await B.eval(() => window.__xhw.idle.dismiss()); await B.wait(2500);       // 醒来：先核云端
  check("醒来不弹冲突面", !(await B.gateShown()));
  check("B 的编辑器静默换成云端新版", (await B.text()) === "原文。A改了。", await B.text());
  check("云端仍是 A 的版本（没被这台的旧版盖掉）", (await w.cloudText(name)) === "原文。A改了。", await w.cloudText(name));
  check("这台干净 → 锁屏 / 醒来都没有上传（不白推）", uploadsOf(w, name) === before, `uploads ${before} → ${uploadsOf(w, name)}`);
  check("页面零报错", [...A.errors, ...B.errors].length === 0, [...A.errors, ...B.errors].join(" ; "));
  await A.close(); await B.close();
});

scenario("txt · 挂机：锁屏那一下的推送回执丢了（设备睡着把在途请求杀了）→ 醒来不弹面、云端 = 本地、之后还能推", async (w) => {
  const A = await w.device("A");
  await A.boot(server.url); await A.type("原文。"); await A.wait(500); await A.pushNow(); await A.wait(300);
  const name = await A.eval(() => window.__xhw.editor.state.name);
  await A.type("挂机前。"); await A.wait(500);                                   // 本地落盘、15 s 防抖还没推
  w.gate.loseUploadOf = name;                                                   // 锁屏那一下的上传：云端收到了、回执没回来
  await A.eval(() => window.__xhw.idle.show()); await A.wait(3000);
  await A.eval(() => window.__xhw.idle.dismiss()); await A.wait(2500);
  check("醒来不弹冲突面（回执丢了但字节一样 = 库自愈）", !(await A.gateShown()));
  check("云端 = 本地", (await w.cloudText(name)) === "原文。挂机前。", await w.cloudText(name));
  check("顶栏状态 = 已同步", (await A.eval(() => window.__xhw.editor.syncKind())) === "clean", await A.eval(() => window.__xhw.editor.syncKind()));
  await A.type("之后。"); await A.wait(500); await A.pushNow(); await A.wait(300);
  check("之后打的字推得上云", (await w.cloudText(name)) === "原文。挂机前。之后。", await w.cloudText(name));
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

scenario("加密 txt · 挂机：锁屏那一下的推送回执丢了 → 醒来不弹面（同一次推里重试复用同一份密文 → 库逐字节自愈；跨 reload 的那条缺口见 handoff）", async (w) => {
  const A = await w.device("A");
  await A.boot(server.url);
  await A.eval(() => window.__xhw.setPassword("e2e-pw")); await A.wait(200);
  await A.eval(() => window.__xhw.newDraft({ encrypted: true })); await A.wait(500);
  await A.type("密文原文。"); await A.wait(600); await A.pushNow(); await A.wait(500);
  const name = await A.eval(() => window.__xhw.editor.state.name);
  const stem = name.replace(/\.txt$/, "");
  // 加密容器的云端名另有后缀（docKinds 表）。等它真到了云端再往下（最多 8 s）：以前推完固定睡 0.5 s 就查，机器忙时还没到 →
  //   拿不到云端名、下面「丢回执」的门没装上、后面几项白白通过（家族周账 F-239；2026-11-10 Claude Fable 5.2 改成轮询）。
  let cloudName;
  for (let i = 0; i < 40 && !cloudName; i++) { cloudName = (await w.cloudList("")).map((x) => x.name).find((n) => n.startsWith(stem)); if (!cloudName) await A.wait(200); }
  check("加密稿已上云", !!cloudName, JSON.stringify((await w.cloudList("")).map((i) => i.name)));
  await A.type("挂机前。"); await A.wait(500);
  w.gate.loseUploadOf = cloudName;                                              // 锁屏那一下对这篇的上传：云端收到了、回执没回来
  await A.eval(() => window.__xhw.idle.show()); await A.wait(3000);
  check("锁屏时不弹冲突面（回执丢了：库在同一次推里重试、412 → 拉回来逐字节比对 = 同一份密文 → 自愈）", !(await A.gateShown()));
  await A.eval(() => window.__xhw.idle.dismiss()); await A.wait(2500);
  check("醒来不弹冲突面", !(await A.gateShown()));
  check("顶栏状态 = 已同步", (await A.eval(() => window.__xhw.editor.syncKind())) === "clean", await A.eval(() => window.__xhw.editor.syncKind()));
  check("本地的字一个不丢", (await A.text()) === "密文原文。挂机前。", await A.text());
  await A.type("之后。"); await A.wait(500); await Promise.race([A.pushNow(), A.wait(4000)]); await A.wait(300);
  check("之后打的字落得了盘、还能推（保存链没卡死）", (await A.eval(() => window.__xhw.editor.syncKind())) === "clean", await A.eval(() => window.__xhw.editor.syncKind()));
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

// 已知库缺口（2026-10-16，user「我完全没有动别的电脑，可能只是切换前后台或者挂机较久，就会有」）：页面被回收后重开，本地恢复在登录之前，
//   open() 的新鲜度门没跑成（库 isOnline = rawOnline && signedIn → 未登录走 offline 分支，不 markSeen；KudsRocket 10-16 核的）→ 这篇在本 tab 没有「云端血统」(_base)；登录回来前打的第一个字 recordEdit 捕到 parent=null
//   → 第一次推不带 If-Match → conflictBehavior:fail → 409 → 字节已不同（多了新打的字）→ CloudNameCollisionError → 当冲突面弹出来。
//   修在库：open() 云端不可达时，本地副本干净 ∧ 有 durable etag → markSeen(durable)（本 tab 刚读进来的字节就是那一版）。等 user 批；批了把下面翻 true。
const LIBRARY_LINEAGE_FIX_LANDED = true;   // store 0.18.0（2026-10-16）：open 核对没跑成时干净副本接血统
scenario("txt · 单设备：页面被回收后重开（切后台回来 / 挂机久了），登录还没回来就接着打字 → 第一次推不弹面", async (w) => {
  const A = await w.device("A");
  await A.boot(server.url); await A.type("原文。"); await A.wait(500); await A.pushNow(); await A.wait(300);
  const name = await A.eval(() => window.__xhw.editor.state.name);
  const before = uploadsOf(w, name);
  await A.eval(() => localStorage.setItem("e2eStartSignedOut", "1"));
  await A.boot(server.url);                                                     // 重开：本地恢复在前、登录在后（真机 boot 顺序）
  await A.eval(() => localStorage.removeItem("e2eStartSignedOut"));
  check("重开后开的是同一篇", (await A.text()) === "原文。", await A.text());
  await A.type("重开后。"); await A.wait(500);                                   // 登录回来之前就开打
  await A.eval(() => window.__e2eAuth.signIn()); await A.wait(2500);           // 静默续登回来 → afterSignIn
  await Promise.race([A.pushNow(), A.wait(4000)]); await A.wait(500);
  const shown = await A.gateShown();
  if (LIBRARY_LINEAGE_FIX_LANDED) check("第一次推不弹冲突面（这台没别人动过云端）", !shown);
  else console.log(`   ℹ 已知库缺口（等 user 批）：第一次推 ${shown ? "弹了冲突面 —— 复现 user 的「挂机 / 切后台后要我本地覆盖云端」" : "没弹（库已修？把 LIBRARY_LINEAGE_FIX_LANDED 翻 true）"}`);
  if (shown) { await A.resolveGate(KEEP_MINE).catch(() => {}); await A.wait(1500); }
  check("选了本地覆盖云端之后：云端 = 本地（原文 + 重开后打的），字不丢", (await w.cloudText(name)) === "原文。重开后。", await w.cloudText(name));
  if (LIBRARY_LINEAGE_FIX_LANDED) check("只推了一次", uploadsOf(w, name) === before + 1, `uploads ${before} → ${uploadsOf(w, name)}`);
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

// store 2.2.2 / gallery 0.8.10：改名撞上「云端那份被别的设备改过、这台也改了没推」→ 动字节前问「旧的怎么办」（2026-11-03 家族工单 D，Claude Opus 5.5）。三个答案各一遍：
for (const [answer, re, expect] of [
  ["取消", /取消/, { renamed: false, oldInCloud: true, newInCloud: false, status: /这次没动/ }],
  ["留着旧的", /留着旧的/, { renamed: true, oldInCloud: true, newInCloud: true, status: /照你的意思/ }],
  ["搬走旧的", /搬走旧的/, { renamed: true, oldInCloud: false, newInCloud: true, status: null }],
]) scenario(`txt · 改名撞上分叉 → 问「旧的怎么办」→ ${answer}`, async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const name = await seedTxt(w, A, B, "原文。");
  await A.type("A改了。"); await A.wait(500); await A.pushNow(); await A.wait(300);
  await B.type("B也改了。"); await B.wait(500);
  const cloudBefore = await w.cloudText(name);
  const renaming = B.eval(() => window.__xhw.editor.renameTo("新名字"));
  const labels = await B.resolveGate(re);
  check("面上三个答案都在（搬走 / 留着 / 取消）", /搬走旧的/.test(labels.join()) && /留着旧的/.test(labels.join()) && /取消/.test(labels.join()), labels.join(" | "));
  await renaming; await B.wait(800);
  const nowName = await B.eval(() => window.__xhw.editor.state.name), newPath = nowName !== name ? nowName : null;
  check(expect.renamed ? "身份换成新名字" : "身份没动", expect.renamed ? /新名字/.test(nowName ?? "") : nowName === name, String(nowName));
  check(expect.oldInCloud ? "云端旧名那份还在、字节没动（A 的版本）" : "云端旧名那份不在原地了（搬走 = 进回收站）", expect.oldInCloud ? (await w.cloudText(name)) === cloudBefore : (await w.cloudText(name)) === null, String(await w.cloudText(name)));
  if (expect.newInCloud) check("新名字传上去了、是 B 的字", ((await w.cloudText(newPath)) ?? "").includes("B也改了。"), String(await w.cloudText(newPath)));
  else check("云端没有多出新名字", !(await w.cloudList("")).some((i) => /新名字/.test(i.name)), JSON.stringify((await w.cloudList("")).map((i) => i.name)));
  check("B 的字一个没丢", (await B.text()).includes("B也改了。"), await B.text());
  if (expect.status) { const st = await B.eval(() => document.getElementById("toast")?.textContent ?? ""); check(`状态行如实说（${expect.status.source}）`, expect.status.test(st), st); }
  check("页面零报错", [...A.errors, ...B.errors].length === 0, [...A.errors, ...B.errors].join(" ; "));
  await A.close(); await B.close();
});

// ── 闸门（家族设计稿 ai-docs/20261103-cloud-gate-design.md §7；2026-11-03，家族工单 D，Claude Opus 5.5）──
const GATE_OVERLAY_WATCH = () => {   // 记录罩每一次出现 / 消失（要赶在 app 脚本跑之前挂上）
  window.__gateTimes = [];
  document.addEventListener("readystatechange", () => {
    if (document.readyState !== "interactive") return;
    const g = document.getElementById("gateSheet"); if (!g) return;
    let up = !g.classList.contains("hidden");
    new MutationObserver(() => { const now = !g.classList.contains("hidden"); if (now !== up) { up = now; window.__gateTimes.push({ up: now, t: performance.now(), title: document.getElementById("gateTitle").textContent }); } }).observe(g, { attributes: true, attributeFilter: ["class"] });
  });
};
/** 一台设备上写好一篇、推上云、记住它，然后按 cfg 重开。 */
async function seedThenReopen(w, tag, cfg, signedOut, { raw = true } = {}) {
  const D = await w.device(tag);
  await D.ctx.addInitScript(GATE_OVERLAY_WATCH);
  await D.boot(server.url); await D.type("本机这一份。"); await D.wait(500); await D.pushNow(); await D.wait(300);
  const name = await D.eval(() => window.__xhw.editor.state.name);
  if (!(await w.cloudText(name))) throw new Error("seed: doc did not reach the cloud");
  await D.setGate(cfg, signedOut);
  if (raw) await D.bootRaw(server.url); else await D.boot(server.url);
  return { D, name };
}
const waitPhase = (D, phase, timeout = 15000) => D.page.waitForFunction((p) => window.__xhw.gate.phase() === p, phase, { timeout });
const waitBar = (D, re, timeout = 8000) => D.page.waitForFunction((src) => new RegExp(src).test(document.querySelector("#offlineBar .offline-bar-text").textContent ?? "") && !document.getElementById("offlineBar").classList.contains("hidden"), re.source, { timeout });
const netCalls = (w) => w.log.length;
const CLOUD_READS = (w) => w.log.filter((l) => /^(getItemByPath|list)\b/.test(l)).length;
const diagText = (D) => D.page.evaluate(async () => { await new Promise((r) => setTimeout(r, 350)); const k = Object.keys(localStorage).find((x) => x.endsWith("diag-log")); return k ? localStorage.getItem(k) : ""; });

scenario("闸门 ① 没挂库：开机 / 醒来零闸", async (w) => {
  const D = await w.device("A");
  await D.ctx.addInitScript(GATE_OVERLAY_WATCH);
  await D.page.goto(server.url); await D.setGate({}, true);   // 从没登录：initAuth 回「没账号」
  await D.boot(server.url);
  let v = await D.gateView();
  check("开机没有罩、没有闸", !v.up && v.phase === "open", JSON.stringify(v));
  check("从头到尾罩一次都没出现", (await D.eval(() => window.__gateTimes.length)) === 0);
  check("没去续签", v.authCalls === 0, String(v.authCalls));
  await D.hide(); await D.wait(100); await D.show(); await D.wait(300);
  v = await D.gateView();
  check("醒来也没有", !v.up && v.phase === "open" && v.bar === null, JSON.stringify(v));
  await D.type("没有家照样写。"); await D.wait(400);
  check("能写", (await D.text()).includes("没有家照样写。"));
  check("页面零报错", D.errors.length === 0, D.errors.join(" ; "));
  await D.close();
});

scenario("闸门 ② 登录好 + 云端没动：罩一下就放行、没有面", async (w) => {
  const { D } = await seedThenReopen(w, "A", { }, false, { raw: false });
  const times = await D.eval(() => window.__gateTimes);
  const ups = times.filter((x) => x.up);
  check("罩出现过一次（正在核对）", ups.length === 1 && /核对/.test(ups[0].title), JSON.stringify(times));
  const dur = times.length >= 2 ? Math.round(times[1].t - times[0].t) : -1;
  console.log(`  罩从出现到消失 = ${dur} ms（设计稿 §7② 目标 < 300 ms）`);
  check("罩 < 300 ms", dur >= 0 && dur < 300, String(dur));
  const v = await D.gateView();
  check("放行、没有条", !v.up && v.phase === "open" && v.bar === null, JSON.stringify(v));
  check("本机那份摆着", (await D.text()).includes("本机这一份。"));
  check("页面零报错", D.errors.length === 0, D.errors.join(" ; "));
  await D.close();
});

scenario("闸门 ③ 续签失败：闸 + 两个钮；离线继续能写、零网络；回线续签成功 → 条收掉、推上去", async (w) => {
  const { D, name } = await seedThenReopen(w, "A", { probing: true, renew: "interaction" }, true);
  await waitPhase(D, "blocked");
  let v = await D.gateView();
  check("闸的标题 / 正文按真实原因", v.title === "网盘没连上" && v.message === "登录过期了", JSON.stringify(v));
  check("两个钮", v.buttons.join("|") === "重新登录|离线继续", v.buttons.join("|"));
  await D.page.waitForFunction(() => document.getElementById("editor").value.includes("本机这一份。"), null, { timeout: 5000 });
  check("本机那份摆在闸底下", true);
  const focusOnEditor = await D.eval(() => document.activeElement === document.getElementById("editor"));
  check("闸着时焦点不在纸上（打不进字）", !focusOnEditor);
  await D.clickGate("离线继续"); await D.wait(200);
  v = await D.gateView();
  check("离线继续 → 放行", !v.up && v.phase === "open", JSON.stringify(v));
  check("常驻条 n = 0 时只写「离线」", v.bar === "离线", String(v.bar));
  const netBefore = netCalls(w), authBefore = v.authCalls;
  await D.type("离线写的。"); await D.wait(800);
  check("能写", (await D.text()).includes("离线写的。"), await D.text());
  await waitBar(D, /还有 1 份没传上去/);
  check("条显示 1 份", true);
  // 这段时间里后台该发生的都发生一遍：切后台（会 push）/ 回前台 / 前台那些刷新
  await D.hide(); await D.wait(200); await D.show(); await D.wait(800);
  await D.eval(() => window.__xhw.drawer.subscribe()); await D.wait(300);
  v = await D.gateView();
  check("网络里零云端请求（离线继续之后）", netCalls(w) === netBefore, w.log.slice(netBefore).join(","));
  check("离线且仍没登录：回前台不再弹闸", !v.up && v.phase === "open" && /1 份/.test(v.bar ?? ""), JSON.stringify(v));
  const authAfterWake = v.authCalls;
  console.log(`  离线继续后续签尝试：回前台 ${authAfterWake - authBefore} 次（浏览器说有网 = 悄悄试一次；设计稿 §2）`);
  // 回线 + 续签成功
  await D.patchGate({ renew: "ok" });
  await D.eval(() => window.dispatchEvent(new Event("online")));
  await D.page.waitForFunction(() => document.getElementById("offlineBar").classList.contains("hidden"), null, { timeout: 8000 });
  await D.wait(600);
  v = await D.gateView();
  check("条消失、回到在线", v.bar === null && v.online === true, JSON.stringify(v));
  check("离线写的字推上云了", ((await w.cloudText(name)) ?? "").includes("离线写的。"), String(await w.cloudText(name)));
  const dirty = await D.eval(() => window.__xhw.store().files.dirty.count());
  check("没推的清零", dirty === 0, String(dirty));
  check("页面零报错", D.errors.length === 0, D.errors.join(" ; "));
  await D.close();
});

/** 闸门离线里写：seed 那篇（传过 = (b)）加一句；再开两篇新稿（从没传过 = (a)），第二篇留开着。返回三篇的名字。 */
async function offlineWriteThree(D) {
  await D.type("离线写的第一篇。"); await D.wait(800);
  const seed = await D.eval(() => window.__xhw.editor.state.name);
  await D.eval(() => window.__xhw.newDraft()); await D.wait(400);
  await D.type("离线写的第二篇。"); await D.wait(800);
  const second = await D.eval(() => window.__xhw.editor.state.name);
  await D.eval(() => window.__xhw.newDraft()); await D.wait(400);
  await D.type("离线写的第三篇。"); await D.wait(800);
  const third = await D.eval(() => window.__xhw.editor.state.name);
  return { seed, second, third };
}
const sheetFace = (D) => D.eval(() => ({ title: document.getElementById("sheetTitle")?.textContent ?? "", message: document.getElementById("sheetMessage")?.textContent ?? "", ok: document.getElementById("sheetConfirm")?.textContent ?? "", cancel: document.getElementById("sheetCancel")?.textContent ?? "" }));

scenario("闸门 ③e 回线：问「只在这台设备」的面开着时，「正在同步」条已经收了（不等人答）；稍后 = 什么都不推", async (w) => {
  const { D, name } = await seedThenReopen(w, "A", { probing: true, renew: "interaction" }, true);
  await waitPhase(D, "blocked");
  await D.page.waitForFunction(() => document.getElementById("editor").value.includes("本机这一份。"), null, { timeout: 5000 });
  await D.clickGate("离线继续"); await D.wait(200);
  const { second, third } = await offlineWriteThree(D);
  await waitBar(D, /还有 3 份没传上去/);
  await D.patchGate({ renew: "ok" });
  await D.hide(); await D.wait(150); await D.show();   // 走「回前台 → 悄悄续签 → 跟上」这条路（online 事件那条路自己先问，分辨不出 resumeSync 等不等人）
  await D.page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 10000 });
  await D.wait(300);
  const st = await sheetFace(D);
  console.log(`  问：${st.title} / ${st.message.slice(0, 50)}…`);
  check("开着的那篇照常推了（前提）", ((await w.cloudText(third)) ?? "").includes("离线写的第三篇。"));
  check("只数从没传过的：1 份（开着的那篇推了、传过的那篇不算）", st.title === "有 1 份只在这台设备，现在传上去？", st.title);
  check("面上说真话：传过的那篇会一起续传", /另外 1 份传过/.test(st.message), st.message);
  check("两个钮：现在传 / 稍后", st.ok === "现在传" && st.cancel === "稍后", `${st.ok}|${st.cancel}`);
  const v = await D.gateView();
  check("面开着：条已经收了，不写「正在同步」", v.bar === null, JSON.stringify(v));
  check("面开着：在线", v.online === true, JSON.stringify(v));
  await D.page.click("#sheetCancel"); await D.wait(800);
  check("稍后：从没传过的没上云", (await w.cloudText(second)) === null);
  check("稍后：传过的那篇也跟着等（库的 pushAll 不分种类，面上说过）", !((await w.cloudText(name)) ?? "").includes("离线写的第一篇。"));
  check("稍后：两篇都还在（没丢）", (await D.eval(() => window.__xhw.store().files.dirty.count())) === 2);
  check("稍后：状态行指去书库", /要处理的/.test(await D.eval(() => document.getElementById("toast").textContent)));
  // 一页只问一次：再回来一次不再问、也不推
  await D.hide(); await D.wait(150); await D.show(); await D.wait(1500);
  check("这一页不再问", await D.eval(() => document.getElementById("sheet").classList.contains("hidden")));
  check("也不推", (await w.cloudText(second)) === null);
  check("页面零报错", D.errors.length === 0, D.errors.join(" ; "));
  await D.close();
});

scenario("回来 · 有从没传过的：点「现在传」= 都传上去（传过的跟着续传），清零", async (w) => {
  const { D, name } = await seedThenReopen(w, "A", { probing: true, renew: "interaction" }, true);
  await waitPhase(D, "blocked");
  await D.page.waitForFunction(() => document.getElementById("editor").value.includes("本机这一份。"), null, { timeout: 5000 });
  await D.clickGate("离线继续"); await D.wait(200);
  const { second } = await offlineWriteThree(D);
  await D.patchGate({ renew: "ok" });
  await D.eval(() => window.dispatchEvent(new Event("online")));
  await D.page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 10000 });
  check("问了", (await sheetFace(D)).title === "有 1 份只在这台设备，现在传上去？", JSON.stringify(await sheetFace(D)));
  await D.page.click("#sheetConfirm");
  check("从没传过的上云了", await waitCloudHas(w, second, "离线写的第二篇。"));
  check("传过的那篇续上了", await waitCloudHas(w, name, "离线写的第一篇。"));
  await D.wait(500);
  check("清零", (await D.eval(() => window.__xhw.store().files.dirty.count())) === 0);
  check("状态行如实说", /都传上去了/.test(await D.eval(() => document.getElementById("toast").textContent)), await D.eval(() => document.getElementById("toast").textContent));
  check("页面零报错", D.errors.length === 0, D.errors.join(" ; "));
  await D.close();
});

/** 等云端那份出现某段字（库的 dirty.count 不是「云端已经有了」的证据：推的途中就可能先归零，探针量过）。 */
async function waitCloudHas(w, name, text, timeout = 8000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (((await w.cloudText(name)) ?? "").includes(text)) return true; await new Promise((r) => setTimeout(r, 100)); } return false; }

scenario("回来 · 只有传过的：直接续传，不问（写作 app 心跳保存 = 同意传）", async (w) => {
  const { D, name } = await seedThenReopen(w, "A", { probing: true, renew: "interaction" }, true);
  await waitPhase(D, "blocked");
  await D.page.waitForFunction(() => document.getElementById("editor").value.includes("本机这一份。"), null, { timeout: 5000 });
  await D.clickGate("离线继续"); await D.wait(200);
  await D.type("离线续的一句。"); await D.wait(800);
  await D.eval(() => window.__xhw.newDraft()); await D.wait(400);   // 开着的换成空新稿：传过的那篇只能靠「回来」那一下补
  await waitBar(D, /还有 1 份没传上去/);
  await D.eval(() => { window.__sheetsSeen = 0; new MutationObserver(() => { if (!document.getElementById("sheet").classList.contains("hidden")) window.__sheetsSeen++; }).observe(document.getElementById("sheet"), { attributes: true, attributeFilter: ["class"] }); });
  await D.patchGate({ renew: "ok" });
  await D.eval(() => window.dispatchEvent(new Event("online")));
  check("续上了", await waitCloudHas(w, name, "离线续的一句。"), String(await w.cloudText(name)));
  await D.wait(500);
  check("清零", (await D.eval(() => window.__xhw.store().files.dirty.count())) === 0);
  const sheets = await D.eval(() => window.__sheetsSeen);
  check("没问", sheets === 0, String(sheets));
  check("页面零报错", D.errors.length === 0, D.errors.join(" ; "));
  await D.close();
});

scenario("闸门 离线态静默再试：online 事件不来也会回来；藏着不试；续签成了但云端不答 = 还是离线、不弹", async (w) => {
  const { D } = await seedThenReopen(w, "A", { probing: true, renew: "interaction" }, true);
  await waitPhase(D, "blocked");
  await D.eval(() => { window.__xhw.gateTune.offlineRetryMs = 300; });   // 探针把 60 s 拨成 300 ms（开定时器那一刻读）
  await D.clickGate("离线继续"); await D.wait(100);
  const a0 = (await D.gateView()).authCalls;
  await D.wait(1300);
  let v = await D.gateView();
  check("没发 online 事件：到点自己悄悄续签了好几次", v.authCalls - a0 >= 3, String(v.authCalls - a0));
  check("续签没成：条还在、不弹闸", !v.up && v.bar != null && !v.online, JSON.stringify(v));
  await D.hide(); await D.wait(100);
  const a1 = (await D.gateView()).authCalls;
  await D.wait(1300);
  check("藏到后台：一次都不试", (await D.gateView()).authCalls === a1, String((await D.gateView()).authCalls - a1));
  await D.patchGate({ renew: "ok", hangCloud: true });   // 续签能成（令牌可能是缓存的），但云端不答
  await D.show(); await D.wait(400);
  await D.wait(9000);   // 过 8 s 的硬超时
  v = await D.gateView();
  check("续签成了、云端不答：还是离线、条还在、不弹", !v.online && v.bar != null && !v.up, JSON.stringify(v));
  check("黑匣子写了「云端没答」", /reconnect: cloud did not answer/.test(await diagText(D)));
  await D.patchGate({ hangCloud: false });
  await D.page.waitForFunction(() => document.getElementById("offlineBar").classList.contains("hidden"), null, { timeout: 8000 });
  v = await D.gateView();
  check("云端答了：自己回来、条收掉（全程没发 online 事件）", v.online && v.bar === null && !v.up, JSON.stringify(v));
  const probes = () => D.eval(() => (window.__e2eCalls ?? []).filter((l) => l.includes(".reachable-probe")).length);
  const p0 = await probes(); await D.wait(1200);
  check("回来了就停表：之后不再问云端（.reachable-probe 不再涨）", (await probes()) === p0, `${p0} → ${await probes()}`);
  check("页面零报错", D.errors.length === 0, D.errors.join(" ; "));
  await D.close();
});

scenario("闸门 ③d 点常驻条 = 书库「要处理的」", async (w) => {
  const { D } = await seedThenReopen(w, "A", { probing: true, renew: "interaction" }, true);
  await waitPhase(D, "blocked");
  await D.page.waitForFunction(() => document.getElementById("editor").value.includes("本机这一份。"), null, { timeout: 5000 });
  await D.clickGate("离线继续"); await D.wait(200);
  await D.type("离线写的。"); await D.wait(800);
  await waitBar(D, /还有 1 份没传上去/);
  const stem = (await D.eval(() => window.__xhw.editor.state.name)).replace(/\.txt$/, "");
  await D.page.click("#offlineBar");
  await D.page.waitForFunction(() => !document.getElementById("galleryFull").classList.contains("hidden"), null, { timeout: 5000 });
  await D.wait(500);
  const seen = await D.eval(() => document.getElementById("galleryFull").innerText);
  console.log(`  书库里：${seen.replace(/\n/g, " / ").slice(0, 120)}`);
  check("书库开了，列着这一篇（没同步好的）", seen.includes(stem.slice(-4)), seen.slice(0, 200));
  check("页面零报错", D.errors.length === 0, D.errors.join(" ; "));
  await D.close();
});

scenario("闸门 ③b 「离线继续」不进任何存储：重开又走一遍", async (w) => {
  const { D } = await seedThenReopen(w, "A", { probing: true, renew: "interaction" }, true);
  await waitPhase(D, "blocked");
  await D.clickGate("离线继续"); await D.wait(200);
  check("选了离线", !(await D.eval(() => window.__xhw.cloudOnline())));
  const stored = await D.eval(() => JSON.stringify(Object.entries(localStorage)).includes("userOffline"));
  check("localStorage 里没有这个记忆", !stored);
  await D.bootRaw(server.url);
  await waitPhase(D, "blocked");
  const v = await D.gateView();
  check("刷新 = 重新走一遍（闸又来了、不是直接离线）", v.up && v.online === true && v.bar === null, JSON.stringify(v));
  await D.close();
});

scenario("闸门 ③c 重新登录：取消回到闸；去登录 → 放行", async (w) => {
  const { D } = await seedThenReopen(w, "A", { probing: true, renew: "interaction" }, true);
  await waitPhase(D, "blocked");
  await D.clickGate("重新登录");
  await D.page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 5000 });
  let v = await D.gateView();
  check("让开锁屏位，「去登录」那张面看得见", !v.up && v.phase === "blocked", JSON.stringify(v));
  const later = await D.eval(() => { const b = [...document.querySelectorAll("#sheetChoices button")].find((x) => /暂不|以后|later/i.test(x.textContent)); if (!b) return [...document.querySelectorAll("#sheetChoices button")].map((x) => x.textContent).join("|"); b.click(); return "ok"; });
  check("点暂不", later === "ok", later);
  await D.wait(200);
  v = await D.gateView();
  check("没跳走 = 回到闸", v.up && v.title === "网盘没连上", JSON.stringify(v));
  await D.clickGate("重新登录");
  await D.page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 5000 });
  const go = await D.eval(() => { const bs = [...document.querySelectorAll("#sheetChoices button")]; const b = bs.find((x) => x.classList.contains("primary")) ?? bs[0]; b.click(); return b.textContent; });
  console.log(`  点了：${go}`);
  await waitPhase(D, "open");
  await D.wait(200);
  v = await D.gateView();
  check("登录好了 → 放行、在线、没有条", !v.up && v.online && v.bar === null, JSON.stringify(v));
  check("页面零报错", D.errors.length === 0, D.errors.join(" ; "));
  await D.close();
});

scenario("闸门 ④ 没网：直接进闸，不等超时、不续签", async (w) => {
  const { D } = await seedThenReopen(w, "A", { probing: true, renew: "ok", net: false }, true);
  const t0 = Date.now();
  await waitPhase(D, "blocked", 3000);
  console.log(`  开页到进闸 ${Date.now() - t0} ms`);
  let v = await D.gateView();
  check("正文 = 现在没有网络", v.message === "现在没有网络", v.message);
  check("没去续签", v.authCalls === 0, String(v.authCalls));
  check("条不在（还没选离线）", v.bar === null);
  await D.clickGate("重新登录"); await D.wait(300);
  v = await D.gateView();
  check("没网时「重新登录」不跳走，还在闸上", v.up && v.phase === "blocked" && v.authCalls === 0, JSON.stringify(v));
  await D.net(true);
  await waitPhase(D, "open");
  v = await D.gateView();
  check("网回来了：闸门自己核完放行", !v.up && v.online, JSON.stringify(v));
  check("页面零报错", D.errors.length === 0, D.errors.join(" ; "));
  await D.close();
});

scenario("闸门 ⑤ 云端慢：先离线用 立刻放行", async (w) => {
  const { D } = await seedThenReopen(w, "A", { hangCloud: true }, false);
  await waitPhase(D, "checking", 5000);
  let v = await D.gateView();
  check("罩从一开始就有逃生钮", v.up && v.title === "正在核对网盘上的版本…" && v.buttons.join("|") === "先离线用", JSON.stringify(v));
  const t0 = Date.now();
  await D.clickGate("先离线用");
  await waitPhase(D, "open", 1000);
  console.log(`  点到放行 ${Date.now() - t0} ms`);
  v = await D.gateView();
  check("放行 + 条", !v.up && v.bar != null && !v.online, JSON.stringify(v));
  await D.page.waitForFunction(() => document.getElementById("editor").value.includes("本机这一份。"), null, { timeout: 5000 });
  check("本机那份摆出来了", true);
  await D.wait(300);   // 选之前已经在路上的不算（挂着）；看选了之后还有没有新发起的
  const before = await D.eval(() => window.__e2eCalls.length);
  await D.type("能写。"); await D.wait(300);
  check("能写", (await D.text()).includes("能写。"));
  await D.wait(16000);   // 过一个推云防抖（15 s）：选了离线就不该推
  await D.hide(); await D.wait(200); await D.net(false); await D.show(); await D.wait(600);
  await D.eval(() => window.__xhw.drawer.subscribe()); await D.wait(300);
  await D.eval(() => { const t = document.getElementById("wordCountToggle"); t.checked = !t.checked; t.dispatchEvent(new Event("change")); });   // 改一个偏好
  await D.wait(2000);   // 过库 collection 的推云防抖（1.5 s）
  const leak = (await D.eval(() => window.__e2eCalls)).slice(before);
  const collectionCalls = leak.filter((l) => /\.webxiaoheiwu\b/.test(l));
  check("登录着 + 选了离线：打字、切后台、回前台、刷列表，稿件这一路一条新请求都不发", leak.length === collectionCalls.length, leak.join(","));
  // store 2.2.3 的 collection 不看 isOnline（小黑屋工单 D 查出）；2.2.4 修了 = 这里转硬检查。
  const LIBRARY_COLLECTION_HONORS_ISONLINE = true;   // store 2.2.4 修了
  if (LIBRARY_COLLECTION_HONORS_ISONLINE) check("偏好 / 词库这一路也一条都不发", collectionCalls.length === 0, collectionCalls.join(","));
  else console.log(`  已知缺口（库的 collection 不看 isOnline）：选了离线后偏好 / 词库这一路还发了 ${collectionCalls.length} 条：${collectionCalls.join(", ")}`);
  await D.close();
});

scenario("闸门 ⑤b 云端慢：不点，8 s 自动进闸；云端回了自己放行", async (w) => {
  const { D } = await seedThenReopen(w, "A", { hangCloud: true }, false);
  await waitPhase(D, "checking", 5000);
  const t0 = Date.now();
  await waitPhase(D, "blocked", 12000);
  const dt = Date.now() - t0;
  console.log(`  罩到进闸 ${dt} ms`);
  check("不超过 10 s 进闸", dt < 10000, String(dt));
  check("是 8 s 的硬超时到点进的闸（黑匣子；轮询看到罩可能晚，不拿它量下限）", /no answer in 8000ms/.test(await diagText(D)));
  let v = await D.gateView();
  check("正文 = 网盘没有回应", v.message === "网盘没有回应", v.message);
  await D.patchGate({ hangCloud: false });
  await waitPhase(D, "open", 8000);
  v = await D.gateView();
  check("云端回了：不用人点，自己放行", !v.up && v.online && v.bar === null, JSON.stringify(v));
  check("页面零报错", D.errors.length === 0, D.errors.join(" ; "));
  await D.close();
});

scenario("闸门 ⑤c 没有稿可问时云端挂了：照样发现（不会因为没东西可比就放行）", async (w) => {
  const D = await w.device("A");
  await D.page.goto(server.url); await D.setGate({ hangCloud: true }, false);
  await D.bootRaw(server.url);
  await waitPhase(D, "blocked", 14000);
  const v = await D.gateView();
  check("新设备、没有稿：8 s 后进闸", v.up && v.message === "网盘没有回应", JSON.stringify(v));
  await D.clickGate("离线继续"); await D.wait(200);
  check("离线继续能进", (await D.gateView()).phase === "open");
  await D.close();
});

scenario("闸门 ⑥ 醒来：同一套流程；已选离线且仍没网不再弹闸", async (w) => {
  const { D } = await seedThenReopen(w, "A", {}, false, { raw: false });
  // 离开不久、一切正常：悄悄核一次，不罩
  await D.eval(() => { window.__gateTimes.length = 0; });
  const reads0 = CLOUD_READS(w);
  await D.hide(); await D.wait(100); await D.show(); await D.wait(500);
  check("离开不久：不罩（写作 app 不吃字）", (await D.eval(() => window.__gateTimes.length)) === 0);
  check("但确实问了云端", CLOUD_READS(w) > reads0, String(CLOUD_READS(w) - reads0));
  // 离开得久（闲置锁屏醒来）：先罩再核
  await D.eval(() => { window.__xhw.idle.show(); });
  await D.wait(100);
  await D.eval(() => window.__xhw.idle.dismiss()); await D.wait(300);
  const ups = (await D.eval(() => window.__gateTimes)).filter((x) => x.up);
  check("闲置锁屏醒来：罩过一下", ups.length === 1 && /核对/.test(ups[0].title), JSON.stringify(ups));
  // 会话中途令牌过期 + 醒来 → 闸
  await D.patchGate({ renew: "interaction" });
  await D.eval(() => window.__e2eExpire());
  await D.wait(100);
  check("过期的广播本身不弹闸（闸只在开机 / 醒来）", !(await D.gateView()).up);
  await D.hide(); await D.wait(100); await D.show();
  await waitPhase(D, "blocked", 5000);
  let v = await D.gateView();
  check("醒来发现过期 → 闸", v.up && v.message === "登录过期了", JSON.stringify(v));
  await D.clickGate("离线继续"); await D.wait(200);
  // 已选离线 + 没网：再醒来不弹闸
  await D.net(false); await D.wait(100);
  const authBefore = (await D.gateView()).authCalls;
  await D.hide(); await D.wait(100); await D.show(); await D.wait(400);
  v = await D.gateView();
  check("已选离线且仍没网：不弹闸、条还在", !v.up && v.phase === "open" && v.bar != null, JSON.stringify(v));
  check("也不去续签", v.authCalls === authBefore, String(v.authCalls - authBefore));
  // 有网了但续签还是不成：条还在、不弹闸（§2）
  await D.net(true); await D.wait(400);
  v = await D.gateView();
  check("回线、续签没成：条还在、不弹闸", !v.up && v.bar != null && !v.online, JSON.stringify(v));
  check("页面零报错", D.errors.length === 0, D.errors.join(" ; "));
  await D.close();
});

scenario("闸门 冲突面优先：核对时撞上真冲突，面归库，8 s 不抢", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const name = await seedTxt(w, A, B, "原文。");
  await B.type("B改的。"); await B.wait(500);   // B 落了本机、还没推
  await A.type("A改的。"); await A.wait(500); await A.pushNow(); await A.wait(300);
  await B.bootRaw(server.url);
  await B.page.waitForFunction(() => /云端|冲突|版本/.test(document.getElementById("gateTitle").textContent ?? "") && document.querySelectorAll("#gateActions button").length > 1, null, { timeout: 12000 });
  const face = await B.gateView();
  console.log(`  面：${face.title} / ${face.buttons.join("|")}`);
  check("是库的冲突面，不是闸门的", face.up && face.title !== "网盘没连上" && face.title !== "正在核对网盘上的版本…", JSON.stringify(face));
  await B.wait(9000);
  const later = await B.gateView();
  check("过了 8 s 面还在、没被闸门盖掉", later.up && later.title === face.title, JSON.stringify(later));
  await B.resolveGate(TAKE_CLOUD);
  await B.page.waitForFunction(() => window.__xhw.gate.phase() === "open" && document.getElementById("gateSheet").classList.contains("hidden"), null, { timeout: 8000 });
  await B.wait(500);
  check("选完放行、正文是云端那份", (await B.text()).includes("A改的。"), await B.text());
  const backup = await B.listBackup();
  check("输家进了备份箱（红线照旧）", backup.length >= 1, JSON.stringify(backup));
  check("云端赢家没被盖", ((await w.cloudText(name)) ?? "").includes("A改的。"));
  await A.close(); await B.close();
});

scenario("闸门 ⑧ 黑匣子：每次续签的结果和原因码都记着", async (w) => {
  const { D } = await seedThenReopen(w, "A", { probing: true, renew: "interaction" }, true);
  await waitPhase(D, "blocked");
  const fail = await diagText(D);
  check("失败：结果 + 耗时 + 原因码", /silent renew \(boot\): failed elapsed=\d+ms name=InteractionRequiredAuthError code=interaction_required/.test(fail), fail.slice(-400));
  check("init 也记（有没有家）", /init: signedIn=false probing=true home=true/.test(fail), fail.slice(-400));
  check("进闸的原因", /gate: blocked reason=expired/.test(fail), fail.slice(-300));
  await D.patchGate({ renew: "ok" });
  await D.bootRaw(server.url);
  await D.page.waitForFunction(() => window.__xhw.gate.phase() === "blocked" || window.__xhw.gate.phase() === "open", null, { timeout: 5000 });
  await D.close();
  const { D: E } = await seedThenReopen(w, "B", { probing: true, renew: "ok" }, true);
  await waitPhase(E, "open");
  await E.wait(200);
  const ok = await diagText(E);
  check("成功也记", /silent renew \(boot\): ok elapsed=\d+ms/.test(ok), ok.slice(-400));
  await E.close();
});

// ── 加密副产品取证（家族工单 D 第 2 步；2026-11-03，Claude Opus 5.5）：加密稿的字有没有以明文落在本机 / 云端任何地方──
/** 把本机所有 IDB（键和值）/ localStorage / sessionStorage / Cache Storage 翻一遍找这串字节；回命中的位置。 */
const scanDevice = (D, marker) => D.page.evaluate(async (m) => {
  const needle = new TextEncoder().encode(m);
  const has = (u8) => { outer: for (let i = 0; i <= u8.length - needle.length; i++) { for (let j = 0; j < needle.length; j++) if (u8[i + j] !== needle[j]) continue outer; return true; } return false; };
  const found = async (v, depth = 0) => {
    if (v == null || depth > 8) return false;
    if (typeof v === "string") return has(new TextEncoder().encode(v));
    if (v instanceof Blob) return has(new Uint8Array(await v.arrayBuffer()));
    if (v instanceof ArrayBuffer) return has(new Uint8Array(v));
    if (ArrayBuffer.isView(v)) return has(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    if (typeof CryptoKey !== "undefined" && v instanceof CryptoKey) return false;
    if (Array.isArray(v)) { for (const x of v) if (await found(x, depth + 1)) return true; return false; }
    if (typeof v === "object") { for (const x of Object.values(v)) if (await found(x, depth + 1)) return true; return false; }
    return false;
  };
  const hits = []; const seen = { dbs: [], records: 0 };
  for (const { name } of await indexedDB.databases()) {
    seen.dbs.push(name);
    const db = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    for (const storeName of db.objectStoreNames) {
      const rows = await new Promise((res, rej) => { const out = []; const c = db.transaction(storeName).objectStore(storeName).openCursor(); c.onsuccess = () => { const cur = c.result; if (!cur) return res(out); out.push([cur.key, cur.value]); cur.continue(); }; c.onerror = () => rej(c.error); });
      for (const [k, v] of rows) { seen.records++; if (await found(k) || await found(v)) hits.push(`idb ${name}/${storeName}/${String(k).slice(0, 60)}`); }
    }
    db.close();
  }
  for (const [label, st] of [["localStorage", localStorage], ["sessionStorage", sessionStorage]]) for (let i = 0; i < st.length; i++) { const k = st.key(i); seen.records++; if (has(new TextEncoder().encode(k + "\n" + st.getItem(k)))) hits.push(`${label} ${k}`); }
  for (const cn of await caches.keys()) { const c = await caches.open(cn); for (const req of await c.keys()) { seen.records++; const r = await c.match(req); if (r && has(new Uint8Array(await r.clone().arrayBuffer()))) hits.push(`cache ${cn} ${req.url}`); } }
  return { hits, seen };
}, marker);
const scanCloud = async (w, marker) => {
  const out = []; const needle = Buffer.from(marker);
  const walk = async (folder) => { for (const it of await w.provider.list(folder)) { if (it.isFolder) { await walk(it.path); continue; } const b = await w.cloudBytes(it.path); if (b && Buffer.from(b).includes(needle)) out.push(it.path); } };
  await walk("");
  return out;
};

scenario("加密副产品：加密稿的字不以明文落在本机 / 云端任何地方（含冲突备份箱、黑匣子）", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const PLAIN = "PLAINCTRLMARK4417", SECRET = "ZZSECRETMARK7731", LOSER = "ZZLOSERMARK9052", PW = "e2e-pw-MARK3388";
  await A.boot(server.url);
  await A.type(PLAIN); await A.wait(800);   // 正控制：没加密的稿，翻得出来才说明这套扫描不是空转
  const ctrl = await scanDevice(A, PLAIN);
  console.log(`  翻了 ${ctrl.seen.records} 条（库：${ctrl.seen.dbs.join(", ")}）`);
  check("正控制：明文稿翻得出来", ctrl.hits.length > 0, JSON.stringify(ctrl));
  await A.eval((p) => window.__xhw.setPassword(p), PW); await A.wait(200);
  await A.eval(() => window.__xhw.newDraft({ encrypted: true })); await A.wait(500);
  await A.type(SECRET); await A.wait(1000);
  await A.pushNow(); await A.wait(500);
  const name = await A.eval(() => window.__xhw.editor.state.name);
  check("这一篇是加密稿", await A.eval(() => window.__xhw.editor.state.encrypted));
  const a1 = await scanDevice(A, SECRET);
  check("A 本机（IDB / localStorage / Cache）翻不到正文", a1.hits.length === 0, a1.hits.join(" ; "));
  const c1 = await scanCloud(w, SECRET);
  check("云端翻不到正文", c1.length === 0, c1.join(" ; "));
  const p1 = await scanDevice(A, PW);
  check("本机翻不到口令（没选记住）", p1.hits.length === 0, p1.hits.join(" ; "));
  // 冲突：B 选「云端覆盖本地」，输家进 B 本机备份箱
  await B.boot(server.url); await B.wait(500);
  await B.eval((p) => window.__xhw.setPassword(p), PW); await B.wait(200);
  await B.eval((n) => window.__xhw.openAny(n), name); await B.wait(800);
  await B.type(LOSER); await B.wait(800);
  await A.type("A又改了。"); await A.wait(500); await A.pushNow(); await A.wait(500);
  void B.pushNow();
  await B.resolveGate(TAKE_CLOUD, 15000); await B.wait(1000);
  const backup = await B.listBackup();
  check("输家进了备份箱", backup.length >= 1, JSON.stringify(backup));
  const b1 = await scanDevice(B, LOSER);
  check("备份箱里也是密文（B 本机翻不到输家的字）", b1.hits.length === 0, b1.hits.join(" ; "));
  const b2 = await scanDevice(B, SECRET);
  check("B 本机翻不到 A 写的正文", b2.hits.length === 0, b2.hits.join(" ; "));
  const c2 = await scanCloud(w, LOSER);
  check("云端翻不到输家的字", c2.length === 0, c2.join(" ; "));
  check("页面零报错", [...A.errors, ...B.errors].length === 0, [...A.errors, ...B.errors].join(" ; "));
  await A.close(); await B.close();
});

// ── 词库（家族工单 D2；2026-11-03，Claude Opus 5.5；Fable 11-03 裁定：加密稿学到的词只进内存）──
const NOT_NATIVE = "webxiaoheiwu-7c2e9a41b3d05f68:imeEnabled";
const withIme = async (D) => { await D.ctx.addInitScript((k) => { localStorage.removeItem(k); }, NOT_NATIVE); };
const waitIme = (D) => D.page.waitForFunction(() => window.__xhw.ime?.initialized, null, { timeout: 60000 });
const typePinyin = async (D, syllables) => { await D.page.evaluate(() => document.getElementById("editor").focus()); for (const syl of syllables) { await D.page.keyboard.type(syl, { delay: 25 }); await D.wait(120); await D.page.keyboard.press("Space"); await D.wait(180); } await D.wait(300); };
/** IndexedDB /rime 里每个文件的字节（不看时间戳）。 */
const rimeOnDisk = (D) => D.page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("/rime"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const out = {};
  try {
    const st = db.transaction("FILE_DATA").objectStore("FILE_DATA");
    await new Promise((res, rej) => { const c = st.openCursor(); c.onsuccess = () => { const cur = c.result; if (!cur) return res(); const v = cur.value; if (v.contents) { const u = new Uint8Array(v.contents.buffer ?? v.contents, v.contents.byteOffset ?? 0, v.contents.byteLength); out[String(cur.key)] = btoa(String.fromCharCode(...u)); } cur.continue(); }; c.onerror = () => rej(c.error); });
  } finally { db.close(); }
  return out;
});
const decodedHas = (files, ch) => Object.values(files).some((b64) => Buffer.from(b64, "base64").includes(Buffer.from(ch)));
const stable = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
const memoryDump = (D) => D.page.evaluate(async () => { const d = await window.__xhw.ime.dumpUserDir(); return Object.fromEntries((d?.files ?? []).map((f) => [f.path, f.data])); });
const cloudDict = async (w) => { const b = await w.cloudBytes(".webxiaoheiwu/rime-user-dict.json"); if (!b) return { raw: null, files: {} }; const raw = Buffer.from(b).toString("hex"); try { const env = JSON.parse(Buffer.from(b).toString("utf8")); const dump = (env.items ?? []).find((x) => x.id === "dump")?.value; return { raw, dump, files: Object.fromEntries((dump?.files ?? []).map((f) => [f.path, f.data])) }; } catch { return { raw, files: {} }; } };
const pushDict = async (D) => { await D.hide(); await D.wait(2600); await D.show(); await D.wait(400); };

scenario("词库：加密稿里学到的词只进内存，不落 /rime、不进同步文件；关稿即忘；明文稿照旧", async (w) => {
  const D = await w.device("A");
  await withIme(D);
  await D.boot(server.url); await waitIme(D); await D.wait(400);
  await typePinyin(D, ["ni", "hao"]);   // 最后一个词挂在没提交的事务里（下一次上屏 / 关库才写）：打两个，第一个一定落下来
  const plainChar = (await D.text()).trim().slice(0, 1), plainLast = (await D.text()).trim().slice(-1);
  await pushDict(D);
  const disk0 = await rimeOnDisk(D), cloud0 = await cloudDict(w);
  check("正控制：明文稿学到的字落盘了", decodedHas(disk0, plainChar), plainChar);
  check("正控制：明文稿学到的字进了同步文件", decodedHas(cloud0.files, plainChar), plainChar);

  await D.eval(() => window.__xhw.setPassword("e2e-pw")); await D.wait(200);
  await D.eval(() => window.__xhw.newDraft({ encrypted: true })); await D.wait(800);
  check("开加密稿 → 开关开了", await D.eval(() => window.__xhw.ime.memoryOnly));
  const diskAtEnter = await rimeOnDisk(D);   // 进的那一下会把前面明文稿挂着的词落盘（那是明文的词）：从这里起一个字节都不许再变
  check("进的时候明文挂着的词落盘了", decodedHas(diskAtEnter, plainLast), plainLast);
  await typePinyin(D, ["hei", "mi"]);
  const secret = [...(await D.text()).trim()];
  console.log(`  加密稿里打了：${secret.join("")}`);
  check("打出来了（中文）", secret.length === 2 && secret.every((c) => /[一-鿿]/.test(c)), secret.join(""));
  const mem = await memoryDump(D);
  check("内存层学到了（本次会话能联想）", secret.some((c) => decodedHas(mem, c)), Object.keys(mem).join(","));
  const disk1 = await rimeOnDisk(D);
  check("/rime 字节一点没变", stable(disk1) === stable(diskAtEnter), `${Object.keys(diskAtEnter).length} → ${Object.keys(disk1).length} 个文件`);
  await pushDict(D);
  const disk2 = await rimeOnDisk(D), cloud1 = await cloudDict(w);
  check("切后台之后 /rime 还是没变", stable(disk2) === stable(diskAtEnter));
  check("同步文件字节一点没变", cloud1.raw === cloud0.raw);

  await D.eval(() => window.__xhw.newDraft()); await D.wait(800);
  check("关稿 → 开关关了", !(await D.eval(() => window.__xhw.ime.memoryOnly)));
  const mem2 = await memoryDump(D);
  check("关稿即忘：内存层也没有了", !secret.some((c) => decodedHas(mem2, c)), secret.filter((c) => decodedHas(mem2, c)).join(""));
  check("之前明文稿学到的还在", decodedHas(mem2, plainChar));
  check("进加密稿之前挂着的那个词也没丢（进的时候先提交了）", decodedHas(mem2, plainLast), plainLast);
  await typePinyin(D, ["shui", "jiao", "de"]);   // 重开后第一个词不进日志（librime 的行为，探针量过），最后一个还挂着：看中间那个
  const plain2 = (await D.text()).trim().slice(1, 2);
  await pushDict(D);
  const disk3 = await rimeOnDisk(D), cloud2 = await cloudDict(w);
  check("明文稿照旧：新学的落盘", decodedHas(disk3, plain2), plain2);
  check("明文稿照旧：新学的进同步文件", decodedHas(cloud2.files, plain2), plain2);
  check("加密稿的字没有跟着落盘", !secret.some((c) => decodedHas(disk3, c)), secret.filter((c) => decodedHas(disk3, c)).join(""));
  check("加密稿的字没有跟着上云", !secret.some((c) => decodedHas(cloud2.files, c)), secret.filter((c) => decodedHas(cloud2.files, c)).join(""));
  // 重开：词库完好，能接着用
  await D.boot(server.url); await waitIme(D); await D.wait(400);
  const mem3 = await memoryDump(D);
  check("重开后明文学到的还在", decodedHas(mem3, plain2));
  check("重开后加密稿的字不在", !secret.some((c) => decodedHas(mem3, c)));
  check("页面零报错", D.errors.length === 0, D.errors.join(" ; "));
  await D.close();
});

scenario("词库：清空用户词库（入口 + 说明；默认不自动清；别的设备跟着清、不会传回来）", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  await withIme(A); await withIme(B);
  await A.boot(server.url); await waitIme(A); await A.wait(400);
  await typePinyin(A, ["hei", "mi"]);   // 同上：第一个一定落下来
  const ch = (await A.text()).trim().slice(0, 1);
  await pushDict(A);
  check("没点之前没有自动清", decodedHas((await cloudDict(w)).files, ch), ch);
  await B.boot(server.url); await waitIme(B); await B.wait(1500);
  await B.eval(() => window.dispatchEvent(new Event("online"))); await B.wait(1500);
  check("B 同步到了这个词（前提）", decodedHas(await memoryDump(B), ch));
  await A.eval(() => document.getElementById("clearUserDictButton").click());
  await A.page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 5000 });
  const msg = await A.eval(() => document.getElementById("sheetMessage").textContent);
  console.log(`  说明：${msg.slice(0, 60)}…`);
  check("点了先说明（可取消）", /网盘/.test(msg) && /加密稿/.test(msg), msg);
  await A.page.click("#sheetCancel"); await A.wait(300);
  check("取消 = 没动", decodedHas(await memoryDump(A), ch));
  await A.eval(() => document.getElementById("clearUserDictButton").click());
  await A.page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 5000 });
  await A.page.click("#sheetConfirm"); await A.wait(1500);
  check("A 内存里没了", !decodedHas(await memoryDump(A), ch));
  check("A /rime 里没了", !decodedHas(await rimeOnDisk(A), ch));
  await A.wait(2500);   // 库 collection 的推云防抖
  const c = await cloudDict(w);
  check("同步文件里没了、带着清空的时刻", !decodedHas(c.files, ch) && !!c.dump?.clearedAt, JSON.stringify(c.dump ?? null).slice(0, 120));
  await typePinyin(A, ["shui", "jiao", "de"]);
  const after = (await A.text()).trim().slice(-2, -1);
  check("清完还能打、接着学", decodedHas(await memoryDump(A), after), after);
  await B.eval(() => window.dispatchEvent(new Event("online"))); await B.wait(2500);
  check("B 跟着清了", !decodedHas(await memoryDump(B), ch));
  await pushDict(B); await B.wait(2000);
  check("B 没把旧词传回来", !decodedHas((await cloudDict(w)).files, ch));
  check("页面零报错", [...A.errors, ...B.errors].length === 0, [...A.errors, ...B.errors].join(" ; "));
  await A.close(); await B.close();
});

/** 开机用不用内置输入法跟着 localStorage 的 e2eSystemIme 走（同一台设备能先用内置输入法、再重开成系统输入法）。 */
const withImeSwitch = async (D) => { await D.ctx.addInitScript((k) => { if (localStorage.getItem("e2eSystemIme") === "1") localStorage.setItem(k, "0"); else localStorage.removeItem(k); }, NOT_NATIVE); };

scenario("词库：用系统输入法时清空入口照样看得见；先清网盘那一份，这台的等内置输入法加载时跟上、不传回去（v3.0.16）", async (w) => {
  const A = await w.device("A");
  await withImeSwitch(A);
  await A.boot(server.url); await waitIme(A); await A.wait(400);
  await typePinyin(A, ["hei", "mi"]);
  const ch = (await A.text()).trim().slice(0, 1);
  await pushDict(A);
  check("前提：词进了同步文件", decodedHas((await cloudDict(w)).files, ch), ch);
  await A.eval(() => localStorage.setItem("e2eSystemIme", "1"));
  await A.boot(server.url); await A.wait(800);
  check("重开成系统输入法：内置输入法没加载", !(await A.eval(() => window.__xhw.ime.initialized)));
  await A.eval(() => window.__xhw.setSidebar(true)); await A.wait(200);
  await A.eval(() => document.getElementById("edgeSettings").click()); await A.wait(300);
  await A.eval(() => { document.getElementById("imeSection").open = true; }); await A.wait(150);
  const vis = await A.eval((src) => { const shown = new Function("id", src); return { builtinHidden: document.getElementById("imeBuiltinOptions").hidden, btn: shown("clearUserDictButton"), enc: shown("clearEncDictButton"), schema: shown("imeSchemaSelect"), label: document.getElementById("clearUserDictButton").textContent }; }, `const el = document.getElementById(id); const r = el.getBoundingClientRect(); return el.offsetParent !== null && r.width > 0 && r.height > 0;`);
  check("设置 → 输入法：内置输入法那一组藏着（方案选单看不见），清空的两个钮看得见", vis.builtinHidden && !vis.schema && vis.btn && vis.enc, JSON.stringify(vis));
  await A.eval(() => document.getElementById("edgeSettingsBack").click()); await A.eval(() => window.__xhw.setSidebar(false)); await A.wait(200);
  check("钮上写清是哪本：明文", /明文/.test(vis.label), vis.label);
  await A.eval(() => document.getElementById("clearUserDictButton").click());
  await A.page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 5000 });
  const st = await sheetFace(A);
  check("二次确认 = app 自己的面，说清是明文那本、加密词库不动、这台的等下次加载", /明文/.test(st.title) && /加密词库不动/.test(st.message) && /系统输入法/.test(st.message), `${st.title} / ${st.message}`);
  await A.page.click("#sheetConfirm"); await A.wait(2500);
  const c = await cloudDict(w);
  check("网盘那一份清了、带清空的时刻", !decodedHas(c.files, ch) && !!c.dump?.clearedAt, JSON.stringify(c.dump ?? null).slice(0, 120));
  check("这台的 /rime 还没动（没加载的引擎不碰）", decodedHas(await rimeOnDisk(A), ch));
  await A.eval(() => window.__xhw.setImeEnabled(true)); await waitIme(A); await A.wait(2000);
  check("打开内置输入法：这台跟上清了（内存里）", !decodedHas(await memoryDump(A), ch));
  check("打开内置输入法：这台跟上清了（/rime）", !decodedHas(await rimeOnDisk(A), ch));
  await pushDict(A); await A.wait(2000);
  check("没把旧词传回去", !decodedHas((await cloudDict(w)).files, ch));
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

scenario("词库：开着加密稿时中途打开内置输入法 = 一起来就只进内存（回归：开关早在加载前就排进输入法队列）", async (w) => {
  const A = await w.device("A");
  await withImeSwitch(A);
  await A.page.goto(server.url); await A.eval(() => localStorage.setItem("e2eSystemIme", "1"));
  await A.boot(server.url);
  await A.eval(() => window.__xhw.setPassword("e2e-pw")); await A.wait(200);
  await A.eval(() => window.__xhw.newDraft({ encrypted: true })); await A.wait(800);
  check("前提：内置输入法没加载、开着加密稿", !(await A.eval(() => window.__xhw.ime.initialized)) && (await A.eval(() => window.__xhw.editor.state.encrypted)));
  await A.eval(() => window.__xhw.setImeEnabled(true)); await waitIme(A);
  check("一起来就是只进内存", await A.eval(() => window.__xhw.ime.memoryOnly));
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

// ── 先封再存（家族工单 D2；Fable 11-03 裁定：加密稿从建到存，IndexedDB 里出现过的每个字节串都是容器）──
const IDB_SPY = () => {
  window.__idbWrites = [];
  const findBytes = (v, d = 0) => { if (v instanceof Blob || v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return v; if (v && typeof v === "object" && d < 3) for (const x of Object.values(v)) { const r = findBytes(x, d + 1); if (r) return r; } return null; };
  for (const m of ["put", "add"]) {
    const real = IDBObjectStore.prototype[m];
    IDBObjectStore.prototype[m] = function (value, key) {
      try { const bytes = findBytes(value); if (bytes) window.__idbWrites.push({ db: this.transaction.db.name, store: this.name, key: String(key ?? ""), bytes: bytes instanceof Blob ? bytes : new Blob([bytes]) }); } catch { /* 探针不许影响业务 */ }
      return real.call(this, value, key);
    };
  }
};
/** 翻探针记下的每一笔：键里带 needle 的是不是都是容器；所有库里有没有出现过 marker。 */
const auditWrites = (D, keyRe, markers = []) => D.page.evaluate(async ([src, ms]) => {
  const re = new RegExp(src), enc = new TextEncoder();
  const has = (u8, m) => { const n = enc.encode(m); outer: for (let i = 0; i <= u8.length - n.length; i++) { for (let j = 0; j < n.length; j++) if (u8[i + j] !== n[j]) continue outer; return true; } return false; };
  const out = { matched: 0, sealed: 0, plainKeys: [], markerHits: [], total: window.__idbWrites.length };
  for (const w of window.__idbWrites) {
    const u8 = new Uint8Array(await w.bytes.arrayBuffer());
    for (const m of ms) if (has(u8, m)) out.markerHits.push(`${m} @ ${w.db}/${w.store}/${w.key}`);
    if (re.test(w.key) && w.db.startsWith("webxiaoheiwu.") && u8.length > 0) { out.matched++; if (await window.__xhw.looksEncrypted(u8)) out.sealed++; else out.plainKeys.push(`${w.store}/${w.key}`); }
  }
  return out;
}, [keyRe.source, markers]);
const clearWrites = (D) => D.eval(() => { window.__idbWrites.length = 0; });

scenario("先封再存：新建加密稿 / 拆新书 / 新书勾加密 / 加密书导出到书库，IndexedDB 里出现过的每个字节串都是容器", async (w) => {
  const D = await w.device("A");
  await D.ctx.addInitScript(IDB_SPY);
  await D.boot(server.url);
  await D.type("PLAINCTRL4417"); await D.wait(800);
  const plainName = await D.eval(() => window.__xhw.editor.state.name);
  const ctrl = await auditWrites(D, new RegExp(plainName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), ["PLAINCTRL4417"]);
  check("正控制：探针抓得到明文稿的写入、认得出不是容器", ctrl.matched > 0 && ctrl.plainKeys.length > 0 && ctrl.markerHits.length > 0, JSON.stringify(ctrl));
  await D.eval(() => window.__xhw.setPassword("e2e-pw")); await D.wait(200);

  // ① 新建加密稿
  await clearWrites(D);
  await D.eval(() => window.__xhw.newDraft({ encrypted: true })); await D.wait(400);
  await D.type("ZZSEALMARK1188"); await D.wait(900);
  const n1 = await D.eval(() => window.__xhw.editor.state.name);
  check("新建加密稿落成了", !!n1 && (await D.eval((n) => window.__xhw.store().file(n, { mode: "existing" }).open().then((b) => b?.text()), n1)) === "ZZSEALMARK1188", String(n1));
  await D.type("再写一点"); await D.wait(800);
  const a1 = await auditWrites(D, new RegExp(n1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), ["ZZSEALMARK1188", "再写一点"]);
  console.log(`  新建加密稿：${a1.matched} 笔写入，${a1.sealed} 笔是容器`);
  check("新建加密稿：每一笔都是容器", a1.matched > 0 && a1.sealed === a1.matched, JSON.stringify(a1.plainKeys));
  check("新建加密稿：任何库里都没出现过明文", a1.markerHits.length === 0, a1.markerHits.join(" ; "));
  await D.wait(200);
  await D.pushNow(); await D.wait(500);
  const cloudNames = (await w.cloudList("")).map((i) => i.name);
  check("推上云的是加密容器名", cloudNames.some((x) => x.endsWith(".zip") && x.startsWith(n1.replace(/\.txt$/, ""))), cloudNames.join(","));

  // ② 拆新书（加密稿 → 书）
  await clearWrites(D);
  const lifting = D.eval(() => window.__xhw.liftDraft());
  await D.page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 5000 });
  await D.page.click("#sheetConfirm");
  check("拆新书成功", await lifting);
  await D.wait(800);
  const n2 = await D.eval(() => window.__xhw.project.name());
  check("新书是加密的", await D.eval(() => window.__xhw.project.encrypted()), String(n2));
  const a2 = await auditWrites(D, new RegExp(n2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), ["ZZSEALMARK1188"]);
  console.log(`  拆新书：${a2.matched} 笔写入，${a2.sealed} 笔是容器`);
  check("拆新书：每一笔都是容器", a2.matched > 0 && a2.sealed === a2.matched, JSON.stringify(a2.plainKeys));
  check("拆新书：任何库里都没出现过明文", a2.markerHits.length === 0, a2.markerHits.join(" ; "));

  // ③ 加密书导出到书库
  await clearWrites(D);
  const pageName = await D.eval(() => window.__xhw.project.current());
  const exporting = D.eval((p) => window.__xhw.exportBranchFlow(p), pageName);
  await D.page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 5000 });
  await D.eval(() => { document.getElementById("sheetInput").value = "导出的这一支"; document.getElementById("sheetInput").dispatchEvent(new Event("input", { bubbles: true })); });
  await D.page.click("#sheetConfirm"); await exporting; await D.wait(800);
  const a3 = await auditWrites(D, /导出的这一支/, ["ZZSEALMARK1188"]);
  console.log(`  导出到书库：${a3.matched} 笔写入，${a3.sealed} 笔是容器`);
  check("导出到书库：每一笔都是容器", a3.matched > 0 && a3.sealed === a3.matched, JSON.stringify(a3.plainKeys));
  check("导出到书库：任何库里都没出现过明文", a3.markerHits.length === 0, a3.markerHits.join(" ; "));

  // ④ 新书勾加密
  await clearWrites(D);
  const making = D.eval(() => window.__xhw.newProject());
  await D.page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 5000 });
  await D.eval(() => { document.getElementById("sheetInput").value = "勾了加密的书"; document.getElementById("sheetInput").dispatchEvent(new Event("input", { bubbles: true })); const c = document.getElementById("sheetCheckInput"); if (!c.checked) c.click(); });
  await D.page.click("#sheetConfirm"); await making; await D.wait(800);
  const n4 = await D.eval(() => window.__xhw.project.name());
  check("新书叫这个名字、是加密的", /勾了加密的书/.test(n4 ?? "") && await D.eval(() => window.__xhw.project.encrypted()), String(n4));
  await D.type("ZZBOOKMARK2299"); await D.wait(1500);
  await D.eval(() => window.__xhw.project.flushLocal?.()); await D.wait(500);
  const a4 = await auditWrites(D, /勾了加密的书/, ["ZZBOOKMARK2299"]);
  console.log(`  新书勾加密：${a4.matched} 笔写入，${a4.sealed} 笔是容器`);
  check("新书勾加密：每一笔都是容器", a4.matched > 0 && a4.sealed === a4.matched, JSON.stringify(a4.plainKeys));
  check("页面零报错", D.errors.length === 0, D.errors.join(" ; "));
  await D.close();
});

scenario("先封再存：没有口令 = 不建、不写，字还在编辑器里，解锁后下次落盘写成密文", async (w) => {
  const D = await w.device("A");
  await D.ctx.addInitScript(IDB_SPY);
  await D.boot(server.url);
  await D.eval(() => window.__xhw.setPassword("e2e-pw")); await D.wait(200);
  await D.eval(() => window.__xhw.newDraft({ encrypted: true })); await D.wait(400);
  await clearWrites(D);
  await D.eval(() => window.__xhw.lockNow()); await D.wait(300);   // 口令没了（立即锁定）
  await D.type("ZZNOPWMARK3377"); await D.wait(900);
  const a = await auditWrites(D, /./, ["ZZNOPWMARK3377"]);
  check("没写：任何库里都没有这些字", a.markerHits.length === 0, a.markerHits.join(" ; "));
  check("没建稿", (await D.eval(() => window.__xhw.editor.state.name)) == null);
  check("字还在编辑器里", (await D.text()).includes("ZZNOPWMARK3377"), await D.text());
  check("存的状态说了实话（不是「已存」）", await D.eval(() => document.getElementById("saveButton")?.dataset?.kind === "encryptPending" || /加密还没成功/.test(document.body.innerText)));
  await D.eval(() => window.__xhw.setPassword("e2e-pw")); await D.wait(100);
  await D.type("X"); await D.wait(900);
  const n = await D.eval(() => window.__xhw.editor.state.name);
  check("有口令之后落成了", !!n, String(n));
  const b = await auditWrites(D, /./, ["ZZNOPWMARK3377"]);
  check("落成的也是密文", b.markerHits.length === 0, b.markerHits.join(" ; "));
  await D.close();
});

scenario("第二台设备第一次开加密稿 / 加密书：认得出是加密的（解锁着开也一样）", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  await A.boot(server.url);
  await A.eval(() => window.__xhw.setPassword("e2e-pw")); await A.wait(200);
  await A.eval(() => window.__xhw.newDraft({ encrypted: true })); await A.wait(400);
  await A.type("加密稿。"); await A.wait(800); await A.pushNow(); await A.wait(500);
  const txt = await A.eval(() => window.__xhw.editor.state.name);
  const making = A.eval(() => window.__xhw.newProject());
  await A.page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 5000 });
  await A.eval(() => { document.getElementById("sheetInput").value = "加密的书"; document.getElementById("sheetInput").dispatchEvent(new Event("input", { bubbles: true })); const c = document.getElementById("sheetCheckInput"); if (!c.checked) c.click(); });
  await A.page.click("#sheetConfirm"); await making; await A.wait(800);
  await A.type("书里的字。"); await A.wait(800); await A.pushNow(); await A.wait(800);
  const book = await A.eval(() => window.__xhw.project.name());
  check("云端都是容器名", (await w.cloudList("")).filter((i) => !i.isFolder && !i.name.startsWith(".")).every((i) => /\.zip$/.test(i.name)), JSON.stringify((await w.cloudList("")).map((i) => i.name)));
  await B.boot(server.url); await B.wait(500);
  await B.eval(() => window.__xhw.setPassword("e2e-pw")); await B.wait(200);
  await B.eval((n) => window.__xhw.openAny(n), txt); await B.wait(800);
  let st = await B.eval(() => window.__xhw.editor.state);
  check("加密稿：解锁着第一次开，认得出是加密的", st.encrypted === true && st.locked === false && (await B.text()) === "加密稿。", JSON.stringify(st));
  check("加密稿：输入法开关开了", await B.eval(() => window.__xhw.ime.memoryOnly));
  await B.eval((n) => window.__xhw.openAny(n), book); await B.wait(1000);
  check("加密书：解锁着第一次开，认得出是加密的", await B.eval(() => window.__xhw.project.encrypted() && !window.__xhw.project.locked()), String(await B.eval(() => window.__xhw.project.encrypted())));
  check("加密书：输入法开关开了", await B.eval(() => window.__xhw.ime.memoryOnly));
  await B.eval(() => window.__xhw.newDraft()); await B.wait(500);
  check("换到明文稿：开关关了", !(await B.eval(() => window.__xhw.ime.memoryOnly)));
  check("页面零报错", [...A.errors, ...B.errors].length === 0, [...A.errors, ...B.errors].join(" ; "));
  await A.close(); await B.close();
});

scenario("先封再存：加密稿冲突留底（上传途中打的字）从建到存都是容器", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  await B.ctx.addInitScript(IDB_SPY);
  await A.boot(server.url);
  await A.eval(() => window.__xhw.setPassword("e2e-pw")); await A.wait(200);
  await A.eval(() => window.__xhw.newDraft({ encrypted: true })); await A.wait(400);
  await A.type("原文。"); await A.wait(800); await A.pushNow(); await A.wait(500);
  const name = await A.eval(() => window.__xhw.editor.state.name);
  await B.boot(server.url); await B.wait(500);
  await B.eval(() => window.__xhw.setPassword("e2e-pw")); await B.wait(200);
  await B.eval((n) => window.__xhw.openAny(n), name); await B.wait(800);
  await A.type("A改了。"); await A.wait(500); await A.pushNow(); await A.wait(300);
  await B.type("B也改了。"); await B.wait(500);
  check("B 开的确实是加密稿（前提）", await B.eval(() => window.__xhw.editor.state.encrypted && !window.__xhw.editor.state.locked), JSON.stringify(await B.eval(() => window.__xhw.editor.state)));
  let release; w.gate.holdUploads = new Promise((r) => (release = r));
  const push = B.pushNow(); await B.wait(300);
  await B.type("ZZRESCUEMARK5566"); await B.wait(100);
  w.gate.holdUploads = null; release();
  await B.resolveGate(TAKE_CLOUD); await push.catch(() => {}); await B.wait(1500);
  const a = await auditWrites(B, /留底/, ["ZZRESCUEMARK5566"]);
  console.log(`  留底：${a.matched} 笔写入，${a.sealed} 笔是容器`);
  check("有留底，每一笔都是容器", a.matched > 0 && a.sealed === a.matched, JSON.stringify(a));
  check("任何库里都没出现过途中打的字的明文", a.markerHits.length === 0, a.markerHits.join(" ; "));
  const local = await B.eval(async () => { const out = []; const s = window.__xhw.store(); await new Promise((res) => { const un = s.files.watchFolder("", (snap) => { out.push(...snap.items.map((i) => i.identifier)); setTimeout(() => { un(); res(); }, 0); }); }); return out; });
  const rescue = local.find((n) => /留底/.test(n));
  const txt = await B.eval((n) => window.__xhw.store().file(n, { mode: "existing" }).open().then((b) => b?.text() ?? null), rescue);
  check("留底能开、里面有途中打的字", (txt ?? "").includes("ZZRESCUEMARK5566"), String(txt));
  check("页面零报错", [...A.errors, ...B.errors].length === 0, [...A.errors, ...B.errors].join(" ; "));
  await A.close(); await B.close();
});

// ── 加密词库（家族工单 D3）：真 RIME 重放我们写的日志 + 真容器 + 两台设备 ──
const encLoaded = (D) => D.page.waitForFunction(() => window.__xhw.encDict.loaded(), null, { timeout: 20000 });
const openEnc = async (D) => { await D.eval(() => window.__xhw.newDraft({ encrypted: true })); await D.wait(300); await encLoaded(D); await D.wait(200); };
/** 打一个音节但不上屏，看候选排第几（-1 = 这一页没有）。 */
const candidates = async (D, syl) => {
  await D.page.evaluate(() => document.getElementById("editor").focus());
  await D.page.keyboard.type(syl, { delay: 25 }); await D.wait(150);
  const list = await D.eval(() => window.__xhw.ime.getState().candidates);
  await D.page.keyboard.press("Escape"); await D.wait(120);
  return list;
};
/** 选这个音节候选里的第 n 个上屏（数字键）。前后各打一个垫字：重开后第一个词不进日志、最后一个挂着（探针量过）。 */
const learnNth = async (D, syl, n) => {
  await typePinyin(D, ["de"]);
  await D.page.keyboard.type(syl, { delay: 25 }); await D.wait(150);
  const list = await D.eval(() => window.__xhw.ime.getState().candidates);
  await D.page.keyboard.press(String(n + 1)); await D.wait(250);
  await typePinyin(D, ["le"]);
  return list[n];
};
const encItems = (D) => D.eval(async () => { const c = window.__xhw.rimeEncDict, out = []; for (const k of c.keys()) { const v = c.getItem(k); const bytes = Uint8Array.from(atob(v), (x) => x.charCodeAt(0)); out.push({ k, sealed: await window.__xhw.looksEncrypted(bytes), size: bytes.length }); } return out; });
const encRaw = (D) => D.eval(() => { const c = window.__xhw.rimeEncDict; return JSON.stringify(c.keys().sort().map((k) => [k, c.getItem(k)])); });
const cloudEnc = async (w) => { const b = await w.cloudBytes(".webxiaoheiwu/rime-enc-dict.json"); return b ? Buffer.from(b).toString("utf8") : null; };
const reconcile = async (D) => { await D.hide(); await D.wait(1800); await D.show(); await D.wait(700); };

scenario("加密词库：两台设备各学一个词，第三次打开两个都能联想；只有密文出门、/rime 不变、明文稿不加载", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  for (const D of [A, B]) { await D.ctx.addInitScript(IDB_SPY); await withIme(D); await D.boot(server.url); await waitIme(D); await D.wait(300); await D.eval(() => window.__xhw.setPassword("e2e-pw")); await D.wait(150); }
  const base = await candidates(A, "shi"), baseX = await candidates(A, "xiao");
  check("候选够多（前提）", base.length >= 5 && baseX.length >= 5, `${base.length}/${baseX.length}`);

  await openEnc(A);
  const diskA = await rimeOnDisk(A);
  check("没词的时候灌了也是空的，同步文件一个字节没写", (await encItems(A)).length === 0);
  const wordA = await learnNth(A, "shi", 4);
  console.log(`  A 在加密稿里选了第 5 个：${wordA}（原来排 ${base.indexOf(wordA)}）`);
  check("内存层当场能联想", (await candidates(A, "shi")).indexOf(wordA) < base.indexOf(wordA), JSON.stringify((await candidates(A, "shi")).slice(0, 5)));
  check("学着的时候 /rime 字节不变", stable(await rimeOnDisk(A)) === stable(diskA));
  check("空闲 60 s 之前不写（还没到点）", (await encItems(A)).length === 0);
  await A.hide(); await A.wait(800); await A.show(); await A.wait(200);
  check("切后台：先封好（iPad 随时杀页面）", (await encItems(A)).length === 1);
  check("切后台：/rime 还是不变", stable(await rimeOnDisk(A)) === stable(diskA));

  await A.eval(() => window.__xhw.newDraft()); await A.wait(1200);
  const itemsA = await encItems(A);
  check("关稿：封好写回一把键", itemsA.length === 1 && itemsA.every((x) => x.sealed), JSON.stringify(itemsA));
  check("键名里没有词", itemsA.every((x) => /^dict\.[0-9a-f-]{36}$/.test(x.k)), itemsA[0]?.k);
  const markerA = `shi \t${wordA}`, markerJson = `shi \\t${wordA}`;
  check("关稿：明文稿排序没被污染（没加载）", (await candidates(A, "shi")).indexOf(wordA) === base.indexOf(wordA), JSON.stringify((await candidates(A, "shi")).slice(0, 6)));
  check("关稿：/rime 里没有这个词", !decodedHas(await rimeOnDisk(A), markerA));
  await A.pushNow(); await reconcile(A);
  const cloudA = await cloudEnc(w);
  check("上云了", !!cloudA);
  check("云上没有明文词", !cloudA.includes(wordA) && !cloudA.includes(markerJson));
  const scanA = await scanDevice(A, markerA), scanJ = await scanDevice(A, markerJson);
  check("真 IDB 探针：任何库里没有明文词条", scanA.hits.length === 0 && scanJ.hits.length === 0, JSON.stringify([...scanA.hits, ...scanJ.hits]));
  const spied = await A.page.evaluate(async () => {
    const out = { writes: 0, values: 0, sealed: 0 };
    for (const r of window.__idbWrites) {
      if (!/rime-enc-dict/.test(r.key) && !/rime-enc-dict/.test(r.store)) continue;
      out.writes++;
      let items = []; try { items = JSON.parse(await r.bytes.text()).items ?? []; } catch { /* 不是信封就当一笔读不了的 */ }
      for (const it of items) { if (typeof it.value !== "string" || !it.id?.startsWith?.("dict.")) continue; out.values++; if (await window.__xhw.looksEncrypted(Uint8Array.from(atob(it.value), (c) => c.charCodeAt(0)))) out.sealed++; }
    }
    return out;
  });
  check("真 IDB 探针：加密词库的每一笔 put 里，每个值都是容器", spied.writes > 0 && spied.values > 0 && spied.sealed === spied.values, JSON.stringify(spied));

  // B：拉到 A 的词，自己再学一个
  await reconcile(B);
  const baseB = await candidates(B, "shi");
  check("B 的明文稿排序是原样（前提）", baseB.indexOf(wordA) === base.indexOf(wordA));
  await openEnc(B);
  const seenB = await candidates(B, "shi");
  check("B 打开加密稿：A 学的词能联想（灌进去的日志真被 RIME 重放了）", seenB.indexOf(wordA) >= 0 && seenB.indexOf(wordA) < base.indexOf(wordA), JSON.stringify(seenB.slice(0, 6)));
  const diskB0 = await rimeOnDisk(B);
  check("B：/rime 里没有灌进来的词", !decodedHas(diskB0, markerA));
  const wordB = await learnNth(B, "xiao", 4);
  console.log(`  B 在加密稿里选了第 5 个：${wordB}（原来排 ${baseX.indexOf(wordB)}）`);
  await B.eval(() => window.__xhw.newDraft()); await B.wait(1200);
  const itemsB = await encItems(B);
  check("B 写了自己的键：一机一键", itemsB.length === 2 && itemsB.every((x) => x.sealed), JSON.stringify(itemsB));
  check("B：关稿后明文稿没有 A 的词", (await candidates(B, "shi")).indexOf(wordA) === base.indexOf(wordA));
  await B.pushNow(); await reconcile(B);

  // 第三次打开：两个都能联想
  await reconcile(A);
  check("A 收到 B 的键", (await encItems(A)).length === 2);
  await openEnc(A);
  const third = await candidates(A, "shi"), thirdX = await candidates(A, "xiao");
  check("第三次打开：A 自己的词还在", third.indexOf(wordA) >= 0 && third.indexOf(wordA) < base.indexOf(wordA), JSON.stringify(third.slice(0, 6)));
  check("第三次打开：B 学的词也能联想", thirdX.indexOf(wordB) >= 0 && thirdX.indexOf(wordB) < baseX.indexOf(wordB), JSON.stringify(thirdX.slice(0, 7)));
  await A.eval(() => window.__xhw.newDraft()); await A.wait(800);
  check("关稿又忘：内存层没有了", (await candidates(A, "xiao")).indexOf(wordB) === baseX.indexOf(wordB));
  check("页面零报错", A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(" ; "));
  await A.close(); await B.close();
});

scenario("加密词库：清空入口要口令 + 别的设备不把词传回来；锁定 = 内存层立刻丢、字节不变", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  for (const D of [A, B]) { await withIme(D); await D.boot(server.url); await waitIme(D); await D.wait(300); await D.eval(() => window.__xhw.setPassword("e2e-pw")); await D.wait(150); }
  const base = await candidates(A, "shi");
  await openEnc(A);
  const word = await learnNth(A, "shi", 4);
  await A.eval(() => window.__xhw.newDraft()); await A.wait(1000); await A.pushNow(); await reconcile(A);
  await reconcile(B);
  await openEnc(B);
  check("B 有 A 的词（前提）", (await candidates(B, "shi")).indexOf(word) < base.indexOf(word));
  const own = await learnNth(B, "shi", 3);
  await B.eval(() => window.__xhw.newDraft()); await B.wait(1000); await B.pushNow(); await reconcile(B);
  const twoKeys = await encItems(B);
  check("两把键（前提）", twoKeys.length === 2, JSON.stringify(twoKeys));

  // 锁定：内存层丢、字节不变
  await reconcile(A);
  await openEnc(A);
  check("A 打开：词在（前提）", (await candidates(A, "shi")).indexOf(word) < base.indexOf(word));
  const rawBefore = await encRaw(A), cloudBefore = await cloudEnc(w);
  await A.eval(() => window.__xhw.lockNow()); await A.wait(800);
  check("锁定：会话结束", !(await A.eval(() => window.__xhw.encDict.loaded())));
  const memLocked = await memoryDump(A);
  check("锁定：内存层里没有加密词库的词了", !decodedHas(memLocked, `shi \t${word}`));
  await reconcile(A);
  check("口令不在：加密词库字节不变", (await encRaw(A)) === rawBefore);
  check("口令不在：云上字节不变", (await cloudEnc(w)) === cloudBefore);
  check("口令不在：/rime 没有词", !decodedHas(await rimeOnDisk(A), `shi \t${word}`));

  // 清空：入口要口令（这时锁着 → 先问口令；取消 = 没动）
  const sheetUp = (D) => D.page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 5000 });
  await A.eval(() => document.getElementById("clearEncDictButton").click());
  await sheetUp(A);
  await A.page.click("#sheetCancel"); await A.wait(300);
  check("锁着点清空：先问口令，取消 = 没动", (await encRaw(A)) === rawBefore);
  await A.eval(() => window.__xhw.setPassword("e2e-pw")); await A.wait(200);
  await A.eval(() => window.__xhw.newDraft()); await A.wait(600);
  await A.eval(() => document.getElementById("clearEncDictButton").click());
  await sheetUp(A);
  const msg = await A.eval(() => document.getElementById("sheetMessage").textContent);
  check("点了先说明（别的设备也会清）", /别的设备/.test(msg), msg);
  await A.page.click("#sheetCancel"); await A.wait(300);
  check("取消 = 没动", (await encRaw(A)) === rawBefore);
  await A.eval(() => document.getElementById("clearEncDictButton").click());
  await sheetUp(A);
  await A.page.click("#sheetConfirm"); await A.wait(800);
  check("确认：自己的键重写了", (await encRaw(A)) !== rawBefore);
  check("确认：值还是容器", (await encItems(A)).every((x) => x.sealed));
  await A.pushNow(); await reconcile(A);
  await openEnc(A);
  check("A：清空后这个词不再被推前", (await candidates(A, "shi")).indexOf(word) === base.indexOf(word), JSON.stringify((await candidates(A, "shi")).slice(0, 6)));
  await A.eval(() => window.__xhw.newDraft()); await A.wait(500);

  // B 还没跟上：一打开先清自己的键，词不回来
  await reconcile(B);
  const bKeyBefore = await encRaw(B);
  await openEnc(B); await B.wait(500);
  const seen = await candidates(B, "shi");
  check("B：A 的词不再被推前", seen.indexOf(word) === base.indexOf(word), JSON.stringify(seen.slice(0, 6)));
  check("B：自己以前学的也清了（先清再说）", seen.indexOf(own) === base.indexOf(own), JSON.stringify(seen.slice(0, 6)));
  check("B：自己的键重写了（带着 clearedAt）", (await encRaw(B)) !== bKeyBefore);
  await B.eval(() => window.__xhw.newDraft()); await B.wait(800); await B.pushNow(); await reconcile(B);
  await reconcile(A);
  await openEnc(A);
  const finalA = await candidates(A, "shi");
  check("A 再打开：B 没把词传回来", finalA.indexOf(word) === base.indexOf(word) && finalA.indexOf(own) === base.indexOf(own), JSON.stringify(finalA.slice(0, 6)));
  check("页面零报错", A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(" ; "));
  await A.close(); await B.close();
});

scenario("加密词库：这台设备从没用过的方案（词库目录还不存在）：切过去才重放；关稿目录也收回", async (w) => {
  const A = await w.device("A");
  await withIme(A); await A.boot(server.url); await waitIme(A); await A.wait(300);
  await A.eval(() => window.__xhw.setPassword("e2e-pw")); await A.wait(150);
  check("没有 wubi86 的词库（前提）", !Object.keys(await memoryDump(A)).some((p) => p.startsWith("wubi86.userdb")));
  await openEnc(A);
  const r = await A.eval(() => window.__xhw.ime.loadMemoryLayer({ wubi86: { "aaaa \t工": [7, 5] }, luna_pinyin: { "shi \t石": [9, 5] } }).then((x) => x.status));
  check("灌进一本还不存在的词库", r === "ok", String(r));
  await A.wait(300);
  check("别的方案的词库不挡当前方案：luna 的词上来了", (await candidates(A, "shi")).indexOf("石") >= 0, JSON.stringify(await candidates(A, "shi")));
  const dump = await memoryDump(A);
  check("目录建在内存盘上", Object.keys(dump).some((p) => p.startsWith("wubi86.userdb/")), Object.keys(dump).join(","));
  await A.eval(() => window.__xhw.ime.setSchema("wubi86")); await A.wait(1500);
  const read = await A.eval(() => window.__xhw.ime.readMemoryLayer(false).then((m) => { const e = m?.wubi86?.entries; return e ? [...e.keys()] : null; }));
  check("切到那个方案：LevelDB 新建 + 重放了日志，词在", !!read && read.includes("aaaa \t工"), JSON.stringify(read));
  await A.eval(() => window.__xhw.ime.setSchema("luna_pinyin")); await A.wait(800);
  await A.eval(() => window.__xhw.newDraft()); await A.wait(1000);
  const after = await memoryDump(A);
  check("关稿：那本词库的文件都收回了", !Object.keys(after).some((p) => p.startsWith("wubi86.userdb/") && /\\.log$|\\.ldb$/.test(p) && Buffer.from(after[p], "base64").includes(Buffer.from("aaaa"))), Object.keys(after).join(","));
  check("/rime 里没有这些词", !decodedHas(await rimeOnDisk(A), "shi \t石") && !decodedHas(await rimeOnDisk(A), "aaaa \t工"));
  check("输入法还能打", (await candidates(A, "shi")).length > 0);
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

scenario("加密词库：大词库的代价（一万词，真容器）", async (w) => {
  const A = await w.device("A");
  await withIme(A); await A.boot(server.url); await waitIme(A); await A.wait(300);
  await A.eval(() => window.__xhw.setPassword("e2e-pw")); await A.wait(150);
  const m = await A.eval(async () => {
    const entries = {}; for (let i = 0; i < 10000; i++) entries[`ci${i} yu${i % 97} \t词语${i}`] = [1 + (i % 5), 1];
    const json = new TextEncoder().encode(JSON.stringify({ version: 1, minor: 0, patch: 0, entries: { luna_pinyin: entries }, savedAt: 1, device: "x" }));
    const box = window.__xhw.encContainer;
    const t0 = performance.now(); const value = await box.seal(json, "e2e-pw"); const t1 = performance.now();
    const back = await box.unseal(value, "e2e-pw"); const t2 = performance.now();
    const c = window.__xhw.rimeEncDict; c.setItem("dict.bulk", value);
    return { json: json.length, sealed: value.length, sealMs: Math.round(t1 - t0), unsealMs: Math.round(t2 - t1), same: back?.length === json.length };
  });
  console.log(`  一万词：明文 ${m.json} 字节 → 容器 base64 ${m.sealed} 字节；封 ${m.sealMs} ms，解 ${m.unsealMs} ms`);
  check("读得回来", m.same);
  const t0 = Date.now(); await openEnc(A); const dt = Date.now() - t0;
  console.log(`  开稿到灌好：${dt} ms`);
  const has = await A.eval(() => window.__xhw.ime.readMemoryLayer(false).then((s) => s?.luna_pinyin?.entries.size ?? 0));
  check("一万词都灌进去了", has >= 10000, String(has));
  const t1 = Date.now(); await A.eval(() => window.__xhw.newDraft()); await A.page.waitForFunction(() => !window.__xhw.encDict.loaded(), null, { timeout: 15000 }); const dt2 = Date.now() - t1;
  console.log(`  关稿到丢完：${dt2} ms`);
  check("输入法还能打", (await candidates(A, "shi")).length > 0);
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

// 出门规则（规则书 §1 第 5 条，F-181）：另存到磁盘默认容器；明文显式 + 下载前明说；带口令可导回
scenario("加密稿出门：默认加密副本（字节是容器、没有明文），带口令可导回；明文显式 + 明说；明文稿没有这些", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const SECRET = "出门规则的秘密正文甲乙丙";
  const sheetUp = (D) => D.page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 8000 });
  const sheetText = (D) => D.eval(() => document.getElementById("sheet").textContent);
  const clickBtn = (D, label) => D.page.click(`#sheet button:has-text("${label}")`);
  await A.boot(server.url); await A.wait(400);
  await A.eval(() => window.__xhw.setPassword("e2e-pw")); await A.wait(150);
  await A.eval(() => window.__xhw.newDraft({ encrypted: true })); await A.wait(400);
  await A.type(SECRET); await A.wait(500);
  void A.eval(() => window.__xhw.exportSheet());
  await sheetUp(A);
  const sheet = await sheetText(A);
  check("加密稿：导出面板第一个就是加密副本", /加密副本/.test(sheet) && /别的格式都是明文/.test(sheet), sheet.slice(0, 80));
  const first = await A.eval(() => document.querySelector("#sheet button.primary")?.textContent ?? "");
  check("加密副本是默认（主按钮）", /加密副本/.test(first), first);
  await clickBtn(A, "加密副本");
  await sheetUp(A); await A.wait(150);
  const dl = A.page.waitForEvent("download", { timeout: 8000 });
  check("加密副本的面板不说明文", !/这是明文/.test(await sheetText(A)));
  await clickBtn(A, "下载");
  const d1 = await dl;
  const fs = await import("node:fs");
  const bytes = fs.readFileSync(await d1.path());
  check("文件名说得清", /\.encrypted\.zip$/.test(d1.suggestedFilename()), d1.suggestedFilename());
  const b64Out = bytes.toString("base64");
  const isBox = (D, b) => D.eval((x) => window.__xhw.looksEncrypted(Uint8Array.from(atob(x), (c) => c.charCodeAt(0))), b);
  check("加密稿另存：字节是容器（isEncryptedBlob 为真）", await isBox(A, b64Out));
  check("字节里没有明文", !bytes.includes(Buffer.from(SECRET)) && !bytes.includes(Buffer.from(SECRET.slice(0, 4))));

  // 明文显式：TXT 面板先说再下
  void A.eval(() => window.__xhw.exportSheet());
  await sheetUp(A);
  await clickBtn(A, "TXT");
  await sheetUp(A); await A.wait(150);
  check("TXT：下载前明说这是明文", /这是明文/.test(await sheetText(A)), (await sheetText(A)).slice(0, 80));
  const dl2 = A.page.waitForEvent("download", { timeout: 8000 });
  await clickBtn(A, "下载");
  const txt = fs.readFileSync(await (await dl2).path());
  check("TXT 是明文（人显式选的）", txt.includes(Buffer.from(SECRET)));
  const stillEnc = await A.eval(() => window.__xhw.editor.state.encrypted);
  check("导出不碰加密状态（不靠解除加密）", stillEnc === true);

  // 带口令导回：另一台设备，同口令直接进；不同口令先问
  await B.boot(server.url); await B.wait(400);
  await B.eval(() => window.__xhw.setPassword("other-pw")); await B.wait(150);
  const drop = (D, b, name) => D.eval(([x, n]) => { const f = new File([Uint8Array.from(atob(x), (c) => c.charCodeAt(0))], n, { type: "application/zip" }); return void window.__xhw.importDropped([f]); }, [b, name]);
  await drop(B, b64Out, d1.suggestedFilename());
  await sheetUp(B);
  check("口令不同：先问这个文件的口令", /这个文件的口令/.test(await sheetText(B)));
  await B.page.fill("#sheetInput", "wrong-pw"); await B.page.click("#sheetConfirm"); await B.wait(500);
  check("口令不对：还在问，什么都没进库", !(await B.eval(() => document.getElementById("sheet").classList.contains("hidden"))));
  await B.page.fill("#sheetInput", "e2e-pw"); await B.page.click("#sheetConfirm");
  await B.page.waitForFunction((s) => document.getElementById("editor").value.includes(s), SECRET, { timeout: 8000 });
  check("导回：打开就是原文", (await B.text()).includes(SECRET));
  check("导回：还是加密稿", await B.eval(() => window.__xhw.editor.state.encrypted));
  await B.wait(800);
  const scan = await scanDevice(B, SECRET);
  check("导回：库里没有明文", scan.hits.length === 0, JSON.stringify(scan.hits));

  // 加密书：同一条路（书 zip 的容器，导回还是书）
  const lifting = A.eval(() => window.__xhw.liftDraft());
  await sheetUp(A); await A.page.click("#sheetConfirm");
  check("拆成加密书（前提）", await lifting);
  await A.wait(600);
  check("是加密书（前提）", await A.eval(() => window.__xhw.project.active() && window.__xhw.project.encrypted()));
  void A.eval(() => window.__xhw.exportSheet());
  await sheetUp(A);
  await clickBtn(A, "加密副本");
  await sheetUp(A); await A.wait(150);
  const dlBook = A.page.waitForEvent("download", { timeout: 8000 });
  await clickBtn(A, "下载");
  const bookFile = await dlBook, bookBytes = fs.readFileSync(await bookFile.path());
  check("加密书另存：字节是容器", await isBox(A, bookBytes.toString("base64")));
  check("加密书另存：字节里没有明文", !bookBytes.includes(Buffer.from(SECRET.slice(0, 4))));
  await drop(B, bookBytes.toString("base64"), bookFile.suggestedFilename());
  await sheetUp(B);
  await B.page.fill("#sheetInput", "e2e-pw"); await B.page.click("#sheetConfirm");
  await B.page.waitForFunction(() => window.__xhw.project.active(), null, { timeout: 8000 });
  check("加密书导回：还是一本加密书", await B.eval(() => window.__xhw.project.encrypted()));
  check("加密书导回：内容在", (await B.text()).includes(SECRET.slice(0, 4)), (await B.text()).slice(0, 40));

  // 明文稿：没有这些
  await A.eval(() => window.__xhw.newDraft()); await A.wait(400);
  await A.type("普通的明文稿正文"); await A.wait(500);
  void A.eval(() => window.__xhw.exportSheet());
  await sheetUp(A);
  check("明文稿：没有加密副本这个选项", !/加密副本/.test(await sheetText(A)));
  await clickBtn(A, "TXT");
  await sheetUp(A); await A.wait(150);
  check("明文稿：不多嘴", !/这是明文/.test(await sheetText(A)));
  await A.page.click("#sheetCancel").catch(() => {});
  check("页面零报错", A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(" ; "));
  await A.close(); await B.close();
});

// ── 换稿：「开着的是谁」和「编辑框里的字」同一步换（v3.0.18，2026-11-10，Claude Opus 5.5；设计稿 = 家族根 ai-docs/20261110-design-wxhw-open-swap-fix.md §4，
//   毛病 = ai-docs/20261110-audit-cross-write-on-open.md：以前名字先换、读完新稿才换字，中间敲的字让旧稿全文存到新稿名下并推上网盘）──
const ORIG_A = "AAAA 第一篇原文。", ORIG_B = "BBBB 第二篇原文。";
/** 一台设备上写两篇、都推上网盘；最后开着第二篇。 */
async function seedTwo(w, A) {
  await A.boot(server.url); await A.type(ORIG_A); await A.wait(500); await A.pushNow(); await A.wait(300);
  const a = await A.eval(() => window.__xhw.editor.state.name);
  await A.eval(() => window.__xhw.newDraft({})); await A.wait(300);
  await A.type(ORIG_B); await A.wait(500); await A.pushNow(); await A.wait(300);
  const b = await A.eval(() => window.__xhw.editor.state.name);
  if ((await w.cloudText(a)) !== ORIG_A || (await w.cloudText(b)) !== ORIG_B) throw new Error("seedTwo: docs did not reach the cloud");
  return { a, b };
}
const localText = (D, n) => D.eval((x) => window.__xhw.store().file(x, { mode: "existing" }).open().then((b) => (b ? b.text() : null)), n);
const editorReadOnly = (D) => D.eval(() => document.getElementById("editor").readOnly);

scenario("换稿 ① 点开另一篇、新稿的字还没出来就敲字：读的时候编辑框只读；两篇在本机和网盘上都没变", async (w) => {
  const A = await w.device("A");
  const { a, b } = await seedTwo(w, A);
  w.gate.delayMs = 1500;
  await A.eval((n) => { window.__probeOpen = window.__xhw.openAny(n); }, a);   // 不等：就是人点了一下
  await A.wait(50);
  const ro = await editorReadOnly(A);
  await A.type("x"); await A.wait(700);                                         // 0.2 s 的本机落盘早过了
  await A.eval(() => window.__probeOpen); await A.wait(300);
  w.gate.delayMs = 0;
  check("读新稿那段时间编辑框只读", ro === true, String(ro));
  check("开完：开着的是第一篇", (await A.eval(() => window.__xhw.editor.state.name)) === a);
  check("开完：编辑框 = 第一篇原文", (await A.text()) === ORIG_A, await A.text());
  await A.pushNow(); await A.wait(800);
  check("本机第一篇 = 原文", (await localText(A, a)) === ORIG_A, await localText(A, a));
  check("本机第二篇 = 原文", (await localText(A, b)) === ORIG_B, await localText(A, b));
  check("网盘第一篇 = 原文", (await w.cloudText(a)) === ORIG_A, await w.cloudText(a));
  check("网盘第二篇 = 原文", (await w.cloudText(b)) === ORIG_B, await w.cloudText(b));
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

scenario("换稿 ② 冷启动续写：页面一出来就打字 → 敲不进去；读完是上次那篇原文；推了不弹面、网盘没变", async (w) => {
  const A = await w.device("A");
  const { a, b } = await seedTwo(w, A);
  w.gate.delayMs = 2000;
  await A.page.goto(server.url, { waitUntil: "load" });
  await A.page.waitForFunction(() => !!window.__xhw, null, { timeout: 20000 });
  const seen = [];
  for (let i = 0; i < 3; i++) {                                                 // 头 0.5 s 里敲三下：网盘每次请求慢 2 s，新稿肯定还没读完
    seen.push(await A.eval(() => ({ name: window.__xhw.editor.state.name, ro: document.getElementById("editor").readOnly, val: document.getElementById("editor").value })));
    await A.page.evaluate(() => document.getElementById("editor").focus()); await A.page.keyboard.type("h");
    await A.wait(150);
  }
  await A.page.waitForFunction((n) => window.__xhw.editor.state.name === n && !document.getElementById("editor").readOnly, b, { timeout: 30000 }).catch(() => {});
  await A.wait(700);
  w.gate.delayMs = 0;
  check("读的那段时间编辑框一直只读", seen.every((s) => s.ro), JSON.stringify(seen));
  check("读完：编辑框 = 上次那篇（第二篇）原文，没多出敲的字", (await A.text()) === ORIG_B, await A.text());
  check("本机第二篇 = 原文", (await localText(A, b)) === ORIG_B, await localText(A, b));
  await Promise.race([A.pushNow(), A.wait(4000)]); await A.wait(1500);
  check("推了不弹冲突面", !(await A.gateShown()));
  check("网盘第二篇 = 原文", (await w.cloudText(b)) === ORIG_B, await w.cloudText(b));
  check("网盘第一篇 = 原文", (await w.cloudText(a)) === ORIG_A, await w.cloudText(a));
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

scenario("换稿 ③ 从书切回文本稿时敲字：文本稿和书在本机和网盘上都没变", async (w) => {
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
  await A.type("改。"); await A.wait(500); await A.pushNow(); await A.wait(600);   // 拆出来的书不脏，推送是空操作：改一个字让它推上去
  const book = await A.eval(() => window.__xhw.project.name()), page = await A.eval(() => window.__xhw.project.current());
  const BOOK_PAGE = "书的一页原文。改。";
  const bookBefore = await bookPages(await w.cloudBytes(book));
  if (bookBefore[page] !== BOOK_PAGE) throw new Error("seed: book page did not reach the cloud: " + JSON.stringify(bookBefore));
  w.gate.delayMs = 1500;
  await A.eval((n) => { window.__probeOpen = window.__xhw.openAny(n); }, a);
  await A.page.waitForFunction(() => !window.__xhw.project.active(), null, { timeout: 15000 });   // 书关完了、文本稿正在读
  const ro = await editorReadOnly(A);
  await A.type("x"); await A.wait(700);
  await A.eval(() => window.__probeOpen); await A.wait(300);
  w.gate.delayMs = 0;
  check("读文本稿那段时间编辑框只读", ro === true, String(ro));
  check("开完：编辑框 = 文本稿原文", (await A.text()) === ORIG_A, await A.text());
  await A.pushNow(); await A.wait(800);
  check("本机文本稿 = 原文", (await localText(A, a)) === ORIG_A, await localText(A, a));
  check("网盘文本稿 = 原文", (await w.cloudText(a)) === ORIG_A, await w.cloudText(a));
  const bookAfter = await bookPages(await w.cloudBytes(book));
  check("网盘上书的那一页没变", bookAfter[page] === BOOK_PAGE, JSON.stringify(bookAfter));
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

scenario("换稿 ④ 打字的同时点开另一篇（0.2 s 的落盘还没到）：先敲的字存进原来那一篇，另一篇没变", async (w) => {
  const A = await w.device("A");
  const { a, b } = await seedTwo(w, A);
  w.gate.delayMs = 300;
  await A.type("yy");
  await A.eval((n) => window.__xhw.openAny(n), a); await A.wait(300);
  w.gate.delayMs = 0;
  check("开完：编辑框 = 第一篇原文", (await A.text()) === ORIG_A, await A.text());
  check("本机第二篇 = 原文 + 先敲的字", (await localText(A, b)) === ORIG_B + "yy", await localText(A, b));
  check("本机第一篇 = 原文", (await localText(A, a)) === ORIG_A, await localText(A, a));
  await A.eval(() => window.__xhw.store().files.dirty.pushAll()); await A.wait(500);   // 旧稿的欠推靠库的待传记号（回来时补推）；这里直接让库推
  check("网盘第二篇 = 原文 + 先敲的字", (await w.cloudText(b)) === ORIG_B + "yy", await w.cloudText(b));
  check("网盘第一篇 = 原文", (await w.cloudText(a)) === ORIG_A, await w.cloudText(a));
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

scenario("换稿 ⑤ 读新稿时出错（读盘抛错）：人还在原来那一篇上，能接着打字，打的字存进原来那一篇", async (w) => {
  const A = await w.device("A");
  const { a, b } = await seedTwo(w, A);
  const patched = await A.eval((target) => {
    const s = window.__xhw.store(), orig = s.file;
    const fake = function (n, o) { if (n === target) throw new Error("e2e: read failed"); return orig.call(s, n, o); };
    try { s.file = fake; } catch { return false; }
    window.__restoreFile = () => { s.file = orig; };
    return s.file === fake;
  }, a);
  if (!patched) { check("能在页面里把读盘换成会抛错的（测试前提）", false, "store.file is not writable"); await A.close(); return; }
  const r = await A.eval((n) => window.__xhw.openAny(n).then(() => "ok", (e) => "threw: " + String(e?.message ?? e)), a);
  await A.eval(() => window.__restoreFile());
  check("这次打开报了错（测试前提）", /threw/.test(r), r);
  check("人还在第二篇上", (await A.eval(() => window.__xhw.editor.state.name)) === b, await A.eval(() => window.__xhw.editor.state.name));
  check("编辑框能打字", !(await editorReadOnly(A)));
  await A.type("zz"); await A.wait(700);
  check("打的字存进第二篇（本机）", (await localText(A, b)) === ORIG_B + "zz", await localText(A, b));
  check("第一篇没被碰（本机）", (await localText(A, a)) === ORIG_A, await localText(A, a));
  await A.pushNow(); await A.wait(500);
  check("网盘第二篇 = 原文 + 打的字", (await w.cloudText(b)) === ORIG_B + "zz", await w.cloudText(b));
  check("网盘第一篇 = 原文", (await w.cloudText(a)) === ORIG_A, await w.cloudText(a));
  await A.close();   // 不查零报错：这一条故意让读盘抛错
});

scenario("换稿 ⑥ 冲突面选了云端 → 重载时敲字：编辑框里还是旧世界的字时一直只读；重载后是云端版；旧世界不写回、不多弹面", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const name = await seedTxt(w, A, B, "原文。");
  const OLD = "原文。B也改了。", CLOUD = "原文。A改了。";
  await A.type("A改了。"); await A.wait(500); await A.pushNow(); await A.wait(300);
  await B.type("B也改了。"); await B.wait(500);
  const push = B.pushNow();
  await B.resolveGate(TAKE_CLOUD);
  w.gate.delayMs = 800;                                                         // 重载那一下读稿慢
  await B.page.waitForFunction(() => document.getElementById("editor").readOnly, null, { timeout: 20000 });   // 世界线换了：旧世界封住（之前那段能打字，打的进留底稿，不归这条管）
  const seen = [];
  for (let i = 0; i < 40; i++) {                                                // 一直敲到编辑框换成云端版
    const s = await B.eval(() => ({ ro: document.getElementById("editor").readOnly, val: document.getElementById("editor").value }));
    if (!s.val.startsWith(OLD)) break;
    seen.push(s.ro);
    await B.page.evaluate(() => document.getElementById("editor").focus()); await B.page.keyboard.type("q");
    await B.wait(150);
  }
  await push.catch(() => {});
  await B.wait(1000);
  w.gate.delayMs = 0;
  check("敲过字（测试前提：重载够慢）", seen.length >= 3, String(seen.length));
  check("编辑框里还是旧世界的字时一直只读", seen.every(Boolean), JSON.stringify(seen));
  check("重载后编辑框是云端版（之后敲的 q 算正常编辑）", (await B.text()).replace(/q+$/, "") === CLOUD, await B.text());
  await Promise.race([B.pushNow(), B.wait(4000)]); await B.wait(800);
  const local = await localText(B, name), cloud = await w.cloudText(name);
  check("本机那篇没有旧世界的字", !!local && local.startsWith(CLOUD) && !local.includes("B也改了"), local);
  check("云端没有旧世界的字（A 的版本还在）", !!cloud && cloud.startsWith(CLOUD) && !cloud.includes("B也改了"), cloud);
  check("没有多弹出冲突面", !(await B.gateShown()));
  check("页面零报错", [...A.errors, ...B.errors].length === 0, [...A.errors, ...B.errors].join(" ; "));
  await A.close(); await B.close();
});

scenario("换稿 ⑦ 保存排着队的时候换稿（一轮推送卡在网上，后面又排了落盘）：全部落进原来那一篇，另一篇没变", async (w) => {
  const A = await w.device("A");
  const { a, b } = await seedTwo(w, A);
  await A.type("1"); await A.wait(400);
  let release; w.gate.holdUploads = new Promise((r) => (release = r));
  const push = A.pushNow(); await A.wait(200);                                  // 这一轮推送卡在上传
  await A.type("2"); await A.wait(400);                                         // 0.2 s 的落盘排在推送后面
  await A.type("3");                                                            // 这一下的定时器还没到
  const opening = A.eval((n) => window.__xhw.openAny(n), a); await A.wait(300);
  const midName = await A.eval(() => window.__xhw.editor.state.name), midRo = await editorReadOnly(A);
  w.gate.holdUploads = null; release();
  await push.catch(() => {}); await opening; await A.wait(500);
  check("等保存的时候还开着第二篇、编辑框只读", midName === b && midRo === true, `${midName} ro=${midRo}`);
  check("开完：编辑框 = 第一篇原文", (await A.text()) === ORIG_A, await A.text());
  check("本机第二篇 = 原文 + 123（排在后面的也落了）", (await localText(A, b)) === ORIG_B + "123", await localText(A, b));
  check("本机第一篇 = 原文", (await localText(A, a)) === ORIG_A, await localText(A, a));
  await A.eval(() => window.__xhw.store().files.dirty.pushAll()); await A.wait(500);
  check("网盘第二篇 = 原文 + 123", (await w.cloudText(b)) === ORIG_B + "123", await w.cloudText(b));
  check("网盘第一篇 = 原文", (await w.cloudText(a)) === ORIG_A, await w.cloudText(a));
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

scenario("换稿 ⑧ 改名还在路上的时候换稿（改名期间又敲了字）：敲的字落进改了名的那一篇，旧名字不复活，另一篇没变", async (w) => {
  const A = await w.device("A");
  const { a, b } = await seedTwo(w, A);
  w.gate.delayMs = 800;                                                         // 改名的云端那一腿慢
  const renaming = A.eval(() => { window.__renDone = false; return window.__xhw.editor.renameTo("改过的名字").then((r) => { window.__renDone = true; return r; }); });
  await A.wait(100);
  await A.type("rr"); await A.wait(300);                                        // 改名期间敲字：落盘被改名挡着，只重挂定时器
  const stillRenaming = await A.eval(() => window.__renDone === false);
  const opening = A.eval((n) => window.__xhw.openAny(n), a);
  const renamed = await renaming; await opening; await A.wait(500);
  w.gate.delayMs = 0;
  check("测试前提：点开第一篇时改名还在路上", stillRenaming);
  check("改名成了", renamed === true, String(renamed));
  check("开完：开着的是第一篇、编辑框 = 第一篇原文", (await A.eval(() => window.__xhw.editor.state.name)) === a && (await A.text()) === ORIG_A, await A.text());
  const names = await libraryNames(A);
  const newName = names.find((n) => /改过的名字/.test(n));
  check("书库里有改了名的那一篇", !!newName, JSON.stringify(names));
  if (newName) check("改了名的那一篇 = 原文 + 改名期间敲的字", (await localText(A, newName)) === ORIG_B + "rr", await localText(A, newName));
  check("旧名字没有复活（本机没有了）", (await localText(A, b)) === null, String(await localText(A, b)));
  check("本机第一篇 = 原文", (await localText(A, a)) === ORIG_A, await localText(A, a));
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

// ── 审稿时加的回归（2026-11-10，Claude Fable 5.2；审稿 = 家族根 ai-docs/20261110-review-wxhw-open-swap-fix.md）。⑨ 在 v3.0.17 的代码上红。──
/** 让「写」失败：mode = "all"（什么都写不进，另存也失败）/ 稿名（只有这一篇写不进，另存能成）。window.__restoreSaves() 复原。 */
const breakSaves = (D, mode) => D.eval((m) => {
  const s = window.__xhw.store(), orig = s.file;
  s.file = function (n, o) { const f = orig.call(s, n, o); if (m === "all" || n === m) f.save = async () => { throw new Error("e2e: write failed"); }; return f; };
  window.__restoreSaves = () => { s.file = orig; };
  return s.file !== orig;
}, mode);

scenario("换稿 ⑨ 冷启动：这台上次开的是书（读得慢），别的设备最后写的是一篇文本稿 → 等书开完才跳过去；书和文本稿编辑器不同时管着编辑框", async (w) => {
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
  await A.type("改。"); await A.wait(500); await A.pushNow(); await A.wait(600);   // 这台停在书上：上次开的 = 书
  const book = await A.eval(() => window.__xhw.project.name());
  await A.eval(() => window.__xhw.store().files.dirty.pushAll()); await A.wait(800);
  const B = await w.device("B");                                                // 第二台改那篇文本稿：「最后写的那篇」变成它
  await B.boot(server.url); await B.wait(800);
  await B.eval((n) => window.__xhw.openAny(n), a); await B.wait(600);
  await B.type("。"); await B.wait(500); await B.pushNow(); await B.wait(2500);
  const TXT = ORIG_A + "。";
  if ((await w.cloudText(a)) !== TXT) throw new Error("seed: device B's edit did not reach the cloud");
  await B.close();
  const stem = book.replace(/\.webxiaoheiwu\.zip$/i, "");                       // 只拖慢书：这台冷启动时书读 3 秒，别的照常
  for (const op of ["getItemByPath", "download"]) {
    const orig = w.provider[op].bind(w.provider);
    w.provider[op] = async (...args) => { if (String(args[0]).includes(stem + ".webxiaoheiwu")) await new Promise((r) => setTimeout(r, 3000)); return orig(...args); };
  }
  await A.page.goto(server.url, { waitUntil: "load" });
  await A.page.waitForFunction(() => !!window.__xhw, null, { timeout: 20000 });
  const both = [];                                                              // 一路看：有没有哪一刻书开着、文本稿编辑器却没放下
  for (let i = 0; i < 16; i++) { both.push(await A.eval(() => window.__xhw.project.active() && !window.__xhw.editor.isParked())); await A.wait(500); }
  const end = await A.eval(() => ({ name: window.__xhw.editor.state.name, parked: window.__xhw.editor.isParked(), book: window.__xhw.project.active(), val: document.getElementById("editor").value }));
  check("一路上没有哪一刻两种模式同时管着编辑框", both.every((x) => !x), JSON.stringify(both));
  check("落定后：开着的是那篇文本稿、编辑框 = 它在网盘上的样子", !end.book && end.name === a && end.val === TXT, JSON.stringify(end));
  await A.type("x"); await A.wait(800); await A.pushNow(); await A.wait(800);
  check("敲一个字：本机文本稿 = 网盘版 + x", (await localText(A, a)) === TXT + "x", await localText(A, a));
  check("敲一个字：网盘文本稿 = 网盘版 + x", (await w.cloudText(a)) === TXT + "x", await w.cloudText(a));
  const cb = await bookPages(await w.cloudBytes(book));
  check("网盘上书的那一页没变", Object.values(cb).includes("书的一页原文。改。"), JSON.stringify(cb));
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

/** 通用面（#sheet）：等它带着这个标题出来 / 看它 / 点其中一个选项。 */
const waitSheet = (D, titleRe) => D.page.waitForFunction((src) => { const s = document.getElementById("sheet"); return !s.classList.contains("hidden") && new RegExp(src).test(document.getElementById("sheetTitle").textContent ?? ""); }, titleRe.source, { timeout: 8000 });
const sheetView = (D) => D.eval(() => ({ up: !document.getElementById("sheet").classList.contains("hidden"), title: document.getElementById("sheetTitle").textContent, choices: [...document.querySelectorAll("#sheetChoices button")].map((b) => b.textContent) }));
const clickChoice = (D, labelRe) => D.eval((src) => { const b = [...document.querySelectorAll("#sheetChoices button")].find((x) => new RegExp(src).test(x.textContent ?? "")); if (!b) throw new Error("sheet choice not found: " + src); b.click(); }, labelRe.source);
const CANNOT_KEEP = /这一篇还有字没存上/;
const toastText = (D) => D.eval(() => document.getElementById("toast").textContent ?? "");

scenario("换稿 ⑩ 这一篇存不上、另存也失败 → 问人（三选，留下在头一个）；选「先留着它」= 不换稿、解冻、字还在；修好后接着写、能换稿", async (w) => {
  const A = await w.device("A");
  const { a, b } = await seedTwo(w, A);
  if (!(await breakSaves(A, "all"))) { check("能在页面里让写盘失败（测试前提）", false, "store.file is not writable"); await A.close(); return; }
  await A.type("qq");
  await A.eval((n) => { window.__o = window.__xhw.openAny(n).then((x) => "ret:" + x, (e) => "threw:" + String(e?.message ?? e)); }, a);
  await waitSheet(A, CANNOT_KEEP);
  const v = await sheetView(A);
  check("问了：三个选项，「先留着它」在头一个", v.choices.length === 3 && /先留着它/.test(v.choices[0] ?? "") && v.choices.some((c) => /导出成 txt/.test(c)) && v.choices.some((c) => /丢掉/.test(c)), JSON.stringify(v));
  check("问着的时候：还是第二篇、编辑框冻着", (await A.eval(() => window.__xhw.editor.state.name)) === b && (await editorReadOnly(A)), "");
  await clickChoice(A, /先留着它/);
  const r = await A.eval(() => window.__o);
  await A.wait(300);
  check("换稿没成（返回 false，不抛）", r === "ret:false", r);
  check("人还在第二篇上、编辑框解冻了、敲的字还在", (await A.eval(() => window.__xhw.editor.state.name)) === b && !(await editorReadOnly(A)) && (await A.text()) === ORIG_B + "qq", await A.text());
  check("第一篇没被碰（本机）", (await localText(A, a)) === ORIG_A, await localText(A, a));
  await A.eval(() => window.__restoreSaves());
  await A.type("w"); await A.wait(700);
  check("修好后：之前的字连同接着敲的都存进第二篇", (await localText(A, b)) === ORIG_B + "qqw", await localText(A, b));
  const r2 = await A.eval((n) => window.__xhw.openAny(n), a); await A.wait(300);
  check("修好后：能换到第一篇，编辑框 = 第一篇原文；没再问", r2 === true && (await A.text()) === ORIG_A && !(await sheetView(A)).up, `${r2} ${await A.text()}`);
  await A.close();   // 不查零报错：这一条故意让写盘抛错
});

scenario("换稿 ⑪ 这一篇存不上、另存能成 → 没存上的字另存成一份留底，换稿照常，两篇都没被写错", async (w) => {
  const A = await w.device("A");
  const { a, b } = await seedTwo(w, A);
  if (!(await breakSaves(A, b))) { check("能在页面里让写盘失败（测试前提）", false, "store.file is not writable"); await A.close(); return; }
  await A.type("qq");
  const r = await A.eval((n) => window.__xhw.openAny(n).then((x) => "ret:" + x, (e) => "threw:" + String(e?.message ?? e)), a);
  await A.wait(400);
  await A.eval(() => window.__restoreSaves());
  check("换稿成了", r === "ret:true", r);
  check("开着的是第一篇、编辑框 = 第一篇原文、能打字", (await A.eval(() => window.__xhw.editor.state.name)) === a && (await A.text()) === ORIG_A && !(await editorReadOnly(A)), await A.text());
  const kept = (await libraryNames(A)).filter((n) => n !== a && n !== b);
  check("书库里多了一份留底", kept.length === 1, JSON.stringify(kept));
  if (kept[0]) check("留底 = 第二篇原文 + 没存上的字", (await localText(A, kept[0])) === ORIG_B + "qq", await localText(A, kept[0]));
  check("第二篇本机还是原文（没存上，也没被写坏）", (await localText(A, b)) === ORIG_B, await localText(A, b));
  check("第一篇本机 = 原文", (await localText(A, a)) === ORIG_A, await localText(A, a));
  check("换稿后还看得到「已另存为…」那句（没被「加载中…」盖掉）", /已另存为/.test(await toastText(A)), await toastText(A));
  await A.close();   // 不查零报错：这一条故意让写盘抛错
});

scenario("换稿 ⑫ 连着换两次（第一次还在读就来了第二次）：落在第二次那篇，没有冻住，三篇都没被写错", async (w) => {
  const A = await w.device("A");
  const { a, b } = await seedTwo(w, A);
  await A.eval(() => window.__xhw.newDraft({})); await A.wait(300);
  await A.type("CCCC 第三篇。"); await A.wait(600);
  const c = await A.eval(() => window.__xhw.editor.state.name);
  w.gate.delayMs = 1200;
  await A.eval((n) => { window.__o1 = window.__xhw.openAny(n); }, a);
  await A.wait(150);
  await A.type("z");                                                            // 冻着，敲不进
  const r2 = await A.eval((n) => window.__xhw.openAny(n), b);
  const r1 = await A.eval(() => window.__o1);
  w.gate.delayMs = 0; await A.wait(400);
  check("第一次被顶掉（false）、第二次成了（true）", r1 === false && r2 === true, `${r1} ${r2}`);
  check("开着的是第二篇、编辑框 = 第二篇原文、能打字", (await A.eval(() => window.__xhw.editor.state.name)) === b && (await A.text()) === ORIG_B && !(await editorReadOnly(A)), await A.text());
  await A.type("k"); await A.wait(700);
  check("第二篇本机 = 原文 + k", (await localText(A, b)) === ORIG_B + "k", await localText(A, b));
  check("第一篇本机 = 原文", (await localText(A, a)) === ORIG_A, await localText(A, a));
  check("第三篇本机 = 原样", (await localText(A, c)) === "CCCC 第三篇。", await localText(A, c));
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

// ── v3.0.19（2026-11-10，Claude Opus 5.5；方案 = 家族根 ai-docs/20261110-review-wxhw-open-swap-fix.md 第五节）：文本稿和书共用一个编辑框，一边正在读的时候换到另一边。
//   在 v3.0.18 的代码上 ⑬⑭ 红（审稿探针 probe/open-swap/cross-mode.mjs 的甲乙）。做法：第一次换稿时假网盘每次请求慢 2.5 秒，0.25 秒后归零再发第二次换稿。
const BOOK_PAGE = "书的一页原文。改。";
const localBook = async (D, n) => { const b64 = await D.eval(async (x) => { const b = await window.__xhw.store().file(x, { mode: "existing" }).open(); if (!b) return null; const u = new Uint8Array(await b.arrayBuffer()); let s = ""; for (const c of u) s += String.fromCharCode(c); return btoa(s); }, n); return b64 ? bookPages(Buffer.from(b64, "base64")) : {}; };
const modeSnap = (D) => D.eval(() => ({ name: window.__xhw.editor.state.name, parked: window.__xhw.editor.isParked(), projActive: window.__xhw.project.active(), projName: window.__xhw.project.name(), ro: document.getElementById("editor").readOnly, val: document.getElementById("editor").value, bookUi: document.body.dataset.project === "1" }));
/** 一篇文本稿 + 一本一页的书，都推上网盘；最后停在一张空新稿上（没物化）。 */
async function seedTxtAndBook(w, A) {
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
  if ((await bookPages(await w.cloudBytes(book)))[page] !== BOOK_PAGE) throw new Error("seed: book page not on cloud");
  if ((await w.cloudText(a)) !== ORIG_A) throw new Error("seed: txt not on cloud");
  await A.eval(() => window.__xhw.newDraft({})); await A.wait(500);
  return { a, book, page };
}

scenario("换稿 ⑬ 文本稿读得慢 → 接着开书，书先装好：文本稿读回来不碰编辑框，书那一页没被写成文本稿的字", async (w) => {
  const A = await w.device("A");
  const { a, book, page } = await seedTxtAndBook(w, A);
  w.gate.delayMs = 2500;
  await A.eval((n) => { window.__p1 = window.__xhw.openAny(n).then((r) => "ok:" + r, (e) => "threw:" + (e?.message ?? e)); }, a);
  await A.wait(250);
  w.gate.delayMs = 0;
  const r2 = await A.eval((n) => window.__xhw.openAny(n), book); await A.wait(300);
  const mid = await modeSnap(A);
  const r1 = await A.eval(() => window.__p1); await A.wait(300);
  const end = await modeSnap(A);
  check("前提：书先装好（书模式开着、编辑框 = 书的那一页）", r2 === true && mid.projActive && mid.val === BOOK_PAGE, JSON.stringify(mid));
  check("文本稿那次读回来算被顶掉（false，不抛）", r1 === "ok:false", r1);
  check("文本稿读完后：还是书开着、文本稿编辑器放着、编辑框 = 书的那一页", end.projActive && end.parked && end.bookUi && end.val === BOOK_PAGE && end.name === null, JSON.stringify(end));
  await A.type("x"); await A.wait(700);
  await A.eval(() => window.__xhw.project.flushLocal()); await A.pushNow(); await A.wait(800);
  const lb = await localBook(A, book), cb = await bookPages(await w.cloudBytes(book));
  check("本机：书的那一页 = 原文 + x", lb[page] === BOOK_PAGE + "x", JSON.stringify(lb));
  check("网盘：书的那一页 = 原文 + x", cb[page] === BOOK_PAGE + "x", JSON.stringify(cb));
  check("本机 / 网盘：文本稿没变", (await localText(A, a)) === ORIG_A && (await w.cloudText(a)) === ORIG_A, `${await localText(A, a)} | ${await w.cloudText(a)}`);
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

scenario("换稿 ⑭ 书读得慢 → 接着开文本稿，文本稿先开好：书读回来不接管编辑框，文本稿没被写成书的字", async (w) => {
  const A = await w.device("A");
  const { a, book, page } = await seedTxtAndBook(w, A);
  w.gate.delayMs = 2500;
  await A.eval((n) => { window.__p1 = window.__xhw.openAny(n).then((r) => "ok:" + r, (e) => "threw:" + (e?.message ?? e)); }, book);
  await A.wait(250);
  w.gate.delayMs = 0;
  const r2 = await A.eval((n) => window.__xhw.openAny(n), a); await A.wait(300);
  const mid = await modeSnap(A);
  const r1 = await A.eval(() => window.__p1); await A.wait(300);
  const end = await modeSnap(A);
  check("前提：文本稿先开好", r2 === true && mid.name === a && mid.val === ORIG_A, JSON.stringify(mid));
  check("书那次读回来算被顶掉（false，不抛）", r1 === "ok:false", r1);
  check("书读完后：书没开着、界面不是书的样子、开着的是文本稿、编辑框 = 文本稿原文", !end.projActive && !end.bookUi && !end.parked && end.name === a && end.val === ORIG_A, JSON.stringify(end));
  await A.type("x"); await A.wait(800);
  await A.eval(() => window.__xhw.editor.pushNow()); await A.wait(800);
  check("本机 / 网盘：文本稿 = 原文 + x", (await localText(A, a)) === ORIG_A + "x" && (await w.cloudText(a)) === ORIG_A + "x", `${await localText(A, a)} | ${await w.cloudText(a)}`);
  const lb = await localBook(A, book), cb = await bookPages(await w.cloudBytes(book));
  check("本机 / 网盘：书的那一页没变", lb[page] === BOOK_PAGE && cb[page] === BOOK_PAGE, `${JSON.stringify(lb)} | ${JSON.stringify(cb)}`);
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
});

scenario("换稿 ⑮ 存不上、另存也失败 → 选「导出成 txt 再走」：在下载那张面上取消 = 回到三选；再导出、下载，下载的就是屏上全文，然后换稿；原稿停在上次存上的样子", async (w) => {
  const A = await w.device("A");
  const { a, b } = await seedTwo(w, A);
  if (!(await breakSaves(A, "all"))) { check("能在页面里让写盘失败（测试前提）", false, "store.file is not writable"); await A.close(); return; }
  await A.type("qq");
  await A.eval((n) => { window.__o = window.__xhw.openAny(n).then((x) => "ret:" + x, (e) => "threw:" + String(e?.message ?? e)); }, a);
  await waitSheet(A, CANNOT_KEEP);
  await clickChoice(A, /导出成 txt/);
  await waitSheet(A, /导出没存上的这一篇/);
  const offer = await sheetView(A);
  check("下载那张面：有「下载」", offer.choices.includes("下载"), JSON.stringify(offer));
  await A.page.click("#sheetCancel");
  await waitSheet(A, CANNOT_KEEP);
  check("取消下载 = 回到三选，还没换稿", (await A.eval(() => window.__xhw.editor.state.name)) === b && (await sheetView(A)).choices.length === 3, "");
  await clickChoice(A, /导出成 txt/);
  await waitSheet(A, /导出没存上的这一篇/);
  const dlP = A.page.waitForEvent("download", { timeout: 8000 });
  await clickChoice(A, /^下载$/);
  const dl = await dlP;
  const { readFileSync } = await import("node:fs");
  const got = readFileSync(await dl.path(), "utf8");
  check("下载的文件 = 屏上全文（原文 + 没存上的 qq）", got === ORIG_B + "qq", got);
  check("文件名 = 这一篇的名字 .txt", dl.suggestedFilename() === b.replace(/^.*\//, ""), dl.suggestedFilename());
  const r = await A.eval(() => window.__o); await A.wait(300);
  await A.eval(() => window.__restoreSaves());
  check("交出去之后换稿成了", r === "ret:true", r);
  check("开着的是第一篇、编辑框 = 第一篇原文、能打字", (await A.eval(() => window.__xhw.editor.state.name)) === a && (await A.text()) === ORIG_A && !(await editorReadOnly(A)), await A.text());
  check("第二篇本机 = 上次存上的样子（原文）", (await localText(A, b)) === ORIG_B, await localText(A, b));
  check("第一篇本机 = 原文", (await localText(A, a)) === ORIG_A, await localText(A, a));
  await A.close();   // 不查零报错：这一条故意让写盘抛错
});

scenario("换稿 ⑯ 存不上、另存也失败 → 选「丢掉没存上的字，走」：换稿成了；原稿停在上次存上的样子；书库里没多出东西", async (w) => {
  const A = await w.device("A");
  const { a, b } = await seedTwo(w, A);
  if (!(await breakSaves(A, "all"))) { check("能在页面里让写盘失败（测试前提）", false, "store.file is not writable"); await A.close(); return; }
  await A.type("qq");
  await A.eval((n) => { window.__o = window.__xhw.openAny(n).then((x) => "ret:" + x, (e) => "threw:" + String(e?.message ?? e)); }, a);
  await waitSheet(A, CANNOT_KEEP);
  await clickChoice(A, /丢掉/);
  const r = await A.eval(() => window.__o); await A.wait(300);
  await A.eval(() => window.__restoreSaves());
  check("换稿成了", r === "ret:true", r);
  check("开着的是第一篇、编辑框 = 第一篇原文、能打字", (await A.eval(() => window.__xhw.editor.state.name)) === a && (await A.text()) === ORIG_A && !(await editorReadOnly(A)), await A.text());
  check("第二篇本机 = 原文（qq 丢了，是人选的）", (await localText(A, b)) === ORIG_B, await localText(A, b));
  const names = await libraryNames(A);
  check("书库里还是这两篇", names.length === 2 && names.includes(a) && names.includes(b), JSON.stringify(names));
  await A.type("k"); await A.wait(700);
  check("接着写：第一篇本机 = 原文 + k", (await localText(A, a)) === ORIG_A + "k", await localText(A, a));
  await A.close();   // 不查零报错：这一条故意让写盘抛错
});

scenario("换稿 ⑰ 抽屉里把开着的这一篇移到回收站，可它存不上、另存也失败 → 问人；选「先留着它」= 不扔、还开着、字还在", async (w) => {
  const A = await w.device("A");
  const { a, b } = await seedTwo(w, A);
  if (!(await breakSaves(A, "all"))) { check("能在页面里让写盘失败（测试前提）", false, "store.file is not writable"); await A.close(); return; }
  await A.type("qq");
  await A.eval(() => window.__xhw.drawer.open()); await A.wait(800);
  const clicked = await A.eval((n) => { const row = [...document.querySelectorAll("#docList .doc-row")].find((li) => li.querySelector(".doc-main")?.title === n); if (!row) return false; row.querySelector(".doc-more").click(); return true; }, b);
  check("测试前提：抽屉里找到第二篇那一行", clicked);
  await A.wait(200);
  await A.eval(() => document.querySelector('.popup-menu [data-id="trash"]').click());
  await waitSheet(A, CANNOT_KEEP);
  await clickChoice(A, /先留着它/);
  await A.wait(600);
  check("还开着第二篇、编辑框能打字、字还在", (await A.eval(() => window.__xhw.editor.state.name)) === b && !(await editorReadOnly(A)) && (await A.text()) === ORIG_B + "qq", await A.text());
  const names = await libraryNames(A);
  check("第二篇没进回收站（书库里还在）", names.includes(b) && names.includes(a), JSON.stringify(names));
  await A.eval(() => window.__restoreSaves());
  await A.type("w"); await A.wait(700);
  check("修好后：字都存进第二篇", (await localText(A, b)) === ORIG_B + "qqw", await localText(A, b));
  await A.close();   // 不查零报错：这一条故意让写盘抛错
});

scenario("换稿 ⑱ 冲突面选了云端 → 重载那一下读失败：先只读、状态栏说清楚，过几秒自动再试，读到云端版、能接着写；云端赢家没被旧世界盖掉", async (w) => {
  const A = await w.device("A"), B = await w.device("B");
  const name = await seedTxt(w, A, B, "原文。");
  const CLOUD = "原文。A改了。";
  await A.type("A改了。"); await A.wait(500); await A.pushNow(); await A.wait(300);
  await B.type("B也改了。"); await B.wait(500);
  await B.eval((tg) => {   // 下一次读这一篇失败一次（= 冲突面选了云端之后那次重载）
    const s = window.__xhw.store(), orig = s.file; let left = 1;
    s.file = function (n, o) { const f = orig.call(s, n, o); if (n === tg) { const op = f.open.bind(f); f.open = async (...x) => { if (left > 0) { left--; throw new Error("e2e: read failed once"); } return op(...x); }; } return f; };
    window.__restoreFile = () => { s.file = orig; };
  }, name);
  const push = B.pushNow();
  await B.resolveGate(TAKE_CLOUD);
  await B.page.waitForFunction(() => /没能重新载入这一篇/.test(document.getElementById("toast").textContent ?? ""), null, { timeout: 15000 });
  check("读失败那一下：编辑框只读", await editorReadOnly(B));
  await B.page.waitForFunction((c) => { const e = document.getElementById("editor"); return e.value === c && !e.readOnly; }, CLOUD, { timeout: 10000 }).then(() => check("自动再试成了：编辑框 = 云端版、能打字", true), (e) => check("自动再试成了：编辑框 = 云端版、能打字", false, String(e?.message ?? e)));
  await push.catch(() => {});
  await B.eval(() => window.__restoreFile());
  await B.type("z"); await B.wait(700);
  check("接着写：本机 = 云端版 + z", (await localText(B, name)) === CLOUD + "z", await localText(B, name));
  check("网盘上还是 A 的版本（旧世界没写回去）", (await w.cloudText(name)) === CLOUD, await w.cloudText(name));
  await A.close(); await B.close();   // 不查零报错：这一条故意让读盘失败
});

/** ⑲⑳：A、B 都开着同一篇；B 改了推上去。A 上悄悄快进（refreshIfClean，网盘慢）还在路上时点开另一篇，那一篇读失败——人退回原来那篇。
 *  failAfterMs = 0：读失败得快（快进后到）；> 0：读失败得慢（快进先到、换稿还在路上）。v3.0.18：编辑框留着快进之前的旧字、能写，敲一个字就把 B 的改动盖掉（本机 + 网盘）。 */
async function staleAfterFailedSwap(w, failAfterMs) {
  const A = await w.device("A"), B = await w.device("B");
  const name = await seedTxt(w, A, B, "原文。");
  await A.eval(() => window.__xhw.newDraft({})); await A.wait(300); await A.type("另一篇。"); await A.wait(700);
  const other = await A.eval(() => window.__xhw.editor.state.name);
  await A.eval((n) => window.__xhw.openAny(n), name); await A.wait(600);
  await B.type("B改了。"); await B.wait(500); await B.pushNow(); await B.wait(600);
  const CLOUD = "原文。B改了。";
  if ((await w.cloudText(name)) !== CLOUD) throw new Error("seed: B's edit did not reach the cloud");
  await A.eval(([tg, ms]) => {
    const s = window.__xhw.store(), orig = s.file;
    s.file = function (n, o) { const f = orig.call(s, n, o); if (n === tg) f.open = async () => { if (ms) await new Promise((r) => setTimeout(r, ms)); throw new Error("e2e: read failed"); }; return f; };
    window.__restoreFile = () => { s.file = orig; };
  }, [other, failAfterMs]);
  w.gate.delayMs = 800;
  await A.eval(() => { window.__rf = window.__xhw.editor.refreshIfClean(); });
  await A.wait(200);
  const r = await A.eval((n) => window.__xhw.openAny(n).then(() => "ok", (e) => "threw: " + String(e?.message ?? e)), other);
  await A.eval(() => window.__rf);
  w.gate.delayMs = 0;
  await A.wait(1500);
  await A.eval(() => window.__restoreFile());
  check("测试前提：点开的那一篇读失败了", /threw/.test(r), r);
  check("人还在原来那篇上", (await A.eval(() => window.__xhw.editor.state.name)) === name, await A.eval(() => window.__xhw.editor.state.name));
  check("编辑框 = 快进来的云端版、能打字（不是快进之前的旧字）", (await A.text()) === CLOUD && !(await editorReadOnly(A)), await A.text());
  await A.type("z"); await A.wait(700); await A.pushNow(); await A.wait(800);
  check("接着写：本机 = 云端版 + z", (await localText(A, name)) === CLOUD + "z", await localText(A, name));
  check("网盘 = 云端版 + z（B 的改动还在）", (await w.cloudText(name)) === CLOUD + "z", await w.cloudText(name));
  check("另一篇没被碰", (await localText(A, other)) === "另一篇。", await localText(A, other));
  await A.close(); await B.close();   // 不查零报错：这一条故意让读盘失败
}
scenario("换稿 ⑲ 云端快进还在路上时点开另一篇、那一篇很快读失败（快进后到）→ 人回到原来那篇：编辑框换成云端版，旧的字不盖掉别的设备的改动", (w) => staleAfterFailedSwap(w, 0));
scenario("换稿 ⑳ 云端快进还在路上时点开另一篇、那一篇读了好一会才失败（快进先到）→ 同上", (w) => staleAfterFailedSwap(w, 2500));

// ── v3.0.19 审稿时加（2026-11-10，Claude Fable 5.2；探针 = probe/open-swap/close-window.mjs）：书开着、刚敲了字，两次换稿落在「关这本书（存盘）」的那一下里。
//   ㉑ 在审稿前的提交（ff0bc00）上红：「去文本稿」那一次还没开始读，后来的「开另一本书」没有东西可以取消，两边读完都往编辑框里摆；
//      接着进书库，文本稿编辑器把书的那一页存到自己那一篇名下。现在书接手编辑框之前先问一句文本稿编辑器放下了没有（mode.ts textareaIsOurs）。
//   ㉒ 是反过来的顺序（一直是绿的）：看着那句绊线没有把「后来的文本稿压过先来的书」弄坏。
async function swapsDuringBookClose(w, textFirst) {
  const A = await w.device("A");
  const { a, book, page } = await seedTxtAndBook(w, A);
  await A.type("第二本书的一页。"); await A.wait(500);
  void A.eval(() => window.__xhw.liftDraft());
  await A.page.waitForFunction(() => !document.getElementById("sheet").classList.contains("hidden"), null, { timeout: 8000 });
  await A.page.click("#sheetConfirm");
  await A.page.waitForFunction(() => window.__xhw.project.active(), null, { timeout: 8000 }); await A.wait(500);
  await A.eval(() => window.__xhw.setSidebar(false));
  const book2 = await A.eval(() => window.__xhw.project.name()), page2 = await A.eval(() => window.__xhw.project.current());
  await A.type("脏");   // 第二本书有没存的字：关它要真写一次盘，先来的那次换稿停在这一下里
  const r = await A.eval(async ([txt, bk, tf]) => {
    const go = (n) => window.__xhw.openAny(n).then((x) => "ok:" + x, (e) => "threw:" + String(e?.message ?? e));
    const first = go(tf ? txt : bk), second = go(tf ? bk : txt);
    const [x, y] = [await first, await second];
    return tf ? { t: x, b: y } : { t: y, b: x };
  }, [a, book, textFirst]);
  await A.wait(1200);
  const end = await modeSnap(A);
  check("落定后两边没有同时管着编辑框（书开着 ⇒ 文本稿编辑器放下了）", !(end.projActive && !end.parked), JSON.stringify(end));
  check(textFirst ? "先到的文本稿留下，后来的那本书这一次不开（false，不抛）" : "后来的文本稿压过先来的那本书（书那次 false，不抛）",
    r.t === "ok:true" && r.b === "ok:false" && !end.projActive && !end.bookUi && !end.parked && end.name === a && end.val === ORIG_A, `${JSON.stringify(r)} ${JSON.stringify(end)}`);
  await A.type("x"); await A.wait(700);
  await A.page.click("#libraryButton"); await A.wait(1200);   // 进书库 = 先关书、再让文本稿编辑器放下（把它手上的字存好）
  check("本机：文本稿 = 原文 + x（没被写成书的那一页）", (await localText(A, a)) === ORIG_A + "x", JSON.stringify(await localText(A, a)));
  const lb = await localBook(A, book), lb2 = await localBook(A, book2);
  check("本机：第一本书那一页没变", lb[page] === BOOK_PAGE, JSON.stringify(lb));
  check("本机：第二本书刚敲的字存上了", /脏/.test(lb2[page2] ?? ""), JSON.stringify(lb2));
  check("页面零报错", A.errors.length === 0, A.errors.join(" ; "));
  await A.close();
}
scenario("换稿 ㉑ 书开着、刚敲了字 →「开文本稿」还在关这本书时又来「开另一本书」：只有一边管着编辑框；进书库后文本稿没被写成书的字", (w) => swapsDuringBookClose(w, true));
scenario("换稿 ㉒ 书开着、刚敲了字 → 先「开另一本书」、关书的那一下里再「开文本稿」：后来的文本稿开着，两边都没被写错", (w) => swapsDuringBookClose(w, false));

// ── 选场景 ──
const argv = process.argv.slice(2);
const flag = (name) => argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const flagValue = (name) => { const f = flag(name); return f && f.includes("=") ? f.slice(f.indexOf("=") + 1) : null; };
const wantAreas = argv.filter((a) => a.startsWith("@")).map((a) => a.slice(1));
const wantSubs = argv.filter((a) => !a.startsWith("--") && !a.startsWith("@"));
for (const a of wantAreas) if (!AREAS[a]) { rawLog(`没有 @${a} 这一区。有：${Object.keys(AREAS).map((k) => "@" + k).join(" ")}`); process.exit(2); }
if (flag("list")) {
  for (const [k, v] of Object.entries(AREAS)) { const mine = scenarios.filter((s) => areasOf(s.name).includes(k)); rawLog(`\n@${k}  ${v.title}  （${mine.length} 个）`); for (const s of mine) rawLog("  " + s.name); }
  const orphan = scenarios.filter((s) => areasOf(s.name).length === 0);
  if (orphan.length) { rawLog(`\n没分区的（${orphan.length} 个；npm test 会红）`); for (const s of orphan) rawLog("  " + s.name); }
  process.exit(0);
}
let everything = wantAreas.length === 0 && wantSubs.length === 0 && !flag("changed");
const changedAreas = new Set();
if (flag("changed")) {
  const base = flagValue("changed") ?? "HEAD";
  const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).split("\n").map((x) => x.trim()).filter(Boolean);
  const files = [...new Set([...git("diff", "--name-only", base), ...git("ls-files", "--others", "--exclude-standard")])];
  const notes = new Set();
  rawLog(`改动（相对 ${base}，含没跟踪的）${files.length} 个文件：`);
  for (const f of files) {
    const r = areasForPath(f);
    if (r.areas === "all") everything = true; else for (const a of r.areas) changedAreas.add(a);
    if (r.note) notes.add(r.note);
    rawLog(`  ${f} → ${r.areas === "all" ? "整套" : r.areas.length ? r.areas.map((a) => "@" + a).join(" ") : "—"}（${r.why}）`);
  }
  for (const n of notes) rawLog(`  另外：${n}`);
}
const picked = everything ? scenarios : scenarios.filter((s) => {
  const mine = areasOf(s.name);
  return wantSubs.some((x) => s.name.includes(x)) || wantAreas.some((a) => mine.includes(a)) || mine.some((a) => changedAreas.has(a));
});
if (picked.length === 0) { rawLog(flag("changed") ? "\n没有端到端同步场景要跑（npm run check 就够）。" : "\n没有场景对得上。--list 看有哪些。"); process.exit(0); }

// ── 跑：并行 N 条，慢的先跑（上次的用时记在 tmp/，不进仓）；红了接着跑，最后一起列 ──
const TIMES = new URL("../../tmp/e2e-sync/times.json", import.meta.url);
const jobs = flag("serial") ? 1 : Math.max(1, Number(flagValue("jobs")) || Math.min(12, availableParallelism() - 4));   // 16 核上量过：8 条 93 s、12 条 74 s（下限 = 最慢那个场景 42 s）
const SCENARIO_TIMEOUT_MS = 90_000;   // 一条一条跑时最慢的约 30 s；并行时机器忙，留足
await buildBundle();
server = await startServer();
let times = {};
try { times = JSON.parse(readFileSync(TIMES, "utf8")); } catch { /* 第一次跑 */ }
const queue = [...picked].sort((a, b) => (times[b.name] ?? 1e9) - (times[a.name] ?? 1e9));
rawLog(`\n跑 ${picked.length} / ${scenarios.length} 个场景${everything ? "（整套）" : ""}，并行 ${Math.min(jobs, picked.length)} 条`);
const t0 = Date.now();
const done = [];
async function runOne(s) {
  const ctx = { lines: [], checks: [] };
  const started = Date.now();
  await scope.run(ctx, async () => {
    const w = await createWorld();
    try { await Promise.race([s.fn(w), new Promise((_, rej) => setTimeout(() => rej(new Error(`scenario timed out (${SCENARIO_TIMEOUT_MS / 1000}s)`)), SCENARIO_TIMEOUT_MS))]); }
    catch (e) { check("场景跑完", false, String(e?.message ?? e)); }
    finally { await w.close().catch(() => {}); }
  });
  const ms = Date.now() - started;
  rawLog(`\n── ${s.name}  （${(ms / 1000).toFixed(1)} s）\n${ctx.lines.join("\n")}`);
  done.push({ name: s.name, ms, checks: ctx.checks.length, bad: ctx.checks.filter((ok) => !ok).length, lines: ctx.lines });
}
const solo = queue.filter((s) => SOLO.some((re) => re.test(s.name)));   // 量时长的：等别的都跑完再一条一条跑
for (const s of solo) queue.splice(queue.indexOf(s), 1);
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => { for (let s = queue.shift(); s; s = queue.shift()) await runOne(s); }));
for (const s of solo) await runOne(s);
server.close();
for (const d of done) times[d.name] = d.ms;
try { writeFileSync(TIMES, JSON.stringify(times, null, 1)); } catch { /* 记不上不碍事 */ }
const red = done.filter((d) => d.bad > 0);
const secs = Math.round((Date.now() - t0) / 1000), serial = Math.round(done.reduce((a, d) => a + d.ms, 0) / 1000);
if (red.length) { rawLog("\n红的场景："); for (const d of red) { rawLog(`  ✗ ${d.name}`); for (const l of d.lines.filter((x) => x.startsWith("✗"))) rawLog(`      ${l.slice(0, 300)}`); } }
rawLog(`\n${red.length ? "✗" : "✓"} ${done.length} 个场景、${done.reduce((a, d) => a + d.checks, 0)} 项，${done.reduce((a, d) => a + d.bad, 0)} 项红（${red.length} 个场景）；用时 ${secs} s（一条一条跑要 ${serial} s）`);
process.exit(red.length ? 1 : 0);
