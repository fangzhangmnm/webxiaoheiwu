// Whisper 听写（Groq / OpenAI，用户自备 key；自 v1 src/whisper.js 移植）。created 2026-09-03 by Claude Fable 5.1
//   getUserMedia + MediaRecorder + Web Audio RMS VAD → 停 → POST → 插回锚点。PTT 取消竞态用 cancelled 旗（每个 await 后检查）。
import { chineseifyPunctuation } from "../zh-punct.ts";
import type { VoiceSession, VoiceSessionDeps, VoiceState } from "./speech.ts";

const SILENCE_MS = 1000;
const MAX_DURATION_MS = 60_000;
const VAD_POLL_MS = 100;
const VOICE_THRESHOLD = 0.04;

export type WhisperProvider = "groq" | "openai";
const PROVIDERS: Record<WhisperProvider, { url: string; defaultModel: string }> = {
  groq: { url: "https://api.groq.com/openai/v1/audio/transcriptions", defaultModel: "whisper-large-v3" },
  openai: { url: "https://api.openai.com/v1/audio/transcriptions", defaultModel: "gpt-4o-transcribe" },
};
export interface WhisperConfig { provider: WhisperProvider; key: string; vocab: string; model?: string }

export function isWhisperSupported(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export class WhisperSession implements VoiceSession {
  state: VoiceState = "idle";
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataChunks: Blob[] = [];
  private vadTimer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private lastVoiceAt = 0;
  private hasHeardVoice = false;
  private anchorStart = 0;
  private anchorEnd = 0;
  private injecting = false;
  private abortController: AbortController | null = null;
  private discardOnStop = false;
  private cancelled = false;

  constructor(private d: VoiceSessionDeps & { getConfig: () => WhisperConfig | null }) {}

  toggle(lang: string): void {
    if (this.state === "recording") this.stop();
    else if (this.state === "transcribing") this.abort();
    else void this.start(lang);
  }

  async start(langHint: string): Promise<void> {
    if (this.state === "recording" || this.state === "transcribing") return;
    const cfg = this.d.getConfig();
    if (!cfg?.key) { this._setState("error", new Error("missing-key")); return; }
    const config = { ...cfg, url: PROVIDERS[cfg.provider].url, model: cfg.model || PROVIDERS[cfg.provider].defaultModel, lang: langHint ? langHint.slice(0, 2) : null };
    this.cancelled = false;
    const caret = this.d.target.selectionStart ?? this.d.target.value.length;
    this.anchorStart = caret; this.anchorEnd = caret;
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (err) { this._setState("error", err); return; }
    if (this.cancelled) { for (const t of stream.getTracks()) { try { t.stop(); } catch { /* ignore */ } } return; }
    this.stream = stream;
    try {
      const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        this.audioContext = new Ctx();
        const src = this.audioContext.createMediaStreamSource(stream);
        this.analyser = this.audioContext.createAnalyser(); this.analyser.fftSize = 2048; src.connect(this.analyser);
      }
    } catch { this.analyser = null; }
    this.dataChunks = []; this.discardOnStop = false;
    try { this.mediaRecorder = new MediaRecorder(stream); }
    catch (err) { this._teardown(); this._setState("error", err); return; }
    this.mediaRecorder.ondataavailable = (event) => { if (event.data && event.data.size > 0) this.dataChunks.push(event.data); };
    this.mediaRecorder.onstop = () => {
      const chunks = this.dataChunks;
      const mime = this.mediaRecorder?.mimeType || "audio/webm";
      this._teardown();
      if (this.discardOnStop || chunks.length === 0) { if (this.state !== "error") this._setState("idle"); return; }
      void this._transcribe(new Blob(chunks, { type: mime }), config);
    };
    if (this.cancelled) { this._teardown(); return; }
    this.mediaRecorder.start();
    this.startedAt = Date.now(); this.lastVoiceAt = this.startedAt; this.hasHeardVoice = false;
    this._setState("recording");
    this._startVad();
  }
  stop(): void { if (this.state !== "recording") return; try { this.mediaRecorder?.stop(); } catch (err) { console.warn("[whisper] stop failed", err); } }
  abort(): void {
    this.cancelled = true;
    if (this.state === "recording") { this.discardOnStop = true; try { this.mediaRecorder?.stop(); } catch { /* ignore */ } }
    else if (this.state === "transcribing") { try { this.abortController?.abort(); } catch { /* ignore */ } this.abortController = null; this._setState("idle"); }
  }
  notifyExternalInput(): void { if (this.injecting) return; if (this.state === "recording") this.abort(); }

  private _setState(next: VoiceState, error?: unknown) { this.state = next; this.d.onState(next, error); }
  private _startVad() {
    if (!this.analyser) return;
    const buffer = new Uint8Array(this.analyser.fftSize);
    this.vadTimer = setInterval(() => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(buffer);
      let sumSq = 0;
      for (let i = 0; i < buffer.length; i++) { const x = (buffer[i]! - 128) / 128; sumSq += x * x; }
      const rms = Math.sqrt(sumSq / buffer.length);
      const now = Date.now();
      if (rms > VOICE_THRESHOLD) { this.lastVoiceAt = now; this.hasHeardVoice = true; }
      if (now - this.startedAt >= MAX_DURATION_MS) { this.stop(); return; }
      if (this.hasHeardVoice && now - this.lastVoiceAt >= SILENCE_MS) this.stop();
    }, VAD_POLL_MS);
  }
  private _teardown() {
    if (this.vadTimer) { clearInterval(this.vadTimer); this.vadTimer = null; }
    if (this.audioContext) { try { void this.audioContext.close(); } catch { /* ignore */ } this.audioContext = null; }
    this.analyser = null;
    if (this.stream) { for (const t of this.stream.getTracks()) { try { t.stop(); } catch { /* ignore */ } } this.stream = null; }
    this.mediaRecorder = null;
  }
  private async _transcribe(blob: Blob, config: WhisperConfig & { url: string; model: string; lang: string | null }) {
    if (blob.size === 0) { this._setState("idle"); return; }
    this._setState("transcribing");
    const form = new FormData();
    form.append("file", blob, "audio.webm");
    form.append("model", config.model);
    form.append("response_format", "json");
    if (config.lang) form.append("language", config.lang);
    const parts: string[] = [];
    if (config.lang === "zh") parts.push("以下是简体中文语音转录。");
    if (config.vocab) parts.push(`常见词汇：${config.vocab}`);
    if (parts.length) form.append("prompt", parts.join(" "));
    this.abortController = new AbortController();
    try {
      const response = await fetch(config.url, { method: "POST", headers: { Authorization: `Bearer ${config.key}` }, body: form, signal: this.abortController.signal });
      this.abortController = null;
      if (!response.ok) { const detail = await response.text().catch(() => ""); throw new Error(`${response.status} ${detail.slice(0, 200)}`); }
      const data = (await response.json()) as { text?: string };
      let text = (data.text ?? "").trim().replace(/^[`~]+|[`~]+$/g, "").trim();   // whisper 对短音频/按键声爱吐反引号
      if (text && config.lang === "zh") text = chineseifyPunctuation(text);
      if (text) this._insertAtAnchor(text);
      this._setState("idle");
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") { this._setState("idle"); return; }
      this._setState("error", err);
    }
  }
  private _insertAtAnchor(text: string) {
    const t = this.d.target;
    if (this.anchorEnd > t.value.length || this.anchorStart > t.value.length) return;
    this.injecting = true;
    try {
      t.value = `${t.value.slice(0, this.anchorStart)}${text}${t.value.slice(this.anchorEnd)}`;
      this.anchorEnd = this.anchorStart + text.length;
      try { t.selectionStart = t.selectionEnd = this.anchorEnd; } catch { /* ignore */ }
      this.d.onChange();
    } finally { this.injecting = false; }
  }
}
