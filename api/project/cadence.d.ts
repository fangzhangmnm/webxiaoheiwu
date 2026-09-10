/** 上次落盘（打包 + 写 IDB）花了 lastPersistMs → 下次本地防抖等多久。没量过（0 / NaN）= 基线 200 ms。
 *  例：耗时 20 ms → 200 ms（基线）；100 ms → 500 ms；600 ms 以上 → 3 s（封顶）。代价 = 崩溃最多丢这几秒的字（写进 ADR-0015 后果）。 */
export declare function bookLocalDebounceMs(lastPersistMs: number): number;
