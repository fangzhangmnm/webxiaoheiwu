import { chineseifyPunctuation } from "./zh-punct.js";

// Whisper-style speech-to-text via a user-supplied API key (Groq or OpenAI).
//
// External shape matches SpeechSession (Web Speech) so app.js can pick one
// at toggle time without diverging the wiring:
//   .state ('idle' | 'recording' | 'transcribing' | 'error')
//   .toggle()  / .stop() / .abort() / .notifyExternalInput()
//   onChange / onState callbacks
//
// Flow:
//   tap mic
//     → getUserMedia + MediaRecorder + Web Audio analyser for VAD
//   user speaks
//     → VAD tracks lastVoiceAt; 2.5s silence after first voice → auto stop
//   manual tap or auto-stop
//     → MediaRecorder.stop → ondataavailable assembles blob → POST to provider
//   provider returns text
//     → inserted at the anchor (cursor position at the moment mic was tapped)

const SILENCE_MS = 1000;        // mid-utterance silence → end recording
const MAX_DURATION_MS = 60_000; // hard cap so a forgotten session can't run forever
const VAD_POLL_MS = 100;
const VOICE_THRESHOLD = 0.04;   // RMS over [0,1]; rough but workable

const PROVIDERS = {
  groq: {
    url: "https://api.groq.com/openai/v1/audio/transcriptions",
    defaultModel: "whisper-large-v3",
  },
  openai: {
    url: "https://api.openai.com/v1/audio/transcriptions",
    defaultModel: "gpt-4o-transcribe",
  },
};

export function isWhisperSupported() {
  return typeof window !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== "undefined";
}

export class WhisperSession {
  constructor({ target, getConfig, onChange, onState }) {
    this.target = target;
    this.getConfig = getConfig;
    this.onChange = onChange;
    this.onState = onState;

    this.state = "idle";
    this.mediaRecorder = null;
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.dataChunks = [];
    this.vadTimer = null;
    this.startedAt = 0;
    this.lastVoiceAt = 0;
    this.hasHeardVoice = false;

    this.anchorStart = 0;
    this.anchorEnd = 0;
    this.injecting = false;

    this.abortController = null;
    this.discardOnStop = false;
  }

  toggle(langHint) {
    if (this.state === "recording") {
      this.stop();
    } else if (this.state === "transcribing") {
      this.abort();
    } else {
      this.start(langHint);
    }
  }

  async start(langHint) {
    if (this.state === "recording" || this.state === "transcribing") return;
    const config = this._resolveConfig(langHint);
    if (!config) {
      this._setState("error", new Error("missing-key"));
      return;
    }

    // Anchor the insertion point right now — before the perm prompt or audio
    // start, while we still know what the user clicked at.
    const caret = this.target.selectionStart ?? this.target.value.length;
    this.anchorStart = caret;
    this.anchorEnd = caret;

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn("[whisper] getUserMedia:", err);
      this._setState("error", err);
      return;
    }
    this.stream = stream;

    // VAD is a nice-to-have; if Web Audio isn't available we still record,
    // user just has to tap mic again to stop.
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new Ctx();
      const src = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      src.connect(this.analyser);
    } catch (err) {
      console.warn("[whisper] VAD setup failed:", err);
      this.analyser = null;
    }

    this.dataChunks = [];
    this.discardOnStop = false;
    try {
      this.mediaRecorder = new MediaRecorder(stream);
    } catch (err) {
      this._teardown();
      this._setState("error", err);
      return;
    }
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.dataChunks.push(event.data);
    };
    this.mediaRecorder.onstop = () => {
      const chunks = this.dataChunks;
      const mime = this.mediaRecorder?.mimeType || "audio/webm";
      this._teardown();
      if (this.discardOnStop || chunks.length === 0) {
        if (this.state !== "error") this._setState("idle");
        return;
      }
      const blob = new Blob(chunks, { type: mime });
      this._transcribe(blob, config);
    };

    this.mediaRecorder.start();
    this.startedAt = Date.now();
    this.lastVoiceAt = this.startedAt;
    this.hasHeardVoice = false;
    this._setState("recording");
    this._startVad();
  }

  stop() {
    if (this.state !== "recording") return;
    try {
      this.mediaRecorder?.stop();
    } catch (err) {
      console.warn("[whisper] stop:", err);
    }
  }

  abort() {
    if (this.state === "recording") {
      this.discardOnStop = true;
      try { this.mediaRecorder?.stop(); } catch { /* ignore */ }
    } else if (this.state === "transcribing") {
      try { this.abortController?.abort(); } catch { /* ignore */ }
      this.abortController = null;
      this._setState("idle");
    }
  }

  // Called by the editor's input listener — if the textarea got mutated by
  // something other than our own _insertAtAnchor, the anchor is stale.
  notifyExternalInput() {
    if (this.injecting) return;
    if (this.state === "recording") this.abort();
    // During transcribing we let the request complete; _insertAtAnchor has a
    // bounds check that will drop the result if the value got shorter.
  }

  _resolveConfig(langHint) {
    const c = this.getConfig?.() ?? null;
    if (!c) return null;
    const provider = PROVIDERS[c.provider] ? c.provider : "groq";
    const key = c[`${provider}Key`];
    if (!key) return null;
    return {
      provider,
      url: PROVIDERS[provider].url,
      model: c.model || PROVIDERS[provider].defaultModel,
      key,
      // Both APIs want ISO-639-1 ('zh', 'en'), not BCP-47 ('zh-CN').
      lang: langHint ? langHint.slice(0, 2) : null,
      vocab: typeof c.vocab === "string" ? c.vocab.trim() : "",
    };
  }

  // Whisper's `prompt` parameter biases the output style + vocabulary. We use
  // it for two things:
  //  - Force Simplified Chinese: zh ambiguous between Simplified/Traditional,
  //    so seeding the prompt with simplified glyphs nudges the model toward
  //    simplified output even on dialectal audio.
  //  - User-supplied vocab list (proper nouns, jargon, character names) so
  //    Whisper actually transcribes them correctly instead of guessing
  //    near-homophones.
  _buildPrompt(config) {
    const parts = [];
    if (config.lang === "zh") {
      parts.push("以下是简体中文语音转录。");
    }
    if (config.vocab) parts.push(`常见词汇：${config.vocab}`);
    return parts.length > 0 ? parts.join(" ") : null;
  }

  _setState(next, error) {
    this.state = next;
    this.onState?.(next, error);
  }

  _startVad() {
    if (!this.analyser) return;
    const buffer = new Uint8Array(this.analyser.fftSize);
    this.vadTimer = setInterval(() => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(buffer);
      let sumSq = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const x = (buffer[i] - 128) / 128;
        sumSq += x * x;
      }
      const rms = Math.sqrt(sumSq / buffer.length);
      const now = Date.now();
      if (rms > VOICE_THRESHOLD) {
        this.lastVoiceAt = now;
        this.hasHeardVoice = true;
      }
      const elapsed = now - this.startedAt;
      if (elapsed >= MAX_DURATION_MS) {
        this.stop();
        return;
      }
      // Only auto-stop after the user has actually started talking; otherwise
      // they tap mic, open mouth, and we cut them off before they begin.
      if (this.hasHeardVoice && now - this.lastVoiceAt >= SILENCE_MS) {
        this.stop();
      }
    }, VAD_POLL_MS);
  }

  _teardown() {
    if (this.vadTimer) {
      clearInterval(this.vadTimer);
      this.vadTimer = null;
    }
    if (this.audioContext) {
      try { this.audioContext.close(); } catch { /* ignore */ }
      this.audioContext = null;
    }
    this.analyser = null;
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try { track.stop(); } catch { /* ignore */ }
      }
      this.stream = null;
    }
    this.mediaRecorder = null;
  }

  async _transcribe(blob, config) {
    if (blob.size === 0) {
      this._setState("idle");
      return;
    }
    this._setState("transcribing");

    const form = new FormData();
    form.append("file", blob, "audio.webm");
    form.append("model", config.model);
    form.append("response_format", "json");
    if (config.lang) form.append("language", config.lang);
    const prompt = this._buildPrompt(config);
    if (prompt) form.append("prompt", prompt);

    this.abortController = new AbortController();
    try {
      const response = await fetch(config.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.key}` },
        body: form,
        signal: this.abortController.signal,
      });
      this.abortController = null;
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`${response.status} ${detail.slice(0, 200)}`);
      }
      const data = await response.json();
      let text = (data.text ?? "").trim();
      // Whisper-large-v3 has a known habit of appending a stray ` or ~ when
      // the audio is short, silent, or contains mechanical-keyboard click
      // noise — exactly the conditions of a PTT release. Strip any leading
      // or trailing run of those before we ship the transcript to the
      // editor; the user never wants a backtick tail on a Chinese sentence.
      text = text.replace(/^[`~]+|[`~]+$/g, "").trim();
      if (text && config.lang === "zh") {
        text = chineseifyPunctuation(text);
      }
      if (text) this._insertAtAnchor(text);
      this._setState("idle");
    } catch (err) {
      if (err.name === "AbortError") {
        this._setState("idle");
        return;
      }
      console.warn("[whisper] transcribe:", err);
      this._setState("error", err);
    }
  }

  _insertAtAnchor(text) {
    const t = this.target;
    // Defensive: if the textarea content got shorter than our anchor (user
    // edited / cleared during transcribe), refuse to insert at a bad offset.
    if (this.anchorEnd > t.value.length || this.anchorStart > t.value.length) {
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
      } catch { /* some inputs reject */ }
      this.onChange?.();
    } finally {
      this.injecting = false;
    }
  }
}
