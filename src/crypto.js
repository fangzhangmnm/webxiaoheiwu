// Per-file passphrase-derived AES-GCM encryption for sensitive drafts.
//
// Threat model: keep ciphertext on OneDrive opaque to Microsoft and to anyone
// with read access to the OneDrive blobs. The passphrase never leaves the
// browser; the derived key never touches IndexedDB or any persistent store.
//
// Format on disk (and in IDB.encryptedBlob, same bytes):
//
//   "XHWENC\0" (7)  ver u8 (1)  iv (12)   AES-GCM ciphertext including tag
//   └─ 8 bytes header ─┘        └─ 12 ─┘  └─ payload + 16-byte tag ────┘
//
// Plaintext payload before encryption:
//   u32 LE: jsonByteLen  |  json bytes (utf-8)  |  zero padding
// Total file size is padded to a multiple of PAD_BLOCK to hide draft length.
//
// salt + iteration count + KDF identifier live in OneDrive at
// `.crypto/salt.json`. Wrong-passphrase detection uses `.crypto/verifier.bin`
// (a tiny known-plaintext blob): if the derived key fails GCM auth on the
// verifier, we know the passphrase is wrong WITHOUT touching any user file.

import {
  readJsonFromAppFolder,
  writeJsonToAppFolder,
  readBinaryFromAppFolder,
  writeBinaryFromAppFolder,
} from "./onedrive.js";

const MAGIC = new Uint8Array([0x58, 0x48, 0x57, 0x45, 0x4e, 0x43, 0x00]); // "XHWENC\0"
const VERSION = 1;
const HEADER_LEN = MAGIC.length + 1; // 8
const IV_LEN = 12;
const TAG_LEN = 16;
const PAD_BLOCK = 16 * 1024; // round file size up to multiples of 16KB
const KDF_ITERATIONS = 600_000;
const SALT_LEN = 16;

const SALT_PATH = ".crypto/salt.json";
const VERIFIER_PATH = ".crypto/verifier.bin";
const VERIFIER_KNOWN_PLAINTEXT = "XHW-VERIFIER-1";

let sessionKey = null; // CryptoKey | null. Wiped on lock; never persisted.
let setupCache = null; // { salt: Uint8Array, iterations, kdf } | null

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(n) {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

async function deriveKeyFromPassphrase(passphrase, salt, iterations) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// Build the padded plaintext payload: [u32 LE len][json][zeros].
// Total file size (header + iv + ciphertext + tag) becomes a multiple of PAD_BLOCK.
function buildPaddedPayload(jsonBytes) {
  const jsonLen = jsonBytes.length;
  const minTotal = HEADER_LEN + IV_LEN + 4 + jsonLen + TAG_LEN;
  const paddedTotal = Math.ceil(minTotal / PAD_BLOCK) * PAD_BLOCK;
  const payloadLen = paddedTotal - HEADER_LEN - IV_LEN - TAG_LEN;
  const payload = new Uint8Array(payloadLen);
  const view = new DataView(payload.buffer);
  view.setUint32(0, jsonLen, true); // LE
  payload.set(jsonBytes, 4);
  // Trailing bytes are zero-initialised by Uint8Array; that's our padding.
  return payload;
}

function parsePaddedPayload(payload) {
  if (payload.length < 4) throw new Error("payload too short");
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const jsonLen = view.getUint32(0, true);
  if (jsonLen > payload.length - 4) throw new Error("payload length corrupt");
  const jsonBytes = payload.subarray(4, 4 + jsonLen);
  return new TextDecoder().decode(jsonBytes);
}

// ── Session key state ────────────────────────────────────────────────────

export function isUnlocked() {
  return sessionKey !== null;
}

export function lockCrypto() {
  sessionKey = null;
}

// ── Crypto setup state on OneDrive ───────────────────────────────────────

// Returns { exists, salt, iterations, kdf } — `exists=false` means no setup yet.
export async function loadCryptoSetup({ force = false } = {}) {
  if (setupCache && !force) return { exists: true, ...setupCache };
  let json;
  try {
    json = await readJsonFromAppFolder(SALT_PATH);
  } catch (error) {
    if (error.status === 404) return { exists: false };
    throw error;
  }
  if (!json) return { exists: false };
  const salt = base64ToBytes(json.salt);
  setupCache = {
    salt,
    iterations: json.iterations ?? KDF_ITERATIONS,
    kdf: json.kdf ?? "pbkdf2-sha256",
  };
  return { exists: true, ...setupCache };
}

// First-time setup: caller supplies a passphrase. Generates salt + verifier
// and writes them to OneDrive. Leaves the session unlocked on success.
export async function setupCrypto(passphrase) {
  if (!passphrase || passphrase.length === 0) throw new Error("空密码");
  const existing = await loadCryptoSetup({ force: true });
  if (existing.exists) {
    throw new Error("加密已经设置过，请使用现有密码解锁");
  }
  const salt = randomBytes(SALT_LEN);
  const iterations = KDF_ITERATIONS;
  const kdf = "pbkdf2-sha256";
  const key = await deriveKeyFromPassphrase(passphrase, salt, iterations);

  // Write verifier first so partial-setup leaves no half-state.
  const verifierBlob = await encryptKnownPlaintextUnderKey(key);

  await writeJsonToAppFolder(SALT_PATH, {
    version: 1,
    kdf,
    iterations,
    salt: bytesToBase64(salt),
  });
  await writeBinaryFromAppFolder(VERIFIER_PATH, verifierBlob);

  setupCache = { salt, iterations, kdf };
  sessionKey = key;
}

// Unlock with an existing setup. Throws on wrong passphrase WITHOUT touching
// any user document.
export async function unlockCrypto(passphrase) {
  if (!passphrase) throw new Error("空密码");
  const setup = await loadCryptoSetup();
  if (!setup.exists) throw new Error("未设置加密");
  const key = await deriveKeyFromPassphrase(passphrase, setup.salt, setup.iterations);

  let verifierBytes;
  try {
    verifierBytes = await readBinaryFromAppFolder(VERIFIER_PATH);
  } catch (error) {
    if (error.status === 404) throw new Error("校验文件丢失，无法验证密码");
    throw error;
  }
  if (!verifierBytes) throw new Error("校验文件丢失，无法验证密码");

  let recovered;
  try {
    recovered = await decryptWithKey(key, verifierBytes);
  } catch {
    throw new Error("密码错误");
  }
  if (recovered !== VERIFIER_KNOWN_PLAINTEXT) {
    throw new Error("密码错误");
  }
  sessionKey = key;
}

async function encryptKnownPlaintextUnderKey(key) {
  const json = JSON.stringify({ v: VERIFIER_KNOWN_PLAINTEXT });
  const jsonBytes = new TextEncoder().encode(json);
  const payload = buildPaddedPayload(jsonBytes);
  const iv = randomBytes(IV_LEN);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: TAG_LEN * 8 }, key, payload),
  );
  return packBlob(iv, cipher);
}

// ── Per-doc encrypt / decrypt ────────────────────────────────────────────

// Pack header + iv + ciphertext into a single Uint8Array.
function packBlob(iv, ciphertext) {
  const out = new Uint8Array(HEADER_LEN + IV_LEN + ciphertext.length);
  out.set(MAGIC, 0);
  out[MAGIC.length] = VERSION;
  out.set(iv, HEADER_LEN);
  out.set(ciphertext, HEADER_LEN + IV_LEN);
  return out;
}

function unpackBlob(blob) {
  if (blob.length < HEADER_LEN + IV_LEN + TAG_LEN) {
    throw new Error("加密文件损坏（太短）");
  }
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (blob[i] !== MAGIC[i]) throw new Error("不是加密文件（魔数不匹配）");
  }
  const version = blob[MAGIC.length];
  if (version !== VERSION) throw new Error(`不支持的加密版本 ${version}`);
  const iv = blob.subarray(HEADER_LEN, HEADER_LEN + IV_LEN);
  const ciphertext = blob.subarray(HEADER_LEN + IV_LEN);
  return { iv, ciphertext };
}

// Decrypt with a specific key. Returns the recovered JSON string. Used both
// by the verifier check and by decryptDoc — the verifier path lets us reject
// a wrong passphrase before any user-file decrypt is even attempted.
async function decryptWithKey(key, blob) {
  const { iv, ciphertext } = unpackBlob(blob);
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: TAG_LEN * 8 }, key, ciphertext),
  );
  const json = parsePaddedPayload(plaintext);
  return JSON.parse(json).v;
}

// Encrypt a doc payload (title/content/createdAt/modifiedAt) using the
// in-memory session key. Throws if locked.
export async function encryptDoc(payload) {
  if (!sessionKey) throw new Error("未解锁");
  const json = JSON.stringify(payload);
  const jsonBytes = new TextEncoder().encode(json);
  const padded = buildPaddedPayload(jsonBytes);
  const iv = randomBytes(IV_LEN);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: TAG_LEN * 8 },
      sessionKey,
      padded,
    ),
  );
  return packBlob(iv, cipher);
}

// Decrypt a doc blob using the session key. Throws on any failure — caller
// is responsible for NOT writing anything to IDB on failure.
export async function decryptDoc(blob) {
  if (!sessionKey) throw new Error("未解锁");
  const { iv, ciphertext } = unpackBlob(blob);
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: TAG_LEN * 8 },
      sessionKey,
      ciphertext,
    ),
  );
  const json = parsePaddedPayload(plaintext);
  return JSON.parse(json);
}

// Probe whether a blob looks like our format (without decrypting).
export function looksEncrypted(blob) {
  if (!blob || blob.length < HEADER_LEN) return false;
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (blob[i] !== MAGIC[i]) return false;
  }
  return true;
}

// Random filename for new encrypted files: enc-<8 hex>.bin.
export function newEncryptedFilename() {
  const bytes = randomBytes(4);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `enc-${hex}.bin`;
}
