// zh-punct：中文语境标点全角化（自 v1 模块头注释的案例钉子）。created 2026-09-03 by Claude Fable 5.1
import { describe, it, eq } from "./runner.mjs";
import { chineseifyPunctuation as z, tidyPunctuation as tidy, setQuoteStyle, quotesToStyle } from "../src/zh-punct.ts";

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
  it("报数：改了几处", () => { eq(tidy("你好,世界...").changes, 2); eq(tidy("Hello, world").changes, 0); eq(tidy("试(1)").changes, 2); });
  // user 2026-10-16「标点主要是引号的规范」：全文统一成设置里的那一种；英文撇号不动
  it("引号规范 · curly：「」『』 → “”‘’；撇号不动", () => {
    setQuoteStyle("curly");
    eq(z("他说「好」，又说『行』"), "他说“好”，又说‘行’"); eq(z('我说 don\'t 和 it’s 都行'), "我说 don't 和 it’s 都行"); eq(z('混用"引号"和「引号」'), "混用“引号”和“引号”");
  });
  it("引号规范 · corner：“”‘’ → 「」『』；撇号不动", () => {
    setQuoteStyle("corner");
    eq(z("他说“好”，又说‘行’"), "他说「好」，又说『行』"); eq(z('他说"好"'), "他说「好」"); eq(z("我说 it’s 行"), "我说 it’s 行");
    setQuoteStyle("curly");
  });
});

describe("zh-punct · 系统输入法上屏的引号跟设置走（quotesToStyle，v2.3.57）", () => {
  it("直角：弯引号换成「」『』；英文撇号（前一个字是字母）不动；直引号不动", () => {
    setQuoteStyle("corner");
    eq(quotesToStyle("他说“你好”"), "他说「你好」");
    eq(quotesToStyle("‘嗯’"), "『嗯』");
    eq(quotesToStyle("it’s"), "it’s"); eq(quotesToStyle("’s", "t"), "’s", "插入点前是字母");
    eq(quotesToStyle("’", "好"), "』", "插入点前是汉字 = 收尾引号");
    eq(quotesToStyle('"x\''), '"x\'');
    setQuoteStyle("curly");
  });
  it("弯引号：系统输入法出的「」『』换回 “”‘’；本来就是弯的不动", () => {
    setQuoteStyle("curly");
    eq(quotesToStyle("「你好」『嗯』"), "“你好”‘嗯’");
    eq(quotesToStyle("“你好”"), "“你好”");
  });
});
