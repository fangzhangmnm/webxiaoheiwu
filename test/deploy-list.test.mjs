// 部署清单守卫（2026-10-17：boot-fatal.js 加进 index.html + SW 预缓存，却漏了 .github/workflows/deploy.yml 的逐个文件清单 → /dev/ 上 404）。
// index.html 引用的本站根目录文件、SW STATIC_PRECACHE 里的根目录文件，必须在 deploy.yml 的 compose 清单里（子目录整个拷，不用列）。created 2026-10-17 by Claude Opus 5.5
import { readFileSync } from "node:fs";
import { describe, it, assert } from "./runner.mjs";

const wf = readFileSync(".github/workflows/deploy.yml", "utf8");
const listed = new Set((wf.match(/for f in ([\s\S]*?); do/)?.[1] ?? "").replace(/\\\n/g, " ").split(/\s+/).filter(Boolean));
const COPIED_DIRS = ["src/", "vendor/", "dist/", "assets/", "probe/"];
const rootFile = (p) => { const x = p.replace(/^\.\//, "").split(/[?#]/)[0]; return x && !x.includes("/") && x !== "" ? x : null; };

describe("deploy-list", () => {
  it("index.html 引用的根目录文件都在 deploy.yml 清单里", () => {
    const html = readFileSync("index.html", "utf8");
    const refs = [...html.matchAll(/\b(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]).filter((p) => !COPIED_DIRS.some((d) => p.replace(/^\.\//, "").startsWith(d)));
    const missing = [...new Set(refs.map(rootFile).filter(Boolean))].filter((f) => !listed.has(f));
    assert(missing.length === 0, "root files referenced by index.html but not deployed: " + missing.join(", "));
  });
  it("SW 预缓存的根目录文件都在 deploy.yml 清单里", () => {
    const sw = readFileSync("service-worker.js", "utf8");
    const pre = (sw.match(/const STATIC_PRECACHE = \[([\s\S]*?)\];/)?.[1] ?? "").match(/"\.\/[^"]*"/g)?.map((s) => s.slice(1, -1)) ?? [];
    const missing = pre.map(rootFile).filter(Boolean).filter((f) => !listed.has(f));
    assert(missing.length === 0, "root files precached by the SW but not deployed: " + missing.join(", "));
  });
});
