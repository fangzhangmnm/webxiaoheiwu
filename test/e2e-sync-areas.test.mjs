// 端到端同步测试的分区表守卫：分档靠这张表，漏登记 = 那一区静默漏跑。created 2026-11-10 by Claude Fable 5.2（规矩 = ai-docs/20261110-test-tiers.md）
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, it, assert, eq } from "./runner.mjs";
import { AREAS, SOURCES, areasForPath } from "./e2e-sync/areas.mjs";

describe("端到端同步测试 · 分区表", () => {
  // 场景名有的是拼出来的（循环里注册），所以问运行器自己，不扫源码。--list 不打包、不起浏览器。
  const list = execFileSync(process.execPath, ["test/e2e-sync/run.mjs", "--list"], { encoding: "utf8" });
  it("每个场景至少落进一区", () => {
    const orphan = list.slice(list.indexOf("没分区的") >>> 0).split("\n").slice(1).map((l) => l.trim()).filter(Boolean);
    assert(!list.includes("没分区的"), `没分区的场景：${orphan.join(" | ")} —— 在 test/e2e-sync/areas.mjs 的 AREAS 里给它一区`);
  });
  it("每一区至少有一个场景（区名写错 / 场景改名后正则落空）", () => {
    for (const k of Object.keys(AREAS)) {
      const m = list.match(new RegExp(`^@${k}  .*（(\\d+) 个）$`, "m"));
      assert(m && Number(m[1]) > 0, `@${k} 一个场景都没有`);
    }
  });
  it("源码表里写的区名都存在", () => {
    for (const s of SOURCES) if (s.areas !== "all") for (const a of s.areas) assert(a in AREAS, `SOURCES 里的 "${a}" 不是一个区（${s.why}）`);
  });
  it("几条要紧的路径落在该落的地方", () => {
    eq(areasForPath("src/app.ts").areas, "all");
    eq(areasForPath("src/i18n/strings.ts").areas, "all");
    eq(areasForPath("test/e2e-sync/run.mjs").areas, "all");
    assert(areasForPath("src/editor.ts").areas.includes("swap") && areasForPath("src/project/mode.ts").areas.includes("swap"), "换稿两头都跑 @swap");
    eq(areasForPath("src/cloud-gate.ts").areas.join(), "gate,wake");
    eq(areasForPath("ai-docs/x.md").areas.length, 0);
    eq(areasForPath("src/brand-new-file.ts").areas, "all");   // 没登记的源码 = 整套
    for (const f of ["src/editor.ts", "src/project/mode.ts", "src/docs.ts", "src/rescue.ts", "src/drawer.ts", "src/gallery-host.ts", "src/cloud-gate.ts", "src/cloud-return.ts", "src/crypto-state.ts", "src/encryption.ts", "src/ime.ts", "src/enc-dict.ts", "src/sheets.ts", "src/app-store.ts"]) assert(existsSync(f), `分区表守卫点名的文件不在了：${f}（改名了就把表和这里一起改）`);
  });
});
