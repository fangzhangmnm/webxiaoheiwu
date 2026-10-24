// 书 → markdown 树（src/export/markdown-tree.ts）。created 2026-10-23 by Claude Opus 5.5
import { describe, it, eq } from "./runner.mjs";
import { markdownTree, shiftBodyHeadings, escapeBodyHeadings } from "../src/export/markdown-tree.ts";

describe("export/markdown-tree · 正文自己的标题（每页单独、只加到够用）", () => {
  it("user 的例子：正文一开始是三级，页是 1 / 2 级 → 还是三级；页是 3 级 → 往下挪一级", () => {
    const body = "### 场景\n正文\n#### 细节";
    eq(shiftBodyHeadings(body, 1), body);
    eq(shiftBodyHeadings(body, 2), body);
    eq(shiftBodyHeadings(body, 3), "#### 场景\n正文\n##### 细节");
  });
  it("不够低 → 整页一起挪到「最高的一级 = 页名 + 1」，相对层次不变", () => {
    eq(shiftBodyHeadings("# 一\n## 二\n### 三", 2), "### 一\n#### 二\n##### 三");
    eq(shiftBodyHeadings("## 第零章 穿越\n……\n## 第一章 开学", 2), "### 第零章 穿越\n……\n### 第一章 开学");   // 樱川「试写第一章」的形状
  });
  it("超过 6 级按 6 级写；没有标题 = 原样", () => {
    eq(shiftBodyHeadings("# 一\n### 三", 5), "###### 一\n###### 三");
    eq(shiftBodyHeadings("只有正文\n第二行", 3), "只有正文\n第二行");
  });
  it("不是标题的不算也不动：#tag、七个 #、四个空格缩进、全角空格起头、围栏里的", () => {
    const body = "#tag\n####### seven\n    # code\n　# 全角\n```make\n# makefile 注释\n```\n~~~\n## 也在围栏里\n~~~\n### 真标题";
    eq(shiftBodyHeadings(body, 3), body.replace("### 真标题", "#### 真标题"));
    eq(shiftBodyHeadings("```\n# 围栏没关\n", 1), "```\n# 围栏没关\n");
  });
  it("行首至多 3 个空格的标题保留缩进；只有 # 的空标题也算", () => {
    eq(shiftBodyHeadings("   # 缩进\n#\n正文", 1), "   ## 缩进\n##\n正文");
  });
});

describe("export/markdown-tree · 整棵树", () => {
  it("页名按层级写成 # / ## / ###，空一行接正文；页头空行去掉、首行缩进留着；页之间空一行", () => {
    const out = markdownTree([
      { heading: "目录", text: "目录页。" },
      { heading: "第一章", level: 1, text: "\n\n　　第一章正文。\n\n" },
      { heading: "第一节", level: 2, text: "" },
    ]);
    eq(out, "# 目录\n\n目录页。\n\n## 第一章\n\n　　第一章正文。\n\n### 第一节\n");
  });
  it("每页单独算：同一棵树里一页要挪、一页不用", () => {
    const out = markdownTree([
      { heading: "燕音第1节", level: 1, text: "## 第一节\n正文" },   // 页 = ##，正文最高 ## → 挪成 ###
      { heading: "笔记", level: 1, text: "### 已经够低\n正文" },     // 页 = ##，正文最高 ### → 不动
    ]);
    eq(out, "## 燕音第1节\n\n### 第一节\n正文\n\n## 笔记\n\n### 已经够低\n正文\n");
  });
  it("页名层级超过 6 级按 6 级写；没有页名（txt 稿）= 只有正文、正文里的标题原样", () => {
    eq(markdownTree([{ heading: "深", level: 7, text: "正文" }]), "###### 深\n\n正文\n");
    eq(markdownTree([{ heading: null, text: "# 稿里的标题\n正文  \n" }]), "# 稿里的标题\n正文\n");
  });
});

describe("export/markdown-tree · 另选：转义 / 原样", () => {
  it("转义：正文标题前加 \\（缩进留着），围栏里的和不是标题的不动；页名照常是标题", () => {
    eq(escapeBodyHeadings("# 场景\n   ## 缩进\n#tag\n```\n# 注释\n```"), "\\# 场景\n   \\## 缩进\n#tag\n```\n# 注释\n```");
    eq(markdownTree([{ heading: "第一章", level: 1, text: "# 场景\n正文" }], "escape"), "## 第一章\n\n\\# 场景\n正文\n");
  });
  it("原样：正文一个字不改；缺省 = 加级", () => {
    eq(markdownTree([{ heading: "第一章", level: 1, text: "# 场景\n正文" }], "raw"), "## 第一章\n\n# 场景\n正文\n");
    eq(markdownTree([{ heading: "第一章", level: 1, text: "# 场景\n正文" }]), "## 第一章\n\n### 场景\n正文\n");
  });
});
