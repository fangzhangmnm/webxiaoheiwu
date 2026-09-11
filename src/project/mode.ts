// 书模式控制器（app 层）：把一个 ProjectSession 绑到 textarea + 章节名框，节律与 txt 编辑器同款（200ms 本地 / 15s·30s 推云）。
// created 2026-09-10 by Claude Fable 5.1；v2 树动词（ADR-0014）同日由树 session 接入。UI 决定（user 委托）：跳转 = 回退栈内存态；无地 = LocalHome（FSA 写回或下载）。
//   占位符已废（ADR-0014 §4）：跳到没有的名字 = 报错不生文件；「+ 兄弟」「+ 子节」当场建空文件并入树；散页上「+ 子节」= 链出去的新散页（spawn）。
//   上一页 / 下一页 = 全树前序 DFS（首尾不绕回，散页灰）；「导出这一支」= 子树 DFS 拼成一篇 txt（app 层落库 / 下载）。
// 2026-09-10 晚 user 打回后：节点名 = 纸面顶部的章节名框（v0.2.15 被 ADR-0007 撤掉的 #titleInput 捞回来当节点名用——
//   「节点名就用之前很可惜被弃置的章节名的 ui」「当前节点的改名也用这个章节名的机制」）；新节点 = 「第 N 章」直接生、不弹框（「新建节点用 list 最下面的一个加号按钮」
//   「默认节点就叫第一章」）；新边加末尾（「节点应该加在末尾」）；显示不带扩展名（「吃书：还是不显示扩展名吧」）。
import { PUSH_DEBOUNCE_MS, PUSH_HEARTBEAT_MS } from "../config.ts";
import { bookLocalDebounceMs } from "./cadence.ts";
import { createProjectSession, type ProjectSession, type OpenResult } from "./session.ts";
import { readProjectBlob, saveProjectBlob, setActiveDoc, isDocEncrypted, encryptDoc, decryptDoc, renameDocToOpaque } from "../docs.ts";
import { LocalWriteDeniedError, type LocalHome } from "./local-home.ts";
import { deviceKvSet } from "../device-kv.ts";
import { replaceRange } from "../text-edit.ts";
import { reportError } from "../error-badge.ts";
import { parseDocName, hex4 } from "../doc-model.ts";
import { isValidNodeName, nameKey, nodeKind, nodeExt, type NodeKind } from "./format.ts";
import { nodeDisplayName } from "./naming.ts";
import type { SyncKind } from "../editor.ts";
import { t } from "../i18n/index.ts";

export type ProjectHome = { kind: "store"; name: string } | { kind: "local"; home: LocalHome };
export interface ProjectModeDeps {
  editorEl: HTMLTextAreaElement;
  /** 章节名框（纸面顶部；工程模式才显示）：显示当前节点名（不带 .txt），改了 = 改名。图片页显示 stem，扩展名锁死。 */
  titleEl: HTMLInputElement;
  /** 图片页视图（2.1）：#pageImage 容器 / <img> / 元信息行。当前页是图片时 textarea 让位。 */
  imageBox: HTMLElement;
  imageEl: HTMLImageElement;
  imageMeta: HTMLElement;
  /** 图片元信息行文案（宿主 i18n）。 */
  imageMetaText: (o: { name: string; w: number; h: number; bytes: number }) => string;
  setStatus: (text: string, opts?: { error?: boolean; unsynced?: boolean }) => void;
  setState: (text: string, opts?: { error?: boolean; unsynced?: boolean }) => void;
  isSignedIn: () => boolean;
  /** 身份/节点/脏态变了 → 顶栏 + 边栏重画。 */
  onChanged: () => void;
  onBeforeLoad?: () => void;
  /** 新节点 / 分裂的名字框（app 注入 in-app sheet）。返回 null = 取消。 */
  askName: (title: string, def: string, hint: string) => Promise<string | null>;
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
  let forward: string[] = [];   // 前进栈 = 回退的逆（user 2026-09-10「既然有 back 了也加一个右箭头」）；内存态不进 editor-state——任何新导航即清空（同浏览器历史）
  let localTimer: ReturnType<typeof setTimeout> | null = null;
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let firstDirtyAt = 0, pushPending = false, pushFailures = 0, gen = 0;
  let persistInFlight: Promise<void> | null = null;
  let lastPersistMs = 0;   // 上次整包落盘（打包 + 写）耗时 → 本地防抖随体重放缓（ADR-0015 b）
  let titleTimer: ReturnType<typeof setTimeout> | null = null;
  let encrypted = false, locked = false;   // 工程整包加密（store 透明层）：locked = 加密且未解锁 → 空白只读，锁图标 = 手势才弹密码
  const userReadOnly = (): boolean => session?.project.readOnly ?? false;   // 修改锁跟着作品（graph.json readOnly；user 2026-09-10「zip 锁跟着作品」——成品不想被误改，不是本机名单）

  const syncBack = () => { session?.setBack(back); };
  const pushBack = (n: string) => { back.push(n); if (back.length > 50) back.shift(); forward = []; syncBack(); };   // 新导航 = 前进栈作废
  const popBack = (): string | undefined => { const v = back.pop(); syncBack(); return v; };
  const renameInBack = (from: string, to: string) => { let hit = false; back = back.map((n) => (n === from ? (hit = true, to) : n)); if (hit) syncBack(); forward = forward.map((n) => (n === from ? to : n)); };
  const active = () => !!session && !!home;
  const canEdit = () => active() && !locked && session!.canMutate();   // 改动能不能做 = session 说了算（锁在工件层）；locked = 加密未解锁
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
  const currentKind = (): NodeKind | null => { const c = session?.current(); return c ? nodeKind(c) : null; };
  const stemOf = (n: string): string => { const i = n.lastIndexOf("."); return i > 0 ? n.slice(0, i) : n; };
  function syncTitle(): void { const cur = session?.current() ?? null; d.titleEl.value = cur ? (nodeKind(cur) === "image" ? stemOf(cur) : nodeDisplayName(cur)) : ""; }
  /** 把章节名框里的字落成改名。返回 true = 名字已与框一致（含「没改」）；false = 没落成（撞名/非法），框保留用户打的字让人改。 */
  function commitTitle(): boolean {
    if (titleTimer) { clearTimeout(titleTimer); titleTimer = null; }
    if (!canEdit()) return true;
    const cur = session!.current(); if (!cur) return true;
    const raw = d.titleEl.value.replace(/[\r\n]+/g, " ");
    if (!raw.trim()) { syncTitle(); return true; }   // 空 = 不改名（有名保名）
    // 图片页：扩展名锁死（框里只显示 stem；打了 .jpg 也剥掉再补真实扩展名）——改名不能把一张图改成 .txt
    const nn = nodeKind(cur) === "image" ? (() => { const ext = nodeExt(cur); const stem = raw.trim().replace(/\s+/g, " ").replace(new RegExp(`\\.${ext}$`, "i"), ""); const n = `${stem}.${ext}`.normalize("NFC"); return stem && isValidNodeName(n) ? n : null; })() : normalizeNodeName(raw);
    if (!nn) { d.setStatus(t("edge.badName"), { error: true }); return false; }
    if (nn === cur) { syncTitle(); return true; }
    if (nameKey(nn) !== nameKey(cur) && session!.exists(nn)) { d.setStatus(t("edge.nameTaken"), { error: true }); return false; }
    try { session!.rename(cur, nn); } catch (e) { d.setStatus(errMsg(e), { error: true }); return false; }
    renameInBack(cur, nn);
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
  function commitTextarea(): void { if (canEdit() && session!.current() && currentKind() !== "image") session!.setCurrentText(d.editorEl.value); }   // 图片页的 textarea 是空壳，绝不提交   // 打不开的书 = 空 session 没有当前页，别把 textarea 提交进去（2026-09-10 审计抓到「no current node」）
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
      const t0 = performance.now();
      const r = await session!.flush(push, { force: push && pushPending });   // 推云：本地落盘已清 dirty，同一份字节还得以 tryPush 交给库（否则永远推不出去）
      if (r.wrote && !push) lastPersistMs = performance.now() - t0;   // 只量本地落盘（推云那次含网络，不算体重）
      if (g !== gen) return;
      if (r.wrote) { if (push) { if (r.pushed) { pushPending = false; pushFailures = 0; } else pushPending = true; } else pushPending = true; }
    })();
    persistInFlight = run;
    try { await run; } finally { if (persistInFlight === run) persistInFlight = null; }
  }
  /** 本地落盘（不等防抖）：切页 / 防抖到点 共用。落完照旧排推云（推云节律不变——切页只是把本地那一步提前，不额外推云；ADR-0015 d）。 */
  function saveLocalNow(): void {
    if (localTimer) { clearTimeout(localTimer); localTimer = null; }
    if (home?.kind === "local") return;   // 无地：不自动写回/下载，用户 Ctrl+S / 保存钮显式触发（下载不能每 200ms 一次）
    void persist(false).then(() => { d.setState(stateText(), { unsynced: pushPending && d.isSignedIn() }); if (d.isSignedIn()) schedulePush(); })
      .catch((e) => { reportError(e); d.setStatus(t("st.saveFailed", { e: errMsg(e) }), { error: true }); });
  }
  /** 防抖随体重放缓（ADR-0015 b）：200 ms 起，按上次落盘耗时 ×5 插值，封顶 3 s；增量重打（a）之后大多数书仍停在 200 ms。 */
  function scheduleLocalSave(): void {
    if (localTimer) clearTimeout(localTimer);
    localTimer = setTimeout(() => { localTimer = null; saveLocalNow(); }, bookLocalDebounceMs(lastPersistMs));
  }
  /** 切页即落盘（ADR-0015 d；图片 session 报告转述 user「换页 = 触发本地落盘不触发推云」）：有挂着的防抖或已脏 → 立刻本地落盘，不碰推云节律。 */
  function flushOnPageChange(): void { if (home?.kind !== "store") return; if (localTimer || session?.dirty) saveLocalNow(); }
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
    if (home!.kind === "local") {
      if (localTimer) { clearTimeout(localTimer); localTimer = null; }
      try { await persist(false); }
      catch (e) { if (e instanceof LocalWriteDeniedError) { reportError(e, "log"); d.setStatus(t("project.writeBackDenied"), { error: true }); } else { reportError(e); d.setStatus(t("st.saveFailed", { e: errMsg(e) }), { error: true }); } }
      d.onChanged(); return;
    }
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
  let imageUrl: string | null = null;
  const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
  function hideImage(): void { if (imageUrl) { URL.revokeObjectURL(imageUrl); imageUrl = null; } d.imageEl.removeAttribute("src"); d.imageBox.hidden = true; d.imageBox.classList.remove("natural"); delete document.body.dataset.pageKind; }
  function showImage(name: string, bytes: Uint8Array): void {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: MIME[nodeExt(name)] ?? "application/octet-stream" }));
    d.imageEl.src = imageUrl; d.imageBox.hidden = false; d.imageBox.classList.remove("natural");
    d.imageMeta.textContent = d.imageMetaText({ name, w: 0, h: 0, bytes: bytes.length });
    d.imageEl.onload = () => { d.imageMeta.textContent = d.imageMetaText({ name, w: d.imageEl.naturalWidth, h: d.imageEl.naturalHeight, bytes: bytes.length }); };
    document.body.dataset.pageKind = "image";
  }
  d.imageEl.addEventListener("click", () => { d.imageBox.classList.toggle("natural"); });   // 点击切 fit / 1:1（双指以后再说）
  function loadCurrentIntoEditor(): void {
    const s = session!;
    if (titleTimer) { clearTimeout(titleTimer); titleTimer = null; }
    const cur = s.current();
    if (cur && nodeKind(cur) === "image") { d.editorEl.value = ""; showImage(cur, s.currentBytes() ?? new Uint8Array(0)); }
    else { hideImage(); d.editorEl.value = s.currentText(); }
    applyReadOnly();
    syncTitle();
    try { d.editorEl.selectionStart = d.editorEl.selectionEnd = 0; } catch { /* ignore */ }
    d.editorEl.scrollTop = 0;
  }
  function applyReadOnly(): void {
    const ro = (session?.readOnly ?? false) || userReadOnly();
    d.editorEl.readOnly = ro; d.editorEl.classList.toggle("locked", ro);
    d.titleEl.readOnly = ro; d.titleEl.classList.toggle("locked", ro);
  }
  /** 顶栏笔图标：切修改锁（进 graph.json，跟着作品走）。先落盘再切；切完立即写回/推云（锁着时 pushNow 的 canEdit 门会挡，所以直接 persist）。 */
  async function toggleReadOnly(): Promise<void> {
    if (!session || locked || session.readOnly) return;
    await flushLocal();
    try { session.setReadOnly(!userReadOnly()); } catch (e) { d.setStatus(errMsg(e), { error: true }); return; }
    applyReadOnly(); d.setState(stateText()); d.onChanged();
    try { await persist(home!.kind === "store" && d.isSignedIn() && !isOffline()); }
    catch (e) { reportError(e); d.setStatus(t("st.saveFailed", { e: errMsg(e) }), { error: true }); }
    d.setState(stateText(), { unsynced: pushPending && d.isSignedIn() }); d.onChanged();
  }
  function reportOpen(r: OpenResult): boolean {
    if (r.kind === "ok") { if (r.warnings.length) reportError(new Error("[project] open warnings: " + r.warnings.join("; ")), "log"); return true; }
    if (r.kind === "too-new") { d.setStatus(t("project.tooNew", { v: r.version }), { error: true }); return true; }
    d.setStatus(t(r.kind === "corrupt" ? "project.corrupt" : r.kind === "not-project" ? "project.notProject" : "project.unavailable"), { error: true });
    return false;
  }
  function enterLocked(projectName: string): void {
    home = { kind: "store", name: projectName }; session = createProjectSession({ read: readProjectBlob, write: (n, blob, o) => saveProjectBlob(n, blob, { push: o.push }) });
    encrypted = true; locked = true; back = []; forward = []; pushPending = false;
    setActiveDoc(projectName); deviceKvSet(KV_LAST_OPEN, projectName);
    hideImage();
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
    if (g !== gen) return true;   // 被更新的 open 抢先：不是失败，调用方别退回新稿
    if (encrypted && !d.isUnlocked()) {
      enterLocked(projectName);
      if (!opts.promptUnlock) return true;
      const ok = await d.ensureUnlocked();
      if (g !== gen) return true;
      if (!ok) return true;
    }
    const s = createProjectSession({ read: readProjectBlob, write: (n, blob, o) => saveProjectBlob(n, blob, { push: o.push }) });
    d.setStatus(t("st.loading"));
    const r = await s.open(projectName);
    if (g !== gen) return true;
    home = { kind: "store", name: projectName }; session = s; locked = false; back = [...s.project.editorState.back]; forward = []; pushPending = false; pushFailures = 0; firstDirtyAt = 0;   // 回退栈跟着书回来
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
    if (g !== gen) return true;
    home = { kind: "local", home: lh }; session = s; back = [...s.project.editorState.back]; forward = []; pushPending = false; encrypted = false; locked = false;
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
    home = { kind: "store", name: projectName }; session = s; back = []; forward = []; pushPending = false; encrypted = false; locked = false;
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
    home = null; session = null; back = []; forward = []; pushPending = false; encrypted = false; locked = false;
    hideImage();
    d.editorEl.readOnly = false; d.editorEl.classList.remove("locked");
    d.titleEl.value = ""; d.titleEl.readOnly = false; d.titleEl.classList.remove("locked");
  }

  // ── 导航（不标脏；目标必须有文件——占位符已废） ──
  function jump(target: string): void {
    if (!active()) return;
    if (!session!.exists(target)) { d.setStatus(t("edge.noSuchPage"), { error: true }); return; }
    commitEditor();
    const from = session!.current();
    let to: string;
    try { to = session!.jump(target); } catch (e) { d.setStatus(errMsg(e), { error: true }); return; }
    if (from && from !== to) pushBack(from);
    loadCurrentIntoEditor(); d.onChanged();
    flushOnPageChange();
  }
  /** 上一页 / 下一页 = 全树前序 DFS（ADR-0014 §6）：树首 / 树尾 / 散页 → 没有（钮灰）。 */
  const neighborhood = () => session?.neighborhood() ?? null;
  function prevPage(): boolean { const n = neighborhood()?.prev; if (!n) return false; jump(n); return true; }
  function nextPage(): boolean { const n = neighborhood()?.next; if (!n) return false; jump(n); return true; }
  function goBack(): boolean {
    if (!active()) return false;
    let prev = popBack(); while (prev && !session!.exists(prev)) prev = popBack();   // 历史里改名/删掉的名字跳过（jump 到不存在的名字会抛）
    if (!prev) return false;
    commitEditor();
    const cur = session!.current();
    try { session!.jump(prev); } catch { return false; }
    if (cur && cur !== prev) { forward.push(cur); if (forward.length > 50) forward.shift(); }   // 离开的那页进前进栈
    loadCurrentIntoEditor(); d.onChanged();
    flushOnPageChange();
    return true;
  }
  /** 前进 = 回退的逆：只在回退之后有货；任何新导航（jump / 加页 / 上下页）清空。不经 pushBack（那会清前进栈）。 */
  function goForward(): boolean {
    if (!active()) return false;
    let next = forward.pop(); while (next && !session!.exists(next)) next = forward.pop();
    if (!next) return false;
    commitEditor();
    const cur = session!.current();
    try { session!.jump(next); } catch { return false; }
    if (cur && cur !== next) { back.push(cur); if (back.length > 50) back.shift(); syncBack(); }
    loadCurrentIntoEditor(); d.onChanged();
    flushOnPageChange();
    return true;
  }
  /** spawn：选中文字 → 问名字（默认 = 选中首行前 12 字）→ 新节点带那段字、源稿里那段字移走（走 replaceRange 保 undo）、边从当前指向它（末尾）、光标跳过去。
   *  撞已有名 → 拒绝（并进别人的节点会把选中的字弄丢），改名在章节名框。user 2026-09-10「新建节点的时候不应该自动生成名字，而是让你输入吧」→ 分裂也问。 */
  async function spawnFromSelection(): Promise<boolean> {
    if (!canEdit()) return false;
    commitTitle();
    const el = d.editorEl; const start = el.selectionStart ?? 0, end = el.selectionEnd ?? 0;
    const sel = el.value.slice(start, end);
    if (!sel.trim()) { d.setStatus(t("edge.spawnNoSelection")); return false; }
    const raw = await d.askName(t("edge.spawnTitle"), defaultNodeName(sel), t("edge.spawnHint"));
    if (raw == null || !raw.trim() || !canEdit()) return false;
    const nn = normalizeNodeName(raw);
    if (!nn) { d.setStatus(t("edge.badName"), { error: true }); return false; }
    if (session!.exists(nn)) { d.setStatus(t("edge.nameTaken"), { error: true }); return false; }
    replaceRange(el, start, end, "");   // 源稿分裂：这段字移走（input 事件 → 本地节律）
    commitTextarea();
    const from = session!.current();
    session!.spawn(nn, sel);
    if (from) pushBack(from);
    scheduleLocalSave();
    loadCurrentIntoEditor(); d.onChanged();
    return true;
  }
  /** 「+ 兄弟」/「+ 子节」（当前页在树里）：新名当场建空文件并入树；已有散页 = 归档到这里；已在树里 = 位置不动、只跳过去（toast 说一声）。散页上的「+ 子节」退到 newNode（链出去）。 */
  function newTreePage(rawName: string, where: "sibling" | "child"): boolean {
    if (!canEdit()) return false;
    const cur = session!.current(); if (!cur) return false;
    if (!session!.isInTree(cur)) return where === "child" ? newNode(rawName) : false;
    const nn = normalizeNodeName(rawName);
    if (!nn) { d.setStatus(t("edge.badName"), { error: true }); return false; }
    commitEditor();
    let r: { name: string; created: boolean; placed: boolean };
    try { r = where === "sibling" ? session!.newSibling(nn) : session!.newChild(nn); } catch (e) { d.setStatus(errMsg(e), { error: true }); return false; }
    if (!r.placed) d.setStatus(t("edge.alreadyInTree", { name: nodeDisplayName(r.name) }));
    else if (!r.created) d.setStatus(t("edge.archived", { name: nodeDisplayName(r.name) }));
    if (cur !== session!.current()) pushBack(cur);
    scheduleLocalSave();
    loadCurrentIntoEditor(); d.onChanged();
    return true;
  }
  const newSibling = (rawName: string) => newTreePage(rawName, "sibling");
  const newChild = (rawName: string) => newTreePage(rawName, "child");
  /** 改动动词的公共门：锁着 → toast 说原因；抛了 → toast；成了 → 落盘 + 重画。 */
  const guardEdit = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => { if (!canEdit()) { if (active() && !locked && userReadOnly()) d.setStatus(t("edge.lockedHint"), { error: true }); return false; } try { fn(...a); } catch (e) { d.setStatus(errMsg(e), { error: true }); return false; } scheduleLocalSave(); d.onChanged(); return true; };
  // ── 主干树的移动（ADR-0014 §8：菜单先行，拖拽等手感再议）──
  /** 上移 / 下移 / 升级 / 降级：到头 / 没有上一个兄弟 = no-op（toast 说一声，不算错）。 */
  function treeMove(target: string, op: "up" | "down" | "outdent" | "indent"): boolean {
    if (!canEdit()) { if (active() && !locked && userReadOnly()) d.setStatus(t("edge.lockedHint"), { error: true }); return false; }
    commitEditor();
    let moved = false;
    try { moved = op === "up" ? session!.treeUp(target) : op === "down" ? session!.treeDown(target) : op === "outdent" ? session!.treeOutdent(target) : session!.treeIndent(target); }
    catch (e) { d.setStatus(errMsg(e), { error: true }); return false; }
    if (!moved) { d.setStatus(t("edge.moveNoop")); return false; }
    scheduleLocalSave(); d.onChanged();
    return true;
  }
  /** 移出树：页变散页（带着子树），文件与 links 不动、不改名（只有丢引用会改名）。 */
  const detachFromTree = guardEdit((target: string) => { commitEditor(); if (!session!.treeDetach(target)) throw new Error(t("edge.noSuchPage")); });
  /** 归档到当前页之后 / 之下（散页从 links / 谁指向这里 收进主干；树里的页 = 搬家，子树跟着）。 */
  const archiveAfterCurrent = guardEdit((target: string) => { commitEditor(); session!.archiveAfter(target, session!.current()!); });
  const archiveUnderCurrent = guardEdit((target: string) => { commitEditor(); session!.archiveUnder(target, session!.current()!); });
  /** 导出这一支：子树 DFS 拼成的正文（落库 / 下载归 app 层）。 */
  const exportBranchText = (target: string): string => { commitEditor(); return session!.exportBranch(target); };
  /** 「+」散页：调用方问好名字再来（撞已有名 = 连过去并跳，ADR-0009 §6）；边加在当前页末尾，跳过去。拖进来的 txt 也走这里。 */
  function newNode(rawName: string, text = ""): boolean {
    if (!canEdit()) return false;
    const nn = normalizeNodeName(rawName);
    if (!nn) { d.setStatus(t("edge.badName"), { error: true }); return false; }
    commitEditor();
    const from = session!.current();
    try { session!.spawn(nn, text); } catch (e) { d.setStatus(errMsg(e), { error: true }); return false; }
    if (from && from !== session!.current()) pushBack(from);
    scheduleLocalSave();
    loadCurrentIntoEditor(); d.onChanged();
    return true;
  }
  const addLink = guardEdit((to: string) => { const nn = normalizeNodeName(to); if (!nn) throw new Error(t("edge.badName")); if (!session!.exists(nn)) throw new Error(t("edge.noSuchPage")); session!.addLink(nn); });
  const removeLink = guardEdit((to: string) => { session!.removeLink(to); });
  /** 断入边（user 2026-09-10「显示入度的时候需要加一个删除入度边的功能」）：纯 unlink from → 当前页。 */
  const cutIncoming = guardEdit((from: string) => { if (!session!.cutIncoming(from)) throw new Error("no such incoming link"); });
  const backlinksOfCurrent = (): string[] => { const c = session?.current(); return c ? session!.backlinksOf(c) : []; };
  // ── 图片页（2.1，ADR-0012/0013）──
  /** 减肥后的图片 → 新页（撞名 hex4）+ 当前页末尾一条边；全部加完跳到最后一张（同加页手感）。返回最终名列表。 */
  let lastAdded: string[] = [];
  const addImagePages = guardEdit((items: { name: string; bytes: Uint8Array }[]) => {
    commitEditor(); const from = session!.current(); lastAdded = items.map((it) => session!.addBytesPage(it.name, it.bytes));
    const last = lastAdded[lastAdded.length - 1]; if (last) { session!.jump(last); if (from && from !== last) pushBack(from); loadCurrentIntoEditor(); }
  });
  const pageBytes = (): Uint8Array | null => session?.currentBytes() ?? null;
  /** 替换图片：保名保边只换字节；字节类型变了（png → jpg）扩展名跟着变（撞名 hex4），名字不能撒谎。 */
  const replaceImage = guardEdit((bytes: Uint8Array, ext: string) => {
    const c = session!.current(); if (!c) throw new Error("no current page");
    session!.replaceBytes(c, bytes);
    if (nodeExt(c) !== ext && !(ext === "jpg" && nodeExt(c) === "jpeg")) {
      let nn = `${stemOf(c)}.${ext}`; if (session!.exists(nn)) nn = `${stemOf(c)}-${hex4()}.${ext}`;
      session!.rename(c, nn); renameInBack(c, nn);
    }
    loadCurrentIntoEditor();
  });
  const setThumbnail = guardEdit((png: Uint8Array | null) => { session!.setThumbnail(png); });
  const thumbnail = (): Uint8Array | null => session?.thumbnail() ?? null;
  const moveLink = guardEdit((to: string, dir: -1 | 1) => { const links = session!.sidebar(); const i = links.indexOf(to); const j = i + dir; if (i < 0 || j < 0 || j >= links.length) return; [links[i], links[j]] = [links[j]!, links[i]!]; session!.setLinksOrder(links); });
  /** 丢引用（删除模型）：断边；成孤儿则改名 `_废-…`（回退栈跟着改名）。返回孤儿新名（toast 用）。 */
  let lastDropped: string | null = null;
  const dropRef = guardEdit((to: string) => { commitEditor(); const nn = session!.drop(to, t("edge.orphanPrefix")); lastDropped = nn; if (nn && nn !== to) renameInBack(to, nn); });
  /** 彻底删除：只准孤儿（调用方先弹框确认）。当前页被删 → 回退或落到任一页。 */
  const purgeOrphan = guardEdit((target: string) => { commitEditor(); const wasCurrent = session!.current() === target; session!.purge(target); back = back.filter((n) => n !== target); forward = forward.filter((n) => n !== target); syncBack(); if (wasCurrent) { const next = popBack() ?? [...session!.project.contents.keys()].sort()[0] ?? null; if (next) session!.jump(next); loadCurrentIntoEditor(); } });

  return {
    active, canEdit, name, displayName, syncKind, stateText, home: () => home, session: () => session,
    encrypted: () => encrypted, locked: () => locked, unlock, toggleEncryption, readOnly: () => userReadOnly(), toggleReadOnly,
    openStore, openLocal, createInStore, adoptName, close, flushLocal, pushNow, noteExternalEdit, pendingLocalSave: () => !!localTimer, lastPersistMs: () => lastPersistMs,
    jump, goBack, goForward, canGoBack: () => back.length > 0, canGoForward: () => forward.length > 0, prevPage, nextPage, neighborhood, spawnFromSelection, newNode, newSibling, newChild, treeMove, detachFromTree, archiveAfterCurrent, archiveUnderCurrent, exportBranchText,
    addLink, removeLink, moveLink, dropRef, lastDropped: () => lastDropped, purgeOrphan, isOrphan: (n: string) => session?.orphan(n) ?? false, isInTree: (n: string) => session?.isInTree(n) ?? false, commitTitle, focusTitle, nodeNames: () => [...(session?.project.contents.keys() ?? [])],
    current: () => session?.current() ?? null, currentKind,
    cutIncoming, backlinksOfCurrent, addImagePages, lastAdded: () => lastAdded, pageBytes, replaceImage, setThumbnail, thumbnail,
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
