import type { VoiceSession, VoiceSessionDeps, VoiceState } from "./speech.ts";
export type WhisperProvider = "groq" | "openai";
export interface WhisperConfig {
    provider: WhisperProvider;
    key: string;
    vocab: string;
    model?: string;
}
export declare function isWhisperSupported(): boolean;
export declare class WhisperSession implements VoiceSession {
    private d;
    state: VoiceState;
    private mediaRecorder;
    private stream;
    private audioContext;
    private analyser;
    private dataChunks;
    private vadTimer;
    private startedAt;
    private lastVoiceAt;
    private hasHeardVoice;
    private anchorStart;
    private anchorEnd;
    private injecting;
    private abortController;
    private discardOnStop;
    private cancelled;
    constructor(d: VoiceSessionDeps & {
        getConfig: () => WhisperConfig | null;
    });
    toggle(lang: string): void;
    start(langHint: string): Promise<void>;
    stop(): void;
    abort(): void;
    notifyExternalInput(): void;
    private _setState;
    private _startVad;
    private _teardown;
    private _transcribe;
    private _insertAtAnchor;
}
