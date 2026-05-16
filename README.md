# Quest Novel Draft v0

Local-first Chinese writing prototype for Meta Quest browser usage.

## Current v0 status

- Full-screen writing area that opens focused on load.
- Natural Code IME powered by My RIME worker (`double_pinyin`, `simplification=1`, `ascii_punct=0`) with candidate bar. Candidates are Simplified-only and punctuation auto-converts to Chinese forms.
- IndexedDB autosave and recovery of last active document.
- No cloud sync yet (planned for v1).
- Automatic fallback to starter map if RIME initialization fails.

## Local run

Choose one option:

1. Direct open for quick check: open `index.html` in your browser.
2. Recommended local server from workspace root:

```bash
python3 -m http.server 5173
```

Then visit:

- `http://localhost:5173/`

## IME controls

- `a-z`: build composition buffer
- `1-9`: choose candidate
- `Space`: choose first candidate
- `Enter`: choose first candidate and newline
- `=` or `PageDown` or `]`: next candidate page
- `-` or `PageUp` or `[`: previous candidate page
- `Backspace`: delete one code in composition buffer
- `Esc`: clear composition buffer
- `Ctrl+Space`: toggle IME on/off
- `Shift` (tap alone): toggle Chinese ↔ English input mode (status bar shows `中` / `EN`)

## Notes

All runtime dependencies are vendored locally — no CDN fetches at runtime:

- `src/vendor/my-rime/worker.js` — patched My RIME worker (URLs point at local paths)
- `src/vendor/my-rime/dist/{rime.js,rime.wasm,rime.data}` — RIME WASM runtime (from `libreservice-my-rime-0.10.9.tgz`)
- `src/vendor/rime-contrib/luna-pinyin/` — dict + base schema (`@rime-contrib/luna-pinyin@0.1.1`)
- `src/vendor/rime-contrib/double-pinyin/` — Natural Code prism/schema (`@rime-contrib/double-pinyin@0.1.1`)
- `src/vendor/rime-contrib/stroke/` — required by `luna_pinyin` reverse lookup (`@rime-contrib/stroke@0.1.3`)

The starter-map fallback in `src/ime.js` remains in case the worker fails to boot.

Future cloud sync (OneDrive via Microsoft Graph) is the only intended runtime network dependency.
