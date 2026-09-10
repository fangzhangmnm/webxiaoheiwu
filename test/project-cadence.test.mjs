// 书的落盘节律（ADR-0015 b）：防抖随上次落盘耗时放缓。created 2026-09-10 by Claude Fable 5.1
import { describe, it, eq } from "./runner.mjs";
import { bookLocalDebounceMs } from "../src/project/cadence.ts";
import { LOCAL_SAVE_DEBOUNCE_MS, BOOK_LOCAL_SAVE_DEBOUNCE_MAX_MS, PUSH_DEBOUNCE_MS, PUSH_HEARTBEAT_MS } from "../src/config.ts";

describe("project/cadence · 本地防抖随体重放缓（书专用；txt 常量不动）", () => {
  it("没量过 / 很快 → 基线 200；线性放大；封顶 3 s；txt 节律常量原值", () => {
    eq(bookLocalDebounceMs(0), 200); eq(bookLocalDebounceMs(NaN), 200); eq(bookLocalDebounceMs(-5), 200);
    eq(bookLocalDebounceMs(20), 200, "20 ms × 5 = 100 < 基线 → 200");
    eq(bookLocalDebounceMs(100), 500); eq(bookLocalDebounceMs(300), 1500);
    eq(bookLocalDebounceMs(600), 3000); eq(bookLocalDebounceMs(5000), 3000, "封顶");
    eq(LOCAL_SAVE_DEBOUNCE_MS, 200); eq(BOOK_LOCAL_SAVE_DEBOUNCE_MAX_MS, 3000); eq(PUSH_DEBOUNCE_MS, 15_000); eq(PUSH_HEARTBEAT_MS, 30_000);
  });
});
