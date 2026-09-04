export type VoiceState = "idle" | "listening" | "recording" | "transcribing" | "error";
export interface VoiceSession {
    readonly state: VoiceState;
    toggle(lang: string): void;
    start(lang: string): void | Promise<void>;
    stop(): void;
    abort(): void;
    notifyExternalInput(): void;
}
export interface VoiceSessionDeps {
    target: HTMLTextAreaElement;
    onChange: () => void;
    onState: (next: VoiceState, error?: unknown) => void;
}
