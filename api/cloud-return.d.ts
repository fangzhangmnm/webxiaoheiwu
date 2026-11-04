export type ReturnPlan = {
    kind: "none";
}
/** 只有 (b)：直接续传，不问。 */
 | {
    kind: "resume";
    total: number;
}
/** 有 (a)：问一次。others = 一起会被推的 (b)。 */
 | {
    kind: "ask";
    neverUploaded: number;
    others: number;
}
/** 有 (a)、这一页已经问过：不再问，也不推（推了就是不问就把 (a) 传上去）。 */
 | {
    kind: "hold";
    neverUploaded: number;
    others: number;
};
/** dirty = 库 dirty.count()；neverUploaded = 列举里 float 的份数；asked = 这一页问过那一句没有。 */
export declare function planReturn(dirty: number, neverUploaded: number, asked: boolean): ReturnPlan;
/** 列举里「从没传过、有字节要传」的身份。 */
export declare function neverUploadedIds(items: readonly {
    identifier: string;
    syncState?: string | null;
}[]): string[];
export interface PushFailureLike {
    name: string;
    reason: string;
}
export type AfterPush = {
    kind: "done";
    pushed: number;
}
/** 只有网络这类「之后会再试」的：说一句，不弹。 */
 | {
    kind: "retryLater";
    pushed: number;
    left: number;
}
/** 有要人选的（别的设备改过 / 云端有同名 / 别的异常）：带名单、带「去处理」。 */
 | {
    kind: "attention";
    pushed: number;
    left: number;
    names: string[];
};
/** pushAll 之后：left = 再数一次的 dirty.count()（绿灯以它为准，不以返回值为准——库的注释）。 */
export declare function afterPushAll(r: {
    pushed: number;
    failures?: readonly PushFailureLike[];
} | null, left: number): AfterPush;
