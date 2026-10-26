// src/project/migrate/ —— 书的格式版本纪律：每个子结构自己的拍子 + 升级代码全住本文件夹（家族规矩 = 家族根
//   `ai-docs/20261021-format-version-discipline.md`；user 2026-10-21「版本纪律能做成 catsup moonsinger 一样不同 component 有自己的拍子，
//   然后有一个专门的代码文件夹放升级代码吗？这个变成全家的版本纪律」「三级语义 同意」；形状抄 CatsUp `src/format/migrate/`）。
// created 2026-10-21 by Claude Fable 5.1
//
// 子结构（component）= 书里各自独立演化的一份 JSON：graph.json（清单 + 树 + 页表）、.webxiaoheiwu/editor-state.json（位置 + 书级偏好）。
//   参考窗目录 `.webxiaoheiwu/references/` 归 @internal/reference-window 自己管拍子，这里零知识。
// 拍子 = major.minor.patch 三个整数，互不联动；写入器只写当前拍（FORMAT），读取器按拍决定开不开、怎么开：
//   · major 比本版大 = 不可兼容 / 重大安全问题 → 拒开（FormatTooNewError；宿主整本只读、禁覆盖）。
//   · minor 比本版大 = 缺功能 / 行为变化 → 能开能改能存：不认识的键原样带回（format.ts 的 extra 袋），告诉用户一次（verdict "newer-minor"）。
//   · patch 比本版大 = 可以无脑降 → 静默（verdict "newer-patch"）。
//   · 比本版小：major 小 = 走 STEPS 链式升级（纯函数，一步 +1）；minor / patch 小 = 缺的当默认，不用代码。
//   · 同 major 内只加不改；删字段 = 保留读、停止写；真要删 = major +1 + 一条 STEP + 冻结样本。
// 物理形状：沿用整数键 `version` 当 major（已发出去的老读者只认它，它们的 too-new 逻辑继续有效），再加两个可选整数键 `minor` / `patch`（缺 = 0）。
//   不改成字符串——老读者 `typeof version !== "number"` 会当损坏。
// 改格式 = ① FORMAT 里对应子结构 +1 ② major 变了就在 STEPS 登记一条 ③ `node tools/freeze-format-sample.mjs` 冻结样本进 test/fixtures/format/
//   ④ format.ts 的 KNOWN_*_FIELDS 表 ⑤ CLAUDE.md 记一笔。少一样守卫红（test/project-migrate.test.mjs / project-fixtures.test.mjs）。

export type Component = "graph" | "editorState";
export interface Stamp { major: number; minor: number; patch: number }

/** 本版写出的拍子（SSoT）。
 *  graph 2.0 = 2026-09-10 v2（主干树 + links，ADR-0014）；2.1 = 09-30～10-01 加的可选键 hidden / cover（2026-10-21 追认为 minor 1）。
 *  editorState 1.0 = 2026-10-21 的形状（last / back / refPanel / lineWidth / exportLineWidth / exportFont / font / exportCovers / exportEmbedText）；
 *    以前从没写过 version，缺 = 1.0.0。1.1 = 2026-10-23 加可选键 exportBodyHeadings（TXT 正文标题：转义 / 原样；缺 = 加级）——老读者原样带回、提示一次。
 *    1.2 = 2026-10-25 加可选键 advLines（对话框几行高）/ advBackdrop（对话框模式的背景图片页）——同上。 */
export const FORMAT: Readonly<Record<Component, Readonly<Stamp>>> = {
  graph: { major: 2, minor: 1, patch: 0 },
  editorState: { major: 1, minor: 2, patch: 0 },
};
/** 缺 `version` 时当几：graph 没有 version = 损坏（一直如此，null = 调用方自己拒）；editor-state 从没写过 version = 1。 */
export const MISSING_MAJOR: Readonly<Record<Component, number | null>> = { graph: null, editorState: 1 };
/** 本版能读的最老 major。graph v1 = 链表格式，不迁（user 2026-09-10「legacy 不用分支代码」）→ 比它老 = 不是本版的书。 */
export const MIN_MAJOR: Readonly<Record<Component, number>> = { graph: 2, editorState: 1 };

export type Step = (json: Record<string, unknown>) => Record<string, unknown>;
/** STEPS[子结构][major] = 把 major 升到 major+1 的纯函数（必须把 version 写成 major+1）。今天空表：graph v1 不迁，editor-state 只有 1。 */
export const STEPS: Readonly<Partial<Record<Component, Readonly<Record<number, Step>>>>> = {};

export class FormatTooNewError extends Error {
  readonly component: Component;
  readonly fileStamp: Stamp;
  readonly appStamp: Stamp;
  constructor(component: Component, fileStamp: Stamp, appStamp: Stamp) {   // 不用参数属性：node strip-types 不支持
    super(`${component} format ${fmt(fileStamp)} is newer than this app (${fmt(appStamp)}); refusing to write (never downgrade or guess)`);
    this.name = "FormatTooNewError"; this.component = component; this.fileStamp = fileStamp; this.appStamp = appStamp;
  }
}
export class FormatTooOldError extends Error {
  readonly component: Component;
  readonly fileStamp: Stamp;
  constructor(component: Component, fileStamp: Stamp, minMajor: number) {
    super(`${component} format ${fmt(fileStamp)} is older than this app reads (min major ${minMajor}); not a book of this format`);
    this.name = "FormatTooOldError"; this.component = component; this.fileStamp = fileStamp;
  }
}

export const fmt = (s: Stamp): string => `${s.major}.${s.minor}.${s.patch}`;
const nat = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

/** 读一份 JSON 的拍子：version = major（缺 → MISSING_MAJOR；仍缺 → null = 损坏）；minor / patch 缺或非法 = 0。 */
export function readStamp(c: Component, json: unknown): Stamp | null {
  const o = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  const major = nat(o.version) ?? MISSING_MAJOR[c];
  if (major === null) return null;
  return { major, minor: nat(o.minor) ?? 0, patch: nat(o.patch) ?? 0 };
}

/** 同 major 下文件拍 vs 本版拍。too-new（major 大）不在这里——它走异常。 */
export type Verdict = "same" | "older" | "newer-minor" | "newer-patch";
export function compareStamp(file: Stamp, mine: Stamp): Verdict {
  if (file.minor > mine.minor) return "newer-minor";
  if (file.minor < mine.minor) return "older";
  if (file.patch > mine.patch) return "newer-patch";
  if (file.patch < mine.patch) return "older";
  return "same";
}

/** 把一份 JSON 升到本版 major，并给出判决。缺 version 且不许缺 → 抛 Error（调用方当损坏）；major 比本版大 → FormatTooNewError；
 *  比 MIN_MAJOR 小 → FormatTooOldError；中间每一步都要有 STEP，缺了 = 纪律破，响亮抛。steps 可注入（测试）。 */
export function migrate(c: Component, json: Record<string, unknown>, steps: typeof STEPS = STEPS): { json: Record<string, unknown>; stamp: Stamp; verdict: Verdict } {
  const stamp = readStamp(c, json);
  if (!stamp) throw new Error(`${c}: version missing`);
  const mine = FORMAT[c];
  if (stamp.major > mine.major) throw new FormatTooNewError(c, stamp, mine);
  if (stamp.major < MIN_MAJOR[c]) throw new FormatTooOldError(c, stamp, MIN_MAJOR[c]);
  let cur = json, v = stamp.major;
  while (v < mine.major) {
    const step = steps[c]?.[v];
    if (!step) throw new Error(`migrate: no step registered for ${c} v${v} → v${v + 1} (format discipline violated: every major bump needs a STEP)`);
    cur = step(cur); v++;
    if (cur.version !== v) throw new Error(`migrate: step ${c} v${v - 1}→v${v} did not set version`);
  }
  return { json: cur, stamp, verdict: v !== stamp.major ? "older" : compareStamp(stamp, mine) };
}

/** 写入器用：本版的拍子落成三个键。 */
export function stampFields(c: Component): { version: number; minor: number; patch: number } {
  const s = FORMAT[c]; return { version: s.major, minor: s.minor, patch: s.patch };
}
