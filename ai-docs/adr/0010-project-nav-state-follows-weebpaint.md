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
