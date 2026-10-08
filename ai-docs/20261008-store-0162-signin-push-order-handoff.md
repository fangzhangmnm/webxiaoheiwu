# 收 store 0.16.2 + 登录后「无条件重推」改成「快进在前、只推 pending」——交接

> created 20261008 by Claude Fable 5.1 · as-of WXHW main `ab62e23`（dev v2.3.3x）/ @internal/store **0.16.2**（库仓 `20260813 internal-store` 20f828a，tag v0.16.2）
> user 2026-10-08「wxhw 写 handoff」。起因是 MoonSinger 的「写着写着过一会就跳一次云端冲突面」案，查到库的一个缺口；WXHW 没撞上，是因为它登录后把开着的稿**无条件**重推了一遍把窗口盖住了——那一下本身不是拍过的设计，而且有两个毛病。本文 = 库修了什么、WXHW 现状、该怎么改、怎么验。

## 1. 库修了什么（0.16.1 → 0.16.2，user「修」）

`freshness.refresh()`（= `file.pullIfClean()`，登录后 / 回前台 / 回线的「干净快进」）in-sync 分支以前直接 `return { status: "in-sync" }`，不 `head.markSeen`；`open()` 的同一分支是 markSeen 的。后果：

- 谱系是 per-tab 的：`_base`（本 tab 见过的云端 tip）只在内存，reload 后空；本 tab 第一次编辑 `recordEdit` 捕 `_parent = _base ?? null`——只看内存（这是对的，W2 红线：别的 tab 推过的 etag 不能当我的 parent）。
- 宿主 boot 顺序 = 建 store → 本地恢复（开文档）→ initAuth（CatsUp 2026-09-22 立的顺序，WXHW / MoonSinger 都是：`app.ts` 里 `void auth.initAuth()` 起了就往下开上次的稿，开稿那一刻还没登录）→ open 的 gate 因云端不可达跳过、不重捕。登录后走 refresh → 以前不重捕 → `_base` 永远空 → 第一次编辑 parent=null → 推不带 If-Match → `conflictBehavior:"fail"` → 云端有同名 → 409 → `CloudNameCollisionError` → `surfaceCollision` 冲突面。**每次 reload 一次**，人选「本地覆盖云端」（weakOverride → markSynced）之后才好。
- 修 = refresh 的 in-sync 分支加 `head.markSeen(name, meta.etag)`。安全性同 open 那一行：云端 === 本 tab 已见 base（没动）才调，且进这个分支之前 `isDirtyAnywhere` 已经挡过——只给干净 tab 重捕，不在云端动过时前推 parent。回归测试 `internal-store/test/freshness.test.ts`「refresh in-sync 重捕 _base（0.16.2）」；MoonSinger 的两设备 E2E（`20261006 MoonSinger/test/e2e/sync.mjs`）收货后 38/38。

## 2. WXHW 现状（代码事实，2026-10-08 读的 `src/app.ts` / `src/editor.ts`）

- `afterSignIn()`（app.ts ~2097）：`reconcileCollections` → `pullUserDict` → **`pushNowAny()`** → `drainOfflineQueue().then(pushDirtyAll)` → 冷启动一次性尊重远端 lastActive → `refreshIfCleanAny()` → `drawer.subscribe()`。
- `pushNowAny = project.active() ? project.pushNow() : editor.pushNow()`；`editor.pushNow()`（editor.ts ~179）→ `persist(true)` → 对已有稿 **`saveDoc(name, text, { push })` 无条件**（没有「text === savedText 且没 pending 就不推」的门）。书模式 `project.pushNow()` 对应核一下（我没读 mode.ts）。
- 所以每次登录 / 回前台（`resumeSync`）/ 解锁都整篇再推一次。推成功 `onPushed` 顺带把 `_base` 设上——这就是 WXHW 没撞上 §1 窗口的原因（副作用盖住了缺口）。
- **出处**：v2.1.10 `5ba0779`（2026-09-26，Claude Fable 5.1），修 user iPad 真机「我创建了新书，加密，链接云之后书一直卡在上传上面。另外一本旧书也卡在下载上面」。commit 正文写的目的是「登录那一下先把开着的推上去（以前登录后没人推，登出态写的书一直『未同步』）」——要解决的是**登出态落盘的 pending 没人推**；「不脏也推」没有单独拍过，是实现细节。CLAUDE.md 那条（2026-09-26 补三处推）也只记了「登录后 / 回前台 / 解锁后 pushAll」。

### 2.1 是不是数据安全问题（user 问「是不是有严重数据安全问题？」）

**不是静默覆盖那种。** 无条件推走的 If-Match = durable etag（`seenBase` 回退），别的设备动过 → 412 → `tryHeal` 比字节（不等）→ 冲突面；选了「本地覆盖云端」输家进 `.backup`（never-lose）。库的三道（If-Match / 冲突必 surface / 备份箱）都在。

**但有两个毛病**：

1. **顺序反了**：`pushNowAny` 在 `refreshIfCleanAny` **前面**。别的设备改过这篇、这台**没动过**（干净）→ 本该静默快进，现在先推 → 412 → 弹一个本不该弹的冲突面，而且面上「本地覆盖云端」会把别人的新版退进备份箱、云端回到这台的旧版。不丢字节，但是人被引导着做错事（和家规「不许煤气灯」一个方向）。
2. **白推**：每次登录 / 回前台整篇再上传一次（云端 mtime 也跟着走），加密稿还要解壳再封。

## 3. 该怎么改（提案；归 WXHW session 做，MoonSinger session 不碰这仓）

1. **先收 0.16.2**（没收之前别去掉无条件推——那是现在唯一盖着 §1 窗口的东西）：仓根 `bash "../20260813 internal-store/scripts/pull-package.sh" 0.16.2` → commit `package.json package-lock.json vendor-pkgs/internal-store-0.16.2.tgz`（旧 tgz 删）→ `npm test` / build / boot smoke。
2. **`afterSignIn` 顺序**：`refreshIfCleanAny()`（干净快进）→ 再推。具体：`reconcileCollections → pullUserDict → refreshIfCleanAny → pushNowAny（只在 pending 时）→ drainOfflineQueue.then(pushDirtyAll) → lastActive`。`resumeSync` 同理核一遍。
3. **`editor.pushNow` / `persist(true)` 加门**：已有稿且 `text === savedText && !pushPending` → 不推（`return`，状态照旧）。登出态落盘那条路不受影响：signed-out 的 `persist` 走 `else { pushPending = true; }`，登录后 pending 为真照推。书模式 `project.pushNow` 同样的门。
4. **黑匣子**：`[sync] push <name>: pushed | not pushed <reason> → <resolution>` 和冲突面 `[sync] conflict occasion=… → <choice>`（MoonSinger `src/store-ui.ts` / `main.ts` adapter 那两处可抄）——诊断日志里能直接看到每次推和每次面。
5. **E2E（强烈建议抄 MoonSinger 的）**：`test/e2e/cloud-bridge.mjs`（通用：`@internal/store/testing` 的 mock 云住 node 侧，经 `context.exposeFunction` 桥进页面，跨 reload、多 context = 多设备）+ `test/e2e/sync.mjs`（场景：单机连推零冲突 / **reload 后再推零冲突** / 推到一半页面死掉回来自愈 / 两机交替干净快进 / 真分叉两条路 + 备份箱 / 离线改再 reload / 三路同时推）。app 侧要两样：`src/app-store.ts` 的 `attachStore` 只在本机地址（`127.0.0.1` / `localhost`）认页面全局 `__xxxCloud` 注入的 provider；登录态 = 页面全局 `__xxxCloudSignedIn`（reload 后回到未登录，和真机 initAuth 之前一样），`isSignedIn()` 收成一个出口。
6. 改完 CLAUDE.md 那条 2026-09-26 的记录追一句（谁改的、为什么），本文 as-of 戳更新。

## 4. 验收

- 真机 iPad / 手机：reload → 写几个字 → 等空闲推 → **不弹**冲突面；别的设备改过、这台干净回前台 → 静默快进 + toast「已加载云端最新」，**不弹**；两边都改 → 弹、选哪边都不丢字节（备份箱里有输家）。
- 黑匣子里每次登录只有 pending 的那一推，没有「每次登录都 pushed」的整篇重推。
- E2E 全绿；库 < 0.16.2 时 MoonSinger 那份脚本会把 reload-推那几条打成「已知库缺口」——WXHW 收了 0.16.2 就是硬检查。

## 5. 相关

- MoonSinger 查案全文：`20261006 MoonSinger/ai-docs/20261008-handoff-to-opus.md` §5；MoonSinger CLAUDE.md「歌库」节 2026-10-08 两条。
- 库 commit 正文（20f828a）列了全家族消费方：WXHW / WeebPaint / JRB / CatsUp 各自节奏收货；WeebPaint / CatsUp 的 boot 同样「本地恢复先于 initAuth」，理论上同一个窗口（它们登录后有没有别的副作用盖着没查）。
- 库侧还有一条更深的缺口没动：推到一半页面死掉 + 回来之前又编辑了 → 本地字节 ≠ 云端（自己上次推的）→ `tryHeal` 不等 → 当真分叉弹面。根治 = 推路径记住在途字节的哈希。等 user 要不要。
