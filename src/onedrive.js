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

export async function getItemContent(itemId) {
  const response = await graphFetch("GET", `/me/drive/items/${itemId}/content`);
  return response.text();
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
  const response = await graphFetch(
    "PUT",
    `/me/drive/special/approot:/${encodePathSegment(filename)}:/content`,
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        // Fail rather than silently overwrite if the name already exists —
        // the caller is responsible for resolving collisions (and bumping
        // the numeric suffix) before retrying.
        "@microsoft.graph.conflictBehavior": "fail",
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
