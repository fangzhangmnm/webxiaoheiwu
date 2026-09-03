# ADR-0003 冲突现形 = 库的二选一 sheet（败方自动 .backup），不再造 sibling 副本
> created 20260903 · by Claude Fable 5.1 · status: accepted

## 决定
`dirty ∧ 云端也动过` 时由 `@internal/store` 弹 gate sheet：打开时「先打开本地 / 云端覆盖本地」，推送时「本地覆盖云端 / 云端覆盖本地 / 取消」；被替换的一边自动进 `.backup`（不丢字节）。`takeCloud` 后编辑器整体重载。

## 背景
v1 user 拍板「不要 diff」→ 412 时把本地写成 `… (Quest 离线副本 时间).txt` sibling、原稿拉回云端版，两份并存手动合。库模型同样**不做 diff、不丢任何一边**，只是败方去 .backup 而不是并排新稿。

## 后果
- 抽屉里不再冒出「离线副本」稿；要找败方去备份箱（库 `listBackup`，v2 UI 暂未开这一页——按需加）。
- 「挂机一年的旧设备醒来」场景：idle 锁屏 → 解锁前 `pullIfClean`（clean 快进 / dirty 留给推送 412 → sheet），不可能静默盖掉远端。
