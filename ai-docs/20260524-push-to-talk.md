# Push-to-talk key design

> ⚠ as-of v0.0.82 / 2026-09-03（v2 换代，edited by Claude Fable 5.1）：有效，实现 = `src/app.ts` PTT 段。


PTT for voice dictation. The mic button works on every platform; PTT is the
"don't move my hand off the keyboard" alternative. Most of this doc is a
record of the dead ends — the final code is short, but the search wasn't.

For voice backend architecture see [20260524-voice-input.md](20260524-voice-input.md); for
why we disable Quest's OS IME at all see
[20260524-quest-ime.md](20260524-quest-ime.md#disabling-the-os-ime-for-the-textarea-inputmodenone).

## Final shape

- **Key:** Left Ctrl (`event.code === "ControlLeft"`).
- **Hold ≥250ms → start recording.** Release → if past threshold, stop +
  transcribe; if not, abort + discard.
- **`backend.start()` fires on keydown**, not after the threshold. The
  threshold is just a commit-or-discard gate at keyup. Pre-roll audio
  (the user's first syllable) is preserved.
- **No `preventDefault`** on keydown/keyup. Ctrl is a modifier — no
  character to suppress, no IME composition to fight.
- **Chord guard:** any non-Ctrl keydown with PTT armed aborts. Ctrl+S
  remains a clean "save" with no orphan mic session.

That's it. The journey to get there is below.

## Key-choice journey (don't repeat)

The user's BT keyboard on Quest has no right Ctrl, no right Alt, no F-keys.
Compact 60% layout. Tried in order:

1. **Backtick (`` ` ``)** — Quest's OS IME treats the held key as a multi-
   character composition. Every keydown extends an `insertCompositionText`
   buffer. On release, the whole `` ``...` `` string commits via a
   non-cancelable input event. `preventDefault` is silently ignored
   (spec: `insertCompositionText` is non-cancelable). Spent **many** hours
   on belt-and-suspenders suppressors; none of them stopped the leak. See
   the "IME composition leak war" section below.
2. **Tab** — works mechanically but the user wanted short-tap to still
   insert a tab character. Doable (always preventDefault, manually insert
   on short release) but it never stuck because Quest BT delivery was fine
   for Tab and the user moved on.
3. **Left Alt** — Quest BT keyboard swallows Alt before it reaches the
   page. `keydown` simply doesn't fire. Dead end on Quest.
4. **Left Ctrl** — works on both Quest and Windows. Final answer.

Lesson: on Quest, **start with `event.code` you've confirmed actually
fires** via a logging session before designing around it. Quest's input
stack drops/munges some keys silently.

## Hold-vs-tap threshold

`PTT_HOLD_MS = 250`. Long enough that an accidental Ctrl press for a chord
(Ctrl+S) doesn't briefly arm voice; short enough that the user's brain
treats "hold the key" as "press and start talking" without a perceptible
delay.

Threshold-only-gates-the-commit means the recording is already running by
the time the timer fires — we don't lose any audio. See the next section.

## Immediate-start (preserves pre-roll audio)

First-version flow: keydown → start 250ms timer → on fire, call
`backend.start()`. Problem: the user starts speaking the instant they press
the key. The first 250ms of audio (often the first syllable of the first
word) was being thrown away.

Revised flow:

```
keydown:  backend.start()                  ← immediate; mic warms up
          setTimer(250ms, () => committed = true)

keyup:    clearTimer()
          if (committed) backend.stop()    ← normal path: transcribe
          else          backend.abort()    ← short tap: discard
```

The 250ms gate is now "should we keep this clip" rather than "should we
record at all." User feedback: first-syllable problem disappeared.

### Cancellation race in WhisperSession

`WhisperSession.start()` is async (`await getUserMedia(...)`). If the user
presses Ctrl and releases within 50ms, we call `start()` then immediately
want to `abort()`. But at the moment of `abort()`, the state is still
`"idle"` (getUserMedia hasn't returned yet), and the old `abort()` body
only acted when state was `"recording"`. The async `start()` continues,
acquires the mic stream, transitions to recording, leaves an orphan
session that only the VAD silence timeout cleans up.

Fix: a `cancelled` flag on the session.

```js
async start(...) {
  this.cancelled = false;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia(...); } catch { ... }
  if (this.cancelled) {
    for (const t of stream.getTracks()) try { t.stop(); } catch {}
    return;
  }
  this.stream = stream;
  // ... mediaRecorder setup, another cancel check ...
  if (this.cancelled) { this._teardown(); return; }
  this.mediaRecorder.start();
  this._setState("recording");
}

abort() {
  this.cancelled = true;          // always set, no matter the state
  if (this.state === "recording") { ... discard chunks + stop recorder ... }
  else if (this.state === "transcribing") { ... AbortController ... }
}
```

The flag is checked after **every** await point, and the abort path always
sets it (no longer gated on state). Any in-flight `start()` self-aborts at
the next checkpoint and releases resources cleanly.

## Chord guard for Ctrl+S

User does Ctrl+S to save. With immediate-start, the Ctrl keydown begins a
recording within tens of ms. The S keydown fires, the existing Ctrl+S
handler runs, but the mic session is still arming. Even though the user
intended a chord, the brief recording would be sent or held open.

Fix in the PTT keydown handler:

```js
if (pttBackend && !isPttKeyEvent(event)) {
  // Another key during a PTT-armed window = chord shortcut.
  pttAbort();
  return;
}
```

`pttAbort()` clears the commit timer AND calls `backend.abort()`. The
`cancelled` flag handles the case where `getUserMedia` is still in flight.

The chord guard accepts `event.ctrlKey === true` on the trigger keydown
itself (Ctrl is what's being pressed!) but bails on `shiftKey || altKey ||
metaKey` — so Ctrl+Shift+something stays a chord and never arms PTT.

## IME composition leak war (the long detour)

When PTT was bound to `` ` ``, Quest's OS IME would intercept the held key
and turn it into a composition. The release sequence committed multiple
backticks into the textarea via `insertCompositionText` — which is
**non-cancelable per the InputEvent spec**. `preventDefault` does nothing.

Things I tried, in order, none of which fully worked on Quest:

- `event.preventDefault()` on `keydown` — no effect on the OS IME.
- `event.stopImmediatePropagation()` — same.
- Capture-phase listener that beat `setupImeOn` to the event — irrelevant,
  the leak isn't through the JS event listeners.
- `beforeinput` capture-phase preventDefault for any data matching
  `/^[`~]+$/` — silently ignored because the inputType is
  `insertCompositionText`.
- Legacy `keypress` listener — `keypress` doesn't fire for this composition
  path on Quest.
- `compositionend` + targeted splice — works in principle (we know the
  exact data and position) but causes visible flicker (chars appear then
  vanish) and is fragile when compositions span multiple events.

The actual fix was elsewhere: **disable the OS IME on the editor entirely
via `inputmode="none"`** (Quest-only, see
[20260524-quest-ime.md](20260524-quest-ime.md#disabling-the-os-ime-for-the-textarea-inputmodenone)),
and **switch the PTT key to a modifier (Ctrl)** so there's no character to
compose in the first place. Both changes together; either alone is
incomplete.

If a future PTT key has to be a character key (no good modifier available),
the `compositionend` + splice approach in commit `be5521b` is the cleanest
fallback. Read that commit before reinventing it.

## Diagnostic discipline: on-screen log

Remote-debugging Quest is painful (`chrome://inspect/?#devices` only works
on USB-connected dev-mode headsets). For a few iterations I had a "PTT
调试" panel in Settings that recorded every `` ` ``-touching keyboard /
input event to a ring buffer, displayed as a `<pre>` in the settings
drawer. The user could PTT, then open settings, and copy-paste the log.

That panel paid for itself the day it told us "the leak is via
`insertCompositionText` with data length > 1, fired BEFORE the keydown" —
which is what unblocked the diagnosis. Final code dropped the panel once
the fix landed, but the pattern (on-device visible log for hard-to-reach
device debugging) is worth keeping in mind.

## What I would NOT do

- **Don't `preventDefault` on Ctrl keydown.** Browsers don't insert
  characters for modifier keys; intercepting it would break legitimate
  chords and gain nothing.
- **Don't pre-roll-buffer the mic.** Always-on mic with a circular buffer
  would capture every word even before the user presses PTT. Privacy
  alarm bells + battery drain + storage churn. Immediate-start on keydown
  is the right tradeoff: ~50ms of `getUserMedia` warmup latency vs always
  recording.
- **Don't make PTT visible as a UI hint.** No "press Ctrl to talk" banner.
  The user discovers it from the docs or the commit message; the editor
  stays clean. (If you want to hint, do it via a "?" icon in Settings.)
- **Don't auto-stop the mic by global silence timeout if PTT key is still
  held.** The user is in charge of their hold; VAD silence-stop is fine
  as a backstop but should be generous (≥1s) and ideally only kick in
  after voice has been heard.
