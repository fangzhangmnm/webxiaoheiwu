export declare const FUZZY_PAIRS: readonly ["zh-z", "ch-c", "sh-s", "n-l", "l-r", "ang-an", "eng-en", "ing-in", "f-h", "wang-huang"];
export type FuzzyPair = (typeof FUZZY_PAIRS)[number];
export declare const isFuzzyPair: (v: unknown) => v is FuzzyPair;
export declare const fuzzyApplies: (schema: string) => boolean;
/** 任意输入（synced prefs 里的值）→ 合法、去重、按 FUZZY_PAIRS 的顺序。 */
export declare function normalizeFuzzy(v: unknown): FuzzyPair[];
/** 这几对 → 插在方案原有拼写规则前面的那一串（空 = 不开）。 */
export declare function fuzzyRules(pairs: readonly FuzzyPair[]): string[];
/** 编译好的方案 yaml（`build/<方案>.schema.yaml`，rime-contrib 发的就是这种）里的 speller/algebra。找不到 = 抛错（不猜）。 */
export declare function readAlgebra(compiledSchemaYaml: string): string[];
/** `<方案>.custom.yaml` 的全文；不开 / 方案不适用 = null（应当删掉这个文件）。内容同时是「这台设备上编过哪一版」的记号：和现存文件逐字相同 = 不用重新部署。 */
export declare function fuzzyCustomYaml(schema: string, compiledSchemaYaml: string, pairs: readonly FuzzyPair[]): string | null;
/** 部署要的「源」方案：编译版去掉 import_preset（default / symbols 早已并进来了；留着它 RIME 会去找本机没有的 default.yaml / symbols.yaml）。 */
export declare const sourceSchemaYaml: (compiledSchemaYaml: string) => string;
/** 关掉 / 还原时要删的文件（相对 /rime）：所有拼音方案的补丁 + 编出来的方案与 prism。删光 = 回到 vendored 预编译那份。 */
export declare function fuzzyArtifacts(): string[];
/** 用户词库同步不带这些（能从偏好重新生成；带上会把别的设备的编译产物写回来）。路径相对 /rime。 */
export declare const isFuzzyArtifactPath: (rel: string) => boolean;
