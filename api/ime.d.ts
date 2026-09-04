export declare const IME_SCHEMAS: readonly ["luna_pinyin", "luna_pinyin_fluency", "double_pinyin_mspy", "double_pinyin", "double_pinyin_flypy", "double_pinyin_abc", "double_pinyin_pyjj", "wubi86"];
export type ImeSchema = (typeof IME_SCHEMAS)[number];
export declare const DEFAULT_SCHEMA: ImeSchema;
export declare const isImeSchema: (v: unknown) => v is ImeSchema;
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
    readonly busy?: boolean;
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
    setSimplified?(v: boolean): Promise<void>;
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
    simplified: boolean;
    private zero;
    private refreshZero;
    private runOps;
    private track;
    setSimplified(v: boolean): Promise<void>;
    backend: Backend;
    initializeError: string | null;
    initialized: boolean;
    private initPromise;
    schema: ImeSchema;
    initialize(schema?: ImeSchema): Promise<void>;
    /** 换方案（全拼 ↔ 微软双拼）；未初始化时只记下，初始化时生效。 */
    setSchema(schema: ImeSchema): Promise<void>;
    /** 终止 RIME worker（还原出厂前：worker 活着 IDB 删库必 blocked）。之后 initialize 可重来。 */
    dispose(): void;
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
