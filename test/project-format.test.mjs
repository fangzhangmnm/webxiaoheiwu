// 容器格式 v2（ADR-0008 / ADR-0014）：目录清单、往返、拒开 v1、tree 校验、严格写。created 2026-09-10 by Claude Fable 5.1（v2 改写同日）
import { describe, it, eq, assert } from "./runner.mjs";
import { ensureZipLoaded } from "./zip-node.mjs";
ensureZipLoaded();
const { packProject, unpackProject, emptyProject, nameKey, isValidNodeName, nodeExt, nodeKind, PROJECT_FORMAT_VERSION, THUMBNAIL_ENTRY, REFERENCES_DIR } = await import("../src/project/format.ts");
const { createNode, link, insertChild, insertSibling } = await import("../src/project/graph.ts");
const { zipUnpack, zipPack, zipReadRaw } = await import("../src/zip.ts");
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
  it("cover（封面来源页，2026-09-30 user「加 cover 字段」）：有来源就写、往返；来源页没文件 → 写时不写、读时丢 + warning；没封面字段的老书 cover = null", async () => {
    const p = emptyProject(); createNode(p, "作品.txt", "x", () => 1); p.contents.set("夏音.jpg", new Uint8Array([255, 216, 255, 1])); p.nodes.set("夏音.jpg", { links: [], created: 1, modified: 1 });
    p.thumbnail = new Uint8Array([1, 2, 3]);
    const g0 = JSON.parse(td.decode((await zipUnpack(await packProject(p)))["graph.json"])); eq("cover" in g0, false, "没设来源就没有字段");
    p.cover = "夏音.jpg";
    const blob = await packProject(p); const g1 = JSON.parse(td.decode((await zipUnpack(blob))["graph.json"])); eq(g1.cover, "夏音.jpg");
    const r = await unpackProject(blob); eq(r.kind, "ok"); eq(r.project.cover, "夏音.jpg"); eq(r.warnings.length, 0);
    p.cover = "没有.jpg";   // 来源页不存在：严格写不产生悬空
    const g2 = JSON.parse(td.decode((await zipUnpack(await packProject(p)))["graph.json"])); eq("cover" in g2, false);
    // 手工造一份悬空 cover 的 graph.json → 宽容读：丢 + warning，thumbnail 不受影响
    const entries = await zipUnpack(blob); const g = JSON.parse(td.decode(entries["graph.json"])); g.cover = "丢了.jpg";
    const { zipPack } = await import("../src/zip.ts"); const b2 = await zipPack(Object.entries({ ...entries, "graph.json": new TextEncoder().encode(JSON.stringify(g)) }).map(([path, data]) => ({ path, data })));
    const r2 = await unpackProject(b2); eq(r2.kind, "ok"); eq(r2.project.cover, null); eq(r2.warnings.filter((w) => /cover/.test(w)).length, 1, r2.warnings.join("\n")); eq(Array.from(r2.project.thumbnail).join(), "1,2,3");
  });
  it("editor-state lineWidth（这本书的行宽，2026-09-30 user「语义上确实是书的属性」）：随保存写、往返；没有就没有；坏值不读", async () => {
    const p = emptyProject(); createNode(p, "a.txt", "A", () => 1);
    const st0 = JSON.parse(td.decode((await zipUnpack(await packProject(p)))[".webxiaoheiwu/editor-state.json"])); eq("lineWidth" in st0, false);
    p.editorState.lineWidth = { charsPerLine: 28 };
    const r = await unpackProject(await packProject(p)); eq(r.kind, "ok"); eq(JSON.stringify(r.project.editorState.lineWidth), JSON.stringify({ charsPerLine: 28 }));
    p.editorState.lineWidth = { charsPerLine: "x" };
    const r2 = await unpackProject(await packProject(p)); eq(r2.project.editorState.lineWidth, undefined);
    // exportLineWidth（2026-10-01）：导出另选的行宽，同一套规矩；和 lineWidth 互不依赖（可以只有它）
    delete p.editorState.lineWidth; p.editorState.exportLineWidth = { charsPerLine: 20 };
    const r3 = await unpackProject(await packProject(p)); eq(JSON.stringify(r3.project.editorState.exportLineWidth), JSON.stringify({ charsPerLine: 20 })); eq(r3.project.editorState.lineWidth, undefined);
    p.editorState.exportLineWidth = { charsPerLine: null };
    eq((await unpackProject(await packProject(p))).project.editorState.exportLineWidth, undefined);
    // exportFont（2026-10-01）：导出用的字体；没有 = 黑体
    eq("exportFont" in JSON.parse(td.decode((await zipUnpack(await packProject(p)))[".webxiaoheiwu/editor-state.json"])), false);
    p.editorState.exportFont = "pinyin"; eq((await unpackProject(await packProject(p))).project.editorState.exportFont, "pinyin");
    p.editorState.exportFont = 7; eq((await unpackProject(await packProject(p))).project.editorState.exportFont, undefined); delete p.editorState.exportFont;
  });
  it("hidden 往返：true 才写、缺 = 出门；老书没有这个键", async () => {
    const p = emptyProject(); createNode(p, "a.txt", "A", () => 1); createNode(p, "b.txt", "B", () => 1); p.nodes.get("b.txt").hidden = true;
    const blob = await packProject(p); const g = JSON.parse(td.decode((await zipUnpack(blob))["graph.json"]));
    eq("hidden" in g.pages["a.txt"], false); eq(g.pages["b.txt"].hidden, true);
    const r = await unpackProject(blob); eq(r.kind, "ok"); eq(r.project.nodes.get("b.txt").hidden, true); eq("hidden" in r.project.nodes.get("a.txt"), false);
  });
  it("nodeKind：txt / image / other；图片页字节往返；图片页也能进树", async () => {
    eq(nodeKind("a.txt"), "txt"); eq(nodeKind("夏音.JPG"), "image"); eq(nodeKind("x.webp"), "image"); eq(nodeKind("动.gif"), "image"); eq(nodeKind("a.md"), "other"); eq(nodeKind("noext"), "other");
    const p = emptyProject(); createNode(p, "作品.txt", "", () => 1); p.contents.set("夏音.jpg", new Uint8Array([255, 216, 255, 1, 2, 3])); p.nodes.set("夏音.jpg", { links: [], created: 1, modified: 1 });
    p.tree = ["作品.txt"]; insertChild(p, "作品.txt", "夏音.jpg"); insertSibling(p, "作品.txt", "设定.txt", () => 2);
    const r = await unpackProject(await packProject(p)); eq(Array.from(r.project.contents.get("夏音.jpg")).join(), "255,216,255,1,2,3");
    eq(JSON.stringify(r.project.tree), JSON.stringify([{ name: "作品.txt", children: ["夏音.jpg"] }, "设定.txt"]));
  });
});

describe("project/format · 增量重打（ADR-0015 a）：未改的 entry passThrough 原样塞回，只有改过的页重压；同内容同字节不动", () => {
  const bytesOf = async (b) => new Uint8Array(await b.arrayBuffer());
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  it("第一次全压；第二次全部 passThrough 且字节逐位相同；改一页 → 只重压那一页 + graph.json + editor-state，其余 entry 已压缩字节逐位相同", async () => {
    const p = emptyProject(); const now = (() => { let t = 0; return () => ++t; })();
    for (let i = 0; i < 6; i++) createNode(p, `第${i}页.txt`, "中文正文".repeat(300 + i), now);
    p.thumbnail = new Uint8Array(500).map((_, i) => (i * 7) & 255); p.tree = [...p.contents.keys()]; p.editorState.last = "第0页.txt";
    const s1 = { passThrough: 0, encoded: 0 }; const b1 = await packProject(p, { stats: s1 });
    eq(s1.passThrough, 0); eq(s1.encoded, 6 + 1 + 2, "首次：6 页 + 封面 + graph.json + editor-state 全压");
    const s2 = { passThrough: 0, encoded: 0 }; const b2 = await packProject(p, { stats: s2 });
    eq(s2.passThrough, 7, "第二次：6 页 + 封面全部 passThrough"); eq(s2.encoded, 2);
    assert(same(await bytesOf(b1), await bytesOf(b2)), "passThrough 的包与首次全压的包字节逐位相同（同内容同字节）");
    const raw1 = await zipReadRaw(b1);
    const { setNodeText } = await import("../src/project/graph.ts");
    setNodeText(p, "第3页.txt", "改过了".repeat(100), now);
    const s3 = { passThrough: 0, encoded: 0 }; const b3 = await packProject(p, { stats: s3 });
    eq(s3.passThrough, 6, "改一页：其余 5 页 + 封面 passThrough"); eq(s3.encoded, 3, "只重压 第3页 + graph.json + editor-state");
    const raw3 = await zipReadRaw(b3);
    for (const k of Object.keys(raw1)) if (k !== "pages/第3页.txt" && k !== "graph.json" && k !== ".webxiaoheiwu/editor-state.json") assert(same(raw1[k].data, raw3[k].data) && raw1[k].crc === raw3[k].crc, `entry unchanged byte-for-byte: ${k}`);
    assert(!same(raw1["pages/第3页.txt"].data, raw3["pages/第3页.txt"].data), "改过的页字节变了");
    const s4 = { passThrough: 0, encoded: 0 }; await packProject(p, { stats: s4 }); eq(s4.passThrough, 7, "收割：刚压过的 第3页 下次也 passThrough");
    const r = await unpackProject(b3); eq(r.kind, "ok"); eq(new TextDecoder().decode(r.project.contents.get("第3页.txt")), "改过了".repeat(100));
  });
  it("unpack 留住已压缩字节：解包 → 打包（全 passThrough）= 与 zip.js 全压同内容的包字节逐位相同；改名 / 搬树不重压（对象身份不变）", async () => {
    const p = emptyProject(); const now = (() => { let t = 0; return () => ++t; })();
    createNode(p, "a.txt", "甲".repeat(1000), now); createNode(p, "b.txt", "乙".repeat(1000), now); p.tree = ["a.txt", "b.txt"]; p.editorState.last = "a.txt";
    const A = await packProject(p);
    const r = await unpackProject(A); eq(r.kind, "ok");
    const st = { passThrough: 0, encoded: 0 }; const B = await packProject(r.project, { stats: st });
    eq(st.passThrough, 2); assert(same(await bytesOf(A), await bytesOf(B)), "解包再打包 = 首次全压的字节");
    const { renameNode, indent } = await import("../src/project/graph.ts");
    renameNode(r.project, "b.txt", "c.txt", now); indent(r.project, "c.txt");
    const st2 = { passThrough: 0, encoded: 0 }; await packProject(r.project, { stats: st2 }); eq(st2.passThrough, 2, "改名 + 降级：两页都没重压"); eq(st2.encoded, 2);
  });
});

describe("project/format · 参考目录 `.webxiaoheiwu/references/`（ADR-0016，2026-09-29；codec 对清单零知识）", () => {
  const bytesOf = async (b) => new Uint8Array(await b.arrayBuffer());
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const te = new TextEncoder();
  it("目录原样进出：manifest.json + 两张卡 + 一个不认识的种类；顺序 = pages → references（manifest 在前）→ editor-state → 封面最后", async () => {
    const p = emptyProject(); createNode(p, "正文.txt", "字", () => 1); p.tree = ["正文.txt"]; p.thumbnail = new Uint8Array([1, 2, 3]);
    p.references.set(`${REFERENCES_DIR}manifest.json`, te.encode('{"version":1,"index":1,"items":[]}'));
    p.references.set(`${REFERENCES_DIR}r0.jpg`, new Uint8Array([9, 8, 7]));
    p.references.set(`${REFERENCES_DIR}r1.holo`, new Uint8Array([4, 4]));   // 未来种类：codec 不认识也照带
    p.references.set(`${REFERENCES_DIR}r2.txt`, te.encode("设定：东北规则"));
    const blob = await packProject(p);
    const order = Object.keys(await zipUnpack(blob));
    eq(order.join("|"), `graph.json|pages/正文.txt|${REFERENCES_DIR}manifest.json|${REFERENCES_DIR}r0.jpg|${REFERENCES_DIR}r1.holo|${REFERENCES_DIR}r2.txt|.webxiaoheiwu/editor-state.json|Thumbnails/thumbnail.png`);
    const r = await unpackProject(blob); eq(r.kind, "ok"); eq(r.warnings.length, 0);
    eq([...r.project.references.keys()].join("|"), `${REFERENCES_DIR}manifest.json|${REFERENCES_DIR}r0.jpg|${REFERENCES_DIR}r1.holo|${REFERENCES_DIR}r2.txt`);
    eq(Array.from(r.project.references.get(`${REFERENCES_DIR}r1.holo`)).join(","), "4,4", "不认识的种类字节保真");
    eq(td.decode(r.project.references.get(`${REFERENCES_DIR}r2.txt`)), "设定：东北规则");
    assert(!r.project.nodes.has("r0.jpg") && !r.project.contents.has(`${REFERENCES_DIR}r0.jpg`), "参考不是页：不进 nodes / contents");
  });
  it("没有参考 → 空表（不是 undefined）；目录外的路径响亮拒绝（编程错误）", async () => {
    const p = emptyProject(); createNode(p, "a.txt", "", () => 1);
    const r = await unpackProject(await packProject(p)); eq(r.kind, "ok"); eq(r.project.references.size, 0);
    p.references.set("references/r0.jpg", new Uint8Array([1]));
    let msg = ""; try { await packProject(p); } catch (e) { msg = String(e.message); }
    assert(msg.includes("outside"), `应当拒绝，实得：${msg}`);
  });
  it("增量重打：没改的参考 entry passThrough（已压缩字节逐位相同）；改一张只重压那一张", async () => {
    const p = emptyProject(); createNode(p, "a.txt", "中文正文".repeat(200), () => 1); p.tree = ["a.txt"];
    p.references.set(`${REFERENCES_DIR}manifest.json`, te.encode('{"version":1,"index":0,"items":[{"kind":"image","src":"r0.jpg"}]}'));
    p.references.set(`${REFERENCES_DIR}r0.jpg`, new Uint8Array(3000).map((_, i) => (i * 13) & 255));
    const s1 = { passThrough: 0, encoded: 0 }; const b1 = await packProject(p, { stats: s1 });
    eq(s1.passThrough, 0); eq(s1.encoded, 1 + 2 + 2, "首次：1 页 + 2 个参考 entry + graph.json + editor-state 全压");
    const r = await unpackProject(b1); eq(r.kind, "ok");
    const s2 = { passThrough: 0, encoded: 0 }; const b2 = await packProject(r.project, { stats: s2 });
    eq(s2.passThrough, 3, "读回再写：1 页 + 2 个参考 entry 全部 passThrough"); eq(s2.encoded, 2);
    assert(same(await bytesOf(b1), await bytesOf(b2)), "同内容同字节");
    r.project.references.set(`${REFERENCES_DIR}manifest.json`, te.encode('{"version":1,"index":0,"items":[{"kind":"image","src":"r0.jpg","vp":{"tx":1,"ty":2,"scale":1,"rot":0}}]}'));
    const s3 = { passThrough: 0, encoded: 0 }; await packProject(r.project, { stats: s3 });
    eq(s3.passThrough, 2, "改了清单：页 + r0.jpg 仍 passThrough"); eq(s3.encoded, 3, "清单 + graph.json + editor-state 重压");
  });
  it("editor-state.refPanel（窗口开没开 / 在哪 / 多大）随 editor-state 走：写了才有、坏值忽略", async () => {
    const p = emptyProject(); createNode(p, "a.txt", "", () => 1);
    let r = await unpackProject(await packProject(p)); eq(r.project.editorState.refPanel, undefined, "没设过 → 不写不读");
    p.editorState.refPanel = { open: true, left: 12, top: 80, width: 300, height: 240 };
    const blob = await packProject(p);
    eq(JSON.parse(td.decode((await zipUnpack(blob))[".webxiaoheiwu/editor-state.json"])).refPanel.width, 300);
    r = await unpackProject(blob); eq(JSON.stringify(r.project.editorState.refPanel), JSON.stringify({ open: true, left: 12, top: 80, width: 300, height: 240 }));
    const bad = await zipOf([{ path: "graph.json", data: graphOf({ pages: { "a.txt": { created: 1, modified: 1, links: [] } } }) }, { path: "pages/a.txt", data: "" }, { path: ".webxiaoheiwu/editor-state.json", data: JSON.stringify({ last: null, back: [], refPanel: { open: true, left: "x" } }) }]);
    r = await unpackProject(bad); eq(r.kind, "ok"); eq(r.project.editorState.refPanel, undefined, "坏值 → 当没有");
  });
});
