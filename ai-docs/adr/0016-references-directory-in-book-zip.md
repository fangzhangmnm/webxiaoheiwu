# ADR-0016 参考窗进书：`.webxiaoheiwu/references/` 目录（第四类 entry）+ 链接卡指向书里的页 + 窗口状态进 editor-state
> created 20260929 · by Claude Fable 5.1 (claude-fable-5-1) · status: **accepted**（user 2026-09-29「库可以bump，然后2应该没问题，然后可以merge」——「2」= 本 ADR；库 0.3.0 同日发）。出处 = 家族根仓 `ai-docs/20260929-reference-window-tech-plan.md` §4 / §9 / §10 与同日讨论记录；user 原话见下。

## 背景
- 家族共享库 `@internal/reference-window`（2026-09-29 出生，0.2.0 定目录制契约：`.<app>/references/manifest.json` + `r<i>.<ext>`；WeebPaint 已按 format 3 接上）。user：参考「从来都是跟着文档走」、「不做 sidecar」、去掉「只在这次有效」、「不认识的卡原样带着、保存时原样写回」。
- user 2026-09-29「aha，wxhw里面reference window能不能link图片页和文字页，就像weebpaint的preview一样，这样一个立绘只用存一次，然后参考设定也可以落盘！」——库 0.3.0 加了文字卡与链接卡（`bytes` 空、`target` 有值，内容由宿主 `linkProvider` 现取）。
- user 2026-09-29「+里面去pull蛮akward的…我们可以在页面上加一个send to reference的功能」——推模型：从页那一侧发到参考窗，参考窗自己的 ＋ 不做「从书里选一页」。
- ADR-0008 §3 定了书 zip 的三类 entry（graph.json / pages/<名> / .webxiaoheiwu/editor-state.json）+ ADR-0012 封面 `Thumbnails/thumbnail.png` 恒最后。本 ADR 加第四类。

## 决定
1. **第四类 entry = `.webxiaoheiwu/references/` 整个目录**（`manifest.json` + 字节文件 `r<i>.<ext>`）。codec（`src/project/format.ts`）对目录**零知识**：读 = 前缀匹配全部原样装进 `Project.references: Map<path, Uint8Array>`（不进 `nodes` / `contents`，参考不是页）；写 = 库给什么写什么、顺序照库的；路径不在目录下 = 编程错误响亮拒。zip 顺序：graph.json → pages/ → references/ → editor-state → 封面（封面仍恒最后）。
2. **清单归库**（深模块窄接口）：manifest.json 有自己的 `version`（现 1）与迁移链，宿主不解释；清单比库新 → `DeckManifestTooNewError` → **整个目录原样带着、保存时原样写回、状态行如实说**（`ref.tooNew`），不吞不猜。
3. **graph.json `version` 不动（仍 2）**。理由：旧版 app 打开带参考目录的书 = 目录被忽略（读端只认三类 entry），**重存时目录丢**——这是「旧版不认识新东西」的常态，不是吃书；zip 里的页、树、links 一个字节不变。备选（否决）：bump 到 3 让旧版拒开——代价是同一本书在没升级的设备上打不开，只为保住参考目录，得不偿失。
4. **链接卡 = `target: "page:<页名>"`**，字节不进目录（立绘只存一次）。宿主 `linkProvider` 从 `session.project.contents` 现取（mime 按扩展名）；页改了（`commitTextarea` / `replaceImage`）→ `deck.invalidate`；页改名（`commitTitle` / 废弃 `_废-` / 替换图片换扩展名）→ `deck.setTarget`；彻底删除 → invalidate → 取不到 → 卡上写「这一页已不在书里」（`ref.linkMissing`）。
5. **脏的口径**：加 / 删 / 挪卡 / 改 target = 正经改动（`mode.noteReferencesChanged` → 标脏 + 本地落盘节律 + 推云）；翻页 / 滚动 / 字号 / 窗口开关与位置 = 随下次保存写、**不标脏**（同 ADR-0010 的 `{last, back}`）。
6. **窗口状态进 editor-state**：`EditorState.refPanel?: { open, left, top, width, height }`（user「位子的状态和内容一样重要」）；缺省不写、坏值当没有。
7. **入口**（推模型）：侧栏顶部第四个入口「参考窗」（只在书模式露；txt 稿没有装参考的地方）= 开 / 关；每条页行菜单 + 顶栏「+」菜单末尾「发到参考窗」（锁着的书一样灰）；同一页再发 = 翻过去不重复加。参考窗自己的 ＋ 只剩「导入文件…」「粘贴」（`no-cloud`）。
8. **导入漏斗**：图片走 `src/image/` 同一条减肥管线（长边 ≤2048、JPEG q85、剥 metadata；ADR-0013），文字（`.txt` / `.md` / `text/*`）原样。压缩政策是宿主的，库不压。
9. **接缝**：`src/reference-host.ts` = WXHW 里**唯一**值级 import 那个库的文件（`test/redline-guard.test.mjs` 守）；库永不碰本地存储 / 网络（库仓自己的守卫）。图标从共享 sprite 克隆（`paste` `picture-in-picture` `one-to-one` `check` 本轮新取）。

## 否决 / 不做
- sidecar / hash 池（家族级否决，见技术方案 §4）；txt 稿的参考（没有容器，做了就是「只在这次有效」）；参考窗里「从书里选一页」的拉模型；音 / 视频卡（第 5、6 步，另议）。

## 后果
- 目录表（一本带两张链接卡 + 一张导入图的书）：`graph.json` · `pages/….txt` ×2 · `.webxiaoheiwu/references/manifest.json` · `.webxiaoheiwu/references/r2.png` · `.webxiaoheiwu/editor-state.json` · `Thumbnails/thumbnail.png`。链接卡不占字节文件（`r0` `r1` 不存在，编号照卡序）。
- 增量重打（ADR-0015）照旧：没改的参考 entry passThrough；改了清单只重压清单。
- 顺手抓到并修掉的老 bug：**废弃当前页会在 200 ms 后被静默撤销**——`discardPage` 改名后章节名框没回显 `_废-` 名，落盘的 `commitEditor` 把旧名当改名落回去（`mode.ts` discardPage 末尾补 `syncTitle()`；`npm run e2e:ref` 盖着）。
- 测试：`test/project-format.test.mjs`「参考目录」四条；`test/redline-guard.test.mjs` 接缝；`npm run e2e:ref`（真 app + 假云两台设备 24 项：两处入口、改页 / 改名 / 废弃 / 彻底删除、editor-state、推云再开、导入 png、清单 v99 原样带回）；`npm run e2e:sync` 53 ✓；`tools/ui-audit.mjs` 两条预期改成含「参考窗」。真机零。
