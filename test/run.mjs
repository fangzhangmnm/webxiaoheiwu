// 跑全部测：`npm test`（node 直跑 .ts：node 24 strip-types）。新测文件在这里 import 一行即可。created 2026-09-03 by Claude Fable 5.1
import "./doc-model.test.mjs";
import "./zh-punct.test.mjs";
import "./redline-guard.test.mjs";
import "./i18n-and-assets.test.mjs";
import "./sw-strategy.test.mjs";
import "./crypto-state.test.mjs";
import "./asr.test.mjs";
import "./storage-whitelist.test.mjs";
import { run } from "./runner.mjs";
console.log("\n  WebXiaoHeiWu —— app 域测试（store 契约在 internal-store/test/）\n");
await run();
