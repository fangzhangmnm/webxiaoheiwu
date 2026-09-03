// 红线守卫（结构性，非行为）：接缝之外不得出现第二条存储/云路径。created 2026-09-03 by Claude Fable 5.1
//   白名单：src/app-store.ts（store 接缝）、src/device-kv.ts（localStorage 唯一器官）、src/ime.ts（RIME worker 自持 IDB 属第三方派生缓存，代码里只是注释）。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, assert } from "./runner.mjs";

const SEAM = new Set(["src/app-store.ts", "src/device-kv.ts", "src/config.ts"]);   // config = 常量 SSoT（URL/路径字符串，不是访问）
const BAD = [
  { re: /\blocalStorage\b/, why: "raw localStorage" },
  { re: /\bindexedDB\b|\bIDBDatabase\b/, why: "raw IndexedDB" },
  { re: /PublicClientApplication|msal-browser|loginRedirect|acquireToken/, why: "raw MSAL" },
  { re: /graph\.microsoft\.com|login\.microsoftonline\.com/, why: "raw Graph/AAD URL" },
  { re: /\bcaches\.(open|keys|delete)\b/, why: "Cache Storage outside SW/pwa-shell" },
];
const ALLOW_CACHES = new Set(["src/pwa-shell.ts"]);
function* walk(dir) { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) yield* walk(p); else if (/\.ts$/.test(f)) yield p; } }

describe("redline-guard", () => {
  it("src/ 里接缝之外零裸 localStorage / IDB / MSAL / Graph", () => {
    const hits = [];
    for (const p of walk("src")) {
      const rel = p.replace(/\\/g, "/");
      if (SEAM.has(rel)) continue;
      readFileSync(p, "utf8").split("\n").forEach((line, i) => {
        if (/^\s*\/\//.test(line)) return;   // 注释行豁免（说明性提及）
        for (const { re, why } of BAD) {
          if (why.startsWith("Cache Storage") && ALLOW_CACHES.has(rel)) continue;
          if (re.test(line)) hits.push(`${rel}:${i + 1} [${why}] ${line.trim().slice(0, 100)}`);
        }
      });
    }
    assert(hits.length === 0, "red-line guard hits:\n" + hits.join("\n"));
  });
  it("@internal/store 值级 import 只在 src/app-store.ts；@internal/encryption 只在 src/encryption.ts", () => {
    const hits = [];
    for (const p of walk("src")) {
      const rel = p.replace(/\\/g, "/");
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(/^import\s+(type\s+)?[^;]*?from\s+["'](@internal\/(store|encryption))["']/gm)) {
        const isType = !!m[1];
        if (isType) continue;
        if (m[2] === "@internal/store" && rel !== "src/app-store.ts") hits.push(`${rel}: ${m[0]}`);
        if (m[2] === "@internal/encryption" && rel !== "src/encryption.ts") hits.push(`${rel}: ${m[0]}`);
      }
    }
    assert(hits.length === 0, "seam violations:\n" + hits.join("\n"));
  });
});
