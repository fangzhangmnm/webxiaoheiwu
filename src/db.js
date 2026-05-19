const DB_NAME = "WebXiaoHeiWu";
const DB_VERSION = 3;
const DOCS_STORE = "docs";
const SETTINGS_STORE = "settings";
const LEGACY_STORE = "documents";
const LEGACY_ACTIVE_KEY = "activeDoc";
const ACTIVE_DOC_ID_KEY = "activeDocId";

function newId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function blankDoc({ title = "", content = "", createdAt = Date.now() } = {}) {
  return {
    id: newId(),
    title,
    content,
    createdAt,
    modifiedAt: createdAt,
    deletedAt: null,
    // OneDrive sync fields. Set lazily by the sync layer.
    onedriveItemId: null,
    etag: null,
    lastSyncedAt: null,
    dirty: false,
    contentLoaded: true,   // locally-created docs always have content
    remoteFound: true,     // until proven otherwise by a list-merge
    remoteName: null,      // actual OneDrive filename (may differ from computed)
    locked: false,         // read-only guard; doesn't sync (per-device choice)
    // Encryption (v3+): when `encrypted=true`, `content`/`title`/`createdAt`
    // are NEVER persisted in plaintext — they live only inside encryptedBlob,
    // which holds the same ciphertext bytes that go to OneDrive. The plaintext
    // is reconstructed into in-memory state only after a successful decrypt.
    encrypted: false,
    encryptedBlob: null,   // Uint8Array | null
  };
}

export { newId };

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;

      if (!db.objectStoreNames.contains(DOCS_STORE)) {
        const store = db.createObjectStore(DOCS_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("deletedAt", "deletedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }

      if (event.oldVersion < 2 && db.objectStoreNames.contains(LEGACY_STORE)) {
        const legacy = tx.objectStore(LEGACY_STORE);
        const getReq = legacy.get(LEGACY_ACTIVE_KEY);
        getReq.onsuccess = () => {
          const old = getReq.result;
          if (old && typeof old.content === "string" && old.content.length > 0) {
            const migrated = blankDoc({
              title: "迁移自旧版",
              content: old.content,
              createdAt: old.updatedAt ?? Date.now(),
            });
            tx.objectStore(DOCS_STORE).put(migrated);
            tx.objectStore(SETTINGS_STORE).put(migrated.id, ACTIVE_DOC_ID_KEY);
          }
        };
        // Old store is left empty (not deleted) to avoid mutating schema from
        // inside an onsuccess callback. Cheap and safe.
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error("Failed to open IndexedDB"));
    };
  });
  return dbPromise;
}

function txPromise(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Transaction error"));
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

export async function listDocs({ includeTrashed = false } = {}) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCS_STORE, "readonly");
    const store = tx.objectStore(DOCS_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result ?? [];
      resolve(includeTrashed ? all : all.filter((d) => !d.deletedAt));
    };
    req.onerror = () => reject(req.error ?? new Error("Failed to list docs"));
  });
}

export async function getDoc(id) {
  if (!id) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCS_STORE, "readonly");
    const req = tx.objectStore(DOCS_STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error ?? new Error("Failed to get doc"));
  });
}

export async function createDoc({ title = "", content = "" } = {}) {
  const doc = blankDoc({ title, content });
  const db = await openDb();
  const tx = db.transaction(DOCS_STORE, "readwrite");
  tx.objectStore(DOCS_STORE).put(doc);
  await txPromise(tx);
  return doc;
}

export async function updateDoc(id, patch) {
  if (!id) throw new Error("updateDoc: missing id");
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCS_STORE, "readwrite");
    const store = tx.objectStore(DOCS_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        reject(new Error(`updateDoc: doc ${id} not found`));
        return;
      }
      const next = {
        ...existing,
        ...patch,
        modifiedAt: Date.now(),
        dirty: true,
      };
      store.put(next);
      tx.oncomplete = () => resolve(next);
      tx.onerror = () => reject(tx.error ?? new Error("updateDoc tx error"));
    };
    getReq.onerror = () => reject(getReq.error ?? new Error("updateDoc get error"));
  });
}

// Sync-layer write: applies arbitrary fields without auto-dirty / auto-mtime.
// Use this for ETag updates, content pulled from remote, remoteFound flips, etc.
export async function applySyncPatch(id, patch) {
  if (!id) throw new Error("applySyncPatch: missing id");
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCS_STORE, "readwrite");
    const store = tx.objectStore(DOCS_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        reject(new Error(`applySyncPatch: doc ${id} not found`));
        return;
      }
      const next = { ...existing, ...patch };
      store.put(next);
      tx.oncomplete = () => resolve(next);
      tx.onerror = () => reject(tx.error ?? new Error("applySyncPatch tx error"));
    };
    getReq.onerror = () => reject(getReq.error ?? new Error("applySyncPatch get error"));
  });
}

// Sync-layer atomic conditional write: only apply patch if the doc is still
// clean (no user edits raced in while sync was fetching). Returns
// { applied: true|false, reason? }. Used by checkRemoteFreshness so a
// silent remote-replace can't clobber the user mid-keystroke.
export async function applySyncPatchIfClean(id, patch) {
  if (!id) throw new Error("applySyncPatchIfClean: missing id");
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCS_STORE, "readwrite");
    const store = tx.objectStore(DOCS_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        tx.abort();
        resolve({ applied: false, reason: "missing" });
        return;
      }
      if (existing.dirty) {
        tx.abort();
        resolve({ applied: false, reason: "dirty" });
        return;
      }
      store.put({ ...existing, ...patch });
      tx.oncomplete = () => resolve({ applied: true });
      tx.onerror = () => reject(tx.error ?? new Error("applySyncPatchIfClean tx error"));
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// Insert a doc whose fields (id, sync metadata, etc.) are already prepared.
// Used by the sync layer when ingesting a remote item or creating a sibling.
export async function insertSyncedDoc(doc) {
  if (!doc?.id) throw new Error("insertSyncedDoc: doc.id required");
  const db = await openDb();
  const tx = db.transaction(DOCS_STORE, "readwrite");
  tx.objectStore(DOCS_STORE).put(doc);
  await txPromise(tx);
  return doc;
}

export async function findDocByItemId(onedriveItemId) {
  if (!onedriveItemId) return null;
  const all = await listDocs({ includeTrashed: true });
  return all.find((d) => d.onedriveItemId === onedriveItemId) ?? null;
}

export async function trashDoc(id) {
  return updateDoc(id, { deletedAt: Date.now() });
}

export async function restoreDoc(id) {
  return updateDoc(id, { deletedAt: null });
}

export async function purgeDoc(id) {
  const db = await openDb();
  const tx = db.transaction(DOCS_STORE, "readwrite");
  tx.objectStore(DOCS_STORE).delete(id);
  await txPromise(tx);
}

export async function getSetting(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, "readonly");
    const req = tx.objectStore(SETTINGS_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error ?? new Error("Failed to read setting"));
  });
}

export async function setSetting(key, value) {
  const db = await openDb();
  const tx = db.transaction(SETTINGS_STORE, "readwrite");
  tx.objectStore(SETTINGS_STORE).put(value, key);
  await txPromise(tx);
}

export async function getActiveDocId() {
  return getSetting(ACTIVE_DOC_ID_KEY);
}

export async function setActiveDocId(id) {
  return setSetting(ACTIVE_DOC_ID_KEY, id);
}
