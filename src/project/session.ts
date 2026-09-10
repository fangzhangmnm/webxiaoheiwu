// 工程会话（headless；ADR-0008/0009/0010）：一个打开的 `<名字>.webxiaoheiwu.zip` 的内存态 + 落盘节律。
// created 2026-09-10 by Claude Fable 5.1。UI 归 user（边栏 = 出边列表、spawn 手势、跳转）；这里只管数据与不变量：
//   · 正文改了才 dirty；**跳转 / 滚动不标脏**（ADR-0010）——editor-state.last 随下一次保存写
//   · 落盘 = 整包重写（ADR-0008 §4），字节源 = packProject（同内容同字节）
//   · 撞名 = 链接不是新建；占位符跳上去才生文件（ADR-0009）
import { type Project, type UnpackResult, emptyProject, packProject, unpackProject, readNodeText } from "./format.ts";
import { createNode, setNodeText, link, unlink, renameNode, deleteNode, search, neighbors, backlinks, resolveName, isStub, type NowFn } from "./graph.ts";

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
    if (readOnly) return false;
    const c = requireCurrent();
    const changed = setNodeText(project, c, text, now);
    if (changed) touch();
    return changed;
  }
  /** 跳转：占位符 → 先生文件（空正文）再跳；跳转本身不标脏（editor-state 随下次保存写）。返回落到的名字。 */
  function jump(target: string): string {
    const existing = resolveName(project, target);
    if (existing) { project.editorState.last = existing; return existing; }
    if (readOnly) throw new Error("read-only project (format too new)");
    const r = createNode(project, target, "", now); touch();
    project.editorState.last = r.name;
    return r.name;
  }
  /** spawn（主动作）：选中文字 → 新节点，边自动从当前节点指向它（顶部），光标跳过去。撞名 → 链接已有节点并跳。 */
  function spawn(newName: string, selectedText: string): string {
    if (readOnly) throw new Error("read-only project (format too new)");
    const from = requireCurrent();
    const r = createNode(project, newName, selectedText, now);
    link(project, from, r.name, { now });
    touch();
    project.editorState.last = r.name;
    return r.name;
  }
  const guard = <A extends unknown[], R>(fn: (...a: A) => R) => (...a: A): R => { if (readOnly) throw new Error("read-only project (format too new)"); const r = fn(...a); touch(); return r; };
  const addLink = guard((to: string, at: "top" | "bottom" = "top") => link(project, requireCurrent(), to, { at, now }));
  const removeLink = guard((to: string) => unlink(project, requireCurrent(), to, now));
  const setLinksOrder = guard((links: string[]) => { const m = project.nodes.get(requireCurrent()); if (m) m.links = links.slice(); });
  const rename = guard((from: string, to: string) => renameNode(project, from, to, now));
  const remove = guard((target: string) => deleteNode(project, target));

  // ── 查询（零态度：无全图、无计数） ──
  const sidebar = () => (current() ? neighbors(project, current()!) : []);
  const backlinksOf = (target: string) => backlinks(project, target);
  const find = (q: string, limit = 50) => search(project, q, { limit });
  const exists = (target: string) => !isStub(project, target);

  // ── 落盘 ──
  async function flush(push: boolean): Promise<{ wrote: boolean; pushed?: boolean }> {
    if (!name || !dirty || readOnly) return { wrote: false };
    const g = gen, n = name;
    const blob = await packProject(project);
    if (g !== gen) return { wrote: false };
    const r = await d.write(n, blob, { push });
    if (g === gen) dirty = false;
    return { wrote: true, pushed: r.pushed };
  }
  /** 只写 editor-state 变化（跳转后想记住位置但没改正文）：不算脏、由调用方在「本来就要保存」时顺带。 */
  const toBlob = () => packProject(project);

  return {
    open, create, close, flush, toBlob,
    get name() { return name; }, get dirty() { return dirty; }, get readOnly() { return readOnly; }, get project() { return project; },
    current, currentText, setCurrentText, jump, spawn, addLink, removeLink, setLinksOrder, rename, remove,
    sidebar, backlinksOf, find, exists,
  };
}
export type ProjectSession = ReturnType<typeof createProjectSession>;
