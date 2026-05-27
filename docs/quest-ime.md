# Chinese IME on Meta Quest (and other platforms)

The product premise was: Meta Quest browser has an English IME but no Chinese IME. Without a workaround, the device can't be used to write Chinese novels. So we ship our own IME in WASM.

## The IME platform matrix the user actually cares about

| Platform | System IME | Our IME default |
|---|---|---|
| Quest | None for Chinese | **Manually enabled** (per-device setting) |
| iOS | Excellent | **Off** — don't intercept |
| PC | Excellent | **Off** — don't intercept |

The user's principle: **don't fight the system IME when one exists**. Our IME is opt-in, stored per-device in IDB settings (`imeEnabled`). No auto-detection — the user explicitly rejected "smart" detection ("there's nothing to detect; just let me toggle it"). One toggle, stored once.

## RIME via WASM

Used [my-rime](https://github.com/LibreService/my-rime) — RIME core compiled to WebAssembly via the official toolchain. Runs in a Web Worker, posts candidates back to the page on each keystroke. The schemas (luna-pinyin, double-pinyin, stroke) are precached so first-use is instant once the WASM is warm.

Vendored locally because:
- The WASM blob is ~5MB; precaching it once is fine.
- RIME schemas/dicts change rarely.
- We want zero CDN dependencies for the entire app shell, including sign-in (MSAL is also vendored — see [msal-onedrive.md](msal-onedrive.md)).

## Shuangpin (双拼) is what serious writers want

The user uses shuangpin, not full pinyin. The IME schema needs to support multiple input methods, but the *default* should be the one the user actually uses. Don't ship "full pinyin only" and expect novelists to switch.

## Shift to toggle CN/EN

Short Shift press (no other key, no chord) toggles between Chinese and English input. Long-press or modifier combos do nothing. This matches the muscle memory of Sogou/Rime/Microsoft Pinyin on PC. **Don't** invent a custom toggle (Ctrl+Space, backtick, etc.) — every one I tried got vetoed because it conflicted with something else.

## Status bar tap = the only toggle

After a few iterations I ended up with: status bar shows IME state, tapping it toggles. No keyboard shortcut. The user's reason: keyboard shortcuts on Quest are unreliable (controller-emulated keys), and on PC the muscle memory belongs to the system IME. The tap is universal.

## User dict sync

The IME's per-character usage history is genuinely valuable — it's how RIME learns "this user types 黎 frequently in this context." Treat the user dict file as just another sync target:
- `dumpUserDir` after each commit to a temporary blob.
- Push to `.userdata/rime/` on the same debounce as docs.
- Pull on startup before initializing RIME.
- On conflict, last-write-wins — the user dict is regenerable from usage, so losing a day of learning is annoying but not catastrophic.

## Don't break Ctrl+C/V/X

Early version intercepted all keydown for IME — it ate Ctrl+C/V/X. The user immediately noticed. The IME should only consume keys when actively composing (after a pinyin keystroke, before commit/cancel). When no composition is in progress, every key passes through to the textarea.

## "Pre-roll" loss on PTT

When push-to-talk style keystrokes need to be captured on `keydown`, listening on `keyup` loses the first ~250ms. (Less relevant for IME, very relevant for voice input.) Bind on `keydown`.

## Disabling the OS IME for the textarea (`inputmode="none"`)

Quest's OS-level input system runs *alongside* our Rime adapter. For most
keys it stays out of the way, but if the user holds a character key it
treats the auto-repeat as a composition: `compositionstart`,
`compositionupdate` with growing data, `compositionend`. The committed
text is delivered as a `beforeinput` with `inputType="insertCompositionText"`,
which is **non-cancelable per the InputEvent spec** — `preventDefault()`
is silently ignored.

This bit us when PTT was bound to `` ` ``: holding the key dumped a string
of backticks into the textarea on release, no matter how many
suppressors we tried. See
[push-to-talk.md](push-to-talk.md#ime-composition-leak-war-the-long-detour)
for the full forensic log.

The clean fix is to tell the browser the page handles keyboard input
itself: `inputmode="none"` on the textarea and title input. Quest skips
the OS-IME composition path entirely (no `compositionstart`, no
`insertCompositionText`). Rime still works because it intercepts JS
`keydown` events directly, which `inputmode="none"` doesn't suppress.

```js
const IS_QUEST_BROWSER = /OculusBrowser|Quest|Wolvic/i.test(navigator.userAgent || "");
if (IS_QUEST_BROWSER) {
  editor.setAttribute("inputmode", "none");
  titleInput.setAttribute("inputmode", "none");
}
```

UA-gated because `inputmode="none"` also suppresses the **virtual keyboard**
on touch devices. A phone user without a physical keyboard would lose
the ability to type — bad regression. The Quest UA detection
(`/OculusBrowser|Quest|Wolvic/i`) is narrow enough to be safe.

If you later add another platform with a similar issue (some
in-headset VR browsers, kiosk shells, etc.), extend the regex rather
than dropping the gate.

