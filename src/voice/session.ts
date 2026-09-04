// 语音会话的统一形状（mic 钮 + Left Ctrl PTT 只认这个面）。created 2026-09-03 by Claude Fable 5.1
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
