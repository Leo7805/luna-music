import { StoredFolderRecord } from '../types/music';
import {
  openDatabase,
  HANDLES_STORE,
  DIR_HANDLE_KEY,
  REGISTERED_FOLDERS_KEY,
  MIGRATION_DONE_KEY,
  LAST_SOURCE_KEY,
  LibrarySourceType,
} from './idbCore';

export type { LibrarySourceType };

/**
 * Stores the DirectoryHandle for the root music library folder.
 */
export async function storeDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const db = await openDatabase();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(HANDLES_STORE, 'readwrite');
        const store = tx.objectStore(HANDLES_STORE);
        store.put(handle, DIR_HANDLE_KEY);
        store.put('folder', LAST_SOURCE_KEY);

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
 * Retrieves the stored DirectoryHandle if available.
 */
export async function getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDatabase();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(HANDLES_STORE, 'readonly');
        const store = tx.objectStore(HANDLES_STORE);
        const req = store.get(DIR_HANDLE_KEY);

        req.onsuccess = () => {
          const result = req.result;
          db.close();
          if (result && typeof result === 'object' && 'kind' in result && result.kind === 'directory') {
            resolve(result as FileSystemDirectoryHandle);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

/**
 * Clears stored directory handle.
 */
export async function clearStoredDirectoryHandle(): Promise<void> {
  try {
    const db = await openDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(HANDLES_STORE, 'readwrite');
        const store = tx.objectStore(HANDLES_STORE);
        store.delete(DIR_HANDLE_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      } catch {
        db.close();
        resolve();
      }
    });
  } catch {
    // Ignore error
  }
}

/**
 * Stores the list of registered root folders in IndexedDB.
 * Saves only lightweight serializable metadata and DirectoryHandle instances.
 * Never stores entire audio files or large artwork blobs.
 */
export async function storeRegisteredFolders(folders: StoredFolderRecord[]): Promise<boolean> {
  try {
    const db = await openDatabase();
    if (!db) return false;

    // Sanitize records to ensure only lightweight serializable data is stored
    // Exclude virtual collections such as imported-files-root from registered folder handles store
    const records: StoredFolderRecord[] = folders
      .filter((f) => f.id !== 'imported-files-root')
      .map((f) => ({
        id: f.id,
        name: f.name,
        sourceType: f.sourceType,
        handle: f.handle,
        addedAt: f.addedAt,
        lastScannedAt: f.lastScannedAt,
        trackCount: f.trackCount,
      }));

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(HANDLES_STORE, 'readwrite');
        const store = tx.objectStore(HANDLES_STORE);
        store.put(records, REGISTERED_FOLDERS_KEY);
        store.put('folder', LAST_SOURCE_KEY);

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
 * Retrieves the stored list of registered root folders.
 * Includes idempotent automatic migration of legacy single-directory handles.
 */
export async function getStoredRegisteredFolders(): Promise<StoredFolderRecord[]> {
  try {
    const db = await openDatabase();
    if (!db) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(HANDLES_STORE, 'readwrite');
        const store = tx.objectStore(HANDLES_STORE);
        const req = store.get(REGISTERED_FOLDERS_KEY);

        req.onsuccess = () => {
          const result = req.result;
          if (Array.isArray(result) && result.length > 0) {
            db.close();
            resolve(result as StoredFolderRecord[]);
            return;
          }

          // If no multi-folder records exist, check for legacy single handle
          const legacyReq = store.get(DIR_HANDLE_KEY);
          legacyReq.onsuccess = () => {
            const legacyHandle = legacyReq.result;
            if (
              legacyHandle &&
              typeof legacyHandle === 'object' &&
              'kind' in legacyHandle &&
              legacyHandle.kind === 'directory'
            ) {
              const migratedFolder: StoredFolderRecord = {
                id: `fsa_legacy_${Date.now()}`,
                name: (legacyHandle as FileSystemDirectoryHandle).name || 'Local Music',
                sourceType: 'fs-access',
                handle: legacyHandle as FileSystemDirectoryHandle,
                addedAt: Date.now(),
              };

              // Persist migration result idempotently
              store.put([migratedFolder], REGISTERED_FOLDERS_KEY);
              store.put(true, MIGRATION_DONE_KEY);

              tx.oncomplete = () => {
                db.close();
                resolve([migratedFolder]);
              };
              return;
            }

            db.close();
            resolve([]);
          };

          legacyReq.onerror = () => {
            db.close();
            resolve([]);
          };
        };

        req.onerror = () => {
          db.close();
          resolve([]);
        };
      } catch {
        db.close();
        resolve([]);
      }
    });
  } catch {
    return [];
  }
}
