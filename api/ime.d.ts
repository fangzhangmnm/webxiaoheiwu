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
    initializeError: string | null; /** 候选翻到第几页（0 起）；hasMore = 后面还有。软键盘候选条的「更多」用。 */
    page: number;
    hasMore: boolean;
}
interface Backend {
    engine: string;
    readonly busy?: boolean;
    getState(): {
        buffer: string;
        candidates: string[];
        engine: string;
        page?: number;
        hasMore?: boolean;
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
    quoteStyle: "curly" | "corner";
    private quoteOpen;
    private punctOverride;
    setSimplified(v: boolean): Promise<void>;
    backend: Backend;
    initializeError: string | null;
    initialized: boolean;
    private initPromise;
    schema: ImeSchema;
    /** 起 RIME worker 并加载方案。**不挡启动**（v2.1.24，user「启动打第一个字的时候会卡」+ 家规「启动速度优先」）：boot 不 await 它，
     *  文档先开；RIME 后端一创建就接管，初始化是它队列里的第一项，加载期间用户打的字排在后面等它——不丢字、也不会被降级后端抢答。
     *  加载失败才换成 starter-map（此时排着的字也交给 starter-map 重打一遍不现实：清掉组字并报错，这是罕见路径）。 */
    initialize(schema?: ImeSchema): Promise<void>;
    /** 预热（空闲时调一次；见 RimeWorkerBackend.warmUp）。未初始化 / 降级后端 → 无事。 */
    warmUp(): Promise<void>;
    /** 换方案（全拼 ↔ 微软双拼）；未初始化时只记下，初始化时生效。 */
    setSchema(schema: ImeSchema): Promise<void>;
    /** 终止 RIME worker（还原出厂前：worker 活着 IDB 删库必 blocked）。之后 initialize 可重来。 */
    dispose(): void;
    getState(): ImeState;
    /** 首选上屏（同空格）；没在组字 → passthrough。 */
    commitFirst(): Promise<ImeResult>;
    /** 点第 index 个候选（当前页内，0 起）。 */
    choose(index: number): Promise<ImeResult>;
    /** 候选翻页。 */
    turnPage(prev: boolean): Promise<ImeResult>;
    isComposing(): boolean;
    resetComposition(): void;
    dumpUserDir(): Promise<UserDictDump | null>;
    restoreUserDir(dump: UserDictDump): Promise<void>;
    /** Shift 单击：中 ↔ EN。切到 EN 时把未完成的拼音原样提交。 */
    toggleAsciiMode(): Promise<ImeResult>;
    onKeydown(event: KeyboardEvent): Promise<ImeResult>;
}
export {};
