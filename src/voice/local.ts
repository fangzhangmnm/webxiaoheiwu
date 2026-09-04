// 本机离线听写会话（硬规则 #8：语音字节永不离开设备；Web Speech / Groq / OpenAI 后端 2026-09-03 sunset）。
// created 2026-09-03 by Claude Fable 5.1
//   · start：getUserMedia 立刻起录（PTT 前 250ms 也要）；同时让 worker 加载模型（首次 1–10 s，与录音并行）。
//   · 采集 = AudioContext(16k) + ScriptProcessor 收 Float32（ScriptProcessor 已 deprecated 但 Quest/iOS/桌面全通；AudioWorklet 需独立模块文件，以后再换）。
//   · RMS VAD：有声后 1s 静音自动停（PTT 松键也停）；上限 60s。
//   · stop → 重采样到 16k → worker 解码 → 中文全角标点 → 插回锚点。PTT 取消竞态用 cancelled 旗（每个 await 后检查）。
import { chineseifyPunctuation } from "../zh-punct.ts";
import { asr } from "../asr/engine.ts";
import type { ModelInfo } from "../asr/packs.ts";
import type { AsrLang } from "../asr/protocol.ts";
import type { VoiceSession, VoiceSessionDeps, VoiceState } from "./session.ts";

const SILENCE_MS = 1000;
const MAX_DURATION_MS = 60_000;
const VOICE_THRESHOLD = 0.03;

export function isLocalVoiceSupported(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";
}

function resampleTo16k(x: Float32Array, from: number): Float32Array {
  if (from === 16000) return x;
  const n = Math.round(x.length * 16000 / from), y = new Float32Array(n), r = from / 16000;
  for (let i = 0; i < n; i++) { const s = i * r, j = Math.floor(s), t = s - j; y[i] = x[j]! * (1 - t) + (x[Math.min(j + 1, x.length - 1)] ?? 0) * t; }
  return y;
}

export class LocalSession implements VoiceSession {
  state: VoiceState = "idle";
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private proc: ScriptProcessorNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private chunks: Float32Array[] = [];
  private startedAt = 0;
  private lastVoiceAt = 0;
  private hasHeardVoice = false;
  private anchorStart = 0;
  private anchorEnd = 0;
  private injecting = false;
  private cancelled = false;
  private loadPromise: Promise<unknown> | null = null;
  private lang: AsrLang = "zh";
  private gen = 0;              // 会话代：旧会话的回调（getUserMedia / decode）按代丢弃（审计 M12）
  private stopRequested = false; // stop() 早于录音真正开始（getUserMedia 未回）→ 起录后立刻停

  constructor(private d: VoiceSessionDeps & { getModel: () => ModelInfo; onLoading?: (loading: boolean) => void; onPackMissing?: () => void }) {}

  toggle(lang: string): void {
    if (this.state === "recording") this.stop();
    else if (this.state === "transcribing") this.abort();
    else void this.start(lang);
  }

  async start(langHint: string): Promise<void> {
    if (this.state === "recording" || this.state === "transcribing") return;
    const gen = ++this.gen;
    this.cancelled = false; this.stopRequested = false;
    this.lang = langHint.startsWith("zh") ? "zh" : "en";
    const caret = this.d.target.selectionStart ?? this.d.target.value.length;
    this.anchorStart = caret; this.anchorEnd = caret;
    const model = this.d.getModel();
    // 没包就不碰麦克风（默认开 = 下载即同意：没下过包的设备按 Ctrl 绝不能弹权限框）。首次要一次 ~ms 级缓存查询，之后同步判。
    let ready = asr.isKnownReady(model.slug);
    if (ready === undefined) { try { ready = (await asr.status(model.slug)).ready; } catch { ready = false; } if (gen !== this.gen || this.cancelled) return; }
    if (!ready) { this.d.onPackMissing?.(); return; }
    // 模型加载与录音并行；失败留到 stop 时报
    this.loadPromise = asr.load(model.slug, this.lang);
    this.loadPromise.catch(() => {});
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } }); }
    catch (err) { if (this.cancelled || gen !== this.gen) return; this._fail(err); return; }   // 250ms 内弃掉的 Ctrl 和弦不报错（审计 UI-12）
    if (this.cancelled || gen !== this.gen) { for (const t of stream.getTracks()) { try { t.stop(); } catch { /* ignore */ } } return; }
    this.stream = stream;
    try {
      this.ctx = new AudioContext({ sampleRate: 16000 });
      this.src = this.ctx.createMediaStreamSource(stream);
      this.proc = this.ctx.createScriptProcessor(4096, 1, 1);
      this.chunks = [];
      this.proc.onaudioprocess = (e) => {
        if (this.state !== "recording") return;
        const data = e.inputBuffer.getChannelData(0);
        this.chunks.push(new Float32Array(data));
        let sumSq = 0; for (let i = 0; i < data.length; i++) sumSq += data[i]! * data[i]!;
        const rms = Math.sqrt(sumSq / data.length), now = Date.now();
        if (rms > VOICE_THRESHOLD) { this.lastVoiceAt = now; this.hasHeardVoice = true; }
        if (now - this.startedAt >= MAX_DURATION_MS) { this.stop(); return; }
        if (this.hasHeardVoice && now - this.lastVoiceAt >= SILENCE_MS) this.stop();
      };
      this.src.connect(this.proc); this.proc.connect(this.ctx.destination);
    } catch (err) { this._teardown(); this._fail(err); return; }
    if (this.cancelled || gen !== this.gen) { this._teardown(); return; }
    this.startedAt = Date.now(); this.lastVoiceAt = this.startedAt; this.hasHeardVoice = false;
    this._setState("recording");
    if (this.stopRequested) this.stop();   // 松键早于麦克风就绪：现在补停
  }

  stop(): void {
    if (this.state !== "recording") { if (this.state === "idle" && this.stream == null && this.loadPromise) this.stopRequested = true; return; }
    const rate = this.ctx?.sampleRate ?? 16000;
    const chunks = this.chunks; this.chunks = [];
    this._teardown();
    const n = chunks.reduce((a, c) => a + c.length, 0);
    if (n < 1600) { this._setState("idle"); return; }   // < 0.1s：按键声而已
    const all = new Float32Array(n); let o = 0;
    for (const c of chunks) { all.set(c, o); o += c.length; }
    void this._transcribe(resampleTo16k(all, rate));
  }

  abort(): void {
    this.cancelled = true; this.gen++;   // 之后任何旧回调按代丢弃
    if (this.state === "recording") { this.chunks = []; this._teardown(); this._setState("idle"); }
    else if (this.state === "transcribing") this._setState("idle");   // worker 里的解码跑完即弃（gen 已变）
    else if (this.state === "error") this._setState("idle");
  }
  /** 报错但不卡死在 error：PTT 只在 idle 起录，所以报完立刻回 idle（按钮红一下由 onState 负责）。 */
  private _fail(err: unknown): void { this._setState("error", err); this.state = "idle"; }
  notifyExternalInput(): void { if (this.injecting) return; if (this.state === "recording") this.abort(); }

  private _setState(next: VoiceState, error?: unknown) { this.state = next; this.d.onState(next, error); }
  private _teardown() {
    try { this.proc?.disconnect(); } catch { /* ignore */ }
    try { this.src?.disconnect(); } catch { /* ignore */ }
    if (this.ctx) { try { void this.ctx.close(); } catch { /* ignore */ } this.ctx = null; }
    this.proc = null; this.src = null;
    if (this.stream) { for (const t of this.stream.getTracks()) { try { t.stop(); } catch { /* ignore */ } } this.stream = null; }
  }
  private async _transcribe(samples: Float32Array) {
    const gen = this.gen;
    this._setState("transcribing");
    try {
      this.d.onLoading?.(true);
      await this.loadPromise;
      this.d.onLoading?.(false);
      if (this.cancelled || gen !== this.gen) return;
      const r = await asr.decode(samples, this.lang);
      if (this.cancelled || gen !== this.gen) return;
      let text = r.text.trim();
      if (text && this.lang === "zh") text = chineseifyPunctuation(text);
      if (text) this._insertAtAnchor(text);
      this._setState("idle");
    } catch (err) {
      this.d.onLoading?.(false);
      if (this.cancelled || gen !== this.gen) return;
      this._fail(err);
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
