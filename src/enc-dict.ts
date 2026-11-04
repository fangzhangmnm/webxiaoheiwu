// enc-dict.ts —— 加密词库：加密稿里学到的词，封好了跟账号走。created 2026-11-03 by Claude Opus 5.5（家族工单 D3；设计 = Fable，家族根 ai-docs/20261103-work-orders.md「工单 D3」）
//   两本词库：明文词库（rime-user-dict，明文稿学的，老样子）/ 加密词库（rime-enc-dict，加密稿学的，本文件）。
//   字节：一台设备一个键 `dict.<guid>`，值 = 和稿子同一种容器的 base64（图库口令，每一笔落盘的都是密文）。只写自己的键，per-key LWW 不丢别的设备的词。读 = 解开所有键取并集。
//   何时：只在加密稿开着、图库口令在内存里时。开稿 → 解开 → 灌进输入法的内存层（D2 垫片管的那层，不落 /rime）；关稿 / 空闲 60 s / 切后台 / 锁定前 → 把这段时间新学的封好写回自己的键。
//   口令不在 = 不加载、不写（内存层照 D2：本次会话能联想，关稿即忘）。明文稿期间不加载（防 RIME 合并进明文词库）。锁定 = 灌进去的立刻从内存层丢掉。
//   清空：自己的键写 clearedAt；一个键的 clearedAt 比所有键里最大的小 = 它的词作废（只比 clearedAt 自己，不比 savedAt，不怕时钟不准）；那台设备下次打开时先清自己的键再说。
//   格式：有拍子（project/migrate 的 encDict）、未知键原样带回；major 比本版新 = 不读不写，自己的键换一个新名字（旧的留着，不覆盖）。
import { migrate, FORMAT, type Verdict } from "./project/migrate/index.ts";
import { deltaOf, mergeEntries, type DictEntries, type LayerSnapshot } from "./rime-userdb.ts";

const KEY_PREFIX = "dict.";
const KV_OWN_KEY = "rimeEncDictKey";
export const ENC_DICT_IDLE_MS = 60_000;

export interface EncDictPayload { version: number; minor?: number; patch?: number; entries: DictEntries; savedAt: number; device: string; clearedAt?: number; [k: string]: unknown }
export type LayerResult = { status: "ok"; base: LayerSnapshot } | { status: "composing" } | { status: "off" };
/** 输入法那边（ime.ts）。 */
export interface EncDictLayer {
  memoryOnly(): boolean;
  /** 把词灌进内存层，回 base = delta 的起点（灌之前的词 + 灌进去的词）。正在组字 = 等会儿再来（重开引擎会丢组字）。 */
  load(entries: DictEntries): Promise<LayerResult>;
  /** 内存层此刻的样子；flush = 先重开一次把挂着的词提交（正在组字就不重开）。不在内存层模式 = null。 */
  read(flush: boolean): Promise<LayerSnapshot | null>;
  /** 丢掉内存层学到的和灌进去的，回到进加密稿时的样子，再灌 entries。 */
  reset(entries: DictEntries): Promise<LayerResult>;
}
export interface EncDictDeps {
  collection: { keys(): string[]; getItem<V = unknown>(id: string): V | undefined; setItem(id: string, value: unknown): void };
  layer: EncDictLayer;
  password(): string | null;
  /** JSON 字节 → 容器的 base64。 */
  seal(json: Uint8Array, password: string): Promise<string>;
  /** 打不开（口令不对 / 坏了）= null，不抛。 */
  unseal(value: string, password: string): Promise<Uint8Array | null>;
  device(): string;
  kvGet(key: string): string | null;
  kvSet(key: string, value: string): void;
  newId(): string;
  now(): number;
  note(line: string): void;
  report(e: unknown): void;
  /** 有一把键是更新版本写的（minor 更大）：能用，说一次。 */
  tellNewer(): void;
  sleep(ms: number): Promise<void>;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(t: unknown): void;
}

const enc = new TextEncoder(), dec = new TextDecoder();
/** 读一把键的明文：坏的 / major 比本版新 = null。verdict 给调用方看是不是更新的 minor。 */
export function decodePayload(bytes: Uint8Array): { payload: EncDictPayload; verdict: Verdict } | null {
  try {
    const raw = JSON.parse(dec.decode(bytes)) as Record<string, unknown>;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const { json, verdict } = migrate("encDict", raw);
    const entries = json.entries && typeof json.entries === "object" && !Array.isArray(json.entries) ? (json.entries as DictEntries) : {};
    return { payload: { ...json, entries, version: FORMAT.encDict.major, savedAt: Number(json.savedAt) || 0, device: String(json.device ?? ""), clearedAt: Number(json.clearedAt) || 0 }, verdict };
  } catch { return null; }
}
/** 永远写本版的拍；不认识的键（payload 里带着的）原样带回。 */
export function encodePayload(p: EncDictPayload): Uint8Array {
  return enc.encode(JSON.stringify({ ...p, version: FORMAT.encDict.major, minor: FORMAT.encDict.minor, patch: FORMAT.encDict.patch }));
}
/** 并集：clearedAt 没跟上最新一次清空的键，词作废。 */
export function unionOf(payloads: EncDictPayload[]): { entries: DictEntries; clearedAt: number } {
  const clearedAt = payloads.reduce((m, p) => Math.max(m, p.clearedAt ?? 0), 0), entries: DictEntries = {};
  for (const p of payloads) if ((p.clearedAt ?? 0) >= clearedAt) mergeEntries(entries, p.entries);
  return { entries, clearedAt };
}

export interface EncDict {
  /** 幂等：加密稿开着 + 口令在 + 还没灌 → 灌。 */
  ensureLoaded(): void;
  /** 这次会话灌好了吗（测试 / 诊断）。 */
  loaded(): boolean;
  /** 上屏了一个词：空闲 60 s 后封。 */
  poke(): void;
  /** 现在就封（切后台 / 锁定前）。 */
  sealNow(flush?: boolean): Promise<void>;
  /** 关稿：snapshot = 输入法丢内存层之前最后的样子。 */
  leave(snapshot: Promise<LayerSnapshot | null>): Promise<void>;
  /** 口令没了：灌进去的从内存层丢掉。 */
  onLocked(): Promise<void>;
  /** 重灌（明文词库清空会把内存层一起换掉）。 */
  reload(): Promise<void>;
  /** 「清空加密词库」。口令不在 = false。 */
  clear(): Promise<boolean>;
  /** 换口令：读得开的键全换成新口令封。 */
  rekey(oldPassword: string, newPassword: string): Promise<void>;
  /** 同步文件变了。 */
  noteChanged(ids: string[]): void;
  /** 一把键都还没有（设置页不用问口令就能说「是空的」）。 */
  isEmpty(): boolean;
}

export function createEncDict(d: EncDictDeps): EncDict {
  interface Cached { value: string; payload: EncDictPayload | null }
  const cache = new Map<string, Cached>();
  let session: { base: LayerSnapshot; own: EncDictPayload; ownKey: string; clearedAt: number } | null = null;
  let loading = false, changed = false, toldNewer = false, loadFailed = false, timer: unknown = null;
  let chain: Promise<unknown> = Promise.resolve();
  const run = <T>(f: () => Promise<T>): Promise<T | undefined> => { const p = chain.then(f).catch((e) => { d.report(e); return undefined; }); chain = p; return p; };
  const stopTimer = () => { if (timer != null) { d.clearTimer(timer); timer = null; } };
  const dictKeys = () => d.collection.keys().filter((k) => k.startsWith(KEY_PREFIX));

  async function readAll(pw: string): Promise<void> {
    changed = false;
    for (const key of dictKeys()) {
      const value = d.collection.getItem<string>(key);
      if (typeof value !== "string" || cache.get(key)?.value === value) continue;
      const bytes = await d.unseal(value, pw);
      const got = bytes ? decodePayload(bytes) : null;
      if (!got) d.note(`enc dict: a key can't be read here (${bytes ? "newer format / damaged" : "other password / damaged"})`);
      if (got?.verdict === "newer-minor" && !toldNewer) { toldNewer = true; d.tellNewer(); }
      cache.set(key, { value, payload: got?.payload ?? null });
    }
  }
  const readable = (): EncDictPayload[] => [...cache.values()].flatMap((c) => (c.payload ? [c.payload] : []));
  const maxCleared = (): number => readable().reduce((m, p) => Math.max(m, p.clearedAt ?? 0), 0);
  /** 自己的键。存在但读不了（别的口令 / 更新的 major）= 换个新名字：旧的留着，哪天读得开了还在并集里，绝不覆盖。 */
  function ownKeyName(): string {
    let key = d.kvGet(KV_OWN_KEY);
    if (key && d.collection.getItem(key) != null && !cache.get(key)?.payload) key = null;
    if (!key) { key = `${KEY_PREFIX}${d.newId()}`; d.kvSet(KV_OWN_KEY, key); }
    return key;
  }
  const freshPayload = (clearedAt: number): EncDictPayload => ({ version: FORMAT.encDict.major, entries: {}, savedAt: d.now(), device: d.device(), ...(clearedAt ? { clearedAt } : {}) });
  async function writeOwn(key: string, payload: EncDictPayload, pw: string): Promise<void> {
    const value = await d.seal(encodePayload(payload), pw);
    cache.set(key, { value, payload });
    d.collection.setItem(key, value);
  }
  /** 灌 / 重置内存层。正在组字就等一下（打字的人优先）；中途关了稿 = null。 */
  async function applyLayer(op: "load" | "reset", entries: DictEntries): Promise<LayerSnapshot | null> {
    for (;;) {
      const r = await d.layer[op](entries);
      if (r.status === "ok") return r.base;
      if (r.status === "off" || !d.layer.memoryOnly()) return null;
      await d.sleep(300);
    }
  }
  /** 看到别的设备清过：自己的键先清（写回去）；memory = 内存层也清（还开着稿）。 */
  async function followClear(pw: string, memory: boolean): Promise<void> {
    if (!session) return;
    const clearedAt = maxCleared();
    d.note("enc dict: cleared on another device, following");
    const own = freshPayload(clearedAt);
    await writeOwn(session.ownKey, { ...session.own, ...own }, pw);
    session.own = { ...session.own, ...own }; session.clearedAt = clearedAt;
    if (memory) { const u = unionOf(readable()); const base = await applyLayer("reset", u.entries); if (base) session.base = base; }
  }
  async function persist(snap: LayerSnapshot, pw: string, memory: boolean): Promise<void> {
    if (!session) return;
    if (changed) { await readAll(pw); }
    if (maxCleared() > session.clearedAt) { await followClear(pw, memory); return; }
    const delta = deltaOf(snap, session.base);
    if (!Object.keys(delta).length) return;
    const own: EncDictPayload = { ...session.own, entries: mergeEntries(mergeEntries({}, session.own.entries), delta), savedAt: d.now(), device: d.device() };
    await writeOwn(session.ownKey, own, pw);
    session.own = own; session.base = snap;
    d.note(`enc dict: sealed ${Object.values(delta).reduce((n, m) => n + Object.keys(m).length, 0)} words`);
  }
  async function loadTask(): Promise<void> {
    try {
      const pw = d.password();
      if (session || !pw || !d.layer.memoryOnly()) return;
      await readAll(pw);
      if (!d.layer.memoryOnly() || d.password() !== pw) return;
      const ownKey = ownKeyName();
      const u = unionOf(readable());
      let own = cache.get(ownKey)?.payload ?? null;
      if (!own || (own.clearedAt ?? 0) < u.clearedAt) {   // 还没有自己的键（第一次写词时才落）/ 没跟上别的设备的清空
        const had = own != null;
        own = { ...(own ?? {}), ...freshPayload(u.clearedAt) };
        if (had) await writeOwn(ownKey, own, pw);
      }
      const base = await applyLayer("load", u.entries);
      if (!base) return;
      session = { base, own, ownKey, clearedAt: u.clearedAt };
      d.note(`enc dict: loaded ${Object.values(u.entries).reduce((n, m) => n + Object.keys(m).length, 0)} words from ${dictKeys().length} keys`);
    } catch (e) { loadFailed = true; throw e; }   // 词库读不了（如压缩块）：这次开稿不再重试（每次重画都解一遍太贵），退回 D2：本次能联想、关稿即忘
    finally { loading = false; }
  }
  return {
    ensureLoaded() {
      if (session || loading || loadFailed || !d.password() || !d.layer.memoryOnly()) return;
      loading = true;
      void run(loadTask);
    },
    loaded: () => session != null,
    poke() {
      if (!session) return;
      stopTimer();
      timer = d.setTimer(() => { timer = null; void this.sealNow(false); }, ENC_DICT_IDLE_MS);
    },
    sealNow(flush = false) {
      return run(async () => {
        const pw = d.password();
        if (!session || !pw) return;
        const snap = await d.layer.read(flush);
        if (snap) await persist(snap, pw, true);
      }) as Promise<void>;
    },
    leave(snapshot) {
      stopTimer();
      return run(async () => {
        const snap = await snapshot, pw = d.password();
        if (session && snap && pw) await persist(snap, pw, false);
        session = null; cache.clear(); loadFailed = false;
      }) as Promise<void>;
    },
    onLocked() {
      stopTimer();
      return run(async () => {
        const had = session != null;
        session = null; cache.clear(); loadFailed = false;
        if (had) await applyLayer("reset", {});
      }) as Promise<void>;
    },
    reload() {
      return run(async () => { session = null; cache.clear(); loading = true; await loadTask(); }) as Promise<void>;
    },
    clear() {
      return run(async () => {
        const pw = d.password();
        if (!pw) return false;
        await readAll(pw);
        const clearedAt = Math.max(d.now(), maxCleared() + 1), ownKey = session?.ownKey ?? ownKeyName();
        const own: EncDictPayload = { ...(session?.own ?? cache.get(ownKey)?.payload ?? {}), ...freshPayload(clearedAt) };
        await writeOwn(ownKey, own, pw);
        if (session) {
          const base = await applyLayer("reset", {});
          session.own = own; session.clearedAt = clearedAt;
          if (base) session.base = base;
        }
        d.note("enc dict: cleared (asked here)");
        return true;
      }).then((v) => v === true);
    },
    rekey(oldPassword, newPassword) {
      return run(async () => {
        for (const key of dictKeys()) {
          const value = d.collection.getItem<string>(key);
          if (typeof value !== "string") continue;
          const bytes = await d.unseal(value, oldPassword);
          if (!bytes) continue;
          const next = await d.seal(bytes, newPassword);
          const c = cache.get(key);
          if (c) cache.set(key, { value: next, payload: c.payload });
          d.collection.setItem(key, next);
        }
      }) as Promise<void>;
    },
    noteChanged(ids) {
      if (!ids.some((id) => id.startsWith(KEY_PREFIX) && cache.get(id)?.value !== d.collection.getItem(id))) return;
      changed = true;
      if (!session) return;
      void run(async () => {
        const pw = d.password();
        if (!session || !pw) return;
        await readAll(pw);
        if (maxCleared() > session.clearedAt) await followClear(pw, true);
      });
    },
    isEmpty: () => dictKeys().length === 0,
  };
}
