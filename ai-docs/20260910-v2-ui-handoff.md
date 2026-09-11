# 2.0 UI 接线 handoff：数据层已备好，剩下的是 UX 决定
> 作者：Claude Fable 5.1（claude-fable-5-1）· created 20260910 · as-of dev 0.2.21 + 2.0 数据层（commit 见 git log 2026-09-10）· 69 测绿 · 真机零
> **2026-09-10 晚更新（edited by Claude Fable 5.1）**：user「2 最好你先做吧」→ §2 的六条已按委托落了一版最小 UI（§4），dev = **v2.0.0-2026-09-10**，真机零。
> **2026-09-10 深夜 2（edited by Claude Fable 5.1）**：user 真机第二轮打回（黑匣子 + 一串 UX 拍板）→ **v2.0.4**（§4 末「v2.0.4 打回轮」）。
> 格式 = ADR-0008–0011；计划 = 家族根 `ai-docs/20260909-wxhw-2.0-long-haul-plan.md`；user 2026-09-09：「UX 不用你管。主要还是创作心理学」→ 本文只摊接口，不做 UI 决定。

## 1. 已落的（可直接消费）
| 模块 | 给 UI 的面 |
|---|---|
| `src/project/format.ts` | `packProject / unpackProject`（结果四态 ok / not-project / too-new / corrupt）、`nameKey`、`isValidNodeName`、`nodeExt` |
| `src/project/graph.ts` | `createNode`（撞名 = 链接）、`link/unlink`（默认顶部）、`renameNode`（重写引用）、`deleteNode`（留占位符）、`backlinks`（查询）、`search`（≥2 字）、`neighbors`（边栏数据：出边 + stub 旗） |
| `src/project/session.ts` | `createProjectSession({read, write})`：`open / create / close / flush(push)`、`current / currentText / setCurrentText`（改了才脏）、`jump`（不标脏；占位符生文件）、`spawn(newName, selectedText)`（主动作）、`addLink / removeLink / setLinksOrder / rename / remove`、`sidebar / backlinksOf / find / exists`；too-new = 只读 |
| `src/docs.ts` | `readProjectBlob / saveProjectBlob / createProjectDoc`（`isZip:true`；加密透明）；`readDoc` 对工程名抛（护栏） |
| `src/doc-model.ts` | `docKind(name)`：`"txt" | "project" | null`；`isDocName` 两档都认；`makeDocName(..., kind)`；`collisionCandidate` 认复合扩展名 |
| `src/zip.ts` | `zipPack(entries, { levelFor, lastModDate })`、`levelForPath`；`useCompressionStream:false` |
| `src/app-store.ts` | store 0.13.0 `toName` 规则（明文 `.webxiaoheiwu.zip` 不当加密容器）；`validateAdopt` 认 zip 魔数 |
| vendor-pkgs | `@internal/gallery 0.1.0`、`@internal/workbench-elements 0.1.0` 已装（未接线） |

## 2. 待 user 的 UX 决定（数据层对这些零态度）
1. **工程编辑器的形态**：现有 `editor.ts` 是单篇 txt 的 textarea 会话（200ms 落盘 / 15s·30s 推云、改名、加密流）。工程模式 = textarea 绑定 `session.currentText`，同样节律调 `session.flush(push)`。要不要复用 `createEditor` 的节律代码（抽成公共的 save-cadence），还是给工程另写一份薄会话？我倾向抽节律成公共件，两种稿共用。
2. **边栏**：journal 定的是「左栏 = 当前节点的出边列表（可手排），反链是一次查询」。列表项 = `session.sidebar()`（名字 + 是否占位符）。占位符怎么显示、`===` 分节已否决、排序靠拖还是靠命名前缀——你定。
3. **spawn 手势**：选中文字 → 一次击键 → `session.spawn(name, selectedText)`。默认名从哪来（首几个字 / 让你打）是 journal 里留给你的最后一个缝。
4. **图库**：`@internal/gallery` 的 `createGallery(el, deps)` 需要一个 `DocHost`（open / newDoc / renameActive / push / unload / exit / isDirty / currentName）——可以从 `editor.ts` + 工程会话各出一半；`policy.docExtensions = [".txt", ".webxiaoheiwu.zip"]`，无缩略图。card view 替抽屉是你倾向的方向，但抽屉现在能用；换不换、什么时候换，你定。
5. **新建工程的入口与默认名**：`createProjectDoc(title, blob)` 已有；首节点名（`yyyymmdd-hex4.txt` 还是让你打）你定。
6. **2.0.0 版本翻牌**：家规「bump major 前先问要不要把之前版本 push prod」——0.2.21 要不要先 push prod，未答。翻牌前 `src/version.ts` 不动。

## 3. 没做 / 不做
- 没碰 `app.ts` / `editor.ts` / `drawer.ts`（UI 归 user）；没 build bundle、没推 dev。
- 图片节点、缩略图、mimetype、zip 内历史：ADR-0008 §5 不做。

## 4. 已落的最小 UI（2026-09-10 晚，委托下的 AI 决定；user 随时打回）
- **工程编辑器** = 同一个 textarea 两种稿：`src/project/mode.ts` 控制器绑定 `ProjectSession`，节律与 txt 同款（200ms 本地 / 15s·30s 推云）；txt 编辑器在工程期 `park()`（不收 input、不写盘）。门面在 `app.ts`（`openAny / syncKindAny / canEditNow / flushLocalAny / pushNowAny`）：谁活着问谁。
- **边栏** `src/project/sidebar.ts`（`#edgeSidebar`，宽屏常驻页左、<900px 浮层由顶栏钮开合）：当前节点的出边列表（占位符 = 虚线名字），行菜单 = 上移 / 下移 / 改名 / 断边 / 删节点；底部「打一个名字 = 连一条边」；「谁指向这里」= 一次查询临时列表；检索框 ≥2 字、结果临时；回退钮（回退栈只在内存）。
- **spawn**：选中正文按 **Ctrl+Enter**（或边栏「分裂选中」）→ 问名字（默认 = 选中首行前 12 字 + .txt）→ 那段字从源稿移走（走 `replaceRange` 保 undo）进新节点，当前节点顶部长出一条边，光标跳过去。**Alt+←** 回退。
- **新建工程**：抽屉「+」菜单「新建工程…」（名字空 = 日期码；首节点 = `yyyymmdd-hex4.txt`）。
- **无地骑士**：「打开本机工程…」：有 FSA（Chromium / Quest）写回原文件；没有（iPad Safari）读走文件选择器、保存 = 下载一份。本机工程不自动写，Ctrl+S / 保存钮显式触发。
- ~~图库 card view 没换~~ → **v2.0.1 换了**：☰ = `@internal/gallery` card view 独立一屏（`src/gallery-host.ts`，`#galleryFull`），抽屉只剩设置；工程卡片显示 stem（`NameBoundary.display`，gallery 0.1.1）。**v2.0.2** 工程整包加密 UI（顶栏锁钮 / 锁态 / 解锁 sheet）。edited by Claude Fable 5.1 2026-09-10
- 顶栏工程模式 = 「工程名 · 节点名」，加密 / 只读钮隐藏（工程整包加密走 store 透明层，UI 后补）。
- 图标：边栏开关暂用 `folder-open` 顶位，真图标需求已登记图标库 TODO。

### v2.0.3 自查轮（2026-09-10 深夜，user 真机六条打回 → 无头 chromium 复现 + 修）
user 原话：「图库和编辑器的遮挡顺序错误」「大小也不对」「card非常大而且排版乱」「各种ui错蛮多的，你先自查一轮」「退格键不识别，然后别的文本框输入法没接」「侧边栏toggle也不行」。逐条：
- **遮挡**：包 CSS 里 `.gallery-full{z-index:var(--z-overlay)}` 在 WXHW 无此变量 → 落到顶栏之下。修 = 该块从包 CSS 删掉（宿主定层），WXHW z 表：top-bar 5 / gallery 8 / toast 9 / drawer 10 / popup 25 / idle 30 / busy 35 / sheet 40。
- **卡片巨大、排版乱**：包 CSS 缺 `.gallery-grid` 规则（WeebPaint 那份留在宿主没随包走）+ WXHW 无通用 `.hidden` → 卡片菜单常开、面包屑常显。修 = gallery **0.1.1**（`.gallery-grid` 进包、`.gallery-tile-menu-popup` 实底、`.hidden` 规则包内限定作用域）。
- **退格**：txt 编辑器 `blockIfGuarded` 在 park 期仍拦 keydown。修 = parked 直接放行（`editor.ts`）。
- **输入法没接别的框**：`setupImeOn` 只挂 `#editor`。修 = sheet 两个输入框 + 边栏检索 / 连边框都挂（密码框不挂）。
- **边栏 toggle**：宽屏只改 `hidden` 没改布局。修 = `body[data-edges]` 一个开关（宽屏默认 1、窄屏默认 0、`matchMedia` 跟随），CSS 两条规则吃它。
- **工具**：`node tools/ui-audit.mjs [1280x800 400x800]` = 无头走完整流程（txt → 图库 → 新建工程 → spawn → 边栏 → 卡片菜单 → 回收站 → 设置叠图库），截图到 `tmp/ui/`，并打印三条探针（工程退格 / 边栏框 IME / 宽屏 toggle 收起后纸面居中）+ 图库中心元素 / 顶栏被盖。改 UI 后跑一遍再交。

### 真机清单（Quest / iPad）
0. ☰ → 图库一屏盖住编辑器与顶栏；卡片一排多张、不是一张占满；「⋯」菜单点开才出现、实底；工程卡片名字无 `.webxiaoheiwu.zip` 尾巴。工程里退格能删字；边栏检索框能打拼音出候选；顶栏边栏钮宽屏收起后纸面回中。
1. 抽屉「+」→「新建工程…」→ 顶栏显示「名 · yyyymmdd-xxxx.txt」，左侧边栏出现（iPad 竖屏需点顶栏边栏钮）。
2. 打几行字 → 状态栏「未同步」→ 15s 内推云 → 徽章 synced；OneDrive 里出现 `名.webxiaoheiwu.zip`，7-Zip 打开 = `graph.json + contents/ + .webxiaoheiwu/`。
3. 选中一段字 Ctrl+Enter（Quest 实体键盘）→ 名字框 → 新节点；边栏第一条是它；Alt+← 回来，源稿里那段字没了。
4. 边栏打一个不存在的名字「连」→ 虚线条目；点它 → 生出空节点。
5. 关掉重开 app → 落回上次所在节点（editor-state.last）。
6. 换设备打开同一工程 → 落到上次**保存**时的节点。
7. 「打开本机工程…」Quest 上选一个下载好的 zip → 改字 → Ctrl+S → 文件被写回（FSA）；iPad 上 = 下载一份。

### v2.0.4 打回轮（2026-09-10 深夜 2，user 真机 + 黑匣子 `D:\Downloads\黑匣子.txt`；edited by Claude Fable 5.1）
user 原话（按时序）：「工程改名之后得刷新页面」「一开始创建节点也看不到出边，刷新之后才好」「editor sidebar 只有一个三条杠，打开之后是工程内导航，上面是回书库和设置的入口，gallery 叫书库」「使用系统输入法时不要弹窗 nudge，支持系统输入法就行」「为什么打开工程会弹窗抱怨一句」「侧栏不应默认开」「新建节点用 list 最下面的一个加号按钮」「默认节点就叫第一章」「吃书：还是不显示扩展名吧」「节点应该加在末尾」「节点名就用之前很可惜被弃置的章节名的 ui」「当前节点的改名也用这个章节名的机制」「初始节点叫第一章？根据当前语言自动生成」「检索不限字数，这样可以搜全量孤儿」「改名后刷新可看到已改名的文件」「default 还是叫“作品”吧」「侧栏不平衡，放在右边试试看？」
- **黑匣子破案**：每次开工程 2s 后 `W readDoc: project files open via project/session, not as text` = `afterSignIn` 的冷启动「远端 lastActive」把工程名塞给 **txt 编辑器** `editor.open` → readDoc 护栏抛 → warning 横幅（就是「打开工程弹窗抱怨一句」）。同根：boot 末尾 `setState(editor.statusForDoc())` 拿 parked 的 txt 编辑器状态 → 工程一开顶栏显「本地没有缓存，云端也连不上」；`onForeground` / 60s 轮询也直接问 txt 编辑器。修 = 全走 `openAny / stateAny / refreshIfCleanAny`（谁活着问谁）；`editor.open` 对工程名在改状态前就拒绝。**远端 lastActive 是 txt 而本机开着工程时，旧码会把 txt 正文灌进工程的 textarea**（下次落盘写进节点 = 串稿）——同一修法堵住。
- **改名工程要刷新**：无头复现不到「失败」，但抓到 `renameProjectFile` 改完名**整包重开**（`project.openStore(新名)` → store `open()`）偶发 >1.2s；登录态下 open() 还会碰云。修 = `project.adoptName(新名)` 只换身份（session.adoptName + KV + 顶栏），不重开、不重载正文、回退栈不丢。书库卡片由 store `tryMove` 的 notifyFolderOf 帧自己更新（无头验证 ok）。
- **建节点看不到出边**：无头（未登录）复现不到；spawn 后当前节点 = 新节点，它的出边本来就空——用户看的是「父节点指向它的边」。这轮 UI 改了语义后（`+` 建节点 → 跳过去改名；回退看到父列表）等真机再判。
- **工程推云有洞（顺手抓的）**：本地 200ms 落盘 `session.flush(false)` 清了 dirty，15s 后 `flush(true)` 见不脏直接不写 → **工程永远推不上云**、顶栏永远「未同步」。修 = `flush(push, {force})`，推云时 pushPending 就再交一次字节（同内容同字节）。测 `project-session.test.mjs`。
- **UI 重做（app 层，greenfield）**：☰ 唯一入口 → 侧栏（`body[data-edges]` 默认 0；宽屏停靠**右侧**、窄屏右侧浮层 + 遮罩）；侧栏顶 = 「书库」「设置」；工程内导航 = 当前节点出边（显示去 `.txt`；占位符虚线）+ 列表末尾「+ 新节点」（第 N 章直接生、边加末尾、跳过去、章节名框全选）；脚 = 分裂选中 / 连接已有… / 谁指向这里 / 下载一份(本机)。**章节名框** `#nodeTitle`（纸面顶部，v0.2.15 `.title` 样式捞回）= 当前节点名，改了即改名（500ms 防抖 / Enter / 失焦；撞名 toast 且不吞；Esc 回显）。顶栏只剩工程名。spawn 不再弹框（名字 = 选中首行前 12 字，撞名退到第 N 章）。行菜单去掉「改名…」。新建工程默认名「作品」。图库 → 书库（含包内几条会露面的文案 override）。系统输入法出汉字不再 toast。
- **家规对账**：ADR-0009 加「修订 2026-09-10」节（显示名 / 末尾 / 检索 1 字 / 第 N 章 / 章节名框）。裸中文 lint 豁免 `src/project/naming.ts`（汉字数字表 = 数据）。
- **验证**：73 测绿；`node tools/ui-audit.mjs` 两尺寸 **35 探针全绿**（含：默认关 / ☰ 开 / 书库 / 作品默认名 / 第一章 / 顶栏不报错 / 无横幅 / 退格 / IME 挂检索框 / + → 第二章全选 / Enter 改名「序章」/ 回退列表无 .txt / spawn 不弹框 + 边在末尾 / 连接已有→占位符末尾 / 一字检索 / 行菜单无改名 / 撞名拒绝 / Esc 回显 / 顶栏改名不重开（845–1411ms，store tryMove 延迟）/ 宽屏右停靠不压纸面 / 刷新回第一章无红条 / 书库卡片 stem）；boot smoke 全过。真机零。
- **v2.0.5（同夜追加）**：user「那么设置和三条杠也应该在右边」→ 顶栏 ☰ 挪到最右（压在右侧栏头上）；设置抽屉改从右侧滑出。探针 +2（☰ 最右 / 抽屉贴右缘）。user「smart save 会 trigger onedrive login 吧？weebpaint 应该是这样的」→ 对齐 WeebPaint `smartSaveAndPush`：已配置未登录 + 在线 → 本地落盘照做 + 弹「去登录 / 暂不」（暂不 = 本 session 防烦旗；离线只提示；本机工程不弹）。顺手把 `onSignIn / onSignOut / lockCryptoNow / 换语言 / 改密码 / 出厂重置 / reload 钮 / idle / SW reload 前` 的 `editor.flushLocal()` 全改成 `flushLocalAny()`（以前工程模式下这些路径**不落盘工程正文**就跳转/重载）。smoke 的 smart save 步改为点「暂不」+ 断言不再弹。
- **v2.0.6（同夜再追加，user 三条）**：①「还是保存会错，刷新之后说文件找不到，我觉得是无地骑士接缝的问题」→ 无头实锤另一根因：**last-open 从来没生效**（editor 写裸字符串、读走 `deviceKvGetJson` → JSON.parse 抛 → 永远 null）→ 每次刷新都开「按名最新的一篇」而不是上次那篇；改名/新建后排序一变就跳到别的稿，若那篇本地无缓存就显「本地没有缓存，云端也连不上」= 「找不到」。修 = 裸读 + 打不开退到最新一篇。无地骑士顺手加固：写回前 query/request readwrite 权限，无手势拿不到 → `LocalWriteDeniedError` → 文案「点保存钮授权」而非裸红条。**「保存会错」本身未定位——需要新黑匣子**。②「ios 不弹输入法键盘」→ 触屏键盘三档 system / none / ascii；触屏非 Quest 默认 system（不设 inputmode）。③「windows 弹侧栏写作区不应位移」→ 侧栏永远浮层不推纸面（删 margin-right）。探针 +1（last-open）、改 1（浮层不动纸面）。
- **v2.0.7**：user「分裂选中 连接已有 指向这里这三个先去掉。我以后觉得有必要了再加 ui」→ 边栏脚只剩本机工程的「下载一份」；Ctrl+Enter 分裂仍在；addLink / backlinksOf 动词留 mode/session 无钮。
- **v2.0.7 追加**：user「0.x 的锁写功能我们不小心丢了」→ 工程也有 per-device 只读保护（顶栏笔图标；与 txt 同一张 `readonly-names` 名单，改名跟着改；只读时正文/章节名框 readOnly、+/边操作/口述全挡）。
- **v2.0.7 深夜追加（user 连珠炮，逐条）**：「分裂选中/连接已有/指向这里三个先去掉」→ 边栏脚只剩本机的书「下载一份」；「0.x 锁写丢了」→ 书也有 per-device 只读（顶栏笔图标，同 `readonly-names`）；「预览图全是 2，不要从名字生成」→ gallery **0.1.2** 加 `ui.tilePlaceholderHtml` 钩子，WXHW 给 `book`（图标库 PENDING 新画，待过目）/ `file`；「第 x 章按语义」→ `nextChapterName` = 已有最大章号 + 1（不数文件）；「z order 系统解决，weebpaint 怎么做的」→ 抄 WeebPaint：`:root` 一张 `--z-*` band 表 = 全仓唯一 z 数字处（`test/z-index.test.mjs` 执法），话筒(page 5) < 侧栏(chrome 10)；「新建节点让你输入名字」→ `+`/分裂都弹名字框（placeholder 提示下一章号，不预填）；「节点的创建/修改时间哪里看」→ 侧栏行小字 = 修改时间，hover = 创建·修改；「回退/进节点侧栏不要自动收」→ 只有 ☰/遮罩/Esc 收；「navigation history 跟着书持久化，不标脏、保存随手捞」→ editor-state `{last, back}`（≤50，ADR-0010 补注）；「zip 不叫工程叫书」「节点叫页」→ 全部用户面文案改（代码标识符不动；graph.json `nodes` 键要不要吃书等 user）；「☰ 左边加号 = 加页」→ 顶栏 `#addPageButton`（书模式）；**删除模型**（user 拍板）→ 行菜单「移出（丢引用）」= 断边，成孤儿则改名 `<前缀>名`（前缀走 i18n：zh `_废-` / en `_dropped-`），**只有这个动作改名**；「彻底删除」只在检索结果里孤儿行的菜单、弹框确认；书里不做 .trash（取代「zip 里加 trash」）；「英文界面不要生成中文名」→ 章节名/孤儿前缀都按语言。探针：44 条两尺寸。
- **v2.0.8/9**：Ctrl+Enter 分裂去掉（「先不要做去奇怪的静默行为」）；**格式吃书** `pages/` + graph.json `pages`（不读旧 contents/ = legacy 拒开，version 仍 1，ADR-0008 清单）；**修改锁跟着作品**进 graph.json `readOnly`（txt 不再有锁、本机名单删）；加页名字框不再提示章号（只有第一页有默认名）。域名 `wxhw.weebpaint.com` 与「pages 是不是最想要的语义」= 报告里给了判断。
- **v2.0.10**：修改锁下沉到工件层（`session.canMutate/assertMutable`，全部改动动词一道守卫 + 系统性测试；UI 只画灰）；第一页默认名 =「作品」（各语言对应词），章节自动命名代码全删；修 v2.0.9 漏网（format 测试排序、txt 无锁探针）。**流程教训**：验证命令不能用 `| grep` 当 `&&` 门（grep 匹配到红叉也返回 0）→ 改成先跑命令再看退出码。
- **v2.0.12**：「新建书要打名字 = consent，不是草稿懒物化」→ 书维持当场落盘；**草稿 lift 成书**：txt 侧栏「把这篇变成书…」→ 正文成新书第一页（页名 = 稿名），书名默认稿名，原稿保留（AI 选的非破坏默认，可翻），加密稿 → 新书自动加密。
- **v2.0.13**：书库窄屏两列（gallery 0.1.3 网格列下限 min(150px, 一半减半 gap) + 宿主 `.gallery-mount` 去掉横向 14px 双层 padding；user「iphone se2 上一行只有一个 card」）。
- **v2.0.14**：场景恢复对齐 WeebPaint（user「书库里面 refresh 时还是会进写作」）：device-kv `last-scene`，书库 open 写 / close 清，boot 末尾看到是书库就叠开书库（稿照常恢复在底下）。探针 +2。
- **v2.0.15**：锁卡串场修（user「一开始是 xxx 是加密稿，然后我开新书之后 editor 还是 xxx 是加密稿」）：书模式 `onChanged` 没重画锁卡，上一篇锁定加密稿的卡一直盖着 → 补 `renderLockCard()`；探针 +3（设密码 / 锁定出卡 / 新建书卡消失）。
- **v2.0.16**：页脚字数统计「N 字 M 词」（user「页脚可以开一个字数统计，xx 字 xx 词，可设置里面 toggle 关」）：`.page-foot` 在纸面正文下、`statsForText`、300ms 防抖、prefs `wordCount` 跟云默认开、设置「阅读」节 toggle；探针 +2。
- **待 user**：域名（见本轮报告分析）；「保存会错」需要新黑匣子；`book` 图标过目。

### v2.1.0 图片页 + 封面纪元（2026-09-10 深夜，user 两圈 grill 拍板；SSoT = ADR-0012 / ADR-0013；edited by Claude Fable 5.1）
- **落地**：`src/image/`（policy / metadata / codec / import-image）+ vendor upng / fflate / jpeg-js；format `Thumbnails/thumbnail.png`（最后 entry）+ `nodeKind`；graph `createBytesNode` / `replaceNodeBytes` / `uniqueNodeName`（hex4）；session `addBytesPage` / `replaceBytes` / `setThumbnail` / `cutIncoming`；mode 图片页视图（`body[data-page-kind=image]`、`#pageImage`、点击切 1:1）+ `addImagePages` / `replaceImage`（扩展名跟字节类型）/ `setThumbnail`；app 单一漏斗 `importImageFiles`（sheet「从图片…」副按钮 + 「保留高清」勾 sheet + 隐藏 file input 多选 / 拖放 / 粘贴 / 替换）、`setCoverFlow`（腰封保留）、`replaceImageFlow`（重算 thumb 比对 = 封面跟着换）；sidebar 图片图标 + 「谁指向这里」入边段「断开」；gallery-host `policy.thumbs`（has = 书、IDB `webxiaoheiwu-thumbs`、尾窗 128 KB）+ 加密 peek 解密 + tile 2:3 + 角标「打开中」；app-store `makePeek` 抽封面；sheets `INPUT_SECONDARY` / `openConfirmSheetEx`。
- **包**：gallery 0.2.0（make-thumb 抽包、png-text、tooltip、tile.aspect）/ 0.2.1（`gal.tile.active` i18n、`thumbs.has`、解锁无封面显占位）。WeebPaint 收货时换掉自家 `renderThumbnailAdaptive`。
- **撤掉的**：edges / dim 属性袋（本 session 提案、user 在树 session 拍板 ADR-0014「灰 = 不在树里，算出来不存」→ 落地前整个拿掉，91 测绿）。
- **验证**：`npm test` 91 绿；`tools/ui-audit.mjs` 图片页整链探针（进门两张 / 视图 / 封面 / 替换 / 断入边 / 拖 txt / 粘贴位图 / 书库 2:3 三列 + 封面缩略图 + 角标）；boot smoke；bundle 581 → 646 KB。真机零。
- **待 user**：腰封写入口（ADR-0012 §3 说先不做 UI）；「设为封面」图标（先文字钮）；心跳 a/b/c（已批未排期）；v2 树 schema 由树 session 接（handoff `20260910-v2-tree-schema-handoff.md`）。
- **无头复现脚本**（tmp/，不进 git）：`tmp/repro-2026-09-10.mjs`（刷新 → spawn → 连边 → 改名 → 再刷新）、`tmp/repro-rename-gallery.mjs`、`tmp/repro-rename2.mjs`。

### v2.1.1 主干树纪元（2026-09-10 深夜，树 session；SSoT = ADR-0014，活的清单 = `20260910-v2-tree-schema-handoff.md`；Claude Fable 5.1）
- **格式**：graph.json `version: 2`，顶层 `tree: TreeNode[]`（`string | { name, children }`）+ `pages`；`version !== 2` 一律拒开（>2 too-new 只读不覆盖、<2 not-project），**LEGACY_DIR / nodes 键 / `legacy` 结果全删**（user「legacy 不用分支代码」）。宽容读：tree 重名 → corrupt；tree 名字无文件 → 丢 + warning（孩子提到它的位置）；links 悬空 → 丢 + warning；graph.json 缺 tree → 空树 + warning。严格写：pack 只写有文件的页 / link / 树名，`{ name, children: [] }` 折成字符串。占位符废止：`link()` 到没有的名字 = 抛；`session.jump` 到没有的名字 = 抛（不再生文件）。
- **graph.ts 树操作**（纯函数、只改 `p.tree`，links 一字不动）：`inTree / treeParent / treeSiblings / treeChildren / treePath / dfsOrder / dfsPrev / dfsNext / moveUp / moveDown / outdent / indent / detach（返回拿掉的子树）/ attachAfter / attachUnder / attachAtEnd / insertSibling / insertChild / exportSubtree`；`renameNode` 重写 tree + editor-state.back；`deleteNode` 不留悬空（断掉指向它的边、树里拿掉孩子提上来）；**孤儿 = 不在树 + 无入链**（树也是引用），`dropRef` 只在「这一断让它成孤儿」时改名 `_废-`，移出树不改名。
- **session 动词表**：`treeUp / treeDown / treeOutdent / treeIndent / treeDetach / archiveAfter / archiveUnder / archiveAtEnd / newSibling / newChild`（相对当前页；散页上 `newSibling` 抛）；查询 `neighborhood()`（current / inTree / parent / siblings / children / links / incoming / prev / next）、`pathOf / isInTree / order / exportBranch`；`sidebar()` 现在只是 links 名单；全部改动动词仍经 `assertMutable` 一道守卫（测试逐个验 LockedBookError）。`create()` 的第一页 = 树的第一个节点；`open()` 没记位置 → 树首。
- **UI**：侧栏 = `..`（父页可点；顶层 = 书名不可点）→「兄弟」块（当前高亮）→「+ 加兄弟页」→「子节」块 →「+ 加子节」→「链接」块 →「谁指向这里」；散页 = 「散页」说明 + 链接 + 「+ 加子节」（= spawn 链出去）。行菜单：树行 = 上移 / 下移 / 升级 / 降级 / 移出树 / 导出这一支…；链接行 = 上移 / 下移 /（目标是散页且当前在树里时）归档到这页之后 · 之下 / 移出（丢引用）；入边行 = 断开；检索里的孤儿 = 彻底删除。不能改时（修改锁 / 加密未解锁 / 太新）改动项全灰，导出仍可用。顶栏「+」= 菜单（加兄弟页 · 加子节 · 从图片…）。纸面页脚 `#pageNav` 上一页 / 下一页（DFS；首尾灰、散页灰；靠左，右边留给话筒——ui-audit 抓到过遮挡）+ Alt+↑ / Alt+↓。「导出这一支…」= sheet 问名字 → 存进书库（txt，撞名 hex4）或下载一份（无地的书只有下载）。
- **i18n**：删 `edge.stub` / `edge.newNode*` / `project.legacy`；加 `edge.parentTitle / root / siblings / children / links / addSibling / addChild / add*Hint / outdent / indent / detach / archiveAfter / archiveUnder / exportBranch / moveNoop / detached / archived / alreadyInTree / noSuchPage / export* / prev / next / pageNav / loose / noLinks`。
- **验证**：`npm test` 104 绿（format：v2 往返 / 拒 v1 / 重名 corrupt / 悬空丢 + warning / 写出绝不悬空；graph：六个移动的边界 / detach 后 links 不变 / rename 重写 tree / DFS 首尾无环 / insert* / export；session：readOnly 下 22 个改动动词全 LockedBookError）；build / lint / smoke 全绿；`node tools/ui-audit.mjs` 两尺寸 **202（1280×800 102 + 400×800 100） 探针全绿**（新增：`..` 顶层不可点 / 无第三层 / + 兄弟 / 顶栏 + 菜单 → 子节 / `..` 可点 / 降级·上移·升级·到头 no-op / 页脚 prev·next 首尾不绕回 + Alt+↑ / addLink 到没有的页被拒 / 移出树不改名 → 孤儿菜单 / 链接行归档回来 / 只读下树菜单全灰 / 狗粮书：3 层树侧栏仍两层、next 走完 41 页不绕回、跨幕顺序、唯一散页无 prev/next、导出正文 = 整本且散页不在、`..` 两级回溯到书根）；四本夹具 `node tmp/migration/verify.mjs` 全 ok 零 warning、两次打包字节相等（与 Python 产物字节不同是 deflate 实现不同，内容逐字节相等）。**真机零**（DOGFOOD.md 1–8 有无头对应探针；9/10 真机）。
- **没做 / 待 user**：版本号——v2 格式吃书，代码先走 patch v2.1.1（家规：bump minor 前先问要不要把之前的 push prod；AI 不提 major）；拖拽（菜单先行）；全树视图 / 孤儿面板 / 计数 / 节点类型 / compile 勾 / 自动归档 / shelf / edges / dim 一律未做（user 已拍板不做）；四本夹具**未上传 OneDrive**（v2 落地前老 app 打不开，现在可以传了——归 user）；下一批 = 落盘 / 推云节律（图片 session 报告转述的 user 拍板，另开 commit + ADR-0015）。

### v2.1.2 书的落盘 / 推云节律（2026-09-10 深夜，树 session 顺手；SSoT = ADR-0015，**出处 = 图片 session 报告转述的 user 拍板**，非本 session 亲耳）
- **a 增量重打**：`Project.rawCache`（WeakMap 字节对象 → 已压缩 entry）+ zip.js `passThrough`（`zipPack` 的 `raw` / `zipUnpackRaw` / `zipReadRaw`）；改一页只重压那一页 + graph.json + editor-state，其余 entry 逐位相同；解包→打包 = 全压字节（同内容同字节不动）；改名 / 搬树零重压。`packProject(p, { stats })` 给测试数。
- **d 切页即落盘**：`mode.jump / goBack` → `flushOnPageChange()`：有挂着的防抖或脏 → 取消防抖立刻 `persist(false)`；推云节律不动（落完照旧排 15 s / 30 s）。`project.pendingLocalSave()` 给探针。
- **b 防抖随体重**：`src/project/cadence.ts` `bookLocalDebounceMs(lastPersistMs)` = clamp(200, 耗时 × 5, 3000)；只量本地落盘；只对书。
- **c 不做**（store 库改动，escalate 归 user 立项）。
- **验证**：107 测绿；build / smoke 绿；ui-audit 两尺寸 204（1280×800 103 + 400×800 101） 探针全绿（+1「切页即落盘」）；四本夹具 verify 全 ok。真机零。

### v2.1.3 顶栏 / 页头 / 侧栏三条 QoL（2026-09-10 深夜，user 三条连发；Claude Fable 5.1）
- **书库顶栏露出云状态 + 刷新**（user「书库刷新和云状态不应跟藏扳手里面，而是外面和菜单里都有吧，当时 weebpaint 也是这么拍板的」）：`#galleryCloudBtn`（`.cloud-btn` 同抽屉头那颗：signedin 蓝勾 / offline 灰断 / out 淡）+ `#galleryRefreshBtn`（只在已登录且在线时露面，WeebPaint `cloudRefreshBtn` 同款）排在「新建」左边；点云图标 = 同一份云菜单（`openCloudMenu(anchor)`：账号行 / 刷新云端 / 锁定 / 断开 或 连接 OneDrive）。刷新 = `refreshCloudNow()`：没登录但在线先 `retrySilentSignIn` 一次 → `drawer.subscribe()` + `galleryHost.refresh()` + `resumeSync()`；云菜单里的「刷新云端」走同一条。扳手 → 设置抽屉不动（抽屉头仍有云图标 / 刷新页面）——「外面和菜单里都有」。
- **侧栏页头「前进」**（user「editor side panel 的导航页既然有 back 了也加一个右箭头呗」）：`mode.goForward / canGoForward`，`#edgeForward` 在 `#edgeBack` 右邻。语义 = 浏览器历史：回退把离开的页压进前进栈，前进把离开的页压回回退栈（不经 `pushBack`），**任何新导航（jump / 加页 / 上下页 / 分裂）清空前进栈**；改名 / 彻底删除同步改前进栈。**前进栈只在内存，不进 editor-state.json**（AI 决定：不改容器格式；user 要跟着书走再加字段）。图标 `forward` = 图标库 PENDING 新画（`back` 精确镜像，待过目，TODO.md 已登记）。
- **上一页 / 下一页搬到章节名两侧 + 话筒让位**（user「上一页下一页和麦克风不应该浪费页脚的空间，上一页和下一页可以放在标题行，用 ⟨ ⟩ 的 svg，然后麦克风也是悬浮的，如果和字数统计挡了可以稍微往上挪一点。因为 quest 屏幕 vertical space is scarcity」）：`.node-title-row` = `‹`(`chevron-left`) + `#nodeTitle` + `›`(`chevron-right`)，chevron 32px 方钮、两端到头只灰不藏（占位让章节名居中）、锁着 / 无书整颗 hidden；页脚 `<nav id="pageNav">` 删（`renderPageNav` 改 hidden 两颗钮）。话筒本来就是 `position:absolute` 悬浮（bottom 14px）；字数统计露着时 `.page-foot:not([hidden]) ~ .mic-button { bottom: 52px }`（退格钮 56px）——量过 800px 高时页脚带 24–47px，14px 会压住。chevron 两枚 = 图标库 PENDING 既有（fable 为 WeebPaint 参考窗画的，未过目；TODO.md 加了 WXHW 用量）。
- **验证**：107 测绿；build / smoke 绿；`node tools/ui-audit.mjs` 两尺寸 **224 探针全绿**（1280×800 113 + 400×800 111；每尺寸 +10：书库云钮 out 态 + 刷新藏 / 云钮开菜单有 OneDrive / Esc 关菜单书库仍开 / 话筒在页脚字数上方不相撞 / chevron 与章节名同行且页脚 nav 不存在 / 回退后前进亮 / 前进回序章 / 再回退 / 新跳转清前进栈 / 回退落作品；navState 改看 `#pagePrev.hidden`）；api 重打。真机零。
- **待 user**：`forward` / `chevron-left` / `chevron-right` / `book` 图标过目；前进栈要不要跟着书持久化。

### v2.1.4 删除模型改写：引用计数整个删掉（2026-09-10 深夜；user「不同意引用计数，那又是 cleverness. 删除是一个不同的语义」，迁移 session 转述；SSoT = ADR-0014 §8）
- graph：删 `isOrphan / dropRef / purgeOrphan`；加 `detachToLinks`（移出树 = 子树边降级成 links，不改名）/ `discard`（`_废-` + 子树出树子节同改名，撞名 hex4，任一语言前缀不再套）/ `purge`（只对 `_废-`，deleteNode 清入链，返回被移除的来源）。session：`treeDetach` 改返回改成链接的页数；`discard(target, prefix, prefixes)` / `purge(target, prefixes)`；守卫 22 动词逐个验。mode：`discardPage / subtreeCount / isDiscarded / purgePage / lastDetached / lastDiscarded / backlinksOfPage`；彻底删除时 back / forward 栈都过滤目标。
- 侧栏行菜单：树行 + 废弃；链接行 = 上移 / 下移 / 归档… / 断开链接 / 废弃；检索里 `_废-` 页 = 彻底删除（sheet 写明 N 页链接到它）；废弃弹 sheet「废弃「x」及其 N 个子节」。i18n 删 `edge.drop / orphanPrefix / dropped / droppedOrphan / notOrphan`，加 `edge.unlink / unlinked / discardPrefix / discard* / purgeMsg(NoLinks) / notDiscarded / detached(Leaf)`。
- 验证：111 测绿；ui-audit 两尺寸 232（1280×800 117 + 400×800 115；基线 224 + 8） 探针全绿（移出树带子节 → 链接 + 不改名 / 未废弃散页无菜单 / 断开链接不改名 / 废弃 sheet 子节数 / 废弃后两页 `_废-` 出树、结构留成链接 / 彻底删除 sheet 入链数 + 清入链）；四本夹具 verify 全 ok。真机零。
