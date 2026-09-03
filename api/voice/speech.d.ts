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
export declare function isSpeechSupported(): boolean;
export declare class SpeechSession implements VoiceSession {
    private d;
    state: VoiceState;
    private recognition;
    private silenceTimer;
    private injecting;
    private anchorStart;
    private anchorEnd;
    constructor(d: VoiceSessionDeps);
    toggle(lang: string): void;
    start(lang: string): void;
    stop(): void;
    abort(): void;
    notifyExternalInput(): void;
    private _setState;
    private _replaceAnchor;
    private _armTimer;
    private _clearTimer;
}
