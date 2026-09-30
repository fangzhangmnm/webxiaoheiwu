// 组合根：把 store 接缝 / 编辑器 / 抽屉 / IME / 语音 / 闲置锁屏 / PWA 壳接成一个 app。created 2026-09-03 by Claude Fable 5.1
// 这里只有接线与事件编排，没有业务规则（规则住各模块头注释）。
import { APP_VERSION } from "./version.ts";
import { IS_QUEST_BROWSER, PTT_HOLD_MS, USER_DICT_PUSH_INTERVAL_MS, FOREGROUND_POLL_MS } from "./config.ts";
import { initI18n, t, lang, setLang, LANGS, LANG_NAME, type Lang } from "./i18n/index.ts";
import { initErrorBadge, reportError} from "./error-badge.ts";
import { initSheets, openConfirmSheet, openConfirmSheetEx, openInputSheet, openInputSheetEx, openChoiceSheet, openPickSheet, withBusy, showBusy, hideBusy, INPUT_SECONDARY, type Choice } from "./sheets.ts";
import { auth, prefs, appState, rimeDict, initCollections, reconcileCollections, flushCollections, requireStore, requestStoragePersistence } from "./app-store.ts";
import { wireCryptoState, onLockChange, ensureUnlocked as cryptoEnsureUnlocked, ensureFileUnlocked as cryptoEnsureFileUnlocked, isUnlocked, lock as cryptoLock, hasVerifier, currentPassword, setCurrentPassword, resetVerifier, rememberFilePassword, forgetFilePassword, fileUsesOtherPassword, type VerifierRecord } from "./crypto-state.ts";
import { createEditor } from "./editor.ts";
import { verifyDocPassword, rekeyDoc, moveDoc, renameDoc, dirtyDocCount, deleteFolder, snapshotFolders, createProjectDoc, exportBranchToLibrary } from "./docs.ts";
import { docKind, formatDate, statsForText, decodeTextBytes, hex4, parseLooseDate, fmtLooseDate, splitDatedName } from "./doc-model.ts";
import { slimImage, makeCoverPng, NotAnImageError, type SlimResult } from "./image/import-image.ts";
import { importPageName } from "./image/policy.ts";
import { humanSize, readPngText, withPngText, PNG_BLURB_KEYWORD, type GalleryView } from "@internal/gallery";
import { createProjectMode } from "./project/mode.ts";
import { createReferenceHost } from "./reference-host.ts";
import type { WpReferenceWindow } from "@internal/reference-window";
import { createEdgeSidebar, fmtTime } from "./project/sidebar.ts";
import { pickLocalProject, triggerDownload, type LocalHome } from "./project/local-home.ts";
import { nodeDisplayName } from "./project/naming.ts";
import { packProject, emptyProject, nodeExt, nodeKind, readNodeText } from "./project/format.ts";
import { decodeToRgba, encodePng, encodeJpeg, probeSize, createTextMeasurer, paintScene } from "./image/codec.ts";   // 导出图片页到剪贴板：非 PNG 经唯一 canvas 点转 PNG（剪贴板只认 PNG）；长图：量字宽 + 落像素
import { planLongImage, SINGLE_IMAGE_MAX_HEIGHT, DEFAULT_WIDTH, screenHeightFor, socialSliceHeightFor, type LongImageSpec, type LongImageSection, type LongImageLook, type LongImagePlan, type ImageRef } from "./export/long-image.ts";
import { seedBook } from "./project/graph.ts";
import { normalizeNodeName } from "./project/mode.ts";
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
import { createInputPipeline } from "./input/pipeline.ts";
import { createImeDock } from "./input/dock.ts";
import { asTextField, type TextField } from "./input/field.ts";
import { createPaper } from "./ui/paper.ts";

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
/** Ctrl+S 与顶栏保存钮同一入口：脏 → 立即上传/落本地；干净且已登录 → 复查云端（同 WeebPaint「新鲜时点=刷新」）；
 *  已配置未登录（不含本机工程）→ 本地落盘照做 + 弹「去登录 / 暂不」（WeebPaint smartSaveAndPush 同款；user 2026-09-10「smart save 会 trigger onedrive login 吧？weebpaint 应该是这样的」）。 */
let _cloudSignInPromptDeclined = false;   // 同一 session 点过「暂不」→ 之后只状态行提示，不再弹（抄 WeebPaint 防烦旗；点背板/Esc 不记）
async function smartSave(): Promise<void> {
  const before = syncKindAny();
  if (before === "none" || before === "locked" || before === "unavailable") return;
  saveButton.classList.add("flash"); setTimeout(() => saveButton.classList.remove("flash"), 500);
  void requestStoragePersistence();   // 首存手势：persist 申请（persistence:"app-managed"）
  if (before === "clean") { await refreshIfCleanAny(); if (syncKindAny() === "clean") setStatus(t("save.upToDate")); renderSaveButton(); return; }
  if (before === "local" && !auth.isSignedIn() && !(project.active() && project.home()?.kind === "local")) {
    await pushNowAny();   // 未登录 = 只落本机
    if (_cloudSignInPromptDeclined || navigator.onLine === false) { setStatus(t("save.local")); renderSaveButton(); return; }   // 离线时登录无意义 → 不弹
    const went = await onSignIn({ later: true });
    if (went === false) { _cloudSignInPromptDeclined = true; setStatus(t("save.local")); }
    renderSaveButton(); return;
  }
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
const sheet = document.querySelector<HTMLElement>("main.surface")!;   // 一张纸模型（v2.1.26）：唯一的滚动容器；正文框自己不滚
// 系统软键盘全量禁用（user 2026-09-29「加软键盘，以后不用触屏手机的自带键盘了。全量禁用」）：内置输入法开着时，**所有**文本框 inputmode=none——
//   系统键盘不弹、系统输入法不碰字节；触屏设备改由 app 内软键盘打字（src/input/）。唯一还会弹系统键盘的路 = 设置里的逃生开关「改用系统输入法」。
// 软键盘露不露（per-device，device-kv `softKeyboard`）：auto（默认）= 触屏为主的设备上文本框一聚焦就露，见到实体键盘敲键就让位；
//   on = 总是露（Quest 纯手柄 / 触屏笔记本想用时）；off = 不用。旧值 none → off；旧值 system / ascii（弹系统键盘）已无此路 → auto。
type SoftKeyboardPref = "auto" | "on" | "off";
const TOUCH_PRIMARY = matchMedia("(hover: none) and (pointer: coarse)").matches && !IS_QUEST_BROWSER;   // Quest 默认当「有实体键盘」（一直如此）：软键盘靠钮召出来
const softKeyboardPref = (): SoftKeyboardPref => { const v = deviceKvGet("softKeyboard"); return v === "on" ? "on" : v === "off" || v === "none" ? "off" : "auto"; };
// 软键盘收起的原因（运行时）：user = 按了「收起」→ 再点文本框就回来；hardware = 见过实体键盘敲键 → 点文本框不回来（iPad 接着键盘时点一下挪光标不该弹键盘），
//   要用得按纸面左下角的键盘钮。hardware 跨启动记着（device-kv `softKeyboardHidden`）；summoned = 非触屏设备（Quest / 桌面）用钮召出来的。
let kbHiddenBy: "user" | "hardware" | null = deviceKvGet("softKeyboardHidden") === "hw" ? "hardware" : null;
let kbSummoned = false;
function keyboardWanted(): boolean {
  const pref = softKeyboardPref();
  if (pref === "off") return false;
  if (pref === "on") return kbHiddenBy !== "user";
  return TOUCH_PRIMARY ? kbHiddenBy == null : kbSummoned;
}
function applyInputModeTo(el: TextField): void { if (ime.enabled) el.setAttribute("inputmode", "none"); else el.removeAttribute("inputmode"); }
function applyInputModeAll(): void { for (const n of document.querySelectorAll("textarea, input")) { const f = asTextField(n); if (f) applyInputModeTo(f); } }
document.addEventListener("pointerdown", (e) => { const f = asTextField(e.target); if (f) applyInputModeTo(f); }, true);   // 后来才生出来的框：赶在聚焦之前
document.addEventListener("focusin", (e) => { const f = asTextField(e.target); if (f) applyInputModeTo(f); }, true);
if (window.visualViewport) {   // iOS 软键盘：键盘高度 → --kb-offset，纸面整体缩到键盘上方（styles .page height）；iOS 若把视口顶上去，拉回 0 让固定顶栏别被推出屏
  const vv = window.visualViewport;
  const upd = (follow: boolean) => {
    if (vv.offsetTop > 0 && document.activeElement && document.activeElement !== document.body) window.scrollTo(0, 0);
    const next = `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`;
    if (document.documentElement.style.getPropertyValue("--kb-offset") === next) return;
    document.documentElement.style.setProperty("--kb-offset", next);
    if (follow) followCaret();   // 键盘那一块变了：光标所在行别留在它底下
  };
  vv.addEventListener("resize", () => upd(true)); vv.addEventListener("scroll", () => upd(true)); upd(false);
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
// 快进等待（user 2026-09-29「wxhw 要不要快进的时候就 waiting，这样稳一点。写书本来就没有画画那么短平快」）：云端新版开始换掉本地的那一刻升整屏等待，
//   新版载入完（或没换成）才收。每分钟例行的「查一下云端」不升——只有真要换的时候才等。
let replacingDone: (() => void) | null = null;
function setReplacing(on: boolean): void {
  if (on) { if (!replacingDone) void withBusy(t("st.replacingFromCloud"), () => new Promise<void>((res) => { replacingDone = res; })); }
  else { const done = replacingDone; replacingDone = null; done?.(); }
}
const ensureFileUnlocked = (name: string) => cryptoEnsureFileUnlocked(name,
  { title: t("fp.title"), hint: t("fp.hint", { name: parseDocName(name).title }), wrong: t("pw.wrong"), ok: t("pw.unlock") },
  (pw) => verifyDocPassword(name, pw));
const editor = createEditor({
  editor: editorEl, sheet, setStatus, setState,
  isSignedIn: () => auth.isSignedIn(),
  onDocChanged: () => { renderTopbar(); renderLockCard(); renderSaveButton(); renderWordCount(); renderCoverButton(); renderHiddenBadge(); renderPageKin(); drawer.refresh(); rememberLastActive(); },   // renderPageKin：离开书回 txt 稿时收掉「..」与子节目录
  ensureUnlocked, ensureFileUnlocked,
  onBeforeLoad: () => { voiceAbortHook?.(); if (ime.isComposing()) { ime.resetComposition(); renderImeState(); } },   // 没提交的拼音别漏进下一篇（2026-09-04 复现：上一篇残留「def」进了新稿）
  onReplacing: (on) => setReplacing(on),
});
let voiceAbortHook: (() => void) | null = null;
// ── 参考窗（ADR-0016）：宿主适配层；书模式的钩子在 createProjectMode 里接（保存前 collect / 开书后 apply / 页改动 → 链接卡重取）。──
const refHost = createReferenceHost({
  el: $<WpReferenceWindow>("referenceWindow"), fileInput: $<HTMLInputElement>("referenceFileInput"), setStatus,
  topFloor: () => Math.round(document.querySelector<HTMLElement>("header.top-bar")?.getBoundingClientRect().bottom ?? 0),
  focusEditor: () => editorEl.focus(),
});
// ── 2.0 工程模式（ADR-0008）：同一个 textarea 两种稿；txt 编辑器在工程期 park。门面 = 谁活着问谁。──
const project = createProjectMode({
  references: refHost.hooks,
  editorEl, sheet, titleEl: $<HTMLTextAreaElement>("nodeTitle"), setStatus, setState,
  onTitleResize: () => fitTitle(),
  imageBox: $("pageImage"), imageEl: $<HTMLImageElement>("pageImageImg"), imageMeta: $("pageImageMeta"),
  imageMetaText: (o) => t("img.meta", { name: o.name, w: o.w, h: o.h, size: humanSize(o.bytes) }),
  isSignedIn: () => auth.isSignedIn(),
  onChanged: () => { renderTopbar(); renderLockCard(); renderSaveButton(); renderWordCount(); renderCoverButton(); renderHiddenBadge(); renderMicVisibility(); renderPageNav(); renderPageKin(); edgeSidebar.render(); drawer.refresh(); rememberLastActive(); },   // renderLockCard：书开/新建时重画锁卡，否则上一篇锁定加密稿留下的「xxx 是加密稿」卡一直盖着（user 2026-09-10）
  onBeforeLoad: () => { voiceAbortHook?.(); if (ime.isComposing()) { ime.resetComposition(); renderImeState(); } },
  onReplacing: (on) => setReplacing(on),
  askName: (title, def, hint) => openInputSheet(title, { message: hint, defaultValue: def, placeholder: t("edge.namePh"), okLabel: t("common.ok") }),
  isUnlocked, ensureUnlocked, onLockChange: (cb) => { onLockChange(cb); },
});
refHost.bindMode(project);
const edgeSidebar = createEdgeSidebar({
  el: $("edgeSidebar"), mode: project, setStatus, focusEditor: () => editorEl.focus(),
  onReference: () => refHost.toggle(), onSendToReference: (name) => refHost.sendPage(name),
  orphanCount: () => orphanPages().length, onOrphans: () => { void orphansFlow(); },
  onLibrary: () => { void galleryHost.open(); },
  onExport: () => { void exportSheetFlow(); },
  onSettings: () => showSidebarSettings(),
  onSettingsBack: () => hideSidebarSettings(),
  onAddSibling: () => addPageFlow("sibling"), onAddChild: () => addPageFlow("child"), onMove: (name) => movePageFlow(name),
  onExportBranch: (name) => exportBranchFlow(name),
  onLift: () => liftDraftToBook(), canLift: () => !project.active() && editor.canEdit() && editorEl.value.trim().length > 0,
  onDownload: () => { const s = project.session(); const h = project.home(); if (!s || !h || h.kind !== "local") return; void packProject(s.project).then((b) => { triggerDownload(b, h.home.fileName); setStatus(t("project.downloaded")); }); },
});
/** 加一页（ADR-0014：「+」拆成「+ 兄弟」「+ 子节」；顶栏「+」的菜单与侧栏两条「+」行同一个流程）：问名字，**不提示不预填**（user 2026-09-10「不用自动第 xx 章命名。不同的人会用节，幕，所以不要替用户做决定」）
 *  → 当场建空文件并入树、跳过去；打已有名 = 归档 / 链接（ADR-0009 §6）。散页上只有「子节」= 链出去的新散页。 */
async function addPageFlow(where: "sibling" | "child"): Promise<boolean> {
  if (!project.canEdit()) return false;
  const cur = project.current(); if (!cur) return false;
  const inTree = project.isInTree(cur);
  if (where === "sibling" && !inTree) return false;
  const hint = where === "sibling" ? t("edge.addSiblingHint") : inTree ? t("edge.addChildHint") : t("edge.addLooseHint");   // 散页：一句不带解释（user 2026-09-10「这种说明也不要」）
  const v = await openInputSheet(t(where === "sibling" ? "edge.addSiblingTitle" : "edge.addChildTitle"), { message: hint, placeholder: t("edge.namePh"), okLabel: t("common.ok"), secondary: { label: t("edge.fromImage") } });   // 「从图片…」= 同一个 sheet 的副按钮（user 2026-09-10 同意）
  if (v === INPUT_SECONDARY) { void pickImagesFlow(false, where); return false; }   // 位置已选（兄弟 / 子节）→ 再选图片
  if (v == null || !v.trim()) return false;
  const ok = where === "sibling" ? project.newSibling(v) : project.newChild(v);
  if (ok) { edgeSidebar.render(); editorEl.focus(); }
  return ok;
}
/** 挪到…（user 2026-09-10「点之后弹一个对话框，搜索，下拉，选中，就 reparent 了」）：通用 pick sheet（sheets.ts openPickSheet）搜主干里的页 → 放到它之下 / 之后；
 *  固定首行「书的末尾（顶层）」= v2.1.6 的「归入主干」并进来（空树唯一入口仍在）。子树跟着走，文案写明子节数。散页首行 / 顶栏「+」菜单 / 树行 ⋯ 菜单三处同一条路。 */
const MOVE_END = "\u0000end";   // pick sheet 固定首行「书的末尾」的哨兵（含 NUL，不会和页名撞）
async function setPageTimeFlow(name: string): Promise<void> {
  if (!project.canEdit()) return;
  const cur = project.pageTime(name);
  const raw = await openInputSheet(t("edge.setTimeTitle", { name: nodeDisplayName(name) }), { message: t("edge.setTimeHint"), defaultValue: cur ? fmtLooseDate(cur) : "", placeholder: "2026-09-26 14:30", okLabel: t("common.ok") });
  if (raw == null || !raw.trim()) return;
  const ms = parseLooseDate(raw);
  if (ms == null) { setStatus(t("edge.setTimeBad"), { error: true }); return; }
  if (project.setPageTime(name, ms)) { edgeSidebar.render(); setStatus(t("edge.setTimeDone", { name: nodeDisplayName(name), time: fmtLooseDate(ms) })); }
}
/** 孤儿页 = 废弃的 `_废-` 页 + 没有入链、也不在主干的散页（user 2026-09-30「不是一键全删除，而是一个系统的列举所有孤儿的入口」）。 */
function orphanPages(): { name: string; discarded: boolean; links: number }[] {
  if (!project.active()) return [];
  return project.nodeNames().map((name) => ({ name, discarded: project.isDiscarded(name), links: project.backlinksOfPage(name).length }))
    .filter((o) => o.discarded || (!project.isInTree(o.name) && o.links === 0))
    .sort((a, b) => Number(b.discarded) - Number(a.discarded) || a.name.localeCompare(b.name, "zh"));
}
/** 孤儿页入口：pick sheet 列全部孤儿（可搜），选一页 → 打开 / 挪到… / 废弃 / 彻底删除（只对 `_废-`，删前确认）。做完一件回到列表，直到取消。 */
async function orphansFlow(): Promise<void> {
  for (;;) {
    const rows = orphanPages(); if (!rows.length) { setStatus(t("edge.noResults")); return; }
    const r = await openPickSheet<string, "open" | "move" | "discard" | "purge">(t("edge.orphansTitle"), {
      message: t("edge.orphansHint"), placeholder: t("edge.orphansPh"), emptyText: t("edge.noResults"),
      search: (q) => rows.filter((o) => !q.trim() || o.name.toLowerCase().includes(q.trim().toLowerCase()))
        .map((o) => ({ value: o.name, label: `${nodeDisplayName(o.name)} · ${t(o.discarded ? "edge.orphanDiscarded" : "edge.orphanLoose")}${o.links ? ` · ${o.links}` : ""}`, icon: project.isInTree(o.name) ? undefined : "file" })),
      actions: (row) => project.isDiscarded(row.value)
        ? [{ id: "open", label: t("edge.orphanOpen"), primary: true }, { id: "purge", label: t("edge.purge") }]
        : [{ id: "open", label: t("edge.orphanOpen"), primary: true }, { id: "move", label: t("edge.moveTo") }, { id: "discard", label: t("edge.discard") }],
    });
    if (!r) return;
    const name = r.value, shown = nodeDisplayName(name);
    if (r.action === "open") { project.jump(name); edgeSidebar.render(); editorEl.focus(); return; }
    if (r.action === "move") { await movePageFlow(name); continue; }
    if (r.action === "discard") {
      const n = project.subtreeCount(name); const prefix = t("edge.discardPrefix");
      if (await openConfirmSheet(n ? t("edge.discardTitleTree", { name: shown, n }) : t("edge.discardTitle", { name: shown }), n ? t("edge.discardMsgTree", { prefix, n }) : t("edge.discardMsg", { prefix }), { danger: true, okLabel: t("edge.discard") }) && project.discardPage(name)) {
        const first = project.lastDiscarded()[0];
        setStatus(t("edge.discarded", { from: nodeDisplayName(first?.from ?? name), to: nodeDisplayName(first?.to ?? name) }));
      }
      continue;
    }
    if (r.action === "purge") {
      const n = project.backlinksOfPage(name).length;
      if (await openConfirmSheet(t("edge.purgeTitle", { name: shown }), n ? t("edge.purgeMsg", { n }) : t("edge.purgeMsgNoLinks"), { danger: true, okLabel: t("edge.purge") })) { project.purgePage(name); edgeSidebar.render(); }
      continue;
    }
  }
}
async function movePageFlow(name: string): Promise<boolean> {
  if (!project.canEdit()) { if (project.active() && project.readOnly()) setStatus(t("edge.lockedHint"), { error: true }); return false; }
  const n = project.subtreeCount(name);
  const r = await openPickSheet<string, "under" | "after" | "end">(t("edge.moveTitle", { name: nodeDisplayName(name) }), {
    ...(n ? { message: t("edge.moveHintTree", { n }) } : {}), placeholder: t("edge.movePh"), emptyText: t("edge.noResults"),
    search: (q) => [{ value: MOVE_END, label: t("edge.moveRootEnd"), icon: "book" }, ...project.moveTargets(name, q).map((x) => ({ value: x, label: nodeDisplayName(x) }))],
    actions: (row) => row.value === MOVE_END ? [{ id: "end", label: t("edge.movePutHere"), primary: true }] : [{ id: "under", label: t("edge.moveUnder"), primary: true }, { id: "after", label: t("edge.moveAfter") }],
  });
  if (!r) return false;
  if (!project.movePage(name, r.action === "end" ? { kind: "end" } : { kind: r.action, anchor: r.value })) return false;
  const shown = nodeDisplayName(name);
  setStatus(r.action === "end" ? t("edge.movedEnd", { name: shown }) : t(r.action === "under" ? "edge.movedUnder" : "edge.movedAfter", { name: shown, to: nodeDisplayName(r.value) }));
  edgeSidebar.render(); editorEl.focus();
  return true;
}
/** 导出这一支（ADR-0014 §6）：子树 DFS 拼成一篇 txt → 存进书库（撞名 hex4）或下载一份；无地的书只有下载。名字归 user（默认 = 页名）。 */
async function exportBranchFlow(name: string): Promise<void> {
  if (!project.active()) return;
  const isLocal = project.home()?.kind === "local";
  const def = nodeDisplayName(name).replace(/\.[A-Za-z0-9]{1,8}$/, "");
  const v = await openInputSheet(t("edge.exportTitle", { name: nodeDisplayName(name) }), { message: t("edge.exportHint"), defaultValue: def, placeholder: t("edge.namePh"), okLabel: isLocal ? t("edge.exportDownload") : t("edge.exportSave"), secondary: isLocal ? undefined : { label: t("edge.exportDownload") } });
  if (v == null) return;
  const download = isLocal || v === INPUT_SECONDARY;
  const title = (download && v === INPUT_SECONDARY ? def : v).trim() || def;
  try {
    const text = project.exportBranchText(name);
    if (download) { triggerDownload(new Blob([text], { type: "text/plain;charset=utf-8" }), `${title}.txt`); setStatus(t("edge.exportDone", { name: title })); return; }
    const created = await exportBranchToLibrary(title, text, parseDocName(project.name() ?? "").dir);
    setStatus(t("edge.exportDone", { name: parseDocName(created).stem }));
  } catch (e) { reportError(e); setStatus(t("edge.exportFailed", { e: e instanceof Error ? e.message : String(e) }), { error: true }); }
}
/** 章节名两侧的上一页 / 下一页 chevron（全树前序 DFS；树首 / 树尾 / 散页 → 灰；锁着 / 无书 → 整颗藏）。页脚那排 2026-09-10 撤（user「不应该浪费页脚的空间…放在标题行，用 ⟨ ⟩ 的 svg」）。 */
//   v2.1.26：页脚也有一对（user 2026-09-30「同意也加导航，和页头一样」）——纸整张滚，写到末尾时下一页就在手边。
const pagePrev = $<HTMLButtonElement>("pagePrev"), pageNext = $<HTMLButtonElement>("pageNext");
const pagePrevFoot = $<HTMLButtonElement>("pagePrevFoot"), pageNextFoot = $<HTMLButtonElement>("pageNextFoot");
function renderPageNav(): void {
  const nb = project.active() && !project.locked() ? project.neighborhood() : null;
  for (const [prev, next] of [[pagePrev, pageNext], [pagePrevFoot, pageNextFoot]] as const) {
    prev.hidden = next.hidden = !nb;
    prev.disabled = !nb?.prev; next.disabled = !nb?.next;
    prev.title = nb?.prev ? nodeDisplayName(nb.prev) : t("edge.prev"); next.title = nb?.next ? nodeDisplayName(nb.next) : t("edge.next");
  }
}
for (const b of [pagePrev, pagePrevFoot]) b.addEventListener("click", () => { if (project.prevPage()) edgeSidebar.render(); });
for (const b of [pageNext, pageNextFoot]) b.addEventListener("click", () => { if (project.nextPage()) edgeSidebar.render(); });
// ── 纸面亲缘（v2.1.9，user 2026-09-26「父亲页面拉到最下面可以显示孩子页面的目录列表，然后标题栏也有回到上一级的链接，这样导航就舒服」）：
//   `.. 父页名` 住章节名上方（顶层页藏：顶栏已是书名；与侧栏 `..` 行同一语汇）；子节目录住正文之下，有子节就露。
//   一张纸模型（v2.1.26，user 2026-09-30「对的，整张纸滚」）：正文框高度 = 内容高度、自己不滚，滚的是 main.surface；目录紧跟正文最后一行；
//   以前「正文滚到底才露目录」的迟滞（v2.1.11）随内部滚动一起退役。
const parentLink = $<HTMLButtonElement>("parentLink"), parentLinkName = $("parentLinkName");
const childToc = $("childToc"), childTocList = $("childTocList"), pageEl = document.querySelector<HTMLElement>(".page")!, pageBody = $("pageBody");
let tocChildren: string[] = [];
// 稿纸几何（行高 / 写字线 / 矮屏档）：src/ui/paper.ts。（「宽稿纸」档与 device-kv paperWidth 2026-09-30 撤了，user「加宽可以撤了」；旧值不读不删。）
const dockHeightNow = (): number => parseFloat(document.documentElement.style.getPropertyValue("--dock-h")) || 0;
const paper = createPaper({ page: pageEl, editor: editorEl, dockHeight: dockHeightNow, onChanged: () => syncBodyHeight() });
/** 正文框高度 = 内容行数 × 行高（量的是看不见的孪生框，paper.contentHeight），子节目录 = (1 + 子节数) × 行高紧跟其后——一切都是整行，
 *  所以目录的每一行都坐在稿纸的线上（v2.1.17，user 2026-09-29「章后面的超链接我也想做成就像文字一样就在线上的」）。图片页正文框藏着、目录照露。 */
/** 章节名框随内容长高（v2.1.30，user 2026-09-30「也自动加行？」「自动加行同意」）：单行起步的 textarea，量 scrollHeight 落成高度，再重算纸面（alignTop 把正文上沿补到整像素，别绕开）。 */
const nodeTitleEl = $<HTMLTextAreaElement>("nodeTitle");
let titleFitKey = "";
function fitTitle(): void {
  // 值和宽度都没变就别量（v2.1.32）：每次本地落盘都会 syncTitle → 这里；量高度要先把框压到 0 再复原，Chrome 的 scroll anchoring 把这一缩一长
  //   算成「正文上方的东西变了」——缩时 scrollTop 被夹在 0，长回来却加上去，打字时页面每 200 ms 往下走一截（user 2026-09-30「打字的时候为什么页面会往下滚」）。
  const key = `${nodeTitleEl.value}\u0000${nodeTitleEl.clientWidth}`;
  if (key === titleFitKey) return;
  titleFitKey = key;
  const keep = sheet.scrollTop;   // 真要量的时候也把滚动位置锁住，量完放回
  nodeTitleEl.style.height = "0px";
  const h = nodeTitleEl.scrollHeight;
  nodeTitleEl.style.height = h > 0 ? `${h}px` : "";
  if (sheet.scrollTop !== keep) sheet.scrollTop = keep;
  syncBodyHeight();
}
window.addEventListener("resize", () => { titleFitKey = ""; fitTitle(); });
function syncBodyHeight(): void {
  paper.alignTop(pageBody);
  const lh = paper.lineHeight();
  const h = `${Math.max(1, Math.round(paper.contentHeight() / lh)) * lh}px`;
  if (editorEl.style.height !== h) editorEl.style.height = h;
  childToc.hidden = !(tocChildren.length > 0 && project.active());
}
/** 光标跟随的兜底：浏览器插字后会把光标滚进最近的可滚祖先（Chromium / WebKit 都会），但键盘那一块露收 / iOS 视口变了它不管——
 *  光标那一行不在纸的可见区（顶栏之下、键盘之上）就把纸滚过去。量光标行用同一个孪生框（光标在末尾时不用再量）。 */
function followCaret(): void {
  if (document.activeElement !== editorEl) return;
  const lh = paper.lineHeight();
  const bottom = editorEl.getBoundingClientRect().top + paper.caretBottom();   // 光标行底边（视口坐标）
  const top = bottom - lh;
  const cs = getComputedStyle(sheet);
  const viewTop = sheet.getBoundingClientRect().top + (parseFloat(cs.paddingTop) || 0);
  const viewBottom = sheet.getBoundingClientRect().bottom - (parseFloat(cs.paddingBottom) || 0);
  // 只补到边距，不再多滚一行（v2.1.33，user 2026-09-30「打字的时候为什么页面会往下滚」：以前两支各多加一个 lh → 每次换行跳两行，
  //   手机上可见区只有十来行，手感就是「页面往下滚」；「WXHW 更新」量到 delta = 2 × lh）。文字全走管线的 setRangeText，浏览器不做 reveal，这里多少就是多少。
  //   滚动量对齐设备像素：光标行底边是小数，直接加上去 scrollTop 就带小数，dpr 3 上字和线的相位对不上（ruled-audit drift 0.50 抓到）。
  //   留一行看头（光标行下面 / 上面还能看见一行）：放在**条件**里而不是滚动量里——这样每换一行只滚一行，末行下面仍有一条线（ruled-audit 末行 gap 靠它）。
  const dpr = window.devicePixelRatio || 1; const snap = (v: number) => Math.round(v * dpr) / dpr;
  if (bottom + lh > viewBottom - 8) sheet.scrollTop = snap(sheet.scrollTop + (bottom + lh - (viewBottom - 8)));
  else if (top - lh < viewTop + 8) sheet.scrollTop = snap(sheet.scrollTop - ((viewTop + 8) - (top - lh)));
}
function renderPageKin(): void {
  const nb = project.active() && !project.locked() ? project.neighborhood() : null;
  const parent = nb?.parent ?? null;
  parentLink.hidden = !parent;
  parentLinkName.textContent = parent ? nodeDisplayName(parent) : "";
  parentLink.title = parent ? t("kin.parentTitle", { name: nodeDisplayName(parent) }) : ""; parentLink.setAttribute("aria-label", parentLink.title);
  tocChildren = nb?.children ?? [];
  childTocList.innerHTML = "";
  const s = project.session();
  for (const n of tocChildren) {
    const li = document.createElement("li");
    const b = document.createElement("button"); b.type = "button"; b.className = "child-toc-row"; b.dataset.name = n;
    const meta = s?.project.nodes.get(n);
    b.title = meta ? t("edge.times", { created: fmtTime(meta.created), modified: fmtTime(meta.modified) }) : nodeDisplayName(n);
    const kindIcon = nodeKind(n) === "image" ? `<svg class="ico" aria-hidden="true"><use href="#image"/></svg>` : "";
    b.innerHTML = (kindIcon || `<svg class="ico" aria-hidden="true"><use href="#chevron-right"/></svg>`) + `<span class="child-toc-name"></span>` + (meta && meta.modified ? `<span class="child-toc-sub">${fmtTime(meta.modified)}</span>` : "");
    b.querySelector(".child-toc-name")!.textContent = nodeDisplayName(n);
    b.addEventListener("click", () => { project.jump(n); edgeSidebar.render(); editorEl.focus(); });
    li.appendChild(b); childTocList.appendChild(li);
  }
  syncBodyHeight();
}
parentLink.addEventListener("click", () => { const p = project.neighborhood()?.parent; if (p) { project.jump(p); edgeSidebar.render(); editorEl.focus(); } });
editorEl.addEventListener("input", () => { syncBodyHeight(); followCaret(); });   // 末尾续写：正文长一行目录跟着下一行；光标行不在可见区就把纸滚过去
window.addEventListener("resize", () => { paper.refresh(); syncBodyHeight(); followCaret(); });   // 键盘 / 转屏 / 缩放改了容器高度与设备像素比
/** 「点一下」而不是「按下」（v2.1.34，user 2026-09-30「滚动浏览的时候不应该触发软键盘」）：手指落下就给焦点的话，划纸面滚动也会把软键盘叫出来。
 *  按下记位置，抬起时没怎么动（< 10px、< 600 ms）才算点。鼠标照旧按下即算（没有滚动手势）。 */
function onTap(el: EventTarget, want: (e: PointerEvent) => boolean, run: (e: PointerEvent) => void, opts: { capture?: boolean } = {}): void {
  let down: { id: number; x: number; y: number; t: number } | null = null;
  el.addEventListener("pointerdown", (ev) => { const e = ev as PointerEvent; if (!want(e)) { down = null; return; } if (e.pointerType === "mouse") { run(e); down = null; return; } down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }; }, opts);
  el.addEventListener("pointerup", (ev) => { const e = ev as PointerEvent; if (!down || down.id !== e.pointerId) return; const d = down; down = null; if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10 && performance.now() - d.t < 600 && want(e)) run(e); }, opts);
  el.addEventListener("pointercancel", () => { down = null; }, opts);
}
// 正文下方的空白纸面：点了照样能写（光标到末尾），别让人以为纸「断」了；划动不算
pageBody.addEventListener("pointerdown", (e) => { if (e.target === pageBody) e.preventDefault(); });   // 按下别抢焦点、别起选区
onTap(pageBody, (e) => e.target === pageBody, () => { editorEl.focus(); const n = editorEl.value.length; try { editorEl.setSelectionRange(n, n); } catch { /* ignore */ } });
// ── 导出 = 当前页全页进剪贴板（v2.1.9，user 2026-09-26「加一个当前页全页复制到剪切板的功能，放在三条杠的弹出菜单的书库和设置中间，加一个导出按钮…方便的导出分享功能其实很重要」）：
//   txt 稿 = 整篇；书的文字页 = 这一页（textarea 里的活字，所见即所得）；图片页 = 图片本身（PNG 直给，其余经 codec 转 PNG——系统剪贴板只认 PNG；ClipboardItem 里塞 Promise 保住 Safari 的用户手势）。
//   锁着 / 空页 / 浏览器不支持 → toast 说清，不谎报已复制。
async function copyCurrentPage(): Promise<void> {
  const locked = project.active() ? project.locked() : editor.state.locked;
  if (locked) { setStatus(t("copy.locked"), { error: true }); return; }
  if (project.active() && project.currentKind() === "image") { await copyCurrentImage(); return; }
  const text = editorEl.value;
  if (!text.trim()) { setStatus(t("copy.empty")); return; }
  try {
    await writeClipboardText(text);
    const st = statsForText(text);
    setStatus(t("copy.done", { cjk: st.cjk, en: st.en }));
  } catch (e) { reportError(e, "log"); setStatus(t("copy.failed", { e: errText(e) }), { error: true }); }
}
async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  // 退路（旧 WebView / 非安全上下文）：借 textarea 全选 + execCommand，选区与滚动原样放回
  const el = editorEl; const s0 = el.selectionStart, e0 = el.selectionEnd, top = sheet.scrollTop;
  el.focus(); el.select();
  const ok = document.execCommand("copy");
  el.setSelectionRange(s0, e0); sheet.scrollTop = top;
  if (!ok) throw new Error("clipboard unavailable");
}
async function copyCurrentImage(): Promise<void> {
  const bytes = project.pageBytes(), cur = project.current();
  if (!bytes || !cur) { setStatus(t("copy.empty")); return; }
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) { setStatus(t("copy.imageUnsupported"), { error: true }); return; }
  const png: Promise<Blob> = nodeExt(cur) === "png"
    ? Promise.resolve(new Blob([bytes as unknown as BlobPart], { type: "image/png" }))
    : (async () => { const img = await decodeToRgba(new Blob([bytes as unknown as BlobPart])); const out = await encodePng(img.data, img.w, img.h, 0); return new Blob([out as unknown as BlobPart], { type: "image/png" }); })();
  try { await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]); setStatus(t("copy.doneImage")); }
  catch (e) { reportError(e, "log"); setStatus(t("copy.failed", { e: errText(e) }), { error: true }); }
}
// ── 导出（v2.3.1，2026-09-30 user「先做图片导出吧，这个今晚就能用」「wysiwyg，就用编辑器的行宽」「所以就是和我直觉一样，长图，pdf，文本」）：
//   侧栏「导出」= 一张 sheet：复制文字（v2.1.9 的那一下）/ 长图：这一页 · 这一支 · 整本（txt 稿 = 整篇）。
//   长图 = 所见即所得：look 从编辑器此刻的 computed style 量来（字体栈 / 字号 / 行高 / 正文框宽 / 纸色 / 墨色 / 写字线），
//   排版 = src/export/long-image.ts（纯函数），落像素 = image/codec.ts（唯一 canvas 点），PNG = vendored UPNG。
//   分享必须在用户手势里调（iOS Safari）：先生成、再弹「好了」sheet，点「分享」那一下才 navigator.share；没有 share 的（Quest / 桌面）= 下载；一张时还能进剪贴板。
type LongImageScope = "page" | "branch" | "book" | "draft";
async function exportSheetFlow(): Promise<void> {
  const inBook = project.active();
  if (inBook ? project.locked() : editor.state.locked) { setStatus(t("export.locked"), { error: true }); return; }
  const choices: Choice<"copy" | LongImageScope>[] = [];
  if (inBook) {
    const cur = project.current();
    choices.push({ label: t(project.currentKind() === "image" ? "export.copyImage" : "export.copyText"), value: "copy", primary: true }, { label: t("export.pageImage"), value: "page" });
    if (cur && project.isInTree(cur)) choices.push({ label: t("export.branchImage"), value: "branch" });
    choices.push({ label: t("export.bookImage"), value: "book" });
  } else choices.push({ label: t("export.copyDraft"), value: "copy", primary: true }, { label: t("export.draftImage"), value: "draft" });
  const msg = inBook ? t("export.msgBook") + "\n" + t("export.msgBookStats", visibleBookStats()) : t("export.msgDraft");   // 已发布字数 = 只数出门的页（user 2026-09-30「统计字数只看 publish 的」）
  const v = await openChoiceSheet(t("export.title"), msg, choices);
  if (v == null) return;
  if (v === "copy") { await copyCurrentPage(); return; }
  await exportLongImageFlow(v);
}
/** 整本出门的字数（hidden 的支不算）：txt 页 CJK / 词 + 页数。 */
function visibleBookStats(): { cjk: number; en: number; pages: number } {
  const s = project.session(); if (!s) return { cjk: 0, en: 0, pages: 0 };
  project.commitEditor();
  let cjk = 0, en = 0, pages = 0;
  for (const n of s.exportOrder(null)) { if (nodeKind(n) !== "txt") continue; const st = statsForText(readNodeText(s.project, n) ?? ""); cjk += st.cjk; en += st.en; pages++; }
  return { cjk, en, pages };
}
/** 编辑器此刻的样子 → 长图的尺子（WYSIWYG：字体栈、字号、行高、正文框宽、纸色、墨色、写字线）。 */
function editorLook(): LongImageLook {
  const cs = getComputedStyle(editorEl), root = getComputedStyle(document.documentElement), pg = getComputedStyle(pageEl);
  const v = (name: string, fallback: string): string => root.getPropertyValue(name).trim() || pg.getPropertyValue(name).trim() || fallback;
  const lh = paper.lineHeight(); const ruleY = parseFloat(pg.getPropertyValue("--rule-y"));
  return {
    family: cs.fontFamily, fontPx: parseFloat(cs.fontSize) || 20, lineHeight: lh, innerWidth: editorEl.clientWidth || 400,
    paper: pg.backgroundColor || "#fff", ink: v("--ink", "#1b1b1b"), inkSoft: cs.color || "#222222", muted: v("--ink-muted", "#888888"),
    rule: document.body.classList.contains("ruled-lines") ? v("--line", "#d8d2c4") : null, ruleY: Number.isFinite(ruleY) ? ruleY : lh * 0.8,
  };
}
async function imageRef(bytes: Uint8Array): Promise<ImageRef> { const blob = new Blob([bytes as unknown as BlobPart]); const { w, h } = await probeSize(blob); return { blob, w, h }; }
/** 收集要画的东西：txt 稿 = 整篇；书 = 这一页 / 这一支（子树 DFS）/ 整本（全树 DFS，散页不含）；图片页原位；封面 = graph.json cover 指的那页的高清字节。 */
async function collectLongImage(scope: LongImageScope): Promise<LongImageSpec | null> {
  const sliceLabel = (i: number, n: number): string => t("export.sliceLabel", { i, n });
  if (scope === "draft") {
    const text = editorEl.value; if (!text.trim()) return null;
    const st = editor.state; const stem = st.name ? parseDocName(st.name).stem : (st.pendingTitle || st.pendingDate || "");
    const { date, title } = splitDatedName(stem);
    return { title: title || stem, date, cover: null, sections: [{ kind: "text", heading: null, text }], look: editorLook(), sliceLabel };
  }
  const s = project.session(); const cur = project.current(); if (!s || !cur) return null;
  project.commitEditor();
  // hidden 的支不出门（2026-09-30）：这一页被藏 → 空；这一支 / 整本 = 剪掉 hidden 的支
  const names = scope === "page" ? (s.isHiddenInTree(cur) ? [] : [cur]) : s.exportOrder(scope === "branch" ? cur : null);
  const sections: LongImageSection[] = [];
  for (const n of names) {
    const k = nodeKind(n);
    if (k === "txt") sections.push({ kind: "text", heading: nodeDisplayName(n), text: readNodeText(s.project, n) ?? "" });
    else if (k === "image") { const b = s.bytesOf(n); if (b) sections.push({ kind: "image", heading: null, image: await imageRef(b) }); }
  }
  if (!sections.length) return null;
  const stem = parseDocName(project.name() ?? "").stem; const { date, title } = splitDatedName(stem);
  const cp = project.coverPage(); const cb = cp && nodeKind(cp) === "image" ? s.bytesOf(cp) : null;
  return { title: title || stem, date, cover: cb ? await imageRef(cb) : null, sections, look: editorLook(), sliceLabel };
}
/** 文件尺寸（user 2026-09-30「用高压」「默认jpg行吗…是否用jpg你可以pushback」）：按内容定不按阈值猜——纯文字的那张 = 调色板 PNG（256 色；纸底大面积同色，比 JPEG 更小也更锐，微信再压一次也不糊）；有照片（封面 / 插图页）的那张 = JPEG q82。 */
const LONG_IMAGE_JPEG_QUALITY = 82;
async function encodeSlices(spec: LongImageSpec, plan: LongImagePlan): Promise<File[]> {
  const base = (spec.title || "export").replace(/[\\/:*?"<>|]/g, "-");
  const files: File[] = [];
  for (let i = 0; i < plan.slices.length; i++) {
    const sl = plan.slices[i]!;
    const img = await paintScene(sl.w, sl.h, spec.look.paper, sl.ops);
    const bytes = sl.hasImage ? await encodeJpeg(img.data, img.w, img.h, LONG_IMAGE_JPEG_QUALITY) : await encodePng(img.data, img.w, img.h, 256);
    const ext = sl.hasImage ? "jpg" : "png";
    files.push(new File([bytes as unknown as BlobPart], plan.slices.length > 1 ? `${base}-${i + 1}.${ext}` : `${base}.${ext}`, { type: sl.hasImage ? "image/jpeg" : "image/png" }));
  }
  return files;
}
/** 无交互路（探针 / 脚本）：超过单张上限就按上限切。 */
async function renderLongImageFiles(scope: LongImageScope, opts: { maxSliceHeight?: number } = {}): Promise<{ files: File[]; plan: LongImagePlan } | null> {
  const spec = await collectLongImage(scope); if (!spec) return null;
  const m = createTextMeasurer();
  let plan = planLongImage(spec, m, opts);
  if (opts.maxSliceHeight == null && plan.totalHeight > SINGLE_IMAGE_MAX_HEIGHT) plan = planLongImage(spec, m, { maxSliceHeight: SINGLE_IMAGE_MAX_HEIGHT });
  return { files: await encodeSlices(spec, plan), plan };
}
async function exportLongImageFlow(scope: LongImageScope): Promise<void> {
  let spec: LongImageSpec | null;
  try { spec = await collectLongImage(scope); }
  catch (e) { reportError(e, "warning"); setStatus(t("export.failed", { e: errText(e) }), { error: true }); return; }
  if (!spec) { const cur = project.active() ? project.current() : null; setStatus(t(cur && project.isHiddenInTree(cur) && scope !== "book" ? "export.hiddenEmpty" : "export.empty")); return; }
  // 尽量一张（user「三屏太难受了」）：只有超过单张上限才问切法
  const m = createTextMeasurer(); let plan = planLongImage(spec, m);
  if (plan.totalHeight > SINGLE_IMAGE_MAX_HEIGHT) {
    const W = spec.width ?? DEFAULT_WIDTH, screen = screenHeightFor(W), maxScreens = Math.floor(SINGLE_IMAGE_MAX_HEIGHT / screen);
    const nCap = planLongImage(spec, m, { maxSliceHeight: SINGLE_IMAGE_MAX_HEIGHT }).slices.length, nSocial = planLongImage(spec, m, { maxSliceHeight: socialSliceHeightFor(W) }).slices.length;
    const v = await openChoiceSheet(t("export.tooTallTitle"), t("export.tooTallMsg", { screens: Math.round(plan.totalHeight / screen), cjk: plan.cjk, max: SINGLE_IMAGE_MAX_HEIGHT, maxScreens }), [
      { label: t("export.sliceCap", { n: nCap, s: maxScreens }), value: "cap" as const, primary: true }, { label: t("export.sliceSocial", { n: nSocial }), value: "social" as const }]);
    if (v == null) return;
    plan = planLongImage(spec, m, { maxSliceHeight: v === "cap" ? SINGLE_IMAGE_MAX_HEIGHT : socialSliceHeightFor(W) });
  }
  let files: File[];
  try { const s = spec, p = plan; files = await withBusy(t("export.making"), () => encodeSlices(s, p)); }
  catch (e) { reportError(e, "warning"); setStatus(t("export.failed", { e: errText(e) }), { error: true }); return; }
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const canShare = typeof navigator.share === "function" && !!nav.canShare?.({ files });
  const canCopy = files.length === 1 && typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;
  const choices: Choice<"share" | "download" | "copy">[] = [];
  if (canShare) choices.push({ label: t("export.share"), value: "share", primary: true });
  choices.push({ label: t("export.download"), value: "download", primary: !canShare });
  if (canCopy) choices.push({ label: t("export.copyPng"), value: "copy" });
  const v = await openChoiceSheet(t("export.readyTitle", { n: files.length }), t("export.readyMsg", { cjk: plan.cjk, en: plan.en, pages: plan.textPages, images: plan.imagePages, size: humanSize(files.reduce((a, f) => a + f.size, 0)) }), choices);
  if (v == null) return;
  try {
    if (v === "share") { await navigator.share({ files, title: files[0]!.name }); setStatus(t("export.shared")); }
    else if (v === "copy") { await navigator.clipboard.write([new ClipboardItem({ "image/png": files[0]! })]); setStatus(t("export.copied")); }
    else { for (let i = 0; i < files.length; i++) { triggerDownload(files[i]!, files[i]!.name); if (i < files.length - 1) await new Promise((res) => setTimeout(res, 350)); } setStatus(t("export.downloaded", { n: files.length })); }
  } catch (e) { if ((e as { name?: string })?.name === "AbortError") return; reportError(e, "log"); setStatus(t("export.failed", { e: errText(e) }), { error: true }); }
}
// ── 图片页（2.1，ADR-0012/0013）：单一漏斗 importImageFiles（文件选择 / 多选 / 拖放 / 粘贴 / 替换都走 slimImage）──
const imageFileInput = $<HTMLInputElement>("imageFileInput"), imageReplaceInput = $<HTMLInputElement>("imageReplaceInput");
let pendingHd = false;   // 「保留高清」勾（sheet 里选，跟着这一次选择）
let pendingAs: "sibling" | "child" = "child";   // 「从图片…」的落点（名字框里先选位置再选来源；user 2026-09-10「加图片没说清楚是兄弟还是孩子」）；拖放 / 粘贴没选位置 → 子节（散页上 mode 退成链出）
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
/** 「从图片…」：一个 sheet（说明 + 保留高清勾）→ 系统文件选择器（多选）。 */
async function pickImagesFlow(replace = false, as: "sibling" | "child" = "child"): Promise<void> {
  if (!project.active()) { setStatus(t("img.dropTxtMode"), { error: true }); return; }
  if (!project.canEdit()) { setStatus(t("edge.lockedHint"), { error: true }); return; }
  const r = await openConfirmSheetEx(t(replace ? "img.replace" : "img.pickTitle"), t("img.pickHint"), { okLabel: t("img.pick"), checkbox: { label: t("img.hd"), checked: pendingHd } });
  if (!r.ok) return;
  pendingHd = r.checked; if (!replace) pendingAs = as;
  const input = replace ? imageReplaceInput : imageFileInput; input.value = ""; input.click();
}
imageFileInput.addEventListener("change", () => { const files = [...(imageFileInput.files ?? [])]; imageFileInput.value = ""; if (files.length) void importImageFiles(files, { hd: pendingHd }); });
imageReplaceInput.addEventListener("change", () => { const f = imageReplaceInput.files?.[0]; imageReplaceInput.value = ""; if (f) void replaceImageFlow(f, { hd: pendingHd }); });
async function importImageFiles(files: File[], opts: { hd: boolean; unnamed?: boolean }): Promise<void> {   // unnamed：粘贴的位图浏览器一律叫 image.png，不算有名 → 日期码
  if (!project.active()) { setStatus(t("img.dropTxtMode"), { error: true }); return; }
  if (!project.canEdit()) { setStatus(t("edge.lockedHint"), { error: true }); return; }
  const as = pendingAs; pendingAs = "child";   // 消费这一次的落点；拖放 / 粘贴走默认（子节；散页上 mode 退成链出）
  const date = formatDate(Date.now());
  const results: { name: string; r: SlimResult }[] = []; const bad: string[] = [];
  await withBusy(t("img.making"), async () => {
    for (const f of files) {
      try { const r = await slimImage(f, { hd: opts.hd }); results.push({ r, name: importPageName(opts.unnamed ? null : (f.name || null), r.ext, `${date}-${hex4()}`) }); }
      catch (e) { if (!(e instanceof NotAnImageError)) reportError(e, "warning"); bad.push(f.name || "?"); }
    }
  });
  const keep: typeof results = [];
  for (const it of results) {   // 胖动图二次确认（user「不设线只提示体重二次确认，2MB 就胖」）——sheet 必须在 busy 外
    if (it.r.fatGif && !(await openConfirmSheet(t("img.fatGifTitle"), t("img.fatGifMsg", { name: it.name, size: humanSize(it.r.bytes.length) }), { okLabel: t("img.fatGifOk") }))) continue;
    keep.push(it);
  }
  const anchor = project.current();
  if (keep.length && project.addImagePages(keep.map((k) => ({ name: k.name, bytes: k.r.bytes })), { as })) {
    const from = keep.reduce((a, k) => a + k.r.from, 0), to = keep.reduce((a, k) => a + k.r.to, 0);
    const placed = project.lastPlaced();
    const where = t(placed === "sibling" ? "img.addedSibling" : placed === "child" ? "img.addedChild" : "img.addedLinked", { n: keep.length, name: nodeDisplayName(anchor ?? "") });   // 状态行说进了哪（user「加图片没说清楚是兄弟还是孩子」）
    setStatus(where + (keep.some((k) => k.r.reencoded) ? t("img.compressedSuffix", { from: humanSize(from), to: humanSize(to) }) : ""));   // 只状态行不弹框（抄 WeebPaint 参考图）
    edgeSidebar.render();
  }
  if (bad.length) setStatus(t("img.notImage", { name: bad.join(", ") }), { error: true });
}
/** 设为封面：当前图片页 → Thumbnails/thumbnail.png（ADR-0012：封面就是这个 entry；腰封文本若已有则保留）+ graph.json `cover` 记下来源页（2026-09-30 修订，user「加 cover 字段」：导出长图 / PDF 要取高清图）。 */
async function setCoverFlow(): Promise<void> {
  const bytes = project.pageBytes(); if (!bytes || project.currentKind() !== "image") return;
  if (!project.canEdit()) { setStatus(t("edge.lockedHint"), { error: true }); return; }
  try {
    const old = project.thumbnail(); const blurb = old ? (readPngText(old)[PNG_BLURB_KEYWORD] ?? null) : null;
    const png = await withBusy(t("img.making"), () => makeCoverPng(bytes, blurb));
    if (project.setThumbnail(png, project.current())) { setStatus(t("img.coverSet")); galleryHost.invalidateThumb(project.name() ?? ""); renderCoverButton(); }
  } catch (e) { reportError(e, "warning"); setStatus(t("img.failed", { e: errText(e) }), { error: true }); }
}
/** 「设为封面」钮的状态：这一页已是封面来源（graph.json cover）→ 灰 + 「当前封面」。 */
function renderCoverButton(): void {
  if (!project.active() || project.currentKind() !== "image") return;
  const b = $<HTMLButtonElement>("pageImageCover"); const cur = project.current();
  const isCover = !!cur && project.coverPage() === cur;
  b.disabled = isCover; b.textContent = t(isCover ? "img.isCover" : "img.setCover");
}
/** 替换图片：保名保边（字节类型变了扩展名跟着变）；它若正是封面（重算 thumb 比对字节，零字段）→ 封面跟着换。 */
async function replaceImageFlow(file: File, opts: { hd: boolean }): Promise<void> {
  if (project.currentKind() !== "image") return;
  if (!project.canEdit()) { setStatus(t("edge.lockedHint"), { error: true }); return; }
  try {
    const r = await withBusy(t("img.making"), () => slimImage(file, { hd: opts.hd }));
    if (r.fatGif && !(await openConfirmSheet(t("img.fatGifTitle"), t("img.fatGifMsg", { name: file.name, size: humanSize(r.bytes.length) }), { okLabel: t("img.fatGifOk") }))) return;
    const oldBytes = project.pageBytes(), thumb = project.thumbnail(), cur0 = project.current();
    const blurb: string | null = thumb ? (readPngText(thumb)[PNG_BLURB_KEYWORD] ?? null) : null;
    let wasCover = !!cur0 && project.coverPage() === cur0;   // graph.json cover（2026-09-30）
    if (!wasCover && !project.coverPage() && oldBytes && thumb) wasCover = bytesEqual(await makeCoverPng(oldBytes, null), withPngText(thumb, PNG_BLURB_KEYWORD, null));   // 老书没有 cover 字段：退回字节比对（ADR-0012 §5）
    if (!project.replaceImage(r.bytes, r.ext)) return;
    if (wasCover) { project.setThumbnail(await makeCoverPng(r.bytes, blurb), project.current()); galleryHost.invalidateThumb(project.name() ?? ""); renderCoverButton(); }
    setStatus(wasCover ? t("img.replacedCover") : t("img.replaced"));
  } catch (e) { if (e instanceof NotAnImageError) setStatus(t("img.notImage", { name: file.name }), { error: true }); else { reportError(e, "warning"); setStatus(t("img.failed", { e: errText(e) }), { error: true }); } }
}
$("pageImageCover").addEventListener("click", () => { void setCoverFlow(); });
$("pageImageReplace").addEventListener("click", () => { void pickImagesFlow(true); });
/** 拖放 / 粘贴同一漏斗（user 2026-09-10 Q8 同意）：书模式 txt = 新页、图 = 图片页；txt 模式 txt = 新稿、图 = 提示先变成书；粘贴位图无名 → 日期码。 */
/** 粘贴 / 拖放的图片要加成新页 → 先问一句（user 2026-09-30「复制图片 as new page 需要弹框确认。不然的话不小心按一下太坑了」）；「从图片…」那条路自己有 sheet，不经这里。 */
async function confirmAddImagePages(files: File[]): Promise<boolean> {
  if (!project.active() || !project.canEdit()) return true;   // 不在书里 / 锁着：让 importImageFiles 自己报那句
  return openConfirmSheet(t("img.pasteAddTitle", { n: files.length }), t("img.pasteAddMsg"), { okLabel: t("img.pasteAddOk") });
}
async function importDroppedFiles(files: File[]): Promise<void> {
  const isTxt = (f: File) => /\.txt$/i.test(f.name) || f.type === "text/plain";
  const txts = files.filter(isTxt), imgs = files.filter((f) => !isTxt(f));
  if (project.active()) {
    for (const f of txts) {
      const text = decodeTextBytes(new Uint8Array(await f.arrayBuffer())).text;
      const name = normalizeNodeName(f.name.replace(/\.txt$/i, "")) ?? `${formatDate(Date.now())}-${hex4()}.txt`;
      if (project.newNode(name, text)) setStatus(t("img.txtAdded", { name: parseDocName(name).stem }));
    }
    if (imgs.length && await confirmAddImagePages(imgs)) await importImageFiles(imgs, { hd: false });
    return;
  }
  if (imgs.length) setStatus(t("img.dropTxtMode"), { error: true });
  const f = txts[0]; if (!f) return;
  const text = decodeTextBytes(new Uint8Array(await f.arrayBuffer())).text;
  await editor.newDoc({ dir: editor.currentDir() });
  const stem = f.name.replace(/\.txt$/i, "").trim();
  editor.state.pendingTitle = stem || null;
  editorEl.value = text; editorEl.dispatchEvent(new Event("input", { bubbles: true }));
  setStatus(t("img.dropDraft", { name: stem || f.name }));
}
{
  const paperEl = document.querySelector<HTMLElement>(".page")!;
  paperEl.addEventListener("dragover", (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  paperEl.addEventListener("drop", (e) => { const files = [...(e.dataTransfer?.files ?? [])]; if (!files.length) return; e.preventDefault(); void importDroppedFiles(files); });
  editorEl.addEventListener("paste", (e) => { const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/")); if (!files.length) return; e.preventDefault(); void confirmAddImagePages(files).then((ok) => { if (ok) return importImageFiles(files, { hd: false, unnamed: true }); }); });
}
/** 把当前 txt 草稿变成书（user 2026-09-10「加一个把 draft lift 成书的机制（保留 draft?）」）：正文 → 新书第一页（页名 = 稿名），书名默认 = 稿名；
 *  原稿**保留**（非破坏；不要了自己送回收站）；原稿是加密的 → 新书立即加密（明文只在本地 IDB 停留一步，同「新建即加密」）。 */
async function liftDraftToBook(): Promise<boolean> {
  if (project.active() || !editor.canEdit()) return false;
  await editor.flushLocal();
  const text = editorEl.value;
  if (!text.trim()) { setStatus(t("lift.needText")); return false; }
  const stem = editor.displayName() ?? t("project.defaultName");
  const pageName = normalizeNodeName(stem) ?? `${t("project.defaultName")}.txt`;
  const raw = await openInputSheet(t("lift.title"), { message: t("lift.hint"), defaultValue: stem, placeholder: t("project.defaultName"), okLabel: t("common.ok") });
  if (raw == null) return false;
  const wasEncrypted = editor.state.encrypted;
  try {
    const p = emptyProject(); seedBook(p, pageName, text);   // 第一页入树（user 2026-09-10 真机「加兄弟怎么没了」：以前这里没 tree → 升上来的书第一页是散页）
    const name = await createProjectDoc(raw.trim() || stem, await packProject(p), formatDate(Date.now()), editor.currentDir());
    const ok = await openAny(name);
    if (!ok) return false;
    if (wasEncrypted) await project.toggleEncryption(() => Promise.resolve(false), withBusy);   // 原稿加密 → 新书也封（名字不动：2026-09-26 user「加密不改名同意」）
    edgeSidebar.render();
    setStatus(t(wasEncrypted ? "lift.doneEncrypted" : "lift.done", { name: project.displayName() ?? name }));
    return true;
  } catch (e) { reportError(e); setStatus(t("lift.failed", { e: e instanceof Error ? e.message : String(e) }), { error: true }); return false; }
}
const addPageButton = $<HTMLButtonElement>("addPageButton");
/** 顶栏「+」（书模式，☰ 左边）：菜单 = 加兄弟页（树里才有）/ 加子节（ADR-0014 把「+」拆成兄弟 / 子节）；「从图片…」住名字框里（先选位置再选来源）。 */
addPageButton.addEventListener("click", (e) => {
  e.stopPropagation();
  const cur = project.current(); const inTree = !!cur && project.isInTree(cur);
  togglePopupMenu({ anchor: addPageButton, align: "right", items: () => [
    { id: "sibling", label: t("edge.addSibling"), icon: "new", hidden: !inTree },
    { id: "child", label: t("edge.addChild"), icon: "new" },
    { id: "move", label: t("edge.moveTo"), icon: "move-to-file", separatorBefore: true },   // 挪到…（pick sheet；书的末尾 = 空树唯一入口，v2.1.6 归入主干并入）
    { id: "toRef", label: t("ref.sendToRef"), icon: "picture-in-picture", separatorBefore: true, disabled: !project.canEdit() },   // 这一页 → 参考窗（链接卡；ADR-0016）
    { id: "time", label: t("edge.setTime"), separatorBefore: true, disabled: !project.canEdit() },   // 改这一页的时间戳（整理旧书；user 2026-09-30）
    { id: "hide", label: t(cur && project.isHidden(cur) ? "edge.unhide" : "edge.hide"), icon: cur && project.isHidden(cur) ? "visibility-show" : "visibility-hide", disabled: !project.canEdit() },   // 隐藏 = 不出门（导出 / 长图 / 字数），连同子节（Unity 语义；user 2026-09-30）
  ], onPick: (id) => { if (id === "move") { if (cur) void movePageFlow(cur); } else if (id === "toRef") { if (cur) refHost.sendPage(cur); } else if (id === "time") { if (cur) void setPageTimeFlow(cur); } else if (id === "hide") { if (cur) toggleHiddenFlow(cur); } else void addPageFlow(id === "sibling" ? "sibling" : "child"); } });
});
/** 隐藏 / 取消隐藏这一页（自己的旗子）；侧栏与纸上的眼睛跟着重画。 */
function toggleHiddenFlow(name: string): void {
  const v = !project.isHidden(name);
  if (project.setHidden(name, v)) { edgeSidebar.render(); renderHiddenBadge(); setStatus(t(v ? "edge.hiddenDone" : "edge.unhiddenDone", { name: nodeDisplayName(name) })); }
}
/** 纸上章节名旁的眼睛（2026-09-30）：这一页在树上「不出门」才露；自己藏的 → 点了取消；被祖先藏的 → 点了说是谁藏的（去那一页取消）。 */
function renderHiddenBadge(): void {
  const b = $<HTMLButtonElement>("pageHiddenBadge"); const cur = project.active() ? project.current() : null;
  const on = !!cur && project.isHiddenInTree(cur);
  b.hidden = !on; if (!on) return;
  const self = project.isHidden(cur!); const by = self ? null : project.hiddenAncestor(cur!);
  b.title = self ? t("edge.hiddenTip") : t("edge.hiddenBy", { name: nodeDisplayName(by ?? "") }); b.setAttribute("aria-label", b.title);
}
$("pageHiddenBadge").addEventListener("click", () => {
  const cur = project.current(); if (!cur) return;
  if (project.isHidden(cur)) toggleHiddenFlow(cur);
  else setStatus(t("edge.hiddenBy", { name: nodeDisplayName(project.hiddenAncestor(cur) ?? "") }));
});
const activeName = (): string | null => (project.active() ? project.name() : editor.state.name);
const syncKindAny = () => (project.active() ? project.syncKind() : editor.syncKind());
const canEditNow = () => (project.active() ? project.canEdit() : editor.canEdit());
const noteExternalEditAny = () => (project.active() ? project.noteExternalEdit() : editor.noteExternalEdit());
const flushLocalAny = () => (project.active() ? project.flushLocal() : editor.flushLocal());
const pushNowAny = () => (project.active() ? project.pushNow() : editor.pushNow());
const refreshIfCleanAny = () => (project.active() ? project.refreshIfClean() : editor.refreshIfClean());   // 2026-09-26：书也快进（以前书这一面是空操作 → 别的设备改了书这台永远看不到）
const stateAny = () => (project.active() ? project.stateText() : editor.statusForDoc());   // 顶栏粘性稿态也是「谁活着问谁」（以前 boot 末尾拿 parked 的 txt 编辑器状态 → 工程一开就显「本地没有缓存」）
const isDirtyAny = () => (project.active() ? (project.session()?.dirty ?? false) : editor.isDirty());
async function leaveProject(): Promise<void> { if (!project.active()) return; await project.close(); delete document.body.dataset.project; edgeSidebar.render(); editor.resume(); }
/** 打开任一身份：工程 → 工程模式（txt 编辑器 park）；txt → txt 编辑器（工程模式关）。 */
async function openAny(name: string, opts: { promptUnlock?: boolean } = {}): Promise<boolean> {
  libraryReturnTo = null;   // 换了文档：书库返回时不再重开旧的
  if (docKind(name) === "project") {
    if (!editor.isParked()) await editor.park();
    const ok = await project.openStore(name, { promptUnlock: opts.promptUnlock });
    if (!ok) { await leaveProject(); await editor.newDoc(); return false; }   // 打不开（本地无、坏、旧格式）→ 退出书模式、开一张新稿（park 过的 txt 编辑器没有身份，不能就那么留着）
    document.body.dataset.project = "1";
    return ok;
  }
  await leaveProject();
  if (editor.isParked()) editor.resume();   // 进书库时 park 过（见 releaseForLibrary）
  return editor.open(name, opts);
}
// ── 进书库即关书（v2.1.34，user 2026-09-30「进书库关书同意」；起因「退出到图库之后还显示打开中」）：书库是文件管理器视角，进去就把手上的文档放下
//   （落盘 + 释放），卡片上不再有「打开中」、随便删 / 改名、`galx.openActive` 那条路不再触发；「返回编辑器」= 重开刚才那篇（本地 IDB，快）。
//   从书库里点开别的 / 新建 → openAny 已经换了文档，返回时什么都不做。
let libraryReturnTo: string | null = null;
async function releaseForLibrary(): Promise<void> {
  libraryReturnTo = activeName();
  if (project.active()) { await project.close(); delete document.body.dataset.project; edgeSidebar.render(); }
  if (!editor.isParked()) await editor.park();   // park = 先 flush 再静默：不收 input、不落盘、身份清空
  editorEl.value = "";   // 纸面别留上一篇的字（parked 期间 input 不算数）
  renderTopbar(); setState(stateAny());
  galleryHost.refresh();   // 「打开中」标签 / 可删性按「没有打开的」重算
}
async function returnFromLibrary(): Promise<void> {
  const name = libraryReturnTo; libraryReturnTo = null;
  if (activeName()) { editorEl.focus(); return; }   // 书库里已经开了别的（点卡片 / 新建）
  if (name && await openAny(name)) { editorEl.focus(); return; }
  await leaveProject(); if (editor.isParked()) editor.resume(); await editor.newDoc(); editorEl.focus();
}
async function newProjectFlow(): Promise<void> {
  // 默认名「作品」（user 2026-09-10「default 还是叫“作品”吧」；撞名由 createProjectDoc 加序号）；首节点「第一章」按语言生成
  const r = await openInputSheetEx(t("project.newTitle"), { message: t("project.newHint"), defaultValue: t("project.defaultName"), placeholder: t("project.defaultName"), okLabel: t("common.ok"), checkbox: { label: t("project.newEncrypt") } });   // 「加密」勾 = 建完即封（user 2026-09-26「加密勾勾同意」；明文只在本地 IDB 停留一步，同 txt 升书）
  if (r == null) return;
  const raw = r.value, wantEncrypt = r.checked;
  const date = formatDate(Date.now());
  const firstNode = `${t("project.firstPage")}.txt`;   // 唯一的默认页名 =「目录」及各语言对应词（user 2026-09-30「书创建的第一页叫目录吧，不叫作品」；此前 2026-09-10 =「作品」）
  try {
    const empty = await packProject(emptyProject());
    const name = await createProjectDoc(raw.trim() || t("project.defaultName"), empty, date, galleryHost.isOpen() ? galleryHost.currentFolder() : drawer.currentFolder());
    if (!editor.isParked()) await editor.park();
    await project.createInStore(name, firstNode);
    document.body.dataset.project = "1";
    if (galleryHost.isOpen()) galleryHost.close(); else drawer.close();
    setStatus(t("project.created", { name: parseDocName(name).stem }));
    if (wantEncrypt) {   // 勾了加密：走顶栏锁钮同一条路（先要密码；取消密码框 = 这本书先明文，说清楚，锁钮随时可封）
      await project.toggleEncryption(() => Promise.resolve(false), withBusy);
      if (!project.encrypted()) setStatus(t("project.encryptSkipped"), { error: true });
    }
  } catch (e) { reportError(e); setStatus(t("project.createFailed", { e: e instanceof Error ? e.message : String(e) }), { error: true }); }
}
async function openLocalProjectFlow(): Promise<void> {
  const lh = await pickLocalProject();
  if (!lh) return;
  await openLocalHome(lh);
}
/** 开一个本机的书（LocalHome 已在手；也给 ui-audit 直接喂夹具用）。 */
async function openLocalHome(lh: LocalHome): Promise<void> {
  if (!editor.isParked()) await editor.park();
  const ok = await project.openLocal(lh);
  document.body.dataset.project = "1";
  if (galleryHost.isOpen()) galleryHost.close(); else drawer.close();
  if (ok) setStatus(lh.canWriteBack ? t("project.localWriteBack") : t("project.localDownloadOnly"));
}
// ── 2.0 图库屏（@internal/gallery）：☰ 打开独立一屏；抽屉只剩设置。──
const galleryHost = initGalleryHost({
  mountEl: $("galleryMount"), fullEl: $("galleryFull"),
  activeName: () => activeName(), isDirty: () => isDirtyAny(),
  openAny, renameActive: () => renameCurrentDoc(), pushNow: () => pushNowAny(), flushLocal: () => flushLocalAny(),
  ensureUnlocked, setStatus, currentDir: () => (project.active() ? parseDocName(project.name() ?? "").dir : editor.currentDir()),
  onOpened: () => { showLibraryView("files"); void releaseForLibrary(); },
  onClosed: () => { void returnFromLibrary(); },
});
$("galleryBack").addEventListener("click", () => galleryHost.close());
$("gallerySettingsBtn").addEventListener("click", () => openDrawerSettings());
// 书库的回收站 / 备份箱：同一条栏上的两个页签（图库包里它们是同一种视图的两个 kind）。列表、恢复、彻底删、清空全是图库包的；
//   这里只有外壳：哪个页签亮着、清空钮上写什么。备份箱 = 同步冲突里被换下的那一版（store 留的底）。
function showLibraryView(v: GalleryView): void {
  const bar = $("galleryAsideBar");
  bar.classList.toggle("hidden", v === "files");
  for (const tab of bar.querySelectorAll<HTMLElement>(".gallery-aside-tab")) { const on = tab.dataset.aside === v; tab.classList.toggle("is-on", on); tab.setAttribute("aria-selected", on ? "true" : "false"); }
}
function openLibraryView(v: GalleryView): void { galleryHost.setView(v); showLibraryView(v); }
$("galleryTrashBtn").addEventListener("click", () => openLibraryView("trash"));
$("galleryTabTrash").addEventListener("click", () => openLibraryView("trash"));
$("galleryTabBackup").addEventListener("click", () => openLibraryView("backup"));
$("galleryAsideBack").addEventListener("click", () => openLibraryView("files"));
$("galleryAsideEmpty").addEventListener("click", () => {
  const v = galleryHost.getView();
  if (v === "files") return;
  void openChoiceSheet<"local" | "cloud" | "both">(t(v === "trash" ? "gal.emptyTrash" : "gal.emptyBackup"), t("gal.emptyWhich"), [
    { label: t("gal.emptyLocal"), value: "local" }, { label: t("gal.emptyCloud"), value: "cloud" }, { label: t("gal.emptyBoth"), value: "both" },
  ]).then((scope) => { if (scope) galleryHost.emptyAside(v, scope); });
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
  if (project.active()) {   // 工程模式：顶栏 = 工程名（节点名住纸面顶部的章节名框）；加密/只读钮属于 txt 稿
    docNameButton.hidden = false; docNameButton.textContent = project.displayName() ?? ""; docNameButton.classList.remove("pending");
    docNameButton.title = t("top.docName"); docNameButton.setAttribute("aria-label", t("top.docName"));
    cryptoToggle.hidden = project.home()?.kind !== "store";   // 本机工程不走 store 加密
    useIcon(cryptoToggle, project.encrypted() ? "lock" : "unlock");
    cryptoToggle.setAttribute("data-encrypted", project.encrypted() ? "true" : "false");
    cryptoToggle.title = project.encrypted() ? (project.locked() ? t("top.unlockDoc") : t("top.decryptDoc")) : t("top.encryptDoc");
    cryptoToggle.setAttribute("aria-label", cryptoToggle.title);
    addPageButton.hidden = !project.canEdit();   // 书模式 ☰ 左边的「+」= 加页（user 2026-09-10）
    lockToggle.hidden = project.locked() || project.home()?.kind !== "store";   // 0.x 的只读保护（per-device）工程也有
    useIcon(lockToggle, project.readOnly() ? "edit-disabled" : "edit-enabled");
    lockToggle.title = project.readOnly() ? t("top.readOnlyOff") : t("top.readOnlyOn"); lockToggle.setAttribute("aria-label", lockToggle.title);
    keyBanner.hidden = true;
    renderMicVisibility();
    return;
  }
  addPageButton.hidden = true;
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
  lockToggle.hidden = true;   // txt 没有修改锁（2026-09-10 user：锁跟着作品进 zip，txt 不支持）
  keyBanner.hidden = !(st.name && st.encrypted && !st.locked && fileUsesOtherPassword(st.name));
  renderMicVisibility();
}
const keyBanner = $("keyBanner");
// ── 侧栏开关（☰ 唯一入口；user 2026-09-10「侧栏不应默认开」）：body[data-edges]，默认关；宽屏停靠、窄屏浮层（CSS 分派）──
const NARROW_MQ = matchMedia("(max-width: 900px)");
const menuButton = $<HTMLButtonElement>("menuButton");
const sidebarOpen = () => document.body.dataset.edges === "1";
// 设置住在侧栏里（v2.1.18，user 2026-09-29「进设置的时候，关闭设置，还要关一次侧条，麻烦。不如设置和侧条都是同一个侧条里面？」）：
//   侧栏里点「设置」= 侧栏这块面板自己换成设置（#settingsView 整个挪进来，面板加宽）；☰ / 遮罩 / Esc 关一次就全关了；面板头的返回 = 回到导航。
//   书库那一屏的扳手仍然开抽屉（书库盖在侧栏上面，侧栏够不着）；#settingsView 只有一份，谁要用挪到谁那里。
const settingsView = $("settingsView"), drawerEl = $("drawer"), edgeSidebarEl = $("edgeSidebar");
const sidebarSettingsShown = (): boolean => edgeSidebarEl.dataset.view === "settings";
const settingsShown = (): boolean => sidebarSettingsShown() || drawer.currentView() === "settings";
function showSidebarSettings(): void {
  if (drawer.currentView() !== "closed") drawer.close();
  $("edgeSettingsMount").appendChild(settingsView);
  settingsView.hidden = false;
  edgeSidebarEl.dataset.view = "settings";
  renderSettings();
}
function hideSidebarSettings(): void {
  if (!sidebarSettingsShown()) return;
  delete edgeSidebarEl.dataset.view;
  settingsView.hidden = true;
  drawerEl.insertBefore(settingsView, $("drawerActions"));   // 放回抽屉里原来的位置（书库的扳手还要用）
}
function openDrawerSettings(): void { hideSidebarSettings(); drawer.open("settings"); }
function setSidebar(on: boolean): void {
  if (!on) hideSidebarSettings();
  document.body.dataset.edges = on ? "1" : "0";
  menuButton.setAttribute("aria-expanded", on ? "true" : "false");
  if (on) edgeSidebar.render();
}
setSidebar(false);
$("edgeBackdrop").addEventListener("click", () => setSidebar(false));
docNameButton.addEventListener("click", () => { void renameCurrentDoc(); });
$("libraryButton").addEventListener("click", () => { void galleryHost.open(); });   // 顶栏最左 = 回书库（user 2026-09-10「标题左边放书库图标。标题还是改名」）
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
      project.adoptName(rr.name);   // 只换身份：不整包重开（重开走 store open()，慢或失败就等于「改名后得刷新」）
      rememberLastActive();
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
  if (project.active()) { void project.toggleEncryption(() => openConfirmSheet(t("enc.decryptTitle"), t("enc.decryptWarning"), { danger: true, okLabel: t("enc.decryptAction"), warning: true }), withBusy); return; }
  void editor.toggleEncryption(
    () => openConfirmSheet(t("enc.decryptTitle"), t("enc.decryptWarning"), { danger: true, okLabel: t("enc.decryptAction"), warning: true }),
    withBusy,
  );
});
lockToggle.addEventListener("click", () => { if (project.active()) void project.toggleReadOnly(); });

// ── 跨设备 lastActive 指针（Separated 模式：只在冷启动尊重远端，不在 session 中途切）──
let booted = false;
// ── 锁卡（0.2 护栏，user 2026-09-04「0.2 还是先做个护栏吧，不然坑人」）：锁着 / 不可用的稿不再假装是编辑器——纸面盖卡说明 + 三个出口；根治 = 0.3 懒空白稿 ──
const lockCard = $("lockCard"), lockCardText = $("lockCardText"), lockCardUnlock = $<HTMLButtonElement>("lockCardUnlock"), lockCardRetry = $<HTMLButtonElement>("lockCardRetry");
function renderLockCard(): void {
  if (project.active()) {   // 工程锁态：同一张锁卡，解锁 = 手势重开
    lockCard.hidden = !project.locked();
    if (project.locked()) { lockCardText.textContent = t("lock.locked", { name: project.displayName() ?? "" }) + unpushedHint(project.name()); lockCardUnlock.hidden = false; lockCardRetry.hidden = true; }
    return;
  }
  const st = editor.state;
  const kind = st.locked && st.name ? (fileUsesOtherPassword(st.name) ? "other" : "locked") : st.unavailable && booted && st.name ? "unavailable" : null;
  lockCard.hidden = !kind;
  if (!kind) return;
  lockCardText.textContent = t(kind === "other" ? "lock.otherPw" : kind === "locked" ? "lock.locked" : "lock.unavailable", { name: parseDocName(st.name!).title }) + (kind === "unavailable" ? "" : unpushedHint(st.name));
  lockCardUnlock.hidden = kind === "unavailable"; lockCardRetry.hidden = kind !== "unavailable";
}
/** 锁着的稿 / 书有没有未推字节（drawer 当前帧的 per-item dirty，best-effort：不在帧里 = 不说）→ 锁卡多一句「解锁后会自动上传」（2026-09-26：别让人对着「上传」角标干等）。 */
const unpushedHint = (name: string | null): string => (name && drawer.findByName(name)?.dirty ? " " + t("lock.unpushedHint") : "");
const reopenWithPrompt = () => { if (project.active()) { void project.unlock(); return; } const n = editor.state.name; if (n) void editor.open(n, { promptUnlock: true }); };
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

// ── 输入法接线（输入管线 / 软键盘 / 候选 = src/input/；这里只有 app 的策略）──
const kbToggle = $<HTMLButtonElement>("kbToggle");
// 方案跟人走（synced prefs：肌肉记忆换设备不该变）；逃生开关跟设备走（device-kv：取决于这台机器有没有实体键盘）。user 2026-09-03 问「持久化跟谁走」→ 此定。
const imeSchemaPref = (): ImeSchema => { const v = prefs.getItem<string>("imeSchema"); return isImeSchema(v) ? v : DEFAULT_SCHEMA; };
const SCHEMA_NAME_KEY = { luna_pinyin: "ime.schema.luna", luna_pinyin_fluency: "ime.schema.fluency", double_pinyin_mspy: "ime.schema.mspy", double_pinyin: "ime.schema.ziranma", double_pinyin_flypy: "ime.schema.flypy", double_pinyin_abc: "ime.schema.abc", double_pinyin_pyjj: "ime.schema.pyjj", wubi86: "ime.schema.wubi" } as const;
const schemaName = (s: ImeSchema) => t(SCHEMA_NAME_KEY[s]);
const imeSimplifiedPref = (): boolean => prefs.getItem<boolean>("imeSimplified") !== false;   // 简/繁跟人走（synced prefs）；缺省简体
const quoteStylePref = (): "curly" | "corner" => (prefs.getItem<string>("quoteStyle") === "corner" ? "corner" : "curly");   // 引号样式跟人走
function applyQuoteStyle(v: "curly" | "corner"): void { ime.quoteStyle = v; setQuoteStyle(v); imeDock?.keyboard.refresh(); }   // 软键盘符号层的引号跟着换（v2.1.33）
let voiceMode = false;   // 语音模式 = 上一次输入来自语音、之后没敲过实体键——只有纯鼠标/手柄口述的人看得到退格钮（user 2026-09-04「纯鼠标语音模式可能需要一个退格键」）
const input = createInputPipeline({
  ime,
  canEdit: (el) => (el === editorEl ? canEditNow() : true),
  onActivity: () => idlePoke(),
  onCommit: () => { void maybePushUserDict(); },
  onChange: () => renderImeState(),
  onKeydown: (el, e) => {
    if (voiceMode && el === editorEl && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key.length === 1 || e.key === "Backspace" || e.key === "Enter")) { voiceMode = false; renderMicVisibility(); }   // 敲了实体键 = 不是纯口述
    if (!e.isTrusted || softKeyboardPref() !== "auto") return;   // 只有真的实体键盘才让软键盘让位（探针 / 合成事件不算）
    if (TOUCH_PRIMARY) { if (kbHiddenBy !== "hardware") { kbHiddenBy = "hardware"; deviceKvSet("softKeyboardHidden", "hw"); renderImeState(); } }   // 实体键盘在：软键盘让位，候选回到 PC 式悬浮
    else if (kbSummoned) { kbSummoned = false; renderImeState(); }
  },
});
const imeDock = createImeDock({
  ime, pipeline: input, dock: $("imeDock"), floating: $("candidateBar"),
  labels: { space: t("kb.space"), symbols: t("kb.symbols"), letters: t("kb.letters"), more: t("kb.more"), zh: t("ime.modeZh"), en: t("ime.modeEn"), enter: t("kb.enter"), backspace: t("ui.voiceBackspace"), shift: t("kb.shift"), hide: t("kb.hide"), prevPage: t("kb.prevPage"), nextPage: t("kb.nextPage"), toggleMode: t("ime.clickToToggle") },
  keyboardWanted,
  onHideRequest: () => { kbHiddenBy = "user"; kbSummoned = false; },
  onLayout: () => {
    paper.refresh(); syncBodyHeight(); renderKbToggle(); followCaret();
    const f = input.focused(); if (f && f !== editorEl && f.closest(".crypto-modal")) f.scrollIntoView({ block: "nearest" });   // sheet 里的框：键盘露出来之后别被它挡住
  },
});
// 触屏点文本框：按「收起」收掉的键盘回来（实体键盘让位的不回来，见 kbHiddenBy）
onTap(document, (e) => e.pointerType !== "mouse" && kbHiddenBy === "user" && !!asTextField(e.target), () => { kbHiddenBy = null; setTimeout(renderImeState, 0); }, { capture: true });   // 划动滚动不算「点」（v2.1.34）
/** 纸面左下角的键盘钮：软键盘没露着、而这台设备可能用得上（触屏为主 / Quest）时才在。点 = 召出软键盘并把焦点放回文本框。 */
function renderKbToggle(): void {
  const usable = ime.enabled && softKeyboardPref() !== "off" && (TOUCH_PRIMARY || IS_QUEST_BROWSER) && !imeDock.keyboardShown();
  kbToggle.hidden = !usable || micButton.hidden;   // 纸面上没法打字的时候（锁着 / 图片页 / 没有稿）话筒不在，键盘钮也不在
}
kbToggle.addEventListener("mousedown", (e) => e.preventDefault());
kbToggle.addEventListener("click", () => {
  kbHiddenBy = null; kbSummoned = true; deviceKvSet("softKeyboardHidden", null);
  if (!input.target()) editorEl.focus();
  renderImeState();
});
let lastAsciiMode: boolean | null = null;
function renderImeState(): void {
  const s = ime.getState();
  // zen（v2.1.26，user 2026-09-30「输入法也许可以收到悬浮框里面」）：顶栏不再有「中 / 英」；它是悬浮候选条左端的芯片（dock.ts 画），切中 / 英时空着也闪一下让人看见。
  //   手机式软键盘露着时键盘自己的中 / 英键就是状态。方案名只在设置页；改用系统输入法只在设置页。
  if (lastAsciiMode != null && lastAsciiMode !== s.asciiMode && s.enabled) imeDock.flashMode();
  lastAsciiMode = s.enabled ? s.asciiMode : null;
  imeDock.keyboard.setExtraLetters(ime.schema === "double_pinyin_mspy" ? [";"] : []);   // 微软双拼把 ; 当韵母键
  imeDock.render();
  renderKbToggle();
}
async function setImeEnabled(on: boolean): Promise<void> {
  if (on) {
    if (!ime.initialized) { setStatus(t("ime.loading")); ime.simplified = imeSimplifiedPref(); await ime.initialize(imeSchemaPref()); if (ime.initializeError) setStatus(t("ime.fallback", { e: ime.initializeError }), { error: true }); }
    ime.enabled = true;
  } else { ime.enabled = false; ime.resetComposition(); }
  deviceKvSet("imeEnabled", ime.enabled ? "1" : "0");   // 默认开：键缺省 = 开；"0" = 逃生开关「用系统输入法」
  applyInputModeAll();
  renderImeState();
}
async function toggleIme(): Promise<void> { await setImeEnabled(!ime.enabled); }

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
const voiceModel = (): ModelKey => modelKeyFrom(prefs.getItem<string>("voiceProvider"));   // 旧值 webspeech/groq/openai → 默认 SenseVoice
const voiceSource = (): string => (deviceKvGet("voiceModelSource") || MODEL_SOURCE_DEFAULT).replace(/\/+$/, "");
const onVoiceInsert = () => { noteExternalEditAny(); idle.poke(); if (!voiceMode) { voiceMode = true; renderMicVisibility(); } };
function idlePoke(): void { idle.poke(); }   // 输入管线在 idle 之前创建：晚绑定
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
  const absent = !activeVoiceBackend() || (project.active() ? (project.locked() || project.currentKind() === "image") : (!st.name && !st.pendingDate) || st.locked || (st.unavailable && booted));   // 锁着/不可用：锁卡盖着纸面，话筒收起；图片页没有正文可口述
  const blocked = project.active() ? !project.canEdit() : st.readOnly;   // 只读：可见但灰，点了 toast 说原因——别让钮凭空消失（user 2026-09-04「麦克风按钮怎么不见了」）
  micButton.hidden = absent;
  micButton.classList.toggle("disabled", blocked);
  micButton.title = blocked ? t("voice.blockedReadOnly") : t("voice.mic");
  voiceBackspaceButton.hidden = absent || blocked || !voiceMode;
  renderKbToggle();
}
/** 语音模式退格：删光标前一个字（整个 emoji 算一个）/ 选区；组字中则删拼音。按住连删。走输入管线（同软键盘的退格键一条路）。 */
function deleteBeforeCaret(): Promise<void> {
  if (!canEditNow()) return Promise.resolve();
  if (document.activeElement !== editorEl) editorEl.focus();
  return input.press("Backspace").then(() => { localSession?.notifyExternalInput(); });
}
let bsRepeat: ReturnType<typeof setTimeout> | null = null;
const stopBsRepeat = () => { if (bsRepeat) { clearTimeout(bsRepeat); bsRepeat = null; } };
voiceBackspaceButton.addEventListener("pointerdown", (e) => {
  e.preventDefault();   // 别抢编辑器焦点
  void deleteBeforeCaret(); stopBsRepeat();
  const tick = () => { void deleteBeforeCaret(); bsRepeat = setTimeout(tick, 60); };
  bsRepeat = setTimeout(tick, 450);
});
for (const ev of ["pointerup", "pointercancel", "pointerleave"]) voiceBackspaceButton.addEventListener(ev, stopBsRepeat);
micButton.addEventListener("click", () => {
  void (async () => {
    if (!canEditNow()) { setStatus(micButton.title, { error: true }); return; }
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
  if (document.activeElement !== editorEl || !canEditNow()) return;
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
  paper.refresh();
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
function applyFontScale(v: string): void { document.documentElement.style.setProperty("--font-scale", v); fontScaleSelect.value = v; paper.refresh(); syncBodyHeight(); }   // 嵌入态的正文高度随字号变
fontScaleSelect.addEventListener("change", () => { const v = FONT_SCALES.includes(fontScaleSelect.value) ? fontScaleSelect.value : "1"; deviceKvSet("fontScale", v === "1" ? null : v); applyFontScale(v); });
// 写字线（synced prefs，与阅读节奏同席：视觉偏好跟人走；缺省开）
const ruledLinesToggle = $<HTMLInputElement>("ruledLinesToggle");
const ruledLinesPref = (): boolean => prefs.getItem<boolean>("ruledLines") !== false;
function applyRuledLines(on: boolean): void { document.body.classList.toggle("ruled-lines", on); ruledLinesToggle.checked = on; }
ruledLinesToggle.addEventListener("change", () => { prefs.setItem("ruledLines", ruledLinesToggle.checked); applyRuledLines(ruledLinesToggle.checked); });
prefs.onChange("ruledLines", () => applyRuledLines(ruledLinesPref()));
// 页脚字数统计（user 2026-09-10「页脚可以开一个字数统计，xx 字 xx 词，可设置里面 toggle 关」）：CJK 按字、拉丁按词（doc-model.statsForText）；偏好跟云（prefs），默认开。
const wordCountToggle = $<HTMLInputElement>("wordCountToggle"), wordCountEl = $("wordCount");
const wordCountPref = (): boolean => prefs.getItem<boolean>("wordCount") !== false;
let wordCountTimer: ReturnType<typeof setTimeout> | null = null;
function renderWordCount(): void { if (wordCountEl.hidden) return; const s = statsForText(editorEl.value); wordCountEl.textContent = t("foot.wordCount", { cjk: s.cjk, en: s.en }); }
function scheduleWordCount(): void { if (wordCountEl.hidden) return; if (wordCountTimer) clearTimeout(wordCountTimer); wordCountTimer = setTimeout(() => { wordCountTimer = null; renderWordCount(); }, 300); }
function applyWordCount(on: boolean): void { wordCountEl.hidden = !on; wordCountToggle.checked = on; renderWordCount(); }
wordCountToggle.addEventListener("change", () => { prefs.setItem("wordCount", wordCountToggle.checked); applyWordCount(wordCountToggle.checked); });
prefs.onChange("wordCount", () => applyWordCount(wordCountPref()));
editorEl.addEventListener("input", scheduleWordCount);

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
/** 云状态钮 ×2 = 抽屉头 + 书库顶栏（user 2026-09-10「书库刷新和云状态不应跟藏扳手里面，而是外面和菜单里都有吧，当时 weebpaint 也是这么拍板的」——WeebPaint 图库 header 同款：云图标 + 刷新钮露在外面，菜单里照旧有）。 */
const cloudButton = $<HTMLButtonElement>("cloudButton"), galleryCloudBtn = $<HTMLButtonElement>("galleryCloudBtn"), galleryRefreshBtn = $<HTMLButtonElement>("galleryRefreshBtn");
const cloudWho = (): string => { const stt = auth.getAuthState(); return stt.signedIn ? ((stt.account as { username?: string; name?: string } | null)?.username || (stt.account as { name?: string } | null)?.name || t("auth.signedIn")) : ""; };
function renderCloudButton(): void {
  const stt = auth.getAuthState();
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const state = stt.signedIn ? (offline ? "offline" : "signedin") : "out";
  const who = cloudWho();
  const title = state === "signedin" ? t("cloud.titleIn", { who }) : state === "offline" ? t("cloud.titleOffline", { who }) : t("cloud.titleOut");
  for (const b of [cloudButton, galleryCloudBtn]) {
    b.dataset.cloudState = state;
    b.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#${state === "signedin" ? "cloud-synced" : state === "offline" ? "cloud-unavailable" : "cloud"}"/></svg>`;
    b.title = title; b.setAttribute("aria-label", title);
  }
  galleryRefreshBtn.hidden = state !== "signedin";   // 没登录 / 离线时藏刷新（按了没意义；WeebPaint cloudRefreshBtn 同款）
}
/** 刷新云端（云菜单项 + 书库顶栏刷新钮走同一条路）：离线→在线后第一次按、没登录但有缓存账号 → 先静默补登一次（WeebPaint 同款）；然后重订阅列表 + 书库重列 + 推 / 拉活稿。 */
async function refreshCloudNow(): Promise<void> {
  if (!auth.isSignedIn() && navigator.onLine !== false) { await auth.retrySilentSignIn().catch((e) => reportError(e, "log")); renderCloudButton(); }
  drawer.subscribe(); galleryHost.refresh(); void resumeSync();
}
function openCloudMenu(anchor: HTMLElement): void {
  const stt = auth.getAuthState();
  const who = cloudWho();
  togglePopupMenu({
    anchor, align: "right",
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
      if (id === "refresh") void refreshCloudNow();
      else if (id === "lock") void lockCryptoNow();
      else if (id === "signout") void onSignOut();
      else if (id === "signin") void onSignIn();
    },
  });
}
cloudButton.addEventListener("click", () => openCloudMenu(cloudButton));
galleryCloudBtn.addEventListener("click", (e) => { e.stopPropagation(); openCloudMenu(galleryCloudBtn); });
galleryRefreshBtn.addEventListener("click", () => { void refreshCloudNow(); });
/** 登录（#60-C 两步手势，2026-09-09 对账 WeebPaint redirectAfterFlush）：先落盘（活稿 + collections），落盘失败不跳（响亮）；再弹「去登录」，
 *  onPick 在按钮 click 同步栈里起跳 redirect 登录起跳（手势纪律）。为什么：redirect 离场后 pagehide 里的写在 WebKit 上永远 commit 不了、只会把锁冻在旧页里。 */
/** 返回：true = 点了「去登录」（已起跳）；false = 点了「暂不」；null = 背板/Esc 取消或落盘失败没弹。 */
async function onSignIn(opts: { later?: boolean } = {}): Promise<boolean | null> {
  try { await flushLocalAny(); await flushCollections(); }
  catch (e) { reportError(new Error("[sign-in] flush before redirect failed — not navigating: " + String(e)), "error"); setStatus(t("auth.flushFailed"), { error: true }); return null; }
  const v = await openChoiceSheet<"go" | "later">(t("auth.readyTitle"), t("auth.readyMsg"), [
    {
      label: t("auth.go"), value: "go", primary: true,
      onPick: () => {
        setStatus(t("auth.redirecting"));
        void requestStoragePersistence();   // 手势里：persist 申请 + 账号选择器（user 2026-08-23 建议）
        auth.signIn({ prompt: "select_account" }).catch((e) => { reportError(e); setStatus(t("auth.signInFailed", { e: e instanceof Error ? e.message : String(e) }), { error: true }); });
      },
    },
    ...(opts.later ? [{ label: t("auth.later"), value: "later" as const }] : []),
  ]);
  return v === "go" ? true : v === "later" ? false : null;
}
async function onSignOut(): Promise<void> {
  if (!(await openConfirmSheet(t("auth.signOutTitle"), t("auth.signOutMsg")))) return;
  await flushLocalAny();
  try { await flushCollections(); cryptoLock(); await auth.signOut(); setStatus(t("auth.signedOut")); }
  catch (e) { reportError(e); }
  renderAuthRow(); renderTopbar();
}
async function lockCryptoNow(): Promise<void> {
  await flushLocalAny();    // 先把最后几秒的字加密落盘，再丢密码（工程的锁态由 mode.onLockChange 接手）
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
prefs.onChange("voiceProvider", () => { if (settingsShown()) renderVoiceConfig(); });
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
langSelect.addEventListener("change", () => { void (async () => { await flushLocalAny(); await flushCollections(); setLang(langSelect.value as Lang); })(); });

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
  await flushLocalAny();
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
prefs.onChange("quoteStyle", () => { applyQuoteStyle(quoteStylePref()); if (settingsShown()) renderImeSection(); });
imeScriptSelect.addEventListener("change", () => { const v = imeScriptSelect.value === "simp"; prefs.setItem("imeSimplified", v); void ime.setSimplified(v); });
prefs.onChange("imeSimplified", () => { void ime.setSimplified(imeSimplifiedPref()); if (settingsShown()) renderImeSection(); });
softKeyboardSelect.addEventListener("change", () => {
  const v = softKeyboardSelect.value;
  deviceKvSet("softKeyboard", v === "on" || v === "off" ? v : null);
  kbHiddenBy = null; kbSummoned = false; deviceKvSet("softKeyboardHidden", null);   // 改了设置 = 从头算
  renderImeState();
});
imeSchemaSelect.addEventListener("change", () => {
  const v = imeSchemaSelect.value; if (!isImeSchema(v)) return;
  prefs.setItem("imeSchema", v);
  void ime.setSchema(v).then(() => { renderImeState(); setStatus(t("ime.schemaSwitched", { name: schemaName(v) })); });
});
prefs.onChange("imeSchema", () => {   // 别的设备改了方案 → 本机跟上
  const v = imeSchemaPref();
  if (ime.schema !== v) void ime.setSchema(v).then(() => { renderImeState(); if (settingsShown()) renderImeSection(); });
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
  unsyncedCount: async () => { await flushLocalAny(); return (await dirtyDocCount()) + (isDirtyAny() ? 1 : 0); },   // 全库 dirty 标量（不只当前夹）
  beforeWipe: async () => { await flushLocalAny(); await flushCollections(); await leaveProject(); editor.clear(); ime.dispose(); },
});
$("factoryResetButton").addEventListener("click", () => { void factoryReset(); });
initDiagLogUi({ status: (text) => setStatus(text) });   // 2026-09-09 黑匣子：看/复制/分享或下载 .txt/清空（数据源 diag-log）
function renderSettings(): void { renderAuthRow(); renderImeSection(); renderPasswordSection(); renderVoiceConfig(); }

// ── 抽屉按钮 ──
menuButton.addEventListener("click", () => { if (galleryHost.isOpen()) galleryHost.close(); else if (drawer.currentView() !== "closed") drawer.close(); else setSidebar(!sidebarOpen()); });   // 2.0：☰ = 侧栏（书库/设置入口 + 工程内导航）
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
$("settingsButton").addEventListener("click", () => openDrawerSettings());   // 设置入口在抽屉头云图标旁（user 2026-09-04「扳手还是收到 gallery 里面吧…看看 weebpaint 的布局」）
$("emptyTrashButton").addEventListener("click", () => { void drawer.onEmptyTrash(); });
$("reloadButton").addEventListener("click", () => { void (async () => { await flushLocalAny(); await flushCollections(); setStatus(t("st.reloading")); location.reload(); })(); });
document.addEventListener("keydown", (event) => {
  if (event.isComposing) return;   // 系统输入法组字中的按键归输入法（v2.1.13；检索框 / sheet 里组字按 Esc 不该顺手把侧栏关了）
  if (event.key === "Escape" && !event.defaultPrevented && drawer.currentView() !== "closed") { drawer.close(); return; }
  if (event.key === "Escape" && !event.defaultPrevented && sidebarSettingsShown() && !galleryHost.isOpen()) { hideSidebarSettings(); return; }   // 设置面板里按 Esc = 回到侧栏导航
  if (event.key === "Escape" && !event.defaultPrevented && galleryHost.isOpen()) { galleryHost.close(); return; }
  if (event.key === "Escape" && !event.defaultPrevented && sidebarOpen() && NARROW_MQ.matches) { setSidebar(false); editorEl.focus(); return; }
  if ((event.ctrlKey || event.metaKey) && (event.key === "s" || event.key === "S")) { event.preventDefault(); void smartSave(); return; }
  if (project.active() && event.altKey && event.key === "ArrowLeft") { event.preventDefault(); if (project.goBack()) edgeSidebar.render(); }
  if (project.active() && event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && !event.shiftKey) { event.preventDefault(); if (event.key === "ArrowUp" ? project.prevPage() : project.nextPage()) edgeSidebar.render(); }   // 上一页 / 下一页（DFS）
});

// ── 补传全部未推文件（store 的脏账为准；2026-09-26 user 真机「新书一直卡在上传」）──
//   为什么需要它：书 / 稿在登出态落盘走 tryPush:false，**不进**库的离线上传队列（那队列只收「推过但没落地」的）；编辑器内存里的「待推」标记重开后归零；
//   加密文件的推送还必须内存里有密码（库 pushLocalBytes 先解壳，锁着 = locked 算失败）。所以三个时刻都得问库一遍：登录后 / 回前台回线 / **解锁后**。
//   pushAll 不开文档、per-name 串行与用户操作互斥；failed 是错误报告不是列举面（进黑匣子；verbose 时 toast 一句）。
let pushDirtyAllInFlight: Promise<void> | null = null;
function pushDirtyAll(opts: { verbose?: boolean } = {}): Promise<void> {
  if (pushDirtyAllInFlight) return pushDirtyAllInFlight;
  pushDirtyAllInFlight = (async () => {
    if (!auth.isSignedIn() || navigator.onLine === false) return;
    try {
      const r = await requireStore().files.dirty.pushAll();
      if (r.pushed || r.failed.length) diagNote("sync", `dirty.pushAll: pushed=${r.pushed} failed=${r.failed.length}${r.failed.length ? " [" + r.failed.join(", ") + "]" : ""}`);
      if (r.pushed) { setStatus(t("st.pushedAll", { n: r.pushed })); drawer.refresh(); galleryHost.refresh(); }
      if (opts.verbose && r.failed.length) setStatus(t("st.pushAllFailed", { n: r.failed.length }), { error: true });
    } catch (e) { reportError(e, "log"); }
  })().finally(() => { pushDirtyAllInFlight = null; });
  return pushDirtyAllInFlight;
}
// ── 闲置锁屏 / 前台复查 / 隐藏推送 ──
async function resumeSync(): Promise<void> {
  if (!auth.isSignedIn()) return;
  setStatus(t("st.syncing"));
  await pushNowAny();
  await requireStore().files.drainOfflineQueue().catch((e) => reportError(e, "log"));
  await pushDirtyAll();   // 2026-09-26：开着的推完再问库还有谁没推（顺序保证开着的那篇不会被推两遍）
  await refreshIfCleanAny();
  await reconcileCollections();
  drawer.subscribe();   // 2026-09-09 审计 #8：refresh 只重画缓存帧，回线/复查要重拉
  setState(stateAny());
}
onLockChange((unlocked) => { if (unlocked) void pushDirtyAll({ verbose: true }); });   // 2026-09-26：解锁 = 加密文件的推送第一次有钥匙；登录 / 回前台那两下如果当时锁着都推不动（库 locked 算失败留 dirty）
const idle = initIdleGate({
  overlay: $("idleOverlay"),
  onIdle: () => { if (auth.isSignedIn()) { void pushNowAny(); void pushUserDict(); rememberLastActive(); } else void flushLocalAny(); },
  onResume: resumeSync,
  focusEditor: () => editorEl.focus(),
});
// ── Quest：放下手柄时系统键盘焦点会跑去别的 app（空格在 VRChat 里跳起来）——拦不住，能做的 = 焦点回来 / 页内任意处敲键时
//   静默回到编辑器，第一击不丢（user 2026-09-04）。「键盘不在本页」提示条 + 压暗同日撤：光标失踪本身看得见，没有煤气灯疑惑。
function modalOpen(): boolean { return !!document.querySelector('[role="dialog"]:not(.hidden)') || !!currentPopupMenu() || drawer.currentView() !== "closed" || idle.isShown(); }
function recoverEditorFocus(): boolean {
  const a = document.activeElement;
  if (a && a !== document.body && a !== document.documentElement) return a === editorEl;
  if (modalOpen() || !canEditNow()) return false;
  editorEl.focus();
  return document.activeElement === editorEl;
}
window.addEventListener("focus", () => { recoverEditorFocus(); });
document.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.defaultPrevented || (event.target !== document.body && event.target !== document.documentElement)) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.length !== 1 && event.key !== "Backspace" && event.key !== "Enter") return;
  if (!recoverEditorFocus()) return;
  void input.routeHardwareKey(editorEl, event);   // 这一击不丢：直接走编辑器的输入法路径（放行键的默认动作会落进刚聚焦的编辑器）
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
setInterval(() => { if (document.visibilityState === "visible" && !idle.isShown()) { void refreshIfCleanAny(); if (drawer.currentView() === "active") drawer.subscribe(); } }, FOREGROUND_POLL_MS);

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
    void refreshIfCleanAny(); drawer.subscribe(); void reconcileCollections().then(() => drawer.refresh());
  },
  onBeforeReload: async () => { const how = await authBootSettled(); diagNote("sw", `reload requested (auth boot ${how})`); await flushLocalAny(); await flushCollections(); },
});
$("updateReloadButton").addEventListener("click", () => { void shell.reload(); });
$("updateDismissButton").addEventListener("click", () => updateToast.classList.add("hidden"));
if (shell.isDevRoute) $("settingsBuild").textContent += " · dev";

// ── boot ──
async function boot(): Promise<void> {
  await initCollections();
  applyReadingMode(prefs.getItem<string>("readingMode"));
  applyRuledLines(ruledLinesPref());
  applyWordCount(wordCountPref());
  applyFontScale(fontScalePref());
  applyQuoteStyle(quoteStylePref());
  // 输入法默认开（2026-09-03）。v2.1.24：初始化**不挡启动**——先开文档；RIME 后端一创建就接管，加载期间打的字排队等它（ime.ts initialize 注释）。
  //   就绪后：状态行刷新、拉用户词库、然后在空闲片里预热一次（首键比后续键慢 6 倍，量于 tmp/round0929/probe-first-key.mjs；预热不设强制 timeout，家规「启动速度优先」）。
  if (deviceKvGet("imeEnabled") !== "0") {
    ime.simplified = imeSimplifiedPref(); ime.enabled = true;
    void ime.initialize(imeSchemaPref()).then(async () => {
      if (deviceKvGet("imeEnabled") === "0") ime.enabled = false;
      if (ime.initializeError) setStatus(t("ime.fallback", { e: ime.initializeError }), { error: true });
      renderImeState();
      await pullUserDict();
      const idle = (fn: () => void) => (typeof requestIdleCallback === "function" ? requestIdleCallback(() => fn()) : setTimeout(fn, 1));
      idle(() => { void ime.warmUp(); imeDock.warmUp(); });
    });
  }
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

  // 续写：本机上次打开的稿 → 打不开（改名/进回收站/本地无缓存且云端不可达）→ **新稿**（user 2026-09-10「上次的书打不开、找不到的时候，应该是进 new document 而不是顺序打开下一本」）；
  //   本机没有上次记录（新设备）→ 最新一篇 → 否则新稿。
  const last = editor.lastOpenName();
  if (last) {
    const opened = await openAny(last);   // 失败时 openAny 已退到新稿
    if (!opened) { if (!editor.state.pendingDate) await editor.newDoc(); setStatus(t("st.lastOpenFailed", { name: parseDocName(last).stem }), { error: true }); }
  } else {
    await Promise.race([drawer.firstFrame(), new Promise((r) => setTimeout(r, 3000))]);   // 等列表首帧（最多 3s），不再死等 1.5s 后开空新稿
    const first = drawer.items()[0]?.name ?? null;
    if (first) await openAny(first); else await editor.newDoc();
  }
  booted = true;
  if (new URLSearchParams(location.search).has("reset")) { setStatus(t("settings.forceUpdated", { v: APP_VERSION })); try { history.replaceState(null, "", location.pathname + location.hash); } catch { /* ignore */ } }   // 强制更新回执
  renderLockCard(); renderMicVisibility();
  renderTopbar();
  setState(stateAny());
  // 场景恢复（对齐 WeebPaint：从书库出、回来就在书库）：稿照常恢复在底下，书库叠上去；不在书库才把焦点给纸面。
  if (galleryHost.wasInGallery()) await galleryHost.open(); else editorEl.focus();
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
      diagNote("auth", "afterSignIn: reconcile collections + user dict + push open doc + drain offline queue + push all dirty");
      await reconcileCollections();
      await pullUserDict();
      await pushNowAny().catch((e) => reportError(e, "log"));   // 2026-09-26：登录那一下先把开着的推上去（以前登录后没人推，登出态写的书一直「未同步」）
      void requireStore().files.drainOfflineQueue().catch((e) => reportError(e, "log")).then(() => pushDirtyAll());   // 大文件慢网不阻塞后面的 lastActive / 快进；pushAll 排在队列回放之后
      if (!bootLastActiveHandled) {
        bootLastActiveHandled = true;
        // 冷启动尊重远端 lastActive（别的设备最后写的那篇）；本机正在打字/加密锁定的不切。
        // 两种身份都走 openAny（2026-09-10 黑匣子：远端指针是工程名时曾塞给 txt 编辑器 → readDoc 护栏抛 → 每次开工程一条 warning 横幅）
        const remote = appState.getItem<{ name?: string }>("lastActive");
        if (remote?.name && remote.name !== activeName() && !isDirtyAny() && !editor.state.pendingDate) {
          const known = drawer.findByName(remote.name);
          if (known && !known.encrypted) await openAny(remote.name);
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
(window as unknown as { __xhw?: unknown }).__xhw = { version: APP_VERSION, editor, drawer, project, reference: refHost, sidebar: edgeSidebar, setSidebar, sidebarOpen, openAny, copyPage: copyCurrentPage, exportLongImage: renderLongImageFiles, renderPageKin, openLocalBook: openLocalHome, exportBranchFlow, store: requireStore, hasVerifier, parseDocName, choice: openChoiceSheet, confirm: openConfirmSheet, asr, models: MODELS, factoryReset, changePassword: changePasswordFlow, verifyDocPassword, forgetFilePassword, deleteFolder, snapshotFolders, ime, setImeEnabled, voiceBackspace: deleteBeforeCaret, lockNow: lockCryptoNow, smartSave, setVoiceMode: (on: boolean) => { voiceMode = on; renderMicVisibility(); }, recoverEditorFocus };
