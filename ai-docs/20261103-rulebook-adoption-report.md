# 工单 D 报告：小黑屋收新同步库 + 网盘闸门 + 两张取证表 + 六问

> created 20261103 by Claude Opus 5.5 · as-of v3.0.13 / 2026-11-03。读者 = Fable（数据安全门）和 user。工单 = 家族根 `ai-docs/20261103-work-orders.md` 工单 D + §0.3 三件。

## 0. 一屏结论

- **做完了**：收 store 2.2.3 / gallery 0.8.10，接好「旧的怎么办」；掉登录 / 没网的闸门 + 逃生口；两张取证表；六问。测试全绿。
- **三件要 Fable 定的事**（§4，都没动代码）：① 输入法用户词库把加密稿里打的词明文传上云（实测）；② 新建加密稿有一小步明文先落本机；③ 库的 collection 不看 `isOnline`，和设计稿「库一条网都不打」对不上。
- **两处和设计稿不一样**（§3）：离开不足 2 分钟回来不罩；补推不用 `pushAll`。
- **没有真机**：闸门在真 iPad 上的时机和真实原因码要等 user 用 dev 自然撞上，不催。

## 1. 做了什么（commit 一行一个）

| commit | 内容 |
|---|---|
| `41ec277` | v3.0.12：收 store 2.2.3 / gallery 0.8.10；接 `resolveRenameOld`（`src/store-ui.ts`）；`docs.ts` / `editor.ts` / `app.ts` 认「取消」「留着」；e2e 三种选法 |
| `f34d098` | v3.0.13：闸门（`src/cloud-gate.ts` + `src/cloud-gate-ui.ts` + 接线）；云端判断统一 `cloudOnline()`；守卫 `test/cloud-gate.test.mjs`；e2e 闸门 13 组 + 加密副产品扫描；service-worker 壳缓存按正式版 / 开发版分开 |
| `6a85227` | 闸门「没有稿可比」时另问云端（e2e ⑤c）+ 一条测试时序修正 + 本报告 |

验证（v3.0.13）：`npm test` 全过；`npm run smoke` 全过；`node tools/ui-audit.mjs` 全过；`npm run e2e:sync` 全过（4 分多钟）；`test/redline-guard.test.mjs` 绿。

## 2. 规则书 §4 检查表逐项

这一轮小黑屋不上 itch、不出备用版，所以部署形态那几项不适用。

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 自家前缀 token | ✓ | `webxiaoheiwu-7c2e9a41b3d05f68`（`src/device-kv.ts:9`） |
| 2 | 存储名带前缀 | 部分 ✓ | 下面命名空间表；两个 ✗ 是第三方（RIME、MSAL），写了为什么不改 |
| 3 | `deployment.ts` 叶子 | 不适用 | 这轮不上 itch |
| 4 | `deployment-policy.ts` | 不适用 | 同上 |
| 5 | 网盘入口按开关灰 | 不适用 | 同上 |
| 6 | 记住口令按 §2 | 不适用（形态没动） | 官网 only，`src/remember-password.ts`、`test/remember-password.test.mjs`；上限 / 默认没碰 |
| 7 | 崩溃影子 at-rest = 保存字节 ★ | ✓，一个例外 | 下面加密副产品表第 1、2 行；例外 = 新建那一步（§4 ②） |
| 8 | 资源读出重核哈希 | 不适用 | 这轮不上 itch，语音包没动 |
| 9 | itch 夹具 | 不适用 | 这轮不上 itch |
| 10 | 去官网文案 | 不适用 | 同上 |
| 11 | zip 双击 | 不适用 | 同上 |
| 12 | zip 体积 / 推 itch 守卫 | 不适用 | 同上 |
| 13 | 一次做全 ★ | ✓ | 闸门每个依赖都有真消费者（`src/app.ts:2406` 起）；没有恒 true；有家的判据 = 真账号（`src/app.ts:2539`）；没有新开关 |

### 命名空间表

| 名字 | 种类 | 文件:行 | 前缀 |
|---|---|---|---|
| `webxiaoheiwu.defaultStore`（+ `.staging`）+ localStorage `webxiaoheiwu.defaultStore.*` | store 自己的库 | `src/config.ts:6` APP_ID → `src/app-store.ts:33` | ✓ |
| `webxiaoheiwu-thumbs` | IDB 封面缩略图（gallery 建） | `src/config.ts:10` → `src/gallery-host.ts:111` | ✓ |
| `webxiaoheiwu-remember` | IDB 记住口令 | `src/config.ts:8` → `src/encryption.ts:18` | ✓ |
| `webxiaoheiwu-7c2e9a41b3d05f68:*` | localStorage（device-kv，唯一器官） | `src/device-kv.ts:9` | ✓ |
| `xiaoheiwu-<hash>`（正式版）/ `xiaoheiwu-dev-<hash>`（开发版）/ `xiaoheiwu-boot` | Cache 壳 | `service-worker.js`；`src/config.ts:49` | ✓（**这轮修的**，见下） |
| `pwa-models` | Cache 家族共享 | `src/config.ts:46` → `src/asr/worker.ts:48` | ✓（家规共享名） |
| `ime`、`/rime` | IDB（RIME 词典缓存 + 用户词库） | 建在 `vendor/my-rime/`；删在 `src/factory-reset.ts:20` | **✗ 第三方，没改** |
| `msal.*` 等 | localStorage（MSAL） | `node_modules/@internal/store/dist/base/providers/auth.js:272` | **✗ 第三方，没改** |
| `navigator.locks` 名 / `BroadcastChannel` 名 | — | 本仓 `src/` grep 零处；store、gallery 的 dist 里也零处 | ✓（没有） |
| SW scope | `./service-worker.js` = 所在目录 | `src/pwa-shell.ts:70` | ✓ `/` 与 `/dev/` 各一个 |

- **这轮修的**：正式版和开发版在同一个网址下（`write.weebpaint.com/` 与 `/dev/`），Cache 按网址共用。原来壳缓存都叫 `xiaoheiwu-<hash>`，一边 activate 就把另一边的离线壳删了，重启后还可能认错。现在开发版带 `dev-`，互不相删。正式版那边要等下次推 prod 才生效。单测：`test/sw-strategy.test.mjs`「正式版 / 开发版的壳缓存互不相删」。**同家族的 app 只要 prod / dev 同网址、都用「删别的同前缀缓存」，就可能有同款毛病**，我没查别的仓。
- **`ime` / `/rime` 为什么没改**：名字写在 vendored 的 RIME worker 里；改名 = 这台设备学过的词找不回来，除非写迁移，这属于动用户数据，归 Fable 定。家族已经一 app 一子域名，实际不会和兄弟 app 撞。
- **MSAL** 的键名不归我们定，同样靠子域名隔开。

### 加密副产品表

| 副产品 | 在哪 | 密文 | 依据 |
|---|---|---|---|
| 正文的本地工作副本（自动存，防抖落盘） | `src/editor.ts:172` → `src/docs.ts:128` → 库 IDB | ✓ | e2e「加密副产品」：翻遍本机所有 IDB 键和值、localStorage、sessionStorage、Cache，找不到正文标记；同一套扫描翻得到明文稿（正控制） |
| **新建加密稿的第一笔** | `src/editor.ts:122` 先存明文，`src/editor.ts:126` 再封 | **✗（一小步）** | 读代码，注释自己写了「明文只在本地 IDB 停留这一步」。封失败时明文一直留着、下次落盘重试（`src/editor.ts:127`）。见 §4 ② |
| **冲突留底（加密稿）** | `src/rescue.ts:23`、`:32` 先建再封，封不上进回收站 | **✗（同上）** | 读代码。同一个形状 |
| **拆出来的新书** | `src/app.ts:1156` 先建再封 | **✗（同上）** | 读代码。同一个形状 |
| 冲突备份箱（输家） | 库 `.backup` | ✓ | e2e：B 选「云端覆盖本地」后翻 B 本机，找不到输家的字；备份箱确实有一条 |
| 云端副本 | `….txt.zip` 容器 | ✓ | e2e：翻遍假云所有文件，找不到正文和输家的字 |
| 书的图、参考窗、editor-state | zip 内，随容器 | ✓ | 只存在于容器内（`src/project/format.ts`）。读代码，没另跑扫描（zip 压缩后字节扫描会假阴性） |
| 封面缩略图 | IDB `webxiaoheiwu-thumbs` | ✓ 存的是密文尾片 | `src/gallery-host.ts:72`、`:111`；解开只在内存（`gallery-screen.js` `setBlob` 建 object URL）。读代码 |
| 口令 | 内存；没选记住时哪也不落 | ✓ | e2e：翻遍本机找不到口令标记 |
| 记住的口令 | IDB `webxiaoheiwu-remember` | ✓ 钥匙不可导出、≤ 30 天 | `src/encryption.ts:18`；`test/remember-password.test.mjs`、`npm run e2e:remember` |
| 验证器 | collection `synced-app-state` → 云 | ✓ 不含口令明文 | `src/app.ts:232`、`src/crypto-state.ts:20`（加密一个固定串） |
| 黑匣子 | device-kv `diag-log` | ✓ 不含正文 | e2e 扫描包括 localStorage；代码里只记字数（`src/rescue.ts`）。**有文件名** |
| 文件名 | 列表、`last-open`、`lastActive`、黑匣子、云端名 | ✗（user 定的） | 2026-09-26 user「加密不改名同意」，本仓 CLAUDE.md 有记 |
| **输入法用户词库** | IDB `/rime` + collection `rime-user-dict` → **云** | **✗（实测）** | 见 §4 ① |
| 撤销栈、组字、语音 | 内存 | 不落盘 | 语音硬规则 #8 |
| 导出（长图 / PDF / TXT） | 用户主动 | 明文（人的意图） | — |

### 六问（设计稿 `20261103-library-needs-a-home.md` §2）

| # | 问题 | 答 | 证据 |
|---|---|---|---|
| Q1 | 没有 provider 能建库存作品吗 | **能（不合格）** | `src/app-store.ts:33` 开页就建库；`src/editor.ts:122` 没登录照样落本机（`tryPush:false`，`src/docs.ts:139`）；e2e 闸门 ①「没有家照样写」 |
| Q2 | 有本地文件夹这个家吗 | **没有（欠账）** | `showDirectoryPicker` 全仓零处；只有选单个文件 `src/project/local-home.ts:41`（「打开本机的书」） |
| Q3 | 没有家时能做什么 | 能写、能导出、能打开本机的书；**但默认写进本机库，不是文件模式**。txt 稿没有「选文件打开」，拖一个 .txt 到纸上 = 库里多一篇新稿 | `src/app.ts:2325`（打开本机的书）；`src/app.ts:1115` 起（拖放）；`src/project/local-home.ts:39` 只挑 zip |
| Q4 | 库入口没有家时长什么样 | **照常能进，不灰、没说明（不合格）** | `src/app.ts:1570` |
| Q5 | 设备上有只在浏览器里的作品吗 | **有（历史遗留，按工单只报不改）**：没登录写的稿和书只在 IDB。登录后「去处理」就是为它们设的 | `src/app.ts:2372` |
| Q6 | 崩溃影子 / 自动快照存哪 | 没有单独的影子；自动存就是库 IDB；字节 = 保存字节（加密 → 密文），例外同 §4 ② | `src/editor.ts:172`、上表 |

过渡路径归 Fable / user（设计稿 §4 现在只写了 MoonSinger）。小黑屋和 MoonSinger 同形，**顺序同样不能反：先保住已有的稿，再收入口**。

## 3. 闸门验收与偏差

**§1 排查结论 = (b) 微软就是要人重新交互，闸门是正解**，不是配置 bug：

- 配置都对：`localStorage` 缓存（`auth.js:272`、`:281`）、`/consumers`（`src/config.ts:12`）、回跳 = 当前网址（`auth.js:268`），Azure 两条回调 user 10-13 加过（本仓 CLAUDE.md「地址」节）。
- 根因证据来自 WeebPaint 黑匣子（`20260524 WeebPaint/ai-docs/20260909-bfcache-idb-lock-daily-reauth-analysis.md`）：微软给网页应用的刷新令牌固定 24 小时，不滑动。**这是别的 app 的证据，小黑屋自己的还没有**。
- 从这版起小黑屋黑匣子记每次续签：`[gate] silent renew (boot): failed elapsed=…ms name=… code=…`。user 用 dev 几天后看一眼就能核实（§6）。

**§7 八条（`npm run e2e:sync` 里「闸门」开头的场景，真 app + 真库 + 假云）：**

| # | 验收 | 结果 | 实测 |
|---|---|---|---|
| ① | 没有家零闸 | ✓ | 罩一次都没出现；没去续签 |
| ② | 登录好 + 云端没动 < 300 ms | ✓ | 167 ms、264 ms（两次跑）。假云，真网会多一次往返 |
| ③ | 续签失败：闸 + 两钮；离线继续能写、条显示 N、零请求；回线续签成 → 条收、推上去 | ✓ | 这条路（没登录）零云端请求。登录着选离线的情况见 §4 ③ |
| ④ | 没网直接进闸 | ✓ | 开页到进闸 26–63 ms，没续签 |
| ⑤ | 云端慢：点「先离线用」立刻放行；不点 8 s 进闸 | ✓ | 点到放行 11–76 ms；进闸 7.9–8.0 s；之后云端回了自己放行 |
| ⑥ | 醒来同一套；已选离线且没网不再弹闸 | ✓ | 含「过期后醒来 → 闸」「回线但续签没成 → 条还在」 |
| ⑦ | 离线继续不进存储 | ✓ | e2e 重开又走一遍；守卫 §8④ |
| ⑧ | 黑匣子有原因码 | ✓ | 成败两条都核了 |

另加：冲突面优先（等 9 秒面还在，没被闸门盖掉）；「重新登录」取消回到闸。

**§8 四条守卫**都在 `test/cloud-gate.test.mjs`。库改了日志行格式也会红（闸门靠那一行分「登录过期」和「没回应」）。

**和设计稿不一样的地方（请 Fable 看）：**

1. **离开不足 2 分钟回来不罩**，只悄悄核，核不上才弹闸。设计稿写的是醒来同一套。理由：写作 app 切个标签回来就打字，罩一下焦点被拿走，第一个字吃掉。2 分钟 = 现有闲置锁屏的数；更久、闲置锁屏醒来、往返缓存恢复都先罩。「判据不用时钟」我理解成「判是不是醒来」，所以这里用时钟判离开多久。
2. **补推不用 `dirty.pushAll`**：设计稿 §9 写了它，但 `test/push-consent.test.mjs` 钉死「app 零调用 pushAll」（user 10-26 定的）。网回来 = `resumeSync`：开着的那篇照常推，别的走「去处理」。所以 §7③「dirty 清零」在小黑屋只对开着的那篇成立，别的要人点。
3. **两种语言**：小黑屋只有中英，设计稿说四语。
4. **已选离线 + 有网 + 回前台**会悄悄续签一次，设计稿只写了「网回来」。成不了条还在，不弹闸。不这样的话，浏览器一直报有网的人等不到「网回来」那个事件，就没有回来的路。云钮上也多了「重新连接」。

**没有稿可比时**（没开稿 / 稿锁着 / 刚改了字，库的快进不问云端）：闸门另用库的 `collectionPeek` 问一次，「不知道」当没连上（`src/app.ts` gate 的 `check`；e2e 闸门 ⑤c）。

## 4. 卡门的（数据安全，等 Fable 定；都没动代码）

**① 输入法把加密稿里打的词明文传上云（实测）。**
是什么：内置输入法会学用户打过的词，学到的存进用户词库，然后同步到 OneDrive。这个词库不加密。我在加密稿里用拼音打了「小黑无米米」，本机词库的日志文件里能直接读到 `xiao 小`、`hei 黑`、`wu 無`、`mi 米` 这样的条目（拼音 + 字 + 次数）；切后台后，同样的字节原样出现在云端 `.webxiaoheiwu/rime-user-dict.json` 里（base64 包着）。一次性探针，没进仓。探针是一个音节一个音节打的，所以学到的是单字；连着打一个词会不会学成整词这次没单独测，按输入法的常理会。
选了会怎样：
- **加密稿开着时不学词 / 不推词库**：加密稿的词不进词库，也就不上云。代价是写加密稿时输入法不认得你的新词。
- **词库本身加密再上云**：要口令，没解锁就推不了，跨设备同步会变慢、变复杂。
- **不改，只告诉用户**：词库一直是「你自己 OneDrive 的应用文件夹」，风险是知道的人才在乎。
不选会错过什么：现在「加密稿」的承诺（规则书：副产品不许有不是密文的落点）对词库这一条不成立，用户不知道。
碰的是记住 / 加密形态之外的新面，所以按事前门停下。

**② 新建加密稿有一小步明文先落本机。**
是什么：第一次有字时，先按明文存进 IDB，紧接着再封成密文（`src/editor.ts:122`、`:126`）。正常就几毫秒。但封失败时（比如 store 报错）明文会一直留着，等下次落盘重试。冲突留底和拆新书是同一个形状。永远不上云。
选了会怎样：可能不用动库。库的 `save` 对已经是容器的输入原样透传（`create-store.js:927` 的注释），所以 app 也许能先封好再存，第一笔就是密文。我没试，这条路对不对归你判断。
不选会错过什么：崩溃恰好落在这一步，或者封一直失败时，这段字以明文留在浏览器存储里。

**③ 库的 collection 不看 `isOnline`，和设计稿「库一条网都不打」对不上。**
是什么：`store 2.2.3 create-store.js:1300` 建 collection 时没把 `isOnline` 递进去（`createCollection` 本身支持这个参数），所以偏好、账户态、词库这三份不认「离线继续」。我在 app 这边挡住了自己发起的两处（`src/app-store.ts:67`、`src/app.ts` `rememberLastActive`）。挡不住的：**登录着选了离线之后改一个偏好，还是会发请求**；还有开机那一趟在路上的。e2e 实测 2 条（`synced-app-state`、`synced-user-preference`）。
没登录的情况不受影响（取令牌就抛错，请求发不出去）。
选了会怎样：库里加一行递 `isOnline`（patch，归库仓，要批）。修了把 `test/e2e-sync/run.mjs` 的 `LIBRARY_COLLECTION_HONORS_ISONLINE` 翻成 true 就是硬检查。
不选会错过什么：「离线继续」不是真的一条网都不打；不丢数据，只是说法不完全成立。其他 app 接闸门时会遇到同一个问题。

## 5. Fable 要看的 diff

| commit | 文件 | 看哪 |
|---|---|---|
| `f34d098` | `src/cloud-gate.ts` | 全文（238 行）：`run()` 的赛跑、`reconnect()` 的先续签后放开、`block()` 对冲突面的让路 |
| `f34d098` | `src/cloud-gate-ui.ts` | `ownFace` / `foreignFaceUp`：怎么认锁屏位上是不是自己 |
| `f34d098` | `src/store-ui.ts` | `offlineEscape`（闸门在场跟闸门赛跑；`settle` 只关自己的面）、`reportError` 捡原因码 |
| `f34d098` | `src/app.ts:1203`、`:2402-2419`、`:2425`、`:2478-2490` | 接线：问云端合并成一次、闸门依赖、闲置醒来、回前台分路 |
| `f34d098` | `src/app-store.ts:50`、`:67` | 接进库的 `isOnline`；collection 那条缺口的 app 侧挡板 |
| `f34d098` | `service-worker.js` 头部 + `activate` | 壳缓存分范围 |
| `41ec277` | `src/store-ui.ts` `resolveRenameOld` | 照 CatsUp 的形状 |

## 6. 真机项（攒批，不催）

- 用 dev 过一天以上再开（刷新令牌到期）：应该看到闸写「登录过期了」，点「重新登录」两步回来。之后黑匣子 `[gate] silent renew` 那几行就是 §1 要的证据。
- iPad Edge 上隐藏 iframe 卡住时：应该 8 秒后写「网盘没有回应」，全程「先离线用」可点。
- 回前台、锁屏回来的时机；常驻条在软键盘 / 逐段模式下的位置（无头没看过真屏）。

## 7. 新图标需求

无。常驻条用现有的 `cloud-unavailable`。

## 8. 没做

- 本地文件夹的家（Q2）、库入口灰掉（Q4）：工单说只报不改。
- 本仓没有 `ai-docs/yyyymmdd-pipelines.md`（家规 10-26 欠账），这轮没补。
- 没查别的仓有没有同款壳缓存互删。
- prod 没推；等 user 一句话。
