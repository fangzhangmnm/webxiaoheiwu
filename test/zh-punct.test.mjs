// zh-punct：中文语境标点全角化（自 v1 模块头注释的案例钉子）。created 2026-09-03 by Claude Fable 5.1
import { describe, it, eq } from "./runner.mjs";
import { chineseifyPunctuation as z } from "../src/zh-punct.ts";

describe("zh-punct", () => {
  it("无 CJK 原样", () => { eq(z("Hello, world. 3.14"), "Hello, world. 3.14"); });
  it("紧邻 CJK 才换；小数点/英文逗号不动", () => { eq(z("你好,世界.再见 3.14 Hello, 你好"), "你好，世界。再见 3.14 Hello, 你好"); });
  it("括号配对一起换", () => { eq(z("试(1)"), "试（1）"); eq(z("test (1) ok"), "test (1) ok"); });
  it("引号交替开闭", () => { eq(z('他说"好"'), "他说“好”"); });
});
