// 换稿：「开着的是谁」和「编辑框里的字」同一步换——结构守卫（读源码文本）。created 2026-11-10 by Claude Opus 5.5
//   设计稿 = 家族根 ai-docs/20261110-design-wxhw-open-swap-fix.md §4「结构守卫」；毛病 = ai-docs/20261110-audit-cross-write-on-open.md。
//   行为本身在端到端：test/e2e-sync/run.mjs「换稿 ①–⑧」（真 app + 真库 + 真 IndexedDB；editor.ts 直连库和浏览器存储，没有单元架子）。
import { readFileSync } from "node:fs";
import { describe, it, assert, eq } from "./runner.mjs";

const ed = readFileSync("src/editor.ts", "utf8");
const app = readFileSync("src/app.ts", "utf8");

/** 某个函数（`function name(` / `name: async (` / `async function name(`）的函数体：从头部后第一个 `{` 起数括号。 */
function body(src, header) {
  const i = src.search(header);
  if (i < 0) throw new Error("function not found: " + header);
  const open = src.indexOf("{", src.indexOf(")", i));
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}" && --depth === 0) return { start: open, end: k + 1, text: src.slice(open, k + 1) };
  }
  throw new Error("unbalanced: " + header);
}
const SHOW = /function show\(/, RENAME = /function renameIdentity\(/, RELEASE = /function releaseIdentity\(/;
const ASSIGN_NAME = /\bst\.name\s*=(?!=)/g, ASSIGN_TEXT = /\bd\.editor\.value\s*=(?!=)/g;

describe("换稿守卫 · 名字和内容只在 show 里一起换（不变量甲）", () => {
  it("st.name = 只出现在 show / renameIdentity / releaseIdentity 里", () => {
    const cuts = [SHOW, RENAME, RELEASE].map((h) => body(ed, h)).sort((a, b) => b.start - a.start);
    let rest = ed;
    for (const c of cuts) rest = rest.slice(0, c.start) + rest.slice(c.end);
    eq((rest.match(ASSIGN_NAME) ?? []).length, 0, "别处没有 st.name =");
    for (const h of [SHOW, RENAME, RELEASE]) assert(/\bst\.name\s*=(?!=)/.test(body(ed, h).text), `${h.source} 里有 st.name =`);
  });
  it("d.editor.value = 只出现在 show 里", () => {
    const s = body(ed, SHOW);
    const rest = ed.slice(0, s.start) + ed.slice(s.end);
    eq((rest.match(ASSIGN_TEXT) ?? []).length, 0, "别处没有 d.editor.value =");
    assert(/\bd\.editor\.value\s*=(?!=)/.test(s.text), "show 里换编辑框的字");
    assert(/holds\s*=\s*next\.name/.test(s.text), "show 里同一步记下编辑框里是谁的字");
  });
  it("show 函数体里没有 await（同一个同步步骤）", () => {
    assert(!/\bawait\b/.test(body(ed, SHOW).text), "show 是同步的");
  });
  it("open：await readDoc( 之前不碰 st.name / setActiveDoc / 上次打开的记录 / show", () => {
    const o = body(ed, /async function open\(name: string/).text;
    const pre = o.slice(0, o.indexOf("await readDoc(")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");   // 注释不算
    assert(pre.length > 0, "open 里有 await readDoc(");
    for (const bad of [/\bst\.name\s*=(?!=)/, /setActiveDoc\(/, /KV_LAST_OPEN/, /\bshow\(/, /d\.editor\.value\s*=(?!=)/]) assert(!bad.test(pre), `读之前不许 ${bad.source}`);
    assert(/await leaveCurrent\(\)/.test(pre), "读之前先 leaveCurrent（冻结 + 保存全部做完）");
  });
});

describe("换稿守卫 · 离开前保存全部做完、离开时不收字（不变量乙 / 丙）", () => {
  it("flushLocal / leaveCurrent / settleSaves 问的是 canPersist，不是 canEdit（冻结期间旧稿的保存照常落）", () => {
    for (const h of [/async function flushLocal\(/, /async function leaveCurrent\(/, /async function settleSaves\(/]) {
      const b = body(ed, h).text;
      assert(/canPersist\(\)/.test(b), `${h.source} 用 canPersist()`);
      assert(!/canEdit\(\)/.test(b), `${h.source} 不用 canEdit()`);
    }
  });
  it("canEdit = canPersist ∧ 不在换稿途中；守卫（readOnly）看 canEdit", () => {
    assert(/const canEdit = \(\) => canPersist\(\) && switching === null;/.test(ed), "canEdit 的定义");
    assert(/const blocked = !canEdit\(\);/.test(body(ed, /function applyGuards\(/).text), "applyGuards 看 canEdit");
  });
  it("leaveCurrent 先冻结再等保存：switching = 在第一个 await 之前", () => {
    const b = body(ed, /async function leaveCurrent\(/).text;
    const iFreeze = b.indexOf("switching = tok"), iAwait = b.indexOf("await ");
    assert(iFreeze > 0 && iAwait > iFreeze, "先冻结，后 await");
    assert(/await settleSaves\(\)/.test(b), "等 settleSaves");
  });
  it("换稿的入口都走 leaveCurrent，不再只 flushLocal（open / newDoc / park / leave）", () => {
    for (const h of [/async function open\(name: string/, /async function newDoc\(/, /park: async \(\)/, /leave: async \(\)/]) {
      const b = body(ed, h).text;
      assert(/await leaveCurrent\(/.test(b), `${h.source} 走 leaveCurrent`);
      assert(!/flushLocal\(\)/.test(b), `${h.source} 不再只 flushLocal`);
    }
  });
  it("保存是一条真队列（persistChain），settleSaves 等改名落地", () => {
    assert(/persistChain\.then\(run, run\)/.test(body(ed, /function persist\(push: boolean\)/).text), "persist 排进队尾");
    const s = body(ed, /async function settleSaves\(/).text;
    assert(/await renaming/.test(s) && /await persistChain/.test(s) && /localTimer/.test(s), "等改名、等队列、清定时器");
    for (const h of [/async function renameTo\(/, /async function moveTo\(/]) assert(/trackRename\(/.test(body(ed, h).text), `${h.source} 登记在飞的改名`);
  });
  it("改名 / 挪夹 / 加密切换 / 换钥匙 / 推送 在换稿途中不起跑", () => {
    for (const h of [/async function renameTo\(/, /async function moveTo\(/, /async function toggleEncryption\(/, /async function rekeyToCurrent\(/]) assert(/switching !== null/.test(body(ed, h).text), `${h.source} 看 switching`);
    assert(/if \(!canEdit\(\)\) return;/.test(body(ed, /async function pushNow\(/).text), "pushNow 看 canEdit");
    assert(/switching !== null/.test(body(ed, /async function refreshIfClean\(/).text), "refreshIfClean 换稿途中不去问");
  });
});

describe("换稿守卫 · 保存起跑时核对（第三层）", () => {
  it("persistOnce 取字之后、写之前：holds !== st.name 就不写", () => {
    const b = body(ed, /async function persistOnce\(/).text;
    const iText = b.indexOf("const text = d.editor.value"), iTrip = b.indexOf("holds !== st.name"), iSave = b.indexOf("saveDoc(");
    assert(iText > 0 && iTrip > iText && iSave > iTrip, "先取字、再核对、后写");
    assert(/if \(!canPersist\(\)\) return;/.test(b), "保存问 canPersist");
  });
});

describe("换稿守卫 · app 那一头", () => {
  it("openAny：editor.resume() 和 editor.open( 之间没有 await（解开之后立刻冻结）", () => {
    const b = body(app, /async function openAny\(name: string/).text;
    const iRes = b.lastIndexOf("editor.resume()"), iOpen = b.indexOf("editor.open(");
    assert(iRes > 0 && iOpen > iRes, "先 resume 后 open");
    assert(!/\bawait\b/.test(b.slice(iRes, iOpen)), "中间没有 await");
  });
  it("回收站那条路：先 editor.leave() 再 editor.clear()；没离开就不扔（v3.0.19）", () => {
    const b = body(app, /onActiveTrashed: async \(\) =>/).text;
    const iLeave = b.indexOf("await editor.leave()"), iClear = b.lastIndexOf("editor.clear(");
    assert(iLeave > 0 && iClear > iLeave, "leave 在 clear 前面");
    assert(/if \(!\(await editor\.leave\(\)\)\) return false;/.test(b), "没离开 = 返回 false");
    assert(/if \(wasActive && !\(await d\.onActiveTrashed\(\)\)\) return;/.test(readFileSync("src/drawer.ts", "utf8")), "抽屉：false 就不扔");
  });
  it("放下编辑器（进书 / 进书库 / 新建书 / 开本机的书）没放下就不往下走", () => {
    const hits = app.match(/editor\.park\(\)/g) ?? [];
    const guarded = app.match(/!\(await editor\.park\(\)\)/g) ?? [];
    assert(hits.length >= 4, "四处调 park");
    eq(guarded.length, hits.length, "每一处都看返回值");
  });
  it("登录后换到远端 lastActive：等开机那一篇读完（bootDocReady）再比，且不挡住这一轮登录", () => {
    const b = body(app, /function afterSignIn\(\)/).text;
    assert(/void bootDocReady\.then\(/.test(b), "排在 bootDocReady 之后、不 await");
  });
});

// ── v3.0.19（2026-11-10，Claude Opus 5.5；方案 = 家族根 ai-docs/20261110-review-wxhw-open-swap-fix.md 第五节）。行为在端到端「换稿 ⑬–⑱」。──
const mode = readFileSync("src/project/mode.ts", "utf8");
describe("换稿守卫 · 同一时刻只有一个模式管着编辑框（不变量丁）", () => {
  it("park：离开这一篇之后、放下之前 loadGen++（在飞的 open / reload / refreshIfClean 读回来自己收手）", () => {
    const b = body(ed, /park: async \(\)/).text;
    const iLeave = b.indexOf("await leaveCurrent("), iGen = b.indexOf("loadGen++"), iPark = b.indexOf("parked = true");
    assert(iLeave > 0 && iGen > iLeave && iPark > iGen, "leaveCurrent → loadGen++ → parked");
  });
  it("show 开头的绊线：放下着就不摆字", () => {
    const b = body(ed, SHOW).text;
    assert(/^\{\s*(\/\/[^\n]*\n\s*)*if \(parked\)/.test(b), "第一句是 if (parked)");
  });
  it("open 读回来：被放下 / 新稿 / 又一次换稿压过 = 不摆（loadGen 和 switchSeq 都核）", () => {
    const b = body(ed, /async function open\(name: string/).text;
    assert(/const superseded = \(\) => gen !== loadGen \|\| switchSeq !== tok/.test(b), "superseded 两样都看");
    const after = b.slice(b.indexOf("await readDoc(name)"));
    assert(!/if \(gen !== loadGen\) return false/.test(after), "readDoc 之后不再只看 loadGen");
    eq((after.match(/if \(superseded\(\)\) return false/g) ?? []).length, 5, "每个 await 之后都核");
  });
  it("书还没开着时，文本稿接管编辑框之前作废那一次开书（leaveProject / 进书库 / 回收站那条路）", () => {
    assert(/function abandonOpen\(\): void \{ if \(!active\(\)\) gen\+\+; \}/.test(mode), "mode.abandonOpen = 书没开着时 gen++");
    assert(/if \(!project\.active\(\)\) \{ project\.abandonOpen\(\); return; \}/.test(body(app, /async function leaveProject\(\)/).text), "leaveProject 书没开着的分支");
    assert(/else project\.abandonOpen\(\)/.test(body(app, /async function releaseForLibrary\(\)/).text), "进书库");
    assert(/project\.abandonOpen\(\)/.test(body(app, /onActiveTrashed: async \(\) =>/).text), "回收站那条路");
  });
  it("开书 / 新建书 / 开本机的书：切成书的样子之前核对「开着的就是它」", () => {
    for (const [h, open, check] of [[/async function openAny\(name: string/, "project.openStore(", "if (!bookIsOpen(name)) return false;"], [/async function newProjectFlow\(\)/, "project.createInStore(", "if (!bookIsOpen(name)) return;"], [/async function openLocalHome\(lh: LocalHome\)/, "project.openLocal(lh)", "h.home === lh"]]) {
      const b = body(app, h).text;
      const iOpen = b.indexOf(open), iCheck = b.indexOf(check), iSet = b.indexOf('document.body.dataset.project = "1"');
      assert(iOpen > 0 && iCheck > iOpen && iSet > iCheck, `${h.source}：开 → 核 → 设 dataset.project`);
    }
    assert(/const bookIsOpen = \(name: string\): boolean => project\.active\(\) && project\.name\(\) === name/.test(app), "bookIsOpen 的定义");
    const c = body(mode, /async function createInStore\(/).text;
    assert(/await s\.flush\(false\);\s*if \(g !== gen\) return;/.test(c), "createInStore 落盘之后核代数");
  });
  it("第三层：两边保存起跑时问「编辑框归不归我」，app 两边都注入", () => {
    const p = body(ed, /async function persistOnce\(/).text;
    const iOwn = p.indexOf("d.ownsTextarea && !d.ownsTextarea()"), iCreate = p.indexOf("createDoc("), iSave = p.indexOf("saveDoc(");
    assert(iOwn > 0 && iCreate > iOwn && iSave > iOwn, "文本稿：建稿 / 存稿之前");
    const c = body(mode, /function commitTextarea\(\)/).text;
    const iOwnB = c.indexOf("d.ownsTextarea && !d.ownsTextarea()"), iSet = c.indexOf("setCurrentText(");
    assert(iOwnB > 0 && iSet > iOwnB, "书：收进内存图之前");
    assert(/ownsTextarea: \(\) => !project\.active\(\)/.test(app) && /ownsTextarea: \(\) => editor\.isParked\(\)/.test(app), "app 两边都接上");
  });
});
describe("换稿守卫 · 存不上、也另存不了时的出口（user 2026-11-10「同意，挽留，加出口，这时候应该有导出对吧」）", () => {
  it("leaveCurrent：另存失败才问人；只有 go 才接着走，别的一律解冻留下", () => {
    const b = body(ed, /async function leaveCurrent\(/).text;
    const iKeep = b.indexOf("await keepAside()"), iAsk = b.indexOf("askLeaveAnyway("), iGo = b.indexOf('if (answer === "go") return tok;'), iStay = b.indexOf("switching = null; applyGuards();");
    assert(iKeep > 0 && iAsk > iKeep && iGo > iAsk && iStay > iGo, "keepAside → 问 → go 才走 → 否则解冻");
    assert(/cannotKeepAsk \?\?=/.test(body(ed, /function askLeaveAnyway\(/).text), "同一时刻只问一次");
  });
  it("app 的三选：默认留下；导出走「好了」那张面、交出去了才走；别的面开着不弹", () => {
    const b = body(app, /async function cannotKeepFlow\(/).text;
    assert(/if \(isSheetOpen\(\) \|\| isBusyActive\(\)\) return "not-asked";/.test(b), "别的面 / 遮罩开着不弹");
    assert(/value: "stay" as const, primary: true/.test(b), "留下是默认（primary）");
    assert(/if \(v !== "export"\) return "stay";/.test(b), "取消 = 留下");
    assert(/if \(await offerFiles\(\[file\]/.test(b), "导出走 offerFiles，交出去了才 go");
    assert(/Promise<boolean>/.test(app.slice(app.indexOf("async function offerFiles("), app.indexOf("async function offerFiles(") + 200)), "offerFiles 报交没交出去");
  });
});
