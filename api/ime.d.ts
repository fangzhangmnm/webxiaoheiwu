import { type FuzzyPair } from "./ime-fuzzy.ts";
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
    /** 组字区原样上屏（已选的字 + 剩下的字母；v2.3.33 回车的语义，同 iOS「确认」/ 微软拼音）。 */
    commitRaw(): Promise<ImeResult>;
    changePage(prev: boolean): Promise<ImeResult>;
    dumpUserDir?(): Promise<UserDictDump>;
    restoreUserDir?(dump: UserDictDump): Promise<void>;
    setSimplified?(v: boolean): Promise<void>;
    /** 候选每页几个（v2.1.34：软键盘露着时 40 → 候选条整条横滑；PC 悬浮条 9 → 数字选词）。 */
    setPageSize?(n: number): Promise<void>;
    /** 模糊音（ime-fuzzy.ts）：编不成 = reject，fuzzyError 留着原因。 */
    setFuzzy?(pairs: FuzzyPair[]): Promise<void>;
    readonly fuzzyError?: string | null;
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
    /** 候选每页几个（v2.1.34，user 2026-09-30「如果是软键盘的话候选词就不用翻页了而是手指滑」）：后端换掉 / 重建也要记住，所以存在这里。 */
    pageSize: number;
    setPageSize(n: number): Promise<void>;
    /** 模糊音（synced prefs `imeFuzzy`，缺省全关）：app 层在 initialize 前灌入；改了走 setFuzzy（编不成 = reject，app 报出来）。 */
    fuzzy: FuzzyPair[];
    setFuzzy(pairs: FuzzyPair[]): Promise<void>;
    /** 上一次对齐模糊音失败的原因（换方案 / 开机时那次也算）；null = 没问题或没开。 */
    get fuzzyError(): string | null;
    backend: Backend;
    /** 临时英文（v2.3.33，user 2026-10-04「和ios对齐，嗯和你建议一样」「空格收尾留空格，因为不想留的话可以用回车」）：中文态里一个大写字母（Shift + 字母 / 软键盘上档一次）
     *  起头，后面的字母、数字原样接着、不出汉字候选——「我用AI写」「Wi-Fi」不用切中英。空格 = 原样 + 一个空格；回车 = 原样；标点 = 原样 + 这个标点（中文标点照旧）；
     *  退格删一个、删空即退出；Esc / Ctrl+Z 撤掉；点条上那枚原样芯片 = 原样；切中 / 英 = 原样带出去。null = 不在临时英文里。纯 JS，不进 RIME。 */
    private temp;
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
    /** 临时英文收尾：原样 + suffix 上屏。 */
    private takeTemp;
    /** 把 RIME 里正在组的字收掉：先上首选；首选上不完（拼不成字的尾巴）剩下的原样带出——别留看不见的组字。没在组字 = null。 */
    private flushBackend;
    /** 首选上屏（同空格；临时英文 = 原样、不带空格）；没在组字 → passthrough。 */
    commitFirst(): Promise<ImeResult>;
    /** 点第 index 个候选（当前页内，0 起）。临时英文条上只有原样那一枚。 */
    choose(index: number): Promise<ImeResult>;
    /** 候选翻页。 */
    turnPage(prev: boolean): Promise<ImeResult>;
    isComposing(): boolean;
    resetComposition(): void;
    dumpUserDir(): Promise<UserDictDump | null>;
    restoreUserDir(dump: UserDictDump): Promise<void>;
    /** Shift 单击：中 ↔ EN。切到 EN 时把未完成的拼音原样提交。 */
    toggleAsciiMode(): Promise<ImeResult>;
    /** 临时英文里的键（见 temp）。 */
    private onTempKey;
    onKeydown(event: KeyboardEvent): Promise<ImeResult>;
}
export {};
