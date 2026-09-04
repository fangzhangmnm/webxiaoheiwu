export declare const APP_ID = "webxiaoheiwu";
export declare const CLIENT_ID = "39d8afca-f47b-43cb-b962-0803f556520f";
export declare const AUTHORITY = "https://login.microsoftonline.com/consumers";
export declare const SCOPES: string[];
export declare const MSAL_URL = "./vendor/msal/msal-browser.min.js";
/** 文档扩展名（身份 = `YYYYMMDD 标题.txt`，appfolder 根平铺；加密件云端 at-rest = `….txt.zip`，库透明）。 */
export declare const DOC_EXT = ".txt";
/** 编辑 → 本地落盘（IDB）防抖。 */
export declare const LOCAL_SAVE_DEBOUNCE_MS = 200;
/** 每次击键重置的推云防抖（「用户停手了」）。 */
export declare const PUSH_DEBOUNCE_MS = 15000;
/** 首次变脏起最多等这么久必推（「一直打字不停」）。 */
export declare const PUSH_HEARTBEAT_MS = 30000;
/** 标题改名（tryMove）防抖：标题是身份，别每个字都改名。 */
export declare const RENAME_DEBOUNCE_MS = 1500;
/** 闲置锁屏（Quest「核电池开一年」——醒来必查云端再放行输入）。 */
export declare const IDLE_OVERLAY_MS: number;
/** RIME 用户词库推云节流（每次 commit 检查，超间隔才推；idle/unload 无条件 flush）。 */
export declare const USER_DICT_PUSH_INTERVAL_MS: number;
/** Left Ctrl 按住多久算「要录」（短按 = 丢弃）。 */
export declare const PTT_HOLD_MS = 250;
/** 冷首帧后，前台轮询云端新鲜度的周期（reconcilePolicy:"app-driven"）。 */
export declare const FOREGROUND_POLL_MS = 60000;
/** 模型包默认源（黄线区白名单：只读、逐片 sha256 校验、可被用户在设置里改成任何镜像——网址不写死是反弃坑要求）。 */
export declare const MODEL_SOURCE_DEFAULT = "https://fangzhangmnm.github.io/pwa-models";
/** 模型包 Cache Storage 名：**家族共享**（同 origin 兄弟 PWA 各自 SW 只清自己前缀，已核实；forceReset 也跳过它）。可再生派生缓存，user 2026-09-03 批。 */
export declare const MODEL_CACHE_NAME = "pwa-models";
/** sherpa-onnx WASM 运行时目录（相对 app 根；worker 里按 self.location 解析）。 */
export declare const ASR_WASM_DIR = "vendor/sherpa-onnx-wasm/";
/** Quest 浏览器：编辑区 inputmode=none 关掉 OS IME 组合路径（docs/20260524-quest-ime.md）。 */
export declare const IS_QUEST_BROWSER: boolean;
/** v1 时代（≤v81）云端布局——只读遗留，新 app 永不写这些路径（legacy-import.ts 一次性读）。 */
export declare const LEGACY: {
    readonly ENC_FOLDER: ".enc";
    readonly ENC_TRASH_FOLDER: ".enc/.trash";
    readonly SALT_PATH: ".crypto/salt.json";
    readonly VERIFIER_PATH: ".crypto/verifier.bin";
    readonly VOICE_JSON: "voice.json";
    readonly RIME_DICT: ".userdata/rime-user-dir.json";
    readonly LAST_ACTIVE: ".userdata/last-active.json";
};
/** collection 名（云端 `.webxiaoheiwu/<name>.json`；库自动追加 .json）。 */
export declare const COLLECTIONS: {
    readonly prefs: "synced-user-preference";
    readonly appState: "synced-app-state";
    readonly rimeDict: "rime-user-dict";
};
