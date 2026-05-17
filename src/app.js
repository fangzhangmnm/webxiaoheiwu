import {
  listDocs,
  getDoc,
  createDoc,
  updateDoc,
  trashDoc,
  restoreDoc,
  purgeDoc,
  getActiveDocId,
  setActiveDocId,
  applySyncPatch,
  getSetting,
  setSetting,
} from "./db.js";
import { NaturalCodeIMEAdapter } from "./ime.js";
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
  purgeDocPermanent,
  reuploadGhostAsNew,
  pushUserDict,
  pullUserDict,
  pushLastActiveItemId,
  pullLastActiveItemId,
} from "./sync.js";
import { updateItemContentKeepalive } from "./onedrive.js";

const editor = document.querySelector("#editor");
const titleInput = document.querySelector("#titleInput");
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
  // Always show both counters — user wants to track each writing surface
  // (Chinese characters vs. English words) independently, including 0.
  wordCount.textContent = `${cjk} 字 · ${en} 词`;
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
  if (view === "active") {
    drawerTitle.textContent = "文件";
    drawerBackButton.hidden = true;
    drawerActions.classList.remove("hidden");
    trashActions.classList.add("hidden");
  } else {
    drawerTitle.textContent = "垃圾箱";
    drawerBackButton.hidden = false;
    drawerActions.classList.add("hidden");
    trashActions.classList.remove("hidden");
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

async function onTrashDoc(id) {
  await flushSaves();
  if (state.authSignedIn) {
    try {
      await moveDocToTrash(id);
    } catch (error) {
      setSaveStatus(`移到回收站失败：${error.message ?? error}`, true);
    }
  } else {
    await trashDoc(id);
  }
  if (id === state.activeDocId) {
    await pickNextActive();
  }
  await renderDocList();
}

async function onRestoreDoc(id) {
  if (state.authSignedIn) {
    try {
      await restoreDocFromTrash(id);
    } catch (error) {
      setSaveStatus(`恢复失败：${error.message ?? error}`, true);
    }
  } else {
    await restoreDoc(id);
  }
  await renderDocList();
}

async function onPurgeDoc(id) {
  if (!confirm("此文件将永久删除，无法恢复。继续吗？")) return;
  if (state.authSignedIn) {
    try {
      await purgeDocPermanent(id);
    } catch (error) {
      setSaveStatus(`删除失败：${error.message ?? error}`, true);
    }
  } else {
    await purgeDoc(id);
  }
  await renderDocList();
}

async function onEmptyTrash() {
  const trashed = (await listDocs({ includeTrashed: true })).filter((d) => d.deletedAt);
  if (trashed.length === 0) return;
  if (!confirm(`将永久删除 ${trashed.length} 个文件，无法恢复。继续吗？`)) return;
  for (const d of trashed) {
    if (state.authSignedIn) {
      try {
        await purgeDocPermanent(d.id);
      } catch (error) {
        console.warn(`purge ${d.id} failed:`, error);
      }
    } else {
      await purgeDoc(d.id);
    }
  }
  await renderDocList();
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
    renderAuthRow();
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
  if (state.authSignedIn) {
    // Don't block the editor on the network. Let it idle a moment so the
    // initial render is instant, then sync the active doc + start the merge.
    setTimeout(() => {
      checkActiveDocFreshness().catch(() => {});
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

initialize();
