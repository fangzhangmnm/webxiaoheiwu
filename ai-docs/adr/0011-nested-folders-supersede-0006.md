# ADR-0011 文件夹永远嵌套（supersedes ADR-0006）；排序 natural 降序；改名自由文本
> created 20260909 · by Claude Fable 5.1 (claude-fable-5-1) · status: accepted（user 2026-09-09）

## 决定
1. **永远支持文件夹嵌套**——user：「这就是属于我们的 windows explorer」。ADR-0006「一层文件夹」自 2.0 起作废。行为对齐 WeebPaint：一次订阅一层、移动只给「上级 + 可见子夹」。
2. **排序 = natural 降序**（100 排在 99 前面）。以后加不同排序方式和查询，现在只有降序。
3. **改名 = 自由文本**。日期前缀只是**新建时的默认建议**（WeebPaint 同款 `naming.ts` `yyyymmdd-hex4`，空输入落日期名，禁「未命名」）。user：「那个本来就是我自己的 ritual。别人自己玩，我就是在 default new 的时候 suggest 了一下 default 罢了」。09-09 早些时候钉在 `src/docs.ts renameDoc` 的「改名丢日期前缀是 feature」= **一次迁移的疤，不是政策**，不进任何对齐清单。
4. **语言 = 中 + 英**。日文要配输入法，单独一个小版本。

## 后果
- 图库行为以 WeebPaint 为 spec（家族根 `ai-docs/20260909-wxhw-2.0-long-haul-plan.md`），WXHW 抽屉、一层夹、`float` 徽章映射到 local-only 图标这些将就一并退役。
