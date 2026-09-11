# ADR-0013 图片页 + 进门减肥漏斗（2048 / 高清 4096 / 剥 metadata / EXIF 方向烤像素 / GIF 直通）
> created 20260910 · by Claude Fable 5.1 (claude-fable-5-1) · status: accepted（user 2026-09-10 两圈 grill 逐条拍板；出处 = 本日「wxhw v2 image thumbnail specs」session。翻案 ADR-0008 §5「2.0 不做图片节点」）

## 决定
1. **图片页 = `pages/<名>.jpg|jpeg|png|webp|gif`**，和 txt 页同一张 pages 表（links / created / modified），zip 内 STORE。显示名照显扩展名（ADR-0009 修订）；页名框只显 stem，**扩展名锁死**（改名不能把图改成 .txt）；`nodeKind` 只看扩展名（txt / image / other）。**GIF 是动图**（user「00 后 10 后写轻小说的时候会丢动图 gif 就是动图的意思。你我再嫌弃也留一个这个口子」）：原字节直通、不解码不重编码、`<img>` 自然会动；> 2 MB 弹二次确认 sheet（user「不设线只提示体重二次确认，2MB 就胖」）。
2. **单一漏斗** `src/image/import-image.ts`（文件选择 / 多选 / 拖放 / 粘贴 / 替换图片都走它；抄 WeebPaint `addReferenceImage` 的单入口）：
   - 类型看**魔数**不看扩展名 / MIME（never trust）；不是四种之一 → 拒收 toast。
   - **长边 ≤ 2048** → 原字节只**剥 metadata**（JPEG APP1…APP15 与 COM，保 APP0 / APP2 ICC / APP14 Adobe；PNG tEXt / iTXt / zTXt / eXIf / tIME；WebP EXIF / XMP + VP8X 旗；GPS 一起走。user「剥干净隐私小图没必要重新编码」）。
   - **长边 > 2048** → 等比缩到 2048 + 白底 + JPEG q85（WeebPaint 参考图同款 q）；压完反而更大 → 保原（剥过的）。「保留高清」勾（加图 sheet 里，默认不勾，跟着这一次选择）→ 上限 4096（user「看地图需要高清同意。二次元插画也不能太糊…支持导入高清大图」）。2048 = WeebPaint 大图 guard 的数，**1536 是 AI 发明的、无出处、作废**。
   - **EXIF 方向 ≠ 1 的 JPEG 即使小也重编码**把旋转烤进像素（剥掉方向字段又不烤 = 照片躺倒）。
   - 管线家规抄 WeebPaint（user「weebpaint 管线如果不贵就可以」）：解码边界 = 浏览器 `createImageBitmap` + canvas **读出一次**（`src/image/codec.ts` 是 app 唯一的 canvas 点）；重采样 = gallery 包 `areaResampleRgba`；编码 = vendored jpeg-js（22 KB）/ UPNG（48 KB）+ fflate；bundle +65 KB（单文件 bundle 无 code-splitting，「惰性」只是 `import()` 语法）。
3. **命名**：有名保名（扩展名以真实字节类型为准，重编码成 JPEG 的跟着变 .jpg）；撞名 **`名-hex4.ext`**（user「撞名加 hash，我最讨厌 123 这种的序号焦虑。如果是四位数 hash 就不会 pile of shame」；**txt 稿与书的撞名同改 hex4**，`doc-model.collisionCandidate`）；粘贴位图无名 → `yyyymmdd-hex4.png`。进门撞名**不走**「撞名 = 链接」（ADR-0009 §6 是给打字建页的；新字节不是同一页）。
4. **进门后** = 当前页末尾长一条边、跳到最后一张（同加页手感）；状态行「已加入 N 张（已压缩 A → B）」不弹框；多选一次进 N 张。拖放 / 粘贴同漏斗：书模式 txt = 新页（内容 = 文件）、图 = 图片页；txt 模式 txt = 新稿、图 = toast「先把这篇变成书」。
5. **图片页视图**：textarea 让位给 `<img>`，contain、**永不放大**（user「如果超框就缩小 to fit…小图不要放大，不然 jumpscale」），点击切 1:1 滚动看细节；双指以后。话筒 / 字数统计隐藏。动词 = 改名（页名框）/ 移出（父页行菜单）/ **设为封面** / **替换图片**（user「也许需要替换图片，毕竟我们是一个 graph，删了再建太疼」：保名保边只换字节，字节类型变了扩展名跟着变，封面判定见 ADR-0012 §5）。
6. **入边可断**（user「显示入度的时候需要加一个删除入度边的功能，这样整理起来才舒服」）：侧栏「谁指向这里」段（有才显示）行菜单「断开」= `session.cutIncoming(from)` 纯 unlink，**不走**「移出」的孤儿改名（你正站在这页上）。与 ADR-0014「links 只管指向」一致。
7. **体重**：不做总重机制；等 store 的 async 上传（夏音.ora 5 MB 逼出的同一需求）与书心跳重设计（user 已批三方向：脏页增量重打 / 本地节律随体重放缓 / async 上传合并；换页 = 触发本地落盘不触发推云）。

## 否决
- 面积上限 1024²（WeebPaint 参考图的数，是给画画当参考的）；1536（无出处）。
- 全部 4096 不给勾（减肥机制是 user 要的，勾是最小的口子）。
- canvas.toBlob 编码（家规「字节进出不走 canvas」；WeebPaint 全字节管线已是先例）。
- 图片不进书 zip 靠 links 引用（打破「也一起打包拉倒」）。
- 酒馆卡文本块白名单（user「现在不做不支持，以后归 gallery」）。

## 后果
- ADR-0008 §5 两条作废、§6 STORE 分派开始真的有图；ADR-0009 §6 补「进门撞名 hex4」、§7 改名保证补「扩展名锁死」。
- `test/image.test.mjs`（嗅探 / 政策矩阵 / 三种格式剥离 / EXIF 方向 / 进门页名 / UPNG 真编码）；`tools/ui-audit.mjs` 图片页整链探针。
- 图标：图片页行首 `image`（库已有）；「设为封面」暂用文字钮，图标需求未登记（v1 先不加图标）。

## 修订 2026-09-10 深夜（加图片的落点；edited by Claude Fable 5.1；见 ADR-0014 §8）
- §4「进门后 = 当前页末尾长一条边、跳到最后一张」改：user「加图片没说清楚是兄弟还是孩子」→ 名字框（加兄弟页 / 加子节的 sheet）里的「从图片…」= **先选位置再选来源**：兄弟 = 当前页之后、子节 = 当前页孩子末尾；多选依次排在同一位置之后，保持文件顺序；页名 = 文件名（撞名 hex4 不动）。顶栏「+」菜单只剩 加兄弟页 / 加子节。
- 拖放 / 粘贴没有位置选择：在树里的页上 = 当前页的子节末尾；在散页上 = 从当前页链出（维持现状）。这条默认是迁移 session 定的、user 未反对。状态行改说进了哪（「已加入 N 张图片，作为「x」的子节」+ 压缩信息）。
- 漏斗 `importImageFiles` 签名不动（拖放 / 粘贴 / 替换都走它）；`session.addBytesPage` 仍只建页 + 一条边，进树在 `mode.addImagePages(items, { as })` 上层挂；「设为封面」与替换图片（含 ADR-0012 §5 封面跟着换的字节比对、vendored UPNG 量化起点固定）不变。
