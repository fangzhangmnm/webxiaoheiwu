import { describe, it, eq, assert } from "./runner.mjs";
import { emptyProject } from "../src/project/format.ts";
import { createNode, setNodeText, link, unlink, backlinks, renameNode, deleteNode, search, neighbors, isStub, resolveName } from "../src/project/graph.ts";
const tick = () => { let t = 0; return () => ++t; };

describe("project/graph · 撞名=链接、占位符、反链=查询", () => {
  it("createNode 撞名（大小写/NFC 不敏感）→ 返回已有名不新建；占位符 = 无文件的名字", () => {
    const p = emptyProject(); const now = tick();
    eq(createNode(p, "夏音.txt", "x", now).created, true);
    const r = createNode(p, "夏音.TXT", "y", now); eq(r.created, false); eq(r.name, "夏音.txt");
    eq(p.contents.size, 1); assert(isStub(p, "祭祀线.txt")); eq(resolveName(p, "夏音.TXT"), "夏音.txt");
  });
  it("link 默认末尾（user 2026-09-10「节点应该加在末尾」）、不重复；unlink；neighbors 带 stub 旗；backlinks 是查询", () => {
    const p = emptyProject(); const now = tick();
    createNode(p, "a.txt", "", now); createNode(p, "b.txt", "", now);
    link(p, "a.txt", "b.txt", { now }); link(p, "a.txt", "c.txt", { now }); eq(link(p, "a.txt", "B.txt", { now }), false);
    eq(neighbors(p, "a.txt").map((n) => `${n.name}:${n.stub}`).join("|"), "b.txt:false|c.txt:true");
    link(p, "a.txt", "z.txt", { at: "top", now }); eq(neighbors(p, "a.txt")[0].name, "z.txt", "显式 top 仍可");  unlink(p, "a.txt", "z.txt", now);
    eq(backlinks(p, "b.txt").join(), "a.txt"); eq(backlinks(p, "a.txt").length, 0);
    assert(unlink(p, "a.txt", "c.txt", now)); eq(neighbors(p, "a.txt").length, 1);
  });
  it("renameNode 改 entry + 重写所有引用 + editor-state.last；目标撞名抛；改大小写允许", () => {
    const p = emptyProject(); const now = tick();
    createNode(p, "夏音.txt", "", now); createNode(p, "场景1.txt", "", now); createNode(p, "场景2.txt", "", now);
    link(p, "场景1.txt", "夏音.txt", { now }); link(p, "场景2.txt", "夏音.txt", { now }); p.editorState.last = "夏音.txt";
    renameNode(p, "夏音.txt", "夏音-设定.txt", now);
    assert(p.contents.has("夏音-设定.txt") && !p.contents.has("夏音.txt"));
    eq(p.nodes.get("场景1.txt").links.join(), "夏音-设定.txt"); eq(p.nodes.get("场景2.txt").links.join(), "夏音-设定.txt");
    eq(p.editorState.last, "夏音-设定.txt");
    let threw = false; try { renameNode(p, "场景1.txt", "场景2.txt", now); } catch { threw = true; } assert(threw, "目标已存在");
    renameNode(p, "场景1.txt", "场景1.TXT", now); assert(p.contents.has("场景1.TXT"));
  });
  it("deleteNode：正文没了，别人指向它的边留着变占位符", () => {
    const p = emptyProject(); const now = tick();
    createNode(p, "a.txt", "", now); createNode(p, "b.txt", "", now); link(p, "a.txt", "b.txt", { now });
    assert(deleteNode(p, "b.txt")); eq(neighbors(p, "a.txt")[0].stub, true);
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
