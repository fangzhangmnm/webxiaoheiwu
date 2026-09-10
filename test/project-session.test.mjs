// 书会话（ADR-0008/0009/0010/0014）：新建 / 跳转 / 落盘 / 修改锁 / 树动词。created 2026-09-10 by Claude Fable 5.1（v2 同日）
import { describe, it, eq, assert } from "./runner.mjs";
import { ensureZipLoaded } from "./zip-node.mjs";
ensureZipLoaded();
const { createProjectSession } = await import("../src/project/session.ts");

function fakeStore() {
  const files = new Map(); const writes = [];
  return { files, writes, deps: { read: async (n) => files.get(n) ?? null, write: async (n, blob, o) => { files.set(n, blob); writes.push({ n, push: o.push }); return { pushed: o.push }; }, now: (() => { let t = 0; return () => ++t; })() } };
}
const throwsName = (fn, name) => { try { fn(); } catch (e) { if (e?.name !== name) throw new Error(`expected ${name}, got ${e?.name}: ${e?.message}`); return true; } throw new Error(`expected ${name} to be thrown`); };

describe("project/session · 新建 / 跳转不标脏 / 正文改了才脏 / 整包落盘往返", () => {
  it("create → 一个空页为当前、树的第一个节点；flush 写整包；再 open 回来一样", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("夏音.webxiaoheiwu.zip", "作品.txt");
    eq(ps.current(), "作品.txt"); assert(ps.dirty); assert(ps.isInTree("作品.txt")); eq(ps.order().join(), "作品.txt");
    ps.setCurrentText("第一段");
    const r = await ps.flush(true); eq(r.wrote, true); eq(r.pushed, true); assert(!ps.dirty);
    const ps2 = createProjectSession(s.deps); const o = await ps2.open("夏音.webxiaoheiwu.zip");
    eq(o.kind, "ok"); eq(o.warnings.length, 0); eq(ps2.current(), "作品.txt"); eq(ps2.currentText(), "第一段"); eq(ps2.order().join(), "作品.txt");
  });
  it("jump 到已有页不标脏；jump 到没有的名字 → 抛（占位符已废）；正文没变 setCurrentText 不脏", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("p.webxiaoheiwu.zip", "a.txt"); ps.setCurrentText("A"); await ps.flush(false);
    ps.spawn("b.txt", "B"); await ps.flush(false); assert(!ps.dirty);
    eq(ps.jump("a.txt"), "a.txt"); assert(!ps.dirty, "跳转不标脏");
    eq(ps.setCurrentText("A"), false); assert(!ps.dirty);
    let threw = false; try { ps.jump("祭祀线.txt"); } catch { threw = true; } assert(threw, "没有这页 → 抛"); eq(ps.current(), "a.txt"); assert(!ps.dirty); eq(ps.exists("祭祀线.txt"), false);
  });
  it("spawn：新页带选中文字、边从当前页指向它在末尾、光标跳过去、不进树；撞名 = 链接已有", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("p.webxiaoheiwu.zip", "场景.txt"); ps.setCurrentText("她推开门。他在窗边。");
    eq(ps.spawn("夏音.txt", "她推开门。"), "夏音.txt"); eq(ps.current(), "夏音.txt"); eq(ps.currentText(), "她推开门。"); assert(!ps.isInTree("夏音.txt"));
    ps.jump("场景.txt"); ps.spawn("路人.txt", "他在窗边。"); ps.jump("场景.txt");
    eq(ps.sidebar().join("|"), "夏音.txt|路人.txt", "最新在末尾");
    ps.spawn("夏音.TXT", "again"); eq(ps.current(), "夏音.txt"); eq(ps.currentText(), "她推开门。", "撞名不覆盖正文");
  });
  it("addLink 只准已有页 / removeLink / setLinksOrder / rename 重写引用与树 / remove 不留悬空 / find / backlinksOf", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("p.webxiaoheiwu.zip", "大纲.txt");
    let threw = false; try { ps.addLink("第一章.txt"); } catch { threw = true; } assert(threw, "占位符已废：连到没有的页 → 抛");
    ps.newChild("第一章.txt"); ps.jump("大纲.txt"); ps.newChild("第二章.txt"); ps.jump("大纲.txt");
    assert(ps.addLink("第一章.txt")); assert(ps.addLink("第二章.txt")); eq(ps.sidebar().join("|"), "第一章.txt|第二章.txt");
    ps.setLinksOrder(["第二章.txt", "第一章.txt", "ghost.txt"]); eq(ps.sidebar().join("|"), "第二章.txt|第一章.txt", "重排；悬空丢");
    ps.jump("第一章.txt"); ps.setCurrentText("山田妖精"); ps.jump("大纲.txt");
    ps.rename("第一章.txt", "第一章-初稿.txt");
    eq(ps.sidebar().join("|"), "第二章.txt|第一章-初稿.txt"); eq(ps.neighborhood().children.join("|"), "第一章-初稿.txt|第二章.txt", "树也重写");
    eq(ps.backlinksOf("第一章-初稿.txt").join(), "大纲.txt");
    eq(ps.find("妖精").join(), "第一章-初稿.txt");
    assert(ps.removeLink("第二章.txt")); eq(ps.sidebar().length, 1);
    ps.remove("第一章-初稿.txt"); eq(ps.sidebar().length, 0, "删了页，指向它的边也没了"); eq(ps.neighborhood().children.join(), "第二章.txt");
  });
  it("flush(push, {force}) 不脏也写（推云节律：本地落盘清了 dirty 之后 15s 推云还得交字节）；adoptName 只换身份", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("p.webxiaoheiwu.zip", "a.txt"); ps.setCurrentText("A"); await ps.flush(false); assert(!ps.dirty);
    eq((await ps.flush(true)).wrote, false, "不脏默认不写");
    const r = await ps.flush(true, { force: true }); eq(r.wrote, true); eq(r.pushed, true); eq(s.writes.at(-1).push, true);
    ps.adoptName("q.webxiaoheiwu.zip"); eq(ps.name, "q.webxiaoheiwu.zip"); assert(!ps.dirty, "改身份不标脏");
    ps.setCurrentText("A2"); await ps.flush(false); eq(s.writes.at(-1).n, "q.webxiaoheiwu.zip", "之后写新名");
  });
  it("too-new → 只读：不许改、flush 不写；v1 → not-project", async () => {
    const s = fakeStore();
    const { zipPack } = await import("../src/zip.ts");
    s.files.set("new.webxiaoheiwu.zip", await zipPack([{ path: "graph.json", data: JSON.stringify({ format: "webxiaoheiwu", version: 99, wroteWith: "x", tree: [], pages: {} }) }]));
    s.files.set("old.webxiaoheiwu.zip", await zipPack([{ path: "graph.json", data: JSON.stringify({ format: "webxiaoheiwu", version: 1, wroteWith: "x", pages: {} }) }, { path: "pages/a.txt", data: "A" }]));
    const ps = createProjectSession(s.deps); const o = await ps.open("new.webxiaoheiwu.zip");
    eq(o.kind, "too-new"); assert(ps.readOnly);
    let threw = false; try { ps.spawn("x.txt", ""); } catch { threw = true; } assert(threw);
    eq((await ps.flush(true)).wrote, false);
    eq((await ps.open("old.webxiaoheiwu.zip")).kind, "not-project");
  });
  it("open：没记位置 → 树首（不是名字序第一）", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("p.webxiaoheiwu.zip", "正文.txt"); ps.newChild("b.txt"); ps.jump("正文.txt"); ps.newSibling("a.txt"); ps.setBack([]); ps.project.editorState.last = null; await ps.flush(false);
    const ps2 = createProjectSession(s.deps); await ps2.open("p.webxiaoheiwu.zip"); eq(ps2.current(), "正文.txt");
  });
  it("open 竞态：慢的旧 open 不覆盖新的", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("a.webxiaoheiwu.zip", "a.txt"); await ps.flush(false); ps.create("b.webxiaoheiwu.zip", "b.txt"); await ps.flush(false);
    let release; const slow = new Promise((r) => { release = r; });
    const deps2 = { ...s.deps, read: async (n) => { if (n === "a.webxiaoheiwu.zip") await slow; return s.files.get(n) ?? null; } };
    const p2 = createProjectSession(deps2);
    const pa = p2.open("a.webxiaoheiwu.zip"); const pb = p2.open("b.webxiaoheiwu.zip");
    await pb; release(); const ra = await pa;
    eq(ra.kind, "unavailable"); eq(p2.name, "b.webxiaoheiwu.zip"); eq(p2.current(), "b.txt");
  });
});

describe("project/session · 主干树动词（ADR-0014）+ 邻域查询", () => {
  it("newSibling / newChild 当场建空文件、入树、跳过去；打已有散页名 = 归档；打已在树里的名 = 只跳；neighborhood 给 ..（父）/ 兄弟 / 孩子 / links / 谁指向这里 / prev / next", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("p.webxiaoheiwu.zip", "正文.txt");
    let r = ps.newChild("第一幕.txt"); eq(r.created, true); eq(r.placed, true); eq(ps.current(), "第一幕.txt"); eq(ps.currentText(), "");
    r = ps.newChild("一话.txt"); ps.jump("第一幕.txt"); r = ps.newSibling("第二幕.txt"); eq(ps.current(), "第二幕.txt");
    ps.spawn("散.txt", "loose"); assert(!ps.isInTree("散.txt")); ps.jump("第二幕.txt");
    eq(ps.order().join("|"), "正文.txt|第一幕.txt|一话.txt|第二幕.txt");
    let n = ps.neighborhood(); eq(n.current, "第二幕.txt"); eq(n.inTree, true); eq(n.parent, "正文.txt"); eq(n.siblings.join("|"), "第一幕.txt|第二幕.txt"); eq(n.children.length, 0); eq(n.links.join(), "散.txt"); eq(n.incoming.length, 0); eq(n.prev, "一话.txt"); eq(n.next, null);
    r = ps.newChild("散.txt"); eq(r.created, false); eq(r.placed, true); assert(ps.isInTree("散.txt")); eq(ps.current(), "散.txt"); eq(ps.pathOf("散.txt").join("|"), "正文.txt|第二幕.txt|散.txt");
    n = ps.neighborhood(); eq(n.parent, "第二幕.txt"); eq(n.incoming.join(), "第二幕.txt"); eq(n.prev, "第二幕.txt"); eq(n.next, null);
    ps.jump("正文.txt"); r = ps.newSibling("一话.txt"); eq(r.placed, false); eq(ps.current(), "一话.txt"); eq(ps.neighborhood().parent, "第一幕.txt", "已在树里 → 位置不动，只跳");
    ps.treeDetach("散.txt"); ps.jump("散.txt"); n = ps.neighborhood(); eq(n.inTree, false); eq(n.parent, null); eq(n.siblings.length, 0); eq(n.prev, null); eq(n.next, null); eq(n.incoming.join(), "第二幕.txt");
    let threw = false; try { ps.newSibling("x.txt"); } catch { threw = true; } assert(threw, "散页上没有「+ 兄弟」");
    assert(ps.dirty);
  });
  it("treeUp / treeDown / treeOutdent / treeIndent / treeDetach / archiveAfter / archiveUnder / archiveAtEnd 都标脏、往返落盘", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("p.webxiaoheiwu.zip", "正文.txt"); ps.newChild("a.txt"); ps.jump("正文.txt"); ps.newChild("b.txt"); ps.jump("正文.txt"); ps.newSibling("设定.txt"); ps.jump("正文.txt"); await ps.flush(false); assert(!ps.dirty);
    assert(ps.treeUp("b.txt")); assert(ps.dirty); eq(ps.neighborhood().children.join("|"), "b.txt|a.txt");
    assert(ps.treeDown("b.txt")); eq(ps.neighborhood().children.join("|"), "a.txt|b.txt");
    assert(ps.treeOutdent("b.txt")); eq(ps.order().join("|"), "正文.txt|a.txt|b.txt|设定.txt");
    assert(ps.treeIndent("设定.txt")); eq(ps.neighborhood().siblings.join("|"), "正文.txt|b.txt"); eq(ps.pathOf("设定.txt").join("|"), "b.txt|设定.txt"); eq(ps.order().join("|"), "正文.txt|a.txt|b.txt|设定.txt");
    assert(ps.treeDetach("b.txt")); eq(ps.order().join("|"), "正文.txt|a.txt", "移出树 = 带着子树（设定 也散了）"); assert(ps.exists("b.txt") && ps.exists("设定.txt")); assert(!ps.isInTree("设定.txt"));
    ps.archiveAfter("b.txt", "正文.txt"); eq(ps.order().join("|"), "正文.txt|a.txt|b.txt");
    ps.archiveUnder("b.txt", "a.txt"); eq(ps.order().join("|"), "正文.txt|a.txt|b.txt"); eq(ps.pathOf("b.txt").join("|"), "正文.txt|a.txt|b.txt");
    ps.archiveAtEnd("设定.txt"); eq(ps.order().join("|"), "正文.txt|a.txt|b.txt|设定.txt"); eq(ps.pathOf("设定.txt").join(), "设定.txt");
    await ps.flush(false);
    const ps2 = createProjectSession(s.deps); await ps2.open("p.webxiaoheiwu.zip"); eq(ps2.order().join("|"), "正文.txt|a.txt|b.txt|设定.txt"); eq(ps2.pathOf("b.txt").join("|"), "正文.txt|a.txt|b.txt");
    eq(ps2.exportBranch("正文.txt"), "\n\n\n\n\n");
  });
});

describe("project/session · 修改锁在工件层：锁住 = 所有改动动词一律拒绝（user 2026-09-10「不要 ad hoc add hooks」）", () => {
  it("setReadOnly(true) 后：正文/spawn/兄弟/子节/连边/断边/排序/改名/删/丢引用/彻底删/树移动六件/归档/图片/封面/断入边 全部不动；解锁本身仍可；解锁后恢复", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("p.webxiaoheiwu.zip", "作品.txt"); ps.setCurrentText("A"); ps.newChild("b.txt"); ps.setCurrentText("B"); ps.jump("作品.txt"); ps.spawn("c.txt", "C"); ps.jump("作品.txt"); await ps.flush(false);
    ps.setReadOnly(true); assert(ps.dirty, "上锁 = 正经改动"); await ps.flush(false); assert(!ps.canMutate());
    const snap = () => JSON.stringify([[...ps.project.contents.keys()].sort(), [...ps.project.nodes].map(([k, v]) => [k, v.links]), ps.project.tree, ps.project.thumbnail]);
    const before = snap();
    eq(ps.setCurrentText("A2"), false);
    const verbs = [() => ps.spawn("x.txt", "t"), () => ps.newSibling("x.txt"), () => ps.newChild("x.txt"), () => ps.addLink("b.txt"), () => ps.removeLink("c.txt"), () => ps.setLinksOrder([]), () => ps.rename("b.txt", "bb.txt"), () => ps.remove("b.txt"), () => ps.drop("c.txt", "_废-"), () => ps.purge("c.txt"),
      () => ps.treeUp("b.txt"), () => ps.treeDown("b.txt"), () => ps.treeOutdent("b.txt"), () => ps.treeIndent("b.txt"), () => ps.treeDetach("b.txt"), () => ps.archiveAfter("c.txt", "作品.txt"), () => ps.archiveUnder("c.txt", "作品.txt"), () => ps.archiveAtEnd("c.txt"),
      () => ps.addBytesPage("a.png", new Uint8Array([1])), () => ps.replaceBytes("b.txt", new Uint8Array([1])), () => ps.setThumbnail(new Uint8Array([1])), () => ps.cutIncoming("作品.txt")];
    for (const v of verbs) throwsName(v, "LockedBookError");
    eq(snap(), before, "图纹丝不动"); assert(!ps.dirty);
    eq(ps.jump("b.txt"), "b.txt", "跳到已有页不算改动，锁着也能导航"); eq(ps.neighborhood().parent, "作品.txt", "查询不受锁挡"); eq(ps.exportBranch("作品.txt"), "A\n\nB\n");
    ps.jump("作品.txt");
    ps.setReadOnly(false); assert(ps.canMutate()); eq(ps.setCurrentText("B2"), true); assert(ps.treeIndent("b.txt") === false);
  });
});

describe("project/session · 2.1 图片页 / 封面 / 断入边（ADR-0012/0013 + user 2026-09-10）", () => {
  it("addBytesPage：撞名 hex4、当前页末尾长一条边、不跳转；replaceBytes 保名保边；整包往返字节相同", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("书.webxiaoheiwu.zip", "作品.txt"); await ps.flush(false);
    const n1 = ps.addBytesPage("夏音.jpg", new Uint8Array([1, 2, 3])); eq(n1, "夏音.jpg"); eq(ps.current(), "作品.txt");
    const n2 = ps.addBytesPage("夏音.jpg", new Uint8Array([4])); assert(/^夏音-[0-9a-f]{4}\.jpg$/.test(n2), n2);
    eq(ps.sidebar().join("|"), `夏音.jpg|${n2}`);
    ps.replaceBytes("夏音.jpg", new Uint8Array([7, 7, 7, 7])); eq(ps.bytesOf("夏音.jpg").length, 4); eq(ps.sidebar().length, 2);
    assert(ps.dirty); await ps.flush(false);
    const ps2 = createProjectSession(s.deps); eq((await ps2.open("书.webxiaoheiwu.zip")).kind, "ok"); eq(Array.from(ps2.bytesOf("夏音.jpg")).join(), "7,7,7,7"); eq(ps2.sidebar().length, 2);
  });
  it("setThumbnail 标脏并随整包落盘；null 清掉", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("书.webxiaoheiwu.zip", "作品.txt"); await ps.flush(false); assert(!ps.dirty);
    ps.setThumbnail(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0])); assert(ps.dirty); await ps.flush(false);
    const ps2 = createProjectSession(s.deps); await ps2.open("书.webxiaoheiwu.zip"); eq(ps2.thumbnail().length, 5);
    ps2.setThumbnail(null); eq(ps2.thumbnail(), null); assert(ps2.dirty);
  });
  it("cutIncoming：断掉 from → 当前页 的入边（纯断边，不改名）；来源不存在 → false", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("书.webxiaoheiwu.zip", "作品.txt"); ps.spawn("b.txt", ""); ps.addLink("作品.txt"); ps.jump("作品.txt");
    eq(ps.backlinksOf("作品.txt").join(), "b.txt");
    assert(ps.cutIncoming("b.txt")); eq(ps.backlinksOf("作品.txt").length, 0); eq(ps.exists("作品.txt"), true); eq(ps.current(), "作品.txt");
    eq(ps.cutIncoming("nope.txt"), false); eq(ps.cutIncoming("b.txt"), false);
  });
});
