// 书会话（headless；ADR-0008/0009/0010/0014）：一个打开的 `<名字>.webxiaoheiwu.zip` 的内存态 + 落盘节律。
// created 2026-09-10 by Claude Fable 5.1；v2 树动词同日由树 session 落地。UI 归 user；这里只管数据与不变量：
//   · 正文改了才 dirty；**跳转 / 滚动不标脏**（ADR-0010）——editor-state.last 随下一次保存写
//   · 落盘 = 整包重写（ADR-0008 §4），字节源 = packProject（同内容同字节）
//   · 撞名 = 链接不是新建；占位符已废（ADR-0014 §4）：跳到没有的名字 = 抛，不再「跳上去才生文件」
//   · 改动动词表（全部经 assertMutable 一道守卫；user 2026-09-10「不要 ad hoc add hooks…workpiece 级别」）：正文 / spawn / 兄弟·子节新建 / 连·断·排序 / 改名 / 删 / 废弃 / 彻底删 /
//     树移动六件（上移·下移·升级·降级·移出树·归档）/ 图片页（可指定位置）/ 封面 / 断入边 / 修改锁本身。删除模型 = 断开链接 / 废弃 / 彻底删除 三个显式动词，无引用计数（ADR-0014 §8）
import { type Project, type UnpackResult, emptyProject, packProject, unpackProject, readNodeText } from "./format.ts";
import { createNode, seedBook, setNodeText, link, unlink, setLinks, links as linksOf, renameNode, deleteNode, search, backlinks, resolveName, discard as discardNode, purge as purgeNode, createBytesNode, replaceNodeBytes,
  inTree, treeParent, treeSiblings, treeChildren, treePath, dfsOrder, dfsPrev, dfsNext, moveUp, moveDown, outdent, indent, detachToLinks, attachAfter, attachUnder, attachAtEnd, insertSibling, insertChild, exportSubtree, type NowFn } from "./graph.ts";

export interface ProjectSessionDeps {
  read(name: string): Promise<Blob | null>;                                     // store file(name,{isZip:true}).open()
  write(name: string, blob: Blob, opts: { push: boolean }): Promise<{ pushed?: boolean }>;
  now?: NowFn;
}
export type OpenResult = { kind: "ok"; warnings: string[] } | { kind: "unavailable" } | Exclude<UnpackResult, { kind: "ok" }>;

export function createProjectSession(d: ProjectSessionDeps) {
  const now: NowFn = d.now ?? (() => Date.now());
  let name: string | null = null;
  let project: Project = emptyProject();
  let dirty = false;
  let readOnly = false;          // too-new 只读、禁覆盖（ADR-0009 §9）
  let gen = 0;

  const requireCurrent = (): string => { const c = project.editorState.last; if (!c) throw new Error("project session: no current page"); return c; };
  const touch = () => { dirty = true; };
  /** 能不能改：太新（格式）或作品自己上了修改锁 → 一律不能。**所有**改动动词都经这一道；UI 只是读它画灰，不再各处自己判。无头 / 无地同一份 session，天然同守。 */
  const canMutate = (): boolean => !readOnly && !project.readOnly;
  const assertMutable = (): void => { if (readOnly) throw new Error("read-only project (format too new)"); if (project.readOnly) throw new LockedBookError(); };

  async function open(projectName: string): Promise<OpenResult> {
    const g = ++gen;
    const blob = await d.read(projectName);
    if (g !== gen) return { kind: "unavailable" };
    if (!blob) return { kind: "unavailable" };
    const r = await unpackProject(blob);
    if (g !== gen) return { kind: "unavailable" };
    if (r.kind !== "ok") {
      if (r.kind === "too-new") { name = projectName; project = emptyProject(); readOnly = true; dirty = false; }
      return r;
    }
    name = projectName; project = r.project; dirty = false; readOnly = false;
    if (!project.editorState.last) project.editorState.last = dfsOrder(project)[0] ?? [...project.contents.keys()].sort()[0] ?? null;   // 没记位置：树首；没树：名字序第一
    return { kind: "ok", warnings: r.warnings };
  }
  /** 新书：空图 + 一个空页（名字由调用方给）= 树的第一个节点。 */
  function create(projectName: string, firstNode: string): void {
    gen++;
    name = projectName; project = emptyProject(); readOnly = false;
    seedBook(project, firstNode, "", now);   // 第一页 = 树的第一个节点（与 app.ts 升 txt 成书同一处）
    dirty = true;
  }
  function close(): void { gen++; name = null; project = emptyProject(); dirty = false; readOnly = false; }

  // ── 当前页 ──
  const current = (): string | null => project.editorState.last;
  const currentText = (): string => { const c = current(); return c ? (readNodeText(project, c) ?? "") : ""; };
  function setCurrentText(text: string): boolean {
    if (!canMutate()) return false;
    const c = requireCurrent();
    const changed = setNodeText(project, c, text, now);
    if (changed) touch();
    return changed;
  }
  /** 跳转（不标脏，editor-state 随下次保存写）。目标没文件 → 抛（占位符已废）。返回落到的名字。 */
  function jump(target: string): string {
    const existing = resolveName(project, target);
    if (!existing) throw new Error(`no such page: ${target}`);
    project.editorState.last = existing;
    return existing;
  }
  /** spawn：新页带正文、边自动从当前页指向它（末尾）、光标跳过去。撞名 → 链接已有页并跳（正文不覆盖）。不进树（散页上的「+ 子节」= 链出去的新散页）。 */
  function spawn(newName: string, selectedText: string): string {
    assertMutable();
    const from = requireCurrent();
    const r = createNode(project, newName, selectedText, now);
    link(project, from, r.name, { at: "bottom", now });
    touch();
    project.editorState.last = r.name;
    return r.name;
  }
  /** 改身份（书文件在 store 里改了名）：只换 name，不动内存图、不标脏。 */
  function adoptName(newName: string): void { if (name) name = newName; }
  const guard = <A extends unknown[], R>(fn: (...a: A) => R) => (...a: A): R => { assertMutable(); const r = fn(...a); touch(); return r; };
  const addLink = guard((to: string, at: "top" | "bottom" = "bottom") => link(project, requireCurrent(), to, { at, now }));
  const removeLink = guard((to: string) => unlink(project, requireCurrent(), to, now));
  const setLinksOrder = guard((list: string[]) => setLinks(project, requireCurrent(), list, now));
  const rename = guard((from: string, to: string) => renameNode(project, from, to, now));
  const remove = guard((target: string) => deleteNode(project, target));
  /** 修改锁（跟着作品进 graph.json）：切换 = 正经改动（标脏；调用方随即落盘/推云）。唯一不受锁挡的改动（解锁本身）；格式太新仍不许。 */
  function setReadOnly(v: boolean): void { if (readOnly) throw new Error("read-only project (format too new)"); if (project.readOnly === v) return; project.readOnly = v; touch(); }
  /** 废弃（用户面 = 删除）：改名 `_废-`（前缀按界面语言给）+ 在树里连同子树出树、子节各自改名；不删字节。 */
  const discard = guard((target: string, prefix: string, prefixes: readonly string[] = [prefix]) => discardNode(project, target, prefix, now, prefixes));
  /** 彻底删除：只对带废弃前缀的页；删文件 + 指向它的 links 条目移除。返回被移除的入链来源。 */
  const purge = guard((target: string, prefixes: readonly string[]) => purgeNode(project, target, prefixes));
  /** 断一条**入**边：from → 当前页（user 2026-09-10「显示入度的时候需要加一个删除入度边的功能」）。纯断边，不走「移出」的孤儿改名。 */
  const cutIncoming = guard((from: string) => { const src = resolveName(project, from); if (!src) return false; return unlink(project, src, requireCurrent(), now); });
  // ── 主干树（ADR-0014 §8：全部是对一个数组的编辑，links 不动）──
  const treeUp = guard((target: string) => moveUp(project, target));
  const treeDown = guard((target: string) => moveDown(project, target));
  const treeOutdent = guard((target: string) => outdent(project, target));
  const treeIndent = guard((target: string) => indent(project, target));
  /** 移出树：x 连同子树出树，子树边降级成 links（结构不丢），不删、不改名。返回改成链接的页数；不在树里 → null。 */
  const treeDetach = guard((target: string) => detachToLinks(project, target, now));
  /** 归档：散页（或树里别处的页，子树跟着走）放到 anchor 之后 / parent 之下 / 树末尾。 */
  const archiveAfter = guard((target: string, anchor: string) => attachAfter(project, target, anchor));
  const archiveUnder = guard((target: string, parent: string) => attachUnder(project, target, parent));
  const archiveAtEnd = guard((target: string) => attachAtEnd(project, target));
  /** 「+ 兄弟」/「+ 子节」（相对当前页；当前页必须在树里）：新名当场建空文件；已有散页 = 归档到这里；已在树里 = 不动位置。都跳过去。 */
  const newSibling = guard((newName: string) => { const r = insertSibling(project, requireCurrent(), newName, now); project.editorState.last = r.name; return r; });
  const newChild = guard((newName: string) => { const r = insertChild(project, requireCurrent(), newName, now); project.editorState.last = r.name; return r; });
  // ── 图片页（2.1，ADR-0012/0013）：字节页 + 封面 ──
  /** 图片进门：减肥后的字节 → 新页（撞名 hex4）+ 当前页末尾长一条边。只管建页 + 一条边；放进树（兄弟 / 子节）由 mode.addImagePages 在上层用 archiveAfter / archiveUnder 挂（user 2026-09-10「加图片没说清楚是兄弟还是孩子」）。不跳转（UI 自己 jump）。返回最终名。 */
  const addBytesPage = guard((pageName: string, bytes: Uint8Array) => { const from = requireCurrent(); const n = createBytesNode(project, pageName, bytes, now); link(project, from, n, { at: "bottom", now }); return n; });
  /** 替换图片：保名保边只换字节。 */
  const replaceBytes = guard((target: string, bytes: Uint8Array) => replaceNodeBytes(project, target, bytes, now));
  const currentBytes = (): Uint8Array | null => { const c = current(); return c ? (project.contents.get(c) ?? null) : null; };
  const bytesOf = (target: string): Uint8Array | null => { const n = resolveName(project, target); return n ? (project.contents.get(n) ?? null) : null; };
  /** 封面 = Thumbnails/thumbnail.png 本身（ADR-0012；没有 cover 字段）：设 / 清都是正经改动。 */
  const setThumbnail = guard((png: Uint8Array | null) => { project.thumbnail = png && png.length ? png : null; });
  const thumbnail = (): Uint8Array | null => project.thumbnail;

  // ── 查询（零态度：无全图、无计数）──
  /** 当前页的邻域（侧栏数据；ADR-0014 §7）：树里 = 父 / 兄弟 / 孩子；links = 出边；incoming = 谁指向这里。 */
  const neighborhood = () => {
    const c = current();
    if (!c) return { current: null, inTree: false, parent: null, siblings: [] as string[], children: [] as string[], links: [] as string[], incoming: [] as string[], prev: null, next: null };
    const tin = inTree(project, c);
    return { current: c, inTree: tin, parent: tin ? treeParent(project, c) : null, siblings: tin ? treeSiblings(project, c) : [], children: tin ? treeChildren(project, c) : [], links: linksOf(project, c), incoming: backlinks(project, c), prev: tin ? dfsPrev(project, c) : null, next: tin ? dfsNext(project, c) : null };
  };
  const sidebar = (): string[] => { const c = current(); return c ? linksOf(project, c) : []; };
  const backlinksOf = (target: string) => backlinks(project, target);
  const find = (q: string, limit = 50) => search(project, q, { limit, minChars: 1 });
  const exists = (target: string) => resolveName(project, target) != null;
  const pathOf = (target: string) => treePath(project, target);
  const isInTree = (target: string) => inTree(project, target);
  const order = () => dfsOrder(project);
  /** 导出这一支：target 子树 DFS 拼接的正文（ADR-0014 §6）。 */
  const exportBranch = (target: string) => exportSubtree(project, target);

  // ── 落盘 ──
  /** opts.force：不脏也写（推云节律用——本地 200ms 落盘已清 dirty，15s 后推云还得把同一份字节以 tryPush 再交给库，否则永远推不出去）。 */
  async function flush(push: boolean, opts: { force?: boolean } = {}): Promise<{ wrote: boolean; pushed?: boolean }> {
    if (!name || readOnly || (!dirty && !opts.force)) return { wrote: false };
    const g = gen, n = name;
    const blob = await packProject(project);
    if (g !== gen) return { wrote: false };
    const r = await d.write(n, blob, { push });
    if (g === gen) dirty = false;
    return { wrote: true, pushed: r.pushed };
  }
  /** 回退栈（UI 的内存态镜像进 editor-state；不标脏，随下次保存写——ADR-0010 口径）。 */
  function setBack(list: readonly string[]): void { project.editorState.back = list.slice(-50); }
  /** 只写 editor-state 变化（跳转后想记住位置但没改正文）：不算脏、由调用方在「本来就要保存」时顺带。 */
  const toBlob = () => packProject(project);

  return {
    open, create, close, flush, toBlob, adoptName, setBack,
    get name() { return name; }, get dirty() { return dirty; }, get readOnly() { return readOnly; }, get project() { return project; },
    current, currentText, setCurrentText, jump, spawn, addLink, removeLink, setLinksOrder, rename, remove, discard, purge, setReadOnly,
    cutIncoming, addBytesPage, replaceBytes, currentBytes, bytesOf, setThumbnail, thumbnail,
    treeUp, treeDown, treeOutdent, treeIndent, treeDetach, archiveAfter, archiveUnder, archiveAtEnd, newSibling, newChild,
    neighborhood, sidebar, backlinksOf, find, exists, pathOf, isInTree, order, exportBranch, canMutate,
  };
}
export type ProjectSession = ReturnType<typeof createProjectSession>;
/** 作品上了修改锁（graph.json readOnly）。UI 捕获后提示「先解除只读」。 */
export class LockedBookError extends Error { override name = "LockedBookError"; constructor() { super("book is read-only (edit lock)"); } }
