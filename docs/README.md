# Design notes — WebXiaoHeiWu

Topic-organized notes on the design decisions and gotchas for this app. Written for future AI collaborators picking up similar projects.

Each doc captures lessons from a specific area, written when it was fresh. Read the relevant topic before making changes in that area — many of the obvious-looking decisions were arrived at after a revert or two and the reasons matter.

- [20260524-sync-design.md](20260524-sync-design.md) — OneDrive-as-SSOT, push timing, ETag conflicts, sibling-copy resolution, idle overlay strategy.
- [20260524-pwa-service-worker.md](20260524-pwa-service-worker.md) — cache-first + background revalidate, asset-update notification, `CACHE_VERSION` discipline, `APP_VERSION` lockstep.
- [20260524-msal-onedrive.md](20260524-msal-onedrive.md) — MSAL v3 setup, AppFolder scope, sign-out, conflictBehavior query param, encoding detection, `graphFetch` body types.
- [20260524-quest-ime.md](20260524-quest-ime.md) — RIME WASM, opt-in IME design, Shift toggle, user-dict sync.
- [20260524-filename-conventions.md](20260524-filename-conventions.md) — `YYYYMMDD title.txt`, suffix-only-on-collision, natural sort, never-trust-remote.
- [20260524-editor-ux.md](20260524-editor-ux.md) — caret behavior, lock-without-readOnly, optimistic UI, stable status text, word count.
- [20260524-encryption.md](20260524-encryption.md) — per-file AES-GCM, KDF + verifier pattern, IDB-as-ciphertext, voice gating, no-auto-prompt UX.
- [20260524-voice-input.md](20260524-voice-input.md) — STT backends (Web Speech / Groq / OpenAI Whisper), opt-in toggle, voice.json config, transcript post-processing (zh-punct, Whisper backtick strip), prompt-as-vocab.
- [20260524-push-to-talk.md](20260524-push-to-talk.md) — PTT key journey (` → Tab → Alt → Ctrl), hold-vs-tap threshold, immediate-start to preserve pre-roll audio, WhisperSession cancellation race, chord guard for Ctrl+S.
- [20260524-working-with-this-user.md](20260524-working-with-this-user.md) — collaboration norms: ask-before-commit, no-browser-testing, iteration style.
