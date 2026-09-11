// 书的图操作（ADR-0009 / ADR-0014；无 DOM）：页 = pages/ 文件；tree = 整理（主干树，一页至多一个父亲、兄弟有序、成员可选）；links = 指向（有向、零属性、顺序 = 用户手排）；反链 = 查询。
// created 2026-09-10 by Claude Fable 5.1；v2 树操作同日由树 session 落地。系统对图零态度：没有全图、没有计数面板、没有衰减。
//   · 占位符已废（ADR-0014 §4）：links / tree 里的每个名字必有文件；打新名 = 当场建空文件。
//   · 树操作全部是对一个数组的编辑（ADR-0014 §8）。语义钉在 handoff §2：兄弟顺序 = 数组顺序；升级 = 出到父亲那一层（插到父亲之后）；
//     降级 = 进到上一个兄弟的孩子末尾；归档 / 搬家 = 放到锚之后 / 之下（子树跟着）；一页只有一个位置。
//   · 删除模型 = 三个显式动词各归一层，**没有引用计数、没有「孤儿」概念**（user 2026-09-10 深夜「不同意引用计数，那又是 cleverness. 删除是一个不同的语义」，迁移 session 转述）：
//     断开链接 unlink = 只删这一条边；移出树 detachToLinks = x 连同子树出树、子树边降级成 links（结构不丢）、不改名；
//     废弃 discard = 改名 `_废-x`（撞名 hex4）+ 在树里则连同子树出树、子节各自也改名（删容器 = 删内容）；彻底删除 purge = 只对 `_废-` 页、删文件、指向它的 links 条目移除（v2 不许悬空）。
//     一页没人指就是没人指，app 不替它做任何事。
//   · 图片页（2.1）= 字节页：同一张表，进门撞名走 hex4 不走「撞名=链接」（新字节不是同一页）。
import { type Project, type NodeMeta, type TreeNode, nameKey, isValidNodeName, writeNodeText, readNodeText, nodeKind, treeNodeName, treeNodeChildren } from "./format.ts";
import { hex4 } from "../doc-model.ts";

export type NowFn = () => number;
const DEFAULT_NOW: NowFn = () => Date.now();

/** 按撞名口径找已存在的页名（大小写/NFC 不敏感）；没有 → null。 */
export function resolveName(p: Project, name: string): string | null {
  const k = nameKey(name);
  for (const n of p.contents.keys()) if (nameKey(n) === k) return n;
  return null;
}
export function meta(p: Project, name: string): NodeMeta { let m = p.nodes.get(name); if (!m) { m = { links: [], created: 0, modified: 0 }; p.nodes.set(name, m); } return m; }

/** 新建页：撞名 = 链接不是新建（ADR-0009 §6）→ 返回已有名并不覆盖。返回最终名。不进树（进树走 insertSibling / insertChild）。 */
export function createNode(p: Project, name: string, text = "", now: NowFn = DEFAULT_NOW): { name: string; created: boolean } {
  const nfc = name.normalize("NFC");
  if (!isValidNodeName(nfc)) throw new Error(`invalid page name: ${name}`);
  const existing = resolveName(p, nfc);
  if (existing) return { name: existing, created: false };
  writeNodeText(p, nfc, text);
  const t = now();
  p.nodes.set(nfc, { links: [], created: t, modified: t });
  return { name: nfc, created: true };
}
/** 写正文（内容变了才 touch modified）。 */
export function setNodeText(p: Project, name: string, text: string, now: NowFn = DEFAULT_NOW): boolean {
  const cur = readNodeText(p, name);
  if (cur === text) return false;
  writeNodeText(p, name, text);
  const m = meta(p, name); m.modified = now(); if (!m.created) m.created = m.modified;
  return true;
}
/** 重排出边（只准重排：目标必须都是已有文件的页，悬空一律丢）。 */
export function setLinks(p: Project, name: string, links: string[], now: NowFn = DEFAULT_NOW): void {
  const m = meta(p, name);
  const out: string[] = [];
  for (const l of links) { const r = resolveName(p, l); if (r && !out.some((x) => nameKey(x) === nameKey(r))) out.push(r); }
  m.links = out;
  m.modified = now();
}
/** 加一条出边（默认末尾：user 2026-09-10「节点应该加在末尾」；ADR-0009 修订）；目标必须有文件（占位符已废）→ 没有则抛；已有则不重复。 */
export function link(p: Project, from: string, to: string, opts: { at?: "top" | "bottom"; now?: NowFn } = {}): boolean {
  const t = resolveName(p, to); if (!t) throw new Error(`no such page: ${to}`);
  const m = meta(p, from);
  if (m.links.some((l) => nameKey(l) === nameKey(t))) return false;
  if (opts.at === "top") m.links.unshift(t); else m.links.push(t);
  m.modified = (opts.now ?? DEFAULT_NOW)();
  return true;
}
export function unlink(p: Project, from: string, to: string, now: NowFn = DEFAULT_NOW): boolean {
  const m = meta(p, from); const k = nameKey(to); const before = m.links.length;
  m.links = m.links.filter((l) => nameKey(l) !== k);
  if (m.links.length !== before) { m.modified = now(); return true; }
  return false;
}
/** 一页的出边（侧栏「链接」段的数据；数组顺序 = 用户手排）。 */
export const links = (p: Project, name: string): string[] => [...meta(p, name).links];
// ── 图片页 / 字节页（2.1） ──
/** 唯一化：撞名 → `stem-hex4.ext`（user 2026-09-10「撞名加 hash，我最讨厌 123 这种的序号焦虑」）。不撞 → 原名（NFC）。 */
export function uniqueNodeName(p: Project, name: string): string {
  const nfc = name.normalize("NFC");
  if (!resolveName(p, nfc)) return nfc;
  const m = nfc.match(/^(.*?)(\.[A-Za-z0-9]{1,8})?$/); const base = m?.[1] ?? nfc, ext = m?.[2] ?? "";
  for (let i = 0; i < 64; i++) { const cand = `${base}-${hex4()}${ext}`; if (!resolveName(p, cand)) return cand; }
  throw new Error("could not find a unique name");
}
/** 新建字节页（图片进门）：撞名不链接、加 hex4（新字节不是同一页）。返回最终名。 */
export function createBytesNode(p: Project, name: string, bytes: Uint8Array, now: NowFn = DEFAULT_NOW): string {
  const n = uniqueNodeName(p, name);
  if (!isValidNodeName(n)) throw new Error(`invalid page name: ${name}`);
  p.contents.set(n, bytes);
  const t = now(); p.nodes.set(n, { links: [], created: t, modified: t });
  return n;
}
/** 替换字节（「替换图片」：保名保边，只换内容）。 */
export function replaceNodeBytes(p: Project, name: string, bytes: Uint8Array, now: NowFn = DEFAULT_NOW): void {
  const n = resolveName(p, name); if (!n) throw new Error(`no such page: ${name}`);
  p.contents.set(n, bytes);
  const m = meta(p, n); m.modified = now(); if (!m.created) m.created = m.modified;
}
/** 反链 = 查询（不存）：谁的 links 里有这个名字。 */
export function backlinks(p: Project, name: string): string[] {
  const k = nameKey(name); const out: string[] = [];
  for (const [n, m] of p.nodes) if (m.links.some((l) => nameKey(l) === k)) out.push(n);
  return out.sort();
}
/** 改名 = 改 entry 名 + 重写所有引用它的 links + tree 里的条目 + editor-state（ADR-0009 §7 / ADR-0014 §11）。目标撞名 → 抛。 */
export function renameNode(p: Project, from: string, to: string, now: NowFn = DEFAULT_NOW): void {
  const src = resolveName(p, from); if (!src) throw new Error(`no such page: ${from}`);
  const t = to.normalize("NFC");
  if (!isValidNodeName(t)) throw new Error(`invalid page name: ${to}`);
  const clash = resolveName(p, t);
  if (clash && clash !== src) throw new Error(`name taken: ${clash}`);
  if (clash === src && t === src) return;
  const bytes = p.contents.get(src)!; const m = p.nodes.get(src) ?? { links: [], created: now(), modified: now() };
  p.contents.delete(src); p.nodes.delete(src);
  p.contents.set(t, bytes); p.nodes.set(t, { ...m, modified: now() });
  const k = nameKey(src);
  for (const [, mm] of p.nodes) mm.links = mm.links.map((l) => (nameKey(l) === k ? t : l));
  p.tree = mapTreeNames(p.tree, (n) => (nameKey(n) === k ? t : n));
  if (p.editorState.last && nameKey(p.editorState.last) === k) p.editorState.last = t;
  p.editorState.back = p.editorState.back.map((n) => (nameKey(n) === k ? t : n));
}
/** 废弃（用户面 = 删除；ADR-0014 §8）：改名 `<prefix>x`（撞名 → `<prefix>x-hex4`）；在树里 → 连同子树出树（子树边降级成 links，同 detachToLinks）且**子节各自也改名**（删容器 = 删内容）；
 *  不删字节；指向它们的 links 随改名重写（renameNode 既有行为）。已带前缀的页不再套第二层。返回 { renamed: 旧名→新名 的顺序表（x 在首）, detached: 出树的子树页数 }。散页上的废弃 = 只改名。 */
export function discard(p: Project, name: string, prefix: string, now: NowFn = DEFAULT_NOW, prefixes: readonly string[] = [prefix]): { renamed: { from: string; to: string }[]; detached: number } {
  const n = resolveName(p, name); if (!n) throw new Error(`no such page: ${name}`);
  const l = locate(p.tree, n);
  const members = l ? dfsOrder(p, [l.arr[l.index]!]) : [n];   // x 在首，子树按 DFS
  if (l) detachToLinks(p, n, now);
  const renamed: { from: string; to: string }[] = [];
  for (const m of members) {
    if (prefixes.some((pre) => pre && m.startsWith(pre))) { renamed.push({ from: m, to: m }); continue; }   // 任一语言的前缀都算已废弃，不套第二层
    const to = uniqueNodeName(p, prefix + m);
    renameNode(p, m, to, now);
    renamed.push({ from: m, to });
  }
  return { renamed, detached: members.length - 1 };
}
/** 彻底删除：只对带废弃前缀的页（别的 → 抛；UI 先弹 sheet 写明有几页链接到它）。删文件 + 指向它的 links 条目移除（deleteNode）。返回被移除的入链来源。 */
export function purge(p: Project, name: string, prefixes: readonly string[]): string[] {
  const n = resolveName(p, name); if (!n) throw new Error(`no such page: ${name}`);
  if (!prefixes.some((pre) => pre && n.startsWith(pre))) throw new Error(`not a discarded page: ${n}`);
  const from = backlinks(p, n);
  deleteNode(p, n);
  return from;
}
/** 删除页（正文没了）。不留悬空：指向它的边一并断掉；在树里则拿掉（它的孩子提到它的位置）。2.0.7 起 UI 不直接用它（走 dropRef / purgeOrphan）。 */
export function deleteNode(p: Project, name: string): boolean {
  const n = resolveName(p, name); if (!n) return false;
  p.contents.delete(n); p.nodes.delete(n);
  const k = nameKey(n);
  for (const [, m] of p.nodes) m.links = m.links.filter((l) => nameKey(l) !== k);
  const loc = locate(p.tree, n);
  if (loc) loc.arr.splice(loc.index, 1, ...treeNodeChildren(loc.arr[loc.index]!));
  collapseEmpty(p);
  if (p.editorState.last === n) p.editorState.last = null;
  p.editorState.back = p.editorState.back.filter((x) => x !== n);
  return true;
}
/** 检索（结果临时）：名字或正文包含 q（大小写不敏感）。返回名字，按 modified 降序。最少字数默认 1（user 2026-09-10「检索不限字数，这样可以搜全量孤儿」）。 */
export function search(p: Project, q: string, opts: { minChars?: number; limit?: number } = {}): string[] {
  const min = opts.minChars ?? 1; const needle = q.normalize("NFC").toLowerCase();
  if (needle.length < min) return [];
  const hits: { name: string; modified: number }[] = [];
  for (const n of p.contents.keys()) {
    const inName = n.toLowerCase().includes(needle);
    const inText = !inName && nodeKind(n) === "txt" && (readNodeText(p, n) ?? "").toLowerCase().includes(needle);   // 图片页只搜名字（字节不是文字）
    if (inName || inText) hits.push({ name: n, modified: p.nodes.get(n)?.modified ?? 0 });
  }
  hits.sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name));
  return hits.slice(0, opts.limit ?? 50).map((h) => h.name);
}

// ══ 主干树（ADR-0014）：全部只改 p.tree，不碰 links ══
interface TreeLoc { arr: TreeNode[]; index: number; parent: string | null }
/** 在树里找名字（撞名口径）：所在数组 + 下标 + 父名（顶层 = null）；不在树里 → null。 */
function locate(nodes: TreeNode[], name: string, parent: string | null = null): TreeLoc | null {
  const k = nameKey(name);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (nameKey(treeNodeName(n)) === k) return { arr: nodes, index: i, parent };
    if (typeof n !== "string") { const r = locate(n.children, name, n.name); if (r) return r; }
  }
  return null;
}
function mapTreeNames(nodes: TreeNode[], f: (n: string) => string): TreeNode[] {
  return nodes.map((n) => (typeof n === "string" ? f(n) : { name: f(n.name), children: mapTreeNames(n.children, f) }));
}
/** `{ name, children: [] }` → 字符串（组没了孩子就是普通页）。 */
function collapseEmpty(p: Project): void {
  const walk = (nodes: TreeNode[]): TreeNode[] => nodes.map((n) => (typeof n === "string" ? n : n.children.length ? { name: n.name, children: walk(n.children) } : n.name));
  p.tree = walk(p.tree);
}
const subtreeHas = (n: TreeNode, name: string): boolean => nameKey(treeNodeName(n)) === nameKey(name) || treeNodeChildren(n).some((c) => subtreeHas(c, name));

export const inTree = (p: Project, name: string): boolean => !!locate(p.tree, name);
/** 父页名；顶层 / 不在树里 → null（配 inTree 区分）。 */
export function treeParent(p: Project, name: string): string | null { return locate(p.tree, name)?.parent ?? null; }
/** 同一层的兄弟（含自己，数组顺序）；不在树里 → []。 */
export function treeSiblings(p: Project, name: string): string[] { const l = locate(p.tree, name); return l ? l.arr.map(treeNodeName) : []; }
/** 孩子（数组顺序）；不在树里 / 没孩子 → []。 */
export function treeChildren(p: Project, name: string): string[] { const l = locate(p.tree, name); return l ? treeNodeChildren(l.arr[l.index]!).map(treeNodeName) : []; }
/** 祖先链：根 → … → 自己；不在树里 → []。 */
export function treePath(p: Project, name: string): string[] {
  const out: string[] = []; let cur: string | null = resolveName(p, name);
  if (!cur || !inTree(p, cur)) return [];
  while (cur) { out.unshift(cur); cur = treeParent(p, cur); }
  return out;
}
/** 前序 DFS：自己 → 孩子 → 下一个兄弟 → 回溯（ADR-0014 §6；上一页/下一页与导出的顺序）。只走 tree，不看 links。 */
export function dfsOrder(p: Project, root?: TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: TreeNode[]) => { for (const n of nodes) { out.push(treeNodeName(n)); walk(treeNodeChildren(n)); } };
  walk(root ?? p.tree);
  return out;
}
/** 上一页 / 下一页（首尾不绕回：树首 prev = null、树尾 next = null；散页 = null）。 */
export function dfsPrev(p: Project, name: string): string | null { const o = dfsOrder(p); const i = o.findIndex((n) => nameKey(n) === nameKey(name)); return i > 0 ? o[i - 1]! : null; }
export function dfsNext(p: Project, name: string): string | null { const o = dfsOrder(p); const i = o.findIndex((n) => nameKey(n) === nameKey(name)); return i >= 0 && i < o.length - 1 ? o[i + 1]! : null; }
/** 上移 / 下移：只在同一个 children 数组内交换；到头 / 不在树里 → false。 */
export function moveUp(p: Project, name: string): boolean { const l = locate(p.tree, name); if (!l || l.index === 0) return false; [l.arr[l.index - 1], l.arr[l.index]] = [l.arr[l.index]!, l.arr[l.index - 1]!]; return true; }
export function moveDown(p: Project, name: string): boolean { const l = locate(p.tree, name); if (!l || l.index >= l.arr.length - 1) return false; [l.arr[l.index + 1], l.arr[l.index]] = [l.arr[l.index]!, l.arr[l.index + 1]!]; return true; }
/** 升级：x 从父 P 的 children 移除，插到 P 在它所在数组中的位置之后；x 已是顶层（没有 P）→ false。 */
export function outdent(p: Project, name: string): boolean {
  const l = locate(p.tree, name); if (!l || l.parent == null) return false;
  const [x] = l.arr.splice(l.index, 1);
  const pl = locate(p.tree, l.parent)!;
  pl.arr.splice(pl.index + 1, 0, x!);
  collapseEmpty(p);
  return true;
}
/** 降级：x 移除，追加到上一个兄弟 S 的 children 末尾（S 是字符串 → 升格为 { name: S, children: [x] }）；没有上一个兄弟 → false。 */
export function indent(p: Project, name: string): boolean {
  const l = locate(p.tree, name); if (!l || l.index === 0) return false;
  const [x] = l.arr.splice(l.index, 1);
  const s = l.arr[l.index - 1]!;
  const group = typeof s === "string" ? { name: s, children: [] as TreeNode[] } : s;
  group.children.push(x!);
  l.arr[l.index - 1] = group;
  return true;
}
/** 移出树：整个子树拿掉（x 的孩子跟着 x 走——树是唯一的容器，它们也都成散页）。页文件、links 一个字节不动。返回拿掉的子树（归档 / 移动时原样放回）；不在树里 → null。 */
export function detach(p: Project, name: string): TreeNode | null {
  const l = locate(p.tree, name); if (!l) return null;
  const [x] = l.arr.splice(l.index, 1);
  collapseEmpty(p);
  return x!;
}
/** 移出树（用户面动作；ADR-0014 §8）：x 连同子树离开树，**子树边降级成 links**——每一层的孩子按原顺序追加到父亲的 links 末尾（已有的边不重复），结构不丢；不改名。
 *  返回改成链接的页数（= 子树里的边数）；不在树里 → null。树内搬家仍用纯 detach（子树保持为树）。 */
export function detachToLinks(p: Project, name: string, now: NowFn = DEFAULT_NOW): number | null {
  const node = detach(p, name); if (node == null) return null;
  let converted = 0;
  const walk = (n: TreeNode) => { for (const c of treeNodeChildren(n)) { link(p, treeNodeName(n), treeNodeName(c), { at: "bottom", now }); converted++; walk(c); } };
  walk(node);
  return converted;
}
/** 归档 / 移动：x 放到 anchor 之后（同一层）。x 已在树里 → 先 detach（子树跟着走）再放；anchor 在 x 的子树里 → 抛（不能把自己放进自己）。x / anchor 没文件 → 抛。 */
export function attachAfter(p: Project, name: string, anchor: string): void {
  const x = resolveName(p, name), a = resolveName(p, anchor);
  if (!x) throw new Error(`no such page: ${name}`); if (!a) throw new Error(`no such page: ${anchor}`);
  if (nameKey(x) === nameKey(a)) throw new Error("cannot attach a page after itself");
  const cur = locate(p.tree, x);
  if (cur && subtreeHas(cur.arr[cur.index]!, a)) throw new Error("anchor is inside the page's own subtree");
  const node: TreeNode = detach(p, x) ?? x;
  const al = locate(p.tree, a); if (!al) throw new Error(`anchor not in tree: ${anchor}`);
  al.arr.splice(al.index + 1, 0, node);
}
/** 归档 / 移动：x 放到 parent 之下（孩子末尾；parent 是字符串 → 升格为组）。规则同 attachAfter。 */
export function attachUnder(p: Project, name: string, parent: string): void {
  const x = resolveName(p, name), pa = resolveName(p, parent);
  if (!x) throw new Error(`no such page: ${name}`); if (!pa) throw new Error(`no such page: ${parent}`);
  if (nameKey(x) === nameKey(pa)) throw new Error("cannot attach a page under itself");
  const cur = locate(p.tree, x);
  if (cur && subtreeHas(cur.arr[cur.index]!, pa)) throw new Error("parent is inside the page's own subtree");
  const node: TreeNode = detach(p, x) ?? x;
  const pl = locate(p.tree, pa); if (!pl) throw new Error(`parent not in tree: ${parent}`);
  const s = pl.arr[pl.index]!;
  const group = typeof s === "string" ? { name: s, children: [] as TreeNode[] } : s;
  group.children.push(node);
  pl.arr[pl.index] = group;
}
/** 放到树的最末尾（顶层）：没有锚时的归档。 */
export function attachAtEnd(p: Project, name: string): void {
  const x = resolveName(p, name); if (!x) throw new Error(`no such page: ${name}`);
  const node: TreeNode = detach(p, x) ?? x;
  p.tree.push(node);
}
export type InsertResult = { name: string; created: boolean; placed: boolean };
/** 「+ 兄弟」：打新名 = 当场建空文件并接在 after 之后；打已有名（ADR-0009 §6「撞名 = 链接」在树上的读法）= 散页 → 归档到这里；已在树里的页 → 不动它的位置（placed:false，调用方跳过去即可）。 */
export function insertSibling(p: Project, after: string, newName: string, now: NowFn = DEFAULT_NOW): InsertResult {
  const a = resolveName(p, after); if (!a || !inTree(p, a)) throw new Error(`anchor not in tree: ${after}`);
  const r = createNode(p, newName, "", now);
  if (!r.created && inTree(p, r.name)) return { name: r.name, created: false, placed: false };
  attachAfter(p, r.name, a);
  return { name: r.name, created: r.created, placed: true };
}
/** 「+ 子节」：同 insertSibling，但放到 parent 的孩子末尾。 */
export function insertChild(p: Project, parent: string, newName: string, now: NowFn = DEFAULT_NOW): InsertResult {
  const pa = resolveName(p, parent); if (!pa || !inTree(p, pa)) throw new Error(`parent not in tree: ${parent}`);
  const r = createNode(p, newName, "", now);
  if (!r.created && inTree(p, r.name)) return { name: r.name, created: false, placed: false };
  attachUnder(p, r.name, pa);
  return { name: r.name, created: r.created, placed: true };
}
/** 导出这一支（ADR-0014 §6）：选中页的子树前序 DFS，把 txt 页的正文用 `\n\n` 拼成一个文本（图片页 / 其他页跳过）。不在树里 → 只有它自己。 */
export function exportSubtree(p: Project, name: string): string {
  const n = resolveName(p, name); if (!n) throw new Error(`no such page: ${name}`);
  const l = locate(p.tree, n);
  const order = l ? dfsOrder(p, [l.arr[l.index]!]) : [n];
  return order.filter((x) => nodeKind(x) === "txt").map((x) => (readNodeText(p, x) ?? "").replace(/\s+$/, "")).join("\n\n") + "\n";
}
