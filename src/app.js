import {
  listDocs,
  getDoc,
  createDoc,
  updateDoc,
  purgeDoc,
  getActiveDocId,
  setActiveDocId,
  applySyncPatch,
  getSetting,
  setSetting,
} from "./db.js";
import { NaturalCodeIMEAdapter } from "./ime.js";
import { isSpeechSupported, SpeechSession } from "./speech.js";
import { isWhisperSupported, WhisperSession } from "./whisper.js";
import {
  readJsonFromAppFolder,
  writeJsonToAppFolder,
  updateItemContentKeepalive,
  deleteItem,
} from "./onedrive.js";
import {
  initializeAuth,
  signIn,
  signOut,
  isSignedIn,
} from "./auth.js";
import {
  pushDoc,
  checkRemoteFreshness,
  mergeRemoteList,
  prefetchPendingContents,
  fetchContentForDoc,
  moveDocToTrash,
  restoreDocFromTrash,
  reuploadGhostAsNew,
  pushUserDict,
  pullUserDict,
  pushLastActiveItemId,
  pullLastActiveItemId,
} from "./sync.js";

const editor = document.querySelector("#editor");
const titleInput = document.querySelector("#titleInput");

// On Quest the OS-level IME runs alongside our Rime adapter and composes the
// held PTT key into a multi-` insertCompositionText event (which is non-
// cancelable per spec — preventDefault is a no-op). Telling the browser
// "the page implements its own keyboard input" via inputmode=none skips that
// composition path entirely. Phones without a physical keyboard would also
// lose the virtual keyboard from inputmode=none, so gate on the Quest UA.
const IS_QUEST_BROWSER = /OculusBrowser|Quest|Wolvic/i.test(navigator.userAgent || "");
if (IS_QUEST_BROWSER) {
  console.log("[app] Quest browser detected → inputmode=none on editor + title");
  editor.setAttribute("inputmode", "none");
  titleInput.setAttribute("inputmode", "none");
}
const saveStatus = document.querySelector("#saveStatus");
const imeStatus = document.querySelector("#imeStatus");
const candidateBar = document.querySelector("#candidateBar");

const menuButton = document.querySelector("#menuButton");
const drawer = document.querySelector("#drawer");
const drawerBackdrop = document.querySelector("#drawerBackdrop");
const drawerCloseButton = document.querySelector("#drawerCloseButton");
const reloadButton = document.querySelector("#reloadButton");
const drawerBackButton = document.querySelector("#drawerBackButton");
const drawerTitle = document.querySelector("#drawerTitle");
const drawerActions = document.querySelector("#drawerActions");
const trashActions = document.querySelector("#trashActions");
const newDocButton = document.querySelector("#newDocButton");
const openTrashButton = document.querySelector("#openTrashButton");
const emptyTrashButton = document.querySelector("#emptyTrashButton");
const docList = document.querySelector("#docList");
const docListEmpty = document.querySelector("#docListEmpty");
const authRow = document.querySelector("#authRow");
const ghostBanner = document.querySelector("#ghostBanner");
const ghostTrashButton = document.querySelector("#ghostTrashButton");
const ghostReuploadButton = document.querySelector("#ghostReuploadButton");
const wordCount = document.querySelector("#wordCount");
const lockToggle = document.querySelector("#lockToggle");
const micButton = document.querySelector("#micButton");
const settingsView = document.querySelector("#settingsView");
const openSettingsButton = document.querySelector("#openSettingsButton");
const voiceConfigSection = document.querySelector("#voiceConfigSection");
const voiceProviderSelect = document.querySelector("#voiceProviderSelect");
const voiceKeyField = document.querySelector("#voiceKeyField");
const voiceKeyLabel = document.querySelector("#voiceKeyLabel");
const voiceKeyInput = document.querySelector("#voiceKeyInput");
const voiceVocabField = document.querySelector("#voiceVocabField");
const voiceVocabInput = document.querySelector("#voiceVocabInput");
const voiceConfigSaveButton = document.querySelector("#voiceConfigSaveButton");
const settingsBuild = document.querySelector("#settingsBuild");
const pttDebugDisplay = document.querySelector("#pttDebugDisplay");
const pttDebugRefreshButton = document.querySelector("#pttDebugRefreshButton");
const pttDebugClearButton = document.querySelector("#pttDebugClearButton");

// Bumped in lockstep with the service worker's CACHE_VERSION so opening
// Settings on the device tells you which build you're actually running.
const APP_VERSION = "v66-2026-05-19-quest-inputmode-none";
console.log("[app] build:", APP_VERSION);
if (settingsBuild) settingsBuild.textContent = APP_VERSION;

// --- PTT diagnostic log ---
//
// Visible buffer of every ` / ~ -touching keyboard / input event, regardless
// of whether our filters matched. Quest doesn't have great remote-debug
// affordances; this lets the user open Settings → PTT 调试 to see the
// actual event sequence (code, key, repeat, inputType) and tell us which
// event path is leaking a stray ` past the suppressors.

const PTT_DEBUG_MAX = 80;
const pttDebugBuffer = [];

function pttLog(label, fields) {
  const ts = new Date().toISOString().slice(11, 23);
  const detail = Object.entries(fields ?? {})
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  const line = `${ts} ${label} ${detail}`.trim();
  pttDebugBuffer.push(line);
  if (pttDebugBuffer.length > PTT_DEBUG_MAX) pttDebugBuffer.shift();
  console.debug("[ptt]", line);
}

function renderPttDebug() {
  if (!pttDebugDisplay) return;
  pttDebugDisplay.textContent = pttDebugBuffer.join("\n") || "（无事件）";
  pttDebugDisplay.scrollTop = pttDebugDisplay.scrollHeight;
}

pttDebugRefreshButton?.addEventListener("click", renderPttDebug);
pttDebugClearButton?.addEventListener("click", () => {
  pttDebugBuffer.length = 0;
  renderPttDebug();
});

function isInterestingKeyEvent(e) {
  return e.code === "Backquote" || e.key === "`" || e.key === "~";
}
function isInterestingInputEvent(e) {
  return e.data === "`" || e.data === "~";
}

// Verbose log window: when any ` keydown is seen, log EVERY editor event
// (regardless of code / data) for the next N ms so a leak via a non-`
// inputType or different key still shows up.
const PTT_VERBOSE_WINDOW_MS = 5000;
let pttVerboseUntil = 0;
function armPttVerbose() {
  pttVerboseUntil = Date.now() + PTT_VERBOSE_WINDOW_MS;
}
function pttVerbose() {
  return Date.now() < pttVerboseUntil;
}

// Pure observers — capture phase, do nothing but log. Run BEFORE our actual
// suppression handlers so we record even events that the suppressors then
// reject.
document.addEventListener(
  "keydown",
  (e) => {
    if (isInterestingKeyEvent(e)) {
      armPttVerbose();
      pttLog("kd", {
        code: e.code,
        key: e.key,
        repeat: e.repeat,
        shift: e.shiftKey,
        ae: document.activeElement?.id || document.activeElement?.tagName,
      });
    } else if (pttVerbose()) {
      pttLog("kd*", { code: e.code, key: e.key });
    }
  },
  { capture: true },
);
document.addEventListener(
  "keyup",
  (e) => {
    if (isInterestingKeyEvent(e)) {
      pttLog("ku", { code: e.code, key: e.key });
    } else if (pttVerbose()) {
      pttLog("ku*", { code: e.code, key: e.key });
    }
  },
  { capture: true },
);
document.addEventListener(
  "keypress",
  (e) => {
    if (isInterestingKeyEvent(e)) {
      pttLog("kp", { code: e.code, key: e.key });
    } else if (pttVerbose()) {
      pttLog("kp*", { code: e.code, key: e.key });
    }
  },
  { capture: true },
);
editor.addEventListener(
  "beforeinput",
  (e) => {
    if (isInterestingInputEvent(e) || pttVerbose()) {
      pttLog("bi", { inputType: e.inputType, data: e.data, defaultPrevented: e.defaultPrevented });
    }
  },
  { capture: true },
);
editor.addEventListener(
  "input",
  (e) => {
    if (isInterestingInputEvent(e) || pttVerbose()) {
      pttLog("in", { inputType: e.inputType, data: e.data });
    }
  },
  { capture: true },
);
editor.addEventListener(
  "compositionstart",
  (e) => { if (pttVerbose()) pttLog("cs", { data: e.data }); },
  { capture: true },
);
editor.addEventListener(
  "compositionupdate",
  (e) => { if (pttVerbose()) pttLog("cu", { data: e.data }); },
  { capture: true },
);
editor.addEventListener(
  "compositionend",
  (e) => { if (pttVerbose()) pttLog("ce", { data: e.data }); },
  { capture: true },
);

const ICON_LOCKED = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 1 1 8 0v4"></path></svg>`;
const ICON_UNLOCKED = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 1 1 8 0"></path></svg>`;

const ime = new NaturalCodeIMEAdapter();

const ICON_TRASH = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>`;
const ICON_RESTORE = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`;
const ICON_PURGE = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="6" y1="18" x2="18" y2="6"></line></svg>`;

const state = {
  activeDocId: null,
  activeDoc: null,
  drawerView: "closed", // "closed" | "active" | "trash"
  authSignedIn: false,
  authAccount: null,
  authError: null,
};

let contentSaveTimer = null;
let titleSaveTimer = null;
let pushTimer = null;
let prefetchPending = false;
let shiftCleanPress = false;
let imeInitialized = false; // RIME worker loaded? Lazy; only when user turns IME on.

function formatDate(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function computeDisplayName(doc) {
  // Source of truth: the actual remote filename once pushed. For not-yet-
  // pushed docs we compute "YYYYMMDD title" as a preview. Collision suffix
  // (" 1", " 2", ...) is added by the sync layer at push time and lives
  // inside doc.remoteName; we don't synthesize an ordinal here.
  if (doc.remoteName) {
    return doc.remoteName.replace(/\.txt$/i, "");
  }
  const dateStr = formatDate(doc.createdAt);
  return doc.title ? `${dateStr} ${doc.title}` : dateStr;
}

function setSaveStatus(message, opts = false) {
  // Backwards compat: 2nd arg used to be a boolean for isError.
  if (typeof opts === "boolean") opts = { isError: opts };
  saveStatus.textContent = message;
  saveStatus.classList.toggle("error", !!opts.isError);
  saveStatus.classList.toggle("unsynced", !!opts.unsynced);
}

// Pick the right "what's the state of this doc" status text — used after
// a doc switch, so the bar reflects the new doc instead of stale text
// from the previous one.
function statusForDoc(doc) {
  if (!doc) return "就绪";
  if (doc.dirty) {
    return state.authSignedIn ? "未同步" : "本地草稿";
  }
  if (doc.lastSyncedAt) {
    return `已保存 ${formatTime(doc.lastSyncedAt)}`;
  }
  if (doc.modifiedAt) {
    return `上次修改 ${formatTime(doc.modifiedAt)}`;
  }
  return "就绪";
}

// Word count. Chinese / Japanese / Korean ideographs are counted as
// characters; Latin alphabetic runs are counted as words. Punctuation and
// whitespace don't count toward either.
function statsForText(text) {
  const str = text ?? "";
  const cjk = (str.match(/[㐀-䶿一-鿿豈-﫿]/g) || []).length;
  const en = (str.match(/[A-Za-z][A-Za-z'’]*/g) || []).length;
  return { cjk, en };
}

function renderWordCount() {
  if (!wordCount) return;
  const { cjk, en } = statsForText(editor.value);
  // Hide whichever counter is zero so we don't show meaningless "0 词"
  // alongside an active CJK count. Both visible only when both > 0.
  // The "字 / words" language split itself signals which is which.
  const parts = [];
  if (cjk > 0) parts.push(`${cjk} 字`);
  if (en > 0) parts.push(`${en} words`);
  wordCount.textContent = parts.length > 0 ? parts.join(" · ") : "0 字";
}

function renderImeState() {
  const imeState = ime.getState();
  if (!imeState.enabled) {
    imeStatus.textContent = "系统输入法";
  } else {
    const engineLabel =
      imeState.engine === "rime-double_pinyin"
        ? "Natural Code"
        : "Natural Code (fallback)";
    const modeLabel = imeState.asciiMode ? "EN" : "中";
    imeStatus.textContent = `${engineLabel} · ${modeLabel}`;
  }

  if (!imeState.enabled || imeState.buffer.length === 0) {
    candidateBar.classList.add("hidden");
    candidateBar.innerHTML = "";
    return;
  }

  candidateBar.classList.remove("hidden");
  const buffer = `<span class="buffer-chip">${imeState.buffer}</span>`;
  const candidates = imeState.candidates
    .slice(0, 9)
    .map(
      (word, idx) =>
        `<span class="candidate-chip"><span class="index">${idx + 1}</span>${word}</span>`,
    )
    .join("");
  candidateBar.innerHTML = `${buffer}${candidates}`;
}

async function toggleImeEnabled() {
  if (!ime.getState().enabled) {
    // Turning on — lazy-load RIME worker on first activation. Status bar
    // shows "加载中…" during the ~1s load.
    if (!imeInitialized) {
      imeStatus.textContent = "加载中…";
      await ime.initialize();
      imeInitialized = true;
    }
    ime.enabled = true;
  } else {
    ime.enabled = false;
    ime.backend?.resetState?.();
  }
  await setSetting("imeEnabled", ime.getState().enabled);
  renderImeState();
}

function insertAtCursor(target, text) {
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? target.value.length;
  const before = target.value.slice(0, start);
  const after = target.value.slice(end);
  target.value = `${before}${text}${after}`;
  const nextPos = start + text.length;
  try {
    target.selectionStart = nextPos;
    target.selectionEnd = nextPos;
  } catch {
    // Some input types don't support selection — ignore.
  }
}

function stripGhostBuffer(target, consumedBuffer) {
  if (!consumedBuffer) return;
  const start = target.selectionStart;
  const end = target.selectionEnd;
  if (start == null || start !== end || start < consumedBuffer.length) return;
  const before = target.value.slice(0, start);
  if (!before.endsWith(consumedBuffer)) return;
  const after = target.value.slice(end);
  const nextBefore = before.slice(0, before.length - consumedBuffer.length);
  target.value = `${nextBefore}${after}`;
  const nextPos = nextBefore.length;
  try {
    target.selectionStart = nextPos;
    target.selectionEnd = nextPos;
  } catch {
    // ignore
  }
}

// --- Doc state ---

function syncEditorToDoc() {
  if (state.activeDoc) {
    state.activeDoc.content = editor.value;
    state.activeDoc.title = titleInput.value;
  }
}

async function flushSaves() {
  // Only write if there's an actually-pending debounced save. Writing
  // unconditionally would flip `dirty` to true on docs the user hasn't
  // touched, which then bleeds back into the status bar as "未同步"
  // when they switch to that doc later.
  const hadContentTimer = contentSaveTimer !== null;
  const hadTitleTimer = titleSaveTimer !== null;
  if (contentSaveTimer) {
    clearTimeout(contentSaveTimer);
    contentSaveTimer = null;
  }
  if (titleSaveTimer) {
    clearTimeout(titleSaveTimer);
    titleSaveTimer = null;
  }
  if (!state.activeDocId) return;
  if (!hadContentTimer && !hadTitleTimer) return;
  try {
    const updated = await updateDoc(state.activeDocId, {
      content: editor.value,
      title: titleInput.value,
    });
    state.activeDoc = updated;
  } catch (error) {
    setSaveStatus(`保存失败：${error.message ?? error}`, true);
  }
}

function scheduleContentSave() {
  if (contentSaveTimer) clearTimeout(contentSaveTimer);
  contentSaveTimer = setTimeout(async () => {
    contentSaveTimer = null;
    if (!state.activeDocId) return;
    try {
      const updated = await updateDoc(state.activeDocId, { content: editor.value });
      state.activeDoc = updated;
      if (!state.authSignedIn) {
        setSaveStatus(`已保存 ${formatTime(Date.now())}`);
      }
      // Signed in: schedulePush starts the heartbeat + countdown, which
      // owns the status bar ("XX 秒后自动同步") until the push actually
      // fires. We deliberately don't show "已保存" here because the bytes
      // haven't reached OneDrive yet — that'd mislead the user into
      // closing the device early.
      schedulePush();
    } catch (error) {
      setSaveStatus(`保存失败：${error.message ?? error}`, true);
    }
  }, 200);
}

function scheduleTitleSave() {
  if (titleSaveTimer) clearTimeout(titleSaveTimer);
  titleSaveTimer = setTimeout(async () => {
    titleSaveTimer = null;
    if (!state.activeDocId) return;
    try {
      const updated = await updateDoc(state.activeDocId, { title: titleInput.value });
      state.activeDoc = updated;
      if (!state.authSignedIn) {
        setSaveStatus(`已保存 ${formatTime(Date.now())}`);
      }
      schedulePush();
    } catch (error) {
      setSaveStatus(`保存失败：${error.message ?? error}`, true);
    }
  }, 250);
}

// Debounce + heartbeat max-wait. Each keystroke resets a 15s debounce
// (catches "user just stopped"), but the timer never waits past
// firstDirtyAt + 30s (catches "user is typing nonstop for ages"). Static
// "● 未同步" indicator in the status bar; no ticking countdown.
const PUSH_DEBOUNCE_MS = 15 * 1000;
const PUSH_HEARTBEAT_MS = 30 * 1000;
let firstDirtyAt = 0;

function schedulePush() {
  if (!state.authSignedIn) return;
  const now = Date.now();
  if (firstDirtyAt === 0) firstDirtyAt = now;
  if (pushTimer !== null) clearTimeout(pushTimer);
  const target = Math.min(now + PUSH_DEBOUNCE_MS, firstDirtyAt + PUSH_HEARTBEAT_MS);
  const wait = Math.max(0, target - now);
  pushTimer = setTimeout(doPush, wait);
}

async function doPush() {
  if (pushTimer) {
    clearTimeout(pushTimer);
  }
  pushTimer = null;
  // Resetting firstDirtyAt: each push attempt starts a fresh cycle so
  // the heartbeat budget renews even if this push fails.
  firstDirtyAt = 0;
  if (!state.activeDocId || !state.authSignedIn) return;
  const targetId = state.activeDocId;
  const wasUntracked = state.activeDoc && !state.activeDoc.onedriveItemId;
  setSaveStatus("正在同步…");
  try {
    const result = await pushDoc(targetId);
    const fresh = await getDoc(targetId);
    if (fresh && targetId === state.activeDocId) {
      state.activeDoc = fresh;
      // Don't clobber the user's in-flight edits if they typed during push.
      const contentDiverged = editor.value !== (fresh.content ?? "");
      if (result?.conflict === "sibling-created") {
        editor.value = fresh.content ?? "";
        titleInput.value = fresh.title ?? "";
        moveCaretToStart(editor);
        renderWordCount();
        setSaveStatus(`离线修改已存为副本 · ${formatTime(Date.now())}`);
      } else if (result?.conflict === "missing-clean") {
        setSaveStatus("此文件在云端已不存在", true);
      } else if (result?.conflict === "missing-dirty") {
        setSaveStatus("云端已删 — 见编辑器顶部提示", true);
      } else if (result?.ok && !contentDiverged) {
        // Only call it "saved" once OneDrive has actually accepted the bytes.
        setSaveStatus(`已保存 ${formatTime(Date.now())}`);
      }
      renderGhostBanner();
      // First successful push: doc just got an onedriveItemId. Record it as
      // the cross-device "last active" so the next cold start on another
      // device opens this file.
      if (wasUntracked && result?.ok && fresh.onedriveItemId) {
        pushLastActiveItemId(fresh.onedriveItemId).catch(() => {});
      }
      // Race: user typed during push so dirty stayed true (pushUpdate's
      // stillSame check). Kick off another heartbeat to catch up.
      if (fresh.dirty && state.authSignedIn) {
        schedulePush();
      }
    }
  } catch (error) {
    setSaveStatus(`同步失败：${error.message ?? error}`, true);
    // Network/5xx — leave dirty=true and schedule retry on next heartbeat.
    if (state.authSignedIn) schedulePush();
  }
}

async function checkActiveDocFreshness() {
  if (!state.authSignedIn || !state.activeDocId) return;
  // Hard rule: never probe remote while the user has uncommitted edits in
  // the textarea (debounced save timer is set). A silent-replace at that
  // moment would diverge editor.value from IDB, and the next push would
  // clobber the remote with stale-plus-user-typing content. If the user
  // really is editing, just let the save → push → 412 → sibling path run.
  if (contentSaveTimer || titleSaveTimer) return;
  const id = state.activeDocId;
  try {
    const result = await checkRemoteFreshness(id);
    const fresh = await getDoc(id);
    if (fresh && id === state.activeDocId) {
      state.activeDoc = fresh;
      if (result?.changed && result.contentChanged) {
        // Only replace editor if user isn't actively typing.
        if (!contentSaveTimer && !titleSaveTimer) {
          editor.value = fresh.content ?? "";
          titleInput.value = fresh.title ?? "";
          moveCaretToStart(editor);
          renderWordCount();
          setSaveStatus(`已加载云端最新 ${formatTime(Date.now())}`);
        }
      } else if (result?.conflict === "sibling-created") {
        editor.value = fresh.content ?? "";
        titleInput.value = fresh.title ?? "";
        moveCaretToStart(editor);
        renderWordCount();
        setSaveStatus(`离线修改已存为副本 · ${formatTime(Date.now())}`);
      } else if (result?.missing) {
        setSaveStatus("此文件在云端已不存在", true);
      }
      renderGhostBanner();
    }
  } catch (error) {
    // Network/transient — silent, will retry on next trigger.
    console.warn("freshness check failed:", error);
  }
}

function moveCaretToStart(input) {
  if (!input) return;
  // Chrome auto-positions selection at .value.length after a value setter
  // and focus() scrolls there — overriding makes opening land at the top
  // of the file, which is what the user actually wants for re-reading
  // their draft from the beginning.
  try {
    input.selectionStart = 0;
    input.selectionEnd = 0;
  } catch {
    /* some inputs don't support selection */
  }
  if (typeof input.scrollTop === "number") {
    input.scrollTop = 0;
  }
}

function renderEditor() {
  if (!state.activeDoc) {
    editor.value = "";
    titleInput.value = "";
    renderGhostBanner();
    renderLockState();
    renderWordCount();
    return;
  }
  editor.value = state.activeDoc.content ?? "";
  titleInput.value = state.activeDoc.title ?? "";
  moveCaretToStart(editor);
  renderGhostBanner();
  renderLockState();
  renderWordCount();
}

function renderGhostBanner() {
  if (!ghostBanner) return;
  const isGhost =
    state.activeDoc &&
    state.activeDoc.onedriveItemId &&
    state.activeDoc.remoteFound === false;
  ghostBanner.classList.toggle("hidden", !isGhost);
}

function renderLockState() {
  if (!lockToggle) return;
  if (!state.activeDoc) {
    lockToggle.hidden = true;
    editor.classList.remove("locked");
    titleInput.classList.remove("locked");
    renderMicVisibility();
    return;
  }
  lockToggle.hidden = false;
  const locked = !!state.activeDoc.locked;
  lockToggle.setAttribute("data-locked", locked ? "true" : "false");
  lockToggle.setAttribute("aria-label", locked ? "解锁编辑" : "锁定文档");
  lockToggle.title = locked ? "解锁编辑" : "锁定（只读）";
  lockToggle.innerHTML = locked ? ICON_LOCKED : ICON_UNLOCKED;
  // Don't set readOnly — that hides the caret and breaks keyboard nav on
  // some browsers (Quest included). Instead we mark a class and block
  // mutation events below. Caret, selection, arrow nav, Ctrl+C all work.
  editor.classList.toggle("locked", locked);
  titleInput.classList.toggle("locked", locked);
  renderMicVisibility();
}

async function toggleLock() {
  if (!state.activeDocId || !state.activeDoc) return;
  const next = !state.activeDoc.locked;
  // Lock state is a local-only preference; applySyncPatch (not updateDoc)
  // so we don't bump modifiedAt or set dirty.
  const updated = await applySyncPatch(state.activeDocId, { locked: next });
  state.activeDoc = updated;
  renderLockState();
}

async function switchDoc(id) {
  await flushSaves();
  if (!id) {
    state.activeDocId = null;
    state.activeDoc = null;
    renderEditor();
    return;
  }
  const doc = await getDoc(id);
  if (!doc) {
    state.activeDocId = null;
    state.activeDoc = null;
    renderEditor();
    return;
  }
  state.activeDocId = doc.id;
  state.activeDoc = doc;
  await setActiveDocId(doc.id);
  renderEditor();
  setSaveStatus(statusForDoc(doc));
  // Stub doc → fetch content; otherwise → freshness check. Both async.
  if (state.authSignedIn) {
    if (doc.onedriveItemId && !doc.contentLoaded && doc.remoteFound) {
      hydrateStub(doc.id).catch((err) => console.warn("hydrateStub:", err));
    } else {
      checkActiveDocFreshness().catch(() => {});
    }
    if (doc.onedriveItemId) {
      pushLastActiveItemId(doc.onedriveItemId).catch(() => {});
    }
  }
}

async function hydrateStub(docId) {
  try {
    setSaveStatus("加载中…");
    await fetchContentForDoc(docId);
    const fresh = await getDoc(docId);
    if (fresh && docId === state.activeDocId) {
      state.activeDoc = fresh;
      if (!contentSaveTimer && !titleSaveTimer) {
        editor.value = fresh.content ?? "";
        titleInput.value = fresh.title ?? "";
        moveCaretToStart(editor);
        renderWordCount();
      }
      setSaveStatus(`已加载 ${formatTime(Date.now())}`);
      renderGhostBanner();
    }
  } catch (error) {
    setSaveStatus(`加载失败：${error.message ?? error}`, true);
  }
}

// An auto-generated blank doc: user clicked "新建" then walked away without
// typing anything. Safe to purge on next app boot — they were never pushed
// to OneDrive (no onedriveItemId), have no title, no content.
function isAutoEmpty(doc) {
  return (
    !doc.title &&
    !doc.content &&
    !doc.onedriveItemId &&
    !doc.deletedAt
  );
}

async function cleanupAutoEmptyDocs() {
  try {
    const docs = await listDocs({ includeTrashed: false });
    for (const d of docs.filter(isAutoEmpty)) {
      await purgeDoc(d.id);
    }
  } catch (error) {
    console.warn("cleanupAutoEmptyDocs:", error);
  }
}

async function ensureActiveDoc() {
  let id = state.activeDocId ?? (await getActiveDocId());
  if (id) {
    const doc = await getDoc(id);
    if (doc && !doc.deletedAt) {
      state.activeDocId = doc.id;
      state.activeDoc = doc;
      return;
    }
  }
  const active = (await listDocs()).sort((a, b) => b.modifiedAt - a.modifiedAt);
  const target = active[0] ?? (await createDoc());
  state.activeDocId = target.id;
  state.activeDoc = target;
  await setActiveDocId(target.id);
}

// --- Drawer ---

async function openDrawer(view = "active") {
  state.drawerView = view;
  drawer.classList.remove("hidden");
  drawer.setAttribute("aria-hidden", "false");
  drawerBackdrop.classList.remove("hidden");

  // View matrix: 'active' shows the file list with the new-doc action.
  //              'trash' shows the trash list with empty-trash action.
  //              'settings' hides the list entirely and shows the settings
  //              panel (auth + voice config).
  const isSettings = view === "settings";
  const isTrash = view === "trash";
  drawerTitle.textContent = isSettings ? "设置" : isTrash ? "垃圾箱" : "文件";
  drawerBackButton.hidden = view === "active";
  drawerActions.classList.toggle("hidden", isTrash || isSettings);
  trashActions.classList.toggle("hidden", !isTrash);
  if (settingsView) settingsView.hidden = !isSettings;
  if (docList) docList.hidden = isSettings;
  if (isSettings) {
    docListEmpty.classList.add("hidden");
    renderVoiceConfigForm();
    renderPttDebug();
    return;
  }
  await renderDocList();
  // When the drawer opens we (best-effort) sync remote metadata into IDB,
  // then kick off content prefetch for any new stubs. Both are background.
  if (state.authSignedIn) {
    syncOnDrawerOpen().catch((err) => console.warn("drawer sync:", err));
  }
}

async function syncOnDrawerOpen() {
  try {
    const summary = await mergeRemoteList();
    if (summary?.stubsCreated > 0 || state.drawerView !== "closed") {
      await renderDocList();
    }
  } catch (error) {
    // Don't disturb the drawer if list failed; user can hit refresh.
    console.warn("mergeRemoteList:", error);
    return;
  }
  startBackgroundPrefetch();
}

function startBackgroundPrefetch() {
  if (prefetchPending) return;
  prefetchPending = true;
  prefetchPendingContents({
    onProgress: ({ done, total }) => {
      if (total > 0 && done < total) {
        setSaveStatus(`本地化 ${done}/${total}`);
      }
    },
  })
    .then(async ({ done, total }) => {
      if (total > 0) {
        setSaveStatus(`本地化完成 ${done}/${total} · ${formatTime(Date.now())}`);
      }
      if (state.drawerView !== "closed") await renderDocList();
    })
    .catch((err) => console.warn("prefetch:", err))
    .finally(() => {
      prefetchPending = false;
    });
}

function closeDrawer() {
  state.drawerView = "closed";
  drawer.classList.add("hidden");
  drawer.setAttribute("aria-hidden", "true");
  drawerBackdrop.classList.add("hidden");
  editor.focus();
}

// Natural / number-aware filename comparator, matching VS Code's Explorer
// sort. With user's YYYYMMDD-leading filename convention, descending order
// = newest first, with `... 1` < `... 2` < `... 10` instead of lex order.
const NAME_COLLATOR = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

async function renderDocList() {
  const all = await listDocs({ includeTrashed: true });
  const isTrashView = state.drawerView === "trash";

  // Precompute display names so the sort comparator stays cheap.
  const nameByDocId = new Map();
  for (const doc of all) {
    nameByDocId.set(doc.id, computeDisplayName(doc));
  }

  const filtered = isTrashView
    ? all.filter((d) => d.deletedAt)
    : all.filter((d) => !d.deletedAt);

  filtered.sort((a, b) =>
    NAME_COLLATOR.compare(nameByDocId.get(b.id), nameByDocId.get(a.id)),
  );

  docList.innerHTML = "";

  if (filtered.length === 0) {
    docListEmpty.textContent = isTrashView ? "垃圾箱是空的。" : "这里还没有任何文件。";
    docListEmpty.classList.remove("hidden");
    return;
  }
  docListEmpty.classList.add("hidden");

  for (const doc of filtered) {
    const li = document.createElement("li");
    li.className = "doc-row";
    if (!isTrashView && doc.id === state.activeDocId) {
      li.classList.add("active");
    }

    const mainBtn = document.createElement("button");
    mainBtn.type = "button";
    mainBtn.className = "doc-main";

    const nameSpan = document.createElement("span");
    let nameClass = doc.title ? "doc-name" : "doc-name untitled";
    if (doc.onedriveItemId && doc.remoteFound === false) {
      nameClass += " ghost";
    } else if (doc.onedriveItemId && !doc.contentLoaded) {
      nameClass += " stub";
    } else if (!doc.onedriveItemId && state.authSignedIn) {
      nameClass += " local-only";
    }
    nameSpan.className = nameClass;
    nameSpan.textContent = nameByDocId.get(doc.id);
    mainBtn.appendChild(nameSpan);

    const previewSpan = document.createElement("span");
    previewSpan.className = "doc-preview";
    let previewText;
    if (doc.onedriveItemId && !doc.contentLoaded) {
      previewText = "（云端，未加载）";
    } else {
      const cleaned = (doc.content ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      previewText = cleaned || "（空白）";
    }
    previewSpan.textContent = previewText;
    mainBtn.appendChild(previewSpan);

    if (!isTrashView) {
      mainBtn.addEventListener("click", async () => {
        if (doc.id !== state.activeDocId) {
          await switchDoc(doc.id);
        }
        closeDrawer();
      });
    } else {
      mainBtn.disabled = true;
      mainBtn.style.cursor = "default";
    }
    li.appendChild(mainBtn);

    const actions = document.createElement("div");
    actions.className = "doc-row-actions";

    if (!isTrashView) {
      const trashBtn = document.createElement("button");
      trashBtn.type = "button";
      trashBtn.className = "row-icon-button danger";
      trashBtn.title = "移到垃圾箱";
      trashBtn.setAttribute("aria-label", "移到垃圾箱");
      trashBtn.innerHTML = ICON_TRASH;
      trashBtn.addEventListener("click", () => onTrashDoc(doc.id));
      actions.appendChild(trashBtn);
    } else {
      const restoreBtn = document.createElement("button");
      restoreBtn.type = "button";
      restoreBtn.className = "row-icon-button";
      restoreBtn.title = "恢复";
      restoreBtn.setAttribute("aria-label", "恢复");
      restoreBtn.innerHTML = ICON_RESTORE;
      restoreBtn.addEventListener("click", () => onRestoreDoc(doc.id));
      actions.appendChild(restoreBtn);

      const purgeBtn = document.createElement("button");
      purgeBtn.type = "button";
      purgeBtn.className = "row-icon-button danger";
      purgeBtn.title = "永久删除";
      purgeBtn.setAttribute("aria-label", "永久删除");
      purgeBtn.innerHTML = ICON_PURGE;
      purgeBtn.addEventListener("click", () => onPurgeDoc(doc.id));
      actions.appendChild(purgeBtn);
    }
    li.appendChild(actions);

    docList.appendChild(li);
  }
}

// Optimistic-UI pattern for trash/restore/purge: write to IDB and re-render
// drawer immediately so the click feels instant. The remote OneDrive call runs
// in the background; on success it may patch etag/lastSyncedAt, on failure it
// flips dirty back on — re-render on completion either way so the row reflects
// final state (and any error toast lands).
async function onTrashDoc(id) {
  await flushSaves();
  await applySyncPatch(id, { deletedAt: Date.now() });
  if (id === state.activeDocId) {
    await pickNextActive();
  }
  await renderDocList();
  if (state.authSignedIn) {
    moveDocToTrash(id)
      .catch((error) => {
        setSaveStatus(`移到回收站失败：${error.message ?? error}`, true);
      })
      .finally(() => renderDocList());
  }
}

async function onRestoreDoc(id) {
  await applySyncPatch(id, { deletedAt: null });
  await renderDocList();
  if (state.authSignedIn) {
    restoreDocFromTrash(id)
      .catch((error) => {
        setSaveStatus(`恢复失败：${error.message ?? error}`, true);
      })
      .finally(() => renderDocList());
  }
}

async function onPurgeDoc(id) {
  if (!confirm("此文件将永久删除，无法恢复。继续吗？")) return;
  const doc = await getDoc(id);
  const remoteItemId = doc?.onedriveItemId ?? null;
  await purgeDoc(id);
  await renderDocList();
  if (state.authSignedIn && remoteItemId) {
    deleteItem(remoteItemId)
      .catch((error) => {
        if (error?.status === 404) return;
        setSaveStatus(`远端删除失败：${error.message ?? error}`, true);
      })
      .finally(() => renderDocList());
  }
}

async function onEmptyTrash() {
  const trashed = (await listDocs({ includeTrashed: true })).filter((d) => d.deletedAt);
  if (trashed.length === 0) return;
  if (!confirm(`将永久删除 ${trashed.length} 个文件，无法恢复。继续吗？`)) return;
  const remoteIds = trashed.map((d) => d.onedriveItemId).filter(Boolean);
  for (const d of trashed) {
    await purgeDoc(d.id);
  }
  await renderDocList();
  if (state.authSignedIn && remoteIds.length > 0) {
    Promise.allSettled(remoteIds.map((rid) => deleteItem(rid)))
      .then((results) => {
        const failed = results.filter(
          (r) => r.status === "rejected" && r.reason?.status !== 404,
        );
        if (failed.length > 0) {
          setSaveStatus(`远端删除失败 ${failed.length} 项`, true);
        }
      })
      .finally(() => renderDocList());
  }
}

async function pickNextActive() {
  const active = (await listDocs()).sort((a, b) => b.modifiedAt - a.modifiedAt);
  if (active.length > 0) {
    await switchDoc(active[0].id);
  } else {
    const fresh = await createDoc();
    await switchDoc(fresh.id);
  }
}

async function onNewDoc() {
  await flushSaves();
  const fresh = await createDoc();
  await switchDoc(fresh.id);
  closeDrawer();
  titleInput.focus();
}

// --- Auth (OneDrive sign-in) ---

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function renderAuthRow() {
  if (!authRow) return;
  if (state.authSignedIn && state.authAccount) {
    const label = state.authAccount.username || state.authAccount.name || "已登录";
    authRow.innerHTML = `
      <span class="auth-account" title="${escapeHtml(label)}">已登录 · ${escapeHtml(label)}</span>
      <button class="auth-action" id="signOutButton">退出</button>
    `;
    const btn = authRow.querySelector("#signOutButton");
    if (btn) btn.addEventListener("click", onSignOut);
    return;
  }
  if (state.authError) {
    authRow.innerHTML = `
      <span class="auth-account" title="${escapeHtml(state.authError)}">登录不可用</span>
      <button class="auth-action" id="signInButton">重试</button>
    `;
  } else {
    authRow.innerHTML = `
      <button class="auth-action primary" id="signInButton">登录 OneDrive 同步</button>
    `;
  }
  const btn = authRow.querySelector("#signInButton");
  if (btn) btn.addEventListener("click", onSignIn);
}

async function onSignIn() {
  await flushSaves();
  setSaveStatus("正在跳转到 Microsoft 登录…");
  try {
    await signIn();
    // signIn navigates away via redirect — code after this rarely runs.
  } catch (error) {
    state.authError = error.message ?? String(error);
    setSaveStatus(`登录失败：${state.authError}`, true);
    renderAuthRow();
  }
}

async function onSignOut() {
  if (!confirm("退出后将停止 OneDrive 同步。继续吗？")) return;
  await flushSaves();
  try {
    await signOut();
    state.authSignedIn = false;
    state.authAccount = null;
    state.authError = null;
    voiceConfig = null;
    renderAuthRow();
    renderVoiceConfigForm();
    renderMicVisibility();
    setSaveStatus(`已退出 ${formatTime(Date.now())}`);
  } catch (error) {
    setSaveStatus(`退出失败：${error.message ?? error}`, true);
  }
}

async function initializeAuthFlow() {
  try {
    const result = await initializeAuth();
    state.authSignedIn = result.signedIn;
    state.authAccount = result.account;
    state.authError = null;
  } catch (error) {
    state.authSignedIn = false;
    state.authAccount = null;
    state.authError = error.message ?? String(error);
    console.warn("Auth init failed:", error);
  }
  renderAuthRow();
  renderVoiceConfigForm();
  if (state.authSignedIn) {
    // Don't block the editor on the network. Let it idle a moment so the
    // initial render is instant, then sync the active doc + start the merge.
    setTimeout(() => {
      checkActiveDocFreshness().catch(() => {});
      loadVoiceConfig().catch((err) => console.warn("loadVoiceConfig:", err));
      mergeRemoteList()
        .then(async () => {
          startBackgroundPrefetch();
          // Cold start only: respect the cross-device "last active" pointer.
          // We deliberately don't do this on idle resume — switching docs
          // out from under the user mid-session would be jarring.
          await maybeSwitchToRemoteLastActive();
        })
        .catch((err) => console.warn("startup merge:", err));
      // Pull RIME user dict in the background. If it lands, restoreUserDir
      // re-inits the worker; any keystrokes between now and then learn into
      // the old user db — acceptable price for blank-page-immediately.
      pullUserDict(ime)
        .then((result) => {
          if (result?.ok && result.fileCount > 0) {
            lastUserDictPushAt = Date.now();
          }
        })
        .catch((err) => console.warn("pull user dict:", err));
    }, 800);
  }
}

async function maybeSwitchToRemoteLastActive() {
  if (!state.authSignedIn) return;
  // Don't disturb someone actively typing.
  if (contentSaveTimer || titleSaveTimer) return;
  const remoteItemId = await pullLastActiveItemId();
  if (!remoteItemId) return;
  const currentItemId = state.activeDoc?.onedriveItemId ?? null;
  if (remoteItemId === currentItemId) return;
  const all = await listDocs({ includeTrashed: false });
  const target = all.find((d) => d.onedriveItemId === remoteItemId);
  if (!target) return;
  // Re-check the typing guard right before we actually switch — the pull
  // call had latency and the user may have started typing in between.
  if (contentSaveTimer || titleSaveTimer) return;
  await switchDoc(target.id);
}

// --- IME wiring for editor + title input ---

function setupImeOn(inputEl, onCommitSchedule) {
  inputEl.addEventListener("keydown", async (event) => {
    if (event.key === "Shift") {
      // Only arm Shift-tap mode toggle when IME is actually on; otherwise
      // the keyup handler would call toggleAsciiMode for nothing.
      if (
        !event.ctrlKey && !event.altKey && !event.metaKey && !event.repeat &&
        ime.getState().enabled
      ) {
        shiftCleanPress = true;
      }
      return;
    }
    shiftCleanPress = false;

    // Locked doc: don't run IME at all. User can still navigate / select /
    // copy via the browser's built-in keyboard handling. (We don't use the
    // textarea's own readOnly attribute because that hides the caret.)
    if (state.activeDoc?.locked) return;

    const result = await ime.onKeydown(event);

    if (result.type === "toggle" || result.type === "clear" || result.type === "composing") {
      renderImeState();
      return;
    }

    if (result.type === "commit") {
      stripGhostBuffer(inputEl, result.consumedBuffer);
      const text = inputEl.tagName === "INPUT" ? result.text.replace(/[\r\n]+/g, " ") : result.text;
      insertAtCursor(inputEl, text);
      renderImeState();
      setSaveStatus("未同步", state.authSignedIn ? { unsynced: true } : {});
      if (inputEl === editor) renderWordCount();
      onCommitSchedule();
      // RIME learns from this commit — throttled push of the user dict so
      // typing habits persist across devices.
      maybePushUserDict();
    }
  });

  inputEl.addEventListener("keyup", async (event) => {
    if (event.key !== "Shift") return;
    if (!shiftCleanPress) return;
    shiftCleanPress = false;
    const result = await ime.toggleAsciiMode();
    if (result.type === "commit") {
      stripGhostBuffer(inputEl, result.consumedBuffer);
      const text = inputEl.tagName === "INPUT" ? result.text.replace(/[\r\n]+/g, " ") : result.text;
      insertAtCursor(inputEl, text);
      setSaveStatus("未同步", state.authSignedIn ? { unsynced: true } : {});
      if (inputEl === editor) renderWordCount();
      onCommitSchedule();
    }
    renderImeState();
  });

  inputEl.addEventListener("blur", () => {
    shiftCleanPress = false;
  });

  inputEl.addEventListener("beforeinput", (event) => {
    if (!ime.isComposing()) return;
    if (event.inputType !== "insertText" || !event.data) return;
    if (/^[a-z0-9 ]$/i.test(event.data)) event.preventDefault();
  });
}

setupImeOn(editor, scheduleContentSave);
setupImeOn(titleInput, scheduleTitleSave);

// --- Voice input ---
//
// Two backends behind one button:
//  - Whisper (Groq default, OpenAI optional) when the user has saved a key in
//    OneDrive AppFolder/voice.json. Cloud STT, vendor-controlled, but stable.
//  - Web Speech API as the no-config fallback. Free, in-browser, but Chrome/
//    Edge backends have been flaky in 2026 — see commit log for details.
//
// Both expose the same surface (state / toggle / abort / notifyExternalInput)
// so the rest of the editor doesn't care which one is active.

const VOICE_CONFIG_FILENAME = "voice.json";

// In-memory copy of OneDrive voice.json. Loaded once after sign-in; refreshed
// by the user editing the form. Shape: { provider, groqKey, openaiKey, model }
let voiceConfig = null;

function pickSpeechLang() {
  const imeState = ime.getState();
  if (imeState.enabled && !imeState.asciiMode) return "zh-CN";
  return "en-US";
}

// "Resolved" provider — never returns undefined. If voice.json hasn't been
// written yet, default to Web Speech (it just works, no key needed).
function resolvedVoiceProvider(config) {
  const p = config?.provider;
  if (p === "webspeech" || p === "groq" || p === "openai") return p;
  return "webspeech";
}

const speechSession = isSpeechSupported()
  ? new SpeechSession({
      target: editor,
      onChange: onVoiceInsert,
      onState: onVoiceState,
    })
  : null;

const whisperSession = isWhisperSupported()
  ? new WhisperSession({
      target: editor,
      getConfig: () => voiceConfig,
      onChange: onVoiceInsert,
      onState: onVoiceState,
    })
  : null;

function activeVoiceBackend() {
  // Provider choice is explicit (settings → radio). 'webspeech' uses the
  // browser; 'groq'/'openai' use Whisper-via-fetch. Picking a Whisper provider
  // without a key is allowed — the session will surface 'missing-key' on tap.
  const provider = resolvedVoiceProvider(voiceConfig);
  if (provider === "webspeech") return speechSession;
  if (provider === "groq" || provider === "openai") return whisperSession;
  return null;
}

function backendIsUsable(backend) {
  if (!backend) return false;
  if (backend === whisperSession) {
    const provider = resolvedVoiceProvider(voiceConfig);
    return !!voiceConfig?.[`${provider}Key`];
  }
  return true; // Web Speech is always usable when supported.
}

function onVoiceInsert() {
  if (pttVerbose()) pttLog("ins", { tail: editor.value.slice(-30) });
  setSaveStatus("未同步", state.authSignedIn ? { unsynced: true } : {});
  renderWordCount();
  scheduleContentSave();
  // Dictation counts as activity — don't let the idle overlay pop up
  // mid-paragraph just because no key/pointer events landed.
  scheduleIdleOverlay();
}

function onVoiceState(next, error) {
  if (pttVerbose() || next === "error") {
    pttLog("st", { state: next, err: error?.message });
  }
  if (!micButton) return;
  micButton.setAttribute("data-state", next);
  if (next === "recording") {
    setSaveStatus("录音中…");
  } else if (next === "transcribing") {
    setSaveStatus("识别中…");
  } else if (next === "error" && error) {
    const raw = error.message ?? String(error);
    // Translate the most common machine-readable error to actionable Chinese
    // so the user knows to go fill in a key rather than retry blindly.
    const friendly = raw === "missing-key"
      ? "未填 API key（抽屉 → 语音 API）"
      : raw;
    setSaveStatus(`语音失败：${friendly}`, true);
  } else if (next === "idle") {
    // Don't smash a fresh status line if save scheduling already wrote one;
    // only restore the doc status when the bar is still showing our message.
    const txt = saveStatus.textContent;
    if (txt === "录音中…" || txt === "识别中…") {
      setSaveStatus(statusForDoc(state.activeDoc));
    }
  }
}

function renderMicVisibility() {
  if (!micButton) return;
  // Hidden cases (in order of severity):
  //  - no backend at all (Firefox without MediaRecorder + no Web Speech) → can't dictate
  //  - no active doc → nowhere to put the text
  //  - doc is locked → dictation would write past the lock
  const hidden =
    !activeVoiceBackend() ||
    !state.activeDoc ||
    !!state.activeDoc?.locked;
  micButton.hidden = hidden;
}

if (micButton) {
  micButton.addEventListener("click", () => {
    if (state.activeDoc?.locked) return;
    const backend = activeVoiceBackend();
    if (!backend) return;
    // Pending IME composition would inject extra text mid-dictation — clear it.
    if (ime.isComposing()) {
      ime.backend?.resetState?.();
      renderImeState();
    }
    editor.focus();
    backend.toggle(pickSpeechLang());
  });
}

editor.addEventListener("input", () => {
  speechSession?.notifyExternalInput();
  whisperSession?.notifyExternalInput();
});
editor.addEventListener("pointerdown", () => {
  // Caret moves on click — anchor would be stale, abort whichever is running.
  if (speechSession?.state === "listening") speechSession.abort();
  if (whisperSession?.state === "recording") whisperSession.abort();
});

// --- Voice config (Groq / OpenAI key, stored in OneDrive AppFolder) ---

function renderVoiceConfigForm() {
  if (!voiceConfigSection) return;
  const visible = state.authSignedIn;
  voiceConfigSection.hidden = !visible;
  if (!visible) return;

  const provider = resolvedVoiceProvider(voiceConfig);
  voiceProviderSelect.value = provider;
  renderVoiceConfigKeyField(provider);
  voiceVocabInput.value = voiceConfig?.vocab ?? "";
}

// Single key input that swaps placeholder/value based on the selected provider.
// All keys live in voiceConfig regardless of which is selected, so switching
// from Groq → OpenAI → Groq doesn't lose the original key.
function renderVoiceConfigKeyField(provider) {
  if (provider === "webspeech") {
    voiceKeyField.hidden = true;
    voiceVocabField.hidden = true; // Web Speech ignores vocab/prompt.
    return;
  }
  voiceKeyField.hidden = false;
  voiceVocabField.hidden = false;
  if (provider === "openai") {
    voiceKeyLabel.textContent = "OpenAI key";
    voiceKeyInput.placeholder = "sk-...";
    voiceKeyInput.value = voiceConfig?.openaiKey ?? "";
  } else {
    voiceKeyLabel.textContent = "Groq key";
    voiceKeyInput.placeholder = "gsk_...";
    voiceKeyInput.value = voiceConfig?.groqKey ?? "";
  }
}

async function loadVoiceConfig() {
  if (!state.authSignedIn) {
    voiceConfig = null;
    renderVoiceConfigForm();
    renderMicVisibility();
    return;
  }
  try {
    voiceConfig = await readJsonFromAppFolder(VOICE_CONFIG_FILENAME);
  } catch (error) {
    // Missing file is normal first-run; bubble surprises to console only.
    console.warn("loadVoiceConfig:", error);
    voiceConfig = null;
  }
  renderVoiceConfigForm();
  renderMicVisibility();
}

async function saveVoiceConfig() {
  if (!state.authSignedIn) return;
  const provider = voiceProviderSelect.value || "webspeech";
  // Preserve both keys: switching provider via the dropdown shouldn't wipe
  // the other backend's saved key. Only the currently-shown key is editable.
  const next = {
    provider,
    groqKey: voiceConfig?.groqKey ?? "",
    openaiKey: voiceConfig?.openaiKey ?? "",
    vocab: voiceVocabInput.value.trim(),
  };
  if (provider === "groq" || provider === "openai") {
    next[`${provider}Key`] = voiceKeyInput.value.trim();
  }
  voiceConfigSaveButton.disabled = true;
  const prevLabel = voiceConfigSaveButton.textContent;
  voiceConfigSaveButton.textContent = "保存中…";
  try {
    await writeJsonToAppFolder(VOICE_CONFIG_FILENAME, next);
    voiceConfig = next;
    renderVoiceConfigForm();
    renderMicVisibility();
    voiceConfigSaveButton.textContent = "已保存";
    setTimeout(() => {
      voiceConfigSaveButton.textContent = prevLabel;
      voiceConfigSaveButton.disabled = false;
    }, 1200);
  } catch (error) {
    setSaveStatus(`保存语音配置失败：${error.message ?? error}`, true);
    voiceConfigSaveButton.textContent = prevLabel;
    voiceConfigSaveButton.disabled = false;
  }
}

voiceConfigSaveButton?.addEventListener("click", () => {
  saveVoiceConfig().catch((err) => console.warn("saveVoiceConfig:", err));
});

voiceProviderSelect?.addEventListener("change", () => {
  renderVoiceConfigKeyField(voiceProviderSelect.value);
});

// Lock = block content-changing events, leave selection/navigation alone.
function blockIfLocked(event) {
  if (state.activeDoc?.locked) {
    event.preventDefault();
  }
}
for (const el of [editor, titleInput]) {
  el.addEventListener("beforeinput", blockIfLocked);
  el.addEventListener("paste", blockIfLocked);
  el.addEventListener("cut", blockIfLocked);
  el.addEventListener("drop", blockIfLocked);
}

editor.addEventListener("input", () => {
  // Stable dirty indicator from the very first keystroke until push lands.
  // Set both signed-in and signed-out cases — for signed-out, the next
  // IDB save (200ms) flips it back to "已保存" since there's no upload step.
  setSaveStatus("未同步", state.authSignedIn ? { unsynced: true } : {});
  renderWordCount();
  scheduleContentSave();
});

titleInput.addEventListener("input", () => {
  // Defensive: some browsers / paste paths can let CR/LF slip through and
  // make a type=text input visually expand. Strip them on every input.
  if (/[\r\n]/.test(titleInput.value)) {
    const cleaned = titleInput.value.replace(/[\r\n]+/g, " ");
    const cursor = titleInput.selectionStart;
    titleInput.value = cleaned;
    try {
      titleInput.selectionStart = titleInput.selectionEnd = Math.min(cursor ?? cleaned.length, cleaned.length);
    } catch {
      // ignore
    }
  }
  setSaveStatus("未同步", state.authSignedIn ? { unsynced: true } : {});
  scheduleTitleSave();
});

titleInput.addEventListener("paste", (event) => {
  // Some platforms paste raw multi-line text; sanitize before the value setter races.
  const text = event.clipboardData?.getData("text");
  if (text && /[\r\n]/.test(text)) {
    event.preventDefault();
    const sanitized = text.replace(/[\r\n]+/g, " ");
    insertAtCursor(titleInput, sanitized);
    scheduleTitleSave();
  }
});

// --- Drawer event wiring ---

menuButton.addEventListener("click", () => {
  if (state.drawerView === "closed") openDrawer("active");
  else closeDrawer();
});

drawerCloseButton.addEventListener("click", closeDrawer);
lockToggle?.addEventListener("click", () => {
  toggleLock().catch((err) => console.warn("toggleLock:", err));
});

imeStatus?.addEventListener("click", () => {
  toggleImeEnabled().catch((err) => console.warn("toggleImeEnabled:", err));
});

reloadButton?.addEventListener("click", async () => {
  await flushSaves();
  setSaveStatus("刷新中…");
  // Hard reload — wipes all in-memory state and re-runs the init sequence,
  // which is the simplest way to recover from any cross-device weirdness.
  location.reload();
});
drawerBackdrop.addEventListener("click", closeDrawer);
drawerBackButton.addEventListener("click", () => openDrawer("active"));
newDocButton.addEventListener("click", onNewDoc);
openTrashButton.addEventListener("click", () => openDrawer("trash"));
openSettingsButton?.addEventListener("click", () => openDrawer("settings"));
emptyTrashButton.addEventListener("click", onEmptyTrash);

document.addEventListener("keydown", async (event) => {
  if (event.key === "Escape" && state.drawerView !== "closed") {
    closeDrawer();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === "s" || event.key === "S")) {
    event.preventDefault();
    await flushSaves();
    saveStatus.classList.add("flash");
    setTimeout(() => saveStatus.classList.remove("flash"), 500);
    // Force-push now: cancel the pending heartbeat (if any) so it doesn't
    // double-fire after we just pushed.
    doPush();
  }
});

// --- Backtick-hold push-to-talk ---
//
// Hold ` (Backquote) in the editor for ≥250ms → start recording. Release →
// stop. Short tap (<250ms) inserts the appropriate char (` or ~) at the
// caret, routed through the IME so Rime's punctuation table still maps it
// to fullwidth Chinese when the IME is on (e.g. ~ → ～).
// Auto-repeat keydowns and IME-side handling are both suppressed by
// stopImmediatePropagation on the capture phase, so the held key produces
// neither a typed char nor a Rime commit until we decide what it meant.
// Uses start()/stop() (not toggle) so a session you began via the mic
// button isn't accidentally cancelled by an unrelated ` tap.

const PTT_HOLD_MS = 250;
const PTT_INPUT_GRACE_MS = 200; // suppress ` beforeinput for this long after keyup
let pttTimer = null;
let pttBackend = null;        // non-null while a PTT session is running
let pttActive = false;        // true once timer fired & PTT actually started
let pttPressedKey = "";       // captured event.key from the original keydown
let pttPressedShift = false;  // captured event.shiftKey from the original keydown
let pttSuppressInputUntil = 0; // see beforeinput listener below

function isBacktickKeyEvent(event) {
  // Quest's BT keyboard sometimes reports key but not the standard code,
  // so accept either. Modifiers are checked elsewhere.
  return event.code === "Backquote" || event.key === "`" || event.key === "~";
}

function isPttSuppressing() {
  return pttTimer !== null || pttActive || Date.now() < pttSuppressInputUntil;
}

// Quest's BT-keyboard input system runs the held ` key through an IME
// composition: every keydown adds another ` to the composition buffer, and
// when the user releases, compositionend fires which the textarea inserts
// via beforeinput inputType=insertCompositionText, data="``" / "```" / etc.
// My earlier `data === "`"` filter only matched single chars and missed
// this. Drop any beforeinput whose data is a run of ` / ~ regardless of
// inputType — the user has bound ` to PTT, so they have no reason to type
// a bare-` composition in the writing editor.
editor.addEventListener(
  "beforeinput",
  (event) => {
    if (typeof event.data !== "string" || event.data.length === 0) return;
    if (!/^[`~]+$/.test(event.data)) return;
    pttLog("bi-block", { inputType: event.inputType, data: event.data });
    event.preventDefault();
  },
  { capture: true },
);

// Legacy keypress: deprecated, but Quest's older Chromium variants still
// dispatch it for character keys and it's what classically inserts the char.
document.addEventListener(
  "keypress",
  (event) => {
    if (!isBacktickKeyEvent(event)) return;
    if (!isPttSuppressing()) return;
    console.debug("[ptt] keypress suppressed:", event.key, event.code);
    event.preventDefault();
    event.stopImmediatePropagation();
  },
  { capture: true },
);

document.addEventListener(
  "keydown",
  (event) => {
    if (!isBacktickKeyEvent(event)) return;
    if (document.activeElement !== editor) return;
    if (state.activeDoc?.locked) return;
    // Stop the textarea's native insert AND the setupImeOn keydown listener
    // (which would otherwise route ~ through Rime as ～ on every repeat).
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return; // already swallowed; nothing else to do.
    pttPressedKey = event.key;
    pttPressedShift = !!event.shiftKey;
    pttActive = false;
    if (pttTimer) clearTimeout(pttTimer);
    pttTimer = setTimeout(() => {
      pttTimer = null;
      const backend = activeVoiceBackend();
      if (!backend) return;
      // Don't yank a session the user already started via the mic button.
      if (backend.state !== "idle") return;
      pttActive = true;
      backend.start(pickSpeechLang());
      pttBackend = backend;
    }, PTT_HOLD_MS);
  },
  { capture: true },
);

document.addEventListener(
  "keyup",
  (event) => {
    // Normal case: clean Backquote / ` / ~ keyup.
    let matched = isBacktickKeyEvent(event);
    // Quest IME path: when the held key was eaten by composition, keyup
    // arrives as code="" key="Unidentified". If we're in the middle of a
    // PTT session that we know we started, treat that as our release.
    if (!matched && (pttActive || pttTimer) && event.key === "Unidentified") {
      matched = true;
      pttLog("ku-unid", { code: event.code, key: event.key });
    }
    if (!matched) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (pttTimer) {
      // Short tap — never reached the hold threshold. Emit the char that
      // would have appeared if we hadn't intercepted, by feeding the IME
      // a synthesized keydown so Rime gets its chance to map ~ → ～.
      clearTimeout(pttTimer);
      pttTimer = null;
      if (!state.activeDoc?.locked) {
        feedSyntheticPunctuation(pttPressedKey, pttPressedShift);
      }
      return;
    }
    if (pttActive && pttBackend) {
      pttBackend.stop();
      pttBackend = null;
      pttActive = false;
    }
    // The browser may emit a deferred beforeinput right after keyup; the
    // suppression flag above only checks pttActive/pttTimer (now both
    // cleared), so extend the window for a short grace period.
    pttSuppressInputUntil = Date.now() + PTT_INPUT_GRACE_MS;
  },
  { capture: true },
);

// Synthesize a keydown for the IME, then mirror the commit / passthrough
// handling that setupImeOn does for real events.
async function feedSyntheticPunctuation(key, shiftKey) {
  const synth = {
    key,
    code: "Backquote",
    shiftKey,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    preventDefault() {},
  };
  let result;
  try {
    result = await ime.onKeydown(synth);
  } catch (err) {
    console.warn("[ptt] ime.onKeydown:", err);
    insertAtCursor(editor, key);
    onVoiceInsert();
    return;
  }
  if (
    result.type === "toggle" ||
    result.type === "clear" ||
    result.type === "composing"
  ) {
    renderImeState();
    return;
  }
  if (result.type === "commit") {
    stripGhostBuffer(editor, result.consumedBuffer);
    insertAtCursor(editor, result.text);
    renderImeState();
    onVoiceInsert();
    maybePushUserDict();
    return;
  }
  // Passthrough — IME didn't claim the key. Insert literal char.
  insertAtCursor(editor, key);
  onVoiceInsert();
}

// Quest waking from standby, network reconnect, or tab regaining focus —
// good moments to ask OneDrive if the active doc changed under us.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    checkActiveDocFreshness().catch(() => {});
  } else {
    // Tab going to background — flush DOM → IDB and push dirty content
    // NOW, before browsers throttle timers (which may delay the 30s
    // heartbeat or idle overlay arbitrarily).
    pushOnTabHidden().catch(() => {});
  }
});

async function pushOnTabHidden() {
  if (!state.authSignedIn || !state.activeDocId) return;
  // 1) Force-flush any pending DOM → IDB before pushing.
  if (state.activeDoc) {
    const editorDivergent = editor.value !== (state.activeDoc.content ?? "");
    const titleDivergent = titleInput.value !== (state.activeDoc.title ?? "");
    if (editorDivergent || titleDivergent) {
      if (contentSaveTimer) { clearTimeout(contentSaveTimer); contentSaveTimer = null; }
      if (titleSaveTimer) { clearTimeout(titleSaveTimer); titleSaveTimer = null; }
      try {
        const updated = await updateDoc(state.activeDocId, {
          content: editor.value,
          title: titleInput.value,
        });
        state.activeDoc = updated;
      } catch (err) {
        console.warn("flush on hidden:", err);
      }
    }
  }
  // 2) If dirty, push. Browsers allow in-flight fetch to continue while
  // tab is hidden (only setTimeout / setInterval are throttled).
  const fresh = await getDoc(state.activeDocId);
  if (fresh?.dirty) {
    await doPush();
  }
}
window.addEventListener("focus", () => {
  checkActiveDocFreshness().catch(() => {});
});
window.addEventListener("online", () => {
  setSaveStatus(`已联网 ${formatTime(Date.now())}`);
  checkActiveDocFreshness().catch(() => {});
  // Drain any dirty docs that piled up while offline.
  drainDirtyDocs().catch((err) => console.warn("drain:", err));
});

// Idle overlay — after N minutes of no input, dim the page and require the
// user to click before continuing. Forces a fresh sync on resume so they
// never type onto stale content. The timer is local (no network until the
// user actually clicks to dismiss), so it's cheap on Quest battery.
const IDLE_OVERLAY_MS = 2 * 60 * 1000; // 2 minutes — tweak here
const idleOverlay = document.querySelector("#idleOverlay");
let idleOverlayTimer = null;
let idleOverlayShown = false;

function scheduleIdleOverlay() {
  if (idleOverlayTimer) clearTimeout(idleOverlayTimer);
  idleOverlayTimer = setTimeout(showIdleOverlay, IDLE_OVERLAY_MS);
}

function showIdleOverlay() {
  if (idleOverlayShown) return;
  idleOverlayShown = true;
  idleOverlay?.classList.remove("hidden");
  // Defocus the editor so any racing keystroke goes nowhere visible.
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }
  // Kill any in-progress dictation — the overlay implies the user stepped
  // away, and we don't want the engine to keep transcribing ambient audio.
  if (speechSession?.state === "listening") speechSession.abort();
  // Lock-time is the safe moment to push: the user clearly stopped, and
  // if they never come back (closed Quest, walked away for the day), this
  // is the last chance to make sure their dirty content reaches OneDrive.
  // doPush + dict + last-active fire as fire-and-forget; the overlay
  // hides whatever the status bar shows anyway.
  if (state.authSignedIn) {
    doPush().catch(() => {});
    flushUserDictNow().catch(() => {});
    if (state.activeDoc?.onedriveItemId) {
      pushLastActiveItemId(state.activeDoc.onedriveItemId).catch(() => {});
    }
  }
}

async function dismissIdleOverlay() {
  if (!idleOverlayShown) return;
  idleOverlayShown = false;
  idleOverlay?.classList.add("hidden");
  scheduleIdleOverlay();
  if (state.authSignedIn) {
    try {
      setSaveStatus("同步中…");
      // Lock-time (showIdleOverlay) already pushed dirty content + dict +
      // last-active. Dismiss is purely for the PULL side — see what other
      // devices changed while we were idle.
      await checkActiveDocFreshness();
      await drainDirtyDocs(); // catches any push retries left over from lock-time
      await mergeRemoteList();
      if (state.drawerView !== "closed") {
        await renderDocList();
      }
      startBackgroundPrefetch();
    } catch (err) {
      console.warn("idle resume sync:", err);
    }
    // Reflect the now-current active doc state in the status bar (not
    // "同步中…" forever).
    const fresh = state.activeDocId ? await getDoc(state.activeDocId) : null;
    if (fresh) state.activeDoc = fresh;
    setSaveStatus(statusForDoc(state.activeDoc));
  }
  // Restore focus to the editor so the user can continue typing immediately.
  editor.focus();
}

function onAnyActivity(event) {
  if (idleOverlayShown) {
    // Eat the input — don't let the keystroke land in the editor on top of
    // the still-stale content. Dismiss kicks off the fresh sync.
    if (event?.cancelable) event.preventDefault();
    event?.stopPropagation?.();
    dismissIdleOverlay();
    return;
  }
  scheduleIdleOverlay();
}

document.addEventListener("keydown", onAnyActivity, { capture: true });
document.addEventListener("pointerdown", onAnyActivity, { capture: true });
document.addEventListener("touchstart", onAnyActivity, { capture: true, passive: true });
document.addEventListener(
  "scroll",
  () => {
    if (!idleOverlayShown) scheduleIdleOverlay();
  },
  { passive: true, capture: true },
);

// Initial schedule
scheduleIdleOverlay();

// RIME user dict throttle: every IME commit may have taught RIME a new
// word, but uploading the entire user-data tree on every commit is wasteful.
// On commit we check elapsed time and only push if INTERVAL has passed —
// "event-driven throttle". On idle-dismiss / unload we flush unconditionally.
const USER_DICT_PUSH_INTERVAL_MS = 2 * 60 * 1000;
let lastUserDictPushAt = 0;
let userDictPushInFlight = false;

async function maybePushUserDict() {
  if (!state.authSignedIn) return;
  const now = Date.now();
  if (now - lastUserDictPushAt < USER_DICT_PUSH_INTERVAL_MS) return;
  if (userDictPushInFlight) return;
  lastUserDictPushAt = now;
  userDictPushInFlight = true;
  try {
    await pushUserDict(ime);
  } catch (error) {
    console.warn("maybe push user dict:", error);
  } finally {
    userDictPushInFlight = false;
  }
}

async function flushUserDictNow() {
  if (!state.authSignedIn) return;
  if (userDictPushInFlight) return;
  userDictPushInFlight = true;
  try {
    await pushUserDict(ime);
    lastUserDictPushAt = Date.now();
  } catch (error) {
    console.warn("flush user dict:", error);
  } finally {
    userDictPushInFlight = false;
  }
}

async function drainDirtyDocs() {
  if (!state.authSignedIn) return;
  const docs = await listDocs({ includeTrashed: true });
  const dirty = docs.filter((d) => d.dirty);
  for (const d of dirty) {
    try {
      await pushDoc(d.id);
    } catch (error) {
      console.warn(`push ${d.id} failed:`, error);
    }
  }
  // Refresh active doc state if it was in the dirty set.
  const fresh = state.activeDocId ? await getDoc(state.activeDocId) : null;
  if (fresh) {
    state.activeDoc = fresh;
    renderGhostBanner();
  }
}

ghostTrashButton?.addEventListener("click", async () => {
  if (!state.activeDocId) return;
  if (!confirm("把这个文件从本地清除？（不会影响 OneDrive，因为云端已经没有了。）")) return;
  await purgeDoc(state.activeDocId);
  await pickNextActive();
  renderEditor();
  setSaveStatus(`已清除 ${formatTime(Date.now())}`);
});

ghostReuploadButton?.addEventListener("click", async () => {
  if (!state.activeDocId) return;
  try {
    setSaveStatus("正在重新上传…");
    await reuploadGhostAsNew(state.activeDocId);
    const fresh = await getDoc(state.activeDocId);
    if (fresh) {
      state.activeDoc = fresh;
      renderGhostBanner();
    }
    setSaveStatus(`已重新上传 ${formatTime(Date.now())}`);
  } catch (error) {
    setSaveStatus(`重新上传失败：${error.message ?? error}`, true);
  }
});

window.addEventListener("beforeunload", () => {
  // Best-effort sync flush; IndexedDB writes are async so we can't fully guarantee here,
  // but cancelling timers prevents stale fires after the page is torn down.
  if (contentSaveTimer) clearTimeout(contentSaveTimer);
  if (titleSaveTimer) clearTimeout(titleSaveTimer);
  // Fire-and-forget user dict push. Browsers limit network during unload
  // so this is unlikely to complete, but it's free to try and might catch
  // a recent learning before tab close.
  flushUserDictNow().catch(() => {});
  if (state.authSignedIn && state.activeDoc?.onedriveItemId) {
    pushLastActiveItemId(state.activeDoc.onedriveItemId).catch(() => {});
  }
  // Last-ditch DOC push via keepalive fetch — survives the unload that
  // would otherwise abort an ordinary fetch. The body cap is 64KB which
  // covers any reasonable .txt chapter.
  if (
    state.authSignedIn &&
    state.activeDocId &&
    state.activeDoc?.onedriveItemId &&
    editor.value !== (state.activeDoc.content ?? "")
  ) {
    updateItemContentKeepalive(
      state.activeDoc.onedriveItemId,
      editor.value,
      state.activeDoc.etag ?? undefined,
    ).catch(() => {});
  }
});

// --- Initialize ---

async function initialize() {
  // Render the auth row immediately as not-signed-in; the actual MSAL probe
  // runs in the background so it never blocks first paint of the editor.
  renderAuthRow();
  initializeAuthFlow();

  // IME defaults to OFF — most platforms have a native Chinese IME and our
  // RIME would just get in the way. Quest users manually flip it on once
  // (status bar click) and the choice persists per-device via IDB.
  const imePref = await getSetting("imeEnabled");
  if (imePref === true) {
    await ime.initialize();
    imeInitialized = true;
    ime.enabled = true;
  } else {
    ime.enabled = false;
  }

  try {
    await cleanupAutoEmptyDocs();
    await ensureActiveDoc();
    renderEditor();
    setSaveStatus(statusForDoc(state.activeDoc));
  } catch (error) {
    setSaveStatus(`恢复失败：${error.message ?? error}`, true);
  }

  const imeState = ime.getState();
  if (imeState.initializeError) {
    setSaveStatus(`输入法以降级模式运行：${imeState.initializeError}`, true);
  }

  renderImeState();
  editor.focus();
}

// --- Update toast (new version available) ---

const updateToast = document.querySelector("#updateToast");
const updateReloadButton = document.querySelector("#updateReloadButton");
const updateDismissButton = document.querySelector("#updateDismissButton");

let updateAvailable = false;
let updateDismissed = false;

function showUpdateToast() {
  if (updateDismissed) return;
  if (!updateToast) return;
  updateToast.classList.remove("hidden");
}

function hideUpdateToast() {
  updateToast?.classList.add("hidden");
}

updateReloadButton?.addEventListener("click", () => {
  navigator.serviceWorker?.controller?.postMessage({ type: "skip-waiting" });
  location.reload();
});

updateDismissButton?.addEventListener("click", () => {
  updateDismissed = true;
  hideUpdateToast();
});

// Register the service worker only outside of local dev so F5 keeps working
// as a normal reload while editing code on the PC. Quest (and any non-local
// hostname) gets the PWA: precaches the app shell + vendor for offline.
const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1", ""]);
if ("serviceWorker" in navigator && !LOCAL_DEV_HOSTS.has(location.hostname)) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "asset-updated") {
      updateAvailable = true;
      showUpdateToast();
    }
  });

  window.addEventListener("load", async () => {
    let registration;
    try {
      registration = await navigator.serviceWorker.register("./service-worker.js");
    } catch (error) {
      console.warn("SW registration failed:", error);
      return;
    }

    if (registration.waiting && navigator.serviceWorker.controller) {
      updateAvailable = true;
      showUpdateToast();
    }

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          updateAvailable = true;
          showUpdateToast();
        }
      });
    });
  });
}

// Surface any uncaught JS error in the status bar so problems are visible
// on devices without a DevTools connection (e.g. Quest standalone). Console
// still gets the full trace for remote debugging.
window.addEventListener("error", (event) => {
  console.error("[app] uncaught error:", event.error || event.message, event);
  try {
    setSaveStatus(`JS 错误: ${(event.message || "").slice(0, 80)}`, true);
  } catch { /* status bar may not be ready */ }
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[app] unhandled rejection:", event.reason);
  try {
    const msg = (event.reason?.message ?? String(event.reason ?? "")).slice(0, 80);
    setSaveStatus(`Promise 错误: ${msg}`, true);
  } catch { /* status bar may not be ready */ }
});

initialize();
