// Microsoft Graph wrapper for the AppFolder sandbox. Every call is scoped to
// /me/drive/special/approot — even a token leak cannot reach the rest of
// the user's OneDrive.

import { getToken } from "./auth.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function encodePathSegment(name) {
  return encodeURIComponent(name).replace(/'/g, "%27");
}

export async function graphFetch(method, pathOrUrl, { headers = {}, body = null } = {}) {
  const token = await getToken();
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`;
  const init = {
    method,
    headers: { Authorization: `Bearer ${token}`, ...headers },
  };
  if (body != null) {
    // Pass through anything `fetch` can already use as a body. Critically
    // ArrayBuffer.isView(x) catches Uint8Array / DataView / other TypedArrays —
    // otherwise the `else` branch JSON.stringify's the bytes into a giant
    // `{"0":byte,"1":byte,...}` object, which is what shipped 178KB of
    // garbage to OneDrive for what should have been a 16KB encrypted blob.
    if (
      typeof body === "string" ||
      body instanceof ArrayBuffer ||
      body instanceof Blob ||
      ArrayBuffer.isView(body)
    ) {
      init.body = body;
    } else {
      init.body = JSON.stringify(body);
      if (!init.headers["Content-Type"]) {
        init.headers["Content-Type"] = "application/json";
      }
    }
  }
  const response = await fetch(url, init);
  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      /* swallow */
    }
    const err = new Error(`Graph ${method} ${pathOrUrl} → ${response.status}: ${detail}`);
    err.status = response.status;
    err.body = detail;
    throw err;
  }
  return response;
}

// ── Listing ────────────────────────────────────────────────────────────────

export async function listAppFolderChildren(subfolder = "") {
  const pathPart = subfolder
    ? `:/${encodePathSegment(subfolder)}:`
    : "";
  const items = [];
  let next = `/me/drive/special/approot${pathPart}/children?$top=200&$select=id,name,size,eTag,createdDateTime,lastModifiedDateTime,file,folder,parentReference`;
  while (next) {
    let response;
    try {
      response = await graphFetch("GET", next);
    } catch (error) {
      if (error.status === 404 && subfolder) return [];
      throw error;
    }
    const page = await response.json();
    items.push(...(page.value ?? []));
    next = page["@odata.nextLink"] ?? null;
  }
  return items;
}

// ── Content & metadata ─────────────────────────────────────────────────────

// Heuristic decode: handle BOM, then try UTF-8 strict, then GB18030 (covers
// GB2312/GBK/GB18030), then Big5, fall back to lossy UTF-8. Returns the
// detected encoding so the sync layer can flag non-UTF-8 files for
// re-upload (normalising OneDrive content to UTF-8 on next save).
export function decodeBytes(buf) {
  const arr = new Uint8Array(buf);
  if (
    arr.length >= 3 &&
    arr[0] === 0xef && arr[1] === 0xbb && arr[2] === 0xbf
  ) {
    return { text: new TextDecoder("utf-8").decode(arr.slice(3)), encoding: "utf-8-bom" };
  }
  if (arr.length >= 2 && arr[0] === 0xff && arr[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(arr.slice(2)), encoding: "utf-16le" };
  }
  if (arr.length >= 2 && arr[0] === 0xfe && arr[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(arr.slice(2)), encoding: "utf-16be" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(arr), encoding: "utf-8" };
  } catch {
    // not utf-8
  }
  try {
    return { text: new TextDecoder("gb18030", { fatal: true }).decode(arr), encoding: "gb18030" };
  } catch {
    // not gb
  }
  try {
    return { text: new TextDecoder("big5", { fatal: true }).decode(arr), encoding: "big5" };
  } catch {
    // not big5
  }
  return { text: new TextDecoder("utf-8").decode(arr), encoding: "utf-8-lossy" };
}

export async function getItemContent(itemId) {
  const response = await graphFetch("GET", `/me/drive/items/${itemId}/content`);
  const buf = await response.arrayBuffer();
  return decodeBytes(buf);
}

// Raw byte download for encrypted blobs — no UTF-8/GBK decode would ever
// make sense on ciphertext. Returns a Uint8Array.
export async function getItemBytes(itemId) {
  const response = await graphFetch("GET", `/me/drive/items/${itemId}/content`);
  const buf = await response.arrayBuffer();
  return new Uint8Array(buf);
}

export async function getItemMetadata(itemId) {
  const response = await graphFetch(
    "GET",
    `/me/drive/items/${itemId}?$select=id,name,size,eTag,createdDateTime,lastModifiedDateTime,file,parentReference`,
  );
  return response.json();
}

// ── Create / update ────────────────────────────────────────────────────────

export async function createTxtAtRoot(filename, content) {
  // @microsoft.graph.conflictBehavior is a Graph parameter, NOT an HTTP
  // header (the `@` makes it an invalid header name). For the PUT /content
  // endpoint it goes in the URL query string.
  const response = await graphFetch(
    "PUT",
    `/me/drive/special/approot:/${encodePathSegment(filename)}:/content?@microsoft.graph.conflictBehavior=fail`,
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: content,
    },
  );
  return response.json();
}

export async function updateItemContent(itemId, content, etag = null) {
  const headers = { "Content-Type": "text/plain; charset=utf-8" };
  if (etag) headers["If-Match"] = etag;
  const response = await graphFetch("PUT", `/me/drive/items/${itemId}/content`, {
    headers,
    body: content,
  });
  return response.json();
}

// Binary uploader for encrypted blobs. Caller passes a Uint8Array (or
// ArrayBuffer); we mark Content-Type as octet-stream so OneDrive doesn't
// try to sniff it as text. Uses If-Match for conflict detection same as
// the text variant.
export async function updateBinaryContent(itemId, bytes, etag = null) {
  const headers = { "Content-Type": "application/octet-stream" };
  if (etag) headers["If-Match"] = etag;
  const body = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const response = await graphFetch("PUT", `/me/drive/items/${itemId}/content`, {
    headers,
    body,
  });
  return response.json();
}

// Create a new file at an AppFolder-relative path (e.g. `.enc/enc-3a9f.bin`)
// with binary content. Uses conflictBehavior=fail so caller can retry with
// a new filename on 409 — same pattern as createTxtAtRoot.
export async function createBinaryAtPath(relativePath, bytes) {
  const body = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Each path segment must be URL-encoded individually (preserving '/').
  const encodedPath = relativePath.split("/").map(encodePathSegment).join("/");
  const response = await graphFetch(
    "PUT",
    `/me/drive/special/approot:/${encodedPath}:/content?@microsoft.graph.conflictBehavior=fail`,
    {
      headers: { "Content-Type": "application/octet-stream" },
      body,
    },
  );
  return response.json();
}

// Keepalive variant: survives page unload / tab hide. Fire-and-forget;
// we don't await the response (the page may be torn down before it
// arrives), but the browser still pushes the bytes onto the wire.
// Used by beforeunload / visibilitychange-hidden last-ditch saves.
export async function updateItemContentKeepalive(itemId, content, etag = null) {
  const token = await getToken();
  const url = `${GRAPH_BASE}/me/drive/items/${itemId}/content`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "text/plain; charset=utf-8",
  };
  if (etag) headers["If-Match"] = etag;
  // Note the `keepalive: true` — body must be < 64KB per spec; .txt files
  // here are tiny so that's fine.
  fetch(url, {
    method: "PUT",
    headers,
    body: content,
    keepalive: true,
  }).catch(() => {});
}

// ── JSON config files (e.g. voice provider + API keys) ───────────────────
// Stored directly in the AppFolder root alongside the user's .txt drafts.
// Auto-synced across devices for free since OneDrive owns sync; deliberately
// plaintext — user agreed to the tradeoff when they chose "user-supplied key"
// over "central server". Single small file, no etag dance needed (last write
// wins is fine for an effectively single-author config).

export async function readJsonFromAppFolder(filename) {
  try {
    const response = await graphFetch(
      "GET",
      `/me/drive/special/approot:/${encodePathSegment(filename)}:/content`,
    );
    const buf = await response.arrayBuffer();
    const { text } = decodeBytes(buf);
    return JSON.parse(text);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export async function writeJsonToAppFolder(filename, obj) {
  const encodedPath = filename.split("/").map(encodePathSegment).join("/");
  const response = await graphFetch(
    "PUT",
    `/me/drive/special/approot:/${encodedPath}:/content?@microsoft.graph.conflictBehavior=replace`,
    {
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(obj, null, 2),
    },
  );
  return response.json();
}

// Binary read/write for small auxiliary blobs (e.g. crypto verifier). Path
// is AppFolder-relative and may contain '/' for nested locations. Returns a
// Uint8Array on read; throws with .status=404 if missing.
export async function readBinaryFromAppFolder(relativePath) {
  const encodedPath = relativePath.split("/").map(encodePathSegment).join("/");
  const response = await graphFetch(
    "GET",
    `/me/drive/special/approot:/${encodedPath}:/content`,
  );
  return new Uint8Array(await response.arrayBuffer());
}

export async function writeBinaryFromAppFolder(relativePath, bytes) {
  const body = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const encodedPath = relativePath.split("/").map(encodePathSegment).join("/");
  const response = await graphFetch(
    "PUT",
    `/me/drive/special/approot:/${encodedPath}:/content?@microsoft.graph.conflictBehavior=replace`,
    {
      headers: { "Content-Type": "application/octet-stream" },
      body,
    },
  );
  return response.json();
}

// ── Rename / move / delete ─────────────────────────────────────────────────

export async function renameItem(itemId, newName, etag = null) {
  const headers = {};
  if (etag) headers["If-Match"] = etag;
  const response = await graphFetch("PATCH", `/me/drive/items/${itemId}`, {
    headers,
    body: { name: newName },
  });
  return response.json();
}

export async function moveItemToFolder(itemId, targetFolderId, etag = null) {
  const headers = {};
  if (etag) headers["If-Match"] = etag;
  const response = await graphFetch("PATCH", `/me/drive/items/${itemId}`, {
    headers,
    body: { parentReference: { id: targetFolderId } },
  });
  return response.json();
}

export async function deleteItem(itemId, etag = null) {
  const headers = {};
  if (etag) headers["If-Match"] = etag;
  await graphFetch("DELETE", `/me/drive/items/${itemId}`, { headers });
}

// ── AppFolder root id (used when restoring from trash) ────────────────────

let appFolderRootIdCache = null;

export async function getAppFolderRootId() {
  if (appFolderRootIdCache) return appFolderRootIdCache;
  const response = await graphFetch("GET", "/me/drive/special/approot?$select=id");
  const item = await response.json();
  appFolderRootIdCache = item.id;
  return appFolderRootIdCache;
}

// ── Subfolder ensure (used for .trash/, .enc/, .enc/.trash/) ──────────────

const subfolderIdCache = new Map();

// Accepts either a single segment ("foo") or a nested path ("a/b/c"). Walks
// the path one segment at a time, creating any segment that doesn't exist.
// Returns the leaf folder's id and caches every intermediate id we touch.
export async function ensureSubfolder(pathOrName) {
  const path = String(pathOrName);
  if (subfolderIdCache.has(path)) return subfolderIdCache.get(path);

  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return getAppFolderRootId();

  let currentPath = "";
  let parentId = null;
  for (const seg of segments) {
    currentPath = currentPath ? `${currentPath}/${seg}` : seg;
    if (subfolderIdCache.has(currentPath)) {
      parentId = subfolderIdCache.get(currentPath);
      continue;
    }
    parentId = await ensureSingleSegment(currentPath, seg, parentId);
    subfolderIdCache.set(currentPath, parentId);
  }
  return parentId;
}

async function ensureSingleSegment(fullPath, segName, parentId) {
  const encoded = fullPath.split("/").map(encodePathSegment).join("/");
  try {
    const response = await graphFetch(
      "GET",
      `/me/drive/special/approot:/${encoded}?$select=id,name,folder`,
    );
    const item = await response.json();
    if (item.folder) return item.id;
    throw new Error(`${fullPath} exists but is not a folder`);
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  // Create under parentId (or approot when first level).
  const createPath = parentId
    ? `/me/drive/items/${parentId}/children`
    : "/me/drive/special/approot/children";
  const response = await graphFetch("POST", createPath, {
    body: {
      name: segName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    },
  });
  const item = await response.json();
  return item.id;
}
