// 工程图操作（ADR-0009；无 DOM）：节点 = contents 文件；边 = 出边数组（有向、零属性、顺序 = 用户手排）；反链 = 查询；占位符 = 无文件的名字。
// created 2026-09-10 by Claude Fable 5.1。系统对图零态度：这里没有全图、没有计数面板、没有衰减。
import { type Project, type NodeMeta, nameKey, isValidNodeName, writeNodeText, readNodeText } from "./format.ts";

export type NowFn = () => number;
const DEFAULT_NOW: NowFn = () => Date.now();

/** 按撞名口径找已存在的节点名（大小写/NFC 不敏感）；没有 → null。 */
export function resolveName(p: Project, name: string): string | null {
  const k = nameKey(name);
  for (const n of p.contents.keys()) if (nameKey(n) === k) return n;
  return null;
}
export const isStub = (p: Project, name: string): boolean => resolveName(p, name) == null;
export function meta(p: Project, name: string): NodeMeta { let m = p.nodes.get(name); if (!m) { m = { links: [], created: 0, modified: 0 }; p.nodes.set(name, m); } return m; }

/** 新建节点：撞名 = 链接不是新建（ADR-0009 §6）→ 返回已有名并不覆盖。返回最终名。 */
export function createNode(p: Project, name: string, text = "", now: NowFn = DEFAULT_NOW): { name: string; created: boolean } {
  const nfc = name.normalize("NFC");
  if (!isValidNodeName(nfc)) throw new Error(`invalid node name: ${name}`);
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
export function setLinks(p: Project, name: string, links: string[], now: NowFn = DEFAULT_NOW): void {
  const m = meta(p, name);
  m.links = links.map((l) => l.normalize("NFC")).filter((l) => l.length > 0);
  m.modified = now();
}
/** 加一条出边（默认末尾：user 2026-09-10「节点应该加在末尾」，取代 09-09 journal 的「顶部最新最热」；ADR-0009 修订）；已有则不重复。 */
export function link(p: Project, from: string, to: string, opts: { at?: "top" | "bottom"; now?: NowFn } = {}): boolean {
  const m = meta(p, from); const t = to.normalize("NFC");
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
/** 反链 = 查询（不存）：谁的 links 里有这个名字。 */
export function backlinks(p: Project, name: string): string[] {
  const k = nameKey(name); const out: string[] = [];
  for (const [n, m] of p.nodes) if (m.links.some((l) => nameKey(l) === k)) out.push(n);
  return out.sort();
}
/** 改名 = 改 entry 名 + 重写所有引用它的 links（ADR-0009 §7）。目标撞名 → 抛。 */
export function renameNode(p: Project, from: string, to: string, now: NowFn = DEFAULT_NOW): void {
  const src = resolveName(p, from); if (!src) throw new Error(`no such node: ${from}`);
  const t = to.normalize("NFC");
  if (!isValidNodeName(t)) throw new Error(`invalid node name: ${to}`);
  const clash = resolveName(p, t);
  if (clash && clash !== src) throw new Error(`name taken: ${clash}`);
  if (clash === src && t === src) return;
  const bytes = p.contents.get(src)!; const m = p.nodes.get(src) ?? { links: [], created: now(), modified: now() };
  p.contents.delete(src); p.nodes.delete(src);
  p.contents.set(t, bytes); p.nodes.set(t, { ...m, modified: now() });
  const k = nameKey(src);
  for (const [, mm] of p.nodes) mm.links = mm.links.map((l) => (nameKey(l) === k ? t : l));
  if (p.editorState.last && nameKey(p.editorState.last) === k) p.editorState.last = t;
}
/** 孤儿：有文件、但没有任何节点指向它。 */
export const isOrphan = (p: Project, name: string): boolean => !!resolveName(p, name) && backlinks(p, name).length === 0;
/** 丢引用（user 2026-09-10「删除模型就是 gc 里面的丢引用」）：断开 from→to；to 若因此成孤儿（有文件、没人再指向）→ 改名 `<prefix><名>`（唯一化）让原名腾出来
 *  （prefix 由调用方按界面语言给，如 zh `_废-`、en `_dropped-`——user「英文界面不要自动生成中文名字」；ADR-0009 §2 的沉底前缀）。
 *  **只有这个动作改名**：别的途径成孤儿（根页本来就没人指、读进来的散 txt）一律不动（user「非删除的变成孤儿不应自动改名」）。返回孤儿的新名；没成孤儿 / 占位符 → null。 */
export function dropRef(p: Project, from: string, to: string, prefix: string, now: NowFn = DEFAULT_NOW): string | null {
  const n = resolveName(p, to);
  const before = n ? backlinks(p, n).length : 0;
  const removed = unlink(p, from, to, now);
  if (!n || !removed || before !== 1) return null;   // 只有「这一断让它成了孤儿」才改名：没边可断 / 本来就是孤儿 / 别处还指着 → 不动
  if (prefix && n.startsWith(prefix)) return n;
  const m = n.match(/^(.*?)(\.[A-Za-z0-9]{1,8})?$/); const base = m?.[1] ?? n, ext = m?.[2] ?? "";
  let cand = `${prefix}${base}${ext}`; for (let i = 2; resolveName(p, cand); i++) cand = `${prefix}${base} ${i}${ext}`;
  renameNode(p, n, cand, now);
  return cand;
}
/** 彻底删除：只准孤儿（还有人指向 → 抛；UI 先弹框确认）。 */
export function purgeOrphan(p: Project, name: string): boolean { if (!isOrphan(p, name)) throw new Error(`not an orphan: ${name}`); return deleteNode(p, name); }
/** 删除节点（正文没了；别人指向它的边留着 = 变占位符）。2.0.7 起 UI 不直接用它（走 dropRef / purgeOrphan）。 */
export function deleteNode(p: Project, name: string): boolean {
  const n = resolveName(p, name); if (!n) return false;
  p.contents.delete(n); p.nodes.delete(n);
  if (p.editorState.last === n) p.editorState.last = null;
  return true;
}
/** 检索（结果临时）：名字或正文包含 q（大小写不敏感）。返回名字，按 modified 降序。最少字数默认 1（user 2026-09-10「检索不限字数，这样可以搜全量孤儿」，取代 ADR-0009 的「至少两个字」）。 */
export function search(p: Project, q: string, opts: { minChars?: number; limit?: number } = {}): string[] {
  const min = opts.minChars ?? 1; const needle = q.normalize("NFC").toLowerCase();
  if (needle.length < min) return [];
  const hits: { name: string; modified: number }[] = [];
  for (const n of p.contents.keys()) {
    const inName = n.toLowerCase().includes(needle);
    const inText = !inName && (readNodeText(p, n) ?? "").toLowerCase().includes(needle);
    if (inName || inText) hits.push({ name: n, modified: p.nodes.get(n)?.modified ?? 0 });
  }
  hits.sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name));
  return hits.slice(0, opts.limit ?? 50).map((h) => h.name);
}
/** 一个节点的邻居面（边栏的数据）：出边按数组顺序，每条带「有没有文件」。 */
export function neighbors(p: Project, name: string): { name: string; stub: boolean }[] {
  return meta(p, name).links.map((l) => ({ name: l, stub: isStub(p, l) }));
}
