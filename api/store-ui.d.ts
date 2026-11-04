import type { StoreUI } from "@internal/store";
import { type CloudGate } from "./cloud-gate.ts";
export declare function setStoreQuietStatus(fn: (text: string) => void): void;
/** app 组装层把闸门递进来（store-ui 在 createStore 时就要，闸门要等 app 起来才有）。 */
export declare function attachGate(g: CloudGate): void;
export declare const storeUI: StoreUI;
