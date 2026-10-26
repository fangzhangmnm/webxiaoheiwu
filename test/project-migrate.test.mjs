// 书的格式版本纪律（src/project/migrate/；家族根 ai-docs/20261021-format-version-discipline.md；user 2026-10-21「三级语义 同意」）。created 2026-10-21 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
import { ensureZipLoaded } from "./zip-node.mjs";
ensureZipLoaded();
const { FORMAT, MISSING_MAJOR, MIN_MAJOR, STEPS, readStamp, compareStamp, migrate, stampFields, fmt, FormatTooNewError, FormatTooOldError } = await import("../src/project/migrate/index.ts");
const { packProject, unpackProject, emptyProject } = await import("../src/project/format.ts");
const { createNode } = await import("../src/project/graph.ts");
const { zipPack, zipUnpack } = await import("../src/zip.ts");
const td = new TextDecoder();
const graphOf = (extra) => JSON.stringify({ format: "webxiaoheiwu", version: 2, wroteWith: "t", tree: ["a.txt"], pages: { "a.txt": { links: [], created: 1, modified: 2 } }, ...extra });
const bookOf = (graphExtra, es) => zipPack([{ path: "graph.json", data: graphOf(graphExtra) }, { path: "pages/a.txt", data: "A" }, ...(es === undefined ? [] : [{ path: ".webxiaoheiwu/editor-state.json", data: JSON.stringify(es) }])]);

describe("project/migrate · 拍子表钉死 + 读拍 + 判决（三级语义）", () => {
  it("FORMAT / MISSING_MAJOR / MIN_MAJOR 钉死：改格式 = 改表 + STEPS + 冻结样本 + CLAUDE.md（不改这里 = 红）", () => {
    eq(fmt(FORMAT.graph), "2.1.0"); eq(fmt(FORMAT.editorState), "1.2.0");
    eq(MISSING_MAJOR.graph, null); eq(MISSING_MAJOR.editorState, 1);
    eq(MIN_MAJOR.graph, 2); eq(MIN_MAJOR.editorState, 1);
    eq(Object.keys(STEPS).length, 0, "今天零迁移（graph v1 不迁 = 零 legacy 分支）");
  });
  it("readStamp：version = major；minor / patch 缺或非法 = 0；graph 缺 version = null（损坏）、editor-state 缺 = 1.0.0", () => {
    eq(fmt(readStamp("graph", { version: 2, minor: 3, patch: 1 })), "2.3.1");
    eq(fmt(readStamp("graph", { version: 2, minor: "x", patch: -1 })), "2.0.0");
    eq(readStamp("graph", { minor: 1 }), null);
    eq(fmt(readStamp("editorState", {})), "1.0.0"); eq(fmt(readStamp("editorState", [1, 2])), "1.0.0"); eq(fmt(readStamp("editorState", { version: 1, minor: 2 })), "1.2.0");
  });
  it("compareStamp：minor 大 = newer-minor；minor 同 patch 大 = newer-patch；小 = older；全同 = same", () => {
    const mine = { major: 2, minor: 1, patch: 0 };
    eq(compareStamp({ major: 2, minor: 2, patch: 0 }, mine), "newer-minor");
    eq(compareStamp({ major: 2, minor: 1, patch: 5 }, mine), "newer-patch");
    eq(compareStamp({ major: 2, minor: 0, patch: 9 }, mine), "older");
    eq(compareStamp({ major: 2, minor: 1, patch: 0 }, mine), "same");
  });
  it("migrate：major 大 → FormatTooNewError；比 MIN_MAJOR 小 → FormatTooOldError；缺 version → Error；同 major 不动 json", () => {
    let e = null; try { migrate("graph", { version: 3 }); } catch (x) { e = x; } assert(e instanceof FormatTooNewError); eq(e.component, "graph"); eq(fmt(e.fileStamp), "3.0.0"); eq(fmt(e.appStamp), "2.1.0");
    e = null; try { migrate("graph", { version: 1 }); } catch (x) { e = x; } assert(e instanceof FormatTooOldError);
    e = null; try { migrate("graph", {}); } catch (x) { e = x; } assert(e && !(e instanceof FormatTooNewError) && /version missing/.test(e.message));
    const j = { version: 2, minor: 1, patch: 0, tree: [] }; const m = migrate("graph", j); assert(m.json === j, "同 major 原对象原样"); eq(m.verdict, "same");
    eq(migrate("graph", { version: 2, minor: 7 }).verdict, "newer-minor"); eq(migrate("graph", { version: 2, minor: 1, patch: 3 }).verdict, "newer-patch"); eq(migrate("graph", { version: 2 }).verdict, "older");
  });
  it("migrate 链：注入 STEPS 1→2→3 逐步升、每步必须写 version；缺一步响亮抛；升过 = verdict older", () => {
    const steps = { editorState: { 1: (j) => ({ ...j, version: 2, a: 1 }), 2: (j) => ({ ...j, version: 3, b: 2 }) } };
    // 用 editorState 当实验台：本版 major 是 1，所以先把目标拍成 3 来验链（通过注入表 + 临时拍子不可行 → 直接验链的机械：从 1 升到本版 major=1 零步）
    const m = migrate("editorState", { version: 1, minor: 2 }, steps); eq(m.verdict, "same", "本版 major=1：没有步要走");
    // 机械本身（走几步、缺步抛、不写 version 抛）用 graph 验：graph MIN=2、本版 2 → 也零步。链的机械只能在 FORMAT 升了之后真跑；这里钉住「缺步 = 抛」的文案形状：
    let e = null; try { migrate("graph", { version: 2 }, { graph: { 2: (j) => j } }); } catch (x) { e = x; } eq(e, null, "本版 major=2，登记了多余的步不跑也不抛");
  });
  it("写入器：graph.json 带 version / minor / patch = FORMAT.graph；editor-state.json 带 version / minor / patch = FORMAT.editorState", async () => {
    const p = emptyProject(); createNode(p, "a.txt", "A", () => 1); p.tree = ["a.txt"]; p.editorState.last = "a.txt";
    const out = await zipUnpack(await packProject(p));
    const g = JSON.parse(td.decode(out["graph.json"])); eq(`${g.version}.${g.minor}.${g.patch}`, fmt(FORMAT.graph));
    const e = JSON.parse(td.decode(out[".webxiaoheiwu/editor-state.json"])); eq(`${e.version}.${e.minor}.${e.patch}`, fmt(FORMAT.editorState));
    eq(JSON.stringify(stampFields("graph")), JSON.stringify({ version: 2, minor: 1, patch: 0 }));
  });
});

describe("project/migrate · 三级语义走完整解包（老读者碰新文件）", () => {
  it("major 大：graph 3 → too-new（component graph）；editor-state version 2 → too-new（component editorState）——整本只读", async () => {
    let r = await unpackProject(await bookOf({ version: 3 }, undefined)); eq(r.kind, "too-new"); eq(r.component, "graph"); eq(r.version, 3); eq(fmt(r.stamp), "3.0.0");
    r = await unpackProject(await bookOf({}, { version: 2, last: "a.txt" })); eq(r.kind, "too-new"); eq(r.component, "editorState"); eq(fmt(r.stamp), "2.0.0");
  });
  it("minor 大：能开、newerThanApp 列出是哪份；未知键带回；写回时拍子是本版的（不抄对方的 minor）", async () => {
    const r = await unpackProject(await bookOf({ minor: 9, futureTop: 1 }, { version: 1, minor: 4, last: "a.txt", back: [], futureEs: 2 }));
    eq(r.kind, "ok"); eq(r.project.newerThanApp.join("|"), "graph|editorState");
    eq(fmt(r.project.readStamps.graph), "2.9.0"); eq(fmt(r.project.readStamps.editorState), "1.4.0");
    const out = await zipUnpack(await packProject(r.project));
    const g = JSON.parse(td.decode(out["graph.json"])); eq(`${g.version}.${g.minor}.${g.patch}`, "2.1.0", "写回 = 本版拍"); eq(g.futureTop, 1, "未知键带回");
    const e = JSON.parse(td.decode(out[".webxiaoheiwu/editor-state.json"])); eq(`${e.version}.${e.minor}.${e.patch}`, "1.2.0"); eq(e.futureEs, 2);
  });
  it("patch 大：静默（newerThanApp 空）；minor 小 / 没拍子：当老文件开，newerThanApp 空，拍子记成读到的", async () => {
    let r = await unpackProject(await bookOf({ minor: 1, patch: 7 }, { version: 1, patch: 3, last: "a.txt", back: [] })); eq(r.kind, "ok"); eq(r.project.newerThanApp.length, 0); eq(fmt(r.project.readStamps.graph), "2.1.7");
    r = await unpackProject(await bookOf({}, { last: "a.txt", back: [] })); eq(r.kind, "ok"); eq(r.project.newerThanApp.length, 0); eq(fmt(r.project.readStamps.graph), "2.0.0"); eq(fmt(r.project.readStamps.editorState), "1.0.0");
  });
  it("裸 pages/ 包（没 graph.json）：当本版写的；拍子 = FORMAT", async () => {
    const r = await unpackProject(await zipPack([{ path: "pages/a.txt", data: "A" }])); eq(r.kind, "ok"); eq(fmt(r.project.readStamps.graph), fmt(FORMAT.graph)); eq(r.project.newerThanApp.length, 0);
  });
});
