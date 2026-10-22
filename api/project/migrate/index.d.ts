export type Component = "graph" | "editorState";
export interface Stamp {
    major: number;
    minor: number;
    patch: number;
}
/** 本版写出的拍子（SSoT）。
 *  graph 2.0 = 2026-09-10 v2（主干树 + links，ADR-0014）；2.1 = 09-30～10-01 加的可选键 hidden / cover（2026-10-21 追认为 minor 1）。
 *  editorState 1.0 = 今天的形状（last / back / refPanel / lineWidth / exportLineWidth / exportFont / font / exportCovers / exportEmbedText）；
 *    以前从没写过 version，缺 = 1.0.0。 */
export declare const FORMAT: Readonly<Record<Component, Readonly<Stamp>>>;
/** 缺 `version` 时当几：graph 没有 version = 损坏（一直如此，null = 调用方自己拒）；editor-state 从没写过 version = 1。 */
export declare const MISSING_MAJOR: Readonly<Record<Component, number | null>>;
/** 本版能读的最老 major。graph v1 = 链表格式，不迁（user 2026-09-10「legacy 不用分支代码」）→ 比它老 = 不是本版的书。 */
export declare const MIN_MAJOR: Readonly<Record<Component, number>>;
export type Step = (json: Record<string, unknown>) => Record<string, unknown>;
/** STEPS[子结构][major] = 把 major 升到 major+1 的纯函数（必须把 version 写成 major+1）。今天空表：graph v1 不迁，editor-state 只有 1。 */
export declare const STEPS: Readonly<Partial<Record<Component, Readonly<Record<number, Step>>>>>;
export declare class FormatTooNewError extends Error {
    readonly component: Component;
    readonly fileStamp: Stamp;
    readonly appStamp: Stamp;
    constructor(component: Component, fileStamp: Stamp, appStamp: Stamp);
}
export declare class FormatTooOldError extends Error {
    readonly component: Component;
    readonly fileStamp: Stamp;
    constructor(component: Component, fileStamp: Stamp, minMajor: number);
}
export declare const fmt: (s: Stamp) => string;
/** 读一份 JSON 的拍子：version = major（缺 → MISSING_MAJOR；仍缺 → null = 损坏）；minor / patch 缺或非法 = 0。 */
export declare function readStamp(c: Component, json: unknown): Stamp | null;
/** 同 major 下文件拍 vs 本版拍。too-new（major 大）不在这里——它走异常。 */
export type Verdict = "same" | "older" | "newer-minor" | "newer-patch";
export declare function compareStamp(file: Stamp, mine: Stamp): Verdict;
/** 把一份 JSON 升到本版 major，并给出判决。缺 version 且不许缺 → 抛 Error（调用方当损坏）；major 比本版大 → FormatTooNewError；
 *  比 MIN_MAJOR 小 → FormatTooOldError；中间每一步都要有 STEP，缺了 = 纪律破，响亮抛。steps 可注入（测试）。 */
export declare function migrate(c: Component, json: Record<string, unknown>, steps?: typeof STEPS): {
    json: Record<string, unknown>;
    stamp: Stamp;
    verdict: Verdict;
};
/** 写入器用：本版的拍子落成三个键。 */
export declare function stampFields(c: Component): {
    version: number;
    minor: number;
    patch: number;
};
