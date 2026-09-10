// 工程模式控制器（app 层）：把一个 ProjectSession 绑到 textarea，节律与 txt 编辑器同款（200ms 本地 / 15s·30s 推云）。
// created 2026-09-10 by Claude Fable 5.1。UI 决定（user 委托）：跳转 = 回退栈内存态；spawn = 选中文字分裂成新节点、源稿里那段字移走；
//   占位符跳上去才生文件；无地 = LocalHome（FSA 写回或下载）。
import { LOCAL_SAVE_DEBOUNCE_MS, PUSH_DEBOUNCE_MS, PUSH_HEARTBEAT_MS } from "../config.ts";
import { createProjectSession, type ProjectSession, type OpenResult } from "./session.ts";
import { readProjectBlob, saveProjectBlob, setActiveDoc } from "../docs.ts";
import type { LocalHome } from "./local-home.ts";
import { deviceKvSet } from "../device-kv.ts";
import { replaceRange } from "../text-edit.ts";
import { reportError } from "../error-badge.ts";
import { parseDocName } from "../doc-model.ts";
import { isValidNodeName } from "./format.ts";
import type { SyncKind } from "../editor.ts";
import { t } from "../i18n/index.ts";

export type ProjectHome = { kind: "store"; name: string } | { kind: "local"; home: LocalHome };
export interface ProjectModeDeps {
  editorEl: HTMLTextAreaElement;
  setStatus: (text: string, opts?: { error?: boolean; unsynced?: boolean }) => void;
  setState: (text: string, opts?: { error?: boolean; unsynced?: boolean }) => void;
  isSignedIn: () => boolean;
  /** 身份/节点/脏态变了 → 顶栏 + 边栏重画。 */
  onChanged: () => void;
  onBeforeLoad?: () => void;
  /** spawn 的名字对话框（app 注入 in-app sheet）。返回 null = 取消。 */
  askName: (title: string, def: string, hint: string) => Promise<string | null>;
}
const KV_LAST_OPEN = "last-open";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createProjectMode(d: ProjectModeDeps) {
  let home: ProjectHome | null = null;
  let session: ProjectSession | null = null;
  let back: string[] = [];
  let localTimer: ReturnType<typeof setTimeout> | null = null;
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let firstDirtyAt = 0, pushPending = false, pushFailures = 0, gen = 0;
  let persistInFlight: Promise<void> | null = null;

  const active = () => !!session && !!home;
  const canEdit = () => active() && !session!.readOnly;
  const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
  const displayName = (): string | null => (home ? (home.kind === "store" ? parseDocName(home.name).stem : home.home.fileName.replace(/\.webxiaoheiwu\.zip$/i, "")) : null);
  const name = (): string | null => (home?.kind === "store" ? home.name : null);
  function syncKind(): SyncKind {
    if (!active()) return "none";
    if (session!.readOnly) return "unavailable";
    if (home!.kind === "local") return "local";
    if (!d.isSignedIn()) return "local";
    const dirty = pushPending || !!localTimer || session!.dirty;
    return dirty ? (isOffline() ? "offline" : "unsynced") : "clean";
  }
  function stateText(): string { return home?.kind === "local" ? (home.home.canWriteBack ? t("project.localWriteBack") : t("project.localDownloadOnly")) : ""; }

  // ── 落盘节律 ──
  function commitTextarea(): void { if (canEdit()) session!.setCurrentText(d.editorEl.value); }
  async function persist(push: boolean): Promise<void> {
    if (persistInFlight) await persistInFlight;
    const g = gen;
    const run = (async () => {
      if (g !== gen || !active() || session!.readOnly) return;
      commitTextarea();
      if (home!.kind === "local") {
        if (!session!.dirty) return;
        const r = await session!.flush(false);
        if (g !== gen) return;
        if (r.wrote) d.setStatus(home!.home.canWriteBack ? t("project.saved") : t("project.downloaded"));
        return;
      }
      const r = await session!.flush(push);
      if (g !== gen) return;
      if (r.wrote) { if (push) { if (r.pushed) { pushPending = false; pushFailures = 0; } else pushPending = true; } else pushPending = true; }
    })();
    persistInFlight = run;
    try { await run; } finally { if (persistInFlight === run) persistInFlight = null; }
  }
  function scheduleLocalSave(): void {
    if (localTimer) clearTimeout(localTimer);
    localTimer = setTimeout(() => {
      localTimer = null;
      if (home?.kind === "local") return;   // 无地：不自动写回/下载，用户 Ctrl+S / 保存钮显式触发（下载不能每 200ms 一次）
      void persist(false).then(() => { d.setState(stateText(), { unsynced: pushPending && d.isSignedIn() }); if (d.isSignedIn()) schedulePush(); })
        .catch((e) => { reportError(e); d.setStatus(t("st.saveFailed", { e: errMsg(e) }), { error: true }); });
    }, LOCAL_SAVE_DEBOUNCE_MS);
  }
  function schedulePush(extraDelayMs = 0): void {
    if (!d.isSignedIn() || home?.kind !== "store") return;
    const now = Date.now(); if (firstDirtyAt === 0) firstDirtyAt = now;
    if (pushTimer) clearTimeout(pushTimer);
    const target = Math.min(now + PUSH_DEBOUNCE_MS, firstDirtyAt + PUSH_HEARTBEAT_MS) + extraDelayMs;
    pushTimer = setTimeout(() => { void pushNow(); }, Math.max(0, target - now));
  }
  async function pushNow(): Promise<void> {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    firstDirtyAt = 0;
    if (!canEdit()) return;
    if (home!.kind === "local") { if (localTimer) { clearTimeout(localTimer); localTimer = null; } await persist(false); d.onChanged(); return; }
    if (!d.isSignedIn() || isOffline()) { if (localTimer) { clearTimeout(localTimer); localTimer = null; } try { await persist(false); } catch (e) { reportError(e, "log"); } pushPending = true; d.setState(stateText(), { unsynced: d.isSignedIn() }); return; }
    if (localTimer) { clearTimeout(localTimer); localTimer = null; }
    const g = gen;
    try {
      await persist(true);
      if (g !== gen) return;
      d.setState(stateText(), { unsynced: pushPending });
      if (pushPending) schedulePush();
    } catch (e) {
      if (g !== gen) return;
      pushFailures++; reportError(e, pushFailures === 1 ? "warning" : "log");
      d.setStatus(t("st.syncFailed", { e: errMsg(e) }), { error: true });
      pushPending = true; schedulePush(Math.min(PUSH_DEBOUNCE_MS * 2 ** Math.min(pushFailures, 5), 5 * 60_000));
    }
  }
  async function flushLocal(): Promise<void> {
    if (persistInFlight) { try { await persistInFlight; } catch { /* reported */ } }
    if (localTimer) { clearTimeout(localTimer); localTimer = null; }
    if (!canEdit() || home!.kind === "local") { commitTextarea(); return; }
    try { await persist(false); } catch (e) { reportError(e); }
  }
  function noteExternalEdit(): void { if (!canEdit()) return; scheduleLocalSave(); d.setState(stateText(), { unsynced: d.isSignedIn() }); }
  d.editorEl.addEventListener("input", () => { if (!canEdit()) return; scheduleLocalSave(); d.setState(stateText(), { unsynced: d.isSignedIn() && home?.kind === "store" }); });

  // ── 打开 / 关闭 ──
  function loadCurrentIntoEditor(): void {
    const s = session!;
    d.editorEl.value = s.currentText();
    d.editorEl.readOnly = s.readOnly;
    d.editorEl.classList.toggle("locked", s.readOnly);
    try { d.editorEl.selectionStart = d.editorEl.selectionEnd = 0; } catch { /* ignore */ }
    d.editorEl.scrollTop = 0;
  }
  function reportOpen(r: OpenResult): boolean {
    if (r.kind === "ok") { if (r.warnings.length) reportError(new Error("[project] open warnings: " + r.warnings.join("; ")), "log"); return true; }
    if (r.kind === "too-new") { d.setStatus(t("project.tooNew", { v: r.version }), { error: true }); return true; }
    d.setStatus(t(r.kind === "corrupt" ? "project.corrupt" : r.kind === "not-project" ? "project.notProject" : "project.unavailable"), { error: true });
    return false;
  }
  async function openStore(projectName: string): Promise<boolean> {
    d.onBeforeLoad?.(); await flushLocal();
    const g = ++gen;
    const s = createProjectSession({ read: readProjectBlob, write: (n, blob, o) => saveProjectBlob(n, blob, { push: o.push }) });
    d.setStatus(t("st.loading"));
    const r = await s.open(projectName);
    if (g !== gen) return false;
    home = { kind: "store", name: projectName }; session = s; back = []; pushPending = false; pushFailures = 0; firstDirtyAt = 0;
    setActiveDoc(projectName); deviceKvSet(KV_LAST_OPEN, projectName);
    const ok = reportOpen(r);
    loadCurrentIntoEditor(); d.setState(stateText()); d.onChanged();
    return ok;
  }
  async function openLocal(lh: LocalHome): Promise<boolean> {
    d.onBeforeLoad?.(); await flushLocal();
    const g = ++gen;
    const s = createProjectSession({ read: () => lh.read(), write: async (_n, blob) => { await lh.write(blob); return { pushed: false }; } });
    const r = await s.open(lh.fileName);
    if (g !== gen) return false;
    home = { kind: "local", home: lh }; session = s; back = []; pushPending = false;
    setActiveDoc(null); deviceKvSet(KV_LAST_OPEN, null);   // 本机工程不跨启动记忆（句柄不持久）
    const ok = reportOpen(r);
    loadCurrentIntoEditor(); d.setState(stateText()); d.onChanged();
    return ok;
  }
  /** 新建（store）：调用方已 createProjectDoc 得到身份；这里开一个空工程带首节点。 */
  async function createInStore(projectName: string, firstNode: string): Promise<void> {
    d.onBeforeLoad?.(); await flushLocal();
    gen++;
    const s = createProjectSession({ read: readProjectBlob, write: (n, blob, o) => saveProjectBlob(n, blob, { push: o.push }) });
    s.create(projectName, firstNode);
    home = { kind: "store", name: projectName }; session = s; back = []; pushPending = false;
    setActiveDoc(projectName); deviceKvSet(KV_LAST_OPEN, projectName);
    await s.flush(false);
    loadCurrentIntoEditor(); d.setState(stateText()); d.onChanged();
    if (d.isSignedIn()) schedulePush();
  }
  async function close(): Promise<void> {
    if (!active()) return;
    await flushLocal();
    gen++;
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    home = null; session = null; back = []; pushPending = false;
    d.editorEl.readOnly = false; d.editorEl.classList.remove("locked");
  }

  // ── 导航（不标脏） ──
  function jump(target: string): void {
    if (!active()) return;
    commitTextarea();
    const from = session!.current();
    let to: string;
    try { to = session!.jump(target); } catch (e) { d.setStatus(errMsg(e), { error: true }); return; }
    if (from && from !== to) back.push(from);
    if (session!.dirty && home!.kind === "store") scheduleLocalSave();   // 占位符生了文件 → 顺带落盘
    loadCurrentIntoEditor(); d.onChanged();
  }
  function goBack(): boolean {
    const prev = back.pop(); if (!prev || !active()) return false;
    commitTextarea();
    try { session!.jump(prev); } catch { return false; }
    loadCurrentIntoEditor(); d.onChanged(); return true;
  }
  /** spawn：选中文字 → 问名字 → 新节点带那段字、源稿里那段字移走（走 replaceRange 保 undo）、边从当前指向它、光标跳过去。 */
  async function spawnFromSelection(): Promise<boolean> {
    if (!canEdit()) return false;
    const el = d.editorEl; const start = el.selectionStart ?? 0, end = el.selectionEnd ?? 0;
    const sel = el.value.slice(start, end);
    if (!sel.trim()) { d.setStatus(t("edge.spawnNoSelection")); return false; }
    const def = defaultNodeName(sel);
    const raw = await d.askName(t("edge.spawnTitle"), def, t("edge.spawnHint"));
    if (raw == null) return false;
    const nn = normalizeNodeName(raw);
    if (!nn) { d.setStatus(t("edge.badName"), { error: true }); return false; }
    replaceRange(el, start, end, "");   // 源稿分裂：这段字移走（input 事件 → 本地节律）
    commitTextarea();
    const from = session!.current();
    const to = session!.spawn(nn, sel);
    if (from) back.push(from);
    scheduleLocalSave();
    loadCurrentIntoEditor(); d.onChanged();
    return true;
  }
  const guardEdit = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => { if (!canEdit()) return false; try { fn(...a); } catch (e) { d.setStatus(errMsg(e), { error: true }); return false; } scheduleLocalSave(); d.onChanged(); return true; };
  const addLink = guardEdit((to: string) => { const nn = normalizeNodeName(to); if (!nn) throw new Error(t("edge.badName")); session!.addLink(nn); });
  const removeLink = guardEdit((to: string) => { session!.removeLink(to); });
  const moveLink = guardEdit((to: string, dir: -1 | 1) => { const links = session!.sidebar().map((n) => n.name); const i = links.indexOf(to); const j = i + dir; if (i < 0 || j < 0 || j >= links.length) return; [links[i], links[j]] = [links[j]!, links[i]!]; session!.setLinksOrder(links); });
  const renameNode = guardEdit((from: string, to: string) => { const nn = normalizeNodeName(to); if (!nn) throw new Error(t("edge.badName")); commitTextarea(); session!.rename(from, nn); if (session!.current() === nn) loadCurrentIntoEditor(); });
  const deleteNode = guardEdit((target: string) => { const wasCurrent = session!.current() === target; session!.remove(target); if (wasCurrent) { const next = back.pop() ?? [...session!.project.contents.keys()].sort()[0] ?? null; if (next) session!.jump(next); loadCurrentIntoEditor(); } });

  return {
    active, canEdit, name, displayName, syncKind, stateText, home: () => home, session: () => session,
    openStore, openLocal, createInStore, close, flushLocal, pushNow, noteExternalEdit,
    jump, goBack, canGoBack: () => back.length > 0, spawnFromSelection, addLink, removeLink, moveLink, renameNode, deleteNode,
    current: () => session?.current() ?? null,
  };
}
export type ProjectMode = ReturnType<typeof createProjectMode>;

/** spawn 默认名：选中文字首行前 12 个字（去路径字符）+ .txt。 */
export function defaultNodeName(sel: string): string {
  const head = sel.trim().split(/\r?\n/)[0]!.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 12);
  return (head || "node") + ".txt";
}
/** 用户输入 → 合法节点名（没扩展名补 .txt；非法 → null）。 */
export function normalizeNodeName(raw: string): string | null {
  let n = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!n) return null;
  if (!/\.[A-Za-z0-9]{1,8}$/.test(n)) n += ".txt";
  return isValidNodeName(n) ? n : null;
}
