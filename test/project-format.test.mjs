import { describe, it, eq, assert } from "./runner.mjs";
import { ensureZipLoaded } from "./zip-node.mjs";
ensureZipLoaded();
const { packProject, unpackProject, emptyProject, nameKey, isValidNodeName, nodeExt, nodeKind, PROJECT_FORMAT_VERSION, THUMBNAIL_ENTRY } = await import("../src/project/format.ts");
const { createNode, link } = await import("../src/project/graph.ts");
const { zipUnpack } = await import("../src/zip.ts");
const td = new TextDecoder();

describe("project/format · 目录清单（ADR-0008 §3）与往返", () => {
  it("pack → 三类 entry 恰好：graph.json / pages/<名> / .webxiaoheiwu/editor-state.json；无 mimetype 无缩略图", async () => {
    const p = emptyProject();
    createNode(p, "夏音.txt", "设定", () => 1000); createNode(p, "夏音-第三次见面.txt", "正文", () => 2000);
    link(p, "夏音-第三次见面.txt", "夏音.txt", { now: () => 3000 }); link(p, "夏音-第三次见面.txt", "_废-第一版开场.txt", { at: "bottom", now: () => 3000 });
    p.editorState.last = "夏音-第三次见面.txt";
    const blob = await packProject(p);
    const entries = await zipUnpack(blob);
    eq(Object.keys(entries).sort().join("|"), ".webxiaoheiwu/editor-state.json|graph.json|pages/夏音-第三次见面.txt|pages/夏音.txt");
    const g = JSON.parse(td.decode(entries["graph.json"]));
    eq(g.format, "webxiaoheiwu"); eq(g.version, PROJECT_FORMAT_VERSION); assert(typeof g.wroteWith === "string");
    eq(g.pages["夏音-第三次见面.txt"].links.join("|"), "夏音.txt|_废-第一版开场.txt", "占位符照写、顺序照写");
    eq(g.pages["夏音.txt"].created, 1000);
    eq(JSON.parse(td.decode(entries[".webxiaoheiwu/editor-state.json"])).last, "夏音-第三次见面.txt");
    eq(JSON.stringify(JSON.parse(td.decode(entries[".webxiaoheiwu/editor-state.json"])).back), "[]", "back 随保存写（ADR-0010 口径）");
  });
  it("往返无损；同内容同字节（钉 1980 时间戳 + JS deflate）", async () => {
    const p = emptyProject(); createNode(p, "a.txt", "hello", () => 1); createNode(p, "b.txt", "world", () => 2); link(p, "a.txt", "b.txt", { now: () => 3 });
    const b1 = await packProject(p), b2 = await packProject(p);
    eq(b1.size, b2.size);
    const u1 = new Uint8Array(await b1.arrayBuffer()), u2 = new Uint8Array(await b2.arrayBuffer());
    assert(u1.every((x, i) => x === u2[i]), "两次打包字节相同");
    const r = await unpackProject(b1); eq(r.kind, "ok");
    eq([...r.project.contents.keys()].sort().join("|"), "a.txt|b.txt");
    eq(r.project.nodes.get("a.txt").links.join("|"), "b.txt"); eq(r.project.nodes.get("a.txt").created, 1);
  });
  it("txt DEFLATE、jpg STORE：压得动的才压", async () => {
    const p = emptyProject();
    createNode(p, "long.txt", "中文正文".repeat(2000)); p.contents.set("pic.jpg", new Uint8Array(3000).map(() => Math.floor(Math.random() * 256)));
    const blob = await packProject(p);
    assert(blob.size < 3000 + 8000 + 2000, `txt 应被压缩（总大小 ${blob.size}）`);
  });
});

describe("project/format · 宽容读严格写", () => {
  const zipOf = async (entries) => (await import("../src/zip.ts")).zipPack(entries);
  it("一包 txt 的 zip（无 graph.json）= 合法工程，全是孤儿节点", async () => {
    const r = await unpackProject(await zipOf([{ path: "pages/x.txt", data: "X" }, { path: "pages/y.txt", data: "Y" }]));
    eq(r.kind, "ok"); eq([...r.project.contents.keys()].sort().join("|"), "x.txt|y.txt"); eq(r.project.nodes.get("x.txt").links.length, 0);
  });
  it("既无 graph.json 也无 pages/ → not-project；graph.json 不是 JSON → corrupt；version 太新 → too-new", async () => {
    eq((await unpackProject(await zipOf([{ path: "readme.txt", data: "hi" }]))).kind, "not-project");
    eq((await unpackProject(await zipOf([{ path: "graph.json", data: "{oops" }]))).kind, "corrupt");
    const r = await unpackProject(await zipOf([{ path: "graph.json", data: JSON.stringify({ format: "webxiaoheiwu", version: 99, wroteWith: "x", pages: {} }) }]));
    eq(r.kind, "too-new"); eq(r.version, 99);
    eq((await unpackProject(new Blob(["not a zip"]))).kind, "corrupt");
  });
  it("撞名口径：大小写 / NFC 不敏感 → corrupt；扩展名不特殊（a.txt 与 a.jpg 共存）；子目录 entry 忽略并警告", async () => {
    const nfd = "é.txt", nfc = "é.txt";
    eq((await unpackProject(await zipOf([{ path: "pages/" + nfd, data: "1" }, { path: "pages/" + nfc, data: "2" }]))).kind, "corrupt");
    eq((await unpackProject(await zipOf([{ path: "pages/A.txt", data: "1" }, { path: "pages/a.txt", data: "2" }]))).kind, "corrupt");
    const r = await unpackProject(await zipOf([{ path: "pages/a.txt", data: "1" }, { path: "pages/a.jpg", data: "2" }, { path: "pages/sub/z.txt", data: "3" }]));
    eq(r.kind, "ok"); eq([...r.project.contents.keys()].sort().join("|"), "a.jpg|a.txt"); eq(r.warnings.length, 1);
  });
  it("graph.json 里指向不存在文件的节点条目丢弃 + 警告；editor-state.last 指向不存在 → null", async () => {
    const g = { format: "webxiaoheiwu", version: 1, wroteWith: "t", pages: { "ghost.txt": { links: [], created: 1, modified: 1 }, "a.txt": { links: ["ghost.txt"], created: 1, modified: 1 } } };
    const r = await unpackProject(await zipOf([{ path: "graph.json", data: JSON.stringify(g) }, { path: "pages/a.txt", data: "A" }, { path: ".webxiaoheiwu/editor-state.json", data: JSON.stringify({ last: "ghost.txt" }) }]));
    eq(r.kind, "ok"); assert(!r.project.nodes.has("ghost.txt")); eq(r.project.nodes.get("a.txt").links.join(), "ghost.txt", "link 到占位符保留"); eq(r.project.editorState.last, null); eq(r.warnings.length, 1);
  });
  it("nameKey / isValidNodeName / nodeExt", () => {
    eq(nameKey("É.TXT"), "é.txt"); assert(isValidNodeName("夏音.第三次.txt")); assert(!isValidNodeName(".hidden")); assert(!isValidNodeName("a/b.txt")); assert(!isValidNodeName(""));
    eq(nodeExt("夏音.webxiaoheiwu.zip"), "zip"); eq(nodeExt("bare"), ""); eq(nodeExt(".hidden"), "");
  });
});

describe("project/format · editor-state.back（回退栈跟着书持久化；不标脏、保存随手捞）", () => {
  it("pack 写 back（≤50）；unpack 读回、NFC、丢掉指向不存在节点的条目", async () => {
    const { emptyProject, packProject, unpackProject } = await import("../src/project/format.ts");
    const { createNode } = await import("../src/project/graph.ts");
    const p = emptyProject(); createNode(p, "a.txt", "A"); createNode(p, "b.txt", "B");
    p.editorState.last = "b.txt"; p.editorState.back = ["a.txt", "gone.txt", "b.txt"];
    const r = await unpackProject(await packProject(p));
    eq(r.kind, "ok"); eq(r.project.editorState.back.join("|"), "a.txt|b.txt"); eq(r.project.editorState.last, "b.txt");
    p.editorState.back = Array.from({ length: 80 }, (_, i) => (i % 2 ? "a.txt" : "b.txt"));
    const r2 = await unpackProject(await packProject(p)); eq(r2.project.editorState.back.length, 50, "封顶 50");
  });
});

describe("project/format · 2026-09-10 吃书：pages/ + graph.json pages；旧 contents/ 拒开；readOnly 跟着作品", () => {
  it("旧格式（contents/ 或 nodes 键）→ legacy，绝不读成空书", async () => {
    const { unpackProject } = await import("../src/project/format.ts");
    const { zipPack } = await import("../src/zip.ts");
    const zipOf = (entries) => zipPack(entries);
    eq((await unpackProject(await zipOf([{ path: "contents/a.txt", data: "A" }]))).kind, "legacy");
    eq((await unpackProject(await zipOf([{ path: "graph.json", data: JSON.stringify({ format: "webxiaoheiwu", version: 1, wroteWith: "x", nodes: { "a.txt": { links: [], created: 1, modified: 1 } } }) }, { path: "contents/a.txt", data: "A" }]))).kind, "legacy");
  });
  it("readOnly 写进 graph.json 顶层、读回；未锁不写该键", async () => {
    const { emptyProject, packProject, unpackProject } = await import("../src/project/format.ts");
    const { createNode } = await import("../src/project/graph.ts");
    const { zipUnpack } = await import("../src/zip.ts");
    const p = emptyProject(); createNode(p, "a.txt", "A"); p.editorState.last = "a.txt";
    const g0 = JSON.parse(new TextDecoder().decode((await zipUnpack(await packProject(p)))["graph.json"])); eq("readOnly" in g0, false);
    p.readOnly = true;
    const blob = await packProject(p); const g1 = JSON.parse(new TextDecoder().decode((await zipUnpack(blob))["graph.json"])); eq(g1.readOnly, true);
    const r = await unpackProject(blob); eq(r.kind, "ok"); eq(r.project.readOnly, true);
  });
});

describe("project/format · 2.1 增量：封面 entry / 图片页（ADR-0008/0012；edges 属性袋已按 ADR-0014 撤）", () => {
  it("Thumbnails/thumbnail.png 是最后一个 entry、STORE、往返字节相同；没封面就没有这个 entry", async () => {
    const p = emptyProject(); createNode(p, "作品.txt", "x", () => 1);
    const noThumb = await zipUnpack(await packProject(p)); assert(!(THUMBNAIL_ENTRY in noThumb));
    p.thumbnail = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const blob = await packProject(p);
    const u8 = new Uint8Array(await blob.arrayBuffer());
    // 最后一个 local header 的文件名 = Thumbnails/thumbnail.png（central directory 之前的最后一个 PK\x03\x04）
    let last = -1; for (let i = 0; i + 4 <= u8.length; i++) if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 3 && u8[i + 3] === 4) last = i;
    const nameLen = u8[last + 26] | (u8[last + 27] << 8); const method = u8[last + 8] | (u8[last + 9] << 8);
    eq(td.decode(u8.subarray(last + 30, last + 30 + nameLen)), THUMBNAIL_ENTRY); eq(method, 0, "STORE");
    const r = await unpackProject(blob); eq(r.kind, "ok"); eq(Array.from(r.project.thumbnail).join(), Array.from(p.thumbnail).join());
  });
  it("nodeKind：txt / image / other；图片页字节往返", async () => {
    eq(nodeKind("a.txt"), "txt"); eq(nodeKind("夏音.JPG"), "image"); eq(nodeKind("x.webp"), "image"); eq(nodeKind("动.gif"), "image"); eq(nodeKind("a.md"), "other"); eq(nodeKind("noext"), "other");
    const p = emptyProject(); createNode(p, "作品.txt", "", () => 1); p.contents.set("夏音.jpg", new Uint8Array([255, 216, 255, 1, 2, 3])); p.nodes.set("夏音.jpg", { links: [], created: 1, modified: 1 });
    const r = await unpackProject(await packProject(p)); eq(Array.from(r.project.contents.get("夏音.jpg")).join(), "255,216,255,1,2,3");
  });
});
