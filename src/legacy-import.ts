// legacy-import —— v1（≤v81）云端布局的一次性只读导入。created 2026-09-03 by Claude Fable 5.1
//   v1 布局：根 *.txt（**与 v2 身份相同，零迁移**）· .trash/（库同名回收站，直接可见）· .enc/enc-*.bin（自研 AES-GCM 容器）
//   · .crypto/{salt.json,verifier.bin} · voice.json · .userdata/{last-active,rime-user-dir}.json。
//   本模块只**读**旧路径（经 app-store 暴露的 provider 只读面）；**旧文件永不改写/删除**（JRP 迁移先例）。
//   导入结果写进新家：偏好/词库 → collection；加密稿 → 解密后以**新**统一密码重新加密成 v2 稿（库容器）。
//   v1 AES-GCM 格式（docs/20260524-encryption.md）："XHWENC\0"(7) ver(1) iv(12) | GCM(ct+tag)；明文 = u32LE len | json | 零填充。
import { legacyReadProvider, appState, prefs, rimeDict } from "./app-store.ts";
import { LEGACY } from "./config.ts";
import { createDoc, encryptDoc } from "./docs.ts";
import { formatDate } from "./doc-model.ts";
import type { UserDictDump } from "./ime.ts";

const MARK_PREFS = "legacyImport.prefs";
const MARK_DICT = "legacyImport.rimeDict";
const MARK_ENC = "legacyImport.encrypted";

async function readJson<T>(path: string): Promise<T | null> {
  const item = await legacyReadProvider.getItemByPath(path);
  if (!item) return null;
  const blob = await legacyReadProvider.download(item.ref);
  try { return JSON.parse(await blob.text()) as T; } catch { return null; }
}
async function readBytes(path: string): Promise<Uint8Array | null> {
  const item = await legacyReadProvider.getItemByPath(path);
  if (!item) return null;
  return new Uint8Array(await (await legacyReadProvider.download(item.ref)).arrayBuffer());
}

/** 偏好 + 词库：登录后静默跑一次（幂等，marker 守卫；只填新家里**没有**的值）。返回导入了什么。 */
export async function importLegacyPrefsAndDict(): Promise<{ voice: boolean; dict: boolean }> {
  const out = { voice: false, dict: false };
  if (!appState.getItem(MARK_PREFS)) {
    // v1 voice.json（Web Speech/Groq/OpenAI 的 provider + key）**不再搬**：云语音 2026-09-03 sunset（家规硬规则 #8），
    // 没理由把旧 API key 复制进新家的 synced 偏好。只落 marker 保持幂等；文件本身只读遗留、不删（ADR-0004）。
    appState.setItem(MARK_PREFS, { at: Date.now(), found: false, skipped: "voice.json (cloud voice sunset 2026-09-03)" });
  }
  if (!appState.getItem(MARK_DICT)) {
    try {
      const dump = await readJson<UserDictDump>(LEGACY.RIME_DICT);
      if (dump?.files?.length && rimeDict.getItem("dump") == null) { rimeDict.setItem("dump", dump); out.dict = true; }
      appState.setItem(MARK_DICT, { at: Date.now(), found: !!dump });
    } catch (e) { console.warn("[legacy] rime dict import failed", e); }
  }
  return out;
}

export function legacyEncryptedImported(): boolean { return !!appState.getItem(MARK_ENC); }

/** 旧 .enc/ 里有几份加密稿（不含 .enc/.trash）。null = 探不到（离线/未登录）。 */
export async function countLegacyEncrypted(): Promise<number | null> {
  try {
    const items = await legacyReadProvider.list(LEGACY.ENC_FOLDER);
    return items.filter((it) => !it.isFolder && /\.bin$/i.test(it.name)).length;
  } catch { return null; }
}

// ── v1 AES-GCM 解密（只读路径；与 v1 crypto.js 逐字节同格式）──
const MAGIC = [0x58, 0x48, 0x57, 0x45, 0x4e, 0x43, 0x00];
const HEADER_LEN = 8, IV_LEN = 12, TAG_BITS = 128;
const VERIFIER_PLAINTEXT = "XHW-VERIFIER-1";
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveLegacyKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
}
async function decryptLegacyBlob(key: CryptoKey, blob: Uint8Array): Promise<string> {
  if (blob.length < HEADER_LEN + IV_LEN + 16) throw new Error("legacy blob too short");
  for (let i = 0; i < MAGIC.length; i++) if (blob[i] !== MAGIC[i]) throw new Error("not a legacy XHWENC blob");
  const iv = blob.subarray(HEADER_LEN, HEADER_LEN + IV_LEN);
  const ct = blob.subarray(HEADER_LEN + IV_LEN);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource, tagLength: TAG_BITS }, key, ct as BufferSource));
  const view = new DataView(plain.buffer, plain.byteOffset, plain.byteLength);
  const len = view.getUint32(0, true);
  if (len > plain.length - 4) throw new Error("legacy payload length corrupt");
  return new TextDecoder().decode(plain.subarray(4, 4 + len));
}

export interface LegacyEncImportProgress { done: number; total: number; name?: string }
export type LegacyEncImportResult = { status: "ok"; imported: number; failed: string[] } | { status: "wrong-password" } | { status: "no-setup" } | { status: "nothing" };

/** 导入旧加密稿：旧密码验 verifier（错密码不碰任何文件）→ 逐份解密 → 以新统一密码建 v2 加密稿。调用方须已解锁新密码（ensureUnlocked）。 */
export async function importLegacyEncrypted(oldPassphrase: string, onProgress?: (p: LegacyEncImportProgress) => void): Promise<LegacyEncImportResult> {
  const setup = await readJson<{ salt: string; iterations?: number }>(LEGACY.SALT_PATH);
  if (!setup?.salt) return { status: "no-setup" };
  const key = await deriveLegacyKey(oldPassphrase, unb64(setup.salt), setup.iterations ?? 600_000);
  const verifier = await readBytes(LEGACY.VERIFIER_PATH);
  if (!verifier) return { status: "no-setup" };
  try {
    const json = JSON.parse(await decryptLegacyBlob(key, verifier)) as { v?: string };
    if (json.v !== VERIFIER_PLAINTEXT) return { status: "wrong-password" };
  } catch { return { status: "wrong-password" }; }

  const items = (await legacyReadProvider.list(LEGACY.ENC_FOLDER)).filter((it) => !it.isFolder && /\.bin$/i.test(it.name));
  if (!items.length) { appState.setItem(MARK_ENC, { at: Date.now(), imported: 0 }); return { status: "nothing" }; }
  let imported = 0; const failed: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    onProgress?.({ done: i, total: items.length, name: it.name });
    try {
      const bytes = new Uint8Array(await (await legacyReadProvider.download(it.ref)).arrayBuffer());
      const payload = JSON.parse(await decryptLegacyBlob(key, bytes)) as { title?: string; content?: string; createdAt?: number };
      const date = formatDate(payload.createdAt || Date.parse(String(it.lastModifiedDateTime)) || Date.now());
      const name = await createDoc(payload.title ?? "", payload.content ?? "", date);
      await encryptDoc(name);
      imported++;
    } catch (e) { console.warn("[legacy] encrypted doc import failed", it.name, e); failed.push(it.name); }
  }
  onProgress?.({ done: items.length, total: items.length });
  appState.setItem(MARK_ENC, { at: Date.now(), imported, failed });
  return { status: "ok", imported, failed };
}
