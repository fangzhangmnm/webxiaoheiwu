# Filename and sort conventions
> ⚠ 2026-09-03（edited by Claude Fable 5.1）：多文件夹落地——身份可带一层夹前缀 `夹/YYYYMMDD 标题.txt`（ADR-0006）；本文的文件名规则对 basename 仍全部有效。

> ⚠ as-of v0.0.82 / 2026-09-03（v2 换代，edited by Claude Fable 5.1）：全部有效，实现 = `src/doc-model.ts`（解析/生成/排序）+ `src/docs.ts`（碰撞后缀 `createDoc`/`renameDoc`）；`.trash/` 由库管（两端聚合回收站）。


The naming scheme went through three iterations before landing.

## Final format: `YYYYMMDD title.txt`

Examples:
- `20260517 第一章 开局.txt`
- `20260518 大纲.txt`
- `20260519.txt` (untitled — bare date is legal)

Parsing rule, simplified to two cases:
1. **Bare date**: `^\d{8}\.txt$` → date only, no title.
2. **Date + title**: `^\d{8} (.+)\.txt$` → everything after the first space (and before `.txt`) is the title. Trailing digits, embedded numbers, extra spaces — all part of the title.

The earlier "smart" parser tried to extract `YYYYMMDD N title` (with an explicit sequence number) and the user vetoed it: "title 1 IS the title, not a sequence number." Don't infer structure that isn't reliably present.

## Suffix only on actual collision

The user reverted me twice on this. Final rule:
- New file: try the bare name first. No suffix.
- On 409: try `name 1`, `name 2`, ... until one sticks.
- The suffix is **not** part of the title. It's a collision artifact.

Earlier attempts (always-suffix, or "first file gets `1`") were rejected because they make every filename ugly even when there's no actual collision. Optimize for the common case (no collision).

## Sort: natural-sort descending

```js
new Intl.Collator("zh-CN", { numeric: true }).compare(a, b) * -1
```

Why descending: writing apps want today's work at top.

Why natural-sort (`numeric: true`): so `20260517` sorts after `20260509` and `第10章` sorts after `第9章`, not before. This is "VS Code-style" sort, which the user explicitly asked for.

Why `zh-CN`: collator for Chinese characters. Without locale, English alphabetical wins and Chinese files appear in random Unicode order.

## Don't trust remote filenames

Quoting the user: "never trust users." Remote `.txt` files may have:
- Weird spacing (`20260517  title.txt` with two spaces).
- Manual edits to the date prefix that break the format.
- Non-ASCII junk.
- Files renamed by hand to add/remove the suffix.

The parser should:
- Not throw on anything.
- Return `{date: null, title: filename}` for non-matching files (treat the whole filename as the title).
- Never make sync decisions based on filename structure beyond detecting the date prefix.

## File metadata, not filename, for state

`deletedAt`, `dirty`, `etag`, `onedriveItemId` — all in the IDB row, never encoded in the filename. The user explicitly rejected a "trash by prefix" scheme in favor of a real `.trash/` subfolder. Don't try to be clever with filename-as-metadata.

## `.trash/` subfolder, in-app only

Trashed files move to `.trash/` (a real OneDrive folder). The desktop file picker can't see it by default (hidden-by-dot convention isn't universal on OneDrive, but the user said "看不到 hidden things by default is acceptable"). In-app trash UI shows the contents; restore moves the file back to the root.

Purge = `DELETE`. No retention window, no second confirmation beyond the initial `confirm()`.
