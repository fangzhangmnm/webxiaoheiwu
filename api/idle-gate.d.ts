export interface IdleGateDeps {
    overlay: HTMLElement;
    /** 锁屏时刻（用户显然停手了）：推送脏稿 / flush 词库 / 记 lastActive——fire-and-forget。 */
    onIdle: () => void;
    /** 解锁时刻：拉云端新鲜度、drain 队列、对齐 collection；完成前输入已被吃掉。 */
    onResume: () => Promise<void>;
    /** 解锁后把焦点还给编辑器。 */
    focusEditor: () => void;
}
export declare function initIdleGate(d: IdleGateDeps): {
    poke: () => void;
    isShown: () => boolean;
};
