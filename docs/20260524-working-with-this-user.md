# Working with this user

Notes for future AI collaborators on this project. The user is the sole author of a Chinese novel-writing PWA and has a specific working style.

## Ask before committing

Hard rule: **do not run `git commit` without asking first**, even if the diff seems obvious. The user said this explicitly after I committed unprompted ("你以后问过我之后再commit"). The right cadence is: finish the change, summarize it, ask "want me to commit?" — wait for `yes`.

This extends to other "broadcast" actions: pushing, opening PRs, deleting branches. Local edits and reads are fine without permission; anything that creates a record someone else (including future-you) might see needs a confirmation.

## No browser testing

The user is not going to test in the browser between every change, and explicitly does not want me to claim something works without verification. The right pattern when shipping a UI change:
- Make the change.
- State clearly: **"untested in browser — flagging."**
- Suggest concrete things the user could check if they want to verify.
- Bump `CACHE_VERSION` so the next browser session actually picks up the change.

The memory file [`pwa_untested.md`](../../.../memory/) tracks specific untested features. Add to it when you ship something the user defers verifying.

## Be conservative with destructive actions

"Never trust users" — said about robustness to remote OneDrive state, but the same principle applies to working in the repo. Don't `git reset --hard`, don't `--no-verify`, don't delete files without confirmation, don't bypass hooks. If you hit a pre-commit hook failure, fix the underlying issue.

## Don't touch the user's OneDrive

The sync code is sandboxed to AppFolder (`Apps/WebXiaoHeiWu/`). The user's main OneDrive is **off-limits**. Reading is fine (e.g. for one-time onboarding inspection); writing or deleting anything outside the sandbox is the user's job, not the app's. See [`feedback_dont_touch_onedrive.md`](../../.../memory/) in memory.

## Don't infer folder/file semantics from names

"NOT ORGANIZED YET" was a folder name in the user's OneDrive. I assumed it was an inbox; the user corrected me — it was just old unsorted writing. Same principle: when you see a folder named `drafts/` or `chapters/`, ask before designing on top of it. See [`feedback_folder_names.md`](../../.../memory/) in memory.

## Pure-Chinese UI

Every label, button, error, status string is in Chinese. The user wants Chinese friends to be able to use this with just their own cloud creds. Don't introduce English UI strings even for "internal" admin features. Error messages in particular should be translated.

## Iteration style: revert often, that's fine

The user iterates aggressively. Some of these reverts happened in one session:
- Filename format `YYYYMMDD title` → `YYYYMMDD N title` → back to `YYYYMMDD title` (suffix-only-on-collision).
- Push timing: 300ms debounce → "too short" → pure 30s heartbeat → "30s is too long during typing" → final 15s+30s hybrid.
- Custom keyboard shortcuts: tried Ctrl+Space, backtick PTT, Left Ctrl — all reverted in favor of "tap the status bar."

Read this as a signal: when the user reverts your suggestion, don't push back. The user's mental model of how they actually write is more reliable than any best-practice guess. Make the change cleanly; don't leave dead code from the rejected version.

## China deployment is a real concern, but deferred

OneDrive is GFW-blocked. The user has Chinese friends who would use this app, and the real obstacle is "not everyone universally uses OneDrive" more than the GFW itself. WebDAV (e.g. Jianguoyun/坚果云) is the long-term answer. **Explicitly deferred** as a future phase — don't design the current sync layer around hypothetical multi-backend support. Add it when the user asks.

## Risk reporting style

The user often asks "tell me the logic and risk points" before a non-trivial sync change. Don't summarize the code; describe **what can break** (network drops mid-push, two devices race on the same file, encoding garbled, etc.) and what the code does about each. The user is comfortable thinking in race conditions.

## Short responses

The user prefers terse Chinese conversation. Long preambles get cut off ("stop summarizing what you just did at the end of every response, I can read the diff"). When in doubt: shorter. Concrete change description + one-line ask is usually enough.
