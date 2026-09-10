// 页名显示（src/project/naming.ts）。created 2026-09-10 by Claude Fable 5.1
import { describe, it, eq } from "./runner.mjs";
const { nodeDisplayName } = await import("../src/project/naming.ts");
describe("project/naming · 显示名去 .txt（无任何自动起名，2026-09-10 user 拍板）", () => {
  it("nodeDisplayName 只剥 .txt", () => { eq(nodeDisplayName("作品.txt"), "作品"); eq(nodeDisplayName("图.jpg"), "图.jpg"); eq(nodeDisplayName("a.TXT"), "a"); });
});
