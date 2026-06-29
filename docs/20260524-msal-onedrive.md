# MSAL + OneDrive AppFolder integration

Hard-won notes from wiring Microsoft Graph into a static-hosted PWA.

## Scope: AppFolder only

`Files.ReadWrite.AppFolder` + `offline_access`. Nothing else. The user audited the consent screen and asked "看下权限对不对，有没有不该拿的多余的不必要的权限." Dropped `User.Read` because the access token already carries the username via the ID token. The user's strong principle: **don't touch the user's main OneDrive**. AppFolder is a sandboxed subtree (`Apps/<AppName>/`) that the app can't escape from. Use it.

## Vendor MSAL into the precache (reversed: previously CDN-loaded)

MSAL.js v3 (`@azure/msal-browser@3.27.0`, ~300KB minified) lives at
`src/vendor/msal/msal-browser.min.js` and is registered in the service
worker's `PRECACHE_URLS`. `auth.js` resolves it via `new URL("./vendor/msal/...", import.meta.url)` and injects it as a `<script>` tag on first
sign-in attempt — still lazy, just from a local URL instead of a CDN.

**Why this flipped.** The original rule was "don't vendor cloud SDKs, they
version frequently." In practice the downsides of the CDN path won out:

- jsdelivr / unpkg are blocked or slow on networks where the user actually
  reaches for this app (校园网, hotel WiFi, mobile in low-signal areas).
  The two-CDN fallback chain still ate seconds and sometimes timed out,
  producing a "登录失败" toast for a user who was definitely online — they
  just couldn't reach an npm mirror.
- MSAL v3 is stable. `acquireTokenSilent` / `loginRedirect` haven't moved
  in years. We don't actually want the version drifting unattended in a
  PWA that may sit unupgraded on someone's homescreen for months.
- The precache already holds the wasm RIME engine and dictionary blobs
  (multiple MB). Another 300KB to make sign-in deterministic is cheap.

Bump the vendored copy by hand when there's a reason (CVE, breaking Graph
change). Bump `CACHE_VERSION` in `service-worker.js` in the same commit.

Failure message stays explicit: `"无法加载 Microsoft 登录脚本"` — though in
practice this should now only fire if the precache itself is corrupted.

Graph and `login.microsoftonline.com` still need real network at sign-in
time — only the SDK shell is offline-deterministic.

## Tenant blocks

User's first attempt got `AADSTS5000225 — tenant has been blocked`. Some tenants are frozen at the org level; the only workaround is registering a fresh tenant. This is an Azure quirk, not anything the app code can fix. Worth checking the app registration's tenant early.

## Sign-out: clearCache, NOT logoutRedirect

`pca.logoutRedirect()` logs the user out of **all** Microsoft sessions in the browser. Burned the user once — they were in the middle of using Outlook in another tab. Use `pca.clearCache(account)` to drop only this app's local credentials. The user stays signed into their MS account elsewhere; they just need to sign back into the app.

## conflictBehavior in URL, not header

Microsoft Graph's `@microsoft.graph.conflictBehavior=fail` parameter is a **URL query string**, not a header. The `@` character is illegal in HTTP header names and the browser throws `Failed to execute 'fetch' on 'Window': Invalid name`. The docs are misleading here.

```
PUT /drive/items/{id}:/path/to/file.txt:/content?@microsoft.graph.conflictBehavior=fail
```

## Encoding detection on read

`/content` returns the file as-is. For a writing app that may sync user's older `.txt` files:
- BOM-prefixed UTF-8: strip BOM, decode UTF-8.
- Plain UTF-8: detect via validity heuristic.
- GB18030 / Big5: fall back via `TextDecoder` with appropriate label.

Return `{text, encoding}` so the caller can show the detected encoding if needed.

## Keepalive PUT for beforeunload

`fetch(..., {keepalive: true})` on the final flush in `beforeunload`. The browser allows the request to complete even as the page tears down. Limited to ~64KB body in most browsers, which is fine for a chapter-length doc but won't cover a whole novel — that's why we still have the heartbeat and visibilitychange pushes upstream.

## Optimistic concurrency

`If-Match: <etag>` on every PUT/PATCH/MOVE. On 412, fetch fresh and use the sibling-copy pattern (see [20260524-sync-design.md](20260524-sync-design.md)). On 404, mark `remoteFound: false` and offer the "re-upload as new" flow rather than silently re-creating.

## graphFetch body must accept TypedArrays

If your wrapper has a "string | ArrayBuffer | Blob → pass through, otherwise JSON.stringify" branch, you will silently JSON-stringify any `Uint8Array` you try to upload as a body (`{"0":byte,"1":byte,...}`, ~10× size bloat). Add `ArrayBuffer.isView(body)` to the pass-through branch. This bit me when binary blob upload was first added (encrypted files were going up as 178KB of JSON-of-bytes instead of 16KB of actual ciphertext).

```js
if (
  typeof body === "string" ||
  body instanceof ArrayBuffer ||
  body instanceof Blob ||
  ArrayBuffer.isView(body)         // ← Uint8Array, DataView, etc.
) {
  init.body = body;
}
```

The latent symptom is also instructive: anything else that *should* have been uploading binary through this wrapper was also broken in the same way, but only the encryption feature noticed because it was the only consumer.

## Export shared helpers, even private-looking ones

`graphFetch` was originally an internal helper inside `onedrive.js` (no `export`). Other modules that needed direct Graph access (last-active doc sync, RIME user-dict sync) had inline `await graphFetch(...)` calls that threw `ReferenceError` silently inside try/catch blocks — features quietly broken with no console noise. If a shared HTTP helper exists, export it; if you don't want callers reaching for it, name it clearly (`_graphFetch`) but still export so the failure is visible at import time.

## App registration: redirect URI

Single-page application redirect URI must be the page's URL (e.g. `https://<user>.github.io/<repo>/`). Not `localhost` for production. MSAL v3 SPA flow uses authorization code with PKCE; no client secret, no implicit grant.
