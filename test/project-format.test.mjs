// 容器格式 v2（ADR-0008 / ADR-0014）：目录清单、往返、拒开 v1、tree 校验、严格写。created 2026-09-10 by Claude Fable 5.1（v2 改写同日）
import { describe, it, eq, assert } from "./runner.mjs";
import { ensureZipLoaded } from "./zip-node.mjs";
ensureZipLoaded();
const { packProject, unpackProject, emptyProject, nameKey, isValidNodeName, nodeExt, nodeKind, PROJECT_FORMAT_VERSION, THUMBNAIL_ENTRY } = await import("../src/project/format.ts");
const { createNode, link, insertChild, insertSibling } = await import("../src/project/graph.ts");
const { zipUnpack, zipPack } = await import("../src/zip.ts");
const td = new TextDecoder();
const zipOf = (entries) => zipPack(entries);
const graphOf = (extra) => JSON.stringify({ format: "webxiaoheiwu", version: 2, wroteWith: "t", tree: [], pages: {}, ...extra });

describe("project/format · 目录清单（ADR-0008 §3）与往返", () => {
  it("pack → 三类 entry 恰好：graph.json / pages/<名> / .webxiaoheiwu/editor-state.json；graph.json version 2 带 tree", async () => {
    const p = emptyProject();
    createNode(p, "夏音.txt", "设定", () => 1000); createNode(p, "夏音-第三次见面.txt", "正文", () => 2000); createNode(p, "_废-第一版开场.txt", "", () => 2500);
    link(p, "夏音-第三次见面.txt", "夏音.txt", { now: () => 3000 }); link(p, "夏音-第三次见面.txt", "_废-第一版开场.txt", { at: "bottom", now: () => 3000 });
    p.tree = ["夏音-第三次见面.txt"]; p.editorState.last = "夏音-第三次见面.txt";
    const blob = await packProject(p);
    const entries = await zipUnpack(blob);
    eq(Object.keys(entries).sort().join("|"), ".webxiaoheiwu/editor-state.json|graph.json|pages/_废-第一版开场.txt|pages/夏音-第三次见面.txt|pages/夏音.txt");
    const g = JSON.parse(td.decode(entries["graph.json"]));
    eq(g.format, "webxiaoheiwu"); eq(g.version, 2); eq(PROJECT_FORMAT_VERSION, 2); assert(typeof g.wroteWith === "string");
    eq(JSON.stringify(g.tree), JSON.stringify(["夏音-第三次见面.txt"]));
    eq(g.pages["夏音-第三次见面.txt"].links.join("|"), "夏音.txt|_废-第一版开场.txt", "links 顺序照写");
    eq(g.pages["夏音.txt"].created, 1000);
    eq(JSON.parse(td.decode(entries[".webxiaoheiwu/editor-state.json"])).last, "夏音-第三次见面.txt");
    eq(JSON.stringify(JSON.parse(td.decode(entries[".webxiaoheiwu/editor-state.json"])).back), "[]", "back 随保存写（ADR-0010 口径）");
  });
  it("v2 往返无损（tree 嵌套 + links + 时间戳）；同内容同字节（钉 1980 时间戳 + JS deflate）", async () => {
    const p = emptyProject(); const now = (() => { let t = 0; return () => ++t; })();
    createNode(p, "正文.txt", "", now); createNode(p, "第一幕.txt", "", now); createNode(p, "第一话.txt", "一", now); createNode(p, "第二话.txt", "二", now); createNode(p, "设定.txt", "s", now); createNode(p, "散.txt", "loose", now);
    p.tree = [{ name: "正文.txt", children: [{ name: "第一幕.txt", children: ["第一话.txt", "第二话.txt"] }] }, "设定.txt"];
    link(p, "第一话.txt", "设定.txt", { now }); link(p, "第二话.txt", "散.txt", { now });
    p.editorState.last = "第一话.txt";
    const b1 = await packProject(p), b2 = await packProject(p);
    eq(b1.size, b2.size);
    const u1 = new Uint8Array(await b1.arrayBuffer()), u2 = new Uint8Array(await b2.arrayBuffer());
    assert(u1.every((x, i) => x === u2[i]), "两次打包字节相同");
    const r = await unpackProject(b1); eq(r.kind, "ok"); eq(r.warnings.length, 0);
    eq(JSON.stringify(r.project.tree), JSON.stringify(p.tree), "tree 原样回来");
    eq([...r.project.contents.keys()].sort().join("|"), "散.txt|正文.txt|第一幕.txt|第一话.txt|第二话.txt|设定.txt");
    eq(r.project.nodes.get("第一话.txt").links.join("|"), "设定.txt"); eq(r.project.nodes.get("第二话.txt").links.join("|"), "散.txt");
    eq(r.project.nodes.get("第一话.txt").created, 3); eq(r.project.editorState.last, "第一话.txt");
    eq(r.project.readVersion, 2);
  });
  it("txt DEFLATE、jpg STORE：压得动的才压", async () => {
    const p = emptyProject();
    createNode(p, "long.txt", "中文正文".repeat(2000)); p.contents.set("pic.jpg", new Uint8Array(3000).map(() => Math.floor(Math.random() * 256)));
    const blob = await packProject(p);
    assert(blob.size < 3000 + 8000 + 2000, `txt 应被压缩（总大小 ${blob.size}）`);
  });
});

describe("project/format · 拒开：version !== 2 一律拒（ADR-0014 §2，legacy 零分支）", () => {
  it("v1（version 1 / nodes 键 / contents/）→ not-project；version 3 → too-new；既无 graph.json 也无 pages/ → not-project；坏 JSON / 非 zip → corrupt", async () => {
    const v1 = { format: "webxiaoheiwu", version: 1, wroteWith: "x", pages: { "a.txt": { links: [], created: 1, modified: 1 } } };
    let r = await unpackProject(await zipOf([{ path: "graph.json", data: JSON.stringify(v1) }, { path: "pages/a.txt", data: "A" }]));
    eq(r.kind, "not-project"); assert(/version 1/.test(r.reason), r.reason);
    r = await unpackProject(await zipOf([{ path: "graph.json", data: JSON.stringify({ format: "webxiaoheiwu", version: 1, wroteWith: "x", nodes: {} }) }, { path: "contents/a.txt", data: "A" }]));
    eq(r.kind, "not-project");
    eq((await unpackProject(await zipOf([{ path: "contents/a.txt", data: "A" }]))).kind, "not-project", "旧 contents/ 目录：没有 pages/ 就不是书（没有 legacy 分支）");
    r = await unpackProject(await zipOf([{ path: "graph.json", data: graphOf({ version: 3 }) }]));
    eq(r.kind, "too-new"); eq(r.version, 3);
    eq((await unpackProject(await zipOf([{ path: "readme.txt", data: "hi" }]))).kind, "not-project");
    eq((await unpackProject(await zipOf([{ path: "graph.json", data: "{oops" }]))).kind, "corrupt");
    eq((await unpackProject(await zipOf([{ path: "graph.json", data: graphOf({ version: "2" }) }]))).kind, "corrupt", "version 不是数字");
    eq((await unpackProject(new Blob(["not a zip"]))).kind, "corrupt");
  });
  it("一包 txt 的 zip（无 graph.json）= 合法的书，全是散页、空树", async () => {
    const r = await unpackProject(await zipOf([{ path: "pages/x.txt", data: "X" }, { path: "pages/y.txt", data: "Y" }]));
    eq(r.kind, "ok"); eq([...r.project.contents.keys()].sort().join("|"), "x.txt|y.txt"); eq(r.project.nodes.get("x.txt").links.length, 0); eq(r.project.tree.length, 0);
  });
});

describe("project/format · tree 校验：重名 corrupt、悬空丢 + warning；宽容读、严格写", () => {
  it("tree 里同一个名字出现两次（含大小写/NFC 变体、嵌套里）→ corrupt；形状不对 → corrupt", async () => {
    const pages = [{ path: "pages/a.txt", data: "A" }, { path: "pages/b.txt", data: "B" }];
    eq((await unpackProject(await zipOf([{ path: "graph.json", data: graphOf({ tree: ["a.txt", "b.txt", "a.txt"] }) }, ...pages]))).kind, "corrupt");
    eq((await unpackProject(await zipOf([{ path: "graph.json", data: graphOf({ tree: [{ name: "a.txt", children: ["A.TXT"] }] }) }, ...pages]))).kind, "corrupt", "大小写不敏感重名");
    eq((await unpackProject(await zipOf([{ path: "graph.json", data: graphOf({ tree: [{ name: "b.txt", children: [{ name: "a.txt", children: ["b.txt"] }] }] }) }, ...pages]))).kind, "corrupt", "嵌套里重名");
    eq((await unpackProject(await zipOf([{ path: "graph.json", data: graphOf({ tree: "a.txt" }) }, ...pages]))).kind, "corrupt", "tree 不是数组");
    eq((await unpackProject(await zipOf([{ path: "graph.json", data: graphOf({ tree: [{ children: [] }] }) }, ...pages]))).kind, "corrupt", "节点没有 name");
    eq((await unpackProject(await zipOf([{ path: "graph.json", data: graphOf({ tree: [42] }) }, ...pages]))).kind, "corrupt", "节点既不是名字也不是对象");
  });
  it("tree 里的名字没有文件 → 丢 + warning，它的孩子提到它的位置；links 悬空 → 丢 + warning；graph.json 幽灵页 → 丢 + warning；editor-state 指向不存在 → null", async () => {
    const g = graphOf({
      tree: ["a.txt", { name: "ghost.txt", children: ["b.txt", { name: "c.txt", children: ["d.txt"] }] }],
      pages: { "ghost.txt": { links: [], created: 1, modified: 1 }, "a.txt": { links: ["ghost.txt", "b.txt", "b.txt"], created: 1, modified: 1 }, "b.txt": { links: [], created: 2, modified: 2 }, "c.txt": { links: [], created: 3, modified: 3 } },
    });
    const r = await unpackProject(await zipOf([{ path: "graph.json", data: g }, { path: "pages/a.txt", data: "A" }, { path: "pages/b.txt", data: "B" }, { path: "pages/c.txt", data: "C" }, { path: ".webxiaoheiwu/editor-state.json", data: JSON.stringify({ last: "ghost.txt", back: ["a.txt", "ghost.txt"] }) }]));
    eq(r.kind, "ok");
    assert(!r.project.nodes.has("ghost.txt"));
    eq(r.project.nodes.get("a.txt").links.join(), "b.txt", "悬空 link 丢掉、重复 link 去重");
    eq(JSON.stringify(r.project.tree), JSON.stringify(["a.txt", "b.txt", "c.txt"]), "ghost 丢、孩子 b/c 提上来；c 的孩子 d 没文件也丢 → c 折成字符串");
    eq(r.project.editorState.last, null); eq(r.project.editorState.back.join(), "a.txt");
    const w = r.warnings.join("\n");
    assert(/dangling link dropped: a.txt -> ghost.txt/.test(w), w); assert(/tree name without pages\/ file dropped: ghost.txt/.test(w), w); assert(/tree name without pages\/ file dropped: d.txt/.test(w), w); assert(/page without pages\/ file dropped: ghost.txt/.test(w), w);
    eq(r.warnings.length, 4, w);
  });
  it("graph.json 没有 tree 字段 → 空树 + warning（不拒开）", async () => {
    const r = await unpackProject(await zipOf([{ path: "graph.json", data: JSON.stringify({ format: "webxiaoheiwu", version: 2, wroteWith: "t", pages: {} }) }, { path: "pages/a.txt", data: "A" }]));
    eq(r.kind, "ok"); eq(r.project.tree.length, 0); eq(r.warnings.length, 1);
  });
  it("写出绝不产生悬空：内存里塞悬空 link / 幽灵树名 / 空 children → pack → 再读零 warning、树折成规范形", async () => {
    const p = emptyProject(); createNode(p, "a.txt", "A", () => 1); createNode(p, "b.txt", "B", () => 2); createNode(p, "c.txt", "C", () => 3);
    p.nodes.get("a.txt").links.push("ghost.txt");
    p.tree = [{ name: "a.txt", children: [] }, { name: "ghost.txt", children: ["b.txt"] }, { name: "c.txt", children: ["nope.txt"] }];
    const r = await unpackProject(await packProject(p));
    eq(r.kind, "ok"); eq(r.warnings.length, 0, r.warnings.join("\n"));
    eq(r.project.nodes.get("a.txt").links.length, 0);
    eq(JSON.stringify(r.project.tree), JSON.stringify(["a.txt", "b.txt", "c.txt"]));
  });
  it("撞名口径：大小写 / NFC 不敏感 → corrupt；扩展名不特殊（a.txt 与 a.jpg 共存）；子目录 entry 忽略并警告；tree/links 里的名字按撞名口径对上文件", async () => {
    const nfd = "e\u0301.txt", nfc = "\u00e9.txt";
    eq((await unpackProject(await zipOf([{ path: "pages/" + nfd, data: "1" }, { path: "pages/" + nfc, data: "2" }]))).kind, "corrupt");
    eq((await unpackProject(await zipOf([{ path: "pages/A.txt", data: "1" }, { path: "pages/a.txt", data: "2" }]))).kind, "corrupt");
    const r = await unpackProject(await zipOf([{ path: "graph.json", data: graphOf({ tree: ["A.TXT"], pages: { "a.jpg": { links: ["A.TXT"], created: 1, modified: 1 } } }) }, { path: "pages/a.txt", data: "1" }, { path: "pages/a.jpg", data: "2" }, { path: "pages/sub/z.txt", data: "3" }]));
    eq(r.kind, "ok"); eq([...r.project.contents.keys()].sort().join("|"), "a.jpg|a.txt"); eq(r.warnings.length, 1);
    eq(JSON.stringify(r.project.tree), JSON.stringify(["a.txt"]), "tree 名字对到文件的真名"); eq(r.project.nodes.get("a.jpg").links.join(), "a.txt");
  });
  it("nameKey / isValidNodeName / nodeExt", () => {
    eq(nameKey("É.TXT"), "é.txt"); assert(isValidNodeName("夏音.第三次.txt")); assert(!isValidNodeName(".hidden")); assert(!isValidNodeName("a/b.txt")); assert(!isValidNodeName(""));
    eq(nodeExt("夏音.webxiaoheiwu.zip"), "zip"); eq(nodeExt("bare"), ""); eq(nodeExt(".hidden"), "");
  });
});

describe("project/format · editor-state.back（回退栈跟着书持久化；不标脏、保存随手捞）", () => {
  it("pack 写 back（≤50）；unpack 读回、NFC、丢掉指向不存在页的条目", async () => {
    const p = emptyProject(); createNode(p, "a.txt", "A"); createNode(p, "b.txt", "B");
    p.editorState.last = "b.txt"; p.editorState.back = ["a.txt", "gone.txt", "b.txt"];
    const r = await unpackProject(await packProject(p));
    eq(r.kind, "ok"); eq(r.project.editorState.back.join("|"), "a.txt|b.txt"); eq(r.project.editorState.last, "b.txt");
    p.editorState.back = Array.from({ length: 80 }, (_, i) => (i % 2 ? "a.txt" : "b.txt"));
    const r2 = await unpackProject(await packProject(p)); eq(r2.project.editorState.back.length, 50, "封顶 50");
  });
});

describe("project/format · readOnly 跟着作品", () => {
  it("readOnly 写进 graph.json 顶层、读回；未锁不写该键", async () => {
    const p = emptyProject(); createNode(p, "a.txt", "A"); p.editorState.last = "a.txt";
    const g0 = JSON.parse(td.decode((await zipUnpack(await packProject(p)))["graph.json"])); eq("readOnly" in g0, false);
    p.readOnly = true;
    const blob = await packProject(p); const g1 = JSON.parse(td.decode((await zipUnpack(blob))["graph.json"])); eq(g1.readOnly, true);
    const r = await unpackProject(blob); eq(r.kind, "ok"); eq(r.project.readOnly, true);
  });
});

describe("project/format · 2.1 增量：封面 entry / 图片页（ADR-0008/0012）", () => {
  it("Thumbnails/thumbnail.png 是最后一个 entry、STORE、往返字节相同；没封面就没有这个 entry", async () => {
    const p = emptyProject(); createNode(p, "作品.txt", "x", () => 1);
    const noThumb = await zipUnpack(await packProject(p)); assert(!(THUMBNAIL_ENTRY in noThumb));
    p.thumbnail = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const blob = await packProject(p);
    const u8 = new Uint8Array(await blob.arrayBuffer());
    let last = -1; for (let i = 0; i + 4 <= u8.length; i++) if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 3 && u8[i + 3] === 4) last = i;
    const nameLen = u8[last + 26] | (u8[last + 27] << 8); const method = u8[last + 8] | (u8[last + 9] << 8);
    eq(td.decode(u8.subarray(last + 30, last + 30 + nameLen)), THUMBNAIL_ENTRY); eq(method, 0, "STORE");
    const r = await unpackProject(blob); eq(r.kind, "ok"); eq(Array.from(r.project.thumbnail).join(), Array.from(p.thumbnail).join());
  });
  it("nodeKind：txt / image / other；图片页字节往返；图片页也能进树", async () => {
    eq(nodeKind("a.txt"), "txt"); eq(nodeKind("夏音.JPG"), "image"); eq(nodeKind("x.webp"), "image"); eq(nodeKind("动.gif"), "image"); eq(nodeKind("a.md"), "other"); eq(nodeKind("noext"), "other");
    const p = emptyProject(); createNode(p, "作品.txt", "", () => 1); p.contents.set("夏音.jpg", new Uint8Array([255, 216, 255, 1, 2, 3])); p.nodes.set("夏音.jpg", { links: [], created: 1, modified: 1 });
    p.tree = ["作品.txt"]; insertChild(p, "作品.txt", "夏音.jpg"); insertSibling(p, "作品.txt", "设定.txt", () => 2);
    const r = await unpackProject(await packProject(p)); eq(Array.from(r.project.contents.get("夏音.jpg")).join(), "255,216,255,1,2,3");
    eq(JSON.stringify(r.project.tree), JSON.stringify([{ name: "作品.txt", children: ["夏音.jpg"] }, "设定.txt"]));
  });
});
