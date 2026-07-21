// Local image blob store backed by IndexedDB (async, dependency-free).
//
// ONLY images live here; all list data stays in localStorage (no migration).
// Keeping binary out of localStorage protects the ~5 MB quota and the rotating
// backups (lib/local-backup.ts), which cap the JSON payload at 1.5 MB.
//
// Every call is a no-op that resolves gracefully when IndexedDB is unavailable
// (SSR, `node --test`, private modes), so callers never need to guard.

const DB_NAME = "ajwords.images";
const DB_VERSION = 1;
const STORE = "images";

const hasIndexedDB = (): boolean =>
  typeof indexedDB !== "undefined" && indexedDB !== null;

let dbPromise: Promise<IDBDatabase | null> | null = null;

const openDb = (): Promise<IDBDatabase | null> => {
  if (!hasIndexedDB()) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  return dbPromise;
};

const readRequest = <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> =>
  openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const tx = db.transaction(STORE, mode);
          const request = run(tx.objectStore(STORE));
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );

/** Store (or overwrite) a blob under `id`. Resolves true on success. */
export const putImage = (id: string, blob: Blob): Promise<boolean> =>
  openDb().then(
    (db) =>
      new Promise<boolean>((resolve) => {
        if (!db) {
          resolve(false);
          return;
        }
        try {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(blob, id);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      })
  );

/** Fetch the blob stored under `id`, or null if absent/unavailable. */
export const getImage = (id: string): Promise<Blob | null> =>
  readRequest<Blob>("readonly", (store) => store.get(id) as IDBRequest<Blob>).then(
    (result) => (result instanceof Blob ? result : null)
  );

/** Remove the blob stored under `id` (no-op if absent). */
export const deleteImage = (id: string): Promise<void> =>
  openDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        if (!db) {
          resolve();
          return;
        }
        try {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch {
          resolve();
        }
      })
  );

/** All stored image ids. */
export const listImageIds = (): Promise<string[]> =>
  readRequest<IDBValidKey[]>("readonly", (store) => store.getAllKeys()).then(
    (keys) =>
      Array.isArray(keys)
        ? keys.filter((key): key is string => typeof key === "string")
        : []
  );

/**
 * Best-effort garbage collection: drop every stored blob whose id is not in
 * `referencedIds`. Call on load with the ids still referenced by any item.
 */
export const pruneImages = async (
  referencedIds: Iterable<string>
): Promise<void> => {
  const keep = new Set(referencedIds);
  const ids = await listImageIds();
  await Promise.all(
    ids.filter((id) => !keep.has(id)).map((id) => deleteImage(id))
  );
};
