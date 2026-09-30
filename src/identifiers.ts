// 身份的语法（store 0.16：文档种类表）。created 2026-09-29 by Claude Fable 5.1
//   本 app 有两种文档：书（`<名>.webxiaoheiwu.zip`，zip 容器）和稿（`<名>.txt`，裸字节）。这张表报给 createStore（app-store.ts），
//   同一张表在这里再造一份 identifiers 给纯代码（doc-model.ts）和测试用——两边永远是同一套切法（提案 = store 仓 ai-docs/20260929-proposal-doc-types.md）。
//   这是 @internal/store 的第二个值级 import 点（scripts/build.sh 接缝 lint 里放行）：createIdentifiers 是纯函数，不碰存储、不碰云。
//   用词（user 2026-09-29 定）：identifier 身份 / folder / stem 主干 / suffix 后缀 / kind 种类。name 不再指任何精确的东西。
import { createIdentifiers, type DocKind } from "@internal/store";
import { DOC_EXT, PROJECT_EXT } from "./config.ts";

/** 种类标签沿用 2.0 的 DocKind（"txt" / "project"）。 */
export const DOC_KINDS: readonly DocKind[] = Object.freeze([
  { kind: "project", suffix: PROJECT_EXT, container: "zip" },
  { kind: "txt", suffix: DOC_EXT, container: "raw" },
]);
export const identifiers = createIdentifiers(DOC_KINDS);
