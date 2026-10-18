import type { PasswordKeeper } from "@internal/encryption";
/** 组装点调一次；测试再调一次换成内存版（会清掉状态）。 */
export declare function wireRememberPassword(d: {
    keeper: () => PasswordKeeper;
    onError: (e: unknown) => void;
    now?: () => number;
}): void;
/** 记到什么时候（epoch ms）；null = 这台设备没记着。 */
export declare function rememberedUntil(): number | null;
export declare function onRememberChange(cb: () => void): () => void;
/** 密码面板交回勾态（重试时面板按它预勾）。 */
export declare function setRememberChoice(v: boolean): void;
export declare function rememberChoice(): boolean;
/** 取走这一轮的勾（取一次就清）。 */
export declare function takeRememberChoice(): boolean;
/** 开页：试记着的密码。"unlocked" = 已解锁；"none" = 没记 / 没东西可比；"stale" = 对不上，已忘。 */
export declare function restoreRemembered(): Promise<"unlocked" | "none" | "stale">;
/** 记住当前密码（面板上勾了）。返回记到什么时候。 */
export declare function rememberCurrent(pw: string): Promise<number>;
/** 忘掉（幂等；在飞的那次直接复用）。 */
export declare function forgetRemembered(): Promise<void>;
