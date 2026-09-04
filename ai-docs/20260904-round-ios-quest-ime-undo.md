# 2026-09-04 轮总结：zen 顶栏 · 内置输入法收口 · undo 根因 · iOS/Quest 真机回报
> created 20260904 by Claude Fable 5.1 · as-of v0.2.14（main 已推 dev；prod 仍 v0.1.9）
> 读者 = 下一个接手的人/模型。每条都标了出处（user 原话）和落地版本；「待验」= 真机没跑过，别当已修。

## 0. 一句话

一天之内 v0.2.6 → v0.2.14 九版，全部 tsc / 单测 / 构建 / boot smoke 绿、关键项截图看过。主线：顶栏 zen 化、内置 RIME 收口
（简繁 / 引号 / 标点 / 双拼回滚）、**undo 根因修复（text-edit 深模块）**、iOS 出血线与双击放大移植 WeebPaint、Quest 焦点与锁稿护栏、
smart save 钮。**明确不做**：密码框输入代理；**parked**：app 内软键盘（含 Quest，需人体工程 grill）。

## 1. 版本台账（每版一行，细节看 git log）

| 版本 | 内容 | 出处（user 2026-09-03/04 原话） |
|---|---|---|
| 0.2.6 | 触屏键盘选项（device-kv `softKeyboard` none/ascii → `inputmode=email` + beforeinput 合成按键路由）；设置钮上顶栏 | 「现在做，顺便设置放在三条杠旁边」 |
| 0.2.7 | zen：标题进纸面、撤字数、干净态留白、IME 只剩「中/英」一字；状态双通道（顶栏粘性态 `setState` / 纸面底 toast `setStatus`）；写字线（synced `ruledLines`）；新建菜单（稿/加密稿/文件夹）；行内锁挪到云 badge 左；修每句语音都报「加载模型中」 | 「帮我 zen mode 一点」「显示一条条的写字线」「新建文件夹收到新建里面」「锁放在云图标左边」「还是需要个让用户看见状态 toast 的地方」 |
| 0.2.8 | 简/繁设置（synced `imeSimplified`，每次起组字前重申 `set_option`）；关 emoji 候选；RIME RPC 通道严格串行（协议无请求 id，并飞即错位）| 「quest 输入法拼命出繁体，简繁开关也加一下」 |
| 0.2.9 | Quest「键盘不在本页」提示 + 页内任意处敲键回编辑器；语音模式退格钮（stopgap「退」，图标库 TODO 已登记 `backspace`）；系统组字收编不撤字；话筒锁/只读态改灰 | 「lost focus 的意思是键盘打字键没有路由到 app…空格 vrchat 里跳起来了」「纯鼠标语音模式可能需要一个退格键」 |
| 0.2.10 | 锁卡护栏：锁着/用别的密码/不可用的稿，纸面盖卡 + 解锁…/重试/新建稿；锁态 textarea 真 readOnly | 「0.2 还是先做个护栏吧，不然坑人」（前因：「无法输入和没有语音图标还是因为没有解锁密码导致的煤气灯」） |
| 0.2.11 | **回滚**双拼零声母重写；反引号→「·」；引号样式设置（synced `quoteStyle` 弯/方，打字与语音同用）；扳手回抽屉头云图标旁 | 「不用 patch 了，能不能回滚。我用的原来都是自然码双拼」「引号变成方形的…我觉得设置」「扳手还是收到 gallery 里面吧」 |
| 0.2.12 | **undo 修复**：`src/text-edit.ts`；顺带修换稿漏拼音、boot enabled 竞态、组字中 Ctrl+Z；`~`→「～」 | 「undo 系统有严重 bug，彻查」「波浪号和 windows 一样吧」 |
| 0.2.13 | iOS 出血线：`--top-floor/--bottom-floor` token（移植 WeebPaint ADR-0010）；双击放大：通配 `touch-action: manipulation` + `user-scalable=no` | 「看一下 weebpaint 内耗了三个月刚解决的 ios 出血线的问题，也修」「触屏会不小心双击放大」 |
| 0.2.14 | 顶栏 smart save 钮（`editor.syncKind`）；iOS 软键盘纸面缩高（`--kb-offset` 进 `.page` height）；触屏键盘文案改诚实 | 「iphone 弹软键盘的时候屏幕没跟上」「为什么没有 smart save button，触屏的时候没法按 ctrl s」 |

## 2. 根因与查证（值得记住的事实）

- **undo**（0.2.12）：textarea 的 undo 栈归浏览器；`el.value = …` / `setRangeText` 是程序改值，Chrome/WebKit/Firefox 一律清栈。内置 IME
  默认开后每提交一个词清一次 → Ctrl+Z 形同虚设（无头复现：提交后 Ctrl+Z / Ctrl+Shift+Z 全无反应）。唯一保栈的口子 =
  `execCommand("insertText"/"delete")`（已废弃但三家都在，textarea 无替代）。**规矩：程序性改字只准走 `text-edit.ts`**，
  失败回退 setRangeText（丢一步 undo，不丢字）。语音落字时编辑器若没焦点走的就是回退。
- **双拼零声母**（0.2.9 做、0.2.11 回滚）：RIME 微软/ABC/加加方案零声母只认 o 引导或 aa 双写；自然码/小鹤原生收 ai an ao ei en ou
  但不收 a e o ang eng。方案层改不了：wasm 里的 librime 重编 prism 要 `luna_pinyin.dict.yaml` 源，包里没有（探针实测 deploy 报 source 不存在）。
  JS 层状态机做过、五方案键表探针逐条验证过（git `29d83bf`），user 用自然码不需要，回滚。要再做，从那个 commit 捞。
- **RIME RPC**（0.2.8）：my-rime worker 协议没有请求 id，靠「下一条 success/error」配对，两路并飞就错位（smoke 抓到：微软双拼拿到上一条的
  候选、五笔空）。通道严格串行；任务级原子性另有 enqueue。`resetComposition` 只清 JS 态会让下一击接在 worker 残留拼音后面（zhe→「zhezhe」）。
- **Quest 繁体**：本机 simplifier 正常（t2s.json 在 rime.data 里）、备用拼音表也是简体；Quest 首次异步部署完刷新会话把开关打回方案默认。
  不赌会话状态：每次起组字前重申 `set_option`（一次 ccall）。
- **Quest「无法输入 / 没话筒」**：user 实锤是锁着的稿的煤气灯，不是回归（我一度当回归修了系统组字收编——那刀保留，不撤字只会更稳）。
- **Quest 系统焦点跑去 VRChat**（放下手柄后空格在 VRChat 里跳）：系统层，app 拦不住。能做的 = window blur 时页面变淡 + 顶部一条提示，
  focus 回来 / 页内任意处敲键自动回编辑器。**blur 在 Quest 上是否真触发未验。**
- **iOS 英文键盘**：`inputmode` 只改布局（多个 @ 键）不改语言，弹的仍是当前中文键盘（user iPhone 实测）。唯一能强制英文的是密码框
  （secure text entry）→ 要做「输入代理」子系统（隐藏密码框持焦点、按键路由回编辑器、光标/选区/退格/标点全接管、压自动填充条）。
- **iOS 出血线**：WeebPaint ADR-0010 结论 = 顶部死区（iOS 18 横屏顶边 / iPadOS 26 窗口控制钮）**无 web API**，官方约定只有 safe-area；
  地板 = `max(env(safe-area-inset-top), 20px)`，只在 standalone 生效，全仓一个出处。iPadOS 26 窗口模式左上角的控制钮会盖 ☰，无解。
- **闲置锁屏 vs WeebPaint**（只查未改）：小黑屋 = 2 分钟遮罩 + 点任意处先查云再放行（ADR-0017 store 分册的 idle⇒lock 原案）；WeebPaint
  没有闲置遮罩，只在回前台时对干净稿静默快进，密码永不自动忘。

## 3. 决策记录（user 拍板，别再 re-litigate）

- **密码框输入代理：不做**（「那么先不用密码框，先就这样」2026-09-04）。触屏键盘选项保留现状 + 诚实文案。
- **app 内软键盘：parked**（「以后可以做软键盘，quest 也能用，但是需要人体工程 grill，parked」）。开工前先 grill 人体工程（键位/尺寸/单手/手柄射线），
  不是先写码。
- 双拼零声母重写：**不要**（回滚）。自然码原生够用。
- 引号样式 = 设置项不是快捷键（「我觉得设置」）。设置扳手住抽屉头云图标旁（顶栏方案已否）。
- 0.3 = 无地骑士对齐 + 连接别的库（`20260904-0.3-knight-and-store-backlog.md`），待「没问题」。

## 4. 新持久化字段（报备）

synced prefs：`ruledLines`（bool，缺省开）、`imeSimplified`（bool，缺省简）、`quoteStyle`（curly|corner）；device-kv：`softKeyboard`（none|ascii）。

## 5. 待 user 真机

Quest：简体是否已好、~~「键盘不在本页」提示会不会亮~~（提示条 + 压暗 v0.2.17 撤，user 2026-09-04「光标失踪了我看得到，这里没有煤气灯的疑惑」；焦点静默找回保留）、锁卡。iPhone：键盘缩纸面手感、smart save 钮、出血线地板。iPad：ASCII 键盘只是「弹系统键盘」。

## 6. 图标库

新增需求一枚：`backspace`（stopgap 烤「退」），已登记 `20260708 SVG Icons/TODO.md`。
