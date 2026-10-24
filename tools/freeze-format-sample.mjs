// tools/freeze-format-sample.mjs —— 冻结格式样本（家族格式版本纪律，家族根 ai-docs/20261021-format-version-discipline.md §3）。
// created 2026-10-21 by Claude Fable 5.1
// 落三种样本到 test/fixtures/format/<目录>/{sample.webxiaoheiwu.zip, expect.json}（已存在的目录不覆盖——样本是冻结的，要重冻先手动删）：
//   ① graph-<本版拍>+editor-<本版拍>  = 本版写入器写出的一本样书（改 FORMAT 后必须重跑一次：新拍子的目录不存在 → test/project-fixtures 红）
//   ② graph-2.0.0+editor-unstamped       = v2.3.45 及以前的形状（graph 只有整数 version、editor-state 没有 version）——老书永远能开
//   ③ graph-2.9.0+editor-1.3.0-future    = 「更新版本写的」：minor 更新 + 未知键——能开能存、未知键带回、newerThanApp 两个都有
// 用法：node tools/freeze-format-sample.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureZipLoaded } from "../test/zip-node.mjs";
ensureZipLoaded();
const { packProject, unpackProject, emptyProject, PINNED_MTIME } = await import("../src/project/format.ts");
const { createNode, link, insertChild, setHidden } = await import("../src/project/graph.ts");
const { FORMAT, fmt } = await import("../src/project/migrate/index.ts");
const { zipPack } = await import("../src/zip.ts");

const ROOT = fileURLToPath(new URL("../test/fixtures/format/", import.meta.url));   // 仓路径带空格：pathname 不解码，必须 fileURLToPath
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);   // 只要字节，不必是合法图

async function expectOf(blob) {   // 用本版读取器读一遍，记下「应当读到什么」
  const r = await unpackProject(blob);
  if (r.kind !== "ok") throw new Error(`sample does not open: ${r.kind}`);
  const p = r.project;
  return {
    stamps: { graph: fmt(p.readStamps.graph), editorState: fmt(p.readStamps.editorState) },
    newerThanApp: p.newerThanApp,
    warnings: r.warnings,
    pages: [...p.contents.keys()].sort(),
    tree: p.tree,
    editorState: p.editorState,
    graphExtra: p.graphExtra,
    editorStateExtra: p.editorStateExtra,
    pageExtra: Object.fromEntries([...p.nodes].filter(([, m]) => m.extra).map(([n, m]) => [n, m.extra])),
    hidden: [...p.nodes].filter(([, m]) => m.hidden).map(([n]) => n),
    cover: p.cover,
  };
}
async function write(dir, blob) {
  const d = path.join(ROOT, dir);
  if (fs.existsSync(d)) { console.log(`exists, kept: ${dir}`); return; }
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "sample.webxiaoheiwu.zip"), new Uint8Array(await blob.arrayBuffer()));
  fs.writeFileSync(path.join(d, "expect.json"), JSON.stringify(await expectOf(blob), null, 1) + "\n");
  console.log(`frozen: ${dir}`);
}

// ① 本版写出的样书
{
  const p = emptyProject(); const now = (() => { let t = 1700000000000; return () => (t += 1000); })();
  createNode(p, "正文.txt", "", now); createNode(p, "第一话.txt", "一\n", now); createNode(p, "第二话.txt", "二\n", now);
  createNode(p, "设定.txt", "设定\n", now); createNode(p, "废稿.txt", "废\n", now); createNode(p, "插图.png", PNG, now);
  p.tree = [{ name: "正文.txt", children: ["第一话.txt", "第二话.txt"] }, "设定.txt", "废稿.txt"];
  link(p, "第一话.txt", "设定.txt", { now }); link(p, "第二话.txt", "插图.png", { now });
  setHidden(p, "废稿.txt", true);
  p.readOnly = false; p.thumbnail = PNG; p.cover = "插图.png";
  p.editorState = { last: "第一话.txt", back: ["正文.txt"], refPanel: { open: false, left: 10, top: 20, width: 300, height: 200 }, lineWidth: { charsPerLine: 20 }, exportLineWidth: { charsPerLine: 14 }, font: "sans", exportFont: "pinyin", exportCovers: { "正文.txt": "插图.png" }, exportEmbedText: false, exportBodyHeadings: "escape" };
  await write(`graph-${fmt(FORMAT.graph)}+editor-${fmt(FORMAT.editorState)}`, await packProject(p));
}
// ② v2.3.45 及以前的形状（没拍子）
{
  const graph = { format: "webxiaoheiwu", version: 2, wroteWith: "v2.3.45-2026-10-19", cover: "插图.png", tree: [{ name: "正文.txt", children: ["第一话.txt"] }, "设定.txt"],
    pages: { "正文.txt": { links: [], created: 1, modified: 2 }, "第一话.txt": { links: ["设定.txt"], created: 3, modified: 4, hidden: true }, "设定.txt": { links: [], created: 5, modified: 6 }, "插图.png": { links: [], created: 7, modified: 8 } } };
  const es = { last: "第一话.txt", back: ["正文.txt"], lineWidth: { charsPerLine: 14 }, exportFont: "pinyin" };
  const blob = await zipPack([
    { path: "graph.json", data: JSON.stringify(graph, null, 1) },
    { path: "pages/正文.txt", data: "" }, { path: "pages/第一话.txt", data: "一\n" }, { path: "pages/设定.txt", data: "设定\n" }, { path: "pages/插图.png", data: PNG },
    { path: ".webxiaoheiwu/editor-state.json", data: JSON.stringify(es) },
    { path: "Thumbnails/thumbnail.png", data: PNG },
  ], { lastModDate: PINNED_MTIME });
  await write("graph-2.0.0+editor-unstamped", blob);
}
// ③ 更新版本写的：minor 更新 + 未知键
{
  const graph = { format: "webxiaoheiwu", version: 2, minor: 9, patch: 0, wroteWith: "v9.9.9-2099-01-01", futureTop: { mood: "☀" }, tree: ["正文.txt"],
    pages: { "正文.txt": { links: [], created: 1, modified: 2, futurePage: [1, 2] } } };
  const es = { version: 1, minor: 3, patch: 0, last: "正文.txt", back: [], futureEs: { a: 1 }, lineWidth: { charsPerLine: 20 } };
  const blob = await zipPack([
    { path: "graph.json", data: JSON.stringify(graph, null, 1) }, { path: "pages/正文.txt", data: "来自未来\n" },
    { path: ".webxiaoheiwu/editor-state.json", data: JSON.stringify(es) },
  ], { lastModDate: PINNED_MTIME });
  await write("graph-2.9.0+editor-1.3.0-future", blob);
}
