const DB_NAME = "quest_novel_writer";
const DB_VERSION = 1;
const STORE_NAME = "documents";
const ACTIVE_DOC_KEY = "activeDoc";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

export async function loadActiveDocument() {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(ACTIVE_DOC_KEY);

    request.onsuccess = () => {
      const record = request.result;
      resolve(record ? record.content : "");
    };

    request.onerror = () => reject(request.error ?? new Error("Failed to read document"));
  });
}

export async function saveActiveDocument(content) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    store.put({
      id: ACTIVE_DOC_KEY,
      content,
      updatedAt: Date.now(),
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to save document"));
    tx.onabort = () => reject(tx.error ?? new Error("Save transaction aborted"));
  });
}
