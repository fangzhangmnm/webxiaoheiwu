# ADR-0010 工程内导航状态跟 WeebPaint：在 zip 内、随保存写、导航不标脏
> created 20260909 · by Claude Fable 5.1 (claude-fable-5-1) · status: accepted（user 2026-09-09：「Q3 还是和 weebpaint 一样，画布内的视口，摆放，手感调教跟着画布走。外面只知道你上次打开了哪个」）

## 决定
1. `.webxiaoheiwu/editor-state.json` 住 zip 内，装上次所在节点等工程内状态（2.0 只有这一项）。**随内容保存一起写**；纯导航（跳节点、滚边栏）**不标脏、不触发保存、不推云**。查证 WeebPaint：`.weebpaint/editor-state.json` 随保存写，视口平移不调 `markEdited`，只有内容类变动才标脏。
2. zip 外只有一张本机回执条：device-kv `last-open`（WXHW 已有）放 zip 名，**不同步**。
3. device / synced / follow-store 那笔糊涂账先跟 WeebPaint 一起糊涂，不在 2.0 理清。

## 后果
- 换设备落到的节点 = 上次**保存**时的，不是上次跳的。WeebPaint 同款。
- WeebPaint 的 restoreAttempt 开机断路器 WXHW 没有，归云同步加固轮 / 图库库，不在格式里。

## 否决
- zip 内 `state.json` 每次跳都写（journal 里 AI 稿）：每次 jump = 重写整包 + 推云 + 多设备纯因「读」If-Match 撞车。
- zip 外 collection 按工程路径存节点位置（本 session 我的第一提案，JRP catalog 形状）：user 拍板跟 WeebPaint。

## 修订 2026-09-10（edited by Claude Fable 5.1）
- **回退栈也跟着书走**：`.webxiaoheiwu/editor-state.json` = `{ last, back }`（`back` ≤ 50，旧在前，指向已删节点的条目读时丢弃）。同 `last` 的政策：导航不标脏，保存时随手捞（user 2026-09-10「navigation history 是跟着书一起持久化的？…持久化政策和 weebpaint 对齐：viewport, tool 类的都是不 mark dirty，但是 save 的时候随手捞」）。
- zip 目录清单不变（ADR-0008 §3 三类 entry），只是 editor-state.json 多一个字段；旧版读到没有 `back` 的文件 → 空栈。
- 名词：用户面「工程」改叫「书」（user 2026-09-10「zip 不叫工程，叫书」）；代码标识符仍是 project。


## 修订 2026-09-30（editor-state.json 多一个 `lineWidth.charsPerLine` = 这本书的行宽；edited by Claude Fable 5.1）
- 行宽（每行几个字，三档 14 / 20 / 28）**是书的属性**（user「editor state 里面的行宽是跟着书走的吧。这个语义上确实是书的属性」），住 editor-state.json 顶层 `lineWidth: { charsPerLine }`：同 `last / back / refPanel` 一样**随保存写、不标脏**（手动保存 / Ctrl+S 顺手捞会带上）。**编辑器和导出都读它**（user「导出跟编辑器的行宽走啊」）；没有 = 账号默认（synced prefs `charsPerLine`；旧 `readingMode` 两档只当迁移来源 classic → 28、其余 → 20）。设置页「行宽」在书里改 = 改这本书的，在 txt 稿里改 = 改默认。同日早些的 `export.charsPerLine`（导出自己的 knob）撤了，未发版。不进 graph.json：它是偏好不是内容。

## 修订 2026-10-01（editor-state.json 多一个 `exportLineWidth.charsPerLine` = 这本书导出用的行宽；edited by Claude Fable 5.1）
- user 原话：「所以轻小说我写的时候用14来逼对话和节奏，20导出？那么导出是否还是需要一个随着书持久化的另外的节奏选项？还是这样太麻烦了」→（我的建议：只加在导出面板里、默认跟编辑器、选过记进书）→「好，同意。加」。
- `exportLineWidth: { charsPerLine }`（可选，三档 14 / 20 / 28）：长图和 PDF 用它；**没有 = 跟 `lineWidth` 走**（09-30 那条「编辑器和导出都读它」仍是缺省行为）。同 `lineWidth / refPanel`：随保存写、不标脏。两个字段互不依赖（可以只有 `exportLineWidth`）。
- 入口只有导出面板的那条段选；选回和编辑器一样的那一档 = 删掉这个字段。txt 稿没有 editor-state，另选只留到这次打开为止。
- zip 目录清单不变；旧版读到这个字段会忽略、下次保存时丢掉它（editor-state 是整个重写的），不影响内容。
