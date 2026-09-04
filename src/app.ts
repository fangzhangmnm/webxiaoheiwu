// 组合根：把 store 接缝 / 编辑器 / 抽屉 / IME / 语音 / 闲置锁屏 / PWA 壳接成一个 app。created 2026-09-03 by Claude Fable 5.1
// 这里只有接线与事件编排，没有业务规则（规则住各模块头注释）。
import { APP_VERSION } from "./version.ts";
import { IS_QUEST_BROWSER, PTT_HOLD_MS, USER_DICT_PUSH_INTERVAL_MS, FOREGROUND_POLL_MS } from "./config.ts";
import { initI18n, t, lang, setLang, LANGS, LANG_NAME, type Lang } from "./i18n/index.ts";
import { initErrorBadge, reportError, errorLog } from "./error-badge.ts";
import { initSheets, openConfirmSheet, openInputSheet, openChoiceSheet, withBusy, showBusy, hideBusy } from "./sheets.ts";
import { auth, prefs, appState, rimeDict, initCollections, reconcileCollections, flushCollections, requireStore, requestStoragePersistence } from "./app-store.ts";
import { wireCryptoState, ensureUnlocked as cryptoEnsureUnlocked, ensureFileUnlocked as cryptoEnsureFileUnlocked, isUnlocked, lock as cryptoLock, hasVerifier, currentPassword, setCurrentPassword, resetVerifier, rememberFilePassword, forgetFilePassword, fileUsesOtherPassword, type VerifierRecord } from "./crypto-state.ts";
import { createEditor } from "./editor.ts";
import { verifyDocPassword, decryptDoc, encryptDoc, moveDoc, dirtyDocCount, deleteFolder, snapshotFolders } from "./docs.ts";
import { createDrawer } from "./drawer.ts";
import { initIdleGate } from "./idle-gate.ts";
import { initPwaShell } from "./pwa-shell.ts";
import { NaturalCodeIME, type UserDictDump } from "./ime.ts";
import type { VoiceSession, VoiceState } from "./voice/session.ts";
import { isLocalVoiceSupported, LocalSession } from "./voice/local.ts";
import { asr } from "./asr/engine.ts";
import { MODELS, modelKeyFrom, type ModelKey } from "./asr/packs.ts";
import { MODEL_SOURCE_DEFAULT } from "./config.ts";
import { deviceKvGet, deviceKvSet } from "./device-kv.ts";
import { parseDocName } from "./doc-model.ts";
import { runFactoryReset } from "./factory-reset.ts";
import { togglePopupMenu } from "./ui/popup-menu.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ── 早期初始化（DOM 已就绪：module 默认 deferred）──
initI18n();
const saveStatusEl = $("saveStatus");
function setStatus(text: string, opts: { error?: boolean; unsynced?: boolean } = {}): void {
  saveStatusEl.textContent = text;
  saveStatusEl.classList.toggle("error", !!opts.error);
  saveStatusEl.classList.toggle("unsynced", !!opts.unsynced);
  // 抽屉开着时顶栏被遮罩压住，用户看不到状态（审计 UI-6）：镜像一份到抽屉底部
  const ds = document.getElementById("drawerStatus");
  if (ds && !document.getElementById("drawer")!.classList.contains("hidden")) { ds.textContent = text; ds.classList.toggle("error", !!opts.error); ds.hidden = false; }
}
initErrorBadge({ status: (text) => setStatus(text), dismissHint: () => t("err.dismissHint") });
initSheets({ ok: t("common.ok"), cancel: t("common.cancel") });
console.log("[xhw] build:", APP_VERSION);
$("settingsBuild").textContent = APP_VERSION;

const editorEl = $<HTMLTextAreaElement>("editor");
const titleInput = $<HTMLInputElement>("titleInput");
if (IS_QUEST_BROWSER) { editorEl.setAttribute("inputmode", "none"); titleInput.setAttribute("inputmode", "none"); }
if (window.visualViewport) {   // iOS 软键盘：把键盘高度暴露成 CSS 变量，麦克风钮往上挪
  const vv = window.visualViewport;
  const upd = () => document.documentElement.style.setProperty("--kb-offset", `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
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
  editor: editorEl, titleInput, wordCount: $("wordCount"), setStatus,
  isSignedIn: () => auth.isSignedIn(),
  onDocChanged: () => { renderTopbar(); drawer.refresh(); rememberLastActive(); },
  ensureUnlocked, ensureFileUnlocked,
  onBeforeLoad: () => { voiceAbortHook?.(); },
});
let voiceAbortHook: (() => void) | null = null;
const drawer = createDrawer({
  drawer: $("drawer"), backdrop: $("drawerBackdrop"), title: $("drawerTitle"), backButton: $("drawerBackButton"),
  docList: $("docList"), docListEmpty: $("docListEmpty"), docActions: $("drawerActions"), trashActions: $("trashActions"), settingsView: $("settingsView"),
  breadcrumb: $("docBreadcrumb"), newFolderButton: $<HTMLButtonElement>("newFolderButton"),
  activeName: () => editor.state.name,
  currentDir: () => editor.currentDir(),
  onMoveDoc: async (name, toDir) => {
    if (editor.state.name === name) { await editor.moveTo(toDir); return; }
    try {
      const r = await moveDoc(name, toDir);
      if (!r) { setStatus(t("st.moveFailed"), { error: true }); return; }
      setStatus(r.oldKept ? t("st.renameOldKept") : t("st.moved", { dir: toDir || t("list.root") }), { error: !!r.oldKept });
    } catch (e) { reportError(e); setStatus(t("st.moveFailed"), { error: true }); }
  },
  onOpenDoc: async (name) => { await editor.open(name, { promptUnlock: true }); },
  onActiveTrashed: async () => { await editor.flushLocal(); editor.clear(); },
  onSettingsShown: () => renderSettings(),
  focusEditor: () => editorEl.focus(),
  setStatus,
});

// ── 顶栏（加密钮 / 只读钮）──
const cryptoToggle = $<HTMLButtonElement>("cryptoToggle");
const lockToggle = $<HTMLButtonElement>("lockToggle");
const useIcon = (btn: HTMLElement, id: string) => { btn.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`; };
function renderTopbar(): void {
  const st = editor.state;
  const hasDoc = !!st.name || !!st.pendingDate;
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
function rememberLastActive(): void {
  if (!booted || !editor.state.name || !auth.isSignedIn()) return;   // 冷启动 open(last) 不写云端指针——别盖掉别的设备最后写的那篇
  appState.setItem("lastActive", { name: editor.state.name, savedAt: Date.now(), device: deviceLabel() });
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
function renderImeState(): void {
  const s = ime.getState();
  imeStatus.textContent = !s.enabled ? t("ime.system") : `${s.engine === "rime-double_pinyin" ? t("ime.name") : t("ime.nameFallback")} · ${s.asciiMode ? t("ime.modeEn") : t("ime.modeZh")}`;
  if (!s.enabled || !s.buffer) { candidateBar.classList.add("hidden"); candidateBar.innerHTML = ""; return; }
  candidateBar.classList.remove("hidden");
  const esc = (x: string) => x.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  candidateBar.innerHTML = `<span class="buffer-chip">${esc(s.buffer)}</span>` + s.candidates.slice(0, 9).map((w, i) => `<span class="candidate-chip"><span class="index">${i + 1}</span>${esc(w)}</span>`).join("");
}
async function toggleIme(): Promise<void> {
  if (!ime.enabled) {
    if (!ime.initialized) { imeStatus.textContent = t("ime.loading"); await ime.initialize(); if (ime.initializeError) setStatus(t("ime.fallback", { e: ime.initializeError }), { error: true }); }
    ime.enabled = true;
  } else { ime.enabled = false; ime.resetComposition(); }
  deviceKvSet("imeEnabled", ime.enabled ? "1" : "0");
  renderImeState();
}
imeStatus.addEventListener("click", () => { void toggleIme(); });

function insertAtCursor(target: HTMLTextAreaElement | HTMLInputElement, text: string): void {
  const start = target.selectionStart ?? target.value.length, end = target.selectionEnd ?? target.value.length;
  target.value = target.value.slice(0, start) + text + target.value.slice(end);
  try { target.selectionStart = target.selectionEnd = start + text.length; } catch { /* ignore */ }
}
function stripGhostBuffer(target: HTMLTextAreaElement | HTMLInputElement, consumed: string): void {
  if (!consumed) return;
  const start = target.selectionStart, end = target.selectionEnd;
  if (start == null || start !== end || start < consumed.length) return;
  const before = target.value.slice(0, start);
  if (!before.endsWith(consumed)) return;
  target.value = before.slice(0, -consumed.length) + target.value.slice(end);
  try { target.selectionStart = target.selectionEnd = start - consumed.length; } catch { /* ignore */ }
}
function setupImeOn(el: HTMLTextAreaElement | HTMLInputElement): void {
  const node: HTMLElement = el;   // 联合类型上 addEventListener 的重载退化成 Event；收窄到 HTMLElement 拿回 KeyboardEvent
  node.addEventListener("keydown", async (event: KeyboardEvent) => {
    if (event.key === "Shift") {
      if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.repeat && ime.enabled) shiftCleanPress = true;
      return;
    }
    shiftCleanPress = false;
    if (!editor.canEdit()) return;
    const r = await ime.onKeydown(event);
    if (r.type === "commit") {
      stripGhostBuffer(el, r.consumedBuffer);
      insertAtCursor(el, el instanceof HTMLInputElement ? r.text.replace(/[\r\n]+/g, " ") : r.text);
      if (el === editorEl) editor.noteExternalEdit(); else el.dispatchEvent(new Event("input"));
      void maybePushUserDict();
    }
    renderImeState();
  });
  node.addEventListener("keyup", async (event: KeyboardEvent) => {
    if (event.key !== "Shift" || !shiftCleanPress) return;
    shiftCleanPress = false;
    const r = await ime.toggleAsciiMode();
    if (r.type === "commit") {
      stripGhostBuffer(el, r.consumedBuffer);
      insertAtCursor(el, el instanceof HTMLInputElement ? r.text.replace(/[\r\n]+/g, " ") : r.text);
      if (el === editorEl) editor.noteExternalEdit(); else el.dispatchEvent(new Event("input"));
    }
    renderImeState();
  });
  node.addEventListener("blur", () => { shiftCleanPress = false; });
  node.addEventListener("beforeinput", (event: Event) => {
    if (!ime.isComposing()) return;
    const ie = event as InputEvent;
    if (ie.inputType !== "insertText" || !ie.data) return;
    if (/^[a-z0-9 ]$/i.test(ie.data)) event.preventDefault();
  });
}
setupImeOn(editorEl); setupImeOn(titleInput);

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
const voiceModel = (): ModelKey => modelKeyFrom(prefs.getItem<string>("voiceProvider"));   // 旧值 webspeech/groq/openai → 默认 SenseVoice
const voiceSource = (): string => (deviceKvGet("voiceModelSource") || MODEL_SOURCE_DEFAULT).replace(/\/+$/, "");
const onVoiceInsert = () => { editor.noteExternalEdit(); idle.poke(); };
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
  else if (next === "idle") { const txt = saveStatusEl.textContent; if (txt === t("voice.recording") || txt === t("voice.transcribing") || txt === t("voice.loadingModel")) setStatus(editor.statusForDoc()); }
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
  micButton.hidden = !activeVoiceBackend() || (!st.name && !st.pendingDate) || st.readOnly || st.locked;
  micButton.title = t("voice.mic");
}
micButton.addEventListener("click", () => {
  void (async () => {
    if (!editor.canEdit()) return;
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
async function onSignIn(): Promise<void> {
  await editor.flushLocal();
  setStatus(t("auth.redirecting"));
  try { void requestStoragePersistence(); await auth.signIn({ prompt: "select_account" }); }   // 手势里：persist 申请 + 账号选择器（user 2026-08-23 建议）
  catch (e) { reportError(e); setStatus(t("auth.signInFailed", { e: e instanceof Error ? e.message : String(e) }), { error: true }); }
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
  void (async () => { if (await openConfirmSheet(t("settings.forceUpdateTitle"), t("settings.forceUpdateMsg"))) { await editor.flushLocal(); await flushCollections(); await shell.forceReset(); } })();
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
          rememberFilePassword(it.name, old);
          await decryptDoc(it.name); forgetFilePassword(it.name); await encryptDoc(it.name);
          moved++;
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
$("diagButton").addEventListener("click", () => {
  const pre = $("diagLog"); pre.hidden = !pre.hidden; pre.textContent = errorLog().join("\n") || t("settings.diagEmpty");
});
function renderSettings(): void { renderAuthRow(); renderPasswordSection(); renderVoiceConfig(); }

// ── 抽屉按钮 ──
$("menuButton").addEventListener("click", () => { if (drawer.currentView() === "closed") drawer.open("active"); else drawer.close(); });
$("drawerCloseButton").addEventListener("click", () => drawer.close());
$("drawerBackButton").addEventListener("click", () => drawer.open("active"));
$("drawerBackdrop").addEventListener("click", () => drawer.close());
$("newDocButton").addEventListener("click", () => { void editor.newDoc({ dir: drawer.currentFolder() }).then(() => drawer.close()); });
$("newFolderButton").addEventListener("click", () => { void drawer.newFolder(); });
$("openTrashButton").addEventListener("click", () => drawer.open("trash"));
$("openSettingsButton").addEventListener("click", () => drawer.open("settings"));
$("emptyTrashButton").addEventListener("click", () => { void drawer.onEmptyTrash(); });
$("reloadButton").addEventListener("click", () => { void (async () => { await editor.flushLocal(); await flushCollections(); setStatus(t("st.reloading")); location.reload(); })(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !event.defaultPrevented && drawer.currentView() !== "closed") { drawer.close(); return; }
  if ((event.ctrlKey || event.metaKey) && (event.key === "s" || event.key === "S")) {
    event.preventDefault();
    saveStatusEl.classList.add("flash"); setTimeout(() => saveStatusEl.classList.remove("flash"), 500);
    void requestStoragePersistence();   // 首存手势：persist 申请（persistence:"app-managed"）
    void editor.pushNow();
  }
});

// ── 闲置锁屏 / 前台复查 / 隐藏推送 ──
async function resumeSync(): Promise<void> {
  if (!auth.isSignedIn()) return;
  setStatus(t("st.syncing"));
  await editor.pushNow();
  await requireStore().files.drainOfflineQueue().catch((e) => reportError(e, "log"));
  await editor.refreshIfClean();
  await reconcileCollections();
  drawer.refresh();
  setStatus(editor.statusForDoc());
}
const idle = initIdleGate({
  overlay: $("idleOverlay"),
  onIdle: () => { if (auth.isSignedIn()) { void editor.pushNow(); void pushUserDict(); rememberLastActive(); } else void editor.flushLocal(); },
  onResume: resumeSync,
  focusEditor: () => editorEl.focus(),
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { void editor.flushLocal().then(() => { if (auth.isSignedIn()) return editor.pushNow(); }); void pushUserDict(); void flushCollections(); }
});
window.addEventListener("pagehide", () => { void editor.flushLocal(); void flushCollections(); });
window.addEventListener("online", () => { renderCloudButton(); if (auth.isSignedIn()) { setStatus(t("st.online")); drawer.subscribe(); void resumeSync(); } });
window.addEventListener("offline", () => renderCloudButton());
setInterval(() => { if (document.visibilityState === "visible" && !idle.isShown()) { void editor.refreshIfClean(); if (drawer.currentView() === "active") drawer.subscribe(); } }, FOREGROUND_POLL_MS);

// ── PWA 壳 ──
const updateToast = $("updateToast");
const shell = initPwaShell({
  onUpdateAvailable: () => updateToast.classList.remove("hidden"),
  onForeground: () => { if (!idle.isShown()) { void editor.refreshIfClean(); drawer.subscribe(); void reconcileCollections().then(() => drawer.refresh()); } },
  onBeforeReload: async () => { await editor.flushLocal(); await flushCollections(); },
});
$("updateReloadButton").addEventListener("click", () => { void shell.reload(); });
$("updateDismissButton").addEventListener("click", () => updateToast.classList.add("hidden"));
if (shell.isDevRoute) $("settingsBuild").textContent += " · dev";

// ── boot ──
async function boot(): Promise<void> {
  await initCollections();
  applyReadingMode(prefs.getItem<string>("readingMode"));
  if (deviceKvGet("imeEnabled") === "1") { await ime.initialize(); ime.enabled = true; if (ime.initializeError) setStatus(t("ime.fallback", { e: ime.initializeError }), { error: true }); await pullUserDict(); }
  renderImeState();
  drawer.subscribe();

  // auth（后台探测，不挡首帧）
  auth.onAuthChanged((st) => { renderAuthRow(); renderTopbar(); drawer.subscribe(); if (st.signedIn) void afterSignIn(); });   // 登录态变了 → 列表重订（否则停在登录前的本地帧）
  void auth.initAuth().then((st) => { renderAuthRow(); if (st.signedIn) void afterSignIn(); }).catch((e) => reportError(e, "warning"));

  // 续写：本机上次打开的稿 → 否则最新一篇 → 否则新稿
  const last = editor.lastOpenName();
  if (last) await editor.open(last);
  else {
    await Promise.race([drawer.firstFrame(), new Promise((r) => setTimeout(r, 3000))]);   // 等列表首帧（最多 3s），不再死等 1.5s 后开空新稿
    const first = drawer.items()[0]?.name ?? null;
    if (first) await editor.open(first); else await editor.newDoc();
  }
  booted = true;
  renderTopbar();
  setStatus(editor.statusForDoc());
  editorEl.focus();
}
let signInHandled = false;
async function afterSignIn(): Promise<void> {
  if (signInHandled) return;
  signInHandled = true;
  try {
    await reconcileCollections();
    await pullUserDict();
    void requireStore().files.drainOfflineQueue().catch((e) => reportError(e, "log"));
    // 冷启动尊重远端 lastActive（别的设备最后写的那篇）；本机正在打字/加密锁定的不切
    const remote = appState.getItem<{ name?: string }>("lastActive");
    if (remote?.name && remote.name !== editor.state.name && !editor.isDirty() && !editor.state.pendingDate) {
      const known = drawer.findByName(remote.name);
      if (known && !known.encrypted) await editor.open(remote.name);
    }
    await editor.refreshIfClean();
    drawer.refresh();
  } catch (e) { reportError(e, "warning"); }
}

window.addEventListener("error", (event) => { reportError(new Error(`[window] ${(event.message || "").slice(0, 160)}`)); });
window.addEventListener("unhandledrejection", (event) => {
  const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  reportError(err, err.message === "Not signed in" ? "log" : "error");   // 未登录 = 正常态（库后台云动作的 getToken 抛），只记日志
});

void boot();

// 供 boot smoke / 调试台探针（非 API）
(window as unknown as { __xhw?: unknown }).__xhw = { version: APP_VERSION, editor, drawer, store: requireStore, hasVerifier, parseDocName, choice: openChoiceSheet, confirm: openConfirmSheet, asr, models: MODELS, factoryReset, changePassword: changePasswordFlow, verifyDocPassword, forgetFilePassword, deleteFolder, snapshotFolders };
