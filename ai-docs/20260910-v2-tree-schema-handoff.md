# 2026-09-10 handoff：实现 schema v2（主干树 + link）——给下一个 app session
> as-of v2.0.16 工作树 / 2026-09-10 深夜 · created 2026-09-10 by Claude Fable 5.1 (claude-fable-5-1)。**SSoT = ADR-0014**，本文只是把它翻成活。图片 / 缩略图那条线归隔壁「wxhw v2 image thumbnail specs」session（ADR-0012/0013，2.1.0），先读它的未提交改动再动 `format.ts`，别互相覆盖。

## 0. 一句话
graph.json 换 v2：顶层 `tree`（嵌套数组，一页至多一个父亲，成员可选）+ `pages[名].links`（指向）。链表、占位符、`edges`/dim 全删，legacy 零分支。上一页/下一页 = 全树前序 DFS；侧栏只画当前页的邻域（`..` / 兄弟 / 孩子 / links）。

## 1. 交付清单（按依赖顺序）
1. `src/project/format.ts`：`ProjectGraphJson` v2（`tree: TreeNode[]`，`TreeNode = string | { name: string; children: TreeNode[] }`；`NodeMeta = { links, created, modified }`，删 `edges`）。`PROJECT_FORMAT_VERSION = 2`。解包：`version !== 2` → `too-new`（>2）或 `not-project`（<2 / 旧键），**删 `LEGACY_DIR` / `nodes` 分支**。tree 校验：重名 → `corrupt`；名字无文件 → 丢 + warning；links 悬空 → 丢 + warning。打包：`tree` 原样、pages 只写有文件的页。
2. `src/project/graph.ts`：删 `isStub` / 占位符相关；`createNode` 保持「撞名 = 返回已有」；新增树操作（纯函数，无 DOM，全部只改 `p.tree`，不碰 links）：`treeParent(name)`、`treeSiblings(name)`、`treeChildren(name)`、`treePath(name)`、`dfsOrder()`、`dfsPrev(name)` / `dfsNext(name)`、`moveUp` / `moveDown` / `outdent` / `indent`（降级 = 进到上一个兄弟的孩子末尾；没有上一个兄弟 → no-op）/ `detach`（移出树，不删文件）/ `attachAfter(name, anchor)` / `attachUnder(name, parent)`（散页归档）/ `insertSibling(after, newName)` / `insertChild(parent, newName)`（这两个当场 `createNode` 空文件再入树）。`renameNode` 现在还要重写 tree 条目。`exportSubtree(name)` = 子树 DFS 拼接 `readNodeText`，用 `\n\n` 连接（导出用）。
3. `src/project/session.ts`：改动动词表对齐（删「占位生文件」；加 树移动六件 + 归档 + 兄弟/子节新建）；`assertMutable` 一道守卫照旧覆盖全部。
4. `src/project/mode.ts` + `sidebar.ts`：侧栏结构 = 顶部 `..`（父，没有父 = 书根，画成书名不可点或跳到树首）→ 兄弟列表（当前页高亮）→ 孩子列表 → links 列表；**不画整棵树**。行菜单 = 树移动六件 + 归档/移出 + 既有的 link 动作。顶栏或页脚加 上一页/下一页（DFS）。「+」拆成「+ 兄弟」「+ 子节」（都弹名字框、当场建文件）；散页上只有「+ 子节」= 从当前页 link 出去的新散页（引用层，保持现状语义）。
5. `src/project/naming.ts` / `i18n/strings.ts`：删 `edge.stub` 等占位符文案；加 树动作与 `..` 的 zh/en 文案（用户面名词：书 / 页 / 父页 / 兄弟 / 子节 / 链接）。
6. `src/docs.ts` 导出：加「导出这一支」（选中节点子树 DFS → 一个 txt 下载 / 落库，命名归 user 定）。
7. 测试：`test/project-format.test.mjs`（v2 往返、拒开 v1、tree 重名 corrupt、悬空丢 + warning）、`test/project-graph.test.mjs`（六个移动的边界：首/尾/无上一个兄弟；detach 后 links 不变；rename 重写 tree；DFS 顺序与 prev/next 首尾无环）、`test/project-session.test.mjs`（readOnly 下树移动被守卫拒）；`tools/ui-audit.mjs` 加探针：侧栏没有第三层、`..` 可点、prev/next 走完 41 页狗粮不绕回。
8. `scripts/gen-api.sh` 重打 `api/`；`ai-docs/20260910-v2-ui-handoff.md` §4 末尾追加一段状态。版本号：v2 格式吃书 → 给 user 报一句由 user 定 minor / 不定。

## 2. 树操作的精确语义（别各自发明）
- 兄弟顺序 = 数组顺序；`moveUp/Down` 只在同一个 children 数组内交换，到头 no-op。
- `outdent(x)`：x 从父 P 的 children 移除，插到 P 在祖父数组中的位置之后；P 是顶层 → no-op。
- `indent(x)`：x 移除，追加到上一个兄弟 S 的 children 末尾；S 是字符串节点 → 升格为 `{ name: S, children: [x] }`。
- `detach(x)`：整个子树从 tree 拿掉（x 的孩子跟着 x 走，仍挂在 x 下，只是 x 不在树里了——等于 x 变散页并带着它的子树）。页文件、links 都不动。
- 归档：`attachAfter(x, anchor)` / `attachUnder(x, parent)`；x 已在树里 → 先 detach 再放。
- 一页只有一个位置：任何 insert 前先断言它不在树里。

## 3. DFS
前序：自己 → 孩子（按序）→ 下一个兄弟 → 回溯到祖先的下一个兄弟。首尾不绕回（prev 在树首 = null）。DFS 只走 tree，不看 links。散页没有 prev/next（按钮灰）。

## 4. 夹具 = 迁移轮四本书（`tmp/migration/`，不进 git）
`20240718 花璃同人`（30 页，readOnly）/ `20260120 Scifi`（8 页，readOnly）/ `20250127 樱川中学科学部`（15 页）/ `20250216 樱川 AI参考`（41 页，readOnly；3 幕 × 10–12 话，测目录、prev/next、导出）。各自 `.manifest.md` 有树形和时间戳；`build_books.py` 可重生成；`verify.mjs` 改到 v2 后作为回归。**v2 落地前不要上传这四本**（老 app 打不开 v2；新 app 拒开 v1）。

## 5. 与图片 session 的接口
它的 2.1.0 工作树改动（`src/image/`、format/graph/session、vendor fflate/jpeg-js/upng、gallery 0.2.0）先落，本 handoff 在其上做减法：删 `edges` 读写与 `EdgeAttrs`、`version` 1 → 2、`Thumbnails/thumbnail.png` 与图片页规则不动。已用 SendMessage 通知它（2026-09-10）。

## 6. 不要做的（user 已拍板或已否）
全树视图 / 孤儿面板 / 计数；节点类型或 folder 类型；compile 勾选框；自动归档（从正文 link/分裂出去的页不进树）；自动起名；`_废-` 之外任何自动改名；第二本户口本 shelf；拖拽（先菜单）。
