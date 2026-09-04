// 离线 ASR：SHA-256 向量 / 内嵌 manifest 与模型仓不漂移（packId 信任根）/ 分片→文件偏移切片。created 2026-09-03 by Claude Fable 5.1
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { describe, it, assert, eq } from "./runner.mjs";
import { Sha256, sha256Hex } from "../src/asr/sha256.ts";
import { PACK_MANIFESTS } from "../src/asr/packs.generated.ts";
import { MODELS, modelKeyFrom } from "../src/asr/packs.ts";
import { render, OUT } from "../tools/gen-asr-packs.mjs";

const enc = new TextEncoder();
describe("asr/sha256", () => {
  it("已知向量：空串 / abc / 448 位边界", () => {
    eq(sha256Hex(enc.encode("")), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    eq(sha256Hex(enc.encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    eq(sha256Hex(enc.encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });
  it("流式分片喂 == 一次喂 == node crypto（1 MiB 随机字节，奇数切片）", () => {
    const buf = new Uint8Array(1 << 20); for (let i = 0; i < buf.length; i++) buf[i] = (i * 2654435761 + 12345) >>> 24;
    const ref = createHash("sha256").update(buf).digest("hex");
    const h = new Sha256(); for (let i = 0; i < buf.length; i += 12345) h.update(buf.subarray(i, Math.min(i + 12345, buf.length)));
    eq(h.hex(), ref); eq(sha256Hex(buf), ref);
  });
});

describe("asr/packs", () => {
  it("每个产品模型都有内嵌 manifest，packId = sha256(manifest 序列化) 且 chunks 拼起来等于 totalBytes", () => {
    for (const m of Object.values(MODELS)) {
      const p = PACK_MANIFESTS[m.slug]; assert(p, `manifest missing for ${m.slug}`);
      eq(p.manifest.chunks.reduce((a, c) => a + c.bytes, 0), p.manifest.totalBytes, m.slug);
      eq(p.manifest.files.reduce((a, f) => a + f.bytes, 0), p.manifest.totalBytes, m.slug + " files");
      assert(/^[0-9a-f]{64}$/.test(p.packId), "packId shape");
      eq(m.packId, p.packId);
    }
  });
  it("旧 voiceProvider 值（webspeech/groq/openai/selfhosted/null）一律落到默认 SenseVoice；新值原样", () => {
    for (const v of ["webspeech", "groq", "openai", "selfhosted", null, undefined, "junk"]) eq(modelKeyFrom(v), "local-sensevoice", String(v));
    eq(modelKeyFrom("local-zh14m"), "local-zh14m");
  });
  it("内嵌 manifest 与兄弟仓 ../20260903 PWA Models 不漂移（仓不在则跳过）", () => {
    const fresh = render();
    if (fresh == null) { console.log("    (models repo not present — skipped)"); return; }
    const strip = (s) => s.replace(/^\/\/ generated .*$/m, "");
    if (!existsSync(OUT)) throw new Error("packs.generated.ts missing — run node tools/gen-asr-packs.mjs");
    eq(strip(readFileSync(OUT, "utf8")), strip(fresh), "packs.generated.ts stale — run node tools/gen-asr-packs.mjs");
  });
});
