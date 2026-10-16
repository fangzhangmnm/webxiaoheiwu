// zh-punct：中文语境标点全角化（自 v1 模块头注释的案例钉子）。created 2026-09-03 by Claude Fable 5.1
import { describe, it, eq } from "./runner.mjs";
import { chineseifyPunctuation as z, countWesternPunctuation as cnt } from "../src/zh-punct.ts";

describe("zh-punct", () => {
  it("无 CJK 原样", () => { eq(z("Hello, world. 3.14"), "Hello, world. 3.14"); });
  it("紧邻 CJK 才换；小数点/英文逗号不动", () => { eq(z("你好,世界.再见 3.14 Hello, 你好"), "你好，世界。再见 3.14 Hello, 你好"); });
  it("括号配对一起换", () => { eq(z("试(1)"), "试（1）"); eq(z("test (1) ok"), "test (1) ok"); });
  it("引号交替开闭", () => { eq(z('他说"好"'), "他说“好”"); });
  // 2026-10-16 一键规整标点（user「一键把标点符号或者选中的标点符号全部正则化」）
  it("省略号：紧邻 CJK 的 ... / 。。。 / … 收成「……」；英文里的 ... 不动", () => {
    eq(z("你好..."), "你好……"); eq(z("等等。。。走吧"), "等等……走吧"); eq(z("一说…"), "一说……"); eq(z("想了想......"), "想了想……");
    eq(z("Wait... what"), "Wait... what");
  });
  it("破折号：紧邻 CJK 的 -- 收成「——」；a--b 不动", () => { eq(z("他--说"), "他——说"); eq(z("a--b"), "a--b"); eq(z("3-4 个"), "3-4 个"); });
  it("报数：换掉了几个西文标点", () => { eq(cnt("你好,世界...", z("你好,世界...")), 4); eq(cnt("Hello, world", z("Hello, world")), 0); });
});
