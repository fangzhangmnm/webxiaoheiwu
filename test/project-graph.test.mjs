// 图操作（ADR-0009）+ 主干树（ADR-0014）。created 2026-09-10 by Claude Fable 5.1（v2 树操作测试同日）
import { describe, it, eq, assert } from "./runner.mjs";
import { emptyProject } from "../src/project/format.ts";
import { createNode, setNodeText, link, unlink, links, backlinks, renameNode, deleteNode, search, resolveName, uniqueNodeName, createBytesNode, replaceNodeBytes, discard, purge,
  inTree, treeParent, treeSiblings, treeChildren, treePath, dfsOrder, dfsPrev, dfsNext, moveUp, moveDown, outdent, indent, detach, detachToLinks, attachAfter, attachUnder, attachAtEnd, insertSibling, insertChild, exportSubtree } from "../src/project/graph.ts";
const tick = () => { let t = 0; return () => ++t; };
const throws = (fn, re) => { try { fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error(`threw the wrong thing: ${e.message}`); return true; } throw new Error("expected a throw"); };
const T = (p) => JSON.stringify(p.tree);

describe("project/graph · 撞名=链接、占位符已废、反链=查询", () => {
  it("createNode 撞名（大小写/NFC 不敏感）→ 返回已有名不新建；link 到没有的名字 → 抛（占位符已废）", () => {
    const p = emptyProject(); const now = tick();
    eq(createNode(p, "夏音.txt", "x", now).created, true);
    const r = createNode(p, "夏音.TXT", "y", now); eq(r.created, false); eq(r.name, "夏音.txt");
    eq(p.contents.size, 1); eq(resolveName(p, "夏音.TXT"), "夏音.txt"); eq(resolveName(p, "祭祀线.txt"), null);
    throws(() => link(p, "夏音.txt", "祭祀线.txt", { now }), /no such page/);
  });
  it("link 默认末尾（user 2026-09-10「节点应该加在末尾」）、不重复、目标名对到真名；unlink；backlinks 是查询", () => {
    const p = emptyProject(); const now = tick();
    createNode(p, "a.txt", "", now); createNode(p, "b.txt", "", now); createNode(p, "c.txt", "", now); createNode(p, "z.txt", "", now);
    link(p, "a.txt", "b.txt", { now }); link(p, "a.txt", "c.txt", { now }); eq(link(p, "a.txt", "B.txt", { now }), false);
    eq(links(p, "a.txt").join("|"), "b.txt|c.txt");
    link(p, "a.txt", "Z.TXT", { at: "top", now }); eq(links(p, "a.txt")[0], "z.txt", "显式 top 仍可，且写的是文件真名"); unlink(p, "a.txt", "z.txt", now);
    eq(backlinks(p, "b.txt").join(), "a.txt"); eq(backlinks(p, "a.txt").length, 0);
    assert(unlink(p, "a.txt", "c.txt", now)); eq(links(p, "a.txt").length, 1);
  });
  it("renameNode 改 entry + 重写所有引用 + tree 条目 + editor-state.last/back；目标撞名抛；改大小写允许", () => {
    const p = emptyProject(); const now = tick();
    createNode(p, "夏音.txt", "", now); createNode(p, "场景1.txt", "", now); createNode(p, "场景2.txt", "", now);
    link(p, "场景1.txt", "夏音.txt", { now }); link(p, "场景2.txt", "夏音.txt", { now }); p.editorState.last = "夏音.txt"; p.editorState.back = ["场景1.txt", "夏音.txt"];
    p.tree = [{ name: "场景1.txt", children: ["夏音.txt"] }, "场景2.txt"];
    renameNode(p, "夏音.txt", "夏音-设定.txt", now);
    assert(p.contents.has("夏音-设定.txt") && !p.contents.has("夏音.txt"));
    eq(p.nodes.get("场景1.txt").links.join(), "夏音-设定.txt"); eq(p.nodes.get("场景2.txt").links.join(), "夏音-设定.txt");
    eq(T(p), JSON.stringify([{ name: "场景1.txt", children: ["夏音-设定.txt"] }, "场景2.txt"]), "tree 重写");
    eq(p.editorState.last, "夏音-设定.txt"); eq(p.editorState.back.join("|"), "场景1.txt|夏音-设定.txt");
    throws(() => renameNode(p, "场景1.txt", "场景2.txt", now), /name taken/);
    renameNode(p, "场景1.txt", "场景1.TXT", now); assert(p.contents.has("场景1.TXT")); eq(treeChildren(p, "场景1.txt").join(), "夏音-设定.txt", "改大小写后树里也是新写法");
    eq(treeParent(p, "夏音-设定.txt"), "场景1.TXT");
  });
  it("deleteNode：正文没了，指向它的边一并断掉（不留悬空），树里拿掉、孩子提上来", () => {
    const p = emptyProject(); const now = tick();
    createNode(p, "a.txt", "", now); createNode(p, "b.txt", "", now); createNode(p, "c.txt", "", now); link(p, "a.txt", "b.txt", { now });
    p.tree = ["a.txt", { name: "b.txt", children: ["c.txt"] }];
    assert(deleteNode(p, "b.txt")); eq(links(p, "a.txt").length, 0); eq(T(p), JSON.stringify(["a.txt", "c.txt"]));
    eq(deleteNode(p, "b.txt"), false);
  });
  it("setNodeText 只在内容变了才 touch modified；search 一个字就搜（user 2026-09-10「检索不限字数」）、名字或正文命中、按 modified 降序", () => {
    const p = emptyProject(); const now = tick();
    createNode(p, "老.txt", "山田妖精", now); createNode(p, "新.txt", "厕纸轻小说", now);
    eq(setNodeText(p, "老.txt", "山田妖精", now), false);
    eq(search(p, "妖").join(), "老.txt", "一个字就搜");
    eq(search(p, "").length, 0, "空串不搜");
    eq(search(p, "妖", { minChars: 2 }).length, 0, "显式 minChars 仍可");
    eq(search(p, "妖精").join(), "老.txt");
    setNodeText(p, "老.txt", "山田妖精 厕纸", now);
    eq(search(p, "厕纸").join("|"), "老.txt|新.txt", "刚改过的排前面");
  });
});

describe("project/graph · 删除模型 = 三个显式动词、无引用计数无孤儿（user 2026-09-10 深夜「不同意引用计数」；ADR-0014 §8）", () => {
  const book = () => {
    const p = emptyProject(); const now = tick();
    for (const n of ["正文", "第一幕", "一话", "二话", "第二幕", "三话", "设定", "笔记"]) createNode(p, n + ".txt", n, now);
    p.tree = [{ name: "正文.txt", children: [{ name: "第一幕.txt", children: ["一话.txt", "二话.txt"] }, { name: "第二幕.txt", children: ["三话.txt"] }] }, "设定.txt"];
    link(p, "笔记.txt", "第一幕.txt", { now }); link(p, "笔记.txt", "二话.txt", { now }); link(p, "一话.txt", "设定.txt", { now }); link(p, "设定.txt", "笔记.txt", { now });
    return { p, now };
  };
  const names = (p) => [...p.contents.keys()].sort().join("|");
  it("断开链接 unlink：只删这一条边，永不改名、不看对方还剩几个引用", () => {
    const { p, now } = book(); const before = names(p);
    assert(unlink(p, "笔记.txt", "二话.txt", now)); eq(links(p, "笔记.txt").join(), "第一幕.txt"); eq(names(p), before);
    assert(unlink(p, "设定.txt", "笔记.txt", now)); eq(backlinks(p, "笔记.txt").length, 0, "没人指了"); eq(names(p), before, "还是不改名（无孤儿概念）"); assert(p.contents.has("笔记.txt"));
  });
  it("移出树 detachToLinks：x 连同子树出树，子树边降级成 links（每层孩子按原顺序追加到父亲 links 末尾）、结构不丢、不改名；叶子 → 0；散页 → null", () => {
    const { p, now } = book(); const before = names(p); const L = links(p, "一话.txt").join();
    eq(detachToLinks(p, "正文.txt", now), 5, "正文→第一幕/第二幕 + 第一幕→一话/二话 + 第二幕→三话 = 5 条边");
    eq(dfsOrder(p).join("|"), "设定.txt"); eq(names(p), before);
    eq(links(p, "正文.txt").join("|"), "第一幕.txt|第二幕.txt"); eq(links(p, "第一幕.txt").join("|"), "一话.txt|二话.txt"); eq(links(p, "第二幕.txt").join("|"), "三话.txt");
    eq(links(p, "一话.txt").join(), L, "原有 links 留在前面，不重复不乱序");
    eq(detachToLinks(p, "设定.txt", now), 0, "叶子：没有边可降级"); eq(p.tree.length, 0);
    eq(detachToLinks(p, "笔记.txt", now), null, "散页");
    // 已有同名边不重复：先把 一话 链到 二话 再移出
    const q = book().p; link(q, "第一幕.txt", "二话.txt", { now }); eq(detachToLinks(q, "第一幕.txt", now), 2); eq(links(q, "第一幕.txt").join("|"), "二话.txt|一话.txt", "已有的边不重复，只补缺的");
  });
  it("废弃 discard：改名 _废-x（撞名 hex4）；在树里 → 连同子树出树、子节各自也改名（删容器 = 删内容）、子树边降级成 links；外部 links 重写到新名；不删字节；已带前缀不再套；散页只改名", () => {
    const { p, now } = book(); const files = p.contents.size;
    const r = discard(p, "第一幕.txt", "_废-", now);
    eq(r.detached, 2); eq(r.renamed.map((x) => `${x.from}>${x.to}`).join("|"), "第一幕.txt>_废-第一幕.txt|一话.txt>_废-一话.txt|二话.txt>_废-二话.txt");
    eq(p.contents.size, files, "不删字节"); eq(dfsOrder(p).join("|"), "正文.txt|第二幕.txt|三话.txt|设定.txt", "整支出树");
    eq(links(p, "笔记.txt").join("|"), "_废-第一幕.txt|_废-二话.txt", "外部 links 重写到新名");
    eq(links(p, "_废-第一幕.txt").join("|"), "_废-一话.txt|_废-二话.txt", "子树结构留成 links"); eq(links(p, "_废-一话.txt").join(), "设定.txt");
    createNode(p, "第一幕.txt", "again", now); const r2 = discard(p, "第一幕.txt", "_废-", now); assert(/^_废-第一幕-[0-9a-f]{4}\.txt$/.test(r2.renamed[0].to), r2.renamed[0].to); eq(r2.detached, 0, "散页：只改名");
    const r3 = discard(p, "_废-一话.txt", "_废-", now); eq(r3.renamed[0].to, "_废-一话.txt", "已带前缀不再套");
    throws(() => discard(p, "没有.txt", "_废-", now), /no such page/);
    p.editorState.last = "_废-二话.txt"; discard(p, "_废-二话.txt", "_dropped-", now, ["_废-", "_dropped-"]); eq(p.editorState.last, "_废-二话.txt", "别的语言前缀：中文前缀已在 → 不套");
  });
  it("彻底删除 purge：只对带前缀（任一语言）的页；删文件 + 指向它的 links 条目移除；返回被移除的入链来源；非 _废- 页拒绝", () => {
    const { p, now } = book();
    discard(p, "二话.txt", "_废-", now); eq(links(p, "笔记.txt").join("|"), "第一幕.txt|_废-二话.txt");
    throws(() => purge(p, "一话.txt", ["_废-", "_dropped-"]), /not a discarded page/);
    eq(purge(p, "_废-二话.txt", ["_废-", "_dropped-"]).join(), "笔记.txt");
    assert(!p.contents.has("_废-二话.txt")); eq(links(p, "笔记.txt").join(), "第一幕.txt", "入链移除，不留悬空");
    renameNode(p, "一话.txt", "_dropped-一话.txt", now); eq(purge(p, "_dropped-一话.txt", ["_废-", "_dropped-"]).length, 0); assert(!p.contents.has("_dropped-一话.txt")); eq(treeChildren(p, "第一幕.txt").length, 0, "树里也拿掉");
    throws(() => purge(p, "没有.txt", ["_废-"]), /no such page/);
  });
});

describe("project/graph · 主干树（ADR-0014 §8；handoff §2 语义）", () => {
  const book = () => {
    const p = emptyProject(); const now = tick();
    for (const n of ["正文", "第一幕", "一话", "二话", "第二幕", "三话", "设定", "散"]) createNode(p, n + ".txt", n, now);
    p.tree = [{ name: "正文.txt", children: [{ name: "第一幕.txt", children: ["一话.txt", "二话.txt"] }, { name: "第二幕.txt", children: ["三话.txt"] }] }, "设定.txt"];
    link(p, "一话.txt", "设定.txt", { now }); link(p, "二话.txt", "散.txt", { now });
    return p;
  };
  const linksSnapshot = (p) => JSON.stringify([...p.nodes].map(([k, v]) => [k, v.links]));
  it("查询：inTree / treeParent / treeSiblings / treeChildren / treePath；散页全空", () => {
    const p = book();
    assert(inTree(p, "一话.txt")); assert(!inTree(p, "散.txt")); assert(inTree(p, "一話.txt".normalize("NFC")) === false);
    eq(treeParent(p, "一话.txt"), "第一幕.txt"); eq(treeParent(p, "正文.txt"), null); eq(treeParent(p, "散.txt"), null);
    eq(treeSiblings(p, "一话.txt").join("|"), "一话.txt|二话.txt"); eq(treeSiblings(p, "正文.txt").join("|"), "正文.txt|设定.txt"); eq(treeSiblings(p, "散.txt").length, 0);
    eq(treeChildren(p, "正文.txt").join("|"), "第一幕.txt|第二幕.txt"); eq(treeChildren(p, "一话.txt").length, 0); eq(treeChildren(p, "散.txt").length, 0);
    eq(treePath(p, "二话.txt").join("|"), "正文.txt|第一幕.txt|二话.txt"); eq(treePath(p, "散.txt").length, 0); eq(treePath(p, "设定.txt").join(), "设定.txt");
    eq(treeParent(p, "一話.txt"), null);
  });
  it("DFS 前序 = 自己 → 孩子 → 下一个兄弟 → 回溯；prev/next 首尾 null 不绕回；散页 null", () => {
    const p = book();
    eq(dfsOrder(p).join("|"), "正文.txt|第一幕.txt|一话.txt|二话.txt|第二幕.txt|三话.txt|设定.txt");
    eq(dfsPrev(p, "正文.txt"), null); eq(dfsNext(p, "设定.txt"), null);
    eq(dfsNext(p, "二话.txt"), "第二幕.txt", "跨幕"); eq(dfsPrev(p, "第二幕.txt"), "二话.txt"); eq(dfsNext(p, "三话.txt"), "设定.txt", "回溯到祖先的下一个兄弟");
    eq(dfsPrev(p, "散.txt"), null); eq(dfsNext(p, "散.txt"), null);
    let n = "正文.txt", steps = 0; while ((n = dfsNext(p, n))) steps++; eq(steps, 6, "走到底停");
  });
  it("moveUp / moveDown：同层交换；到头 no-op；散页 no-op；links 不动", () => {
    const p = book(); const L = linksSnapshot(p);
    eq(moveUp(p, "一话.txt"), false); eq(moveDown(p, "二话.txt"), false);
    assert(moveDown(p, "一话.txt")); eq(treeChildren(p, "第一幕.txt").join("|"), "二话.txt|一话.txt");
    assert(moveUp(p, "一话.txt")); eq(treeChildren(p, "第一幕.txt").join("|"), "一话.txt|二话.txt");
    assert(moveUp(p, "设定.txt")); eq(treeSiblings(p, "设定.txt").join("|"), "设定.txt|正文.txt");
    eq(moveUp(p, "散.txt"), false); eq(moveDown(p, "散.txt"), false);
    eq(linksSnapshot(p), L);
  });
  it("outdent：出到父亲那一层、插到父亲之后；顶层 no-op；父亲没孩子了折成字符串", () => {
    const p = book();
    eq(outdent(p, "正文.txt"), false); eq(outdent(p, "散.txt"), false);
    assert(outdent(p, "三话.txt")); eq(treeChildren(p, "正文.txt").join("|"), "第一幕.txt|第二幕.txt|三话.txt"); eq(treeParent(p, "三话.txt"), "正文.txt");
    eq(JSON.stringify(p.tree[0].children[1]), JSON.stringify("第二幕.txt"), "第二幕 没孩子了 → 字符串");
    assert(outdent(p, "第一幕.txt")); eq(treeSiblings(p, "第一幕.txt").join("|"), "正文.txt|第一幕.txt|设定.txt"); eq(treeChildren(p, "第一幕.txt").join("|"), "一话.txt|二话.txt", "子树跟着走");
  });
  it("indent：进到上一个兄弟的孩子末尾（字符串兄弟升格为组）；没有上一个兄弟 no-op", () => {
    const p = book();
    eq(indent(p, "正文.txt"), false); eq(indent(p, "一话.txt"), false); eq(indent(p, "散.txt"), false);
    assert(indent(p, "二话.txt")); eq(treeChildren(p, "一话.txt").join(), "二话.txt"); eq(treeParent(p, "二话.txt"), "一话.txt");
    assert(indent(p, "设定.txt")); eq(treeChildren(p, "正文.txt").join("|"), "第一幕.txt|第二幕.txt|设定.txt", "末尾，不是原位");
    assert(indent(p, "第二幕.txt")); eq(treeChildren(p, "第一幕.txt").join("|"), "一话.txt|第二幕.txt"); eq(treeChildren(p, "第二幕.txt").join(), "三话.txt", "带着子树");
  });
  it("detach：整个子树拿掉、页文件与 links 一字不动；attachAfter / attachUnder / attachAtEnd 放回；已在树里 = 先拿再放（子树跟着）；不能放进自己的子树", () => {
    const p = book(); const L = linksSnapshot(p); const files = p.contents.size;
    const sub = detach(p, "第一幕.txt");
    eq(JSON.stringify(sub), JSON.stringify({ name: "第一幕.txt", children: ["一话.txt", "二话.txt"] }));
    assert(!inTree(p, "第一幕.txt") && !inTree(p, "一话.txt")); eq(p.contents.size, files); eq(linksSnapshot(p), L);
    eq(dfsOrder(p).join("|"), "正文.txt|第二幕.txt|三话.txt|设定.txt");
    eq(detach(p, "散.txt"), null);
    attachAfter(p, "第一幕.txt", "设定.txt"); eq(treeSiblings(p, "第一幕.txt").join("|"), "正文.txt|设定.txt|第一幕.txt"); eq(treeChildren(p, "第一幕.txt").length, 0, "detach 时孩子已散了，放回来只有它自己");
    attachUnder(p, "一话.txt", "第一幕.txt"); attachUnder(p, "二话.txt", "第一幕.txt"); eq(treeChildren(p, "第一幕.txt").join("|"), "一话.txt|二话.txt");
    attachUnder(p, "第一幕.txt", "正文.txt"); eq(treeChildren(p, "正文.txt").join("|"), "第二幕.txt|第一幕.txt", "树里的页归档 = 先拿再放，子树跟着"); eq(treeChildren(p, "第一幕.txt").join("|"), "一话.txt|二话.txt");
    attachAfter(p, "散.txt", "设定.txt"); eq(treeSiblings(p, "散.txt").join("|"), "正文.txt|设定.txt|散.txt");
    attachAtEnd(p, "散.txt"); attachAtEnd(p, "设定.txt"); eq(p.tree.map((n) => typeof n === "string" ? n : n.name).join("|"), "正文.txt|散.txt|设定.txt");
    throws(() => attachUnder(p, "正文.txt", "一话.txt"), /own subtree/); throws(() => attachAfter(p, "正文.txt", "第一幕.txt"), /own subtree/);
    throws(() => attachAfter(p, "正文.txt", "正文.txt"), /itself/); throws(() => attachUnder(p, "没有.txt", "正文.txt"), /no such page/); throws(() => attachAfter(p, "散.txt", "没有.txt"), /no such page/);
    eq(linksSnapshot(p), L, "全程 links 一字不动");
  });
  it("insertSibling / insertChild：新名当场建空文件并入树；已有散页 → 归档到这里；已在树里 → placed:false 不动位置；锚不在树 → 抛", () => {
    const p = book(); const now = tick();
    const r1 = insertSibling(p, "一话.txt", "一话半.txt", now); eq(JSON.stringify(r1), JSON.stringify({ name: "一话半.txt", created: true, placed: true }));
    eq(treeChildren(p, "第一幕.txt").join("|"), "一话.txt|一话半.txt|二话.txt"); eq(p.contents.has("一话半.txt"), true); eq(new TextDecoder().decode(p.contents.get("一话半.txt")), "");
    const r2 = insertChild(p, "第二幕.txt", "散.txt", now); eq(JSON.stringify(r2), JSON.stringify({ name: "散.txt", created: false, placed: true })); eq(treeChildren(p, "第二幕.txt").join("|"), "三话.txt|散.txt");
    const r3 = insertChild(p, "第一幕.txt", "设定.TXT", now); eq(JSON.stringify(r3), JSON.stringify({ name: "设定.txt", created: false, placed: false })); eq(treeParent(p, "设定.txt"), null, "已在树里的页不动");
    createNode(p, "外.txt", "", now); throws(() => insertSibling(p, "外.txt", "x.txt", now), /not in tree/); throws(() => insertChild(p, "外.txt", "x.txt", now), /not in tree/);
    throws(() => insertChild(p, "第一幕.txt", "a/b.txt", now), /invalid page name/);
  });
  it("exportSubtree：子树 DFS 拼接 txt 正文（\\n\\n 连接、末尾换行）；图片页跳过；散页只有自己", () => {
    const p = book(); p.contents.set("图.png", new Uint8Array([1])); p.nodes.set("图.png", { links: [], created: 1, modified: 1 }); attachUnder(p, "图.png", "第一幕.txt");
    eq(exportSubtree(p, "正文.txt"), "正文\n\n第一幕\n\n一话\n\n二话\n\n第二幕\n\n三话\n");
    eq(exportSubtree(p, "第二幕.txt"), "第二幕\n\n三话\n");
    eq(exportSubtree(p, "散.txt"), "散\n");
    throws(() => exportSubtree(p, "没有.txt"), /no such page/);
  });
});

describe("project/graph · 2.1 图片页 / 字节页（ADR-0012/0013）", () => {
  it("uniqueNodeName：撞名 → stem-hex4.ext（大小写不敏感）；createBytesNode 不链接已有页；replaceNodeBytes 保名", () => {
    const p = emptyProject(); const now = tick(); createNode(p, "作品.txt", "", now);
    eq(uniqueNodeName(p, "夏音.jpg"), "夏音.jpg");
    const n1 = createBytesNode(p, "夏音.jpg", new Uint8Array([1]), now); eq(n1, "夏音.jpg");
    const n2 = createBytesNode(p, "夏音.JPG", new Uint8Array([2]), now); assert(/^夏音-[0-9a-f]{4}\.JPG$/.test(n2), n2); eq(p.contents.size, 3);
    replaceNodeBytes(p, "夏音.jpg", new Uint8Array([9, 9]), now); eq(p.contents.get("夏音.jpg").length, 2); eq(p.nodes.get("夏音.jpg").links.length, 0);
  });
  it("search 不进图片字节：只搜名字", () => {
    const p = emptyProject(); const now = tick(); createNode(p, "a.txt", "hello", now); p.contents.set("h.png", new TextEncoder().encode("hello bytes")); p.nodes.set("h.png", { links: [], created: 1, modified: 1 });
    eq(search(p, "hello").join("|"), "a.txt"); eq(search(p, "h.p").join("|"), "h.png");
  });
});
