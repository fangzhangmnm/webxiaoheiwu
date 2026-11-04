# 工单 D 报告：小黑屋收新同步库 + 网盘闸门 + 两张取证表 + 六问

> created 20261103 by Claude Opus 5.5 · as-of v3.0.13 / 2026-11-03。读者 = Fable（数据安全门）和 user。工单 = 家族根 `ai-docs/20261103-work-orders.md` 工单 D + §0.3 三件。

## 0. 一屏结论

- **做完了**：收 store 2.2.3 / gallery 0.8.10，接好「旧的怎么办」；掉登录 / 没网的闸门 + 逃生口；两张取证表；六问。测试全绿。
- **三件数据安全的事 Fable 11-03 裁定了，D2 做完了（§4）**：① 加密稿学到的词只进内存，不落盘不上云；给「清空用户词库」入口，**清不清等 user**（Fable 去问）；② 新建加密稿 / 留底 / 拆新书先封再存，IndexedDB 里一刻明文都不留；③ 收 store 2.2.4（collection 也认离线）。
- **D2 顺手抓到一个老 bug**：加密稿 / 书在第二台设备解锁着第一次打开，被当成明文稿（§4 ④）。
- **两处和设计稿不一样**（§3，Fable 已接受）：离开不足 2 分钟回来不罩；补推不用 `pushAll`。
- **没有真机**：闸门在真 iPad 上的时机和真实原因码要等 user 用 dev 自然撞上，不催。

## 1. 做了什么（commit 一行一个）

| commit | 内容 |
|---|---|
| `41ec277` | v3.0.12：收 store 2.2.3 / gallery 0.8.10；接 `resolveRenameOld`（`src/store-ui.ts`）；`docs.ts` / `editor.ts` / `app.ts` 认「取消」「留着」；e2e 三种选法 |
| `f34d098` | v3.0.13：闸门（`src/cloud-gate.ts` + `src/cloud-gate-ui.ts` + 接线）；云端判断统一 `cloudOnline()`；守卫 `test/cloud-gate.test.mjs`；e2e 闸门 13 组 + 加密副产品扫描；service-worker 壳缓存按正式版 / 开发版分开 |
| `875e260` | 闸门「没有稿可比」时另问云端（e2e ⑤c）+ 一条测试时序修正 + 本报告 |
| `54f6e34` | v3.0.14：词库只进内存（`vendor/my-rime/worker-guard.js` + `src/ime.ts`）+ 清空用户词库入口；先封再存（`src/docs.ts sealForNewDoc`）；第二台设备认不出加密件的老 bug；收 store 2.2.4 |

验证（v3.0.14）：`npm test` 全过；`npm run smoke` 全过；`node tools/ui-audit.mjs` 全过；`npm run e2e:sync` 全过（5 分多钟）；`test/redline-guard.test.mjs` 绿。

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
| 7 | 崩溃影子 at-rest = 保存字节 ★ | ✓ | 下面加密副产品表第 1、2 行；新建那一步的例外 D2 修了（§4 ②） |
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
| 新建加密稿的第一笔 | `src/docs.ts` `sealForNewDoc` → `createDoc` | ✓（D2 修，原来先存明文再封） | e2e「先封再存」：探针记 IndexedDB 每一笔 put，都是容器，任何库里没出现过明文；正控制（明文稿）抓得到 |
| 冲突留底（加密稿） | `src/rescue.ts` → 同上 | ✓（D2 修） | e2e「先封再存：加密稿冲突留底」。**修之前实测是明文**，比原表写的「一小步」严重（§4 ④） |
| 拆出来的新书、新书勾加密 | `src/app.ts` → `createProjectDoc(…, { encrypted })` | ✓（D2 修） | e2e 同上 |
| 加密书导出到书库 | `src/app.ts` `exportBranchFlow` → 同上 | ✓（D2 修，原表漏了这一条） | e2e 同上。下载文件是人明确要的，不算 |
| 冲突备份箱（输家） | 库 `.backup` | ✓ | e2e：B 选「云端覆盖本地」后翻 B 本机，找不到输家的字；备份箱确实有一条 |
| 云端副本 | `….txt.zip` 容器 | ✓ | e2e：翻遍假云所有文件，找不到正文和输家的字 |
| 书的图、参考窗、editor-state | zip 内，随容器 | ✓ | 只存在于容器内（`src/project/format.ts`）。读代码，没另跑扫描（zip 压缩后字节扫描会假阴性） |
| 封面缩略图 | IDB `webxiaoheiwu-thumbs` | ✓ 存的是密文尾片 | `src/gallery-host.ts:72`、`:111`；解开只在内存（`gallery-screen.js` `setBlob` 建 object URL）。读代码 |
| 口令 | 内存；没选记住时哪也不落 | ✓ | e2e：翻遍本机找不到口令标记 |
| 记住的口令 | IDB `webxiaoheiwu-remember` | ✓ 钥匙不可导出、≤ 30 天 | `src/encryption.ts:18`；`test/remember-password.test.mjs`、`npm run e2e:remember` |
| 验证器 | collection `synced-app-state` → 云 | ✓ 不含口令明文 | `src/app.ts:232`、`src/crypto-state.ts:20`（加密一个固定串） |
| 黑匣子 | device-kv `diag-log` | ✓ 不含正文 | e2e 扫描包括 localStorage；代码里只记字数（`src/rescue.ts`）。**有文件名** |
| 文件名 | 列表、`last-open`、`lastActive`、黑匣子、云端名 | ✗（user 定的） | 2026-09-26 user「加密不改名同意」，本仓 CLAUDE.md 有记 |
| 输入法用户词库 | IDB `/rime` + collection `rime-user-dict` → 云 | ✓（D2 修，新词；**旧版本已经学进去的还在**，见 §4 ①） | e2e「词库」：加密稿打字后 `/rime` 和同步文件字节一点没变，关稿内存层也没了 |
| 撤销栈、组字、语音 | 内存 | 不落盘 | 语音硬规则 #8 |
| 导出（长图 / PDF / TXT） | 用户主动 | 明文（人显式选的；下载前明说一句，D3） | `src/app.ts` `offerFiles`；e2e「加密稿出门」 |
| 加密稿 / 书另存到磁盘（D3 新增） | 导出面板默认「加密副本」 | ✓ 库发的容器字节原样出门，带口令可导回 | `src/app.ts` `exportSealedCopyFlow` / `importSealedFile`；e2e「加密稿出门」 |
| 加密词库（D3 新增） | collection `rime-enc-dict`，一机一键 | ✓ 每个值都是容器；明文只在内存层 | `src/enc-dict.ts`；e2e「加密词库」IDB 探针 |

### 六问（设计稿 `20261103-library-needs-a-home.md` §2）

| # | 问题 | 答 | 证据 |
|---|---|---|---|
| Q1 | 没有 provider 能建库存作品吗 | **能（不合格）** | `src/app-store.ts:33` 开页就建库；`src/editor.ts:122` 没登录照样落本机（`tryPush:false`，`src/docs.ts:139`）；e2e 闸门 ①「没有家照样写」 |
| Q2 | 有本地文件夹这个家吗 | **没有（欠账）** | `showDirectoryPicker` 全仓零处；只有选单个文件 `src/project/local-home.ts:41`（「打开本机的书」） |
| Q3 | 没有家时能做什么 | 能写、能导出、能打开本机的书；**但默认写进本机库，不是文件模式**。txt 稿没有「选文件打开」，拖一个 .txt 到纸上 = 库里多一篇新稿 | `src/app.ts:2325`（打开本机的书）；`src/app.ts:1115` 起（拖放）；`src/project/local-home.ts:39` 只挑 zip |
| Q4 | 库入口没有家时长什么样 | **照常能进，不灰、没说明（不合格）** | `src/app.ts:1570` |
| Q5 | 设备上有只在浏览器里的作品吗 | **有（历史遗留，按工单只报不改）**：没登录写的稿和书只在 IDB。登录后「去处理」就是为它们设的 | `src/app.ts:2372` |
| Q6 | 崩溃影子 / 自动快照存哪 | 没有单独的影子；自动存就是库 IDB；字节 = 保存字节（加密 → 密文） | `src/editor.ts`（`LOCAL_SAVE_DEBOUNCE_MS`）、上表 |

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
| ③ | 续签失败：闸 + 两钮；离线继续能写、条显示 N、零请求；回线续签成 → 条收、推上去 | ✓ | 没登录、登录着选离线两条路都是零新请求（store 2.2.4 后转硬检查） |
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

## 4. 数据安全（Fable 11-03 裁定，D2 做完；只剩一件等 user）

**① 输入法把加密稿里打的词明文传上云：修了，旧数据等 user。**
原来：内置输入法学到的词存进用户词库，同步到 OneDrive，不加密。实测在加密稿里打「小黑无米米」，本机词库日志和云端 `rime-user-dict.json` 里都能读到 `xiao 小`、`hei 黑`、`mi 米`。
现在：开着加密稿时学到的词只留内存（本次会话能联想，关稿即忘）；`/rime` 和同步文件字节一点不变（e2e 逐字节比）；明文稿照旧。
做法：上游 worker 上屏就写盘，也没有不学词的运行时选项，所以加了一层薄垫片（`vendor/my-rime/worker-guard.js`，上游文件没动）。**两个实测坑**写在 `src/ime.ts`：多出来的文件不删 = 词回来；`CURRENT` 不能删（内存盘的陈旧节点）。
**还在的**：旧版本已经学进去、已经传上云的词分不出来。设置里加了「清空用户词库…」（说明 + 可取消，**默认不自动清**），本机和同步文件都清，别的设备看到也清、不会传回来。OneDrive 自己留的历史版本不归这里管，说明里写了。Fable 去问 user 要不要清。

**② 新建加密稿先落明文：修了。**
新建加密稿、冲突留底、拆新书、新书勾加密、加密书导出到书库（这条是我核的时候补的）都先封再存：探针记 IndexedDB 每一笔 put，全是容器。没口令 / 封失败 = 不写：字还在编辑器里，状态写「还没存」，下次落盘再试。新书勾加密拿不到口令 = 不建（原来是先建一本明文的）。
**代价要说清**：封一直失败时，这些字只在内存里，关页就没了（这是 Fable 裁的「绝不留明文」的另一面）。

**③ 库的 collection 不看 `isOnline`：Fable 出了 store 2.2.4，收了。**
e2e 闸门 ⑤ 的开关翻成硬检查，绿。app 里挡的两处留着（`src/app-store.ts`、`rememberLastActive`）。**2.2.4 的 tag 和 tgz 只在本地**，GitHub 还没推（Fable 那边等 user）；小黑屋的 `vendor-pkgs/` 里有 tgz，不影响发版。

**④ D2 抓到的老 bug（不在原表里）：第二台设备认不出加密件。**
纯云端的加密稿 / 书，在第二台设备解锁着第一次打开时，`isEncrypted` 看的是还没有的本地字节，判成「不是」，这一篇就被当成明文稿：锁图标错；**冲突留底按明文存**（探针抓到的就是这个）；输入法照常学词。保存时库按字节封，所以密文本身没坏，之前的扫描也发现不了。修在 `readDoc` 和 `openStore`：打开后再看一次。e2e「第二台设备第一次开」。**可能全家都有**（看「先 isEncrypted 再 open」这个形状），我没查别的仓。

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

- 加密稿里连着打一段再关稿（真 iPad 上）：候选里当场能联想，关稿后没了；进出加密稿的那一下有没有卡顿（要重开两次引擎，无头 PC 上感觉不到）。
- 用 dev 过一天以上再开（刷新令牌到期）：应该看到闸写「登录过期了」，点「重新登录」两步回来。之后黑匣子 `[gate] silent renew` 那几行就是 §1 要的证据。
- iPad Edge 上隐藏 iframe 卡住时：应该 8 秒后写「网盘没有回应」，全程「先离线用」可点。
- 回前台、锁屏回来的时机；常驻条在软键盘 / 逐段模式下的位置（无头没看过真屏）。

## 7. 新图标需求

无。常驻条用现有的 `cloud-unavailable`。

## 8. 没做

- 本地文件夹的家（Q2）、库入口灰掉（Q4）：工单说只报不改。
- 清不清旧词库：入口做了，没替 user 清。
- 本仓没有 `ai-docs/yyyymmdd-pipelines.md`（家规 10-26 欠账），这轮没补。
- 没查别的仓有没有同款壳缓存互删。
- prod 没推；等 user 一句话。

## D3：加密词库 + 出门规则（2026-11-03，v3.0.15）

工单 = 家族根 `ai-docs/20261103-work-orders.md`「工单 D3」+ Fable 后加的 F-181（出门规则）、F-182（核「回来问一次」）。prod 没推。

### 验收（工单列的五条）

| # | 要求 | 结果 | 证据 |
|---|---|---|---|
| ① | 真 IDB 探针：加密词库每一笔 put 的值都是容器，任何库里没有明文词 | ✓ | e2e「两台设备各学一个词」：探针逐笔解信封，每个值 `looksEncrypted`；整机扫 + 云上扫都没有词条。反证：封口换成明文 base64，三条红 |
| ② | 加密稿期间 `/rime` 零写入（D2 继续绿） | ✓ | 学词、切后台前后逐字节比；D2 的「词库」两组照绿 |
| ③ | 两台各学一个词，第三次打开都能联想 | ✓ | 真 RIME：候选真的往前挪了（灌进去的日志被 LevelDB 重放）。A 学「市」（原排第 5），B 学「校」（原排第 5），第三次都靠前；关稿回原位 |
| ④ | 清空后别的设备不把词传回来 | ✓ | e2e + 单元。反证：去掉「没跟上清空的键作废 / 先清再说」，单元三条红、e2e 三条红 |
| ⑤ | 口令不在时词库字节不变 | ✓ | 锁定后本机值、云上字节都没变；内存层里灌进去的也立刻丢了 |

### 和设计稿不一样的地方（Fable 看）

1. **delta 不是垫片记录的，是比较出来的**：内存层相对「进稿时的词 + 灌进去的词」，`c` 或 `t` 变了的就算新学。这样垫片一行没动，也不用解析写入流。
2. **词的进出在文件层**：wasm 没有导出词库接口（只有 set_ime / process 等 10 个函数）。`src/rime-userdb.ts` 读 `.ldb` / `.log`，写一个编号最大的 `.log`。依赖 LevelDB 文件格式（公开稳定）和本版 RIME 不压缩；碰到压缩块就抛，退回 D2（本次能联想、关稿即忘）+ 说一声。
3. **多了三个封的时机**：切后台（iPad 随时杀页面）、锁定前、登出前。
4. **多了一个丢的时机**：锁定时灌进去的词立刻从内存层丢（D2 时只有自己学的，这轮有全部词，不能留着）。
5. **口令用当前口令**：稿子自己的口令不算。图库锁着但这篇用自己的口令开着 = 不加载，等于 D2。
6. **换口令**：`rekey` 把读得开的键全换新口令（含别的设备的键，per-key LWW）。设计稿没提，不做的话改完口令词库就读不开了。

### 出门规则（F-181）

导出面板在加密稿 / 书上第一个、也是主按钮 = 「加密副本（整份）」：取库发的容器字节（`getEncryptedBlob`，全库备份同一个口子），不解密、不重封。长图 / PDF / TXT 和书的「下载一份」仍在，显式选，下载前面板写「这是明文…」。明文稿没有这个选项、也不多嘴。**导回**：拖到纸上，或「打开本机的书」选它；口令不同先问（错了继续问，什么都不进库）；导回后用现在的口令封。稿和书都走了 e2e（真下载、真字节）。

没加话的：**复制文字**（剪贴板）——不是文件，人点的就是复制。要不要也说一句，Fable 定。

### 核 F-182（「回来问一次再补传」）：一处修了，一处要 Fable 裁

**① 面和「正在同步」条打架：修了。** `resumeSync` 是闸门「跟上网盘」那条路，原来 `await` 那张面 = 人不答，条一直写「正在同步」，词库、偏好的对齐也卡着。现在先对齐，再问，不等人答。守卫 = `test/push-consent.test.mjs`（反证：改回 await 红）。**e2e「闸门 ③e」分辨不出这个修复**（别的入口总先问，反证不红），只算回归，不算证据。

**② 现状和第 15 条改写后的口径不一样，我没改（等 Fable 定要不要开单）。** Fable 问「那张面是不是本来就只数只在本机的稿」——**不是，从 v2.3.52 起就不是**：它数的是 `files.dirty.count()`，只在本机的和传过改了没传的混在一起（文案也写着两种都算）。`v3.0.11`（10-26，user「列表面」）起，点了是「去处理 → 书库逐篇选」，不是传。对照新口径：

| 新口径 | 小黑屋现在 |
|---|---|
| (a) 从没传过：「有 N 份只在这台设备，现在传上去？」，点了传 | 和 (b)(c) 混着问，点了去列表，不传 |
| (b) 传过、按过存没传成：自动续传不问 | 开着的那篇 `pushNowAny` 自动推 ✓；别的篇混进问句 |
| (c) 传过、只是自动保存：不传不问，进列表 | 会被问一句（不传 ✓，但多问了） |

要对齐的话：N 从列表的 syncState 取（`float` 算；`local-only` 从没同步、干净，要不要算归 Fable），问句改文案，点了逐篇推这几份（不是 `dirty.pushAll`，它会把 (c) 一起推了）。`test/push-consent.test.mjs` 钉着「全 app 零 pushAll」，逐篇推不碰这条。

### 真机项（批量等 user，不催）

iPad / Quest 上：加密稿里学词 → 关稿 → 另一台打开能联想；一万词规模下开稿卡不卡（桌面 517 ms）；导出加密副本 → 文件 app 里选回来。

### 新图标

没有。

edited by Claude Opus 5.5 2026-11-03
