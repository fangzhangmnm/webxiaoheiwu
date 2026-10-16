# 收 store 0.16.2 + 登录后「无条件重推」改成「快进在前、只推 pending」——交接

> created 20261008 by Claude Fable 5.1 · as-of WXHW main `ab62e23`（dev v2.3.3x）/ @internal/store **0.16.2**（库仓 `20260813 internal-store` 20f828a，tag v0.16.2）
> **2026-10-16 落地**（v2.3.35，Claude Fable 5.1）：§3 的 1–5 全做了，见 §6；as-of WXHW dev v2.3.35。
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

## 6. 落地（2026-10-16，v2.3.35，Claude Fable 5.1）

起因 user 2026-10-16：「wxhw 挂机之后还是有要你本地覆盖云端的 bug，这之间我没有动其他的东西」「非加密的也有这个问题」。

- **复现**（`test/e2e-sync/run.mjs`「txt · 挂机：别的设备改过、这台干净」）：B 开着一篇干净的稿锁屏（`__xhw.idle.show()`），A 改了这篇推上云；旧码 B 锁屏那一下 `onIdle → pushNowAny` 不看脏整篇重推 → If-Match 旧 base → 412 → `tryHeal` 比字节不等（A 的新字）→ 冲突面「本地覆盖云端」在锁屏时就弹出来；醒来 `resumeSync` 又先推再快进，面继续挡着。单设备「没动别的东西」也会撞：挂机期间在别的设备写了同一篇 = 这台就是旧的一方。
- **修**：① 收 store 0.16.2（`pull-package.sh 0.16.2`，离线 fallback 产物；接线零改动）② `app.ts` `resumeSync` / `afterSignIn`：`refreshIfCleanAny` 在 `pushNowAny` 之前；`afterSignIn` 末尾那一次快进删掉（换稿走 `open()` 自己的门）③ `editor.ts` `pushNow`：已物化 ∧ 不 pending ∧ 没有待落盘 ∧ 正文 === 上次落盘 → 不推（书的 `session.flush` 本来就 `!dirty && !force → wrote:false`）④ 黑匣子：`editor.persist` 记 `[sync] push "<name>": pushed | not pushed (<reason>) resolution=…`；`store-ui.resolveConflict` 记 `conflict sheet "<name>" occasion=… → <choice>` ⑤ 推送冲突面 primary 改「云端覆盖本地」（user 同日在 KudsRocket 会话「默认云端才是 authority」；挂机醒来撞面的那台通常是旧的一方；本机那份照旧进本机备份箱）。
- **E2E**：三个挂机场景加进既有的 `test/e2e-sync`（库自带 mock 云 + 两个浏览器上下文；没有另抄 MoonSinger 的 cloud-bridge，WXHW 自己的 bridge 已等价）：别机改过这台干净 → 静默快进、不弹面、零上传；锁屏那一下回执丢失（harness `gate.loseUploadOf = <云端路径>`：云端真的写了、响应不回）→ 库在同一次推里重试 → 412 → 逐字节比对相等 → 自愈，不弹面；加密稿同一场景也自愈（重试复用同一份密文）。全套 14 场景 2m22s 绿。
- **库侧仍开着的缺口**（本轮没动库；同日 KudsRocket 会话提的 `file.takeCloud()` 被 user 否决——「我要的就是本地覆盖云端和云端覆盖本地二选一啊！这个才是安全的模型！」「取消也要」：冲突只能在库弹的 `ui.resolveConflict` 三键面里由人选，app 不许替人回答、不许绕面换字节；WXHW 的 `store-ui.ts` 就是这张面，没有预设答案）：推到一半**页面死掉**（reload / 标签被回收）→ 下次推是新一次 `sealForWrite`（随机 IV）→ 密文不同 → `tryHeal` 比不出「其实同一篇」→ 弹面；明文稿同场景 `tryHeal` 字节相等能自愈。根治 = 推路径记住在途**明文**的哈希（或对加密容器比解壳后的明文）。要 user 立项。另：0.17.1 的每请求超时（挂死的在途 fetch 永不结束 = 保存链卡死的那种）在 0.17.2 里是显式开关，WXHW 要不要开，user 定。
- **验收口径**：真机 reload → 写几个字 → 等空闲推 → 不弹；别的设备改过、这台干净锁屏 / 回前台 → 静默换成云端新版 + 不弹；两边都改 → 弹、选哪边都不丢字节；黑匣子里每次登录 / 锁屏只有 pending 的那一推。

### 6.1 单设备根因（2026-10-16 晚补；user「是我完全没有动别的电脑，可能只是切换前后台或者挂机较久，就会有」）

§6 修的是「别的设备改过、这台干净」那条；user 的场景是**单设备**。e2e「txt · 单设备：页面被回收后重开…」复现了另一条路：

1. 页面被浏览器回收后重开（iOS 切后台回来常见；Edge 挂机久了也会）。WXHW boot = 建 store → **本地恢复开稿** → initAuth（CatsUp 2026-09-22 立的顺序）。
2. `open()` 的新鲜度门这时跑不成：库 `create-store` 的 `isOnline = rawOnline() && signedIn()` 传进了 `fresh.open` → 未登录走 `offline` 分支（KudsRocket 10-16 核的；我原写 cloud-error，效果一样）→ **不 markSeen** → 本 tab 的 `_base` 空（谱系 per-tab，reload 后全丢；`seenBase` 的 durable 回退只用于比对，按设计永不作 dirty 的 If-Match）。
3. 用户在登录回来之前就接着打字（可编辑 ~300 ms，静默续登 0.5–3 s，挂机久了更慢）→ `recordEdit` 捕 `_parent = _base ?? null` = **null**。
4. 登录回来 → `refreshIfCleanAny` 对脏稿是空操作（dirty-skip，不 markSeen）→ 第一次推 `ifMatchFor` 返回 null → 不带 If-Match → `conflictBehavior:"fail"` → 云端有同名 → 409 → `_confirmOurUpload` 大小不等（多了新字）→ `CloudNameCollisionError` → `surfaceCollision`（既有文件）→ 和 412 同一张冲突面。字节一个不丢，但人被要求「本地覆盖云端 / 云端覆盖本地」二选一——其实两边是同一篇的前后版本。
5. v2.3.35 之前的无条件推盖不住这条（用户没打字时才盖得住：409 → 大小相等 → 尾字节相等 → 认领）。

**提案（库，等 user 批；pwa-cloud-store 流程）**：`freshness.open()` 的三个「门没跑成」分支（`!isOnline()` / `cloud-error` / probe `skipped`）加一行：本地副本干净（`!head.isDirtyAnywhere(name) && !localDirty?.()`）∧ `head.seenBase(name) != null`（有 durable etag）→ `head.markSeen(name, seenBase)`。理由：干净 = 本地字节就是 durable etag 那一版的字节（push 成功 / 快进 / acquire 时才写 etag 并清 dirty），本 tab 此刻读进内存的就是它，谱系成立。不破 W2（「别的 tab 推过的 etag 不能当我的 parent」）：只在 open 时刻、只给本 tab 刚读到的那份标 base，不在 recordEdit 时刻去读共享 etag。云端其实动过（别机改了）→ 第一次推 412 → tryHeal 不等 → 冲突面——那是真分叉，和今天一样。durable etag 因回执丢失而陈旧 → 同样 412 → 面，不比今天差。消费方：WXHW / MoonSinger / WeebPaint / CatsUp boot 顺序相同，都受益；WXHW 收货后把 `test/e2e-sync/run.mjs` 的 `LIBRARY_LINEAGE_FIX_LANDED` 翻 true。

**app 侧替代（不推荐）**：boot 等 `authBootSettled()` 再开稿 → 开门就等 0.5–3 s（离线更久），和 user「启动速度优先」「首键不卡」相悖。

### 6.2 KudsRocket 会话的评估（2026-10-16 晚，user「告诉 kudsrocket 让它来评估一下」；它也直接报给了 user）

- 事实链成立；修正一处：登录前开稿走的是 `offline` 分支（`isOnline = rawOnline() && signedIn()`），不是 cloud-error，效果一样。
- 安全性：这行 markSeen 只会把 `_base` 设成「本地字节当时同步到的那一版」，永远不可能比字节更新 → B1 静默覆盖不可能；W2 成立（per-tab、open 时刻）；durable dirty 不变量核过（只在 push 成功 / markSynced 清，回执丢失走 deferred 不清脏）；`seenBase` 的所有消费者（offload 守卫、upload-queue、reconcile、safe-resolve、uploadReplay.enqueue）本来就回退到同一个 durable etag，行为不变；三个分支都加。
- **不要做**「dirty 但 `_parent` 值为 null」的重捕：null 可能是本 tab 真·新文件，捕了会把别 tab 的同名文件从 fail 变成 If-Match replace = 真·静默覆盖。这个窗口留给 409 面。
- 版本：patch 体量，但是所有消费方的默认行为变化；它建议当 0.16.2 同族 bugfix 默认开、发版说明「行为差异」单列，归 user 定。谁做归 user。
