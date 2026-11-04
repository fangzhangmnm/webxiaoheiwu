// rime-userdb.ts —— RIME 用户词库（LevelDB）的字节读写，纯函数。created 2026-11-03 by Claude Opus 5.5（家族工单 D3：加密词库）
//   为什么自己读写字节：RIME 的 wasm 只导出打字用的那十来个函数（set_ime / process…），没有词库的导出导入口；上游文件又不动（D2 的边界）。
//   LevelDB 的文件格式是公开稳定的，这里只用其中最小的一块：
//   读 = .ldb（SSTable，本版 RIME 不压缩，碰到压缩块就抛，调用方当「读不了」）+ .log（写前日志），按序号取每个键最新的那条。
//   写 = 往词库目录放一个编号比谁都大的 .log，引擎下一次打开时 LevelDB 自己重放（探针量过：比 MANIFEST 新的日志一定重放）。只在内存盘上做，垫片关着写回。
//   词条形状（探针量的，本版 1.8.5）：键 `ni \t你`（编码 + 空格 + tab + 字）、值 `c=1 d=1 t=1`；`\x01/tick` 这类 \x01 开头的是元数据。

export interface UserdbValue { c: number; d: number; t: number }
export interface ParsedUserdb {
  entries: Map<string, UserdbValue>;
  /** 这本词库的时钟（每上屏一次 +1），t 按它算。 */
  tick: number;
  maxSeq: number;
  /** 目录里 .ldb / .log 最大的文件号。 */
  maxFile: number;
}
/** 内存层此刻的样子：词库名（`luna_pinyin.userdb` 去掉后缀）→ 解析结果。 */
export type LayerSnapshot = Record<string, ParsedUserdb>;
/** 跨设备存的词条：词库名 → 键 → [c, d]。t 不存（各设备的时钟对不上），d 存「存的那一刻衰减到的值」。 */
export type DictEntries = Record<string, Record<string, [number, number]>>;
export interface UserdbFile { name: string; data: Uint8Array }

const dec = new TextDecoder(), enc = new TextEncoder();

// ── CRC32C（LevelDB 日志每条都带，错了整段丢）──
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0x82f63b78 : c >>> 1; t[i] = c >>> 0; } return t; })();
export function crc32c(bytes: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const maskCrc = (c: number): number => (((c >>> 15) | (c << 17)) + 0xa282ead8) >>> 0;

const u32 = (b: Uint8Array, p: number): number => (b[p]! | (b[p + 1]! << 8) | (b[p + 2]! << 16) | (b[p + 3]! << 24)) >>> 0;
function varint(b: Uint8Array, p: number): [number, number] {
  let v = 0, mul = 1;
  for (;;) { if (p >= b.length) throw new Error("userdb: truncated varint"); const x = b[p++]!; v += (x & 0x7f) * mul; if (x < 0x80) return [v, p]; mul *= 128; }
}
function pushVarint(out: number[], v: number): void { while (v >= 128) { out.push((v % 128) + 128); v = Math.floor(v / 128); } out.push(v); }

// ── 读 ──
type Visit = (key: Uint8Array, seq: number, value: Uint8Array | null) => void;

function readBlock(block: Uint8Array, visit: (key: Uint8Array, value: Uint8Array) => void): void {
  if (block.length < 4) return;
  const restarts = u32(block, block.length - 4), limit = block.length - 4 - restarts * 4;
  let p = 0, last = new Uint8Array(0);
  while (p < limit) {
    let shared: number, unshared: number, valueLen: number;
    [shared, p] = varint(block, p); [unshared, p] = varint(block, p); [valueLen, p] = varint(block, p);
    const key = new Uint8Array(shared + unshared);
    key.set(last.subarray(0, shared)); key.set(block.subarray(p, p + unshared), shared);
    p += unshared;
    visit(key, block.subarray(p, p + valueLen));
    p += valueLen; last = key;
  }
}
const FOOTER = 48;
const MAGIC = [0x57, 0xfb, 0x80, 0x8b, 0x24, 0x75, 0x47, 0xdb];
function readTable(data: Uint8Array, visit: Visit): void {
  if (data.length < FOOTER) throw new Error("userdb: table too short");
  for (let i = 0; i < 8; i++) if (data[data.length - 8 + i] !== MAGIC[i]) throw new Error("userdb: bad table magic");
  let p = data.length - FOOTER, off: number, size: number;
  [, p] = varint(data, p); [, p] = varint(data, p);   // metaindex 不用
  [off, p] = varint(data, p); [size, p] = varint(data, p);
  const blockAt = (o: number, s: number): Uint8Array => { if (data[o + s] !== 0) throw new Error("userdb: compressed block"); return data.subarray(o, o + s); };
  readBlock(blockAt(off, size), (_k, handle) => {
    const [o, q] = varint(handle, 0), [s] = varint(handle, q);
    readBlock(blockAt(o, s), (ikey, value) => {
      if (ikey.length < 8) return;
      const tag = ikey.subarray(ikey.length - 8);
      let seq = 0; for (let i = 7; i >= 1; i--) seq = seq * 256 + tag[i]!;
      visit(ikey.subarray(0, ikey.length - 8), seq, tag[0] === 1 ? value : null);
    });
  });
}
const BLOCK = 32768, HEADER = 7;
function readBatch(b: Uint8Array, visit: Visit): void {
  if (b.length < 12) return;
  const seq = u32(b, 0) + u32(b, 4) * 2 ** 32, count = u32(b, 8);
  let p = 12;
  for (let i = 0; i < count && p < b.length; i++) {
    const type = b[p++]!;
    let len: number;
    [len, p] = varint(b, p); const key = b.subarray(p, p + len); p += len;
    if (type === 1) { [len, p] = varint(b, p); visit(key, seq + i, b.subarray(p, p + len)); p += len; }
    else visit(key, seq + i, null);
  }
}
function readLog(data: Uint8Array, visit: Visit): void {
  let p = 0, frags: Uint8Array[] = [];
  while (p + HEADER <= data.length) {
    const left = BLOCK - (p % BLOCK);
    if (left < HEADER) { p += left; continue; }
    const crc = u32(data, p), len = data[p + 4]! | (data[p + 5]! << 8), type = data[p + 6]!;
    if (type === 0) { p += left; continue; }   // 块尾的零填充
    if (p + HEADER + len > data.length) break;   // 写到一半（同 LevelDB：尾巴不完整 = 没写成）
    if (maskCrc(crc32c(data.subarray(p + 6, p + HEADER + len))) !== crc) break;
    const body = data.subarray(p + HEADER, p + HEADER + len);
    p += HEADER + len;
    if (type === 1) readBatch(body, visit);
    else if (type === 2) frags = [body];
    else if (type === 3) frags.push(body);
    else if (type === 4) {
      frags.push(body);
      const all = new Uint8Array(frags.reduce((n, f) => n + f.length, 0));
      let o = 0; for (const f of frags) { all.set(f, o); o += f.length; }
      readBatch(all, visit); frags = [];
    }
  }
}

export function parseValue(s: string): UserdbValue | null {
  const m = /(?:^|\s)c=(-?\d+)(?:\s|$)/.exec(s), d = /(?:^|\s)d=(\S+)/.exec(s), t = /(?:^|\s)t=(\d+)/.exec(s);
  if (!m || !d || !t) return null;
  const dv = Number(d[1]);
  return Number.isFinite(dv) ? { c: Number(m[1]), d: dv, t: Number(t[1]) } : null;
}
export const packValue = (v: UserdbValue): string => `c=${v.c} d=${v.d} t=${v.t}`;

/** 一个词库目录里的 .ldb / .log → 每个键最新的那条。文件读不了（压缩块、魔数不对）= 抛：调用方不能把半本词库当整本。 */
export function parseUserdbFiles(files: UserdbFile[]): ParsedUserdb {
  const latest = new Map<string, { seq: number; value: string | null }>();
  let maxSeq = 0, maxFile = 0;
  const visit: Visit = (key, seq, value) => {
    if (seq > maxSeq) maxSeq = seq;
    const k = dec.decode(key), old = latest.get(k);
    if (!old || seq >= old.seq) latest.set(k, { seq, value: value ? dec.decode(value) : null });
  };
  for (const f of files) {
    const m = /^(\d+)\.(ldb|sst|log)$/.exec(f.name);
    if (!m) continue;
    maxFile = Math.max(maxFile, Number(m[1]));
    if (m[2] === "log") readLog(f.data, visit); else readTable(f.data, visit);
  }
  const entries = new Map<string, UserdbValue>();
  let tick = 0;
  for (const [k, r] of latest) {
    if (r.value == null) continue;
    if (k.charCodeAt(0) === 1) { if (k === "\x01/tick") tick = Number(r.value) || 0; continue; }
    const v = parseValue(r.value);
    if (v) entries.set(k, v);
  }
  return { entries, tick, maxSeq, maxFile };
}

// ── 写 ──
const BATCH_RECORDS = 500;
function pushRecord(out: Uint8Array[], offset: { n: number }, batch: Uint8Array): void {
  let p = 0, first = true;
  while (first || p < batch.length) {
    const left = BLOCK - (offset.n % BLOCK);
    if (left < HEADER) { out.push(new Uint8Array(left)); offset.n += left; continue; }
    const take = Math.min(batch.length - p, left - HEADER), end = p + take === batch.length;
    const type = first && end ? 1 : first ? 2 : end ? 4 : 3;
    const rec = new Uint8Array(HEADER + take);
    rec[4] = take & 0xff; rec[5] = take >> 8; rec[6] = type;
    rec.set(batch.subarray(p, p + take), HEADER);
    const crc = maskCrc(crc32c(rec.subarray(6)));
    rec[0] = crc & 0xff; rec[1] = (crc >>> 8) & 0xff; rec[2] = (crc >>> 16) & 0xff; rec[3] = crc >>> 24;
    out.push(rec); offset.n += rec.length; p += take; first = false;
  }
}
/** 一组键值 → 一份 LevelDB 日志的字节（序号从 startSeq 起）。 */
export function buildLogFile(records: [string, string][], startSeq: number): Uint8Array {
  const out: Uint8Array[] = [], offset = { n: 0 };
  for (let i = 0; i < records.length; i += BATCH_RECORDS) {
    const slice = records.slice(i, i + BATCH_RECORDS), seq = startSeq + i;
    const head: number[] = [];
    for (const shift of [1, 2 ** 8, 2 ** 16, 2 ** 24, 2 ** 32, 2 ** 40, 2 ** 48, 2 ** 56]) head.push(Math.floor(seq / shift) % 256);
    for (const v of [slice.length, slice.length >>> 8, slice.length >>> 16, slice.length >>> 24]) head.push(v & 0xff);
    const parts: Uint8Array[] = [Uint8Array.from(head)];
    for (const [k, v] of slice) {
      const kb = enc.encode(k), vb = enc.encode(v), pre: number[] = [1];
      pushVarint(pre, kb.length); parts.push(Uint8Array.from(pre), kb);
      const mid: number[] = []; pushVarint(mid, vb.length); parts.push(Uint8Array.from(mid), vb);
    }
    const batch = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
    let o = 0; for (const x of parts) { batch.set(x, o); o += x.length; }
    pushRecord(out, offset, batch);
  }
  const all = new Uint8Array(offset.n);
  let o = 0; for (const x of out) { all.set(x, o); o += x.length; }
  return all;
}

// ── 合并（照 RIME 自己合并用户词库的规矩：次数取大、新鲜度按各自的时钟衰减后取大）──
const DECAY_TICKS = 200;   // librime algo/dynamics.h 的 formula_d 常数（凭记忆，没核上游源码；只影响老词排得多靠前，不影响词在不在）
const trimD = (d: number): number => Number(d.toPrecision(5));
export const decayed = (v: UserdbValue, tick: number): number => (v.t < tick ? v.d * Math.exp((v.t - tick) / DECAY_TICKS) : v.d);

/** 要灌进这本词库的词（已经在里面、而且更强的不写）：键 → 新值。t = 这本词库现在的时钟。 */
export function planLoad(cur: ParsedUserdb, incoming: Record<string, [number, number]> | undefined): Map<string, UserdbValue> {
  const plan = new Map<string, UserdbValue>();
  for (const [key, e] of Object.entries(incoming ?? {})) {
    const a = cur.entries.get(key), ad = a ? decayed(a, cur.tick) : 0;
    const c = Math.max(a?.c ?? e[0], e[0]), d = Math.max(ad, e[1]);
    if (a && c === a.c && d === ad) continue;
    plan.set(key, { c, d: trimD(d), t: cur.tick });
  }
  return plan;
}
/** 内存层相对 base 多出来 / 变了的词（t 或 c 变了 = 这次会话里真的用过）。 */
export function deltaOf(now: LayerSnapshot, base: LayerSnapshot): DictEntries {
  const out: DictEntries = {};
  for (const [dict, cur] of Object.entries(now)) {
    const was = base[dict]?.entries;
    for (const [key, v] of cur.entries) {
      const b = was?.get(key);
      if (b && b.c === v.c && b.t === v.t) continue;
      (out[dict] ??= {})[key] = [v.c, trimD(decayed(v, cur.tick))];
    }
  }
  return out;
}
export function mergeEntries(into: DictEntries, from: DictEntries | undefined): DictEntries {
  for (const [dict, m] of Object.entries(from ?? {})) {
    const dst = (into[dict] ??= {});
    for (const [key, e] of Object.entries(m)) {
      if (!Array.isArray(e) || typeof e[0] !== "number" || typeof e[1] !== "number") continue;
      const a = dst[key];
      dst[key] = a ? [Math.max(a[0], e[0]), Math.max(a[1], e[1])] : [e[0], e[1]];
    }
  }
  return into;
}
export const emptyParsed = (): ParsedUserdb => ({ entries: new Map(), tick: 0, maxSeq: 0, maxFile: 0 });
export const logFileName = (cur: ParsedUserdb): string => `${String(Math.max(cur.maxFile, 1) + 1).padStart(6, "0")}.log`;
