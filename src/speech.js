// Web Speech API wrapper for the editor.
//
// Design (per design discussion 2026-05-19):
//  - Tap mic to start; tap again or 2.5s silence to stop.
//  - Language passed in at start (caller derives from IME state).
//  - Interim text streams into the textarea at the saved cursor anchor;
//    on each onresult we rewrite the whole [anchorStart, anchorEnd) range
//    so the visible text matches whatever the engine currently thinks.
//  - User typing/pasting/clicking elsewhere stops the session — anything
//    that mutates the textarea behind our back would invalidate the anchor.

import { chineseifyPunctuation } from "./zh-punct.js";

// Two-phase silence timer:
//  - INITIAL_GRACE: from "mic captures audio" until the user actually starts
//    talking. Generous, because tapping the button and opening one's mouth
//    takes a beat — and on the very first session the browser shows a perm
//    prompt, which only resolves AFTER the user clicks Allow; we don't want
//    to time out while the prompt is up.
//  - SILENCE_TIMEOUT: mid-utterance gap that means "I'm done." Short, so the
//    user doesn't have to manually tap the mic to end a dictation.
const INITIAL_GRACE_MS = 8000;
const SILENCE_TIMEOUT_MS = 1000;

export function isSpeechSupported() {
  return typeof window !== "undefined"
    && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export class SpeechSession {
  constructor({ target, onChange, onState }) {
    this.target = target;
    this.onChange = onChange;
    this.onState = onState;
    this.state = "idle"; // 'idle' | 'listening' | 'error'
    this.recognition = null;
    this.silenceTimer = null;
    this.injecting = false;
    this.anchorStart = 0;
    this.anchorEnd = 0;
  }

  toggle(lang) {
    // 'error' is treated the same as 'idle' — otherwise a one-off network or
    // permission failure leaves the button permanently stuck in stop-mode.
    if (this.state === "listening") {
      this.stop();
    } else {
      this.start(lang);
    }
  }

  start(lang) {
    // Only block when actually listening — 'error' must restart freely or a
    // single transient failure (e.g. flaky Edge/Azure speech backend) locks
    // the button forever. Defensively tear down any zombie recognizer first.
    if (this.state === "listening") return;
    if (this.recognition) {
      try { this.recognition.abort(); } catch { /* ignore */ }
      this.recognition = null;
    }
    this._clearTimer();

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      this._setState("error", new Error("not-supported"));
      return;
    }

    const r = new Ctor();
    r.lang = lang || "zh-CN";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onresult = (event) => {
      // Walk all results; later ones (final or interim) replace what's there.
      // Web Speech keeps appending to event.results across the session, so the
      // full transcript-so-far is the concatenation of all transcripts.
      let text = "";
      for (let i = 0; i < event.results.length; i += 1) {
        text += event.results[i][0].transcript;
      }
      if (r.lang && r.lang.startsWith("zh")) {
        text = chineseifyPunctuation(text);
      }
      this._replaceAnchor(text);
      this._armTimer(SILENCE_TIMEOUT_MS);
    };

    r.onerror = (event) => {
      console.warn("[speech] onerror:", event.error, event);
      this._clearTimer();
      this.recognition = null;
      // 'no-speech' / 'aborted' are routine; don't surface as red errors.
      if (event.error === "no-speech" || event.error === "aborted") {
        this._setState("idle");
        return;
      }
      this._setState("error", new Error(event.error || "speech-error"));
    };

    r.onend = () => {
      console.debug("[speech] onend");
      this._clearTimer();
      this.recognition = null;
      if (this.state !== "error") this._setState("idle");
    };

    r.onstart = () => {
      console.debug("[speech] onstart, lang=", r.lang);
    };
    r.onaudiostart = () => {
      // Engine has the mic — start the "waiting for first words" timer.
      console.debug("[speech] onaudiostart");
      this._armTimer(INITIAL_GRACE_MS);
    };
    r.onspeechstart = () => {
      console.debug("[speech] onspeechstart");
    };

    this.recognition = r;
    const caret = this.target.selectionStart ?? this.target.value.length;
    this.anchorStart = caret;
    this.anchorEnd = caret;

    try {
      r.start();
      // Visual feedback immediately, but the silence timer doesn't arm until
      // onaudiostart — otherwise it counts down while the perm prompt is up.
      this._setState("listening");
    } catch (err) {
      this.recognition = null;
      this._setState("error", err);
    }
  }

  stop() {
    this._clearTimer();
    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* ignore */ }
    }
  }

  abort() {
    this._clearTimer();
    if (this.recognition) {
      try { this.recognition.abort(); } catch { /* ignore */ }
    }
  }

  // Caller invokes this from the textarea's input listener. If a non-self
  // mutation hit the textarea, our offsets are stale — bail out safely.
  notifyExternalInput() {
    if (this.injecting) return;
    if (this.state === "listening") {
      this.abort();
    }
  }

  _setState(next, error) {
    this.state = next;
    this.onState?.(next, error);
  }

  _replaceAnchor(text) {
    const t = this.target;
    // Defensive: if the textarea value got shorter than our anchor (user
    // somehow cleared content despite notifyExternalInput stopping us), bail.
    if (this.anchorEnd > t.value.length || this.anchorStart > t.value.length) {
      this.abort();
      return;
    }
    this.injecting = true;
    try {
      const before = t.value.slice(0, this.anchorStart);
      const after = t.value.slice(this.anchorEnd);
      t.value = `${before}${text}${after}`;
      this.anchorEnd = this.anchorStart + text.length;
      try {
        t.selectionStart = t.selectionEnd = this.anchorEnd;
      } catch { /* some inputs reject this */ }
      this.onChange?.();
    } finally {
      this.injecting = false;
    }
  }

  _armTimer(ms) {
    this._clearTimer();
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      this.stop();
    }, ms);
  }

  _clearTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}
