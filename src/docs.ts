// docs —— 文档层：store 之上的「一篇稿」动词集（列表订阅 / 读 / 写 / 改名 / 回收站 / 加密切换 / 新鲜度）。
// created 2026-09-03 by Claude Fable 5.1
// 红线全在库里 enforce（If-Match / .trash / 冲突 sheet / dirty 永不驱逐）；本层只做：文件名约定、文本编码、把库的结果式返回翻成 UI 能画的东西。
// 类型只从 @internal/store 拿（import type）；值级 store 面一律经 app-store 的 requireStore()。

import type { SyncState, FolderSnapshot, SaveResult, FreshResult, DelResult, TrashItem, RawFile, WatchFolderErrorPhase } from "@internal/store";
import { requireStore, isCached, isDirty, setActiveFileName } from "./app-store.ts";
import { isUnlocked } from "./crypto-state.ts";
import { isDocName, parseDocName, makeDocName, collisionCandidate, compareDocNamesDesc, decodeTextBytes, encodeText, formatDate, type TextEncodingName } from "./doc-model.ts";

export interface DocListItem {
  name: string;          // 身份（全名，含 .txt）
  stem: string;          // 显示名
  title: string;
  date: string | null;
  syncState: SyncState;
  cached: boolean;
  dirty: boolean;
  /** true/false = 本地字节已判；null = 未缓存、不知道（列表不为此下载）。 */
  encrypted: boolean | null;
  lastModified?: number;
  size?: number;
}
export interface DocListFrame { items: DocListItem[]; complete: boolean; stale: boolean }

const file = (name: string, mode: "new" | "existing" = "existing"): RawFile => requireStore().file(name, { isZip: false, mode });

// ── 列表（唯一列举面 = watchFolder 根夹；只认 *.txt 直属项）──
const _encCache = new Map<string, { key: string; value: boolean }>();   // name → 本地字节是否容器（按 lastModified+size 失效）
export function invalidateEncryptedFlag(name: string): void { _encCache.delete(name); }

export function watchDocs(cb: (frame: DocListFrame) => void, opts?: { onError?: (err: unknown, phase: WatchFolderErrorPhase) => void }): () => void {
  let gen = 0;
  const emit = (snap: FolderSnapshot) => {
    const myGen = ++gen;
    const items: DocListItem[] = snap.items.filter((it) => isDocName(it.path)).map((it) => {
      const p = parseDocName(it.path);
      const key = `${it.lastModified ?? 0}:${it.size ?? 0}`;
      const enc = _encCache.get(it.path);
      return {
        name: it.path, stem: p.stem, title: p.title, date: p.date,
        syncState: it.syncState, cached: isCached(it.syncState), dirty: isDirty(it.syncState),
        encrypted: enc && enc.key === key ? enc.value : null,
        lastModified: it.lastModified, size: it.size,
      };
    }).sort((a, b) => compareDocNamesDesc(a.name, b.name));
    cb({ items, complete: snap.complete, stale: !!snap.stale });
    // 二阶段：本地已缓存但加密态未知的项，读本地字节判容器（零网络），判完再闪一帧。
    const pending = items.filter((it) => it.cached && it.encrypted == null);
    if (!pending.length) return;
    void Promise.all(pending.map(async (it) => {
      try {
        const v = await file(it.name).isEncrypted();
        _encCache.set(it.name, { key: `${it.lastModified ?? 0}:${it.size ?? 0}`, value: v });
        it.encrypted = v;
      } catch { /* leave unknown */ }
    })).then(() => { if (myGen === gen) cb({ items, complete: snap.complete, stale: !!snap.stale }); });
  };
  return requireStore().files.watchFolder("", emit, opts);
}

// ── 读 ──
export type ReadDocResult =
  | { kind: "ok"; text: string; encoding: TextEncodingName; encrypted: boolean }
  | { kind: "locked" }          // 加密件且未解锁：不弹窗，由调用方走解锁循环
  | { kind: "other-password" }  // 加密件、已解锁，但当前/已记密码开不了 → 这篇用的是别的密码，调用方走「这篇稿的密码」循环
  | { kind: "unavailable" };    // 本地无且云端不可达

export async function readDoc(name: string): Promise<ReadDocResult> {
  const f = file(name);
  const encrypted = await f.isEncrypted().catch(() => false);
  if (encrypted && !isUnlocked()) return { kind: "locked" };
  const blob = await f.open();
  if (!blob) return encrypted ? { kind: "other-password" } : { kind: "unavailable" };
  const { text, encoding } = decodeTextBytes(new Uint8Array(await blob.arrayBuffer()));
  return { kind: "ok", text, encoding, encrypted };
}

// ── 写（本地一定落；push 是 best-effort，读 pushed/resolution）──
export async function saveDoc(name: string, text: string, opts: { push: boolean }): Promise<SaveResult> {
  return await file(name).save(encodeText(text), { tryPush: opts.push });
}

/** 新建（惰性物化：编辑器在首次有内容时才调）。撞名自动追加 " 1"…；返回最终身份。 */
export async function createDoc(title: string, text: string, date = formatDate(Date.now())): Promise<string> {
  const base = makeDocName(date, title);
  const files = requireStore().files;
  for (let n = 0; n < 200; n++) {
    const cand = collisionCandidate(base, n);
    if (await files.nameOccupied(cand)) continue;
    await file(cand, "new").save(encodeText(text), { tryPush: false });
    return cand;
  }
  throw new Error("too many name collisions creating a document");
}

/** 改标题 = 改身份（tryMove）。撞名追加后缀。返回新名（未变 → 原名）；失败 → null（调用方报错）。 */
export async function renameDoc(name: string, newTitle: string): Promise<string | null> {
  const p = parseDocName(name);
  const base = makeDocName(p.date ?? formatDate(Date.now()), newTitle);
  if (base === name) return name;
  const f = file(name);
  for (let n = 0; n < 50; n++) {
    const cand = collisionCandidate(base, n);
    if (cand === name) return name;
    const r = await f.tryMove(cand);
    if (r.ok) { invalidateEncryptedFlag(name); return cand; }
    if (r.reason !== "name-collision") return null;
  }
  return null;
}

export function trashDoc(name: string): Promise<DelResult> { return file(name).delete(); }

/** 事件驱动干净快进（focus/online/idle 复查）。status: fast-forwarded → 调用方整体重载；escaped/其余 → 不动。 */
export function pullDocIfClean(name: string, opts?: { onReplaceStart?: () => void; probe?: Promise<unknown> }): Promise<FreshResult> {
  return file(name).pullIfClean(opts);
}

export function setActiveDoc(name: string | null): void { setActiveFileName(name); }

// ── 加密切换（密码在 crypto-state 内存里；库负责先本地后云 If-Match、错密码前置出局）──
export async function encryptDoc(name: string): Promise<{ status: string }> { const r = await file(name).encrypt(); invalidateEncryptedFlag(name); return r; }
export async function decryptDoc(name: string): Promise<{ status: string }> { const r = await file(name).decrypt(); invalidateEncryptedFlag(name); return r; }
export function verifyDocPassword(name: string, pw: string): Promise<boolean> { return file(name).verifyPassword(pw); }

// ── 回收站（两端聚合；只元数据）──
export interface TrashDocItem { name: string; stem: string; ts: string | null; side: TrashItem["side"]; encrypted: boolean; conflictLive: boolean; localKey: string | null; cloudRef: string | null }
export async function listTrash(): Promise<TrashDocItem[]> {
  const items = await requireStore().files.listTrash();
  return items.map((it) => ({ name: it.name, stem: parseDocName(it.name).stem, ts: it.ts, side: it.side, encrypted: it.encrypted, conflictLive: it.conflictLive, localKey: it.localKey, cloudRef: it.cloudRef }))
    .sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? "") || compareDocNamesDesc(a.name, b.name));
}
export async function restoreDoc(it: TrashDocItem): Promise<string> {
  const r = await requireStore().files.restoreTrash({ trashKey: it.localKey, fromCloud: !!it.cloudRef, cloudRef: it.cloudRef, targetName: it.name, encrypted: it.encrypted });
  return r.name ?? it.name;
}
export async function purgeDoc(it: TrashDocItem): Promise<void> {
  await requireStore().files.purgeTrash({ trashKey: it.localKey, cloudRef: it.cloudRef });
}
export async function emptyTrash(): Promise<number> {
  const r = await requireStore().files.emptyTrash({ scope: "both" });
  return r.purged ?? 0;
}
