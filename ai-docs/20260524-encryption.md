# Per-file encryption (AES-GCM)

> ⚠ as-of v0.0.82 / 2026-09-03（v2 换代，edited by Claude Fable 5.1）：容器换成 `@internal/encryption`（明文 zip 壳 + 7z AES-256，7-Zip 可开），云端 at-rest 名 = `YYYYMMDD 标题.txt.zip`（标题可见——与 v1 随机名不同，见 adr/0002）；统一密码 + verifier 记录住 synced collection；`.crypto/` `.enc/` 不读不删（2026-09-03 起不做 backward compatibility，adr/0004 superseded）。**仍有效**：威胁模型、不自动弹框、错密码不污染任何文件、解密需警告、加密稿禁云端语音、明文永不落持久层（库 seal 保证）。


Optional per-doc encryption added on top of the existing sync layer. Goal: make encrypted drafts opaque to Microsoft server-side scanning, while a user who never touches the feature sees zero friction.

## Threat model is narrow on purpose

- **In scope:** Microsoft (and anyone with read access to the OneDrive blobs) cannot read draft content or titles.
- **Out of scope:** an attacker with control of an unlocked, signed-in device. The key lives in JS heap during a session — they'd see plaintext just like the user does.
- **Out of scope:** "I forgot my password, please help" — no recovery, by design. No backdoor.

State the threat model out loud before designing. The user pushed back early on anything that smelled like cloud-stored recovery ("MS cannot know my key").

## Algorithm choices (and what I rejected)

- **AES-GCM-256 + PBKDF2-SHA256 (600k iterations)** via WebCrypto. Hardware-accelerated on every modern device, authenticated, zero third-party deps.
- **Rejected Argon2** — would mean vendoring a WASM blob (~200KB) for a personal-use threat where PBKDF2 is enough. The format leaves a `kdf` field in `salt.json` so it's a one-line upgrade later.
- **Rejected libsodium / custom** — same reason. WebCrypto is right.
- **Random 96-bit IV per encryption** — safe up to ~2³² messages per key. Don't ever derive IVs from content.

The user wanted to understand each choice ("盐是什么意思？"). Be ready to explain *why* PBKDF2 needs a salt, *why* GCM is authenticated, *what* the iteration count protects against — not just "trust me."

## File layout on OneDrive

```
Apps/<AppName>/
├── .crypto/
│   ├── salt.json        ← {salt: base64, iterations, kdf: "pbkdf2-sha256"}
│   └── verifier.bin     ← encrypt("XHW-VERIFIER-1") under derived key
├── .enc/
│   ├── enc-<8hex>.bin   ← encrypted docs (random names, no metadata leak)
│   └── .trash/          ← mirrors .trash/ but for encrypted docs
└── <plaintext docs>.txt ← unaffected
```

Salt is public — its job is to make precomputed rainbow tables useless. The verifier is the cleanest way to reject wrong passphrases without ever decrypting a user file. **Crucial invariant:** if PBKDF2 → key → decrypt verifier blob fails GCM authentication, that key never touches any user-encrypted file. The verifier is a one-shot known-plaintext blob (`"XHW-VERIFIER-1"`).

Random 8-hex filenames in `.enc/` so MS sees no titles/dates in the file listing.

## Blob format

```
"XHWENC\0" (7B) | ver u8 (1B) | iv (12B) | AES-GCM ciphertext (incl. 16B tag)
```

Inside the ciphertext, the plaintext payload is:

```
u32 LE: jsonByteLen | json bytes (utf-8) | zero padding
```

Where JSON is `{ title, content, createdAt, modifiedAt }`. Title goes inside the encrypted payload, *not* the filename. Pad to a multiple of `PAD_BLOCK` (16 KB) so file size on OneDrive only leaks the draft's bucket, not its exact length.

## IndexedDB stores the ciphertext, not plaintext

This is the single most important invariant for a "MS-can't-scan" threat model. For encrypted docs:

- IDB row carries `encryptedBlob: Uint8Array` (same bytes as the OneDrive blob).
- `content`, `title`, `createdAt` on the IDB row are **zero/empty/zero**. Plaintext lives only in `state.activeDoc.{title,content,createdAt}` in JS heap, populated by decrypting the blob after unlock.
- On every autosave we re-encrypt the in-memory plaintext into a fresh blob (new IV) and write that blob to IDB.
- On `lockCrypto()`, wipe `state.activeDoc.{title,content,createdAt}` for the active doc and clear the in-memory `titleCache: Map<docId, {title, createdAt}>`.

If you write plaintext anywhere persistent, you've defeated the encryption. Audit `updateDoc` callsites — every save path needs a branch that detects encrypted docs and routes through an `encryptDoc → IDB.encryptedBlob` writer.

## "Don't pollute on failure" is load-bearing

The user articulated this explicitly: **wrong passphrase must not modify any file.** The verifier pattern enforces it structurally:

1. Compute key from passphrase + salt.
2. Try to decrypt `verifier.bin`. GCM auth fails → reject as "wrong password," do nothing else.
3. Only on verifier success, store the key in module-level memory and let user-file decryption proceed.
4. If a user-file decrypt ever fails *after* the verifier passes, the file's blob in IDB is left untouched. Show an error; don't write empty/garbage to `content`.

Concretely: `decryptDocAction` is the only path that converts ciphertext back to plaintext storage. It will not write to IDB unless decrypt succeeded.

## Each save re-encrypts the WHOLE doc (no delta)

This is unavoidable with random-IV authenticated encryption. Consequences to surface to the user:

- A 1000-word draft produces a 16KB blob (one padding block). A 60k-char draft produces ~180KB.
- Every save uploads the whole blob, not a delta. The existing debounce (15s + 30s heartbeat) protects bandwidth.
- The user once asked "为什么我随便写了几行字就 175KB 的 bin 了" — actually that turned out to be a separate bug (see below), but the math holds: 60K chars Chinese is 175KB encrypted, and the blob is the full doc each time.

Don't try to be clever (chunk-and-delta-encrypt) without first asking; chunked encryption leaks which chunks changed every save.

## Voice input on encrypted docs

Web Speech (browser STT) and Whisper-via-Groq/OpenAI both ship audio to a cloud service. Dictating into an encrypted doc through any of them defeats the point of encrypting on OneDrive. So the mic button is **greyed but visible** on encrypted docs unless the voice backend is local. A `voiceProviderIsLocal()` predicate returns `true` only for a `"selfhosted"` provider (placeholder for an upcoming self-hosted Whisper backend); for now it always returns false on encrypted docs.

> **2026-09-03 update (Claude Fable 5.1):** this whole gate is gone — voice is local-only now (family hard rule #8), so encrypted drafts accept dictation like any other draft. See `20260903-offline-voice.md`.

Apply the same gate to PTT (push-to-talk). One predicate, two consumers.

## UX: don't make non-users see encryption at all

The user was firm: if I never use encryption, I should never see a password modal. So:

- **No auto-prompt at startup**, even if the active doc happens to be encrypted (e.g. last-active from another device). Editor renders blank with a "已加密 · 点钥匙图标解锁" status hint.
- Prompt fires only when the user actively asks: clicks the key toggle, clicks an encrypted doc in the drawer, etc.
- Cancel-on-modal is a real option. Returning `null` from `ensureUnlocked()` is a no-op, not an error.
- The auto-switch to "last active doc across devices" silently skips encrypted docs when the session is locked — don't yank the user into a prompt they didn't ask for.

This was a meaningful change from my first cut, which auto-prompted at init. Always make the high-friction security path opt-in.

## Decrypt action = irreversible (for privacy)

Toggling a doc from encrypted back to plaintext writes a plaintext `.txt` to OneDrive. Even if the user immediately re-encrypts, that plaintext window is enough for MS-side scanning. So the action needs a `confirm()` with an explicit warning: "解密会把明文上传到 OneDrive — 即使你之后再次加密，这一次的明文有可能已被云端扫描。"

The encrypt action doesn't need a confirm — it's a privacy-improving move.

## Busy overlay reused for PBKDF2 wait

PBKDF2 at 600k iterations takes 1–2 seconds on a Quest. Without a visible blocking UI, users assume the button is broken and click again. Reuse the existing `idle-overlay` styling (same dim+card chrome) as a `busy-overlay`. Set text to "派生加密密钥…" / "加密中…" / "解密中…" with a "请稍候" sub-hint. Hide on `finally`.

Same overlay covers: first-time setup, unlock, encrypt-doc, decrypt-doc. Don't make a separate spinner for each.

## Icon split: pencil-slash for read-only, key for encryption

The pre-existing "lock" icon was a read-only toggle. Adding encryption needed a *different* icon to avoid conflating "this doc can't be edited" with "this doc is encrypted." Final:

- **Pencil with diagonal slash** → read-only (the existing `locked: true` flag).
- **Key (filled = encrypted, outline = plaintext)** → encryption toggle.

Don't use emoji for either. SVG inline, recolorable via `currentColor`.

## Block input when locked-no-key

The textarea's `readOnly` attribute hides the caret (per [20260524-editor-ux.md](20260524-editor-ux.md)). Same trick as the read-only flag: block edits via `beforeinput`/`paste`/`cut`/`drop` event preventDefault. Extend the existing `blockIfLocked` handler to also check `encrypted && !isUnlocked()`. Same for the IME keydown gate and the PTT trigger.

If you forget this, the user can type into a "blank" editor; the keystrokes have nowhere to land (autosave gated on `isUnlocked()`), so the text vanishes on next render. Brutally confusing.

## Cross-device key bootstrap

- Device A: user clicks key → first-time setup modal → passphrase + confirm → write `salt.json` + `verifier.bin`.
- Device B: opens the app, salt.json already exists → setup modal skipped, unlock modal shown when user actually tries to access encrypted content.
- The unlock probe (`loadCryptoSetup`) is force-refreshed inside `ensureUnlocked()` before deciding setup-vs-unlock, so a parallel-device setup race doesn't lock the user out.

Salt + verifier on OneDrive are the only persistent crypto artifacts the app writes outside `.enc/`. The session key never persists.

## Lock before flushing, flush before locking

When the user clicks "锁定加密" (drops the in-memory key):

1. `await flushSaves()` first — pending edits get re-encrypted to IDB before the key disappears, otherwise the last few typed seconds are stuck in the textarea with no way back.
2. Wipe `state.activeDoc.{content,title,createdAt}`.
3. `lockCrypto()` (drops key) + clear `titleCache`.
4. Re-render editor, crypto toggle, doc list.

Same pattern for sign-out: flush, then lock, then drop auth.

## beforeunload can't sync-encrypt

The plaintext `keepalive` PUT in `beforeunload` doesn't work for encrypted docs — you'd have to await `crypto.subtle.encrypt()` and the browser doesn't give you that time. Just skip the keepalive for encrypted docs. The autosave path already wrote the latest ciphertext to IDB; the next session will push it when online. Don't try to be clever; you'll lose data.

## Misc gotcha: `graphFetch` body serialization

The shared `graphFetch` helper had:

```js
if (typeof body === "string" || body instanceof ArrayBuffer || body instanceof Blob) {
  init.body = body;
} else {
  init.body = JSON.stringify(body);    // ← catches Uint8Array here
}
```

A `Uint8Array` is **none of those three**, so it got JSON-stringified into `{"0":byte,"1":byte,...}` — a ~10× bloat. The 16KB encrypted blobs were hitting OneDrive as 178KB JSON garbage, and the verifier couldn't be decoded on the next session.

Fix: `ArrayBuffer.isView(body)` catches all TypedArrays and DataView. Fetch accepts these as body directly.

Lesson: any generic "body or JSON?" helper should accept `ArrayBuffer.isView()` explicitly. Bug had been latent for a while — encryption surfaced it because nothing else uploaded binary bodies through this path.

## Discipline reminders

- **`APP_VERSION` (in `src/app.js`) and `CACHE_VERSION` (in `service-worker.js`) must be bumped together.** I bumped CACHE_VERSION three times during this work and forgot APP_VERSION every time. The user noticed when the settings drawer kept showing the old version label. Lockstep them in your head; consider adding a CI check.
- **Don't write to the user's OneDrive folder, even for "obviously safe" cleanup.** See [20260524-working-with-this-user.md](20260524-working-with-this-user.md). Reading is fine; offering a `rm -rf` is not.
