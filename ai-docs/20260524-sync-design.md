# Sync design (OneDrive as SSOT)

> ⚠ as-of v0.0.82 / 2026-09-03（v2 换代，edited by Claude Fable 5.1）：同步层已整体换成 `@internal/store` 0.11.3（`src/app-store.ts` 单接缝）。**退役**：itemId(GUID) 身份、sibling-copy 冲突、手写 If-Match/412/list-merge/prefetch。**仍有效**：15s+30s 推送节律、idle 锁屏必复查、never trust remote filenames、编码探测。冲突现形 = 库 sheet（keepMine/takeCloud，败方进 .backup），见 adr/0003。


Lessons from building the OneDrive sync layer for a local-first multi-doc editor.

## Model: cloud is SSOT, IDB is cache

OneDrive (AppFolder, `.txt` files) is the source of truth. IndexedDB is an offline cache + fast cold-start buffer. This means:
- On any reconciliation conflict, the remote wins unless we have local edits we explicitly want to preserve.
- "Conflict" doesn't mean "show a diff UI" — too expensive to build, too brittle. We resolve by writing a sibling copy (`YYYYMMDD title 1.txt`, ` 2.txt`, ...) so no edit is ever silently overwritten, and the user resolves out-of-band.
- The IDB row carries sync placeholders: `onedriveItemId`, `etag`, `lastSyncedAt`, `dirty`, `contentLoaded`, `remoteFound`, `remoteName`, `locked`.

## Push timing: heartbeat over debounce

The user explicitly rejected pure debounce ("I sometimes touch a long file by accident — don't push 300ms after a stray keystroke"). Final shape: **15s debounce + 30s heartbeat max-wait**, i.e. `min(now+15s, firstDirtyAt+30s)`. After a push, the next timer only arms on the *next* keystroke — no infinite background polling.

Don't try to be clever with input-rate detection. The user's mental model is "timer counts up while I'm typing, fires when I pause or when time runs out." Match that.

## Push triggers beyond the timer

Multiple safety nets, each catches a different failure mode:
- **Heartbeat timer** — normal path.
- **Idle overlay shown** (local 2-minute setTimeout) — pushes before the screen locks.
- **visibilitychange → hidden** — tab switch / phone goes to lock screen / browser backgrounded.
- **beforeunload** — last-ditch, must use `fetch(..., { keepalive: true })` because the page is dying.

I forgot the visibility/beforeunload pair on the first pass and the user caught it ("你忘了吗"). It's load-bearing for Quest in particular, where the headset goes idle aggressively.

## Idle overlay = procrastination guard

The 2-minute idle overlay isn't just UI polish. The user articulated the real model: "Quest is nuclear-battery-powered, I might leave the app open for a year. The idle overlay's setTimeout will be procrastinated by the browser indefinitely, or the whole page gets evicted and reloaded fresh — either way, no stale write should ever overwrite a year of remote edits." So:
- On overlay dismiss, force a fresh remote-freshness check before unlocking input.
- Don't trust local state after a long idle; re-fetch.

## Race protection in pushUpdate / pushAsNew

After the PUT lands, re-read IDB and only set `dirty=false` if the content still matches what was pushed. Without this, a keystroke that lands during the PUT loses its dirty flag. This is the single most subtle race in the sync layer — write the assertion explicitly, don't optimize it away.

## ETag conflict handling

`If-Match: <etag>` on every update. On 412:
- Fetch fresh remote content.
- Write our local content as a sibling (`YYYYMMDD title 1.txt`, then ` 2.txt`, ...) using collision retry on 409.
- Replace the original IDB row's `onedriveItemId/etag/remoteName` with the freshly-fetched remote, and create a NEW IDB row for our sibling.

Never try to merge. Never silently overwrite. The sibling-copy pattern was the user's explicit preference: "不要diff."

## Filename collisions

`@microsoft.graph.conflictBehavior` belongs in the **URL query string**, not the header — `@` is not a legal HTTP header name. Burned an hour on this. Use `conflictBehavior=fail` and retry with appended suffix on 409.

## Encoding

`getItemContent` must handle BOM-prefixed UTF-8, raw UTF-8, GB18030, and Big5. The user's prior writing is decades of mixed-encoding files. Don't ship a sync layer that mangles GB2312 on first read. Detect and convert on the way in; write only UTF-8.

## Never trust remote filenames

The user dropped this as a load-bearing principle: "远端如果乱改文件名或者数字中间空一个多一个或者不合标准，never trust users." Parser for `YYYYMMDD title` should accept the bare date form, a date + title (with arbitrary trailing whitespace/digits), and not crash on anything weird. Don't infer document semantics from filename structure beyond the date prefix.

## "Last active doc" pointer

Single file at `.userdata/last-active.json` containing the OneDrive item ID. Read on startup to restore continuity across devices. Don't put this in the main folder listing — it's metadata.

## RIME user dict sync

Treat the user dict as just another file in `.userdata/`. Push on dirty (after IME commits), pull on startup. The IME's per-character learning is the user's actual writing style; losing it would be worse than losing a single doc.
