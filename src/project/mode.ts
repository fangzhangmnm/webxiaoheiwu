// 工程模式控制器（app 层）：把一个 ProjectSession 绑到 textarea + 章节名框，节律与 txt 编辑器同款（200ms 本地 / 15s·30s 推云）。
// created 2026-09-10 by Claude Fable 5.1。UI 决定（user 委托）：跳转 = 回退栈内存态；spawn = 选中文字分裂成新节点、源稿里那段字移走；
//   占位符跳上去才生文件；无地 = LocalHome（FSA 写回或下载）。
// 2026-09-10 晚 user 打回后：节点名 = 纸面顶部的章节名框（v0.2.15 被 ADR-0007 撤掉的 #titleInput 捞回来当节点名用——
//   「节点名就用之前很可惜被弃置的章节名的 ui」「当前节点的改名也用这个章节名的机制」）；新节点 = 「第 N 章」直接生、不弹框（「新建节点用 list 最下面的一个加号按钮」
//   「默认节点就叫第一章」）；新边加末尾（「节点应该加在末尾」）；显示不带扩展名（「吃书：还是不显示扩展名吧」）。
import { LOCAL_SAVE_DEBOUNCE_MS, PUSH_DEBOUNCE_MS, PUSH_HEARTBEAT_MS } from "../config.ts";
import { createProjectSession, type ProjectSession, type OpenResult } from "./session.ts";
import { readProjectBlob, saveProjectBlob, setActiveDoc, isDocEncrypted, encryptDoc, decryptDoc, renameDocToOpaque } from "../docs.ts";
import type { LocalHome } from "./local-home.ts";
import { deviceKvSet } from "../device-kv.ts";
import { replaceRange } from "../text-edit.ts";
import { reportError } from "../error-badge.ts";
import { parseDocName } from "../doc-model.ts";
import { isValidNodeName, nameKey } from "./format.ts";
import { nextChapterName, nodeDisplayName } from "./naming.ts";
import type { SyncKind } from "../editor.ts";
import { t } from "../i18n/index.ts";

export type ProjectHome = { kind: "store"; name: string } | { kind: "local"; home: LocalHome };
export interface ProjectModeDeps {
  editorEl: HTMLTextAreaElement;
  /** 章节名框（纸面顶部；工程模式才显示）：显示当前节点名（不带 .txt），改了 = 改名。 */
  titleEl: HTMLInputElement;
  setStatus: (text: string, opts?: { error?: boolean; unsynced?: boolean }) => void;
  setState: (text: string, opts?: { error?: boolean; unsynced?: boolean }) => void;
  isSignedIn: () => boolean;
  /** 身份/节点/脏态变了 → 顶栏 + 边栏重画。 */
  onChanged: () => void;
  onBeforeLoad?: () => void;
  /** 加密：解锁循环（手势里才调）；锁态查询；锁态变化订阅（crypto-state）。 */
  isUnlocked: () => boolean;
  ensureUnlocked: () => Promise<boolean>;
  onLockChange: (cb: (unlocked: boolean) => void) => void;
}
const KV_LAST_OPEN = "last-open";
const TITLE_DEBOUNCE_MS = 500;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createProjectMode(d: ProjectModeDeps) {
  let home: ProjectHome | null = null;
  let session: ProjectSession | null = null;
  let back: string[] = [];
  let localTimer: ReturnType<typeof setTimeout> | null = null;
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let firstDirtyAt = 0, pushPending = false, pushFailures = 0, gen = 0;
  let persistInFlight: Promise<void> | null = null;
  let titleTimer: ReturnType<typeof setTimeout> | null = null;
  let encrypted = false, locked = false;   // 工程整包加密（store 透明层）：locked = 加密且未解锁 → 空白只读，锁图标 = 手势才弹密码

  const active = () => !!session && !!home;
  const canEdit = () => active() && !session!.readOnly && !locked;
  const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
  const displayName = (): string | null => (home ? (home.kind === "store" ? parseDocName(home.name).stem : home.home.fileName.replace(/\.webxiaoheiwu\.zip$/i, "")) : null);
  const name = (): string | null => (home?.kind === "store" ? home.name : null);
  function syncKind(): SyncKind {
    if (!active()) return "none";
    if (locked) return "locked";
    if (session!.readOnly) return "unavailable";
    if (home!.kind === "local") return "local";
    if (!d.isSignedIn()) return "local";
    const dirty = pushPending || !!localTimer || session!.dirty;
    return dirty ? (isOffline() ? "offline" : "unsynced") : "clean";
  }
  function stateText(): string { return home?.kind === "local" ? (home.home.canWriteBack ? t("project.localWriteBack") : t("project.localDownloadOnly")) : ""; }

  // ── 章节名框 = 当前节点名（改了就是改名；撞名响亮、不吞）──
  function syncTitle(): void { const cur = session?.current() ?? null; d.titleEl.value = cur ? nodeDisplayName(cur) : ""; }
  /** 把章节名框里的字落成改名。返回 true = 名字已与框一致（含「没改」）；false = 没落成（撞名/非法），框保留用户打的字让人改。 */
  function commitTitle(): boolean {
    if (titleTimer) { clearTimeout(titleTimer); titleTimer = null; }
    if (!canEdit()) return true;
    const cur = session!.current(); if (!cur) return true;
    const raw = d.titleEl.value.replace(/[\r\n]+/g, " ");
    if (!raw.trim()) { syncTitle(); return true; }   // 空 = 不改名（有名保名）
    const nn = normalizeNodeName(raw);
    if (!nn) { d.setStatus(t("edge.badName"), { error: true }); return false; }
    if (nn === cur) { syncTitle(); return true; }
    if (nameKey(nn) !== nameKey(cur) && session!.exists(nn)) { d.setStatus(t("edge.nameTaken"), { error: true }); return false; }
    try { session!.rename(cur, nn); } catch (e) { d.setStatus(errMsg(e), { error: true }); return false; }
    syncTitle(); scheduleLocalSave(); d.onChanged();
    return true;
  }
  function scheduleTitle(): void { if (titleTimer) clearTimeout(titleTimer); titleTimer = setTimeout(() => { titleTimer = null; commitTitle(); }, TITLE_DEBOUNCE_MS); }
  d.titleEl.addEventListener("input", () => { if (!canEdit()) { syncTitle(); return; } scheduleTitle(); d.setState(stateText(), { unsynced: d.isSignedIn() && home?.kind === "store" }); });
  d.titleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); if (commitTitle()) d.editorEl.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); if (titleTimer) { clearTimeout(titleTimer); titleTimer = null; } syncTitle(); d.editorEl.focus(); }
  });
  d.titleEl.addEventListener("blur", () => { if (!commitTitle()) syncTitle(); });   // 离开框还没落成 → 回显真名，别留个假名字在屏上
  /** 让编辑器自己起名：焦点到章节名框并全选（新节点 / 分裂后）。 */
  function focusTitle(): void { try { d.titleEl.focus(); d.titleEl.select(); } catch { /* ignore */ } }

  // ── 落盘节律 ──
  function commitTextarea(): void { if (canEdit()) session!.setCurrentText(d.editorEl.value); }
  /** 切节点 / 落盘前：章节名框 + 正文都先落进内存图。 */
  function commitEditor(): void { commitTitle(); commitTextarea(); }
  async function persist(push: boolean): Promise<void> {
    if (persistInFlight) await persistInFlight;
    const g = gen;
    const run = (async () => {
      if (g !== gen || !active() || session!.readOnly) return;
      commitEditor();
      if (home!.kind === "local") {
        if (!session!.dirty) return;
        const r = await session!.flush(false);
        if (g !== gen) return;
        if (r.wrote) d.setStatus(home!.home.canWriteBack ? t("project.saved") : t("project.downloaded"));
        return;
      }
      const r = await session!.flush(push, { force: push && pushPending });   // 推云：本地落盘已清 dirty，同一份字节还得以 tryPush 交给库（否则永远推不出去）
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
    if (!canEdit() || home!.kind === "local") { commitEditor(); return; }
    try { await persist(false); } catch (e) { reportError(e); }
  }
  function noteExternalEdit(): void { if (!canEdit()) return; scheduleLocalSave(); d.setState(stateText(), { unsynced: d.isSignedIn() }); }
  d.editorEl.addEventListener("input", () => { if (!canEdit()) return; scheduleLocalSave(); d.setState(stateText(), { unsynced: d.isSignedIn() && home?.kind === "store" }); });

  // ── 打开 / 关闭 ──
  function loadCurrentIntoEditor(): void {
    const s = session!;
    if (titleTimer) { clearTimeout(titleTimer); titleTimer = null; }
    d.editorEl.value = s.currentText();
    d.editorEl.readOnly = s.readOnly;
    d.editorEl.classList.toggle("locked", s.readOnly);
    syncTitle(); d.titleEl.readOnly = s.readOnly; d.titleEl.classList.toggle("locked", s.readOnly);
    try { d.editorEl.selectionStart = d.editorEl.selectionEnd = 0; } catch { /* ignore */ }
    d.editorEl.scrollTop = 0;
  }
  function reportOpen(r: OpenResult): boolean {
    if (r.kind === "ok") { if (r.warnings.length) reportError(new Error("[project] open warnings: " + r.warnings.join("; ")), "log"); return true; }
    if (r.kind === "too-new") { d.setStatus(t("project.tooNew", { v: r.version }), { error: true }); return true; }
    d.setStatus(t(r.kind === "corrupt" ? "project.corrupt" : r.kind === "not-project" ? "project.notProject" : "project.unavailable"), { error: true });
    return false;
  }
  function enterLocked(projectName: string): void {
    home = { kind: "store", name: projectName }; session = createProjectSession({ read: readProjectBlob, write: (n, blob, o) => saveProjectBlob(n, blob, { push: o.push }) });
    encrypted = true; locked = true; back = []; pushPending = false;
    setActiveDoc(projectName); deviceKvSet(KV_LAST_OPEN, projectName);
    d.editorEl.value = ""; d.editorEl.readOnly = true; d.editorEl.classList.add("locked");
    d.titleEl.value = ""; d.titleEl.readOnly = true; d.titleEl.classList.add("locked");
    d.setState(""); d.onChanged();
  }
  /** promptUnlock：只有用户手势（图库点开 / 锁图标）才弹密码框——「加密永不自动弹框」。 */
  async function openStore(projectName: string, opts: { promptUnlock?: boolean } = {}): Promise<boolean> {
    d.onBeforeLoad?.(); await flushLocal();
    const g = ++gen;
    encrypted = false; locked = false;
    try { encrypted = await isDocEncrypted(projectName); } catch { encrypted = false; }
    if (g !== gen) return false;
    if (encrypted && !d.isUnlocked()) {
      enterLocked(projectName);
      if (!opts.promptUnlock) return true;
      const ok = await d.ensureUnlocked();
      if (g !== gen) return false;
      if (!ok) return true;
    }
    const s = createProjectSession({ read: readProjectBlob, write: (n, blob, o) => saveProjectBlob(n, blob, { push: o.push }) });
    d.setStatus(t("st.loading"));
    const r = await s.open(projectName);
    if (g !== gen) return false;
    home = { kind: "store", name: projectName }; session = s; locked = false; back = []; pushPending = false; pushFailures = 0; firstDirtyAt = 0;
    setActiveDoc(projectName); deviceKvSet(KV_LAST_OPEN, projectName);
    if (r.kind === "unavailable" && encrypted) { enterLocked(projectName); d.setStatus(t("st.wrongPasswordOrLocked"), { error: true }); return true; }   // 密码解不开这份（别的密码）
    const ok = reportOpen(r);
    if (ok && r.kind === "ok") d.setStatus("");   // 收掉「加载中…」
    loadCurrentIntoEditor(); d.setState(stateText()); d.onChanged();
    return ok;
  }
  /** 工程文件在 store 里改了名（顶栏改名）：只换身份，不重开、不重载正文、回退栈不丢。 */
  function adoptName(newName: string): void {
    if (!session || home?.kind !== "store") return;
    home = { kind: "store", name: newName }; session.adoptName(newName);
    setActiveDoc(newName); deviceKvSet(KV_LAST_OPEN, newName);
    d.onChanged();
  }
  /** 锁图标 / 锁卡手势：重开并弹密码。 */
  async function unlock(): Promise<boolean> { const n = name(); if (!n || !locked) return false; return openStore(n, { promptUnlock: true }); }
  /** 顶栏加密开关（镜像 txt 编辑器 toggleEncryption）：明文 → 封 + 藏标题改日期码；加密 → 确认 → 解封。 */
  async function toggleEncryption(confirmDecrypt: () => Promise<boolean>, busy: <T>(label: string, fn: () => Promise<T>) => Promise<T>): Promise<void> {
    const n = name(); if (!n || home?.kind !== "store") return;
    if (locked) { await unlock(); return; }
    await flushLocal();
    if (!encrypted) {
      if (!(await d.ensureUnlocked())) return;
      let sealed = false;
      try { await busy(t("busy.encrypting"), () => encryptDoc(n)); sealed = true; encrypted = true; }
      catch (e) { reportError(e); d.setStatus(t("st.encryptFailed", { e: errMsg(e) }), { error: true }); }
      if (sealed) {
        let renamed: { name: string; oldKept?: boolean } | null = null;
        try { renamed = await renameDocToOpaque(n); } catch (e) { reportError(e, "warning"); }
        if (!renamed) d.setStatus(t("st.encryptedNameKept", { name: parseDocName(n).stem }), { error: true });
        else if (renamed.oldKept) d.setStatus(t("st.renameOldKept"), { error: true });
        else d.setStatus(t("st.encryptedRenamed", { time: new Date().toLocaleTimeString("zh-CN", { hour12: false }), name: parseDocName(renamed.name).stem }));
        if (renamed && renamed.name !== n) await openStore(renamed.name);   // 身份换了：按新名重开（字节同一份）
      }
      d.onChanged();
      return;
    }
    if (!(await confirmDecrypt())) return;
    try { const r = await busy(t("busy.decrypting"), () => decryptDoc(n)); encrypted = false; d.setStatus(t("st.decrypted", { time: new Date().toLocaleTimeString("zh-CN", { hour12: false }), status: r.status })); }
    catch (e) { reportError(e); d.setStatus(t("st.decryptFailed", { e: errMsg(e) }), { error: true }); }
    d.onChanged();
  }
  d.onLockChange((unlocked) => { if (!unlocked && active() && encrypted && home?.kind === "store") { const n = name()!; void flushLocal().then(() => { if (name() === n) enterLocked(n); }); } });
  async function openLocal(lh: LocalHome): Promise<boolean> {
    d.onBeforeLoad?.(); await flushLocal();
    const g = ++gen;
    const s = createProjectSession({ read: () => lh.read(), write: async (_n, blob) => { await lh.write(blob); return { pushed: false }; } });
    const r = await s.open(lh.fileName);
    if (g !== gen) return false;
    home = { kind: "local", home: lh }; session = s; back = []; pushPending = false; encrypted = false; locked = false;
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
    home = { kind: "store", name: projectName }; session = s; back = []; pushPending = false; encrypted = false; locked = false;
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
    if (titleTimer) { clearTimeout(titleTimer); titleTimer = null; }
    home = null; session = null; back = []; pushPending = false; encrypted = false; locked = false;
    d.editorEl.readOnly = false; d.editorEl.classList.remove("locked");
    d.titleEl.value = ""; d.titleEl.readOnly = false; d.titleEl.classList.remove("locked");
  }

  // ── 导航（不标脏） ──
  function jump(target: string): void {
    if (!active()) return;
    commitEditor();
    const from = session!.current();
    let to: string;
    try { to = session!.jump(target); } catch (e) { d.setStatus(errMsg(e), { error: true }); return; }
    if (from && from !== to) back.push(from);
    if (session!.dirty && home!.kind === "store") scheduleLocalSave();   // 占位符生了文件 → 顺带落盘
    loadCurrentIntoEditor(); d.onChanged();
  }
  function goBack(): boolean {
    const prev = back.pop(); if (!prev || !active()) return false;
    commitEditor();
    try { session!.jump(prev); } catch { return false; }
    loadCurrentIntoEditor(); d.onChanged(); return true;
  }
  /** spawn：选中文字 → 新节点带那段字（名字 = 选中首行前 12 字，撞名则退到「第 N 章」；不弹框，改名在章节名框）、源稿里那段字移走（走 replaceRange 保 undo）、
   *  边从当前指向它（末尾）、光标跳过去、章节名框全选待改。 */
  async function spawnFromSelection(): Promise<boolean> {
    if (!canEdit()) return false;
    commitTitle();
    const el = d.editorEl; const start = el.selectionStart ?? 0, end = el.selectionEnd ?? 0;
    const sel = el.value.slice(start, end);
    if (!sel.trim()) { d.setStatus(t("edge.spawnNoSelection")); return false; }
    let nn = normalizeNodeName(defaultNodeName(sel));
    if (!nn || session!.exists(nn)) nn = nextChapterName(session!.project.contents.keys());   // 撞名不许静默并进别人的节点（那会把选中的字弄丢）
    replaceRange(el, start, end, "");   // 源稿分裂：这段字移走（input 事件 → 本地节律）
    commitTextarea();
    const from = session!.current();
    session!.spawn(nn, sel);
    if (from) back.push(from);
    scheduleLocalSave();
    loadCurrentIntoEditor(); d.onChanged();
    focusTitle();
    return true;
  }
  /** 「+」新节点：「第 N 章」直接生（不弹框），边加在当前节点末尾，跳过去，章节名框全选待改。 */
  function newNode(): boolean {
    if (!canEdit()) return false;
    commitEditor();
    const nn = nextChapterName(session!.project.contents.keys());
    const from = session!.current();
    try { session!.spawn(nn, ""); } catch (e) { d.setStatus(errMsg(e), { error: true }); return false; }
    if (from) back.push(from);
    scheduleLocalSave();
    loadCurrentIntoEditor(); d.onChanged();
    focusTitle();
    return true;
  }
  const guardEdit = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => { if (!canEdit()) return false; try { fn(...a); } catch (e) { d.setStatus(errMsg(e), { error: true }); return false; } scheduleLocalSave(); d.onChanged(); return true; };
  const addLink = guardEdit((to: string) => { const nn = normalizeNodeName(to); if (!nn) throw new Error(t("edge.badName")); session!.addLink(nn); });
  const removeLink = guardEdit((to: string) => { session!.removeLink(to); });
  const moveLink = guardEdit((to: string, dir: -1 | 1) => { const links = session!.sidebar().map((n) => n.name); const i = links.indexOf(to); const j = i + dir; if (i < 0 || j < 0 || j >= links.length) return; [links[i], links[j]] = [links[j]!, links[i]!]; session!.setLinksOrder(links); });
  const deleteNode = guardEdit((target: string) => { commitEditor(); const wasCurrent = session!.current() === target; session!.remove(target); if (wasCurrent) { const next = back.pop() ?? [...session!.project.contents.keys()].sort()[0] ?? null; if (next) session!.jump(next); loadCurrentIntoEditor(); } });

  return {
    active, canEdit, name, displayName, syncKind, stateText, home: () => home, session: () => session,
    encrypted: () => encrypted, locked: () => locked, unlock, toggleEncryption,
    openStore, openLocal, createInStore, adoptName, close, flushLocal, pushNow, noteExternalEdit,
    jump, goBack, canGoBack: () => back.length > 0, spawnFromSelection, newNode, addLink, removeLink, moveLink, deleteNode, commitTitle, focusTitle,
    current: () => session?.current() ?? null,
  };
}
export type ProjectMode = ReturnType<typeof createProjectMode>;

/** spawn 默认名：选中文字首行前 12 个字（去路径字符）。空 → ""（调用方退到章节名）。 */
export function defaultNodeName(sel: string): string {
  return sel.trim().split(/\r?\n/)[0]!.replace(/[\\/:*?"<>|.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 12);
}
/** 用户输入 → 合法节点名（没扩展名补 .txt；非法 → null）。 */
export function normalizeNodeName(raw: string): string | null {
  let n = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!n) return null;
  if (!/\.[A-Za-z0-9]{1,8}$/.test(n)) n += ".txt";
  return isValidNodeName(n) ? n : null;
}
