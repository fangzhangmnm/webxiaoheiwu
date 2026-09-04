// doc-model —— 文档域的**纯函数**（无 DOM、无 store）：文件名解析/生成、排序、字数、文本编码探测、采纳验真。
// created 2026-09-03 by Claude Fable 5.1。命名约定 2026-09-03 改为与 WeebPaint 对齐（user「yyyymmdd 不应该强制…按照和 weebpaint 的 name convention 来管」）：
//   · **有名保名，无名日期**：标题就是文件名（`<标题>.txt`，只做路径字符清洗）；空标题 → `yyyymmdd-hex4.txt`（WeebPaint naming.ts v217 惯例：日粒度 + 4 位随机 hex 消歧）。
//   · 撞名才加后缀 ` 1` ` 2`…（后缀不是标题的一部分，是碰撞产物）。禁「未命名」：改名成空 = 不改。
//   · never trust remote filenames：任何字符串都解析得出，title = 整个 stem；不再拆日期前缀（老稿 `YYYYMMDD 标题.txt` 原名保留、原样显示）。
//   · 排序 = zh-CN 自然序降序（与 WeebPaint 图库同：新日期名在上，稳定不随存盘时间跳）。
//   · 多文件夹（ADR-0006）：身份 = `[夹/]<名>.txt`，夹只一层；根 = 默认夹。

import { DOC_EXT } from "./config.ts";

export interface ParsedDocName {
  /** 所在夹（"" = 根）。 */
  dir: string;
  /** 文件名（不含夹）。 */
  base: string;
  /** 名字里若以 8 位日期开头则给出（只作参考，不再是结构）；否则 null。 */
  date: string | null;
  /** 标题 = 去扩展名的整个名字（有名保名）。 */
  title: string;
  /** 去扩展名的显示名（不含夹）= title。 */
  stem: string;
}

const EXT_RE = /\.txt$/i;

export function splitDocPath(path: string): { dir: string; base: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { dir: "", base: path } : { dir: path.slice(0, i), base: path.slice(i + 1) };
}
export function joinDocPath(dir: string, base: string): string { return dir ? `${dir}/${base}` : base; }

/** 稿 = 任一夹下的 *.txt（隐藏项由库滤掉；这里再挡一次空段/点头段）。 */
export function isDocName(name: string): boolean {
  if (!EXT_RE.test(name)) return false;
  const segs = name.split("/");
  return segs.every((seg) => seg.length > 0 && !seg.startsWith("."));
}

export function parseDocName(name: string): ParsedDocName {
  const { dir, base } = splitDocPath(name ?? "");
  const stem = base.replace(EXT_RE, "");
  const m = stem.match(/^(\d{8})(?:\D|$)/);
  return { dir, base, date: m ? m[1]! : null, title: stem, stem };
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
}

/** 文件名里合法的标题片段：去路径字符、压空白、去前导点、截 200。 */
export function sanitizeTitle(s: string): string {
  return String(s ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 200);
}

/** 4 位随机 hex（无名稿消歧；WeebPaint v217 惯例）。 */
export function hex4(): string {
  const b = new Uint8Array(2);
  (globalThis.crypto ?? { getRandomValues: (a: Uint8Array) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; } }).getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
/** 有名保名，无名日期：标题 → `<标题>.txt`；空 → `yyyymmdd-hex4.txt`。dir 非空则带夹前缀（不含碰撞后缀）。 */
export function makeDocName(date: string, title: string, dir = "", suffix = hex4()): string {
  const t = sanitizeTitle(title);
  return joinDocPath(dir, t ? `${t}${DOC_EXT}` : `${date}-${suffix}${DOC_EXT}`);
}

/** 文件夹名：去路径字符、压空白、去前导点、截 80；空 → ""。 */
export function sanitizeFolderName(s: string): string {
  return String(s ?? "").replace(/[\r\n]+/g, " ").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").replace(/^\.+/, "").trim().slice(0, 80);
}

/** 第 n 个碰撞候选：n=0 原名，n≥1 追加 " n"。 */
export function collisionCandidate(name: string, n: number): string {
  if (n === 0) return name;
  return `${name.replace(EXT_RE, "")} ${n}${DOC_EXT}`;
}

const NAME_COLLATOR = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
/** 降序自然序比较器（新在前）。 */
export function compareDocNamesDesc(a: string, b: string): number { return NAME_COLLATOR.compare(b, a); }

/** 字数：CJK 按字、拉丁按词，标点空白不算。 */
export function statsForText(text: string): { cjk: number; en: number } {
  const str = text ?? "";
  const cjk = (str.match(/[㐀-䶿一-鿿豈-﫿]/g) ?? []).length;
  const en = (str.match(/[A-Za-z][A-Za-z'’]*/g) ?? []).length;
  return { cjk, en };
}

// ── 文本编码 ────────────────────────────────────────────────────────────────
export type TextEncodingName = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be" | "gb18030" | "big5" | "utf-8-lossy";

/** BOM → UTF-8 严格 → GB18030 → Big5 → UTF-8 有损。写回永远 UTF-8（无 BOM）。 */
export function decodeTextBytes(buf: ArrayBuffer | Uint8Array): { text: string; encoding: TextEncodingName } {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (arr.length >= 3 && arr[0] === 0xef && arr[1] === 0xbb && arr[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(arr.subarray(3)), encoding: "utf-8-bom" };
  }
  if (arr.length >= 2 && arr[0] === 0xff && arr[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(arr.subarray(2)), encoding: "utf-16le" };
  if (arr.length >= 2 && arr[0] === 0xfe && arr[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(arr.subarray(2)), encoding: "utf-16be" };
  try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(arr), encoding: "utf-8" }; } catch { /* not utf-8 */ }
  try { return { text: new TextDecoder("gb18030", { fatal: true }).decode(arr), encoding: "gb18030" }; } catch { /* not gb */ }
  try { return { text: new TextDecoder("big5", { fatal: true }).decode(arr), encoding: "big5" }; } catch { /* not big5 */ }
  return { text: new TextDecoder("utf-8").decode(arr), encoding: "utf-8-lossy" };
}

export function encodeText(text: string): Uint8Array { return new TextEncoder().encode(text); }

/** 采纳云端字节前的验真（store validateAdopt，收**明文**）：挡 captive-portal HTML / 二进制垃圾覆盖好本地。
 *  txt 无魔数 → 判据 = 能按上面的编码链解出（非 lossy）且开头不是 HTML 文档。空文件合法。 */
export function looksLikeTextDoc(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;
  const { text, encoding } = decodeTextBytes(bytes);
  if (encoding === "utf-8-lossy") return false;
  const head = text.slice(0, 256).trimStart().toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return false;
  if (bytes.subarray(0, 512).some((b) => b === 0)) return encoding.startsWith("utf-16");   // NUL 只有 UTF-16 合法
  return true;
}
