export type ImeResult = {
    type: "passthrough" | "composing" | "clear" | "toggle";
} | {
    type: "commit";
    text: string;
    consumedBuffer: string;
};
export interface ImeState {
    enabled: boolean;
    asciiMode: boolean;
    buffer: string;
    candidates: string[];
    engine: string;
    initializeError: string | null;
}
interface Backend {
    engine: string;
    getState(): {
        buffer: string;
        candidates: string[];
        engine: string;
    };
    resetState(): void;
    typeLetter(letter: string): Promise<ImeResult>;
    typePunctuation(key: string): Promise<ImeResult>;
    backspace(): Promise<ImeResult>;
    clear(): Promise<ImeResult>;
    chooseCandidate(index: number): Promise<ImeResult>;
    commitDefault(withNewline: boolean): Promise<ImeResult>;
    changePage(prev: boolean): Promise<ImeResult>;
    dumpUserDir?(): Promise<UserDictDump>;
    restoreUserDir?(dump: UserDictDump): Promise<void>;
}
export interface UserDictDump {
    files: {
        path: string;
        data: string;
    }[];
    savedAt?: number;
    device?: string;
}
export declare class NaturalCodeIME {
    enabled: boolean;
    asciiMode: boolean;
    backend: Backend;
    initializeError: string | null;
    initialized: boolean;
    initialize(): Promise<void>;
    getState(): ImeState;
    isComposing(): boolean;
    resetComposition(): void;
    dumpUserDir(): Promise<UserDictDump | null>;
    restoreUserDir(dump: UserDictDump): Promise<void>;
    /** Shift 单击：中 ↔ EN。切到 EN 时把未完成的拼音原样提交。 */
    toggleAsciiMode(): Promise<ImeResult>;
    onKeydown(event: KeyboardEvent): Promise<ImeResult>;
}
export {};
