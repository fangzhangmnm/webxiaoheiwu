// i18n SSoT 完整性 + SW 预缓存清单对账 + 图标 sprite 对账。created 2026-09-03 by Claude Fable 5.1
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, assert, eq } from "./runner.mjs";
import { S } from "../src/i18n/strings.ts";

function* walk(dir) { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) yield* walk(p); else if (/\.ts$/.test(f)) yield p; } }

describe("i18n", () => {
  it("每条 zh/en 非空", () => {
    for (const [k, v] of Object.entries(S)) { assert(v.zh && v.en, `empty translation: ${k}`); }
  });
  it("src 里 t(\"key\") 与 index.html data-i18n* 的 key 全在 SSoT", () => {
    const missing = new Set();
    for (const p of walk("src")) {
      if (p.endsWith("strings.ts")) continue;
      for (const m of readFileSync(p, "utf8").matchAll(/\bt\(\s*["']([^"']+)["']/g)) if (!(m[1] in S)) missing.add(`${p}: ${m[1]}`);
    }
    const html = readFileSync("index.html", "utf8");
    for (const m of html.matchAll(/data-i18n(?:-title|-aria|-ph)?="([^"]+)"/g)) if (!(m[1] in S)) missing.add(`index.html: ${m[1]}`);
    assert(missing.size === 0, "missing i18n keys:\n" + [...missing].join("\n"));
  });
});

describe("assets", () => {
  it("service-worker.js STATIC_PRECACHE 里每个路径都存在于仓库", () => {
    const sw = readFileSync("service-worker.js", "utf8");
    const list = sw.match(/STATIC_PRECACHE = \[([\s\S]*?)\];/)[1];
    const paths = [...list.matchAll(/"(\.\/[^"]+)"/g)].map((m) => m[1]).filter((p) => p !== "./");
    const missing = paths.filter((p) => !existsSync(p));
    eq(missing.length, 0, "precache paths missing on disk: " + missing.join(", "));
  });
  it("index.html 里每个 <use href=\"#id\"> 在内联 sprite 里有 symbol；src 里的 use 也是", () => {
    const html = readFileSync("index.html", "utf8");
    const symbols = new Set([...html.matchAll(/<symbol[^>]*\bid="([^"]+)"/g)].map((m) => m[1]));
    const missing = [...html.matchAll(/<symbol data-missing="1"[^>]*\bid="([^"]+)"/g)].map((m) => m[1]).filter((id) => [...html.matchAll(/<symbol[^>]*\bid="([^"]+)"/g)].filter((mm) => mm[1] === id).length > 1);
    eq(missing.length, 0, "data-missing placeholder still shadows a stopgap symbol (run tools/inline-sprites.py): " + missing.join(", "));
    assert(symbols.size > 0, "sprite not inlined into index.html (run tools/inline-sprites.py)");
    const used = new Set([...html.matchAll(/<use href="#([^"]+)"/g)].map((m) => m[1]));
    for (const p of walk("src")) for (const m of readFileSync(p, "utf8").matchAll(/href="#([a-z-]+)"|icon\("([a-z-]+)"|useIcon\([^,]+,\s*"([a-z-]+)"|"(lock|unlock|edit-disabled|edit-enabled)"\)/g)) { const id = m[1] || m[2] || m[3] || m[4]; if (id) used.add(id); }
    const missingUse = [...used].filter((id) => !symbols.has(id));
    eq(missingUse.length, 0, "icons used but not in sprite: " + missingUse.join(", "));
  });
  it("bundle 引用：index.html 指向的 dist/xiaoheiwu-<hash>.mjs 存在（构建后）", () => {
    const html = readFileSync("index.html", "utf8");
    const m = html.match(/src="\.\/dist\/(xiaoheiwu-[a-z0-9-]+\.mjs)"/);
    assert(m, "index.html has no bundle reference");
    if (m[1] !== "xiaoheiwu-boot.mjs") assert(existsSync(join("dist", m[1])), `bundle missing: dist/${m[1]} (run scripts/build.sh)`);
    const w = html.match(/<meta name="asr-worker" content="\.\/dist\/(asr-worker-[a-z0-9-]+\.js)"/);
    assert(w, "index.html has no asr-worker meta");
    if (w[1] !== "asr-worker-boot.js") assert(existsSync(join("dist", w[1])), `asr worker bundle missing: dist/${w[1]} (run scripts/build.sh)`);
  });
});
