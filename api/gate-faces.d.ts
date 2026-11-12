export type FaceKind = "ask" | "spin";
export interface Face<O> {
    readonly id: number;
    readonly kind: FaceKind;
    readonly opts: O;
}
export interface FaceRenderer<O> {
    /** 把这张面画上锁屏位（锁屏位上原来那张直接被换掉；调用方保证那张已经结束）。 */
    show(face: Face<O>): void;
    /** 锁屏位上没有面了：收起来。 */
    hide(): void;
}
export interface GateFaces<O> {
    /** 叫一张面。返回它的号和结果（人点的值；被让位 / 收回 / 不出来 = null）。 */
    request(kind: FaceKind, opts: O): {
        id: number;
        result: Promise<unknown>;
    };
    /** 人点了当前露着的那张上的钮。 */
    answer(id: number, value: unknown): void;
    /** 主人收回自己那张（露着或排着都行）；已经结束的 = 什么都不做。返回这一下有没有收掉东西。 */
    withdraw(id: number): boolean;
    /** 现在露着的那张。 */
    current(): Face<O> | null;
    /** 排着队的问人的面有几张。 */
    queued(): number;
}
export declare function createGateFaces<O>(r: FaceRenderer<O>): GateFaces<O>;
