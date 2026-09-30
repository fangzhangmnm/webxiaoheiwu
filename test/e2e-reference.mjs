// 参考窗端到端（ADR-0016）：真 app + 真 store + 内存假云，两台设备。created 2026-09-29 by Claude Fable 5.1
//   用法：npm run e2e:ref（不进 npm test：要起无头浏览器）。台子 = test/e2e-sync/harness.mjs。
//   盖到的路：顶栏「+」→「发到参考窗」（链接卡）；侧栏页行 ⋯ →「发到参考窗」；页改了卡跟着换；改名 target 跟着改；
//   窗口开关 / 位置进 editor-state；推云 → 另一台设备打开：卡回来、窗口状态回来、链接从书里现取；
//   文件导入（真漏斗：png → 减肥 → 图片卡）→ 云端 zip 里 `.webxiaoheiwu/references/r1.*`；
//   清单比库新：另一台设备打开 → 状态行如实说、牌组空；她改了页再推 → 云端那份参考目录逐字节没动（原样带着）。
import { buildBundle, startServer, createWorld, makeChecker } from "./e2e-sync/harness.mjs";
import { ensureZipLoaded } from "./zip-node.mjs";
ensureZipLoaded();
const { unpackProject, packProject, REFERENCES_DIR } = await import("../src/project/format.ts");

const { check, failed } = makeChecker();
await buildBundle();
const server = await startServer();
const w = await createWorld();
const td = new TextDecoder(), te = new TextEncoder();
// 8×8 红色 PNG（真图，走真漏斗）
const PNG_RED_8 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFklEQVR4nGP8z4AKmBhQwUjkMxKlDAAI1QEIcUpDQwAAAABJRU5ErkJggg==", "base64");

const refState = (D) => D.eval(() => {
  const el = document.getElementById("referenceWindow");
  const cards = el.deck.cards().map((c) => ({ kind: c.kind, target: c.target, name: c.name, hasBytes: !!c.bytes }));
  const text = el.shadowRoot?.querySelector(".text")?.textContent ?? "";
  return { open: el.open, size: el.deck.size, index: el.deck.index, cards, text, rect: el.rect };
});
/** 点菜单项；返回点下那一刻（同步）书是否已标脏——书的本地落盘 200 ms 就把 dirty 清了，事后读不到。 */
const pickMenu = async (D, id) => { await D.page.waitForSelector(`[role="menuitem"][data-id="${id}"]`, { timeout: 3000 }); const dirty = await D.eval((id) => { document.querySelector(`[role="menuitem"][data-id="${id}"]`).click(); return window.__xhw.project.session()?.dirty ?? null; }, id); await D.wait(300); return dirty; };
const cloudBook = async (name) => { const b = await w.cloudBytes(name); if (!b) throw new Error("book not in cloud: " + name); const r = await unpackProject(new Blob([b])); if (r.kind !== "ok") throw new Error("cloud book unreadable: " + r.kind); return r.project; };

try {
  const A = await w.device("A");
  await A.boot(server.url); await A.type("第一章原文。"); await A.wait(500);
  await A.page.click("#menuButton"); await A.wait(300); await A.page.click("#edgeLift"); await A.wait(300); await A.page.click("#sheetConfirm"); await A.wait(1200);
  await A.eval(() => window.__xhw.setSidebar(false));
  const ch1 = await A.eval(() => window.__xhw.project.current());
  await A.eval(() => window.__xhw.project.newSibling("设定")); await A.wait(300);
  await A.type("夏音：东北规则。"); await A.wait(600);
  const bookName = await A.eval(() => window.__xhw.project.name());
  check("起手：书里两页，参考窗关着、空", (await refState(A)).open === false && (await refState(A)).size === 0);

  // ── 顶栏「+」→ 发到参考窗（当前页 = 设定.txt）──
  await A.page.click("#addPageButton"); const dirty1 = await pickMenu(A, "toRef"); await A.wait(500);
  let s = await refState(A);
  check("顶栏 + → 发到参考窗：一张链接卡（text，target=page:设定.txt，不带字节），窗开了", s.open && s.size === 1 && s.cards[0].kind === "text" && s.cards[0].target === "page:设定.txt" && !s.cards[0].hasBytes, JSON.stringify(s.cards));
  check("卡上的文字 = 从书里现取的那一页", s.text.includes("东北规则"), s.text);
  check("加卡 = 改书（点下那一刻已标脏）", dirty1 === true, String(dirty1));

  // 再发一次同一页 → 不加第二张，只翻过去
  await A.page.click("#addPageButton"); await pickMenu(A, "toRef"); await A.wait(300);
  check("同一页再发 → 不重复加卡", (await refState(A)).size === 1);

  // ── 侧栏页行 ⋯ → 发到参考窗（第一章）──
  await A.eval(() => window.__xhw.setSidebar(true)); await A.wait(400);
  const rowOk = await A.eval((n) => { const rows = [...document.querySelectorAll("#edgeSidebar .edge-row")]; const li = rows.find((r) => r.querySelector(".edge-name")?.textContent === n && r.querySelector(".edge-more")); const b = li?.querySelector(".edge-more"); if (!b) return false; b.click(); return true; }, ch1.replace(/\.txt$/, ""));
  check("侧栏找到「第一章」那一行的 ⋯", rowOk);
  await pickMenu(A, "toRef"); await A.wait(400);
  s = await refState(A);
  check("侧栏行 → 发到参考窗：第二张链接卡，翻到它", s.size === 2 && s.index === 1 && s.cards[1].target === "page:" + ch1 && s.text.includes("第一章原文"), JSON.stringify(s));
  await A.eval(() => window.__xhw.setSidebar(false)); await A.wait(200);

  // ── 页改了 → 卡跟着换 ──
  await A.eval((p) => window.__xhw.project.jump(p), ch1); await A.wait(200);
  await A.type("续写一句。"); await A.wait(800);
  s = await refState(A);
  check("改了第一章 → 卡上的文字跟着换（invalidate → 重取）", s.text.includes("续写一句"), s.text);

  // ── 改名 → target 跟着改 ──
  await A.eval(() => { const t = document.getElementById("nodeTitle"); t.value = "第一章·改名"; window.__xhw.project.commitTitle(); }); await A.wait(400);
  const cur = await A.eval(() => window.__xhw.project.current());
  s = await refState(A);
  check("改名 → 链接卡 target 跟着改、内容还在", cur === "第一章·改名.txt" && s.cards[1].target === "page:第一章·改名.txt" && s.text.includes("第一章原文"), `${cur} / ${JSON.stringify(s.cards)}`);

  // ── 拖窗口位置（程序性 rect）→ 进 editor-state；推云 ──
  await A.eval(() => { const el = document.getElementById("referenceWindow"); el.rect = { left: 40, top: 120, width: 320, height: 260 }; });
  await A.wait(300);
  const rectA = (await refState(A)).rect;   // 组件会钳制（出血区 / 视口），拿它报的实际值当基准
  await A.eval(() => window.__xhw.project.flushLocal()); await A.wait(300);
  await A.pushNow(); await A.wait(800);
  const cloud1 = await cloudBook(bookName);
  const refKeys = [...cloud1.references.keys()];
  check("云端 zip 有参考目录：manifest.json（只有链接卡 → 没有字节文件）", refKeys.join("|") === `${REFERENCES_DIR}manifest.json`, refKeys.join("|"));
  const man1 = JSON.parse(td.decode(cloud1.references.get(`${REFERENCES_DIR}manifest.json`)));
  check("清单：version 1、两张卡、target 带页名、index=1", man1.version === 1 && man1.items.length === 2 && man1.items[0].target === "page:设定.txt" && man1.items[1].target === "page:第一章·改名.txt" && man1.index === 1, JSON.stringify(man1));
  check("editor-state.refPanel：开着 + 位置 = 组件实际摆的位置", cloud1.editorState.refPanel?.open === true && cloud1.editorState.refPanel.left === Math.round(rectA.left) && cloud1.editorState.refPanel.width === Math.round(rectA.width), JSON.stringify(cloud1.editorState.refPanel) + " vs " + JSON.stringify(rectA));

  // ── 文件导入（真漏斗）──
  await A.page.setInputFiles("#referenceFileInput", { name: "pose.png", mimeType: "image/png", buffer: PNG_RED_8 }); await A.wait(1200);
  s = await refState(A);
  check("导入 png → 第三张 = 图片卡（带字节）", s.size === 3 && s.cards[2].kind === "image" && s.cards[2].hasBytes && s.cards[2].name === "pose.png", JSON.stringify(s.cards));
  await A.eval(() => window.__xhw.project.flushLocal()); await A.wait(300); await A.pushNow(); await A.wait(800);
  const cloud2 = await cloudBook(bookName);
  const r2 = [...cloud2.references.keys()].find((k) => /\/r2\.(png|jpg)$/.test(k));
  check("云端 zip：图片卡的字节文件落在 .webxiaoheiwu/references/r2.*", !!r2 && cloud2.references.get(r2).length > 0, [...cloud2.references.keys()].join("|"));

  // ── 另一台设备打开：卡回来、窗口状态回来、链接现取 ──
  const B = await w.device("B");
  await B.boot(server.url); await B.wait(800);
  await B.eval((n) => window.__xhw.openAny(n), bookName); await B.wait(1500);
  s = await refState(B);
  check("B 打开同一本：三张卡回来（两张链接 + 一张图片）、翻在第 3 张、窗开着、位置一样", s.size === 3 && s.index === 2 && s.open && s.cards[0].target === "page:设定.txt" && s.cards[2].kind === "image" && Math.round(s.rect.left) === Math.round(rectA.left) && Math.round(s.rect.width) === Math.round(rectA.width), JSON.stringify(s));
  await B.eval(() => document.getElementById("referenceWindow").deck.select(0)); await B.wait(300);
  s = await refState(B);
  check("B 翻到链接卡：内容是 B 本地这本书里的那一页", s.text.includes("东北规则"), s.text);
  const dirtyB = await B.eval(() => window.__xhw.project.session()?.dirty);
  check("B 只是打开 + 翻页 → 不标脏（翻页 / 窗口不算改动）", dirtyB === false, String(dirtyB));
  // 废弃 = 改名 `_废-`（ADR-0014 §8）→ 卡跟着改名、内容还在；彻底删除 → 卡上如实说
  await B.eval(() => window.__xhw.project.jump("设定.txt")); await B.wait(200);
  await B.eval(() => window.__xhw.project.discardPage("设定.txt")); await B.wait(600);
  s = await refState(B);
  const disc = await B.eval(() => window.__xhw.project.lastDiscarded()[0]?.to);
  check("废弃「设定」页 → 链接卡 target 跟着改成 _废- 名、内容还在", !!disc && s.cards[0].target === "page:" + disc && s.text.includes("东北规则"), `${disc} / ${JSON.stringify(s.cards[0])} / ${s.text}`);
  await B.eval((n) => window.__xhw.project.purgePage(n), disc); await B.wait(600);
  s = await refState(B);
  check("彻底删除那一页 → 链接卡取不到内容，卡上写「已不在书里」", s.text.includes("已不在书里") || s.text.includes("no longer"), s.text);
  await B.close();

  // ── 清单比库新：原样带着 ──
  const proj = await cloudBook(bookName);
  const tooNew = te.encode(JSON.stringify({ version: 99, index: 0, items: [{ kind: "hologram", src: "r0.holo" }], future: true }));
  proj.references = new Map([[`${REFERENCES_DIR}manifest.json`, tooNew], [`${REFERENCES_DIR}r0.holo`, new Uint8Array([7, 7, 7])]]);
  proj.editorState.refPanel = { open: true, left: 10, top: 90, width: 300, height: 200 };
  const blob = await packProject(proj);
  const item = await w.provider.getItemByPath(bookName);
  await w.provider.upload(bookName, blob, { eTag: item.eTag, conflictBehavior: "replace" });
  const C = await w.device("C");
  await C.boot(server.url); await C.wait(800);
  await C.eval((n) => window.__xhw.openAny(n), bookName); await C.wait(1500);
  s = await refState(C);
  const toast = await C.eval(() => document.getElementById("toast")?.textContent ?? "");
  check("C 打开清单 v99 的书：牌组空、状态行如实说「新版本写的」", s.size === 0 && /新版本|newer version/.test(toast), `size=${s.size} toast=${toast.slice(0, 80)}`);
  await C.eval((p) => window.__xhw.project.jump(p), "第一章·改名.txt"); await C.wait(200);
  await C.type("C 又写了一句。"); await C.wait(800);
  await C.eval(() => window.__xhw.project.flushLocal()); await C.wait(300); await C.pushNow(); await C.wait(800);
  const cloud3 = await cloudBook(bookName);
  const manC = cloud3.references.get(`${REFERENCES_DIR}manifest.json`), holo = cloud3.references.get(`${REFERENCES_DIR}r0.holo`);
  check("C 改了页再推：云端参考目录逐字节没动（v99 清单 + r0.holo 原样带回）", manC && td.decode(manC) === td.decode(tooNew) && holo && Array.from(holo).join() === "7,7,7", [...cloud3.references.keys()].join("|"));
  check("C 的正文改动确实推上去了", (td.decode(cloud3.contents.get("第一章·改名.txt")) ?? "").includes("C 又写了一句"), "");
  await C.close();

  // ── 粘贴归焦点（库 0.3.1，user 2026-09-30「这个看 focus 吧」「ctrl v 文字 图片…是最高频的核心使用场景」）──
  await A.ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  await A.eval((n) => window.__xhw.project.jump(n), "第一章·改名.txt"); await A.wait(200);
  const before = await refState(A);
  // 文字：焦点在正文 → 进正文，不进参考窗
  await A.eval(() => navigator.clipboard.writeText("剪贴板里的设定文字"));
  await A.eval(() => { document.getElementById("editor").focus(); const e = document.getElementById("editor"); e.setSelectionRange(e.value.length, e.value.length); });
  await A.page.keyboard.press("Control+V"); await A.wait(400);
  check("焦点在正文 → Ctrl+V 文字进正文、参考窗不变", (await A.text()).includes("剪贴板里的设定文字") && (await refState(A)).size === before.size, `size=${(await refState(A)).size}`);
  // 文字：点一下参考窗（窗身）→ 拿焦点 → Ctrl+V 进参考窗（文字卡）
  await A.eval(() => document.getElementById("referenceWindow").focus());
  check("参考窗 focus() 后 hasFocus", await A.eval(() => document.getElementById("referenceWindow").hasFocus));
  await A.page.keyboard.press("Control+V"); await A.wait(500);
  s = await refState(A);
  check("焦点在参考窗 → Ctrl+V 文字 = 新文字卡（带字节，非链接）", s.size === before.size + 1 && s.cards[s.size - 1].kind === "text" && s.cards[s.size - 1].hasBytes && s.text.includes("剪贴板里的设定文字"), JSON.stringify(s.cards[s.size - 1]) + " / " + s.text.slice(0, 40));
  // 图片：焦点在正文 → 先弹确认（不确认不加页）；焦点在参考窗 → 图片卡
  await A.eval(async () => { const c = document.createElement("canvas"); c.width = 16; c.height = 16; const g = c.getContext("2d"); g.fillStyle = "#f00"; g.fillRect(0, 0, 16, 16); const blob = await new Promise((r) => c.toBlob(r, "image/png")); await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); });   // 探针造图：Chromium 会重编码，必须是真 PNG
  await A.eval(() => document.getElementById("editor").focus());
  const pagesBefore = await A.eval(() => window.__xhw.project.nodeNames().length);
  await A.page.keyboard.press("Control+V"); await A.wait(600);
  const sheetUp = await A.eval(() => !document.getElementById("sheet").classList.contains("hidden"));
  check("焦点在正文 → Ctrl+V 图片先弹确认 sheet（user「不小心按一下太坑了」）", sheetUp);
  await A.eval(() => document.getElementById("sheetCancel")?.click()); await A.wait(400);
  check("取消 → 没有加页", (await A.eval(() => window.__xhw.project.nodeNames().length)) === pagesBefore);
  await A.eval(() => document.getElementById("referenceWindow").focus());
  await A.page.keyboard.press("Control+V"); await A.wait(1200);
  s = await refState(A);
  check("焦点在参考窗 → Ctrl+V 图片 = 图片卡（走减肥漏斗）", s.size === before.size + 2 && s.cards[s.size - 1].kind === "image" && s.cards[s.size - 1].hasBytes, JSON.stringify(s.cards.map((c) => c.kind)));
  check("Ctrl+V 图片没有变成新页", (await A.eval(() => window.__xhw.project.nodeNames().length)) === pagesBefore);
  // 侧栏入口开窗 = 顺手给焦点（「开窗 → Ctrl+V」一步到位）
  await A.eval(() => { document.getElementById("referenceWindow").open = false; document.getElementById("editor").focus(); });
  await A.eval(() => window.__xhw.setSidebar(true)); await A.wait(300);
  await A.page.click("#edgeReference"); await A.wait(300);
  check("侧栏「参考窗」入口打开 → 窗开且有焦点", (await refState(A)).open && (await A.eval(() => document.getElementById("referenceWindow").hasFocus)));
  await A.eval(() => window.__xhw.setSidebar(false));

  const errs = [...A.errors];
  check("零页面错误", errs.length === 0, errs.join("\n"));
  await A.close();
} finally {
  await w.close(); server.close();
}
console.log(failed() ? `\n${failed()} 项失败` : "\n参考窗 e2e 全过");
process.exit(failed() ? 1 : 0);
