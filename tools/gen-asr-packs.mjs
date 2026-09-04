// tools/gen-asr-packs.mjs —— 从兄弟仓 `../20260903 PWA Models`（GitHub fangzhangmnm/pwa-models）把每个包的 manifest.json
// 原样内嵌成 src/asr/packs.generated.ts：packId = sha256(manifest.json 字节) 就是 app 钉的信任根。
// 用法：node tools/gen-asr-packs.mjs（模型仓改了包必须重跑；test/asr.test.mjs 守着不漂移）。生成物勿手改。
// created 2026-09-03 by Claude Fable 5.1
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MODELS_DIR = join(ROOT, "..", "20260903 PWA Models", "packs");
export const OUT = join(ROOT, "src", "asr", "packs.generated.ts");

export function render() {
  if (!existsSync(MODELS_DIR)) return null;
  const entries = [];
  for (const slug of readdirSync(MODELS_DIR).sort()) {
    const p = join(MODELS_DIR, slug, "manifest.json");
    if (!existsSync(p)) continue;
    const bytes = readFileSync(p);
    entries.push({ slug, packId: createHash("sha256").update(bytes).digest("hex"), manifest: JSON.parse(bytes.toString("utf8")) });
  }
  const body = entries.map((e) => `  ${JSON.stringify(e.slug)}: { packId: ${JSON.stringify(e.packId)}, manifest: ${JSON.stringify(e.manifest)} },`).join("\n");
  return `// 生成物：node tools/gen-asr-packs.mjs（源 = ../20260903 PWA Models/packs/*/manifest.json）。勿手改。
// packId = sha256(manifest.json 原字节) = app 钉死的信任根；分片字节从任何主机/文件/网盘来都先对 manifest.chunks[].sha256 再用。
// generated ${new Date().toLocaleDateString("sv-SE")} by tools/gen-asr-packs.mjs (Claude Fable 5.1)
export interface PackFile { path: string; bytes: number; offset: number; sha256: string }
export interface PackChunk { name: string; bytes: number; sha256: string }
export interface PackManifest {
  v: number; slug: string; name: string; task: string; lang: string[]; engine: string;
  engineConfig: { type: "offline" | "online"; modelConfig: Record<string, unknown> & { tokens: string }; [k: string]: unknown };
  files: PackFile[]; chunkBytes: number; chunks: PackChunk[]; totalBytes: number; sha256: string;
  license: { name: string; file: string; sha256: string; attribution: string }; source: { model: string; converted: string; file: string };
  notes: string; createdAt: string; createdBy: string;
}
export const PACK_MANIFESTS: Record<string, { packId: string; manifest: PackManifest }> = {
${body}
};
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = render();
  if (!out) { console.error("[gen-asr-packs] models repo not found at", MODELS_DIR); process.exit(1); }
  writeFileSync(OUT, out);
  console.log("[gen-asr-packs] →", OUT);
}
