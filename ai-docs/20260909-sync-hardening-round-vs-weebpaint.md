# 2026-09-09 云同步加固轮：与 WeebPaint 对账 → 落地 v0.2.19–v0.2.21

> 作者：Claude Fable 5.1（claude-fable-5-1）· created 20260909 · as-of dev v0.2.21 / store 0.12.1 · user 原话：「修完这个开始修 wxhw，多和 weebpaint 对对账，有需要可以抽 gallery 公共库」「weebpaint 已经有 paradigm 了」。
> 起因：user 2026-09-09「wxhw 的情况也很差，云同步很难用…还是各种不刷新，改名也很难受」。WeebPaint 同日案卷 = `../20260524 WeebPaint/ai-docs/20260909-bfcache-idb-lock-daily-reauth-analysis.md`（每日掉凭证 → 重连 redirect → bfcache 冻页持 IDB 锁）。

## 1. 对账差距清单（只读审计 agent 产出，逐条核过 file:line）→ 落地

| # | WeebPaint 机制 | WXHW 原状 | 落地 |
|---|---|---|---|
| 1 | 黑匣子 diag-log（环 500、device-kv、生命周期面包屑、复制/分享 .txt） | 80 条内存环，reload 即丢，无面包屑，无复制 | **v0.2.20** `src/diag-log.ts` + `diag-log-ui.ts`；reportError 全级别喂入；auth / list / sw / page / net 面包屑 |
| 2 | 列表首帧看门狗 + 卡住态重试 | 首帧不来 = 永远「加载中…」；帧错误只 console | **v0.2.21** `src/first-frame-watchdog.ts`（原样搬）+ 抽屉卡住态「读取超时 + 重试」 |
| 3 | auth 翻牌每次都做同步；登出态回线 silent 重试；expired ≠ signOut | `afterSignIn` 一次性守卫 → 凭证过期后再登录**什么都不做**；登出态永不 silent 重试 | **v0.2.21**：守卫只留「冷启动切远端 lastActive」；回线/回前台 `retrySilentSignIn`；expired 状态栏明说 |
| 4 | redirect 登录两步手势（先落盘、onPick 同步起跳、落盘失败不跳） | flush 失败也跳；await 后起跳 | **v0.2.21** `onSignIn` 两步 + `sheets.Choice.onPick` |
| 5 | SW 更新提示 / reload 等 auth boot 落地（8s 封顶） | 立即弹 toast | **v0.2.21** `src/settle-hold.ts`（原样搬）+ `authBootP` |
| 6 | 改名：列表内改名、失败重试保留输入、安静路径有提示 | 只能先打开再从顶栏改；失败丢输入；安静路径零 UI | **v0.2.21** 抽屉行「改名…」、三轮重试、store-ui 安静路径写状态栏 |
| 7 | store-ui 形状 | 基本同形（QUIET_KEYS / 冲突 sheet / offlineEscape / onReplayStatus） | 无需动；「Not signed in」降 log 现在也进黑匣子 |
| 8 | 回线/复查重拉列表 | `drawer.refresh()` 只重画缓存帧 | **v0.2.21** resumeSync → `drawer.subscribe()` |
| 9 | createStore 表态 | 无违规（validateAdopt 在明文上验，比 WeebPaint 更好） | 无需动 |
| A/C | SW 导航 no-store；pagehide 写门控 | 无 | **v0.2.19**（同 WeebPaint v0.14.4） |

store 侧（两家共用）：0.12.0 `rekey`（换密码不经明文，v0.2.18 已接）、0.12.1 pagehide 闸门 + token 单飞。

## 2. 「各种不刷新」「改名难受」的代码级解释（推断，未真机复现）

- 每日 RT 过期 → `signedIn=false`（reason=expired）→ 用户重连 → 再次 `onAuthChanged(signedIn=true)` → 旧 `afterSignIn` 一次性守卫直接返回：collections 不对齐、离线队列不排空、当前稿不快进；`drawer.subscribe()` 虽跑但 `resumeSync/refresh` 只重画。→ 「不刷新」。
- 首帧不来（IDB 挂死，与 WeebPaint 09-08 案同根）→ 永远「加载中…」且无证据。
- 改名：必须先打开；一次失败即丢输入；安静路径零反馈；**改名会丢日期前缀**（`docs.ts renameDoc` → `makeDocName` 出 `标题.txt`），名字降序排序下改完名的稿**跳位**，用户感受 = 「改完消失了」。

## 3. 真机验收（Quest / iPad）

1. 过 24h 后打开：状态栏「云端登录已过期…」；点云图标 → 「已保存到本机，去登录？」→ 去登录 → 回来后列表重拉、当前稿快进；黑匣子里 `[auth] changed … reason=expired` → `signIn`。
2. 黑匣子：设置页「诊断日志」→ 看 / 复制 / 分享或下载 .txt。
3. 抽屉行「改名…」；改名失败时输入不丢。
4. 首帧超时时列表显示「读取超时 + 重试」而不是永远加载中。

## 4. 拍板结果（user 2026-09-09，同日）

- **改名丢日期前缀 → 排序跳位：「是 feature 不是 bug」**。不动。已钉进 `src/docs.ts renameDoc` 注释——以后别有 agent 再来「修」。
- **抽 gallery / 平台公共库：择日集体轮**——「找个良辰吉日叫上 jrp jrb realhome, catsup 一起」，且「不是可以不给反馈光挂机的任务」（需要 user 在场逐步给反馈）。本轮不抽；两仓的逐字相同拷贝（diag-log / settle-hold / first-frame-watchdog）原地保留。

### 4.1 原议题（存档）

- **改名丢日期前缀 → 排序跳位**：这是 ADR-0007 命名模型（文件名 = 管理句柄；加密稿出生名 = 日期码）的产品层问题。选项：(a) 改名保留原日期前缀；(b) 列表按 lastModified 排而非名字；(c) 保持现状。
- **抽 gallery 公共库**：本轮三件在两仓已是**逐字相同**的拷贝（`diag-log.ts` 除版本常量、`settle-hold.ts`、`first-frame-watchdog.ts`），外加 store-ui 的 busy 路由与 redirect 两步手势形状相同。要抽的话我先按 API ritual 出现状 .h + 提案 .h。家族既有政策「PWA 平台层 WET 复制非库」（memory：pwa-shell/sw-kit parked），所以默认不抽，等你一句话。

## 5. 没做 / 没验

- 真机全部未验。深活里没碰：抽屉 `_encCache` 加密探针路径的性能、改名日期前缀（§4）。
