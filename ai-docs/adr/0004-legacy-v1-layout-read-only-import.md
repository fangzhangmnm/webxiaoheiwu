# ADR-0004 v1 云端布局只读、一次性导入，永不改写/删除
> created 20260903 · by Claude Fable 5.1 · status: **superseded 2026-09-03**（user：「导入旧加密的 ui 也不对，要不放弃算了。不做 backward compatibility」→ `src/legacy-import.ts` 与设置页「旧版数据」段整体删除，v0.1.3）。仍然成立的半句：**v1 文件原地不动、永不改写/删除**——只是不再读。v1 加密稿要看的话，自己跑 git 历史里的 v81 页面解。

## 决定
`src/legacy-import.ts` 经 store 的 provider 只读面读 v1 路径：`voice.json` / `.userdata/rime-user-dir.json`（登录后静默搬进 collection，marker 幂等）、`.enc/*.bin` + `.crypto/`（设置页「导入旧加密稿」：旧密码验 verifier → 逐份 AES-GCM 解密 → 以新统一密码建 v2 加密稿）。**旧文件原地不动**；用户想清理去 OneDrive 自己删。

## 背景
JRP 2026-08-14 迁移先例（旧 `/catalog.json` 只读种子）；家族「不要碰用户 OneDrive 做『显然安全』的清理」（v1 working-with-this-user）。只有 user 一人在用，导入失败可重试，无并发风险。

## 后果
- 明文稿 / `.trash/` 零动作（身份相同）。
- `.userdata/last-active.json` 不导入（指针类，重选一次就好）。
- v1 本地 IDB `WebXiaoHeiWu` 不读不删（几 MB 孤儿；若要清，走浏览器「清除站点数据」）。
