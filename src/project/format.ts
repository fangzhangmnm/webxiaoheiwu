// 工程容器格式（ADR-0008 / ADR-0009 / ADR-0010）：`<名字>.webxiaoheiwu.zip` = graph.json + contents/ + .webxiaoheiwu/editor-state.json。
// created 2026-09-10 by Claude Fable 5.1。硬规则：zip 内 entry 增删改名必须给 user 完整目录清单（ADR-0008 §3 是 as-of 清单）。
//   夏音.webxiaoheiwu.zip
//   ├─ graph.json                 清单：format / version / wroteWith / nodes{ <完整文件名>: { links[], created, modified } }
//   ├─ contents/                  abandonware 时唯一的东西。扁平，不许子目录
//   │   └─ *.txt（2.0 只开 .txt；别的扩展名合法但不打开）
//   └─ .webxiaoheiwu/
//       └─ editor-state.json      { last }：上次所在节点。随保存写，导航不标脏（ADR-0010）
import { zipPack, zipUnpack, levelForPath } from "../zip.ts";
import { encodeText, decodeTextBytes } from "../doc-model.ts";
import { APP_VERSION } from "../version.ts";

export const PROJECT_FORMAT = "webxiaoheiwu";
export const PROJECT_FORMAT_VERSION = 1;
export const GRAPH_ENTRY = "graph.json";
export const CONTENTS_DIR = "contents/";
export const EDITOR_STATE_ENTRY = ".webxiaoheiwu/editor-state.json";
/** entry 时间戳钉死 → 同内容同字节（ADR-0008 §4/§6）。 */
export const PINNED_MTIME = new Date(Date.UTC(1980, 0, 1));

export interface NodeMeta { links: string[]; created: number; modified: number }
export interface ProjectGraphJson { format: typeof PROJECT_FORMAT; version: number; wroteWith: string; nodes: Record<string, NodeMeta> }
export interface EditorState { last: string | null }
export interface Project {
  nodes: Map<string, NodeMeta>;               // key = 完整文件名（contents/ 下 entry 名）
  contents: Map<string, Uint8Array>;          // key 同上；值 = 原始字节（txt 就是 UTF-8）
  editorState: EditorState;
  /** 读到的清单 version（太新 → 横幅 + 禁覆盖，宿主看这个）。 */
  readVersion: number;
}
export type UnpackResult =
  | { kind: "ok"; project: Project; warnings: string[] }
  | { kind: "not-project"; reason: string }          // 根没 graph.json 且 contents/ 也没有 → 不是我们的
  | { kind: "too-new"; version: number }             // 清单 version > 本版能懂的 → 只读、禁覆盖
  | { kind: "corrupt"; reason: string };

/** 撞名口径（ADR-0009 §5）：完整文件名，大小写不敏感 + NFC。 */
export const nameKey = (name: string): string => name.normalize("NFC").toLowerCase();
/** contents/ 下合法的节点名：扁平（无 /）、非空、不以点开头、无路径字符。 */
export function isValidNodeName(name: string): boolean {
  return name.length > 0 && !name.includes("/") && !name.startsWith(".") && !/[\\:*?"<>|\r\n]/.test(name);
}
/** 渲染用扩展名（最后一个点之后；没有 → ""）。身份不看它（ADR-0009 §5）。 */
export const nodeExt = (name: string): string => { const i = name.lastIndexOf("."); return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : ""; };

export function emptyProject(): Project { return { nodes: new Map(), contents: new Map(), editorState: { last: null }, readVersion: PROJECT_FORMAT_VERSION }; }

/** 打包（整包重写；ADR-0008 §4）。graph.json 只写 contents/ 里真有的节点；links 原样（可含占位符）。 */
export async function packProject(p: Project): Promise<Blob> {
  const nodes: Record<string, NodeMeta> = {};
  for (const name of [...p.contents.keys()].sort()) {
    const m = p.nodes.get(name) ?? { links: [], created: 0, modified: 0 };
    nodes[name] = { links: [...m.links], created: m.created, modified: m.modified };
  }
  const graph: ProjectGraphJson = { format: PROJECT_FORMAT, version: PROJECT_FORMAT_VERSION, wroteWith: APP_VERSION, nodes };
  const entries: { path: string; data: Uint8Array | string }[] = [{ path: GRAPH_ENTRY, data: JSON.stringify(graph, null, 1) }];
  for (const name of [...p.contents.keys()].sort()) entries.push({ path: CONTENTS_DIR + name, data: p.contents.get(name)! });
  entries.push({ path: EDITOR_STATE_ENTRY, data: JSON.stringify({ last: p.editorState.last ?? null }) });
  return zipPack(entries, { levelFor: levelForPath, lastModDate: PINNED_MTIME });
}

/** 解包。宽容读、严格写：contents/ 里的文件没进 graph.json 也是节点（一包 txt 的 zip 也是合法工程）；graph.json 里指向不存在文件的节点条目丢弃。 */
export async function unpackProject(blob: Blob): Promise<UnpackResult> {
  let entries: Record<string, Uint8Array>;
  try { entries = await zipUnpack(blob); } catch (e) { return { kind: "corrupt", reason: "not a zip: " + String(e) }; }
  const names = Object.keys(entries);
  const hasGraph = GRAPH_ENTRY in entries;
  const contentNames = names.filter((n) => n.startsWith(CONTENTS_DIR)).map((n) => n.slice(CONTENTS_DIR.length));
  if (!hasGraph && contentNames.length === 0) return { kind: "not-project", reason: "no graph.json and no contents/" };
  const warnings: string[] = [];
  let graph: ProjectGraphJson | null = null;
  if (hasGraph) {
    try { graph = JSON.parse(new TextDecoder().decode(entries[GRAPH_ENTRY]!)) as ProjectGraphJson; }
    catch (e) { return { kind: "corrupt", reason: "graph.json is not JSON: " + String(e) }; }
    if (graph.format !== PROJECT_FORMAT) return { kind: "not-project", reason: `graph.json format=${String(graph.format)}` };
    if (typeof graph.version !== "number") return { kind: "corrupt", reason: "graph.json version missing" };
    if (graph.version > PROJECT_FORMAT_VERSION) return { kind: "too-new", version: graph.version };
  }
  const p = emptyProject();
  p.readVersion = graph?.version ?? PROJECT_FORMAT_VERSION;
  const seen = new Map<string, string>();
  for (const raw of contentNames) {
    if (raw.includes("/")) { warnings.push(`contents/ subfolder entry ignored: ${raw}`); continue; }   // 扁平，不许子目录
    if (!isValidNodeName(raw)) { warnings.push(`invalid node name ignored: ${raw}`); continue; }
    const name = raw.normalize("NFC");
    const k = nameKey(name);
    if (seen.has(k)) return { kind: "corrupt", reason: `name collision (case/NFC-insensitive): ${seen.get(k)} vs ${name}` };
    seen.set(k, name);
    p.contents.set(name, entries[CONTENTS_DIR + raw]!);
    const m = graph?.nodes?.[raw] ?? graph?.nodes?.[name];
    const links = Array.isArray(m?.links) ? m!.links.filter((l): l is string => typeof l === "string").map((l) => l.normalize("NFC")) : [];
    p.nodes.set(name, { links, created: Number(m?.created) || 0, modified: Number(m?.modified) || 0 });
  }
  if (graph) for (const n of Object.keys(graph.nodes ?? {})) { if (!p.contents.has(n.normalize("NFC"))) warnings.push(`graph.json node without contents file dropped: ${n}`); }
  if (EDITOR_STATE_ENTRY in entries) {
    try { const st = JSON.parse(new TextDecoder().decode(entries[EDITOR_STATE_ENTRY]!)) as Partial<EditorState>; p.editorState.last = typeof st.last === "string" ? st.last.normalize("NFC") : null; }
    catch { warnings.push("editor-state.json unreadable; ignored"); }
  }
  if (p.editorState.last && !p.contents.has(p.editorState.last)) p.editorState.last = null;
  return { kind: "ok", project: p, warnings };
}

/** 文本节点的解码（txt 走 doc-model 的编码链；写回永远 UTF-8）。 */
export const readNodeText = (p: Project, name: string): string | null => { const b = p.contents.get(name); return b ? decodeTextBytes(b).text : null; };
export const writeNodeText = (p: Project, name: string, text: string): void => { p.contents.set(name, encodeText(text)); };
