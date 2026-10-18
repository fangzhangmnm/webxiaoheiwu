// 跑全部测：`npm test`（node 直跑 .ts：node 24 strip-types）。新测文件在这里 import 一行即可。created 2026-09-03 by Claude Fable 5.1
import "./doc-model.test.mjs";
import "./zh-punct.test.mjs";
import "./redline-guard.test.mjs";
import "./i18n-and-assets.test.mjs";
import "./sw-strategy.test.mjs";
import "./crypto-state.test.mjs";
import "./remember-password.test.mjs";   // 2026-10-17 在这台设备上记住密码（≤ 30 天）
import "./asr.test.mjs";
import "./storage-whitelist.test.mjs";
import "./csp-guard.test.mjs";   // 2026-10-17 CSP 不许悄悄放松
import "./deploy-list.test.mjs";   // 2026-10-17 新根文件要进部署清单
import "./project-format.test.mjs";
import "./project-graph.test.mjs";
import "./project-session.test.mjs";
import "./project-naming.test.mjs";
import "./project-cadence.test.mjs";   // 2026-09-10 ADR-0015 书的落盘节律
import "./z-index.test.mjs";
import "./image.test.mjs";
import "./book-cover.test.mjs";   // 2026-09-29 书库封面印书名 + 日期前缀两种写法
import "./long-image.test.mjs";   // 2026-09-30 长图排版：折行 / 避头尾 / 切片（纯函数）
import "./pdf.test.mjs";
import "./cover-title.test.mjs";
import "./embed-text.test.mjs";   // 2026-09-30 PDF 引擎：TTF 解析 / 子集 + PDF 结构（要一款真字体，没有就 SKIP）
import { run } from "./runner.mjs";
console.log("\n  WebXiaoHeiWu —— app 域测试（store 契约在 internal-store/test/）\n");
await run();
import "./first-frame-watchdog.test.ts";   // 2026-09-09 首帧看门狗（从 WeebPaint 搬）
import "./sw-redirect.test.mjs";   // 2026-10-14 离线壳：跳转响应原样交回（家族周账 F-28）
