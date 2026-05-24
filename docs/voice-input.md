# Voice input (STT)

Optional dictation layer for the editor. Two interchangeable backends behind
one mic button + one PTT key. Default-off so a user who never wants voice
never gets surprised by a mic permission prompt.

The PTT key mechanics are big enough to live in [push-to-talk.md](push-to-talk.md);
this doc is about everything else: opt-in, backend choice, transcript
post-processing, and the encryption interaction.

## Default OFF, per-device opt-in

The first user complaint after wiring voice was: "I tapped the PTT key by
accident and got a mic permission prompt." Fix:

- `voiceEnabled` lives in IDB (`getSetting/setSetting`, same pattern as
  `imeEnabled`), default `false`.
- `activeVoiceBackend()` returns `null` when disabled — gates both the mic
  button visibility AND the PTT keydown handler, so a stray key tap really
  does nothing.
- Toggle lives in Settings → 语音输入. Section is always visible (the
  toggle is its anchor); backend / key / vocab fields only appear once
  enabled. Per-device because the user explicitly didn't want a OneDrive
  round-trip to gate the toggle.

The encryption opt-in pattern in [encryption.md](encryption.md) was the
template — both rules are "if the user never asks, never show." Apply this
to any feature that costs the user a permission grant, a paywall click, or
even a long-running modal.

## Backend matrix

| Backend | Latency | Cost | Caveat |
|---|---|---|---|
| Web Speech (browser) | streaming, ~instant | free | Chrome works; **Edge globally broken since 2026-04** |
| Groq Whisper-large-v3 | ~1s for 5s audio | free tier ample | best $/quality, default |
| OpenAI gpt-4o-transcribe | ~3s for 5s audio | $0.006/min | slightly better Chinese accuracy |

Provider stored as `voiceConfig.provider` in `voice.json` on OneDrive
AppFolder. **All keys are persisted regardless of which provider is
currently selected** — switching from Groq → OpenAI → Groq must not wipe
the original key. The "Save" button reads every field and writes them all.

Web Speech needs no key and works without OneDrive sign-in. Whisper needs a
key, which means OneDrive sign-in (for `voice.json`). The Save button
surfaces "请先登录 OneDrive 后再保存语音配置" if clicked while
unauthenticated rather than silently no-op'ing.

### Web Speech is unreliable in 2026

Microsoft Edge globally broke `webkitSpeechRecognition` in mid-2026 and
hasn't restored it. The API exists (so `isSpeechSupported()` returns true)
but every recognition session errors with `network` after a few seconds.
Chrome (and Quest's Chromium browser) work fine.

I burned three iterations trying to "fix" this via retry logic before
realizing it's Microsoft's problem, not mine. The user's primary device is
Quest, which works, so Web Speech stays as the default-when-no-key option;
desktop-Edge users get pushed toward Whisper via the docs.

### Why default to Groq over OpenAI

Groq's LPU inference for whisper-large-v3 is roughly 5–10× faster than
OpenAI's equivalent, free tier is generous enough for personal use, and the
output quality for Chinese is the same model. OpenAI's `gpt-4o-transcribe`
is marginally better for code-switched audio but costs more and is slower.
For a writing app where the user wants the transcript to appear *now*, Groq
wins.

The API is OpenAI-compatible — same multipart request shape, just a
different base URL. Both go through the same `WhisperSession._transcribe`.

## SpeechSession vs WhisperSession

Two classes, identical external surface:

```
.state            ('idle' | 'listening'/'recording' | 'transcribing' | 'error')
.toggle(lang)
.start(lang)
.stop()
.abort()
.notifyExternalInput()
onChange / onState callbacks
```

`SpeechSession` (Web Speech): synchronous start. Streams interim results via
`onresult`, each one is the **cumulative** transcript-so-far. We rewrite the
range from the anchor to the latest accumulated text on every event — this
is why we track `anchorStart`/`anchorEnd`.

`WhisperSession` (Groq/OpenAI): async start (`getUserMedia` is a Promise).
Records via `MediaRecorder`, runs a Web-Audio analyser for RMS-based VAD
(silence-stop), POSTs the blob at stop, inserts at anchor when the API
returns.

Single insertion point (`onVoiceInsert`) is the consumer for both backends'
`onChange` callback so the surrounding wiring (save status, word count,
idle overlay reset) doesn't care which one fired.

## Transcript post-processing

Both backends pipe through the same cleanup:

### 1. Strip leading/trailing `` ` `` and `~` runs (Whisper only)

Whisper-large-v3 has a documented habit of appending a stray backtick when
the audio is short, silent, or contains a sharp mechanical sound (e.g. a
PTT key release click). For a Chinese writing app this is always wrong:

```js
text = text.replace(/^[`~]+|[`~]+$/g, "").trim();
```

If what's left is empty, we don't insert at all. (Don't strip mid-string —
a user might dictate "测试反引号" and mean it.)

### 2. ASCII → fullwidth Chinese punctuation (zh-punct.js)

Both backends occasionally emit `,` / `.` / `?` / `!` / `:` / `;` /
parens / brackets / quotes in the middle of Chinese dictation, even with
the language set to `zh-CN` / `zh`. Convert in a separate `zh-punct.js`
module, applied only when `lang.startsWith("zh")`.

Rules:
- **No CJK in the string at all → leave it untouched.** Zero risk for pure
  English transcripts.
- For `, . ? ! : ;`: replace only when **directly adjacent** to a CJK char
  or to a fullwidth punct we already produced. `3.14` stays `3.14`; the
  English sentence in "Hello, 你好" keeps its English comma.
- For `( ) [ ]`: paired walk. Either side adjacent to CJK → convert BOTH
  opener and closer together, never end up with `试（1)`.
- For `"` and `'`: stateful alternation across the whole text — every other
  occurrence becomes the open/close curly variant. Assumes balanced runs;
  unbalanced still produces a sensible output.

The paired walker for brackets matters; my first pass converted opens and
closes independently and produced mismatches. The unit test in the module's
header comment captures the cases I tripped on.

### 3. Whisper `prompt` parameter is dual-purpose

Whisper's `prompt` field nudges the output style and vocabulary. We use it
for two things:

```js
const parts = [];
if (config.lang === "zh") parts.push("以下是简体中文语音转录。");
if (config.vocab)         parts.push(`常见词汇：${config.vocab}`);
return parts.length > 0 ? parts.join(" ") : null;
```

- **Force Simplified.** `zh` is ambiguous between Simplified and Traditional;
  Whisper sometimes drifts to Traditional on dialectal audio. A short
  simplified-Chinese seed sentence pulls it back.
- **User vocab.** Free-form textarea in Settings; just concatenated and
  shipped. Whisper's prompt is capped at ~224 tokens (~150 Chinese chars),
  so long vocab lists silently get truncated by the API; that's fine for
  a personal proper-noun list.

Web Speech has no equivalent. The setting UI hides the vocab field when
provider is `webspeech` to avoid confusion.

## Insertion anchor model

Both sessions capture `anchorStart` / `anchorEnd` at session start (or at
each `_replaceAnchor` for streaming). Insertions splice into the textarea
between those offsets, so:

- For Whisper (single insertion at stop): inserts the final transcript at
  the cursor position from when the user pressed PTT.
- For Web Speech (streaming): each interim result rewrites the same
  growing range, so the visible text reflects the engine's current best
  guess.

If the user types or clicks during a session, `notifyExternalInput()` is
called — the session aborts because the anchor is no longer valid.

For Whisper specifically, there's a defensive check in `_insertAtAnchor`:
if the textarea's length has shrunk below the anchor (e.g. user cleared the
doc during the 1-2s transcribe), drop the insertion silently rather than
splice at a bad offset.

## Mic button placement and iOS

The mic button is `position: absolute` inside `.page`, `bottom: 14px;
right: 14px`. On iOS, the soft keyboard pops without shrinking the layout
viewport, so the button ends up *under* the keyboard.

Fix lives in [editor-ux.md](editor-ux.md#ios-soft-keyboard-mic-button-collision)
— `visualViewport` listener writes the keyboard height to a CSS
`--kb-offset` variable, and the button's `bottom` is `calc(14px +
var(--kb-offset, 0px))`.

## Encryption interaction

Voice transcription ships audio to a cloud service (Web Speech → Google,
Whisper → Groq/OpenAI). For docs that the user has chosen to encrypt
on-OneDrive, this defeats the whole point. The mic button and PTT trigger
both gate on `!state.activeDoc.encrypted || voiceProviderIsLocal()`. See
[encryption.md](encryption.md#voice-input-on-encrypted-docs) for the
predicate.

A self-hosted Whisper backend is the planned long-term answer for
encrypted-doc dictation, but for now the rule is simple: encrypted doc =
no cloud voice. Same predicate, applied at every entry point (mic click,
PTT key).

## What I would NOT do

- **Don't try to fix Edge's Web Speech.** It's broken globally; route Edge
  users to Whisper.
- **Don't store the API key in `localStorage` or env vars.** OneDrive
  AppFolder is the right place — it's already auth-gated, syncs across
  the user's devices, and you don't accidentally check it into git.
- **Don't auto-pick a provider based on "what feels fast."** The user has
  strong opinions about latency vs cost; expose the choice explicitly with
  a dropdown.
- **Don't strip punctuation eagerly.** The rules in `zh-punct.js` are all
  context-aware; a global `.replace(/[,.?!]/g, …)` would mangle URLs,
  decimals, English fragments.
- **Don't ship a "voice quota meter."** The user is paying for their own
  key; budgeting is their problem. Just surface the API error if it comes
  back as 429.
