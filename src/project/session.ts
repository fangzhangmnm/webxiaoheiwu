// 工程会话（headless；ADR-0008/0009/0010）：一个打开的 `<名字>.webxiaoheiwu.zip` 的内存态 + 落盘节律。
// created 2026-09-10 by Claude Fable 5.1。UI 归 user（边栏 = 出边列表、spawn 手势、跳转）；这里只管数据与不变量：
//   · 正文改了才 dirty；**跳转 / 滚动不标脏**（ADR-0010）——editor-state.last 随下一次保存写
//   · 落盘 = 整包重写（ADR-0008 §4），字节源 = packProject（同内容同字节）
//   · 撞名 = 链接不是新建；占位符跳上去才生文件（ADR-0009）
import { type Project, type UnpackResult, emptyProject, packProject, unpackProject, readNodeText } from "./format.ts";
import { createNode, setNodeText, link, unlink, renameNode, deleteNode, search, neighbors, backlinks, resolveName, isStub, dropRef, purgeOrphan, isOrphan, type NowFn } from "./graph.ts";

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

  const requireCurrent = (): string => { const c = project.editorState.last; if (!c) throw new Error("project session: no current node"); return c; };
  const touch = () => { dirty = true; };
  /** 能不能改：太新（格式）或作品自己上了修改锁 → 一律不能。**所有**改动动词都经这一道（user 2026-09-10「锁的话就是各种删除、修改、拓扑操作都要加，所以不要 ad hoc add hooks…workpiece 级别」）；
   *  UI 只是读它画灰，不再各处自己判。无头 / 无地同一份 session，天然同守。 */
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
    if (!project.editorState.last) { const first = [...project.contents.keys()].sort()[0] ?? null; project.editorState.last = first; }
    return { kind: "ok", warnings: r.warnings };
  }
  /** 新工程：空图 + 一个空节点（名字由调用方给，默认日期码风格由 UI 定）。 */
  function create(projectName: string, firstNode: string): void {
    gen++;
    name = projectName; project = emptyProject(); readOnly = false;
    const r = createNode(project, firstNode, "", now);
    project.editorState.last = r.name;
    dirty = true;
  }
  function close(): void { gen++; name = null; project = emptyProject(); dirty = false; readOnly = false; }

  // ── 当前节点 ──
  const current = (): string | null => project.editorState.last;
  const currentText = (): string => { const c = current(); return c ? (readNodeText(project, c) ?? "") : ""; };
  function setCurrentText(text: string): boolean {
    if (!canMutate()) return false;
    const c = requireCurrent();
    const changed = setNodeText(project, c, text, now);
    if (changed) touch();
    return changed;
  }
  /** 跳转：占位符 → 先生文件（空正文）再跳；跳转本身不标脏（editor-state 随下次保存写）。返回落到的名字。 */
  function jump(target: string): string {
    const existing = resolveName(project, target);
    if (existing) { project.editorState.last = existing; return existing; }
    assertMutable();   // 占位符要生文件 = 改动
    const r = createNode(project, target, "", now); touch();
    project.editorState.last = r.name;
    return r.name;
  }
  /** spawn（主动作）：选中文字 → 新节点，边自动从当前节点指向它（末尾），光标跳过去。撞名 → 链接已有节点并跳（正文不覆盖）。 */
  function spawn(newName: string, selectedText: string): string {
    assertMutable();
    const from = requireCurrent();
    const r = createNode(project, newName, selectedText, now);
    link(project, from, r.name, { at: "bottom", now });
    touch();
    project.editorState.last = r.name;
    return r.name;
  }
  /** 改身份（工程文件在 store 里改了名）：只换 name，不动内存图、不标脏。 */
  function adoptName(newName: string): void { if (name) name = newName; }
  const guard = <A extends unknown[], R>(fn: (...a: A) => R) => (...a: A): R => { assertMutable(); const r = fn(...a); touch(); return r; };
  const addLink = guard((to: string, at: "top" | "bottom" = "bottom") => link(project, requireCurrent(), to, { at, now }));
  const removeLink = guard((to: string) => unlink(project, requireCurrent(), to, now));
  const setLinksOrder = guard((links: string[]) => { const m = project.nodes.get(requireCurrent()); if (m) m.links = links.slice(); });
  const rename = guard((from: string, to: string) => renameNode(project, from, to, now));
  const remove = guard((target: string) => deleteNode(project, target));
  /** 修改锁（跟着作品进 graph.json）：切换 = 正经改动（标脏；调用方随即落盘/推云）。唯一不受锁挡的改动（解锁本身）；格式太新仍不许。 */
  function setReadOnly(v: boolean): void { if (readOnly) throw new Error("read-only project (format too new)"); if (project.readOnly === v) return; project.readOnly = v; touch(); }
  const drop = guard((to: string, orphanPrefix: string) => dropRef(project, requireCurrent(), to, orphanPrefix, now));
  const purge = guard((target: string) => purgeOrphan(project, target));
  const orphan = (target: string) => isOrphan(project, target);

  // ── 查询（零态度：无全图、无计数） ──
  const sidebar = () => (current() ? neighbors(project, current()!) : []);
  const backlinksOf = (target: string) => backlinks(project, target);
  const find = (q: string, limit = 50) => search(project, q, { limit, minChars: 1 });
  const exists = (target: string) => !isStub(project, target);

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
    current, currentText, setCurrentText, jump, spawn, addLink, removeLink, setLinksOrder, rename, remove, drop, purge, orphan, setReadOnly,
    sidebar, backlinksOf, find, exists, canMutate,
  };
}
export type ProjectSession = ReturnType<typeof createProjectSession>;
/** 作品上了修改锁（graph.json readOnly）。UI 捕获后提示「先解除只读」。 */
export class LockedBookError extends Error { override name = "LockedBookError"; constructor() { super("book is read-only (edit lock)"); } }
