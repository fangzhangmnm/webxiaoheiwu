// Web Speech API 听写会话（自 v1 src/speech.js 移植）。created 2026-09-03 by Claude Fable 5.1
//   · 点麦开始；再点或 1s 静音停。语言由调用方按 IME 状态给。
//   · 中间结果流式写进 textarea 的锚点区间 [anchorStart, anchorEnd)，每次 onresult 整段重写。
//   · 用户在会话中打字/点击 → notifyExternalInput → 中止（锚点已失效）。
//   · 首段静音宽限 8s（含权限弹窗时间）；有声后 1s 静音即停。
import { chineseifyPunctuation } from "../zh-punct.ts";

const INITIAL_GRACE_MS = 8000;
const SILENCE_TIMEOUT_MS = 1000;

export type VoiceState = "idle" | "listening" | "recording" | "transcribing" | "error";
export interface VoiceSession {
  readonly state: VoiceState;
  toggle(lang: string): void;
  start(lang: string): void | Promise<void>;
  stop(): void;
  abort(): void;
  notifyExternalInput(): void;
}
export interface VoiceSessionDeps { target: HTMLTextAreaElement; onChange: () => void; onState: (next: VoiceState, error?: unknown) => void }

type SpeechRecognitionCtor = new () => any;
export function isSpeechSupported(): boolean {
  const w = globalThis as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return typeof window !== "undefined" && !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export class SpeechSession implements VoiceSession {
  state: VoiceState = "idle";
  private recognition: any = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private injecting = false;
  private anchorStart = 0;
  private anchorEnd = 0;
  constructor(private d: VoiceSessionDeps) {}

  toggle(lang: string): void { if (this.state === "listening") this.stop(); else this.start(lang); }

  start(lang: string): void {
    if (this.state === "listening") return;
    if (this.recognition) { try { this.recognition.abort(); } catch { /* ignore */ } this.recognition = null; }
    this._clearTimer();
    const w = globalThis as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) { this._setState("error", new Error("not-supported")); return; }
    const r = new Ctor();
    r.lang = lang || "zh-CN"; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = (event: any) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      if (String(r.lang).startsWith("zh")) text = chineseifyPunctuation(text);
      this._replaceAnchor(text);
      this._armTimer(SILENCE_TIMEOUT_MS);
    };
    r.onerror = (event: any) => {
      this._clearTimer(); this.recognition = null;
      if (event.error === "no-speech" || event.error === "aborted") { this._setState("idle"); return; }
      this._setState("error", new Error(event.error || "speech-error"));
    };
    r.onend = () => { this._clearTimer(); this.recognition = null; if (this.state !== "error") this._setState("idle"); };
    r.onaudiostart = () => { this._armTimer(INITIAL_GRACE_MS); };
    this.recognition = r;
    const caret = this.d.target.selectionStart ?? this.d.target.value.length;
    this.anchorStart = caret; this.anchorEnd = caret;
    try { r.start(); this._setState("listening"); }
    catch (err) { this.recognition = null; this._setState("error", err); }
  }
  stop(): void { this._clearTimer(); if (this.recognition) { try { this.recognition.stop(); } catch { /* ignore */ } } }
  abort(): void { this._clearTimer(); if (this.recognition) { try { this.recognition.abort(); } catch { /* ignore */ } } }
  notifyExternalInput(): void { if (this.injecting) return; if (this.state === "listening") this.abort(); }

  private _setState(next: VoiceState, error?: unknown) { this.state = next; this.d.onState(next, error); }
  private _replaceAnchor(text: string) {
    const t = this.d.target;
    if (this.anchorEnd > t.value.length || this.anchorStart > t.value.length) { this.abort(); return; }
    this.injecting = true;
    try {
      t.value = `${t.value.slice(0, this.anchorStart)}${text}${t.value.slice(this.anchorEnd)}`;
      this.anchorEnd = this.anchorStart + text.length;
      try { t.selectionStart = t.selectionEnd = this.anchorEnd; } catch { /* ignore */ }
      this.d.onChange();
    } finally { this.injecting = false; }
  }
  private _armTimer(ms: number) { this._clearTimer(); this.silenceTimer = setTimeout(() => { this.silenceTimer = null; this.stop(); }, ms); }
  private _clearTimer() { if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; } }
}
