// Microsoft Graph wrapper for the AppFolder sandbox. Every call is scoped to
// /me/drive/special/approot — even a token leak cannot reach the rest of
// the user's OneDrive.

import { getToken } from "./auth.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function encodePathSegment(name) {
  return encodeURIComponent(name).replace(/'/g, "%27");
}

async function graphFetch(method, pathOrUrl, { headers = {}, body = null } = {}) {
  const token = await getToken();
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`;
  const init = {
    method,
    headers: { Authorization: `Bearer ${token}`, ...headers },
  };
  if (body != null) {
    if (typeof body === "string" || body instanceof ArrayBuffer || body instanceof Blob) {
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

// ── Subfolder ensure (used for .trash/) ───────────────────────────────────

const subfolderIdCache = new Map();

export async function ensureSubfolder(name) {
  if (subfolderIdCache.has(name)) return subfolderIdCache.get(name);
  try {
    const response = await graphFetch(
      "GET",
      `/me/drive/special/approot:/${encodePathSegment(name)}?$select=id,name,folder`,
    );
    const item = await response.json();
    if (item.folder) {
      subfolderIdCache.set(name, item.id);
      return item.id;
    }
    throw new Error(`${name} exists but is not a folder`);
  } catch (error) {
    if (error.status !== 404) throw error;
    const response = await graphFetch("POST", "/me/drive/special/approot/children", {
      body: {
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      },
    });
    const item = await response.json();
    subfolderIdCache.set(name, item.id);
    return item.id;
  }
}
