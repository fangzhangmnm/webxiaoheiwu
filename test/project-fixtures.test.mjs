// 冻结样本语料（家族格式版本纪律 §3：老样本永远能开、读→写→再读语义无损、本版拍的样本必须存在）。created 2026-10-21 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
import { ensureZipLoaded } from "./zip-node.mjs";
ensureZipLoaded();
import { listFixtures, readFixture } from "./fixtures/format/fixtures.mjs";
const { packProject, unpackProject } = await import("../src/project/format.ts");
const { FORMAT, fmt } = await import("../src/project/migrate/index.ts");
const td = new TextDecoder();
const pick = (p) => ({ pages: [...p.contents.keys()].sort(), text: Object.fromEntries([...p.contents.keys()].sort().map((n) => [n, td.decode(p.contents.get(n))])), tree: p.tree, editorState: p.editorState, graphExtra: p.graphExtra, editorStateExtra: p.editorStateExtra, pageExtra: Object.fromEntries([...p.nodes].filter(([, m]) => m.extra).map(([n, m]) => [n, m.extra])), hidden: [...p.nodes].filter(([, m]) => m.hidden).map(([n]) => n), cover: p.cover, readOnly: p.readOnly, thumb: p.thumbnail?.length ?? 0 });

describe("project/fixtures · 冻结样本（改 FORMAT 必须重跑 tools/freeze-format-sample.mjs）", () => {
  it(`本版拍的样本目录存在：graph-${fmt(FORMAT.graph)}+editor-${fmt(FORMAT.editorState)}`, () => {
    assert(listFixtures().includes(`graph-${fmt(FORMAT.graph)}+editor-${fmt(FORMAT.editorState)}`), "FORMAT 变了但没冻结新样本：node tools/freeze-format-sample.mjs");
  });
  for (const dir of listFixtures()) {
    it(`${dir}：能开、零 warning、读到的和冻结时一样；写回再读语义无损、写回的拍子是本版的`, async () => {
      const { blob, expect } = readFixture(dir);
      const r = await unpackProject(blob); eq(r.kind, "ok"); eq(r.warnings.length, 0);
      const p = r.project;
      eq(fmt(p.readStamps.graph), expect.stamps.graph); eq(fmt(p.readStamps.editorState), expect.stamps.editorState);
      eq(p.newerThanApp.join("|"), expect.newerThanApp.join("|"));
      eq(JSON.stringify(p.tree), JSON.stringify(expect.tree)); eq(JSON.stringify([...p.contents.keys()].sort()), JSON.stringify(expect.pages));
      eq(JSON.stringify(p.editorState), JSON.stringify(expect.editorState)); eq(JSON.stringify(p.graphExtra), JSON.stringify(expect.graphExtra)); eq(JSON.stringify(p.editorStateExtra), JSON.stringify(expect.editorStateExtra));
      eq(JSON.stringify(p.cover), JSON.stringify(expect.cover));
      const before = pick(p);
      const r2 = await unpackProject(await packProject(p)); eq(r2.kind, "ok"); eq(r2.warnings.length, 0);
      eq(JSON.stringify(pick(r2.project)), JSON.stringify(before), "读→写→再读 语义无损（含未知键）");
      eq(fmt(r2.project.readStamps.graph), fmt(FORMAT.graph)); eq(fmt(r2.project.readStamps.editorState), fmt(FORMAT.editorState)); eq(r2.project.newerThanApp.length, 0, "写回 = 本版拍");
    });
  }
});
