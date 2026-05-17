// Sync orchestrator: OneDrive AppFolder is SSOT, IndexedDB is offline cache.
//
// Design rules — every code path here exists to preserve user data:
//  - 412 push conflict      → save current local content as a sibling .txt,
//                              then reload remote into the active doc.
//                              Two files preserved; user merges manually
//                              on PC. No content destroyed.
//  - 404 push on clean doc  → mark remoteFound=false (☁️?). No remote write.
//                              No local delete.
//  - 404 push on dirty doc  → caller is responsible for the [save as new]
//                              vs [discard] modal.
//  - List + merge           → never auto-purges local docs. Missing-on-remote
//                              just flips remoteFound. User must confirm.
//  - Prefetch               → idempotent, throttled, skips files > 5MB.

import {
  listDocs,
  getDoc,
  applySyncPatch,
  applySyncPatchIfClean,
  insertSyncedDoc,
  purgeDoc,
  newId,
} from "./db.js";
import {
  listAppFolderChildren,
  getItemContent,
  getItemMetadata,
  createTxtAtRoot,
  updateItemContent,
  renameItem,
  moveItemToFolder,
  deleteItem,
  ensureSubfolder,
  getAppFolderRootId,
} from "./onedrive.js";

const PREFETCH_SIZE_LIMIT = 5 * 1024 * 1024;

// ── Filename helpers ──────────────────────────────────────────────────────

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatDateForFilename(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function sanitizeFilenamePart(s) {
  return String(s ?? "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 200);
}

function detectDeviceLabel() {
  const ua = (globalThis.navigator?.userAgent ?? "").toLowerCase();
  if (ua.includes("quest") || ua.includes("oculusbrowser")) return "Quest";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("android")) return "Android";
  return "PC";
}

function siblingTitleFor(originalTitle, ts = Date.now()) {
  const d = new Date(ts);
  const stamp = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}-${pad2(d.getMinutes())}`;
  const tag = `(${detectDeviceLabel()} 离线副本 ${stamp})`;
  return originalTitle ? `${originalTitle} ${tag}` : tag;
}

// Remote-name parser. Tries the new canonical form (YYYYMMDD N title)
// first, then several legacy variants so old files don't get misread
// during migration. Returns { canonical, createdAt, title }.
function parseDateStr(s) {
  const year = +s.slice(0, 4);
  const month = +s.slice(4, 6) - 1;
  const day = +s.slice(6, 8);
  const date = new Date(year, month, day, 12, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function canonicalParse(date, title) {
  return { canonical: true, createdAt: date.getTime(), title };
}

export function parseRemoteFilename(name) {
  const stem = (name ?? "").replace(/\.txt$/i, "");

  // "YYYYMMDD" alone — no title
  let m = stem.match(/^(\d{8})$/);
  if (m) {
    const date = parseDateStr(m[1]);
    if (date) return canonicalParse(date, "");
  }

  // "YYYYMMDD <rest>" — whole rest is the title verbatim. The trailing
  // collision suffix (" 1", " 2", ...) that the sync layer adds on PUT
  // 409 is intentionally part of the title here; we don't try to peel
  // it off because we can't tell user-typed "foo 1" apart from a system-
  // added collision suffix.
  m = stem.match(/^(\d{8})\s+(.+)$/);
  if (m) {
    const date = parseDateStr(m[1]);
    if (date) return canonicalParse(date, m[2].trim());
  }

  return { canonical: false, createdAt: null, title: stem };
}

function computeFilenameFor(doc) {
  const dateStr = formatDateForFilename(doc.createdAt);
  const title = sanitizeFilenamePart(doc.title);
  return title ? `${dateStr} ${title}.txt` : `${dateStr}.txt`;
}

// Try the base name first, then append " 1", " 2", ... on 409 collision.
// The suffix lives in the actual OneDrive filename and is reflected back
// into doc.remoteName.
async function createWithCollisionRetry(doc, content) {
  const baseName = computeFilenameFor(doc);
  const stem = baseName.replace(/\.txt$/i, "");
  for (let n = 0; n < 200; n += 1) {
    const candidate = n === 0 ? `${stem}.txt` : `${stem} ${n}.txt`;
    try {
      return await createTxtAtRoot(candidate, content);
    } catch (error) {
      if (error.status === 409) continue;
      throw error;
    }
  }
  throw new Error("too many filename collisions creating remote file");
}

// ── Push ──────────────────────────────────────────────────────────────────

// Single-flight guard per doc so a rapid double-push doesn't spawn duplicate
// siblings on 412.
const inFlightPush = new Set();

export async function pushDoc(docId) {
  if (inFlightPush.has(docId)) return { ok: false, skipped: "in-flight" };
  inFlightPush.add(docId);
  try {
    const doc = await getDoc(docId);
    if (!doc) return { ok: false, missing: true };
    if (doc.deletedAt) return { ok: false, skipped: "trashed" };

    if (!doc.onedriveItemId) {
      return await pushAsNew(doc);
    }
    return await pushUpdate(doc);
  } finally {
    inFlightPush.delete(docId);
  }
}

async function pushAsNew(doc) {
  const pushedContent = doc.content ?? "";
  const pushedTitle = doc.title ?? "";
  const item = await createWithCollisionRetry(doc, pushedContent);
  // Content might have diverged while the PUT was in flight (user kept
  // typing). Only mark clean if it didn't.
  const current = await getDoc(doc.id);
  const stillSame =
    current &&
    (current.content ?? "") === pushedContent &&
    (current.title ?? "") === pushedTitle;
  const patch = {
    onedriveItemId: item.id,
    etag: item.eTag,
    lastSyncedAt: Date.now(),
    contentLoaded: true,
    remoteFound: true,
    remoteName: item.name,
  };
  if (stillSame) patch.dirty = false;
  await applySyncPatch(doc.id, patch);
  return { ok: true, action: "created", item };
}

async function pushUpdate(doc) {
  const pushedContent = doc.content ?? "";
  try {
    const item = await updateItemContent(doc.onedriveItemId, pushedContent, doc.etag);
    // Content may have diverged during the PUT (heartbeat fired mid-typing).
    // Re-read IDB and only flip dirty=false if it still matches what we pushed.
    const current = await getDoc(doc.id);
    const stillSame = current && (current.content ?? "") === pushedContent;
    const patch = {
      etag: item.eTag,
      lastSyncedAt: Date.now(),
      remoteName: item.name,
      remoteFound: true,
    };
    if (stillSame) patch.dirty = false;
    await applySyncPatch(doc.id, patch);

    // Reconcile remote filename to "YYYYMMDD title". If a collision-suffix
    // is needed (another file has the desired name), append " 1", " 2", ...
    const desiredName = computeFilenameFor(doc);
    if (desiredName && item.name !== desiredName) {
      await tryRenameRemote(doc.id, item.id, item.eTag, desiredName);
    }
    return { ok: true, action: "updated", item };
  } catch (error) {
    if (error.status === 412) return await handleEtagConflict(doc);
    if (error.status === 404) return await handle404OnPush(doc);
    throw error;
  }
}

async function tryRenameRemote(docId, itemId, etag, desiredBaseName) {
  const stem = desiredBaseName.replace(/\.txt$/i, "");
  for (let n = 0; n < 50; n += 1) {
    const candidate = n === 0 ? `${stem}.txt` : `${stem} ${n}.txt`;
    try {
      const renamed = await renameItem(itemId, candidate, etag);
      await applySyncPatch(docId, {
        remoteName: renamed.name,
        etag: renamed.eTag,
      });
      return;
    } catch (error) {
      if (error.status === 409) continue;
      if (error.status === 412) return;
      return;
    }
  }
}

// Save current local dirty content as a sibling, then reload remote into
// the active doc. Both versions preserved.
async function handleEtagConflict(doc) {
  const siblingId = newId();
  const siblingCreatedAt = Date.now();
  const siblingTitle = siblingTitleFor(doc.title ?? "", siblingCreatedAt);
  const tentative = {
    id: siblingId,
    title: siblingTitle,
    createdAt: siblingCreatedAt,
  };
  const siblingItem = await createWithCollisionRetry(tentative, doc.content ?? "");

  const parsed = parseRemoteFilename(siblingItem.name);
  const siblingDoc = {
    id: siblingId,
    title: parsed.canonical ? parsed.title : siblingTitle,
    content: doc.content ?? "",
    createdAt: parsed.canonical
      ? parsed.createdAt
      : siblingCreatedAt,
    modifiedAt: Date.now(),
    deletedAt: null,
    onedriveItemId: siblingItem.id,
    etag: siblingItem.eTag,
    lastSyncedAt: Date.now(),
    dirty: false,
    contentLoaded: true,
    remoteFound: true,
    remoteName: siblingItem.name,
    locked: true,  // conflict copy — protect from accidental edits, force review
  };
  await insertSyncedDoc(siblingDoc);

  // Now reload remote into the original doc.
  try {
    const meta = await getItemMetadata(doc.onedriveItemId);
    const { text: content } = await getItemContent(doc.onedriveItemId);
    await applySyncPatch(doc.id, {
      content,
      etag: meta.eTag,
      lastSyncedAt: Date.now(),
      dirty: false,
      contentLoaded: true,
      remoteFound: true,
      remoteName: meta.name,
    });
  } catch (error) {
    // If we can't reload, the sibling still preserved the user's content.
    console.warn("conflict: sibling created but reload failed", error);
  }

  return {
    ok: false,
    conflict: "sibling-created",
    siblingDocId: siblingDoc.id,
    siblingName: siblingItem.name,
  };
}

async function handle404OnPush(doc) {
  await applySyncPatch(doc.id, { remoteFound: false });
  if (doc.dirty) {
    return { ok: false, conflict: "missing-dirty" };
  }
  return { ok: false, conflict: "missing-clean" };
}

// ── Pull (single doc freshness check) ─────────────────────────────────────

export async function checkRemoteFreshness(docId) {
  const doc = await getDoc(docId);
  if (!doc || !doc.onedriveItemId) return { ok: true, changed: false };

  let meta;
  try {
    meta = await getItemMetadata(doc.onedriveItemId);
  } catch (error) {
    if (error.status === 404) {
      await applySyncPatch(docId, { remoteFound: false });
      return { ok: false, missing: true };
    }
    throw error;
  }

  if (meta.eTag === doc.etag) {
    if (!doc.remoteFound) {
      await applySyncPatch(docId, { remoteFound: true, remoteName: meta.name });
    }
    return { ok: true, changed: false };
  }

  if (doc.dirty) {
    return await handleEtagConflict(doc);
  }

  // Local is clean as of the read above. But the user might type while we
  // GET content (~100-500ms network). Use atomic conditional write so we
  // never overwrite an in-flight keystroke.
  const { text: content, encoding } = await getItemContent(doc.onedriveItemId);
  const applyResult = await applySyncPatchIfClean(docId, {
    content,
    etag: meta.eTag,
    remoteName: meta.name,
    lastSyncedAt: Date.now(),
    contentLoaded: true,
    remoteFound: true,
  });

  if (!applyResult.applied) {
    // User dirty'd during our fetch — fall back to conflict path.
    const reread = await getDoc(docId);
    if (reread?.dirty) return await handleEtagConflict(reread);
    return { ok: true, changed: false };
  }

  // Non-UTF-8 source → immediately push back to OneDrive in UTF-8. We do
  // this here instead of marking dirty so the user's dirty flag stays a
  // pure "user has unsaved edits" signal.
  if (encoding && encoding !== "utf-8" && encoding !== "utf-8-bom") {
    await reuploadAsUtf8(docId).catch((err) =>
      console.warn("encoding re-upload:", err),
    );
  }

  return { ok: true, changed: true, contentChanged: true };
}

// Push the current local content of an already-synced doc back to OneDrive
// without going through the dirty/timer machinery. Used by the encoding
// normaliser. Uses If-Match so a parallel update doesn't get clobbered.
async function reuploadAsUtf8(docId) {
  const doc = await getDoc(docId);
  if (!doc || !doc.onedriveItemId) return;
  try {
    const item = await updateItemContent(doc.onedriveItemId, doc.content ?? "", doc.etag);
    await applySyncPatch(docId, {
      etag: item.eTag,
      lastSyncedAt: Date.now(),
      remoteName: item.name,
      remoteFound: true,
    });
  } catch (error) {
    if (error.status === 412) {
      // Someone else wrote between our fetch and our re-upload — just bail,
      // their version is the new SSOT.
      return;
    }
    if (error.status === 404) {
      await applySyncPatch(docId, { remoteFound: false });
      return;
    }
    throw error;
  }
}

// ── List + merge ──────────────────────────────────────────────────────────

export async function mergeRemoteList() {
  let rootItems;
  let trashItems;
  try {
    [rootItems, trashItems] = await Promise.all([
      listAppFolderChildren(""),
      listAppFolderChildren(".trash"),
    ]);
  } catch (error) {
    throw error; // bail; do not mutate local state on partial list
  }

  const remoteById = new Map();
  for (const item of rootItems) {
    if (item.file && /\.txt$/i.test(item.name ?? "")) {
      remoteById.set(item.id, { ...item, _location: "root" });
    }
  }
  for (const item of trashItems) {
    if (item.file && /\.txt$/i.test(item.name ?? "")) {
      remoteById.set(item.id, { ...item, _location: "trash" });
    }
  }

  const localDocs = await listDocs({ includeTrashed: true });
  const localItemIds = new Set();

  for (const doc of localDocs) {
    if (!doc.onedriveItemId) continue;
    localItemIds.add(doc.onedriveItemId);
    const remote = remoteById.get(doc.onedriveItemId);

    if (!remote) {
      if (doc.remoteFound !== false) {
        await applySyncPatch(doc.id, { remoteFound: false });
      }
      continue;
    }

    const patch = {
      remoteFound: true,
      remoteName: remote.name,
    };

    if (remote._location === "trash" && !doc.deletedAt) {
      patch.deletedAt = Date.parse(remote.lastModifiedDateTime ?? "") || Date.now();
    } else if (remote._location === "root" && doc.deletedAt) {
      patch.deletedAt = null;
    }

    await applySyncPatch(doc.id, patch);
  }

  // Insert stubs for unknown remote items.
  let stubsCreated = 0;
  for (const [itemId, item] of remoteById) {
    if (localItemIds.has(itemId)) continue;
    const parsed = parseRemoteFilename(item.name);
    const createdAt = parsed.canonical
      ? parsed.createdAt
      : Date.parse(item.createdDateTime ?? "") || Date.now();
    const stub = {
      id: newId(),
      title: parsed.title,
      content: "",
      createdAt,
      modifiedAt: Date.parse(item.lastModifiedDateTime ?? "") || createdAt,
      deletedAt: item._location === "trash"
        ? Date.parse(item.lastModifiedDateTime ?? "") || Date.now()
        : null,
      onedriveItemId: item.id,
      etag: item.eTag,
      lastSyncedAt: Date.now(),
      dirty: false,
      contentLoaded: false,
      remoteFound: true,
      remoteName: item.name,
      locked: true,  // docs that appear from OneDrive default to locked
    };
    await insertSyncedDoc(stub);
    stubsCreated += 1;
  }

  return {
    rootCount: rootItems.length,
    trashCount: trashItems.length,
    stubsCreated,
  };
}

// ── Prefetch content for stubs ───────────────────────────────────────────

let prefetchInFlight = false;

export async function prefetchPendingContents({ onProgress } = {}) {
  if (prefetchInFlight) return { skipped: "in-flight" };
  prefetchInFlight = true;
  try {
    const docs = await listDocs({ includeTrashed: true });
    const stubs = docs.filter(
      (d) => d.onedriveItemId && !d.contentLoaded && d.remoteFound,
    );
    const total = stubs.length;
    let done = 0;
    for (const doc of stubs) {
      try {
        const meta = await getItemMetadata(doc.onedriveItemId);
        if ((meta.size ?? 0) > PREFETCH_SIZE_LIMIT) {
          // Mark as "too large to prefetch" — leave contentLoaded=false,
          // user can still open it explicitly while online.
          done += 1;
          onProgress?.({ done, total, skipped: doc.id });
          continue;
        }
        const { text: content, encoding } = await getItemContent(doc.onedriveItemId);
        await applySyncPatch(doc.id, {
          content,
          contentLoaded: true,
          etag: meta.eTag,
          remoteName: meta.name,
          remoteFound: true,
        });
        if (encoding && encoding !== "utf-8" && encoding !== "utf-8-bom") {
          await reuploadAsUtf8(doc.id).catch((err) =>
            console.warn("prefetch encoding re-upload:", err),
          );
        }
      } catch (error) {
        if (error.status === 404) {
          await applySyncPatch(doc.id, { remoteFound: false });
        }
        // else: skip; will retry on next prefetch run
      } finally {
        done += 1;
        onProgress?.({ done, total });
      }
    }
    return { done, total };
  } finally {
    prefetchInFlight = false;
  }
}

// ── Explicit content fetch for a single doc (e.g. user clicked a stub) ──

export async function fetchContentForDoc(docId) {
  const doc = await getDoc(docId);
  if (!doc || !doc.onedriveItemId) return null;
  try {
    const meta = await getItemMetadata(doc.onedriveItemId);
    const { text: content, encoding } = await getItemContent(doc.onedriveItemId);
    await applySyncPatch(docId, {
      content,
      etag: meta.eTag,
      remoteName: meta.name,
      remoteFound: true,
      contentLoaded: true,
      lastSyncedAt: Date.now(),
    });
    if (encoding && encoding !== "utf-8" && encoding !== "utf-8-bom") {
      await reuploadAsUtf8(docId).catch((err) =>
        console.warn("fetchContentForDoc encoding re-upload:", err),
      );
    }
    return content;
  } catch (error) {
    if (error.status === 404) {
      await applySyncPatch(docId, { remoteFound: false });
    }
    throw error;
  }
}

// ── Trash (move to OneDrive .trash/) ─────────────────────────────────────

export async function moveDocToTrash(docId) {
  const doc = await getDoc(docId);
  if (!doc) return { ok: false, missing: true };

  await applySyncPatch(docId, { deletedAt: Date.now() });

  if (!doc.onedriveItemId) {
    return { ok: true, localOnly: true };
  }

  try {
    const trashId = await ensureSubfolder(".trash");
    await moveItemToFolder(doc.onedriveItemId, trashId);
    const meta = await getItemMetadata(doc.onedriveItemId);
    await applySyncPatch(docId, {
      remoteName: meta.name,
      etag: meta.eTag,
      lastSyncedAt: Date.now(),
      dirty: false,
    });
    return { ok: true };
  } catch (error) {
    if (error.status === 404) {
      await applySyncPatch(docId, { remoteFound: false });
      return { ok: true, alreadyGone: true };
    }
    // Network / 5xx — keep deletedAt set and mark dirty so a retry pushes again.
    await applySyncPatch(docId, { dirty: true });
    return { ok: false, error };
  }
}

export async function restoreDocFromTrash(docId) {
  const doc = await getDoc(docId);
  if (!doc) return { ok: false, missing: true };

  await applySyncPatch(docId, { deletedAt: null });

  if (!doc.onedriveItemId) return { ok: true, localOnly: true };

  try {
    const rootId = await getAppFolderRootId();
    await moveItemToFolder(doc.onedriveItemId, rootId);
    const meta = await getItemMetadata(doc.onedriveItemId);
    await applySyncPatch(docId, {
      remoteName: meta.name,
      etag: meta.eTag,
      lastSyncedAt: Date.now(),
    });
    return { ok: true };
  } catch (error) {
    if (error.status === 404) {
      await applySyncPatch(docId, { remoteFound: false });
      return { ok: false, missing: true };
    }
    return { ok: false, error };
  }
}

export async function purgeDocPermanent(docId) {
  const doc = await getDoc(docId);
  if (!doc) return { ok: false, missing: true };
  if (doc.onedriveItemId) {
    try {
      await deleteItem(doc.onedriveItemId);
    } catch (error) {
      if (error.status !== 404) {
        return { ok: false, error };
      }
    }
  }
  await purgeDoc(docId);
  return { ok: true };
}

// ── Last-active doc pointer (cross-device "continue where I left off") ──

const LAST_ACTIVE_PATH = ".userdata/last-active.json";

export async function pushLastActiveItemId(itemId) {
  if (!itemId) return { ok: false, reason: "no-item" };
  try {
    await graphFetch(
      "PUT",
      `/me/drive/special/approot:/${LAST_ACTIVE_PATH}:/content?@microsoft.graph.conflictBehavior=replace`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          savedAt: Date.now(),
          device: detectDeviceLabel(),
        }),
      },
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

export async function pullLastActiveItemId() {
  try {
    const response = await graphFetch(
      "GET",
      `/me/drive/special/approot:/${LAST_ACTIVE_PATH}:/content`,
    );
    const data = await response.json();
    return data?.itemId ?? null;
  } catch (error) {
    if (error.status === 404) return null;
    return null; // any failure: just bail, don't disturb local state
  }
}

// ── RIME user dict sync ──────────────────────────────────────────────────
// Stored as a single JSON blob at Apps/<AppName>/.userdata/rime-user-dir.json.
// Last-write-wins — RIME just relearns frequencies if a remote push
// happens to overwrite local learning. The user dict is a best-effort
// enhancement, not authoritative data.

const USER_DICT_PATH = ".userdata/rime-user-dir.json";

async function getUserDictRemote() {
  try {
    const response = await graphFetch(
      "GET",
      `/me/drive/special/approot:/${USER_DICT_PATH}:/content`,
    );
    return response.json();
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function putUserDictRemote(payload) {
  await graphFetch(
    "PUT",
    `/me/drive/special/approot:/${USER_DICT_PATH}:/content?@microsoft.graph.conflictBehavior=replace`,
    {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function pushUserDict(ime) {
  if (!ime || typeof ime.dumpUserDir !== "function") return { ok: false, reason: "no-backend" };
  const dump = await ime.dumpUserDir();
  if (!dump || !Array.isArray(dump.files) || dump.files.length === 0) {
    return { ok: false, reason: "empty" };
  }
  dump.savedAt = Date.now();
  dump.device = detectDeviceLabel();
  try {
    await putUserDictRemote(dump);
    return { ok: true, fileCount: dump.files.length };
  } catch (error) {
    return { ok: false, error };
  }
}

export async function pullUserDict(ime) {
  if (!ime || typeof ime.restoreUserDir !== "function") return { ok: false, reason: "no-backend" };
  let dump;
  try {
    dump = await getUserDictRemote();
  } catch (error) {
    return { ok: false, error };
  }
  if (!dump) return { ok: true, reason: "no-remote" };
  await ime.restoreUserDir(dump);
  return { ok: true, fileCount: dump.files?.length ?? 0, savedAt: dump.savedAt };
}

// ── User-driven action for ☁️? ghost docs ────────────────────────────────

export async function reuploadGhostAsNew(docId) {
  const doc = await getDoc(docId);
  if (!doc) return { ok: false, missing: true };
  // Treat as if it never had an onedriveItemId.
  await applySyncPatch(docId, {
    onedriveItemId: null,
    etag: null,
    remoteName: null,
    remoteFound: true,
    dirty: true,
    lastSyncedAt: null,
  });
  return await pushDoc(docId);
}
