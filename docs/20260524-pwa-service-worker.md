# PWA service worker

Pattern that worked for a single-author writing app served from GitHub Pages.

## Cache-first with background revalidate

The classic stale-while-revalidate, with one wrinkle the user cared about:

```
fetch(request) → check cache
  if cached: return cached, kick off network fetch in background
  if not cached: await network
  on background fetch: compare ETag/content-length; if changed, postMessage("asset-updated")
```

The app loads **instantly** from cache (offline-OK), and the background fetch refreshes the cached copy. Next reload picks up changes. The user explicitly does **not** want auto-reload — they might be mid-sentence. The "new version" toast is a non-blocking hint with a manual reload button.

## CACHE_VERSION discipline

Bump `CACHE_VERSION` whenever any precached asset changes. The `activate` handler deletes caches that don't match. `skipWaiting + clients.claim` make the new SW take over on next reload, not next app restart.

Format I used: `v46-2026-05-17-optimistic-trash` (number + ISO date + one-line slug). The slug helps when scrolling git history. Bump-with-the-change is mandatory; missing bumps are the single biggest source of "why did my fix not deploy" confusion.

### Lockstep with `APP_VERSION` in `src/app.js`

There's a parallel `APP_VERSION` constant in `src/app.js` that the settings drawer displays. It must be bumped in lockstep with `CACHE_VERSION` — otherwise the user runs new code but sees an old version label and starts debugging a fake "stale deploy" problem. (I forgot it across three bumps in a row; the user caught it.) Either bump both manually every time, or factor them through a build-time constant. The fragile thing about two constants is they look independent in editor; consider an integration helper or CI check.

### "Why is my browser still on v70?"

Once a Service Worker is registered, **`Ctrl+Shift+R` doesn't bypass it**. Hard reload bypasses HTTP cache for the top-level navigation, but subresource fetches still go through the SW's fetch handler, which returns cache-first hits. To actually force a fresh load:

- DevTools → Application → Service Workers → **Unregister**
- DevTools → Application → Storage → **Clear site data** (or just delete the `xiaoheiwu-vXX-...` Cache Storage entry)
- Then F5

`skipWaiting + clientsClaim` is supposed to make the new SW take over automatically once it's detected — and it does — but the user's update-toast workflow assumes they actually click "refresh." If they hold Ctrl+Shift+R hoping to force an update without clicking the toast, they're chasing their tail.

## ETag comparison fallback

Some hosts strip ETags. Fall back to content-length:

```js
const changed =
  (cachedEtag && freshEtag && cachedEtag !== freshEtag) ||
  (!cachedEtag && cachedLen && freshLen && cachedLen !== freshLen);
```

Not perfect (same-length edits slip through) but good enough for a writing app's update toast.

## Same-origin only

Skip cross-origin requests entirely in the fetch handler. Microsoft Graph and `login.microsoftonline.com` must pass through to the browser. Filter on `url.origin !== self.location.origin` and `return` (no `event.respondWith`). (MSAL itself is now vendored — see [20260524-msal-onedrive.md](20260524-msal-onedrive.md) — so it's a same-origin request and gets precached like any other module.)

## skipWaiting message

Listen for `{type: "skip-waiting"}` so the page's "reload now" button can trigger activation without waiting for tab close. This is the supported path; don't try to force-activate from inside the install handler.

## Update-announced-once flag

`updateAnnouncedThisLoad` prevents the toast from re-firing if multiple files updated during the same page session. One notification per page load is the right cadence — the user reloads once and sees the new state.

## What I would NOT do

- Don't precache `index.html` and rely on cache-busting query strings — bumping `CACHE_VERSION` is cleaner.
- Don't try to do diff-merge on conflicting assets. Cache-first only works because we're not trying to be clever.
- If you do depend on a CDN at runtime (we no longer do), don't precache it. CDN cache headers and your SW lifecycle don't compose well — let the browser HTTP cache handle them. The cleaner answer is to vendor the asset and precache it like any first-party file (this is what we ended up doing for MSAL — see [20260524-msal-onedrive.md](20260524-msal-onedrive.md)).
