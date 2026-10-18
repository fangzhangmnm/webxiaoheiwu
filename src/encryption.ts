// encryption 器官 —— app 的内容加密单例（@internal/encryption 实例）。created 2026-09-03 by Claude Fable 5.1
// store 经 config.encryption 收**同一实例**（EncryptionPort 依赖倒置）；codec = vendored zip.js + 7z-wasm，惰性加载不拖 boot。
// 这是 @internal/encryption 在本仓的**唯一值级 import 点**（build.sh lint 守着）。
import { createEncryption, createPasswordKeeper, type PasswordKeeper } from "@internal/encryption";
import { zipPack, zipUnpack } from "./zip.ts";
import { pack7z, unpack7z } from "./sevenzip.ts";
import { reportError } from "./error-badge.ts";
import { REMEMBER_DB } from "./config.ts";

export const appEncryption = createEncryption({
  codec: { zipPack, zipUnpack, pack7z, unpack7z },
  reportError: (e) => reportError(e instanceof Error ? e : new Error(String(e)), "log"),   // 探测容错路径 = 良性
});

// 「在这台设备上记住密码」（0.2.0+；user 2026-10-17，≤ 30 天）：本机 IDB `webxiaoheiwu-remember`。惰性建（node 测试里没有 indexedDB）。
//   只准 src/remember-password.ts 用（test/storage-whitelist 守着）。added by Claude Opus 5.5 2026-10-17
let _keeper: PasswordKeeper | null = null;
export const passwordKeeper = (): PasswordKeeper => (_keeper ??= createPasswordKeeper({ dbName: REMEMBER_DB }));
