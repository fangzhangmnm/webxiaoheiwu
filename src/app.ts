// 组合根：把 store 接缝 / 编辑器 / 抽屉 / IME / 语音 / 闲置锁屏 / PWA 壳接成一个 app。created 2026-09-03 by Claude Fable 5.1
// 这里只有接线与事件编排，没有业务规则（规则住各模块头注释）。
import { APP_VERSION } from "./version.ts";
import { IS_QUEST_BROWSER, PTT_HOLD_MS, USER_DICT_PUSH_INTERVAL_MS, FOREGROUND_POLL_MS } from "./config.ts";
import { initI18n, t, lang, setLang, LANGS, LANG_NAME, type Lang } from "./i18n/index.ts";
import { initErrorBadge, reportError} from "./error-badge.ts";
import { initSheets, openConfirmSheet, openInputSheet, openChoiceSheet, withBusy, showBusy, hideBusy } from "./sheets.ts";
import { auth, prefs, appState, rimeDict, initCollections, reconcileCollections, flushCollections, requireStore, requestStoragePersistence } from "./app-store.ts";
import { wireCryptoState, ensureUnlocked as cryptoEnsureUnlocked, ensureFileUnlocked as cryptoEnsureFileUnlocked, isUnlocked, lock as cryptoLock, hasVerifier, currentPassword, setCurrentPassword, resetVerifier, rememberFilePassword, forgetFilePassword, fileUsesOtherPassword, type VerifierRecord } from "./crypto-state.ts";
import { createEditor } from "./editor.ts";
import { verifyDocPassword, rekeyDoc, moveDoc, renameDoc, dirtyDocCount, deleteFolder, snapshotFolders, createProjectDoc } from "./docs.ts";
import { docKind, formatDate, hex4 } from "./doc-model.ts";
import { createProjectMode } from "./project/mode.ts";
import { createEdgeSidebar } from "./project/sidebar.ts";
import { pickLocalProject, triggerDownload } from "./project/local-home.ts";
import { packProject } from "./project/format.ts";
import { initGalleryHost } from "./gallery-host.ts";
import { createDrawer } from "./drawer.ts";
import { initIdleGate } from "./idle-gate.ts";
import type { SyncKind } from "./editor.ts";
import { initPwaShell } from "./pwa-shell.ts";
import { initDiagLog, note as diagNote } from "./diag-log.ts";   // 2026-09-09 黑匣子
import { holdUntilSettled } from "./settle-hold.ts";   // 2026-09-09 更新提示/reload 等 auth boot 落地
import { setStoreQuietStatus } from "./store-ui.ts";
import { initDiagLogUi } from "./diag-log-ui.ts";
import { NaturalCodeIME, DEFAULT_SCHEMA, isImeSchema, type ImeSchema, type UserDictDump } from "./ime.ts";
import type { VoiceSession, VoiceState } from "./voice/session.ts";
import { isLocalVoiceSupported, LocalSession } from "./voice/local.ts";
import { asr } from "./asr/engine.ts";
import { MODELS, modelKeyFrom, type ModelKey } from "./asr/packs.ts";
import { MODEL_SOURCE_DEFAULT } from "./config.ts";
import { deviceKvGet, deviceKvSet } from "./device-kv.ts";
import { parseDocName } from "./doc-model.ts";
import { runFactoryReset } from "./factory-reset.ts";
import { togglePopupMenu, currentPopupMenu } from "./ui/popup-menu.ts";
import { setQuoteStyle } from "./zh-punct.ts";
import { replaceRange, isProgrammaticEdit } from "./text-edit.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ── 早期初始化（DOM 已就绪：module 默认 deferred）──
initI18n();
const saveStatusEl = $("saveStatus");
// 状态两通道（zen，user 2026-09-04「还是需要个让用户看见状态 toast 的地方」）：
//   setState = 粘性稿态（未同步 / 本地草稿 / 不可用 / 加密未成 / 新稿将加密…）→ 顶栏右侧一小行，干净态留白；
//   setStatus = 瞬时事件（已移到回收站 / 同步失败 / 已加载云端最新…）→ 纸面底部 toast，3s 淡出（错误 8s），空串立即收。
const toastEl = $("toast");
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function setState(text: string, opts: { error?: boolean; unsynced?: boolean } = {}): void {
  saveStatusEl.textContent = text;
  saveStatusEl.classList.toggle("error", !!opts.error);
  saveStatusEl.classList.toggle("unsynced", !!opts.unsynced);
  queueMicrotask(renderSaveButton);   // 微任务：让同一处理器里排在后面的定时器（localTimer/renameTimer）先落，再读 syncKind
}
// ── smart save 钮（user 2026-09-04「为什么没有 smart save button，触屏的时候没法按 ctrl s」；形状抄 WeebPaint 顶栏云钮：状态即按钮）──
const saveButton = $<HTMLButtonElement>("saveButton");
const SAVE_SPEC: Record<SyncKind, { icon: string; cls: string; title: Parameters<typeof t>[0] } | null> = {
  clean: { icon: "cloud-synced", cls: "s-clean", title: "save.title.clean" },
  unsynced: { icon: "cloud-upload", cls: "s-unsynced", title: "save.title.unsynced" },
  local: { icon: "database", cls: "s-local", title: "save.title.local" },
  offline: { icon: "cloud-unavailable", cls: "s-offline", title: "save.title.offline" },
  encryptPending: { icon: "cloud-pending", cls: "s-pending", title: "save.title.encryptPending" },
  locked: null, unavailable: null, none: null,
};
function renderSaveButton(): void {
  const spec = SAVE_SPEC[syncKindAny()];
  saveButton.hidden = !spec;
  if (!spec) return;
  useIcon(saveButton, spec.icon);
  for (const c of ["s-clean", "s-unsynced", "s-local", "s-offline", "s-pending"]) saveButton.classList.toggle(c, c === spec.cls);
  saveButton.title = t(spec.title); saveButton.setAttribute("aria-label", saveButton.title);
}
/** Ctrl+S 与顶栏保存钮同一入口：脏 → 立即上传/落本地；干净且已登录 → 复查云端（同 WeebPaint「新鲜时点=刷新」）。 */
async function smartSave(): Promise<void> {
  const before = syncKindAny();
  if (before === "none" || before === "locked" || before === "unavailable") return;
  saveButton.classList.add("flash"); setTimeout(() => saveButton.classList.remove("flash"), 500);
  void requestStoragePersistence();   // 首存手势：persist 申请（persistence:"app-managed"）
  if (before === "clean") { await refreshIfCleanAny(); if (syncKindAny() === "clean") setStatus(t("save.upToDate")); renderSaveButton(); return; }
  await pushNowAny();
  const after = syncKindAny();
  setStatus(after === "clean" ? t("save.synced") : after === "local" ? t("save.local") : after === "offline" ? t("save.offline") : after === "unsynced" ? t("save.stillPending") : "");
  renderSaveButton();
}
saveButton.addEventListener("click", () => { void smartSave(); });
function setStatus(text: string, opts: { error?: boolean; unsynced?: boolean } = {}): void {
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  toastEl.textContent = text;
  toastEl.classList.toggle("error", !!opts.error);
  toastEl.classList.toggle("show", !!text);
  // 抽屉开着时纸面被遮罩压住，用户看不到 toast（审计 UI-6）：镜像一份到抽屉底部，随 toast 同步淡出
  const ds = document.getElementById("drawerStatus");
  const mirror = ds && !document.getElementById("drawer")!.classList.contains("hidden") ? ds : null;
  if (mirror) { mirror.textContent = text; mirror.classList.toggle("error", !!opts.error); mirror.hidden = !text; }
  if (text) toastTimer = setTimeout(() => { toastEl.classList.remove("show"); if (mirror) mirror.hidden = true; toastTimer = null; }, opts.error ? 8000 : 3000);
}
initErrorBadge({ status: (text) => setStatus(text), dismissHint: () => t("err.dismissHint") });
initDiagLog();   // 2026-09-09 黑匣子：页面生命周期/在线态面包屑 + pagehide flush（record 不依赖它）
initSheets({ ok: t("common.ok"), cancel: t("common.cancel") });
console.log("[xhw] build:", APP_VERSION);
$("settingsBuild").textContent = APP_VERSION;

const editorEl = $<HTMLTextAreaElement>("editor");
// 内置 IME 开着时全平台 inputmode=none：不弹系统软键盘、系统输入法不碰字节（2026-09-03 user「直接不用系统输入法」；Quest 一直如此，见 20260524-quest-ime.md）。
// 触屏键盘（per-device）：none = 不弹（Quest/桌面实体键盘）；ascii = inputmode="email" → 弹系统键盘、字母仍进内置 IME
//   （user 2026-09-03「不改用系统输入法只是出软键盘行吗」）。⚠ iOS 实测（user 2026-09-04）：inputmode 只改布局不改语言，
//   弹出的仍是用户当前的中文键盘——iOS 上唯一能强制英文键盘的是密码框（secure text entry），那是「输入代理」一整刀，待拍板。软键盘不一定发 keydown（Android 发 229/Unidentified）→ beforeinput 路由见 setupImeOn。
const softKeyboardPref = (): "none" | "ascii" => (deviceKvGet("softKeyboard") === "ascii" ? "ascii" : "none");
function applyInputMode(builtinIme: boolean): void {
  const mode = builtinIme ? (softKeyboardPref() === "ascii" ? "email" : "none") : null;
  if (mode) editorEl.setAttribute("inputmode", mode); else editorEl.removeAttribute("inputmode");
}
if (window.visualViewport) {   // iOS 软键盘：键盘高度 → --kb-offset，纸面整体缩到键盘上方（styles .page height）；iOS 若把视口顶上去，拉回 0 让固定顶栏别被推出屏
  const vv = window.visualViewport;
  const upd = () => {
    if (vv.offsetTop > 0 && document.activeElement && document.activeElement !== document.body) window.scrollTo(0, 0);
    document.documentElement.style.setProperty("--kb-offset", `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
  };
  vv.addEventListener("resize", upd); vv.addEventListener("scroll", upd); upd();
}

// ── 密码政策接线（弹窗 = 输入 sheet；verifier 住 synced-app-state）──
wireCryptoState({
  prompt: (o) => openInputSheet(o.title, {
    message: o.message, password: true, confirmField: o.confirmField, error: o.error, okLabel: o.okLabel,
    validate: o.confirmField ? (v, v2) => (v !== v2 ? t("pw.mismatch") : null) : undefined,
  }),
  verifiers: { get: () => (appState.getItem("passwordVerifier") as VerifierRecord | undefined) ?? null, set: (rec) => appState.setItem("passwordVerifier", rec) },
});
const ensureUnlocked = async (): Promise<boolean> => {
  // 首次设密码前：已登录就先把 synced-app-state 拉齐——否则新设备会用 LWW 盖掉云端已有的 verifier，老设备从此「密码错」（审计 L6）
  if (!hasVerifier() && auth.isSignedIn()) {
    try { await reconcileCollections(); } catch (e) { reportError(e, "log"); setStatus(t("pw.setupNeedsNetwork"), { error: true }); return false; }
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setStatus(t("pw.setupNeedsNetwork"), { error: true }); return false; }
  }
  return cryptoEnsureUnlocked(labelsForUnlock());
};
const labelsForUnlock = () => ({
  unlockTitle: t("pw.unlockTitle"), unlockHint: t("pw.unlockHint"), setupTitle: t("pw.setupTitle"), setupHint: t("pw.setupHint"),
  wrong: t("pw.wrong"), mismatch: t("pw.mismatch"), okUnlock: t("pw.unlock"), okSetup: t("pw.set"),
});

// ── 编辑器 / 抽屉 ──
const ime = new NaturalCodeIME();
const ensureFileUnlocked = (name: string) => cryptoEnsureFileUnlocked(name,
  { title: t("fp.title"), hint: t("fp.hint", { name: parseDocName(name).title }), wrong: t("pw.wrong"), ok: t("pw.unlock") },
  (pw) => verifyDocPassword(name, pw));
const editor = createEditor({
  editor: editorEl, setStatus, setState,
  isSignedIn: () => auth.isSignedIn(),
  onDocChanged: () => { renderTopbar(); renderLockCard(); renderSaveButton(); drawer.refresh(); rememberLastActive(); },
  ensureUnlocked, ensureFileUnlocked,
  onBeforeLoad: () => { voiceAbortHook?.(); if (ime.isComposing()) { ime.resetComposition(); renderImeState(); } },   // 没提交的拼音别漏进下一篇（2026-09-04 复现：上一篇残留「def」进了新稿）
});
let voiceAbortHook: (() => void) | null = null;
// ── 2.0 工程模式（ADR-0008）：同一个 textarea 两种稿；txt 编辑器在工程期 park。门面 = 谁活着问谁。──
const project = createProjectMode({
  editorEl, setStatus, setState,
  isSignedIn: () => auth.isSignedIn(),
  onChanged: () => { renderTopbar(); renderSaveButton(); edgeSidebar.render(); drawer.refresh(); rememberLastActive(); },
  onBeforeLoad: () => { voiceAbortHook?.(); if (ime.isComposing()) { ime.resetComposition(); renderImeState(); } },
  askName: (title, def, hint) => openInputSheet(title, { message: hint, defaultValue: def, placeholder: t("edge.namePh"), okLabel: t("common.ok") }),
});
const edgeSidebar = createEdgeSidebar({
  el: $("edgeSidebar"), mode: project, setStatus, focusEditor: () => editorEl.focus(),
  onDownload: () => { const s = project.session(); const h = project.home(); if (!s || !h || h.kind !== "local") return; void packProject(s.project).then((b) => { triggerDownload(b, h.home.fileName); setStatus(t("project.downloaded")); }); },
});
const activeName = (): string | null => (project.active() ? project.name() : editor.state.name);
const syncKindAny = () => (project.active() ? project.syncKind() : editor.syncKind());
const canEditNow = () => (project.active() ? project.canEdit() : editor.canEdit());
const noteExternalEditAny = () => (project.active() ? project.noteExternalEdit() : editor.noteExternalEdit());
const flushLocalAny = () => (project.active() ? project.flushLocal() : editor.flushLocal());
const pushNowAny = () => (project.active() ? project.pushNow() : editor.pushNow());
const refreshIfCleanAny = () => (project.active() ? Promise.resolve() : editor.refreshIfClean());
async function leaveProject(): Promise<void> { if (!project.active()) return; await project.close(); delete document.body.dataset.project; edgeSidebar.render(); editor.resume(); }
/** 打开任一身份：工程 → 工程模式（txt 编辑器 park）；txt → txt 编辑器（工程模式关）。 */
async function openAny(name: string, opts: { promptUnlock?: boolean } = {}): Promise<boolean> {
  if (docKind(name) === "project") {
    if (!editor.isParked()) await editor.park();
    const ok = await project.openStore(name);
    document.body.dataset.project = "1";
    return ok;
  }
  await leaveProject();
  return editor.open(name, opts);
}
async function newProjectFlow(): Promise<void> {
  const raw = await openInputSheet(t("project.newTitle"), { message: t("project.newHint"), placeholder: t("fn.ph"), okLabel: t("common.ok") });
  if (raw == null) return;
  const date = formatDate(Date.now());
  const firstNode = `${date}-${hex4()}.txt`;
  try {
    const empty = await packProject({ nodes: new Map(), contents: new Map(), editorState: { last: null }, readVersion: 1 });
    const name = await createProjectDoc(raw, empty, date, galleryHost.isOpen() ? galleryHost.currentFolder() : drawer.currentFolder());
    if (!editor.isParked()) await editor.park();
    await project.createInStore(name, firstNode);
    document.body.dataset.project = "1";
    if (galleryHost.isOpen()) galleryHost.close(); else drawer.close();
    setStatus(t("project.created", { name: parseDocName(name).stem }));
  } catch (e) { reportError(e); setStatus(t("project.createFailed", { e: e instanceof Error ? e.message : String(e) }), { error: true }); }
}
async function openLocalProjectFlow(): Promise<void> {
  const lh = await pickLocalProject();
  if (!lh) return;
  if (!editor.isParked()) await editor.park();
  const ok = await project.openLocal(lh);
  document.body.dataset.project = "1";
  if (galleryHost.isOpen()) galleryHost.close(); else drawer.close();
  if (ok) setStatus(lh.canWriteBack ? t("project.localWriteBack") : t("project.localDownloadOnly"));
}
// ── 2.0 图库屏（@internal/gallery）：☰ 打开独立一屏；抽屉只剩设置。──
const galleryHost = initGalleryHost({
  mountEl: $("galleryMount"), fullEl: $("galleryFull"),
  activeName: () => activeName(), isDirty: () => (project.active() ? (project.session()?.dirty ?? false) : editor.isDirty()),
  openAny, renameActive: () => renameCurrentDoc(), pushNow: () => pushNowAny(), flushLocal: () => flushLocalAny(),
  ensureUnlocked, setStatus, currentDir: () => (project.active() ? parseDocName(project.name() ?? "").dir : editor.currentDir()),
  onOpened: () => { $("galleryTrashBar").classList.add("hidden"); },
  onClosed: () => { editorEl.focus(); },
});
$("galleryBack").addEventListener("click", () => galleryHost.close());
$("gallerySettingsBtn").addEventListener("click", () => drawer.open("settings"));
$("galleryTrashBtn").addEventListener("click", () => { galleryHost.setView("trash"); $("galleryTrashBar").classList.remove("hidden"); });
$("galleryTrashBack").addEventListener("click", () => { galleryHost.setView("files"); $("galleryTrashBar").classList.add("hidden"); });
$("galleryEmptyTrash").addEventListener("click", () => {
  void openChoiceSheet<"local" | "cloud" | "both">(t("gal.emptyTrash"), t("gal.emptyTrashWhich"), [
    { label: t("gal.emptyTrashLocal"), value: "local" }, { label: t("gal.emptyTrashCloud"), value: "cloud" }, { label: t("gal.emptyTrashBoth"), value: "both" },
  ]).then((v) => { if (v) galleryHost.emptyTrash(v); });
});
const drawer = createDrawer({
  drawer: $("drawer"), backdrop: $("drawerBackdrop"), title: $("drawerTitle"), backButton: $("drawerBackButton"),
  docList: $("docList"), docListEmpty: $("docListEmpty"), docActions: $("drawerActions"), trashActions: $("trashActions"), settingsView: $("settingsView"),
  breadcrumb: $("docBreadcrumb"),
  activeName: () => activeName(),
  currentDir: () => editor.currentDir(),
  onMoveDoc: async (name, toDir) => {
    if (editor.state.name === name) { await editor.moveTo(toDir); return; }
    try {
      const r = await moveDoc(name, toDir);
      if (!r) { setStatus(t("st.moveFailed"), { error: true }); return; }
      setStatus(r.oldKept ? t("st.renameOldKept") : t("st.moved", { dir: toDir || t("list.root") }), { error: !!r.oldKept });
    } catch (e) { reportError(e); setStatus(t("st.moveFailed"), { error: true }); }
  },
  onOpenDoc: async (name) => { await openAny(name, { promptUnlock: true }); },
  onRenameDoc: async (name) => { if (name === editor.state.name) await renameCurrentDoc(); else await renameOtherDoc(name); },   // 2026-09-09 审计 #6
  onActiveTrashed: async () => { if (project.active()) await leaveProject(); else await editor.flushLocal(); editor.clear(); },
  onSettingsShown: () => renderSettings(),
  focusEditor: () => editorEl.focus(),
  setStatus,
});

// ── 顶栏（文件名 / 加密钮 / 只读钮）──
const cryptoToggle = $<HTMLButtonElement>("cryptoToggle");
const lockToggle = $<HTMLButtonElement>("lockToggle");
const docNameButton = $<HTMLButtonElement>("docNameButton");   // 文件名 = 管理句柄不是标题（ADR-0007）：住顶栏，点了改名
const useIcon = (btn: HTMLElement, id: string) => { btn.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`; };
function renderTopbar(): void {
  if (project.active()) {   // 工程模式：顶栏 = 工程名 · 节点名 + 边栏开关；加密/只读钮属于 txt 稿
    docNameButton.hidden = false; docNameButton.textContent = `${project.displayName() ?? ""}${project.current() ? " · " + project.current() : ""}`; docNameButton.classList.remove("pending");
    docNameButton.title = t("top.docName"); docNameButton.setAttribute("aria-label", t("top.docName"));
    cryptoToggle.hidden = true; lockToggle.hidden = true; keyBanner.hidden = true; edgeToggle.hidden = false;
    renderMicVisibility();
    return;
  }
  edgeToggle.hidden = true;
  const st = editor.state;
  const hasDoc = !!st.name || !!st.pendingDate;
  const dn = editor.displayName();
  docNameButton.hidden = !hasDoc;
  docNameButton.textContent = dn ?? t("top.newDocName");
  docNameButton.classList.toggle("pending", !dn);
  docNameButton.title = t("top.docName"); docNameButton.setAttribute("aria-label", t("top.docName"));
  cryptoToggle.hidden = !hasDoc;
  useIcon(cryptoToggle, st.encrypted ? "lock" : "unlock");
  cryptoToggle.setAttribute("data-encrypted", st.encrypted ? "true" : "false");
  cryptoToggle.title = st.encrypted ? (st.locked ? t("top.unlockDoc") : t("top.decryptDoc")) : t("top.encryptDoc");
  cryptoToggle.setAttribute("aria-label", cryptoToggle.title);
  lockToggle.hidden = !st.name || st.locked;
  useIcon(lockToggle, st.readOnly ? "edit-disabled" : "edit-enabled");
  lockToggle.title = st.readOnly ? t("top.readOnlyOff") : t("top.readOnlyOn");
  lockToggle.setAttribute("aria-label", lockToggle.title);
  keyBanner.hidden = !(st.name && st.encrypted && !st.locked && fileUsesOtherPassword(st.name));
  renderMicVisibility();
}
const keyBanner = $("keyBanner");
const edgeToggle = $<HTMLButtonElement>("edgeToggle");
edgeToggle.addEventListener("click", () => { $("edgeSidebar").classList.toggle("collapsed"); });
docNameButton.addEventListener("click", () => { void renameCurrentDoc(); });
/** 顶栏改名 sheet：文件名只是管理句柄，OneDrive 上可见（加密稿也一样）——文案里说清，别把标题写进来。空 = 不改。 */
async function renameCurrentDoc(): Promise<void> {
  if (project.active()) { await renameProjectFile(); return; }
  const st = editor.state;
  if (!st.name && !st.pendingDate) return;
  // 2026-09-09 审计 #6：失败不再一次性——保留输入再问（最多三轮），别让用户重打。
  let typed = editor.displayName() ?? "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const v = await openInputSheet(t("fn.title"), { message: attempt ? t("fn.retryHint") : t(st.encrypted ? "fn.hintEnc" : "fn.hint"), defaultValue: typed, placeholder: t("fn.ph"), okLabel: t("fn.ok") });
    if (v == null || !v.trim()) return;
    if (await editor.renameTo(v)) return;
    typed = v;
  }
}
/** 工程文件改名（文件名 = 管理句柄，ADR-0007；工程内节点改名在边栏）。本机工程不在这改（文件在磁盘上）。 */
async function renameProjectFile(): Promise<void> {
  const name = project.name();
  if (!name) { setStatus(t("project.localRenameHint")); return; }
  let typed = parseDocName(name).stem;
  for (let attempt = 0; attempt < 3; attempt++) {
    const v = await openInputSheet(t("fn.title"), { message: attempt ? t("fn.retryHint") : t("fn.hint"), defaultValue: typed, placeholder: t("fn.ph"), okLabel: t("fn.ok") });
    if (v == null || !v.trim()) return;
    typed = v;
    try {
      await project.flushLocal();
      const rr = await renameDoc(name, v);
      if (!rr) { setStatus(t("st.renameFailed"), { error: true }); continue; }
      if (rr.oldKept) setStatus(t("st.renameOldKept"), { error: true }); else if (rr.cloudDeferred) setStatus(t("st.renameCloudDeferred"), { unsynced: true }); else setStatus(t("st.renamed", { name: parseDocName(rr.name).stem }));
      await project.openStore(rr.name);
      return;
    } catch (e) { reportError(e); setStatus(t("st.renameFailed"), { error: true }); }
  }
}
/** 抽屉行改名（不是当前稿）：docs.renameDoc（tryMove；撞名加后缀）→ 状态行 + 列表重拉。文件名只是管理句柄（ADR-0007），文案同顶栏。 */
async function renameOtherDoc(name: string): Promise<void> {
  const enc = drawer.findByName(name)?.encrypted === true;
  let typed = parseDocName(name).stem;
  for (let attempt = 0; attempt < 3; attempt++) {
    const v = await openInputSheet(t("fn.title"), { message: attempt ? t("fn.retryHint") : t(enc ? "fn.hintEnc" : "fn.hint"), defaultValue: typed, placeholder: t("fn.ph"), okLabel: t("fn.ok") });
    if (v == null || !v.trim()) return;
    typed = v;
    try {
      const rr = await renameDoc(name, v);
      if (!rr) { setStatus(t("st.renameFailed"), { error: true }); continue; }
      if (rr.oldKept) setStatus(t("st.renameOldKept"), { error: true });
      else if (rr.cloudDeferred) setStatus(t("st.renameCloudDeferred"), { unsynced: true });
      else setStatus(t("st.renamed", { name: parseDocName(rr.name).stem }));
      drawer.subscribe();
      return;
    } catch (e) { reportError(e); setStatus(t("st.renameFailed"), { error: true }); }
  }
}
$("rekeyButton").addEventListener("click", () => { void editor.rekeyToCurrent(withBusy); });
cryptoToggle.addEventListener("click", () => {
  void editor.toggleEncryption(
    () => openConfirmSheet(t("enc.decryptTitle"), t("enc.decryptWarning"), { danger: true, okLabel: t("enc.decryptAction"), warning: true }),
    withBusy,
  );
});
lockToggle.addEventListener("click", () => editor.toggleReadOnly());

// ── 跨设备 lastActive 指针（Separated 模式：只在冷启动尊重远端，不在 session 中途切）──
let booted = false;
// ── 锁卡（0.2 护栏，user 2026-09-04「0.2 还是先做个护栏吧，不然坑人」）：锁着 / 不可用的稿不再假装是编辑器——纸面盖卡说明 + 三个出口；根治 = 0.3 懒空白稿 ──
const lockCard = $("lockCard"), lockCardText = $("lockCardText"), lockCardUnlock = $<HTMLButtonElement>("lockCardUnlock"), lockCardRetry = $<HTMLButtonElement>("lockCardRetry");
function renderLockCard(): void {
  const st = editor.state;
  const kind = st.locked && st.name ? (fileUsesOtherPassword(st.name) ? "other" : "locked") : st.unavailable && booted && st.name ? "unavailable" : null;
  lockCard.hidden = !kind;
  if (!kind) return;
  lockCardText.textContent = t(kind === "other" ? "lock.otherPw" : kind === "locked" ? "lock.locked" : "lock.unavailable", { name: parseDocName(st.name!).title });
  lockCardUnlock.hidden = kind === "unavailable"; lockCardRetry.hidden = kind !== "unavailable";
}
const reopenWithPrompt = () => { const n = editor.state.name; if (n) void editor.open(n, { promptUnlock: true }); };
lockCardUnlock.addEventListener("click", reopenWithPrompt);
lockCardRetry.addEventListener("click", reopenWithPrompt);
$("lockCardNew").addEventListener("click", () => { void editor.newDoc({ dir: editor.currentDir() }); });
function rememberLastActive(): void {
  if (!booted || !activeName() || !auth.isSignedIn()) return;   // 冷启动 open(last) 不写云端指针——别盖掉别的设备最后写的那篇
  appState.setItem("lastActive", { name: activeName()!, savedAt: Date.now(), device: deviceLabel() });
}
function deviceLabel(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("quest") || ua.includes("oculusbrowser")) return "Quest";
  if (ua.includes("ipad")) return "iPad"; if (ua.includes("iphone")) return "iPhone"; if (ua.includes("android")) return "Android";
  return "PC";
}

// ── IME 接线 ──
const imeStatus = $("imeStatus");
const candidateBar = $("candidateBar");
let shiftCleanPress = false;
// 方案跟人走（synced prefs：肌肉记忆换设备不该变）；逃生开关跟设备走（device-kv：取决于这台机器有没有实体键盘）。user 2026-09-03 问「持久化跟谁走」→ 此定。
const imeSchemaPref = (): ImeSchema => { const v = prefs.getItem<string>("imeSchema"); return isImeSchema(v) ? v : DEFAULT_SCHEMA; };
const SCHEMA_NAME_KEY = { luna_pinyin: "ime.schema.luna", luna_pinyin_fluency: "ime.schema.fluency", double_pinyin_mspy: "ime.schema.mspy", double_pinyin: "ime.schema.ziranma", double_pinyin_flypy: "ime.schema.flypy", double_pinyin_abc: "ime.schema.abc", double_pinyin_pyjj: "ime.schema.pyjj", wubi86: "ime.schema.wubi" } as const;
const schemaName = (s: ImeSchema) => t(SCHEMA_NAME_KEY[s]);
const imeSimplifiedPref = (): boolean => prefs.getItem<boolean>("imeSimplified") !== false;   // 简/繁跟人走（synced prefs）；缺省简体
const quoteStylePref = (): "curly" | "corner" => (prefs.getItem<string>("quoteStyle") === "corner" ? "corner" : "curly");   // 引号样式跟人走
function applyQuoteStyle(v: "curly" | "corner"): void { ime.quoteStyle = v; setQuoteStyle(v); }
function renderImeState(): void {
  const s = ime.getState();
  // zen：顶栏只剩「中/英」一字（方案名进 title 悬停 + 设置页；系统输入法时整个不显示）。点它 = 切中/英（同 Shift）；改用系统输入法只在设置页。
  imeStatus.textContent = !s.enabled ? "" : s.asciiMode ? t("ime.modeEn") : t("ime.modeZh");
  imeStatus.title = s.enabled ? `${s.engine === "rime" ? schemaName(ime.schema) : t("ime.nameFallback")} · ${t("ime.clickToToggle")}` : "";
  applyInputMode(s.enabled);
  if (!s.enabled || !s.buffer) { candidateBar.classList.add("hidden"); candidateBar.innerHTML = ""; return; }
  candidateBar.classList.remove("hidden");
  const esc = (x: string) => x.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  candidateBar.innerHTML = `<span class="buffer-chip">${esc(s.buffer)}</span>` + s.candidates.slice(0, 9).map((w, i) => `<span class="candidate-chip"><span class="index">${i + 1}</span>${esc(w)}</span>`).join("");
}
async function setImeEnabled(on: boolean): Promise<void> {
  if (on) {
    if (!ime.initialized) { imeStatus.textContent = t("ime.loading"); ime.simplified = imeSimplifiedPref(); await ime.initialize(imeSchemaPref()); if (ime.initializeError) setStatus(t("ime.fallback", { e: ime.initializeError }), { error: true }); }
    ime.enabled = true;
  } else { ime.enabled = false; ime.resetComposition(); }
  deviceKvSet("imeEnabled", ime.enabled ? "1" : "0");   // 默认开：键缺省 = 开；"0" = 逃生开关「用系统输入法」
  renderImeState();
}
async function toggleIme(): Promise<void> { await setImeEnabled(!ime.enabled); }
imeStatus.addEventListener("mousedown", (e) => e.preventDefault());   // 别抢编辑器焦点
imeStatus.addEventListener("click", () => {
  void ime.toggleAsciiMode().then((r) => {
    if (r.type === "commit") { commitText(editorEl, r.consumedBuffer, r.text); noteExternalEditAny(); }
    renderImeState();
  });
});

/** IME 提交落字：幽灵拼音（软键盘 / 系统组字残留的裸字母）一并替换；走 text-edit 保 undo 栈。 */
function commitText(target: HTMLTextAreaElement | HTMLInputElement, consumedBuffer: string, text: string): void {
  let start = target.selectionStart ?? target.value.length; const end = target.selectionEnd ?? start;
  if (consumedBuffer && start === end && start >= consumedBuffer.length && target.value.slice(start - consumedBuffer.length, start) === consumedBuffer) start -= consumedBuffer.length;
  replaceRange(target, start, end, text);
}
let lastRealKeydownAt = 0;   // 软键盘路由判据：80ms 内见过真 keydown（key 可辨）= 实体键盘路径已处理，beforeinput 不再重复路由
async function imeKeydown(el: HTMLTextAreaElement | HTMLInputElement, event: KeyboardEvent): Promise<void> {
  if (event.key !== "Unidentified" && event.key !== "Process") lastRealKeydownAt = Date.now();
  if (event.key === "Shift") {
    if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.repeat && ime.enabled) shiftCleanPress = true;
    return;
  }
  shiftCleanPress = false;
  if (voiceMode && el === editorEl && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key.length === 1 || event.key === "Backspace" || event.key === "Enter")) { voiceMode = false; renderMicVisibility(); }   // 敲了实体键 = 不是纯口述
  if (!canEditNow()) return;
  const r = await ime.onKeydown(event);
  if (r.type === "commit") {
    commitText(el, r.consumedBuffer, el instanceof HTMLInputElement ? r.text.replace(/[\r\n]+/g, " ") : r.text);
    if (el === editorEl) noteExternalEditAny(); else el.dispatchEvent(new Event("input"));
    void maybePushUserDict();
  }
  renderImeState();
}
/** 合成按键喂 IME（软键盘 beforeinput / 语音模式退格钮）：IME 拦了返回 true（提交由这里落字），放行返回 false。 */
function routeSyntheticKey(el: HTMLTextAreaElement | HTMLInputElement, key: string): boolean {
  const fake = new KeyboardEvent("keydown", { key, cancelable: true });
  const pending = ime.onKeydown(fake);
  if (!fake.defaultPrevented) return false;
  void pending.then((r) => {
    if (r.type === "commit") {
      commitText(el, r.consumedBuffer, el instanceof HTMLInputElement ? r.text.replace(/[\r\n]+/g, " ") : r.text);
      if (el === editorEl) noteExternalEditAny(); else el.dispatchEvent(new Event("input"));
      void maybePushUserDict();
    }
    renderImeState();
  });
  return true;
}
function setupImeOn(el: HTMLTextAreaElement | HTMLInputElement): void {
  const node: HTMLElement = el;   // 联合类型上 addEventListener 的重载退化成 Event；收窄到 HTMLElement 拿回 KeyboardEvent
  node.addEventListener("keydown", (event: KeyboardEvent) => { void imeKeydown(el, event); });
  node.addEventListener("keyup", async (event: KeyboardEvent) => {
    if (event.key !== "Shift" || !shiftCleanPress) return;
    shiftCleanPress = false;
    const r = await ime.toggleAsciiMode();
    if (r.type === "commit") {
      commitText(el, r.consumedBuffer, el instanceof HTMLInputElement ? r.text.replace(/[\r\n]+/g, " ") : r.text);
      if (el === editorEl) noteExternalEditAny(); else el.dispatchEvent(new Event("input"));
    }
    renderImeState();
  });
  node.addEventListener("blur", () => { shiftCleanPress = false; });
  // 系统层组字（Quest/安卓把实体键盘的字母也过一遍系统输入法；桌面系统输入法在中文态）——**不再撤字**（撤字 = 「无法输入」，
  //   user 2026-09-04 Quest 回归）：纯 ASCII 组字 = 系统替我们攒的拼音 → 结束时删掉系统留下的裸字母、逐字喂给内置 IME
  //   （之后的空格/数字走 beforeinput 合成路径进 RIME：拼音+空格 = 首选）；含非 ASCII（系统输入法已出汉字）→ 原样保留 + 提示一次。
  //   insertCompositionText 不可 preventDefault（PTT doc 血泪），只能事后处理。
  node.addEventListener("compositionend", (event: Event) => {
    if (!ime.enabled || isProgrammaticEdit()) return;
    const data = (event as CompositionEvent).data ?? "";
    if (!data) return;
    if (!/^[a-zA-Z0-9;]+$/.test(data)) { setStatus(t("ime.systemIntrusion"), { error: true }); return; }
    const end = el.selectionEnd ?? el.value.length, start = Math.max(0, end - data.length);
    if (el.value.slice(start, end) !== data) return;
    replaceRange(el, start, end, "");
    for (const ch of data) routeSyntheticKey(el, ch.toLowerCase());
  });
  node.addEventListener("beforeinput", (event: Event) => {
    const ie = event as InputEvent;
    if (!ime.enabled || isProgrammaticEdit()) return;   // 自己 execCommand 落的字别再路由一遍
    if (Date.now() - lastRealKeydownAt < 80) {   // 实体键盘：keydown 已路由；这里只挡组合中的裸字符
      if (!ime.isComposing()) return;
      if (ie.inputType !== "insertText" || !ie.data) return;
      if (/^[a-z0-9 ]$/i.test(ie.data)) event.preventDefault();
      return;
    }
    // 软键盘（无可辨 keydown）：把 insertText / 删除 / 换行翻成合成按键喂 IME；IME 决定拦不拦（preventDefault 在其第一个 await 前，同步生效）
    let key: string | null = null;
    if (ie.inputType === "insertText" && ie.data && ie.data.length === 1) key = ie.data;
    else if (ie.inputType === "deleteContentBackward") key = "Backspace";
    else if (ie.inputType === "insertLineBreak" || ie.inputType === "insertParagraph") key = "Enter";
    if (!key) return;
    if (routeSyntheticKey(el, key)) event.preventDefault();   // IME 放行 → 让浏览器正常插入
  });
}
setupImeOn(editorEl);

// RIME 用户词库 ↔ collection（事件驱动节流；idle/unload 无条件 flush）
let lastDictPushAt = 0, dictPushInFlight = false;
async function pushUserDict(): Promise<void> {
  if (dictPushInFlight || !ime.initialized) return;
  dictPushInFlight = true;
  try { const dump = await ime.dumpUserDir(); if (dump?.files?.length) { const savedAt = Date.now(); dictRestoredSavedAt = savedAt; rimeDict.setItem("dump", { ...dump, savedAt, device: deviceLabel() }); lastDictPushAt = savedAt; } }   // 先记 savedAt：自己推的 onChange 不再回灌重置引擎
  finally { dictPushInFlight = false; }
}
function maybePushUserDict(): Promise<void> { return Date.now() - lastDictPushAt < USER_DICT_PUSH_INTERVAL_MS ? Promise.resolve() : pushUserDict(); }
let dictRestoredSavedAt = 0;
async function pullUserDict(): Promise<void> {
  const dump = rimeDict.getItem<UserDictDump>("dump");
  if (!dump?.files?.length || !ime.initialized) return;
  if ((dump.savedAt ?? 0) <= dictRestoredSavedAt) return;
  dictRestoredSavedAt = dump.savedAt ?? Date.now();
  await ime.restoreUserDir(dump);
}
rimeDict.onChange("dump", () => { void pullUserDict(); });

// ── 语音（全本机：硬规则 #8 声音不出设备；Web Speech / Groq / OpenAI 2026-09-03 sunset）──
//   默认开、无开关（user 2026-09-03「无须 consent 默认开」）：consent = 下载语音包那一下点击（体积明摆着）。没包：话筒常驻，点了给下载 sheet；
//   按 Ctrl 只在状态栏提一句、绝不碰 getUserMedia（Ctrl+S 永远安静）。有包：第一次真用才弹麦克风权限。
const micButton = $<HTMLButtonElement>("micButton");
const voiceBackspaceButton = $<HTMLButtonElement>("voiceBackspaceButton");
let voiceMode = false;   // 语音模式 = 上一次输入来自语音、之后没敲过实体键——只有纯鼠标/手柄口述的人看得到退格钮（user 2026-09-04「纯鼠标语音模式可能需要一个退格键」）
const voiceModel = (): ModelKey => modelKeyFrom(prefs.getItem<string>("voiceProvider"));   // 旧值 webspeech/groq/openai → 默认 SenseVoice
const voiceSource = (): string => (deviceKvGet("voiceModelSource") || MODEL_SOURCE_DEFAULT).replace(/\/+$/, "");
const onVoiceInsert = () => { editor.noteExternalEdit(); idle.poke(); if (!voiceMode) { voiceMode = true; renderMicVisibility(); } };
const voiceErrorText = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw === "pack-missing") return t("voice.pack.missing");
  if (/NotAllowedError|Permission|denied/i.test(raw)) return t("voice.micDenied");
  return t("voice.failed", { e: raw });
};
const onVoiceState = (next: VoiceState, error?: unknown) => {
  if (next === "recording" && pttBackend && !pttCommitted) return;   // PTT 250ms 门没过就不画「录音中」（Ctrl 和弦不闪）
  micButton.setAttribute("data-state", next);
  if (next === "recording" || next === "listening") setStatus(t("voice.recording"));
  else if (next === "transcribing") setStatus(t("voice.transcribing"));
  else if (next === "error" && error) setStatus(voiceErrorText(error), { error: true });
  else if (next === "idle") { const txt = toastEl.textContent; if (txt === t("voice.recording") || txt === t("voice.transcribing") || txt === t("voice.loadingModel")) setStatus(""); }
};
const localSession: VoiceSession | null = isLocalVoiceSupported()
  ? new LocalSession({ target: editorEl, onChange: onVoiceInsert, onState: onVoiceState, getModel: () => MODELS[voiceModel()], onLoading: (on) => { if (on) setStatus(t("voice.loadingModel")); }, onPackMissing: () => setStatus(t("voice.pack.missingHint")) })
  : null;
function activeVoiceBackend(): VoiceSession | null { return localSession; }
/** 点话筒但没包：下载即同意——一个带体积的 sheet，点「下载」就地跑进度（状态栏），不进设置页。 */
async function offerVoicePack(): Promise<void> {
  const m = MODELS[voiceModel()];
  if (!(await openConfirmSheet(t("voice.pack.offerTitle"), t("voice.pack.offerMsg", { name: t(m.nameKey), mb: mbOf(m.bytes) }), { okLabel: t("ui.voice.download") }))) return;
  await runPackJob((p) => asr.download(m.slug, voiceSource(), p), t("voice.pack.readyHint"));
}
voiceAbortHook = () => { if (localSession && (localSession.state === "recording" || localSession.state === "transcribing")) localSession.abort(); };
function pickSpeechLang(): string { const s = ime.getState(); return s.enabled && !s.asciiMode ? "zh-CN" : "en-US"; }
function renderMicVisibility(): void {
  const st = editor.state;
  const absent = !activeVoiceBackend() || (!st.name && !st.pendingDate) || st.locked || (st.unavailable && booted);   // 锁着/不可用：锁卡盖着纸面，话筒收起
  const blocked = st.readOnly;   // 只读：可见但灰，点了 toast 说原因——别让钮凭空消失（user 2026-09-04「麦克风按钮怎么不见了」）
  micButton.hidden = absent;
  micButton.classList.toggle("disabled", blocked);
  micButton.title = blocked ? t("voice.blockedReadOnly") : t("voice.mic");
  voiceBackspaceButton.hidden = absent || blocked || !voiceMode;
}
/** 语音模式退格：删光标前一个字（整个 emoji 算一个）/ 选区；组字中则喂 IME。按住连删。 */
function deleteBeforeCaret(): void {
  if (!editor.canEdit()) return;
  if (ime.isComposing()) { routeSyntheticKey(editorEl, "Backspace"); return; }
  const s = editorEl.selectionStart, e = editorEl.selectionEnd;
  if (s == null || e == null) return;
  if (s !== e) replaceRange(editorEl, s, e, "");
  else if (s > 0) { const n = /[\uDC00-\uDFFF]$/.test(editorEl.value.slice(0, s)) ? 2 : 1; replaceRange(editorEl, s - n, s, ""); }
  else return;
  localSession?.notifyExternalInput();
  editor.noteExternalEdit();
}
let bsRepeat: ReturnType<typeof setTimeout> | null = null;
const stopBsRepeat = () => { if (bsRepeat) { clearTimeout(bsRepeat); bsRepeat = null; } };
voiceBackspaceButton.addEventListener("pointerdown", (e) => {
  e.preventDefault();   // 别抢编辑器焦点
  deleteBeforeCaret(); stopBsRepeat();
  const tick = () => { deleteBeforeCaret(); bsRepeat = setTimeout(tick, 60); };
  bsRepeat = setTimeout(tick, 450);
});
for (const ev of ["pointerup", "pointercancel", "pointerleave"]) voiceBackspaceButton.addEventListener(ev, stopBsRepeat);
micButton.addEventListener("click", () => {
  void (async () => {
    if (!editor.canEdit()) { setStatus(micButton.title, { error: true }); return; }
    const backend = activeVoiceBackend(); if (!backend) return;
    const m = MODELS[voiceModel()];
    let ready = asr.isKnownReady(m.slug);
    if (ready === undefined) { try { ready = (await asr.status(m.slug)).ready; } catch { ready = false; } }
    if (!ready) { await offerVoicePack(); return; }
    if (ime.isComposing()) { ime.resetComposition(); renderImeState(); }
    editorEl.focus();
    backend.toggle(pickSpeechLang());
  })();
});
editorEl.addEventListener("input", () => { localSession?.notifyExternalInput(); });
editorEl.addEventListener("pointerdown", () => { if (localSession?.state === "recording") localSession.abort(); });

// Left Ctrl push-to-talk（docs/20260524-push-to-talk.md 终形：keydown 立即起录，250ms 门决定留/丢，其它键 = 和弦 → 弃）
let pttBackend: VoiceSession | null = null, pttCommitted = false, pttTimer: ReturnType<typeof setTimeout> | null = null;
const isPttKey = (e: KeyboardEvent) => e.code === "ControlLeft";
function pttAbort(): void { if (pttTimer) { clearTimeout(pttTimer); pttTimer = null; } pttBackend?.abort(); pttBackend = null; pttCommitted = false; }
document.addEventListener("keydown", (event) => {
  if (pttBackend && !isPttKey(event)) { pttAbort(); return; }
  if (!isPttKey(event) || event.repeat || event.shiftKey || event.altKey || event.metaKey) return;
  if (document.activeElement !== editorEl || !editor.canEdit()) return;
  if (pttBackend) return;
  const backend = activeVoiceBackend();
  if (!backend || backend.state !== "idle") return;
  pttBackend = backend; pttCommitted = false;
  void backend.start(pickSpeechLang());
  pttTimer = setTimeout(() => { pttTimer = null; pttCommitted = true; if (pttBackend?.state === "recording") onVoiceState("recording"); }, PTT_HOLD_MS);
}, { capture: true });
document.addEventListener("keyup", (event) => {
  if (!isPttKey(event) || !pttBackend) return;
  if (pttTimer) { clearTimeout(pttTimer); pttTimer = null; }
  if (pttCommitted) pttBackend.stop(); else pttBackend.abort();
  pttBackend = null; pttCommitted = false;
});

// ── 阅读节奏 ──
function applyReadingMode(mode: string | undefined): void {
  const next = mode === "classic" ? "classic" : "novel";
  document.body.classList.toggle("reading-classic", next === "classic");
  for (const opt of document.querySelectorAll<HTMLElement>("#readingModePicker .reading-mode-option")) {
    const sel = opt.dataset.mode === next; opt.classList.toggle("is-selected", sel);
    const input = opt.querySelector("input"); if (input) input.checked = sel;
  }
}
$("readingModePicker").addEventListener("change", (event) => {
  const v = (event.target as HTMLInputElement | null)?.value;
  if (v !== "novel" && v !== "classic") return;
  applyReadingMode(v); prefs.setItem("readingMode", v);
});
prefs.onChange("readingMode", () => applyReadingMode(prefs.getItem<string>("readingMode")));
// 字号档位（device-kv：跟屏幕走，手机上按「每行字数」规范算出来只有 16px——user 2026-09-04 iPhone「字好小啊」；规范继续管行宽，档位只乘字号）
const FONT_SCALES = ["0.85", "1", "1.15", "1.3", "1.5"];
const fontScaleSelect = $<HTMLSelectElement>("fontScaleSelect");
const fontScalePref = (): string => { const v = deviceKvGet("fontScale"); return v && FONT_SCALES.includes(v) ? v : "1"; };
function applyFontScale(v: string): void { document.documentElement.style.setProperty("--font-scale", v); fontScaleSelect.value = v; }
fontScaleSelect.addEventListener("change", () => { const v = FONT_SCALES.includes(fontScaleSelect.value) ? fontScaleSelect.value : "1"; deviceKvSet("fontScale", v === "1" ? null : v); applyFontScale(v); });
// 写字线（synced prefs，与阅读节奏同席：视觉偏好跟人走；缺省开）
const ruledLinesToggle = $<HTMLInputElement>("ruledLinesToggle");
const ruledLinesPref = (): boolean => prefs.getItem<boolean>("ruledLines") !== false;
function applyRuledLines(on: boolean): void { document.body.classList.toggle("ruled-lines", on); ruledLinesToggle.checked = on; }
ruledLinesToggle.addEventListener("change", () => { prefs.setItem("ruledLines", ruledLinesToggle.checked); applyRuledLines(ruledLinesToggle.checked); });
prefs.onChange("ruledLines", () => applyRuledLines(ruledLinesPref()));

// ── 设置视图 ──
const authRow = $("authRow");
function renderAuthRow(): void {
  renderCloudButton();
  const stt = auth.getAuthState();
  authRow.innerHTML = "";
  if (stt.signedIn && stt.account) {
    const label = (stt.account as { username?: string; name?: string }).username || (stt.account as { name?: string }).name || t("auth.signedIn");
    const span = document.createElement("span"); span.className = "auth-account"; span.title = label; span.textContent = t("auth.signedInAs", { name: label });
    authRow.appendChild(span);
    if (isUnlocked()) { const b = document.createElement("button"); b.className = "auth-action"; b.textContent = t("auth.lockCrypto"); b.title = t("auth.lockCryptoHint"); b.addEventListener("click", () => { void lockCryptoNow(); }); authRow.appendChild(b); }
    const out = document.createElement("button"); out.className = "auth-action"; out.textContent = t("auth.signOut"); out.addEventListener("click", () => { void onSignOut(); }); authRow.appendChild(out);
    return;
  }
  const btn = document.createElement("button"); btn.className = "auth-action primary"; btn.textContent = t("auth.signIn");
  btn.addEventListener("click", () => { void onSignIn(); });
  authRow.appendChild(btn);
}
const cloudButton = $<HTMLButtonElement>("cloudButton");
function renderCloudButton(): void {
  const stt = auth.getAuthState();
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const state = stt.signedIn ? (offline ? "offline" : "signedin") : "out";
  cloudButton.dataset.cloudState = state;
  cloudButton.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#${state === "signedin" ? "cloud-synced" : state === "offline" ? "cloud-unavailable" : "cloud"}"/></svg>`;
  const who = stt.signedIn ? ((stt.account as { username?: string; name?: string } | null)?.username || (stt.account as { name?: string } | null)?.name || t("auth.signedIn")) : "";
  cloudButton.title = state === "signedin" ? t("cloud.titleIn", { who }) : state === "offline" ? t("cloud.titleOffline", { who }) : t("cloud.titleOut");
  cloudButton.setAttribute("aria-label", cloudButton.title);
}
cloudButton.addEventListener("click", () => {
  const stt = auth.getAuthState();
  const who = stt.signedIn ? ((stt.account as { username?: string; name?: string } | null)?.username || (stt.account as { name?: string } | null)?.name || t("auth.signedIn")) : "";
  togglePopupMenu({
    anchor: cloudButton, align: "right",
    items: () => stt.signedIn
      ? [
          { id: "who", label: navigator.onLine === false ? t("cloud.accountOffline", { who }) : t("cloud.account", { who }), icon: "cloud-synced", disabled: true },
          { id: "refresh", label: t("cloud.refresh"), icon: "refresh", hidden: navigator.onLine === false },
          { id: "lock", label: t("auth.lockCrypto"), icon: "lock", hidden: !isUnlocked() },
          { id: "signout", label: t("cloud.disconnect"), icon: "cloud-unavailable", danger: true, separatorBefore: true },
        ]
      : [
          { id: "who", label: t("cloud.notConnected"), icon: "cloud", disabled: true },
          { id: "signin", label: t("cloud.connect"), icon: "cloud-upload" },
        ],
    onPick: (id) => {
      if (id === "refresh") { drawer.subscribe(); void resumeSync(); }
      else if (id === "lock") void lockCryptoNow();
      else if (id === "signout") void onSignOut();
      else if (id === "signin") void onSignIn();
    },
  });
});
/** 登录（#60-C 两步手势，2026-09-09 对账 WeebPaint redirectAfterFlush）：先落盘（活稿 + collections），落盘失败不跳（响亮）；再弹「去登录」，
 *  onPick 在按钮 click 同步栈里起跳 redirect 登录起跳（手势纪律）。为什么：redirect 离场后 pagehide 里的写在 WebKit 上永远 commit 不了、只会把锁冻在旧页里。 */
async function onSignIn(): Promise<void> {
  try { await editor.flushLocal(); await flushCollections(); }
  catch (e) { reportError(new Error("[sign-in] flush before redirect failed — not navigating: " + String(e)), "error"); setStatus(t("auth.flushFailed"), { error: true }); return; }
  await openChoiceSheet<"go">(t("auth.readyTitle"), t("auth.readyMsg"), [{
    label: t("auth.go"), value: "go", primary: true,
    onPick: () => {
      setStatus(t("auth.redirecting"));
      void requestStoragePersistence();   // 手势里：persist 申请 + 账号选择器（user 2026-08-23 建议）
      auth.signIn({ prompt: "select_account" }).catch((e) => { reportError(e); setStatus(t("auth.signInFailed", { e: e instanceof Error ? e.message : String(e) }), { error: true }); });
    },
  }]);
}
async function onSignOut(): Promise<void> {
  if (!(await openConfirmSheet(t("auth.signOutTitle"), t("auth.signOutMsg")))) return;
  await editor.flushLocal();
  try { await flushCollections(); cryptoLock(); await auth.signOut(); setStatus(t("auth.signedOut")); }
  catch (e) { reportError(e); }
  renderAuthRow(); renderTopbar();
}
async function lockCryptoNow(): Promise<void> {
  await editor.flushLocal();    // 先把最后几秒的字加密落盘，再丢密码
  cryptoLock();
  if (editor.state.name && editor.state.encrypted) await editor.reload(editor.state.name);
  renderAuthRow(); renderTopbar(); drawer.refresh();
  setStatus(t("enc.lockedNow"));
}

const voiceModelSelect = $<HTMLSelectElement>("voiceModelSelect");
const voicePackStatus = $("voicePackStatus");
const voicePackProgress = $<HTMLProgressElement>("voicePackProgress");
const voicePackDownload = $<HTMLButtonElement>("voicePackDownload");
const voicePackImport = $<HTMLButtonElement>("voicePackImport");
const voicePackDelete = $<HTMLButtonElement>("voicePackDelete");
const voicePackFile = $<HTMLInputElement>("voicePackFile");
const voiceSourceInput = $<HTMLInputElement>("voiceSourceInput");
const mbOf = (n: number) => String(Math.round(n / 1048576));
let packBusy = false;
function renderVoiceConfig(): void {
  voiceModelSelect.value = voiceModel();
  voiceSourceInput.value = voiceSource();
  $("voiceAttribution").textContent = t(MODELS[voiceModel()].attrKey);
  void renderPackStatus();
}
async function renderPackStatus(): Promise<void> {
  const m = MODELS[voiceModel()];
  voicePackProgress.hidden = !packBusy;
  voicePackDownload.disabled = voicePackImport.disabled = voicePackDelete.disabled = packBusy;
  if (packBusy) return;
  try {
    const st = await asr.status(m.slug);
    voicePackStatus.textContent = st.ready ? t("voice.pack.ready", { mb: mbOf(st.bytesTotal) }) : st.bytesCached > 0 ? t("voice.pack.partial", { done: mbOf(st.bytesCached), total: mbOf(st.bytesTotal) }) : t("voice.pack.none", { mb: mbOf(st.bytesTotal) });
    voicePackDownload.hidden = st.ready; voicePackImport.hidden = st.ready; voicePackDelete.hidden = !st.ready && st.bytesCached === 0;
  } catch (e) { voicePackStatus.textContent = t("voice.pack.failed", { e: e instanceof Error ? e.message : String(e) }); }
}
async function runPackJob(job: (onProgress: (p: { done: number; total: number }) => void) => Promise<unknown>, doneText = t("voice.pack.readyToast")): Promise<void> {
  if (packBusy) return;
  packBusy = true; voicePackProgress.value = 0; void renderPackStatus();
  try {
    await job((p) => { voicePackProgress.value = p.total ? p.done / p.total : 0; const txt = t("voice.pack.downloading", { done: mbOf(p.done), total: mbOf(p.total) }); voicePackStatus.textContent = txt; if (drawer.currentView() === "closed") setStatus(txt); });
    setStatus(doneText);
  } catch (e) { reportError(e, "warning"); voicePackStatus.textContent = t("voice.pack.failed", { e: e instanceof Error ? e.message : String(e) }); }
  finally { packBusy = false; void renderPackStatus(); }
}
prefs.onChange("voiceProvider", () => { if (drawer.currentView() === "settings") renderVoiceConfig(); });
voiceModelSelect.addEventListener("change", () => { prefs.setItem("voiceProvider", modelKeyFrom(voiceModelSelect.value)); void asr.unload().catch(() => {}); renderVoiceConfig(); });
voiceSourceInput.addEventListener("change", () => { const v = voiceSourceInput.value.trim(); deviceKvSet("voiceModelSource", v && v !== MODEL_SOURCE_DEFAULT ? v : null); voiceSourceInput.value = voiceSource(); });
voicePackDownload.addEventListener("click", () => { const m = MODELS[voiceModel()]; void runPackJob((p) => asr.download(m.slug, voiceSource(), p)); });
voicePackImport.addEventListener("click", () => { voicePackFile.value = ""; voicePackFile.click(); });
voicePackFile.addEventListener("change", () => { const files = Array.from(voicePackFile.files ?? []); if (!files.length) return; const m = MODELS[voiceModel()]; void runPackJob((p) => asr.importFiles(m.slug, files, p)); });
voicePackDelete.addEventListener("click", () => {
  void (async () => {
    const m = MODELS[voiceModel()];
    if (!(await openConfirmSheet(t("voice.pack.deleteTitle"), t("voice.pack.deleteMsg", { mb: mbOf(m.bytes) }), { danger: true }))) return;
    await runPackJob(async () => { await asr.delete(m.slug); }, t("voice.pack.deleted"));
  })();
});

const langSelect = $<HTMLSelectElement>("langSelect");
for (const l of LANGS) { const o = document.createElement("option"); o.value = l; o.textContent = LANG_NAME[l]; langSelect.appendChild(o); }
langSelect.value = lang();
langSelect.addEventListener("change", () => { void (async () => { await editor.flushLocal(); await flushCollections(); setLang(langSelect.value as Lang); })(); });

$("forceUpdateButton").addEventListener("click", () => {
  void (async () => { if (await openConfirmSheet(t("settings.forceUpdateTitle"), t("settings.forceUpdateMsg"))) { await withBusy(t("settings.forceUpdating"), () => shell.forceReset()); } })();   // flush 在 shell.onBeforeReload 里（带超时），遮罩留到导航发生
});
// ── 加密密码：更改（可迁移已有稿）/ 忘记重置 ──
async function changePasswordFlow(): Promise<void> {
  if (!(await ensureUnlocked())) return;
  const old = currentPassword()!;
  const next = await openInputSheet(t("cp.newTitle"), { message: t("cp.newHint"), password: true, confirmField: true, okLabel: t("pw.set"), validate: (v, v2) => (v !== v2 ? t("pw.mismatch") : null) });
  if (next == null) return;
  if (next === old) { setStatus(t("cp.same")); return; }
  const mode = await openChoiceSheet<"migrate" | "keep">(t("cp.migrateTitle"), t("cp.migrateMsg"), [{ label: t("cp.migrate"), value: "migrate" }, { label: t("cp.keep"), value: "keep" }]);
  if (mode == null) return;
  await editor.flushLocal();
  const openName = editor.state.name;
  let moved = 0, kept = 0;
  await withBusy(t("busy.migrating"), async () => {
    await setCurrentPassword(next);
    if (mode === "keep" && openName && editor.state.encrypted && !editor.state.locked) rememberFilePassword(openName, old);   // 正开着的这篇是用旧密码开的：登记，重载不用再问
    if (mode === "migrate") {
      for (const it of drawer.items()) {
        if (it.encrypted === false) continue;
        try {
          if (!(await verifyDocPassword(it.name, old))) { if (it.encrypted) kept++; continue; }   // 别的密码 / 其实不是加密件
          rememberFilePassword(it.name, old);                       // seam 对这篇给旧钥（解旧包用）
          const r = await rekeyDoc(it.name, next);                  // store 0.12.0：密文→密文，明文不上云（以前 decrypt→encrypt 把明文 push 上 OneDrive）
          if (r.status === "swapped" || r.status === "cloud-deferred" || r.status === "conflict") { forgetFilePassword(it.name); moved++; }   // 本地已是新钥容器；云端由 push 流接力
          else { kept++; reportError(new Error(`[change-password] rekey ${it.name}: ${r.status}`), "log"); }   // offline / locked / no-local：这篇仍是旧钥，表里保留
        } catch (e) { reportError(e, "warning"); kept++; }
      }
    }
  });
  if (openName && editor.state.name === openName) await editor.reload(openName);
  setStatus(mode === "migrate" ? t("cp.done", { n: String(moved), m: String(kept) }) : t("cp.doneKeep"));
  drawer.refresh();
}
async function resetPasswordFlow(): Promise<void> {
  if (!(await openConfirmSheet(t("rp.title"), t("rp.msg"), { danger: true, warning: true, okLabel: t("rp.action") }))) return;
  resetVerifier();
  if (editor.state.name && editor.state.encrypted) await editor.reload(editor.state.name);
  renderTopbar(); drawer.refresh();
  setStatus(t("rp.done"));
}
// ── 设置页：输入法（方案 per-device + 「用系统输入法」逃生开关）──
const imeSchemaSelect = $<HTMLSelectElement>("imeSchemaSelect");
const systemImeToggle = $<HTMLInputElement>("systemImeToggle");
const softKeyboardSelect = $<HTMLSelectElement>("softKeyboardSelect");
const imeScriptSelect = $<HTMLSelectElement>("imeScriptSelect");
const quoteStyleSelect = $<HTMLSelectElement>("quoteStyleSelect");
function renderImeSection(): void { imeSchemaSelect.value = imeSchemaPref(); systemImeToggle.checked = !ime.enabled; softKeyboardSelect.value = softKeyboardPref(); imeScriptSelect.value = imeSimplifiedPref() ? "simp" : "trad"; quoteStyleSelect.value = quoteStylePref(); }
quoteStyleSelect.addEventListener("change", () => { const v = quoteStyleSelect.value === "corner" ? "corner" : "curly"; prefs.setItem("quoteStyle", v); applyQuoteStyle(v); });
prefs.onChange("quoteStyle", () => { applyQuoteStyle(quoteStylePref()); if (drawer.currentView() === "settings") renderImeSection(); });
imeScriptSelect.addEventListener("change", () => { const v = imeScriptSelect.value === "simp"; prefs.setItem("imeSimplified", v); void ime.setSimplified(v); });
prefs.onChange("imeSimplified", () => { void ime.setSimplified(imeSimplifiedPref()); if (drawer.currentView() === "settings") renderImeSection(); });
softKeyboardSelect.addEventListener("change", () => { deviceKvSet("softKeyboard", softKeyboardSelect.value === "ascii" ? "ascii" : null); applyInputMode(ime.enabled); });
imeSchemaSelect.addEventListener("change", () => {
  const v = imeSchemaSelect.value; if (!isImeSchema(v)) return;
  prefs.setItem("imeSchema", v);
  void ime.setSchema(v).then(() => { renderImeState(); setStatus(t("ime.schemaSwitched", { name: schemaName(v) })); });
});
prefs.onChange("imeSchema", () => {   // 别的设备改了方案 → 本机跟上
  const v = imeSchemaPref();
  if (ime.schema !== v) void ime.setSchema(v).then(() => { renderImeState(); if (drawer.currentView() === "settings") renderImeSection(); });
});
systemImeToggle.addEventListener("change", () => { void setImeEnabled(!systemImeToggle.checked).then(renderImeSection); });
$("changePasswordButton").addEventListener("click", () => { void changePasswordFlow(); });
$("resetPasswordButton").addEventListener("click", () => { void resetPasswordFlow(); });
$("lockNowButton").addEventListener("click", () => { void lockCryptoNow(); });
function renderPasswordSection(): void {
  $("passwordStatus").textContent = !hasVerifier() ? t("pw.status.none") : isUnlocked() ? t("pw.status.unlocked") : t("pw.status.locked");
  $<HTMLButtonElement>("lockNowButton").hidden = !isUnlocked();
  $<HTMLButtonElement>("changePasswordButton").hidden = !hasVerifier();
  $<HTMLButtonElement>("resetPasswordButton").hidden = !hasVerifier();
}

const factoryReset = () => runFactoryReset({
  setStatus,
  unsyncedCount: async () => { await editor.flushLocal(); return (await dirtyDocCount()) + (editor.isDirty() ? 1 : 0); },   // 全库 dirty 标量（不只当前夹）
  beforeWipe: async () => { await editor.flushLocal(); await flushCollections(); editor.clear(); ime.dispose(); },
});
$("factoryResetButton").addEventListener("click", () => { void factoryReset(); });
initDiagLogUi({ status: (text) => setStatus(text) });   // 2026-09-09 黑匣子：看/复制/分享或下载 .txt/清空（数据源 diag-log）
function renderSettings(): void { renderAuthRow(); renderImeSection(); renderPasswordSection(); renderVoiceConfig(); }

// ── 抽屉按钮 ──
$("menuButton").addEventListener("click", () => { if (galleryHost.isOpen()) galleryHost.close(); else if (drawer.currentView() !== "closed") drawer.close(); else void galleryHost.open(); });   // 2.0：☰ = 图库屏（抽屉只剩设置）
$("drawerCloseButton").addEventListener("click", () => drawer.close());
$("drawerBackButton").addEventListener("click", () => drawer.open("active"));
$("drawerBackdrop").addEventListener("click", () => drawer.close());
// 「新建…」= 弹出菜单（WeebPaint 图库 ＋ 同形；user 2026-09-04「新建文件夹收到新建里面…新建菜单里面可以加新建加密文件」）
const newDocButton = $("newDocButton");
function openNewMenu(anchor: HTMLElement, currentFolder: () => string, afterNew: () => void): void {
  togglePopupMenu({
    anchor, align: "left",
    items: () => [
      { id: "doc", label: t("ui.newDoc"), icon: "new" },
      { id: "enc", label: t("ui.newEncDoc"), icon: "lock" },
      { id: "project", label: t("project.new"), icon: "new", separatorBefore: true },
      { id: "local", label: t("project.openLocal"), icon: "folder-open" },
      { id: "folder", label: t("ui.newFolder"), icon: "create-folder", separatorBefore: true, hidden: !!currentFolder() },   // 只一层：夹里不再建夹（ADR-0006）
    ],
    onPick: (id) => {
      if (id === "folder") { void drawer.newFolder(); return; }
      if (id === "project") { void newProjectFlow(); return; }
      if (id === "local") { void openLocalProjectFlow(); return; }
      if (project.active()) { void leaveProject().then(() => editor.newDoc({ dir: currentFolder(), encrypted: id === "enc" })).then(afterNew); return; }
      void editor.newDoc({ dir: currentFolder(), encrypted: id === "enc" }).then(afterNew);
    },
  });
}
newDocButton.addEventListener("click", (e) => { e.stopPropagation(); openNewMenu(newDocButton, () => drawer.currentFolder(), () => drawer.close()); });
$("galleryNewBtn").addEventListener("click", (e) => { e.stopPropagation(); openNewMenu($("galleryNewBtn"), () => galleryHost.currentFolder(), () => galleryHost.close()); });
$("openTrashButton").addEventListener("click", () => drawer.open("trash"));
$("settingsButton").addEventListener("click", () => drawer.open("settings"));   // 设置入口在抽屉头云图标旁（user 2026-09-04「扳手还是收到 gallery 里面吧…看看 weebpaint 的布局」）
$("emptyTrashButton").addEventListener("click", () => { void drawer.onEmptyTrash(); });
$("reloadButton").addEventListener("click", () => { void (async () => { await editor.flushLocal(); await flushCollections(); setStatus(t("st.reloading")); location.reload(); })(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !event.defaultPrevented && drawer.currentView() !== "closed") { drawer.close(); return; }
  if (event.key === "Escape" && !event.defaultPrevented && galleryHost.isOpen()) { galleryHost.close(); return; }
  if ((event.ctrlKey || event.metaKey) && (event.key === "s" || event.key === "S")) { event.preventDefault(); void smartSave(); return; }
  if (project.active() && (event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void project.spawnFromSelection().then((ok) => { if (ok) edgeSidebar.render(); }); return; }
  if (project.active() && event.altKey && event.key === "ArrowLeft") { event.preventDefault(); if (project.goBack()) edgeSidebar.render(); }
});

// ── 闲置锁屏 / 前台复查 / 隐藏推送 ──
async function resumeSync(): Promise<void> {
  if (!auth.isSignedIn()) return;
  setStatus(t("st.syncing"));
  await pushNowAny();
  await requireStore().files.drainOfflineQueue().catch((e) => reportError(e, "log"));
  await refreshIfCleanAny();
  await reconcileCollections();
  drawer.subscribe();   // 2026-09-09 审计 #8：refresh 只重画缓存帧，回线/复查要重拉
  setState(editor.statusForDoc());
}
const idle = initIdleGate({
  overlay: $("idleOverlay"),
  onIdle: () => { if (auth.isSignedIn()) { void editor.pushNow(); void pushUserDict(); rememberLastActive(); } else void editor.flushLocal(); },
  onResume: resumeSync,
  focusEditor: () => editorEl.focus(),
});
// ── Quest：放下手柄时系统键盘焦点会跑去别的 app（空格在 VRChat 里跳起来）——拦不住，能做的 = 焦点回来 / 页内任意处敲键时
//   静默回到编辑器，第一击不丢（user 2026-09-04）。「键盘不在本页」提示条 + 压暗同日撤：光标失踪本身看得见，没有煤气灯疑惑。
function modalOpen(): boolean { return !!document.querySelector('[role="dialog"]:not(.hidden)') || !!currentPopupMenu() || drawer.currentView() !== "closed" || idle.isShown(); }
function recoverEditorFocus(): boolean {
  const a = document.activeElement;
  if (a && a !== document.body && a !== document.documentElement) return a === editorEl;
  if (modalOpen() || !editor.canEdit()) return false;
  editorEl.focus();
  return document.activeElement === editorEl;
}
window.addEventListener("focus", () => { recoverEditorFocus(); });
document.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.defaultPrevented || (event.target !== document.body && event.target !== document.documentElement)) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.length !== 1 && event.key !== "Backspace" && event.key !== "Enter") return;
  if (!recoverEditorFocus()) return;
  void imeKeydown(editorEl, event);   // 这一击不丢：直接走编辑器的 IME 路径（放行键的默认动作会落进刚聚焦的编辑器）
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { void flushLocalAny().then(() => { if (auth.isSignedIn()) return pushNowAny(); }); void pushUserDict(); void flushCollections(); }
});
// #60-C 同款（2026-09-09，对账 WeebPaint v0.14.4）：只在 persisted=false（页面真在销毁）时写。persisted=true = 要进 bfcache：WebKit 上 pagehide 里起的
//   IDB 写永远 commit 不了，只会把锁冻在旧页里、让 redirect 回来的新页全挂（WeebPaint ai-docs/20260909-bfcache-idb-lock-daily-reauth-analysis.md）；
//   store 0.12.1 起也会把这种写直接弃掉。要落盘的必须在导航之前写完（onSignIn 已 await flush）。
window.addEventListener("pagehide", (e: PageTransitionEvent) => { if (!e.persisted) { void flushLocalAny(); void flushCollections(); } });
window.addEventListener("online", () => {
  renderCloudButton(); renderSaveButton();
  if (auth.isSignedIn()) { setStatus(t("st.online")); drawer.subscribe(); void resumeSync(); }
  else void auth.retrySilentSignIn().then((ok) => diagNote("auth", `retrySilentSignIn on online → ${String(ok)}`)).catch((e) => reportError(e, "log"));   // 2026-09-09 审计 #3：登出态回线也试一次静默补登（store 0.12.1 有 60s 闩，不会风暴）
});
window.addEventListener("offline", () => { renderCloudButton(); renderSaveButton(); });
setInterval(() => { if (document.visibilityState === "visible" && !idle.isShown()) { void editor.refreshIfClean(); if (drawer.currentView() === "active") drawer.subscribe(); } }, FOREGROUND_POLL_MS);

// ── standalone 标记：贴边件地板（styles.css --top-floor / --bottom-floor）按它切换；display-mode 媒体查询 + iOS 的 navigator.standalone 双保险 ──
{
  const mq = matchMedia("(display-mode: standalone), (display-mode: fullscreen)");
  const apply = () => document.documentElement.toggleAttribute("data-standalone", mq.matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
  apply(); mq.addEventListener?.("change", apply);
}
// ── PWA 壳 ──
const updateToast = $("updateToast");
// 2026-09-09（审计 #5，对账 WeebPaint v0.13.1）：SW 更新提示与 reload 等 boot 期 auth 初始化落地（封顶 8s）——redirect 回程 handleRedirectPromise
//   正在用 URL 里的 code 换 token 时 reload = code 丢失 → 回来只剩「有缓存账号但没登上」的假离线。
let _authBootResolve: () => void = () => {};
const authBootP = new Promise<void>((r) => { _authBootResolve = r; });
const authBootSettled = () => holdUntilSettled(authBootP, 8000);
const shell = initPwaShell({
  onUpdateAvailable: () => { void authBootSettled().then((how) => { diagNote("sw", `update available → toast (auth boot ${how})`); updateToast.classList.remove("hidden"); }); },
  onForeground: () => {
    if (idle.isShown()) return;
    if (!auth.isSignedIn() && navigator.onLine !== false) void auth.retrySilentSignIn().catch((e) => reportError(e, "log"));   // 2026-09-09 审计 #3：登出态回前台也试一次静默补登（store 闩住不风暴）
    void editor.refreshIfClean(); drawer.subscribe(); void reconcileCollections().then(() => drawer.refresh());
  },
  onBeforeReload: async () => { const how = await authBootSettled(); diagNote("sw", `reload requested (auth boot ${how})`); await editor.flushLocal(); await flushCollections(); },
});
$("updateReloadButton").addEventListener("click", () => { void shell.reload(); });
$("updateDismissButton").addEventListener("click", () => updateToast.classList.add("hidden"));
if (shell.isDevRoute) $("settingsBuild").textContent += " · dev";

// ── boot ──
async function boot(): Promise<void> {
  await initCollections();
  applyReadingMode(prefs.getItem<string>("readingMode"));
  applyRuledLines(ruledLinesPref());
  applyFontScale(fontScalePref());
  applyQuoteStyle(quoteStylePref());
  if (deviceKvGet("imeEnabled") !== "0") { ime.simplified = imeSimplifiedPref(); await ime.initialize(imeSchemaPref()); if (deviceKvGet("imeEnabled") !== "0") ime.enabled = true; if (ime.initializeError) setStatus(t("ime.fallback", { e: ime.initializeError }), { error: true }); await pullUserDict(); }   // 默认开（2026-09-03）
  renderImeState();
  drawer.subscribe();

  // auth（后台探测，不挡首帧）
  auth.onAuthChanged((st) => {
    diagNote("auth", `changed signedIn=${String(st.signedIn)} reason=${String(st.reason ?? "?")}`);
    renderAuthRow(); renderTopbar(); drawer.subscribe();
    if (st.signedIn) void afterSignIn();
    else if (st.reason === "expired") setStatus(t("auth.expired"), { error: true });   // 2026-09-09 审计 #3：过期 ≠ 主动退出，明说
  });   // 登录态变了 → 列表重订（否则停在登录前的本地帧）
  void auth.initAuth().then((st) => { renderAuthRow(); if (st.signedIn) void afterSignIn(); }).catch((e) => reportError(e, "warning")).finally(() => _authBootResolve());

  // 续写：本机上次打开的稿 → 否则最新一篇 → 否则新稿
  const last = editor.lastOpenName();
  if (last) await openAny(last);
  else {
    await Promise.race([drawer.firstFrame(), new Promise((r) => setTimeout(r, 3000))]);   // 等列表首帧（最多 3s），不再死等 1.5s 后开空新稿
    const first = drawer.items()[0]?.name ?? null;
    if (first) await openAny(first); else await editor.newDoc();
  }
  booted = true;
  if (new URLSearchParams(location.search).has("reset")) { setStatus(t("settings.forceUpdated", { v: APP_VERSION })); try { history.replaceState(null, "", location.pathname + location.hash); } catch { /* ignore */ } }   // 强制更新回执
  renderLockCard(); renderMicVisibility();
  renderTopbar();
  setState(editor.statusForDoc());
  editorEl.focus();
}
// 2026-09-09（审计 #3，「各种不刷新」头号嫌疑）：以前整函数一次性守卫——凭证过期后再次静默登录时什么都不做：不对齐 collections、
//   不排空离线队列、不快进当前稿、列表不重拉。现在每次登录都跑同步四件；只有「冷启动切到远端 lastActive」保持一次性（会切当前稿，
//   会话中途再登录不该跳）。并发合并：同一时刻只跑一份（boot 时 onAuthChanged 与 initAuth.then 会双触发）。
let bootLastActiveHandled = false;
let afterSignInInFlight: Promise<void> | null = null;
function afterSignIn(): Promise<void> {
  if (afterSignInInFlight) return afterSignInInFlight;
  afterSignInInFlight = (async () => {
    try {
      diagNote("auth", "afterSignIn: reconcile collections + user dict + drain offline queue");
      await reconcileCollections();
      await pullUserDict();
      void requireStore().files.drainOfflineQueue().catch((e) => reportError(e, "log"));
      if (!bootLastActiveHandled) {
        bootLastActiveHandled = true;
        // 冷启动尊重远端 lastActive（别的设备最后写的那篇）；本机正在打字/加密锁定的不切
        const remote = appState.getItem<{ name?: string }>("lastActive");
        if (remote?.name && remote.name !== editor.state.name && !editor.isDirty() && !editor.state.pendingDate) {
          const known = drawer.findByName(remote.name);
          if (known && !known.encrypted) await editor.open(remote.name);
        }
      }
      await refreshIfCleanAny();
      drawer.subscribe();   // 重拉（drawer.refresh 只重画缓存帧——审计 #8）
    } catch (e) { reportError(e, "warning"); }
  })().finally(() => { afterSignInInFlight = null; });
  return afterSignInInFlight;
}

window.addEventListener("error", (event) => { reportError(new Error(`[window] ${(event.message || "").slice(0, 160)}`)); });
window.addEventListener("unhandledrejection", (event) => {
  const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  reportError(err, err.message === "Not signed in" ? "log" : "error");   // 未登录 = 正常态（库后台云动作的 getToken 抛），只记日志
});

void boot();

// 供 boot smoke / 调试台探针（非 API）
(window as unknown as { __xhw?: unknown }).__xhw = { version: APP_VERSION, editor, drawer, store: requireStore, hasVerifier, parseDocName, choice: openChoiceSheet, confirm: openConfirmSheet, asr, models: MODELS, factoryReset, changePassword: changePasswordFlow, verifyDocPassword, forgetFilePassword, deleteFolder, snapshotFolders, ime, setImeEnabled, voiceBackspace: deleteBeforeCaret, lockNow: lockCryptoNow, smartSave, setVoiceMode: (on: boolean) => { voiceMode = on; renderMicVisibility(); }, recoverEditorFocus };
