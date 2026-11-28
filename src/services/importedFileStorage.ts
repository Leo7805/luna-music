import { StoredImportedFileRecord } from '../types/music';
import {
  openDatabase,
  HANDLES_STORE,
  REGISTERED_IMPORTED_FILES_KEY,
  LOCAL_STORAGE_IMPORTED_FILES_KEY,
} from './idbCore';

/**
 * Stores the records for the virtual Imported Files collection in IndexedDB.
 * Retains FileSystemFileHandle instances when available (FSA API).
 */
export async function storeImportedFiles(records: StoredImportedFileRecord[]): Promise<boolean> {
  // 1. Sync to localStorage cache
  try {
    if (typeof localStorage !== 'undefined') {
      if (records.length === 0) {
        localStorage.removeItem(LOCAL_STORAGE_IMPORTED_FILES_KEY);
      } else {
        const cached = records.map((r) => ({ ...r, handle: undefined, lrcHandle: undefined }));
        localStorage.setItem(LOCAL_STORAGE_IMPORTED_FILES_KEY, JSON.stringify(cached));
      }
    }
  } catch {
    // Ignore localStorage error
  }

  try {
    const db = await openDatabase();
    if (!db) return true; // Synced to localStorage

    // Sanitize records to ensure no Blob URLs or large binaries are stored
    const sanitized: StoredImportedFileRecord[] = records.map((r) => ({
      id: r.id,
      name: r.name,
      relativePath: r.relativePath,
      size: r.size,
      lastModified: r.lastModified,
      handle: r.handle,
      lrcHandle: r.lrcHandle,
      status: r.status,
      metadata: r.metadata ? { ...r.metadata, artworkUrl: undefined } : undefined,
      addedAt: r.addedAt,
      aliases: r.aliases,
    }));

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(HANDLES_STORE, 'readwrite');
        const store = tx.objectStore(HANDLES_STORE);
        store.put(sanitized, REGISTERED_IMPORTED_FILES_KEY);

        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          resolve(false);
        };
        tx.onabort = () => {
          db.close();
          resolve(false);
        };
      } catch {
        db.close();
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

/**
 * Retrieves the stored records for the virtual Imported Files collection.
 */
export async function getStoredImportedFiles(): Promise<StoredImportedFileRecord[]> {
  // 1. Try localStorage cache
  let localCache: StoredImportedFileRecord[] = [];
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_IMPORTED_FILES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          localCache = parsed;
        }
      }
    }
  } catch {
    // Ignore error
  }

  // 2. Try IndexedDB
  try {
    const db = await openDatabase();
    if (!db) return localCache;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(HANDLES_STORE, 'readonly');
        const store = tx.objectStore(HANDLES_STORE);
        const req = store.get(REGISTERED_IMPORTED_FILES_KEY);

        req.onsuccess = () => {
          const result = req.result;
          db.close();
          if (Array.isArray(result)) {
            resolve(result as StoredImportedFileRecord[]);
          } else {
            resolve(localCache);
          }
        };

        req.onerror = () => {
          db.close();
          resolve(localCache);
        };
      } catch {
        db.close();
        resolve(localCache);
      }
    });
  } catch {
    return localCache;
  }
}
