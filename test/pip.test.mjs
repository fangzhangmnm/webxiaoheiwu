// 小窗高度收成整行（src/pip.ts fitToRows）。created 2026-10-24 by Claude Opus 5.5
import { describe, it, eq } from "./runner.mjs";
import { fitToRows } from "../src/pip.ts";

describe("pip · 小窗高度收成整行", () => {
  it("正好整行：不动", () => { eq(fitToRows(4 * 39 + 16, 39, 16), 0); });
  it("半像素以内算对上", () => { eq(fitToRows(4 * 39 + 16.4, 39, 16), 0); });
  it("拖矮了一点：补到四行", () => { eq(fitToRows(4 * 39 + 16 - 10, 39, 16), 10); });
  it("拖高了一点：收回四行", () => { eq(fitToRows(4 * 39 + 16 + 12, 39, 16), -12); });
  it("过半就进到下一行", () => { eq(fitToRows(4 * 39 + 16 + 25, 39, 16), 14); });
  it("太矮：至少两行", () => { eq(fitToRows(30, 39, 16), 2 * 39 + 16 - 30); });
  it("行高还没量（0）：不动", () => { eq(fitToRows(200, 0, 16), 0); });
});
