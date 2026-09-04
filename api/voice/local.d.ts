import type { ModelInfo } from "../asr/packs.ts";
import type { VoiceSession, VoiceSessionDeps, VoiceState } from "./session.ts";
export declare function isLocalVoiceSupported(): boolean;
export declare class LocalSession implements VoiceSession {
    private d;
    state: VoiceState;
    private stream;
    private ctx;
    private proc;
    private src;
    private chunks;
    private startedAt;
    private lastVoiceAt;
    private hasHeardVoice;
    private anchorStart;
    private anchorEnd;
    private injecting;
    private cancelled;
    private loadPromise;
    private lang;
    constructor(d: VoiceSessionDeps & {
        getModel: () => ModelInfo;
        onLoading?: (loading: boolean) => void;
    });
    toggle(lang: string): void;
    start(langHint: string): Promise<void>;
    stop(): void;
    abort(): void;
    notifyExternalInput(): void;
    private _setState;
    private _teardown;
    private _transcribe;
    private _insertAtAnchor;
}
