import type { GateUi } from "./cloud-gate.ts";
export interface GateUiDeps {
    dirtyCount: () => Promise<number>;
    /** 点条 = 图库的「要处理的」列表（gallery 0.8.8）。 */
    openList: () => void;
    /** 罩 / 闸收掉之后（把焦点还给纸）。 */
    afterRelease: () => void;
}
export declare function createGateUi(o: GateUiDeps): GateUi;
