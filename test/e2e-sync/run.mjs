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
  const cloudName = (await w.cloudList("")).map((i) => i.name).find((n) => n.startsWith(stem));   // 加密容器的云端名另有后缀（docKinds 表）
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
  await D.page.waitForFunction(() => window.__xhw.editor.canEdit() || window.__xhw.project.active(), null, { timeout: 5000 });
  check("本机那份摆出来了", (await D.text()).includes("本机这一份。"), await D.text());
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
  // 库缺口：store 2.2.3 collection() 没把 isOnline 递给 createCollection（create-store.js:1300），偏好 / 词库这一路不认离线。库归 user / Fable，这里只照实记；库修了把开关翻成 true = 硬检查。
  const LIBRARY_COLLECTION_HONORS_ISONLINE = false;
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
  check("8 s 左右进闸", dt > 6500 && dt < 10000, String(dt));
  let v = await D.gateView();
  check("正文 = 网盘没有回应", v.message === "网盘没有回应", v.message);
  await D.patchGate({ hangCloud: false });
  await waitPhase(D, "open", 8000);
  v = await D.gateView();
  check("云端回了：不用人点，自己放行", !v.up && v.online && v.bar === null, JSON.stringify(v));
  check("页面零报错", D.errors.length === 0, D.errors.join(" ; "));
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
