import { loadActiveDocument, saveActiveDocument } from "./db.js";
import { NaturalCodeIMEAdapter } from "./ime.js";

const editor = document.querySelector("#editor");
const saveStatus = document.querySelector("#saveStatus");
const imeStatus = document.querySelector("#imeStatus");
const candidateBar = document.querySelector("#candidateBar");

const ime = new NaturalCodeIMEAdapter();

let saveTimer = null;

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function setSaveStatus(message, isError = false) {
  saveStatus.textContent = message;
  saveStatus.style.color = isError ? "#8a1f11" : "#245f2e";
}

function renderImeState() {
  const state = ime.getState();
  const engineLabel =
    state.engine === "rime-double_pinyin" ? "Natural Code (RIME)" : "Natural Code (Starter Fallback)";
  const modeLabel = state.asciiMode ? "EN" : "中";
  imeStatus.textContent = `IME: ${state.enabled ? `${engineLabel} · ${modeLabel}` : "Off"}`;

  if (!state.enabled || state.buffer.length === 0) {
    candidateBar.classList.add("hidden");
    candidateBar.innerHTML = "";
    return;
  }

  candidateBar.classList.remove("hidden");
  const buffer = `<span class="buffer-chip">${state.buffer}</span>`;
  const candidates = state.candidates
    .slice(0, 9)
    .map((word, idx) => `<span class="candidate-chip"><span class="index">${idx + 1}</span>${word}</span>`)
    .join("");

  candidateBar.innerHTML = `${buffer}${candidates}`;
}

function insertAtCursor(target, text) {
  const start = target.selectionStart;
  const end = target.selectionEnd;
  const before = target.value.slice(0, start);
  const after = target.value.slice(end);

  target.value = `${before}${text}${after}`;
  const nextPos = start + text.length;
  target.selectionStart = nextPos;
  target.selectionEnd = nextPos;
}

function stripGhostBuffer(target, consumedBuffer) {
  if (!consumedBuffer) {
    return;
  }

  const start = target.selectionStart;
  const end = target.selectionEnd;

  if (start !== end || start < consumedBuffer.length) {
    return;
  }

  const before = target.value.slice(0, start);
  if (!before.endsWith(consumedBuffer)) {
    return;
  }

  const after = target.value.slice(end);
  const nextBefore = before.slice(0, before.length - consumedBuffer.length);
  const nextPos = nextBefore.length;

  target.value = `${nextBefore}${after}`;
  target.selectionStart = nextPos;
  target.selectionEnd = nextPos;
}

function scheduleSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  saveTimer = setTimeout(async () => {
    try {
      await saveActiveDocument(editor.value);
      setSaveStatus(`Saved ${formatTime(Date.now())}`);
    } catch (error) {
      setSaveStatus(`Save failed: ${error instanceof Error ? error.message : "Unknown error"}`, true);
    }
  }, 180);
}

let shiftCleanPress = false;

editor.addEventListener("keydown", async (event) => {
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
    stripGhostBuffer(editor, result.consumedBuffer);
    insertAtCursor(editor, result.text);
    renderImeState();
    scheduleSave();
  }
});

editor.addEventListener("keyup", async (event) => {
  if (event.key !== "Shift") {
    return;
  }
  if (!shiftCleanPress) {
    return;
  }
  shiftCleanPress = false;
  const result = await ime.toggleAsciiMode();
  if (result.type === "commit") {
    stripGhostBuffer(editor, result.consumedBuffer);
    insertAtCursor(editor, result.text);
    scheduleSave();
  }
  renderImeState();
});

editor.addEventListener("blur", () => {
  shiftCleanPress = false;
});

editor.addEventListener("beforeinput", (event) => {
  if (!ime.isComposing()) {
    return;
  }

  if (event.inputType !== "insertText" || !event.data) {
    return;
  }

  if (/^[a-z0-9 ]$/i.test(event.data)) {
    event.preventDefault();
  }
});

editor.addEventListener("input", () => {
  scheduleSave();
});

window.addEventListener("beforeunload", () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
});

async function initialize() {
  await ime.initialize();

  try {
    const content = await loadActiveDocument();
    editor.value = content;
    setSaveStatus(content ? `Recovered ${formatTime(Date.now())}` : "Ready");
  } catch (error) {
    setSaveStatus(`Recovery failed: ${error instanceof Error ? error.message : "Unknown error"}`, true);
  }

  const imeState = ime.getState();
  if (imeState.initializeError) {
    setSaveStatus(`RIME unavailable, fallback active: ${imeState.initializeError}`, true);
  }

  renderImeState();
  editor.focus();
}

initialize();
