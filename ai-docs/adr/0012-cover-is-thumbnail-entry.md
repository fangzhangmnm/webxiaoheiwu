# ADR-0012 封面 = `Thumbnails/thumbnail.png` 本身；腰封 = 它的 iTXt Description；graph.json 没有 cover 字段
> created 20260910 · by Claude Fable 5.1 (claude-fable-5-1) · status: accepted（user 2026-09-10 两圈 grill 逐条拍板；出处 = 本日「wxhw v2 image thumbnail specs」session。翻案 ADR-0008 §5「2.0 不做缩略图」：user「thumb 和图片页实锤了不是 scope creeping…被逼到了 need 定数据契约 immediately 的级别」）

## 决定
1. **封面是一个 entry，不是一个字段。** 书 zip 里 `Thumbnails/thumbnail.png`（ORA 同款路径；user「封面能不能和 ora 尽量无脑对齐」）就是封面本体：「设为封面」从某张图片页**生成**它写进 zip，之后它和那一页**无关**——删页、改名、移出都不动封面。graph.json **没有** `cover` 字段（user「cover 这个语义不一定需要吧，我们的设计理念本来就是比较 zen，不要帮用户发明字段。就像 python 的字典一样」）。
2. **规格**：PNG，≤256×256，**≤70 KB**（store `getPeek` 尾窗 80 KB 减 central directory 一次命中），**永远最后一个 entry**、STORE（WeebPaint v398 学费：不是最后就会被别的东西挤出尾窗）。生成 = gallery 包 `makeThumbAdaptive`：面积平均重采样、白底拍平、阶梯 256 → 192 → 128，每档先无损后 256 色调色板（插画无损 256² 常 100 KB+，调色板档是本家加的，仍是 PNG 仍是 ORA 路径）；永不放大。
3. **腰封（blurb）住封面 PNG 的 `iTXt` 文本块**，关键字 = PNG 规范标准词 `Description`（UTF-8；`tEXt` 只能 Latin-1，中文进不去）。一次尾读同时拿到封面与腰封；exiftool / 任何看图软件直接显示；加密书锁定态自动藏（尾片是密文）。**代价 = 先有封面才有腰封**（帯要缠在封皮上）。user：「thumbnail.png 的标准 tEXt 文本块。free lunch！做！这个是 gallery 库的公共行为」。gallery 包从 Description 出卡片 tooltip；**写入口 2.1 不做 UI**（user「gallery 加这个功能，我们先不做 UI 入口」），app 层 `makeCoverPng(bytes, blurb)` 已能带。
4. **加密书**：store `crypt.makePeek(plain)` 从明文 zip 抽 `Thumbnails/thumbnail.png` → 库另封成密文 peek 尾片；书库锁着显示锁图标，解锁后 `decryptPeek` 非交互解；零 app 加密代码。txt 稿 / 没封面 → peek 空（仍加密，verifyPassword 靠它验密码）。
5. **替换图片时封面要不要跟着换，不需要字段**：管线确定性 → 把旧字节重算一遍 thumb 和现有 `thumbnail.png`（剥掉文本块后）比对字节，相同 = 这页就是封面 → 重生。
6. **书库**：gallery `policy.thumbs`（fetch = `getPeek` 按名尾读，`has` = 只有书，IDB `webxiaoheiwu-thumbs` 派生缓存，user「weebpaint 不是一直 idb 的吗」= 批）；tile 2:3 竖版书封、窄屏一排三本（gallery 0.2.0 `tile.aspect`）。
   - 0.2.2（图片 session 2026-09-10；edited by Claude Fable 5.1 2026-09-10 代记）：fetch null = 确定没封面，进 IDB 缓存并显示书图标；抛 = 未知，不缓存，只有云端-only 显示云。
7. **「cover 做 root」不是机制**：2.0/2.1 模型里没有 root，也推不出来（任何一章引用了封面图它就不是链头）。ADR-0014 的 `tree` 之后「封面放树顶」也只是排法习惯，封面仍是这个 entry。

## 否决
- graph.json `cover: "<页名>"` 字段（发明字段；页删了字段悬空）。
- 派生封面 = created 最早的图片页（换不了；00 后中途丢的 GIF 管不住）。
- 腰封进 graph.json `blurb`（卡片 hover 要再读一次 graph.json；user「反正不应该在 graph」）。
- JPEG 缩略图（ORA 路径叫 .png，名字不能撒谎）。

## 后果
- ADR-0008 目录清单加 `Thumbnails/thumbnail.png`（最后一个 entry）；§5「2.0 不做」两条作废。
- gallery 包 0.2.0/0.2.1：`core/thumbs/make-thumb`、`core/thumbs/png-text`、tooltip、`tile.aspect`、`thumbs.has`、`gal.tile.active`（WeebPaint 收货时换掉自家 `renderThumbnailAdaptive`）。
- 酒馆卡（`chara` 文本块）不串扰：封面从像素重新生成，来源图的文本块不会被抄过来；进门剥 metadata 会把酒馆卡废掉，user「酒馆卡我们现在确实不做不支持。不用特殊处理」。

## 修订 2026-09-30（graph.json 加 `cover` 字段 = 封面的来源页；edited by Claude Fable 5.1）
- user 2026-09-30「加 cover 字段」「cover字段一起做，这种契约级别的东西越早改越好」。起因 = 导出纪元：长图 / PDF 要印**高清**封面，而 `Thumbnails/thumbnail.png` 只有 ≤256²；user 问「我选中插画页 send to cover art 的时候是做了一个 copy，然后没有对插画页的引用？」——是，§1 当年就是这么定的，现在补上出处。
- **§1 改为**：封面本体仍是 `Thumbnails/thumbnail.png`（快照，规格 §2 不动，书库尾读不动）；graph.json 顶层多一个可选 `cover: "<图片页完整文件名>"` = 「设为封面」时的来源页。**只记出处，不定语义**：thumbnail 不会因为来源页改了字节而自动重生（app 不在用户没叫它的时候自己动）；改名跟着改（同 links / tree）；彻底删除即清（宽容读：悬空 → 丢 + warning；严格写：来源页没文件就不写）。没有这个字段 = 封面无出处（老书 / 来源页已删），长图 / PDF 只印字封面。
- **§5 简化**：替换图片时「要不要跟着换封面」先看 `cover` 字段；老书没有字段才退回字节比对。
- 「否决」里的第一条（`cover` 字段：发明字段；页删了字段悬空）撤销——悬空由 ADR-0014 §3 的宽容读 / 严格写兜住，字段现在有真需求。
- version 仍 2（refPanel / references 同款加法）。比 v2.3.1 老的 app 打开再保存会丢这个字段（它只写 links / created / modified）；目前无此风险（prod 是 v2.2.0 之前只有 0.2.21，开不了 v2 书）。
- 落地 v2.3.1：`format.ts`（`Project.cover` / graph 读写）、`graph.ts`（renameNode / deleteNode 跟随）、`session.setThumbnail(png, source)` / `coverPage()`、app「设为封面」记来源 + 钮态「当前封面」；测试 `project-format` / `project-graph` 各一条；ui-audit 探针。
