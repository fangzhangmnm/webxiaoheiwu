// 书的容器格式 v2（ADR-0008 / ADR-0009 / ADR-0010 / ADR-0014）：`<名字>.webxiaoheiwu.zip` = graph.json + pages/ + .webxiaoheiwu/editor-state.json (+ Thumbnails/thumbnail.png)。
// created 2026-09-10 by Claude Fable 5.1；v2（主干树 + links）同日由树 session 落地。硬规则：zip 内 entry 增删改名必须给 user 完整目录清单（ADR-0008 §3 是 as-of 清单）。
//   作品.webxiaoheiwu.zip
//   ├─ graph.json                 清单：format / version=2 / wroteWith / readOnly?（修改锁跟着作品）/ tree[]（主干树）/ pages{ <完整文件名>: { links[], created, modified } }
//   │                             · tree = 整理：嵌套数组，节点 = 名字字符串 或 { name, children }；一页至多一个父亲、兄弟有序、成员资格可选（散页合法）。
//   │                               没有 folder 类型、没有节点类型、没有 compile 标记：组 = 有孩子的页（ADR-0014 §2）。
//   │                             · links = 指向：多对多，房间的边 / wiki 关系。一句话：兄弟 = 顺序，孩子 = 归属，link = 指向。
//   │                             · 不变量（§3）：一个名字在 tree 中至多一次（重复 → corrupt）；tree 与 links 里的每个名字必有 pages/ 文件（读到悬空 → 丢 + warning；写出绝不产生）。
//   │                             · version !== 2 一律拒开：>2 = too-new（只读不覆盖）、<2 = not-project。legacy 零分支（user 2026-09-10「legacy 不用分支代码」）。
//   ├─ pages/                     abandonware 时唯一的东西。扁平，不许子目录（user 2026-09-10「zip/pages，是吃这个书」）
//   │   ├─ *.txt                  正文页
//   │   └─ *.jpg|png|webp|gif      图片页（2.1，ADR-0013）：同一张 pages 表，STORE；别的扩展名合法但不打开
//   ├─ .webxiaoheiwu/
//   │   └─ editor-state.json      { last, back }：上次所在页 + 回退栈（≤50，旧在前）。随保存写，导航不标脏（ADR-0010）
//   └─ Thumbnails/thumbnail.png   封面（2.1，ADR-0012；ORA 同款路径）：**永远最后一个 entry**、STORE、≤256²、≤70 KB，可带 iTXt Description = 腰封。
import { zipPack, zipUnpack, levelForPath } from "../zip.ts";
import { encodeText, decodeTextBytes } from "../doc-model.ts";
import { APP_VERSION } from "../version.ts";

export const PROJECT_FORMAT = "webxiaoheiwu";
export const PROJECT_FORMAT_VERSION = 2;
export const GRAPH_ENTRY = "graph.json";
export const CONTENTS_DIR = "pages/";   // 目录名 pages/（2026-09-10 吃书）；内存里的 Map 仍叫 contents/nodes（代码标识符不动）
export const EDITOR_STATE_ENTRY = ".webxiaoheiwu/editor-state.json";
/** 封面缩略图（ORA 同款路径；ADR-0012）。写时永远最后一个 entry（store getPeek 一次尾读命中）。 */
export const THUMBNAIL_ENTRY = "Thumbnails/thumbnail.png";
/** 图片页扩展名（2.1）：认这些就当图片页打开；GIF 动图原字节直通。 */
export const IMAGE_EXTS: readonly string[] = ["jpg", "jpeg", "png", "webp", "gif"];
export type NodeKind = "txt" | "image" | "other";
/** entry 时间戳钉死 → 同内容同字节（ADR-0008 §4/§6）。 */
export const PINNED_MTIME = new Date(Date.UTC(1980, 0, 1));

export interface NodeMeta { links: string[]; created: number; modified: number }
/** 主干树节点：名字字符串（叶）或 { name, children }（组 = 有孩子的页）。`{ name, children: [] }` 与字符串同义，写出时折成字符串。 */
export type TreeNode = string | { name: string; children: TreeNode[] };
export interface ProjectGraphJson { format: typeof PROJECT_FORMAT; version: number; wroteWith: string; readOnly?: boolean; tree: TreeNode[]; pages: Record<string, NodeMeta> }
export interface EditorState { last: string | null; back: string[] }
export const BACK_STACK_MAX = 50;
export interface Project {
  nodes: Map<string, NodeMeta>;               // key = 完整文件名（pages/ 下 entry 名）
  contents: Map<string, Uint8Array>;          // key 同上；值 = 原始字节（txt 就是 UTF-8）
  /** 主干树（ADR-0014）。只经 graph.ts 的树操作改；散页 = 有文件但不在这里。 */
  tree: TreeNode[];
  editorState: EditorState;
  /** 读到的清单 version（太新 → 横幅 + 禁覆盖，宿主看这个）。 */
  readVersion: number;
  /** 修改锁（user 2026-09-10「zip 锁跟着作品」）：成品不想被误改。切换 = 正经改动（标脏、推云）。 */
  readOnly: boolean;
  /** 封面 PNG 字节（Thumbnails/thumbnail.png）；null = 没有封面（书库显示 book 图标）。 */
  thumbnail: Uint8Array | null;
}
export type UnpackResult =
  | { kind: "ok"; project: Project; warnings: string[] }
  | { kind: "not-project"; reason: string }          // 不是本版的书：没 graph.json 也没 pages/，或 graph.json version < 2（v1 链表格式，零 legacy 分支）
  | { kind: "too-new"; version: number }             // 清单 version > 本版能懂的 → 只读、禁覆盖
  | { kind: "corrupt"; reason: string };

/** 撞名口径（ADR-0009 §5）：完整文件名，大小写不敏感 + NFC。 */
export const nameKey = (name: string): string => name.normalize("NFC").toLowerCase();
/** pages/ 下合法的页名：扁平（无 /）、非空、不以点开头、无路径字符。 */
export function isValidNodeName(name: string): boolean {
  return name.length > 0 && !name.includes("/") && !name.startsWith(".") && !/[\\:*?"<>|\r\n]/.test(name);
}
/** 渲染用扩展名（最后一个点之后；没有 → ""）。身份不看它（ADR-0009 §5）。 */
export const nodeExt = (name: string): string => { const i = name.lastIndexOf("."); return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : ""; };
/** 页的种类（只看扩展名）：txt 正文 / image 图片页 / other（合法但不打开）。 */
export const nodeKind = (name: string): NodeKind => { const e = nodeExt(name); return e === "txt" ? "txt" : IMAGE_EXTS.includes(e) ? "image" : "other"; };

export function emptyProject(): Project { return { nodes: new Map(), contents: new Map(), tree: [], editorState: { last: null, back: [] }, readVersion: PROJECT_FORMAT_VERSION, readOnly: false, thumbnail: null }; }

// ── 树的形状工具（纯函数，graph.ts 的树操作也用）──
export const treeNodeName = (n: TreeNode): string => (typeof n === "string" ? n : n.name);
export const treeNodeChildren = (n: TreeNode): TreeNode[] => (typeof n === "string" ? [] : n.children);
/** 规范形：`{ name, children: [] }` 折成字符串；递归。 */
export function normalizeTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((n) => (typeof n === "string" ? n : n.children.length ? { name: n.name, children: normalizeTree(n.children) } : n.name));
}
/** 严格写：只留有文件的名字；没文件的节点丢掉、它的孩子提到它的位置（不丢结构）。 */
function pruneTree(nodes: TreeNode[], has: (name: string) => boolean, dropped?: string[]): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) {
    const name = treeNodeName(n), kids = pruneTree(treeNodeChildren(n), has, dropped);
    if (has(name)) out.push(kids.length ? { name, children: kids } : name);
    else { dropped?.push(name); out.push(...kids); }
  }
  return out;
}

/** 打包（整包重写；ADR-0008 §4）。严格写：pages 只写有文件的页、links 只留有文件的目标、tree 只留有文件的名字（写出绝不产生悬空，ADR-0014 §3）。 */
export async function packProject(p: Project): Promise<Blob> {
  const has = (n: string) => p.contents.has(n);
  const nodes: Record<string, NodeMeta> = {};
  for (const name of [...p.contents.keys()].sort()) {
    const m = p.nodes.get(name) ?? { links: [], created: 0, modified: 0 };
    nodes[name] = { links: m.links.filter(has), created: m.created, modified: m.modified };
  }
  const graph: ProjectGraphJson = { format: PROJECT_FORMAT, version: PROJECT_FORMAT_VERSION, wroteWith: APP_VERSION, ...(p.readOnly ? { readOnly: true } : {}), tree: normalizeTree(pruneTree(p.tree, has)), pages: nodes };
  const entries: { path: string; data: Uint8Array | string }[] = [{ path: GRAPH_ENTRY, data: JSON.stringify(graph, null, 1) }];
  for (const name of [...p.contents.keys()].sort()) entries.push({ path: CONTENTS_DIR + name, data: p.contents.get(name)! });
  entries.push({ path: EDITOR_STATE_ENTRY, data: JSON.stringify({ last: p.editorState.last ?? null, back: p.editorState.back.slice(-BACK_STACK_MAX) }) });
  if (p.thumbnail && p.thumbnail.length) entries.push({ path: THUMBNAIL_ENTRY, data: p.thumbnail });   // 永远最后一个 entry（ADR-0012；WeebPaint v398 学费：不是最后就会被别的东西挤出尾窗）
  return zipPack(entries, { levelFor: levelForPath, lastModDate: PINNED_MTIME });
}

/** graph.json 的 tree 字段 → 内存树：形状不对 → 抛（调用方翻成 corrupt）；名字 NFC；重名（大小写/NFC 不敏感）→ 抛。 */
function parseTree(raw: unknown, seen: Set<string>, path = "tree"): TreeNode[] {
  if (!Array.isArray(raw)) throw new Error(`${path} is not an array`);
  return raw.map((n, i) => {
    const here = `${path}[${i}]`;
    let name: string, kids: unknown;
    if (typeof n === "string") { name = n; kids = []; }
    else if (n && typeof n === "object" && typeof (n as { name?: unknown }).name === "string") { name = (n as { name: string }).name; kids = (n as { children?: unknown }).children ?? []; }
    else throw new Error(`${here} is neither a name nor { name, children }`);
    name = name.normalize("NFC");
    const k = nameKey(name);
    if (seen.has(k)) throw new Error(`name appears twice in tree: ${name}`);
    seen.add(k);
    const children = parseTree(kids, seen, here + ".children");
    return children.length ? { name, children } : name;
  });
}

/** 解包。宽容读、严格写：pages/ 里的文件没进 graph.json 也是页（一包 txt 的 zip 也是合法的书，全是散页）；graph.json 里指向不存在文件的条目 / 悬空 link / 悬空 tree 名字丢弃 + warning；tree 重名 → corrupt。 */
export async function unpackProject(blob: Blob): Promise<UnpackResult> {
  let entries: Record<string, Uint8Array>;
  try { entries = await zipUnpack(blob); } catch (e) { return { kind: "corrupt", reason: "not a zip: " + String(e) }; }
  const names = Object.keys(entries);
  const hasGraph = GRAPH_ENTRY in entries;
  const contentNames = names.filter((n) => n.startsWith(CONTENTS_DIR)).map((n) => n.slice(CONTENTS_DIR.length));
  if (!hasGraph && contentNames.length === 0) return { kind: "not-project", reason: "no graph.json and no pages/" };
  const warnings: string[] = [];
  let graph: ProjectGraphJson | null = null;
  if (hasGraph) {
    try { graph = JSON.parse(new TextDecoder().decode(entries[GRAPH_ENTRY]!)) as ProjectGraphJson; }
    catch (e) { return { kind: "corrupt", reason: "graph.json is not JSON: " + String(e) }; }
    if (!graph || typeof graph !== "object") return { kind: "corrupt", reason: "graph.json is not an object" };
    if (graph.format !== PROJECT_FORMAT) return { kind: "not-project", reason: `graph.json format=${String(graph.format)}` };
    if (typeof graph.version !== "number") return { kind: "corrupt", reason: "graph.json version missing" };
    if (graph.version > PROJECT_FORMAT_VERSION) return { kind: "too-new", version: graph.version };
    if (graph.version < PROJECT_FORMAT_VERSION) return { kind: "not-project", reason: `graph.json version ${graph.version} (pre-v2 format; this version reads only v${PROJECT_FORMAT_VERSION})` };
    if (graph.pages != null && (typeof graph.pages !== "object" || Array.isArray(graph.pages))) return { kind: "corrupt", reason: "graph.json pages is not an object" };
  }
  const p = emptyProject();
  p.readVersion = graph?.version ?? PROJECT_FORMAT_VERSION;
  p.readOnly = graph?.readOnly === true;
  const seen = new Map<string, string>();
  for (const raw of contentNames) {
    if (raw.includes("/")) { warnings.push(`pages/ subfolder entry ignored: ${raw}`); continue; }   // 扁平，不许子目录
    if (!isValidNodeName(raw)) { warnings.push(`invalid page name ignored: ${raw}`); continue; }
    const name = raw.normalize("NFC");
    const k = nameKey(name);
    if (seen.has(k)) return { kind: "corrupt", reason: `name collision (case/NFC-insensitive): ${seen.get(k)} vs ${name}` };
    seen.set(k, name);
    p.contents.set(name, entries[CONTENTS_DIR + raw]!);
  }
  const resolve = (n: string): string | null => seen.get(nameKey(n)) ?? null;
  const metaByKey = new Map<string, NodeMeta>(Object.entries(graph?.pages ?? {}).map(([k, v]) => [nameKey(k), v]));
  // pages 表：links 只留有文件的目标（悬空 → 丢 + warning；ADR-0014 撤占位符）
  for (const name of p.contents.keys()) {
    const m = metaByKey.get(nameKey(name));
    const links: string[] = [];
    if (Array.isArray(m?.links)) for (const l of m.links) {
      if (typeof l !== "string") continue;
      const r = resolve(l);
      if (!r) { warnings.push(`dangling link dropped: ${name} -> ${l}`); continue; }
      if (!links.some((x) => nameKey(x) === nameKey(r))) links.push(r);
    }
    p.nodes.set(name, { links, created: Number(m?.created) || 0, modified: Number(m?.modified) || 0 });
  }
  if (graph) for (const n of Object.keys(graph.pages ?? {})) { if (!resolve(n)) warnings.push(`graph.json page without pages/ file dropped: ${n}`); }
  // tree：形状错 / 重名 → corrupt；名字无文件 → 丢 + warning（孩子提到它的位置）；缺 tree 字段 → 空树 + warning
  if (graph) {
    if (graph.tree === undefined) { warnings.push("graph.json has no tree; all pages loose"); p.tree = []; }
    else {
      let parsed: TreeNode[];
      try { parsed = parseTree(graph.tree, new Set()); } catch (e) { return { kind: "corrupt", reason: "graph.json tree: " + (e instanceof Error ? e.message : String(e)) }; }
      const dropped: string[] = [];
      p.tree = normalizeTree(pruneTree(parsed, (n) => !!resolve(n), dropped).map(function fix(n): TreeNode { return typeof n === "string" ? resolve(n)! : { name: resolve(n.name)!, children: n.children.map(fix) }; }));
      for (const d of dropped) warnings.push(`tree name without pages/ file dropped: ${d}`);
    }
  }
  if (EDITOR_STATE_ENTRY in entries) {
    try {
      const st = JSON.parse(new TextDecoder().decode(entries[EDITOR_STATE_ENTRY]!)) as Partial<EditorState>;
      p.editorState.last = typeof st.last === "string" ? (resolve(st.last) ?? null) : null;
      p.editorState.back = Array.isArray(st.back) ? st.back.filter((x): x is string => typeof x === "string").map((x) => resolve(x)).filter((x): x is string => !!x).slice(-BACK_STACK_MAX) : [];
    }
    catch { warnings.push("editor-state.json unreadable; ignored"); }
  }
  if (THUMBNAIL_ENTRY in entries && entries[THUMBNAIL_ENTRY]!.length) p.thumbnail = entries[THUMBNAIL_ENTRY]!;
  return { kind: "ok", project: p, warnings };
}

/** 文本页的解码（txt 走 doc-model 的编码链；写回永远 UTF-8）。 */
export const readNodeText = (p: Project, name: string): string | null => { const b = p.contents.get(name); return b ? decodeTextBytes(b).text : null; };
export const writeNodeText = (p: Project, name: string, text: string): void => { p.contents.set(name, encodeText(text)); };
