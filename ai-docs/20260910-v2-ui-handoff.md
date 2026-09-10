# 2.0 UI 接线 handoff：数据层已备好，剩下的是 UX 决定
> 作者：Claude Fable 5.1（claude-fable-5-1）· created 20260910 · as-of dev 0.2.21 + 2.0 数据层（commit 见 git log 2026-09-10）· 69 测绿 · 真机零
> **2026-09-10 晚更新（edited by Claude Fable 5.1）**：user「2 最好你先做吧」→ §2 的六条已按委托落了一版最小 UI（§4），dev = **v2.0.0-2026-09-10**，真机零。
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
- **图库 card view 没换**：抽屉照旧列 txt 与工程两档（`.webxiaoheiwu.zip` 显示为 stem）。`@internal/gallery` 已装未接（第四问的「Gallery+Editor / Editor Only」两模式：Editor Only 这半先落，Gallery 那半下一轮）。
- 顶栏工程模式 = 「工程名 · 节点名」，加密 / 只读钮隐藏（工程整包加密走 store 透明层，UI 后补）。
- 图标：边栏开关暂用 `folder-open` 顶位，真图标需求已登记图标库 TODO。

### 真机清单（Quest / iPad）
1. 抽屉「+」→「新建工程…」→ 顶栏显示「名 · yyyymmdd-xxxx.txt」，左侧边栏出现（iPad 竖屏需点顶栏边栏钮）。
2. 打几行字 → 状态栏「未同步」→ 15s 内推云 → 徽章 synced；OneDrive 里出现 `名.webxiaoheiwu.zip`，7-Zip 打开 = `graph.json + contents/ + .webxiaoheiwu/`。
3. 选中一段字 Ctrl+Enter（Quest 实体键盘）→ 名字框 → 新节点；边栏第一条是它；Alt+← 回来，源稿里那段字没了。
4. 边栏打一个不存在的名字「连」→ 虚线条目；点它 → 生出空节点。
5. 关掉重开 app → 落回上次所在节点（editor-state.last）。
6. 换设备打开同一工程 → 落到上次**保存**时的节点。
7. 「打开本机工程…」Quest 上选一个下载好的 zip → 改字 → Ctrl+S → 文件被写回（FSA）；iPad 上 = 下载一份。
