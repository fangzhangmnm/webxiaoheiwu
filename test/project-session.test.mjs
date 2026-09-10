import { describe, it, eq, assert } from "./runner.mjs";
import { ensureZipLoaded } from "./zip-node.mjs";
ensureZipLoaded();
const { createProjectSession } = await import("../src/project/session.ts");
const { unpackProject } = await import("../src/project/format.ts");

function fakeStore() {
  const files = new Map(); const writes = [];
  return { files, writes, deps: { read: async (n) => files.get(n) ?? null, write: async (n, blob, o) => { files.set(n, blob); writes.push({ n, push: o.push }); return { pushed: o.push }; }, now: (() => { let t = 0; return () => ++t; })() } };
}

describe("project/session · 新建 / 跳转不标脏 / 正文改了才脏 / 整包落盘往返", () => {
  it("create → 一个空节点为当前；flush 写整包；再 open 回来一样", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("夏音.webxiaoheiwu.zip", "20260910-a1b2.txt");
    eq(ps.current(), "20260910-a1b2.txt"); assert(ps.dirty);
    ps.setCurrentText("第一段");
    const r = await ps.flush(true); eq(r.wrote, true); eq(r.pushed, true); assert(!ps.dirty);
    const ps2 = createProjectSession(s.deps); const o = await ps2.open("夏音.webxiaoheiwu.zip");
    eq(o.kind, "ok"); eq(ps2.current(), "20260910-a1b2.txt"); eq(ps2.currentText(), "第一段");
  });
  it("jump 到已有节点不标脏；jump 到占位符生文件并标脏；正文没变 setCurrentText 不脏", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("p.webxiaoheiwu.zip", "a.txt"); ps.setCurrentText("A"); await ps.flush(false);
    ps.spawn("b.txt", "B"); await ps.flush(false); assert(!ps.dirty);
    eq(ps.jump("a.txt"), "a.txt"); assert(!ps.dirty, "跳转不标脏");
    eq(ps.setCurrentText("A"), false); assert(!ps.dirty);
    eq(ps.jump("祭祀线.txt"), "祭祀线.txt"); assert(ps.dirty, "占位符跳上去生文件");
    eq(ps.currentText(), "");
  });
  it("spawn：新节点带选中文字、边从当前节点指向它在末尾、光标跳过去；撞名 = 链接已有", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("p.webxiaoheiwu.zip", "场景.txt"); ps.setCurrentText("她推开门。他在窗边。");
    eq(ps.spawn("夏音.txt", "她推开门。"), "夏音.txt"); eq(ps.current(), "夏音.txt"); eq(ps.currentText(), "她推开门。");
    ps.jump("场景.txt"); ps.spawn("路人.txt", "他在窗边。"); ps.jump("场景.txt");
    eq(ps.sidebar().map((n) => n.name).join("|"), "夏音.txt|路人.txt", "最新在末尾");
    ps.spawn("夏音.TXT", "again"); eq(ps.current(), "夏音.txt"); eq(ps.currentText(), "她推开门。", "撞名不覆盖正文");
  });
  it("addLink / removeLink / rename 重写引用 / remove 留占位符 / find / backlinksOf", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("p.webxiaoheiwu.zip", "大纲.txt"); ps.addLink("第一章.txt"); ps.addLink("第二章.txt");
    eq(ps.sidebar().map((n) => `${n.name}:${n.stub}`).join("|"), "第一章.txt:true|第二章.txt:true");
    ps.jump("第一章.txt"); ps.setCurrentText("山田妖精"); ps.jump("大纲.txt");
    ps.rename("第一章.txt", "第一章-初稿.txt");
    eq(ps.sidebar().map((n) => n.name).join("|"), "第一章-初稿.txt|第二章.txt");
    eq(ps.backlinksOf("第一章-初稿.txt").join(), "大纲.txt");
    eq(ps.find("妖精").join(), "第一章-初稿.txt");
    assert(ps.removeLink("第二章.txt")); eq(ps.sidebar().length, 1);
    ps.remove("第一章-初稿.txt"); eq(ps.sidebar()[0].stub, true);
  });
  it("flush(push, {force}) 不脏也写（推云节律：本地落盘清了 dirty 之后 15s 推云还得交字节）；adoptName 只换身份", async () => {
    const s = fakeStore(); const ps = createProjectSession(s.deps);
    ps.create("p.webxiaoheiwu.zip", "a.txt"); ps.setCurrentText("A"); await ps.flush(false); assert(!ps.dirty);
    eq((await ps.flush(true)).wrote, false, "不脏默认不写");
    const r = await ps.flush(true, { force: true }); eq(r.wrote, true); eq(r.pushed, true); eq(s.writes.at(-1).push, true);
    ps.adoptName("q.webxiaoheiwu.zip"); eq(ps.name, "q.webxiaoheiwu.zip"); assert(!ps.dirty, "改身份不标脏");
    ps.setCurrentText("A2"); await ps.flush(false); eq(s.writes.at(-1).n, "q.webxiaoheiwu.zip", "之后写新名");
  });
  it("too-new → 只读：不许改、flush 不写", async () => {
    const s = fakeStore();
    const { zipPack } = await import("../src/zip.ts");
    s.files.set("new.webxiaoheiwu.zip", await zipPack([{ path: "graph.json", data: JSON.stringify({ format: "webxiaoheiwu", version: 99, wroteWith: "x", nodes: {} }) }]));
    const ps = createProjectSession(s.deps); const o = await ps.open("new.webxiaoheiwu.zip");
    eq(o.kind, "too-new"); assert(ps.readOnly);
    let threw = false; try { ps.spawn("x.txt", ""); } catch { threw = true; } assert(threw);
    eq((await ps.flush(true)).wrote, false);
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
