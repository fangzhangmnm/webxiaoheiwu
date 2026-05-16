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
} from "./db.js";
import { NaturalCodeIMEAdapter } from "./ime.js";
import {
  initializeAuth,
  signIn,
  signOut,
  getActiveAccount,
} from "./auth.js";

const editor = document.querySelector("#editor");
const titleInput = document.querySelector("#titleInput");
const saveStatus = document.querySelector("#saveStatus");
const imeStatus = document.querySelector("#imeStatus");
const candidateBar = document.querySelector("#candidateBar");

const menuButton = document.querySelector("#menuButton");
const drawer = document.querySelector("#drawer");
const drawerBackdrop = document.querySelector("#drawerBackdrop");
const drawerCloseButton = document.querySelector("#drawerCloseButton");
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
let shiftCleanPress = false;

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

function computeDisplayName(doc, siblings) {
  const dateStr = formatDate(doc.createdAt);
  const sameDay = siblings.filter((d) => formatDate(d.createdAt) === dateStr);

  if (doc.title) {
    const sameDaySameTitle = sameDay
      .filter((d) => d.title === doc.title)
      .sort((a, b) => a.createdAt - b.createdAt);
    const idx = sameDaySameTitle.findIndex((d) => d.id === doc.id);
    return idx <= 0
      ? `${dateStr} ${doc.title}`
      : `${dateStr} ${doc.title} ${idx}`;
  }

  const untitledSameDay = sameDay
    .filter((d) => !d.title)
    .sort((a, b) => a.createdAt - b.createdAt);
  const idx = untitledSameDay.findIndex((d) => d.id === doc.id);
  return idx <= 0 ? dateStr : `${dateStr} ${idx}`;
}

function setSaveStatus(message, isError = false) {
  saveStatus.textContent = message;
  saveStatus.classList.toggle("error", isError);
}

function renderImeState() {
  const imeState = ime.getState();
  const engineLabel =
    imeState.engine === "rime-double_pinyin"
      ? "Natural Code"
      : "Natural Code (fallback)";
  const modeLabel = imeState.asciiMode ? "EN" : "中";
  imeStatus.textContent = imeState.enabled
    ? `${engineLabel} · ${modeLabel}`
    : "输入法停用";

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
  if (contentSaveTimer) {
    clearTimeout(contentSaveTimer);
    contentSaveTimer = null;
  }
  if (titleSaveTimer) {
    clearTimeout(titleSaveTimer);
    titleSaveTimer = null;
  }
  if (!state.activeDocId) return;
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
      setSaveStatus(`已保存 ${formatTime(Date.now())}`);
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
      setSaveStatus(`已保存 ${formatTime(Date.now())}`);
    } catch (error) {
      setSaveStatus(`保存失败：${error.message ?? error}`, true);
    }
  }, 250);
}

function renderEditor() {
  if (!state.activeDoc) {
    editor.value = "";
    titleInput.value = "";
    return;
  }
  editor.value = state.activeDoc.content ?? "";
  titleInput.value = state.activeDoc.title ?? "";
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
}

function closeDrawer() {
  state.drawerView = "closed";
  drawer.classList.add("hidden");
  drawer.setAttribute("aria-hidden", "true");
  drawerBackdrop.classList.add("hidden");
  editor.focus();
}

async function renderDocList() {
  const all = await listDocs({ includeTrashed: true });
  const isTrashView = state.drawerView === "trash";
  const filtered = isTrashView
    ? all.filter((d) => d.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt)
    : all.filter((d) => !d.deletedAt).sort((a, b) => b.modifiedAt - a.modifiedAt);

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
    nameSpan.className = doc.title ? "doc-name" : "doc-name untitled";
    nameSpan.textContent = computeDisplayName(doc, all);
    mainBtn.appendChild(nameSpan);

    const previewSpan = document.createElement("span");
    previewSpan.className = "doc-preview";
    const previewText = (doc.content ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    previewSpan.textContent = previewText || "（空白）";
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
  await trashDoc(id);
  if (id === state.activeDocId) {
    await pickNextActive();
  }
  await renderDocList();
}

async function onRestoreDoc(id) {
  await restoreDoc(id);
  await renderDocList();
}

async function onPurgeDoc(id) {
  if (!confirm("此文件将永久删除，无法恢复。继续吗？")) return;
  await purgeDoc(id);
  await renderDocList();
}

async function onEmptyTrash() {
  const trashed = (await listDocs({ includeTrashed: true })).filter((d) => d.deletedAt);
  if (trashed.length === 0) return;
  if (!confirm(`将永久删除 ${trashed.length} 个文件，无法恢复。继续吗？`)) return;
  for (const d of trashed) {
    await purgeDoc(d.id);
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
}

// --- IME wiring for editor + title input ---

function setupImeOn(inputEl, onCommitSchedule) {
  inputEl.addEventListener("keydown", async (event) => {
    if (event.key === "Shift") {
      if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.repeat) {
        shiftCleanPress = true;
      }
      return;
    }
    shiftCleanPress = false;

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
      onCommitSchedule();
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

editor.addEventListener("input", () => {
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
    setSaveStatus(`已保存 ${formatTime(Date.now())}`);
    saveStatus.classList.add("flash");
    setTimeout(() => saveStatus.classList.remove("flash"), 500);
  }
});

window.addEventListener("beforeunload", () => {
  // Best-effort sync flush; IndexedDB writes are async so we can't fully guarantee here,
  // but cancelling timers prevents stale fires after the page is torn down.
  if (contentSaveTimer) clearTimeout(contentSaveTimer);
  if (titleSaveTimer) clearTimeout(titleSaveTimer);
});

// --- Initialize ---

async function initialize() {
  // Render the auth row immediately as not-signed-in; the actual MSAL probe
  // runs in the background so it never blocks first paint of the editor.
  renderAuthRow();
  initializeAuthFlow();

  await ime.initialize();

  try {
    await ensureActiveDoc();
    renderEditor();
    if (state.activeDoc?.content) {
      setSaveStatus(`已恢复 ${formatTime(Date.now())}`);
    } else {
      setSaveStatus("就绪");
    }
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
