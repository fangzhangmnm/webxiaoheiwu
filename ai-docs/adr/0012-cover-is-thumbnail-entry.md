# ADR-0012 封面 = `Thumbnails/thumbnail.png` 本身；腰封 = 它的 iTXt Description；graph.json 没有 cover 字段
> created 20260910 · by Claude Fable 5.1 (claude-fable-5-1) · status: accepted（user 2026-09-10 两圈 grill 逐条拍板；出处 = 本日「wxhw v2 image thumbnail specs」session。翻案 ADR-0008 §5「2.0 不做缩略图」：user「thumb 和图片页实锤了不是 scope creeping…被逼到了 need 定数据契约 immediately 的级别」）

## 决定
1. **封面是一个 entry，不是一个字段。** 书 zip 里 `Thumbnails/thumbnail.png`（ORA 同款路径；user「封面能不能和 ora 尽量无脑对齐」）就是封面本体：「设为封面」从某张图片页**生成**它写进 zip，之后它和那一页**无关**——删页、改名、移出都不动封面。graph.json **没有** `cover` 字段（user「cover 这个语义不一定需要吧，我们的设计理念本来就是比较 zen，不要帮用户发明字段。就像 python 的字典一样」）。
2. **规格**：PNG，≤256×256，**≤70 KB**（store `getPeek` 尾窗 80 KB 减 central directory 一次命中），**永远最后一个 entry**、STORE（WeebPaint v398 学费：不是最后就会被别的东西挤出尾窗）。生成 = gallery 包 `makeThumbAdaptive`：面积平均重采样、白底拍平、阶梯 256 → 192 → 128，每档先无损后 256 色调色板（插画无损 256² 常 100 KB+，调色板档是本家加的，仍是 PNG 仍是 ORA 路径）；永不放大。
3. **腰封（blurb）住封面 PNG 的 `iTXt` 文本块**，关键字 = PNG 规范标准词 `Description`（UTF-8；`tEXt` 只能 Latin-1，中文进不去）。一次尾读同时拿到封面与腰封；exiftool / 任何看图软件直接显示；加密书锁定态自动藏（尾片是密文）。**代价 = 先有封面才有腰封**（帯要缠在封皮上）。user：「thumbnail.png 的标准 tEXt 文本块。free lunch！做！这个是 gallery 库的公共行为」。gallery 包从 Description 出卡片 tooltip；**写入口 2.1 不做 UI**（user「gallery 加这个功能，我们先不做 UI 入口」），app 层 `makeCoverPng(bytes, blurb)` 已能带。
4. **加密书**：store `crypt.makePeek(plain)` 从明文 zip 抽 `Thumbnails/thumbnail.png` → 库另封成密文 peek 尾片；书库锁着显示锁图标，解锁后 `decryptPeek` 非交互解；零 app 加密代码。txt 稿 / 没封面 → peek 空（仍加密，verifyPassword 靠它验密码）。
5. **替换图片时封面要不要跟着换，不需要字段**：管线确定性 → 把旧字节重算一遍 thumb 和现有 `thumbnail.png`（剥掉文本块后）比对字节，相同 = 这页就是封面 → 重生。
6. **书库**：gallery `policy.thumbs`（fetch = `getPeek` 按名尾读，`has` = 只有书，IDB `webxiaoheiwu-thumbs` 派生缓存，user「weebpaint 不是一直 idb 的吗」= 批）；tile 2:3 竖版书封、窄屏一排三本（gallery 0.2.0 `tile.aspect`）。
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
