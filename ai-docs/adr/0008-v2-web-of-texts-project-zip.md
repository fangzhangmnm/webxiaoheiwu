# ADR-0008 2.0 纪元 = web of texts；工程容器 = `<名字>.webxiaoheiwu.zip`
> created 20260909 · by Claude Fable 5.1 (claude-fable-5-1) · status: accepted（user 2026-09-09 grill 逐条拍板；出处 = `journals/discussion with ai/20260909 思维导图软件设计入门.md` + 本日家族根 session）

## 决定

1. **2.0.0 = 吃书 major**（家规：0.x ≡ 1.x，吃书直接跳 2）。吃书点 = 文件列表被砍掉、容器从单篇 txt 换成 zip 工程。不是语音 sunset（user：「语音输入不会破 user expectation 的 backward compatibility，它不改变这个项目 nature」）。名字不改：user「小黑屋只是写手都这么叫……语义只是不搞花活烦你罢了」「web 也是双关」；`webxiaoheiwu` 未被占用，不用 Weeb 韵脚。
2. **工程 = 一个 zip**，文件名 **`<名字>.webxiaoheiwu.zip`**。最后一截 `.zip`：不发明扩展名，任何工具当 zip 开，「对别人来说我们就是一包 zip 的 txt」。中间一截是给**人**看的，不是给软件分类的（user：「不是软件分不清，而是人类不知道是什么」）；用软件全名而非 `xhw` 或类别词（`novel`），因为人看见能整段复制去搜到仓库，且全家唯一。「Windows 恨你我不管」。
3. **目录清单**（硬规则同 WeebPaint：zip 内 entry 增删改名，必须给 user 一份具体文件的完整目录清单）：
   ```
   夏音.webxiaoheiwu.zip
   ├─ graph.json                 清单（ADR-0009）。format / version / wroteWith / nodes
   ├─ contents/                  abandonware 时唯一的东西。扁平，不许子目录
   │   ├─ 夏音-第三次见面.txt
   │   └─ 夏音.txt
   └─ .webxiaoheiwu/             唯一私有前缀（WeebPaint 三前缀并存是它付过的学费）
       └─ editor-state.json      工程内导航状态（ADR-0010）
   ```
   目录名 `contents`：user「abandonware 的时候这个文件夹里面才是东西，其他的都是 metadata……我们这个 graph 只是用来管理的工具，而不是用户产出的内容」。
4. **对 ORA 学什么、不学什么**：学清单在根（graph.json ↔ stack.xml）、私有物进点前缀目录、格式戳 + 写入版本、整包重写、entry 时间戳钉 1980 同内容同字节。不学 `mimetype` entry（自家认自家：根有 graph.json 即是）、不学「id 在清单、文件名派生」（见 ADR-0009）。
5. **2.0 不做**：缩略图（user：「thumb 是花，价值等同于山田妖精老师的插画。有意义。但是不用 2.0 做」；将来加在最后一个 entry，走 store `getPeek` 尾片）；图片节点（「进多媒体时需要卡体重」，卡法抄 WeebPaint 参考图）；zip 内 `.trash/` 或任何历史（事故兜底归 store 回收站/备份，版本归 graph 本身）；编译产物。
6. **编码**：按扩展名分派压缩——`jpg jpeg png webp gif mp4 ora zip 7z` STORE，其余（txt md json）DEFLATE；zip 库 = vendored zip.js，封装抄 WeebPaint `src/backend/zip.ts`，只把「全 entry level 0」改成分派。
7. **加密**：全走 store（`isZip:true`），零 app 加密代码；at-rest 名 = `X.webxiaoheiwu.zip.zip`（store ADR-0012 追加 `.zip`，名字为真：zip 里套 zip，7-Zip → 密码 → `data.bin` 即工程）。**前置**：store 的「加密名 seam」改动（见 `../20260813 internal-store/ai-docs/20260909-request-encrypted-name-seam.md`，user「库点头」），否则第一个明文工程就被当加密容器打不开。
8. **txt 单篇与 zip 工程在图库并存**，不强迫迁移（user：「同时支持 txt 和 zip」）。`crypt.ext` 单值的缺口不值得 sunset txt，正解在库。
9. **无地骑士从 day 1**（WeebPaint 语义：除云外全功能，本地夹库 + 无库模式），**以后宣发**——宣发项目纪律（logging 英文、文案全走 i18n）从 2.0 起算。

## 否决
- `.xhw.zip` / `.novel.zip` 等提示后缀（人看不懂 / 不指路 / 不唯一）。
- `texts/`（jpg 进来名不副实）、`artifacts/`（CI 词，是编译产物的位置）、`nodes/`（把图烤进格式）。
- 每节点一个 links 文件（user：「那个用目录来表示 graph 弄出一大堆小文件的脑残主意我不会欣赏的」）。
- AtlasMaker 的 zip / 加密约定不当参考（远古 opus 写的），一切以 WeebPaint 为准。

## 后果
- ADR-0006 一层文件夹作废（ADR-0011）。
- bump 到 2.0.0 之前，按家规先问 user 要不要把 0.2.x 先 push prod（2026-09-09 已问一次，未答）。
- 计划全貌与顺序见家族根 `ai-docs/20260909-wxhw-2.0-long-haul-plan.md`。

## 修订 2026-09-10 深夜 4（2.1.0 图片页 + 封面；user「thumb 和图片页实锤了不是 scope creeping」；edited by Claude Fable 5.1）
§5「2.0 不做」两条作废（ADR-0012 / ADR-0013）。完整目录清单（as-of v2.1.0；graph.json 内容随 ADR-0014 换 v2，entry 清单不变）：
```
作品.webxiaoheiwu.zip
├─ graph.json                       清单（ADR-0009 / 0014）
├─ pages/                           扁平；txt 正文页 + 图片页（jpg / jpeg / png / webp / gif，STORE；GIF 原字节）
│   ├─ 作品.txt
│   └─ 夏音.jpg
├─ .webxiaoheiwu/editor-state.json  { last, back }（ADR-0010）
└─ Thumbnails/thumbnail.png         封面本体（ADR-0012；ORA 路径）：**永远最后一个 entry**、STORE、≤256²、≤70 KB，可带 iTXt Description = 腰封；没封面就没有这个 entry
```
