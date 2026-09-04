// 常量 SSoT（凡是「人类拍过板的数字」都在这里，别散在各处）。created 2026-09-03 by Claude Fable 5.1
//
// OneDrive：scope 永久 AppFolder（家规硬规则 #6）；authority /consumers = personal-account-only（硬规则 #7）。
// 旧 v1 注册同一个 clientId，Entra 已翻 Personal only + 加了 /dev/ redirect（user 2026-09-03）。
export const APP_ID = "webxiaoheiwu";   // 本 origin 内唯一命名空间：IDB `webxiaoheiwu.defaultStore` + localStorage 前缀；与 JRP/BR 等兄弟隔离
export const CLIENT_ID = "39d8afca-f47b-43cb-b962-0803f556520f";
export const AUTHORITY = "https://login.microsoftonline.com/consumers";
export const SCOPES = ["Files.ReadWrite.AppFolder", "offline_access"];
export const MSAL_URL = "./vendor/msal/msal-browser.min.js";

/** 文档扩展名（身份 = `YYYYMMDD 标题.txt`，appfolder 根平铺；加密件云端 at-rest = `….txt.zip`，库透明）。 */
export const DOC_EXT = ".txt";

// ── 节律（docs/20260524-sync-design.md，user 多轮回退后的终形，别再动）──
/** 编辑 → 本地落盘（IDB）防抖。 */
export const LOCAL_SAVE_DEBOUNCE_MS = 200;
/** 每次击键重置的推云防抖（「用户停手了」）。 */
export const PUSH_DEBOUNCE_MS = 15_000;
/** 首次变脏起最多等这么久必推（「一直打字不停」）。 */
export const PUSH_HEARTBEAT_MS = 30_000;
/** 标题改名（tryMove）防抖：标题是身份，别每个字都改名。 */
export const RENAME_DEBOUNCE_MS = 1_500;
/** 闲置锁屏（Quest「核电池开一年」——醒来必查云端再放行输入）。 */
export const IDLE_OVERLAY_MS = 2 * 60 * 1000;
/** RIME 用户词库推云节流（每次 commit 检查，超间隔才推；idle/unload 无条件 flush）。 */
export const USER_DICT_PUSH_INTERVAL_MS = 2 * 60 * 1000;
/** Left Ctrl 按住多久算「要录」（短按 = 丢弃）。 */
export const PTT_HOLD_MS = 250;
/** 冷首帧后，前台轮询云端新鲜度的周期（reconcilePolicy:"app-driven"）。 */
export const FOREGROUND_POLL_MS = 60_000;

// ── 离线语音识别（硬规则 #8：语音字节永不离开设备；云/系统语音 2026-09-03 sunset）──
/** 模型包默认源（黄线区白名单：只读、逐片 sha256 校验、可被用户在设置里改成任何镜像——网址不写死是反弃坑要求）。 */
export const MODEL_SOURCE_DEFAULT = "https://fangzhangmnm.github.io/pwa-models";
/** 模型包 Cache Storage 名：**家族共享**（同 origin 兄弟 PWA 各自 SW 只清自己前缀，已核实；forceReset 也跳过它）。可再生派生缓存，user 2026-09-03 批。 */
export const MODEL_CACHE_NAME = "pwa-models";
/** sherpa-onnx WASM 运行时目录（相对 app 根；worker 里按 self.location 解析）。 */
export const ASR_WASM_DIR = "vendor/sherpa-onnx-wasm/";

/** Quest 浏览器：编辑区 inputmode=none 关掉 OS IME 组合路径（docs/20260524-quest-ime.md）。 */
export const IS_QUEST_BROWSER = /OculusBrowser|Quest|Wolvic/i.test(globalThis.navigator?.userAgent ?? "");

/** collection 名（云端 `.webxiaoheiwu/<name>.json`；库自动追加 .json）。 */
export const COLLECTIONS = {
  prefs: "synced-user-preference",   // 跨设备偏好：readingMode / voice provider+keys+vocab / lang
  appState: "synced-app-state",      // 跨设备 app 态：lastActive 指针 / 密码 verifier（旧 legacyImport.* 记账键为死数据，不读不删）
  rimeDict: "rime-user-dict",        // RIME 用户词库 dump（单 item "dump"，uat-LWW；可再生）
} as const;
