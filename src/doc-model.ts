// doc-model —— 文档域的**纯函数**（无 DOM、无 store）：文件名解析/生成、排序、字数、文本编码探测、采纳验真。
// created 2026-09-03 by Claude Fable 5.1。命名约定 2026-09-03 改为与 WeebPaint 对齐（user「yyyymmdd 不应该强制…按照和 weebpaint 的 name convention 来管」）：
//   · **文件名 = 管理用句柄，不是标题**（ADR-0007，user 2026-09-04「文件名不是标题的语义，可以变，是管理用的」）：顶栏显示、改名 sheet 改；编辑器里没有标题。
//   · **有名保名，无名日期**：用户给了名就用（`<名>.txt`，只做路径字符清洗）；没给 → `yyyymmdd-hex4.txt`（WeebPaint naming.ts v217 惯例：日粒度 + 4 位随机 hex 消歧）。
//     加密稿出生名一律日期码（藏标题：云端只见 `yyyymmdd-hex4.txt.zip`）；明文稿转加密也改成日期码（`isOpaqueStem` 判已是日期码则不动）。
//   · 撞名才加后缀 `-hex4`（2.1 起，取代 ` 1` ` 2`；后缀不是名字的一部分，是碰撞产物）。禁「未命名」：改名成空 = 不改。
//   · never trust remote filenames：任何字符串都解析得出，title = 整个 stem（= 显示名）；不再拆日期前缀（老稿 `YYYYMMDD 标题.txt` 原名保留、原样显示）。
//   · 排序 = zh-CN 自然序降序（与 WeebPaint 图库同：新日期名在上，稳定不随存盘时间跳）。
//   · 多文件夹（ADR-0006）：身份 = `[夹/]<名>.txt`，夹只一层；根 = 默认夹。

import { identifiers } from "./identifiers.ts";

export interface ParsedDocName {
  /** 所在夹（"" = 根）。 */
  dir: string;
  /** 文件名（不含夹）。 */
  base: string;
  /** 名字里若以 8 位日期开头则给出（只作参考，不再是结构）；否则 null。 */
  date: string | null;
  /** 显示名 = 去扩展名的整个名字（有名保名）。历史字段名 title；语义自 ADR-0007 起 = 文件名，不是稿的标题。 */
  title: string;
  /** 去扩展名的显示名（不含夹）= title。 */
  stem: string;
}

/** 身份两档（2.0）：单篇 txt 稿 / zip 工程（ADR-0008 §8 并存）。种类标签 = identifiers.ts 里那张表的 kind。 */
export type DocKind = "txt" | "project";
/** 身份 → 种类；不是本 app 的文档 → null。（v2.1.23 起由 store 的种类表推导，此前是三个手写正则。） */
export function docKind(name: string): DocKind | null { const d = identifiers.parse(name); return d ? (d.kind as DocKind) : null; }

export function splitDocPath(path: string): { dir: string; base: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { dir: "", base: path } : { dir: path.slice(0, i), base: path.slice(i + 1) };
}
export function joinDocPath(dir: string, base: string): string { return dir ? `${dir}/${base}` : base; }

/** 稿 = 任一夹下的 *.txt（隐藏项由库滤掉；这里再挡一次空段/点头段）。 */
export function isDocName(name: string): boolean {
  if (!identifiers.parse(name)) return false;
  const segs = name.split("/");
  return segs.every((seg) => seg.length > 0 && !seg.startsWith("."));
}

export function parseDocName(name: string): ParsedDocName {
  const { dir, base } = splitDocPath(name ?? "");
  const stem = identifiers.parse(name ?? "")?.stem ?? base;   // 不是文档（理论上不该传进来）→ 整个最后一段当主干
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
/** 有名保名，无名日期：名 → `<名>.txt`；空 → `yyyymmdd-hex4.txt`（日期码）。dir 非空则带夹前缀（不含碰撞后缀）。 */
export function makeDocName(date: string, title: string, dir = "", suffix = hex4(), kind: DocKind = "txt"): string {
  const t = sanitizeTitle(title); const ext = identifiers.kinds.find((k) => k.kind === kind)!.suffix;
  return identifiers.join({ folder: dir, stem: t || `${date}-${suffix}`, suffix: ext });
}
/** 是否已是日期码名（`yyyymmdd-hex4`，可带碰撞后缀 ` n`）——加密稿藏标题的出生名；已是则转加密时不再改名。 */
export function isOpaqueStem(stem: string): boolean { return /^\d{8}-[0-9a-f]{4}( \d+)?$/i.test(stem); }

/** 名字拆成「日期前缀 + 其余」（书库封面印书名用；user 2026-09-29「对 yyyymmdd-name 和 yyyymmdd name 都识别」）。
 *  **一条规则，没有特例**：八位日期 + 分隔 + 其余。分隔本身不进任何一边（封面上不会再有一根悬着的横杠）。
 *  认的分隔：空格 / 全角空格 / 下划线 / 各种横杠（半角 - 、全角 － 、短破折号 – 、破折号 —），可以连着几个。日期要像个日期（月 01–12、日 01–31）。
 *  没起名的稿（日期码名 `yyyymmdd-hex4`）同一条规则：日期归日期，其余就是那四位消歧码（v2.1.22；此前整个当名字印，
 *  窄封面在横杠后面折行，user 2026-09-29「20260929-的"-"还是没有妥善处理好」）。是不是消歧码由 `isCodeTitle` 判，封面据此换一种印法。
 *  拆不出 → date = null、title = 原样。只管显示，身份仍是完整文件名。 */
const DATED_RE = /^(\d{4})(\d{2})(\d{2})[ \u3000_\-\uFF0D\u2013\u2014]+(\S.*)$/;
export function splitDatedName(stem: string): { date: string | null; title: string } {
  const s = String(stem ?? "");
  const m = s.match(DATED_RE);
  if (!m) return { date: null, title: s };
  const month = Number(m[2]), day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return { date: null, title: s };
  return { date: `${m[1]}${m[2]}${m[3]}`, title: m[4]!.trim() };
}
/** 拆出来的「其余」是不是消歧码（四位 hex，可带碰撞后缀）——也就是这份稿没起名。 */
export function isCodeTitle(title: string): boolean { return /^[0-9a-f]{4}(?:[ -][0-9a-f]{1,4})*$/i.test(title); }

/** 文件夹名：去路径字符、压空白、去前导点、截 80；空 → ""。 */
export function sanitizeFolderName(s: string): string {
  return String(s ?? "").replace(/[\r\n]+/g, " ").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").replace(/^\.+/, "").trim().slice(0, 80);
}

/** 第 n 个碰撞候选：n=0 原名，n≥1 追加 `-hex4`（2.1 起；user 2026-09-10「撞名加 hash，我最讨厌 123 这种的序号焦虑。如果是四位数 hash 就不会 pile of shame」，取代 WeebPaint 式 " 1" " 2"）。 */
export function collisionCandidate(name: string, n: number): string {
  if (n === 0) return name;
  const d = identifiers.parse(name);
  if (!d) return `${name}-${hex4()}`;
  return identifiers.join({ folder: d.folder, stem: `${d.stem}-${hex4()}`, suffix: d.suffix });
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
