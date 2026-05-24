# Design notes — WebXiaoHeiWu

Topic-organized notes on the design decisions and gotchas for this app. Written for future AI collaborators picking up similar projects.

Each doc captures lessons from a specific area, written when it was fresh. Read the relevant topic before making changes in that area — many of the obvious-looking decisions were arrived at after a revert or two and the reasons matter.

- [sync-design.md](sync-design.md) — OneDrive-as-SSOT, push timing, ETag conflicts, sibling-copy resolution, idle overlay strategy.
- [pwa-service-worker.md](pwa-service-worker.md) — cache-first + background revalidate, asset-update notification, `CACHE_VERSION` discipline, `APP_VERSION` lockstep.
- [msal-onedrive.md](msal-onedrive.md) — MSAL v3 setup, AppFolder scope, sign-out, conflictBehavior query param, encoding detection, `graphFetch` body types.
- [quest-ime.md](quest-ime.md) — RIME WASM, opt-in IME design, Shift toggle, user-dict sync.
- [filename-conventions.md](filename-conventions.md) — `YYYYMMDD title.txt`, suffix-only-on-collision, natural sort, never-trust-remote.
- [editor-ux.md](editor-ux.md) — caret behavior, lock-without-readOnly, optimistic UI, stable status text, word count.
- [encryption.md](encryption.md) — per-file AES-GCM, KDF + verifier pattern, IDB-as-ciphertext, voice gating, no-auto-prompt UX.
- [voice-input.md](voice-input.md) — STT backends (Web Speech / Groq / OpenAI Whisper), opt-in toggle, voice.json config, transcript post-processing (zh-punct, Whisper backtick strip), prompt-as-vocab.
- [push-to-talk.md](push-to-talk.md) — PTT key journey (` → Tab → Alt → Ctrl), hold-vs-tap threshold, immediate-start to preserve pre-roll audio, WhisperSession cancellation race, chord guard for Ctrl+S.
- [working-with-this-user.md](working-with-this-user.md) — collaboration norms: ask-before-commit, no-browser-testing, iteration style.
