export const DB_NAME = 'LunaMusicDB';
export const DB_VERSION = 1;
export const HANDLES_STORE = 'handles';
export const STATE_STORE = 'player_state';

export const DIR_HANDLE_KEY = 'directory_handle';
export const REGISTERED_FOLDERS_KEY = 'registered_root_folders';
export const REGISTERED_IMPORTED_FILES_KEY = 'registered_imported_files';
export const MIGRATION_DONE_KEY = 'migrated_single_to_multi';
export const LAST_SOURCE_KEY = 'last_library_source';
export const PLAYBACK_STATE_KEY = 'playback_state';
export const LOCAL_STORAGE_STATE_KEY = 'luna_music_playback_state';
export const PLAYLISTS_KEY = 'user_playlists';
export const LOCAL_STORAGE_PLAYLISTS_KEY = 'luna_music_user_playlists';
export const LOCAL_STORAGE_IMPORTED_FILES_KEY = 'luna_music_imported_files';

export type LibrarySourceType = 'folder' | 'files';

/**
 * Opens or initializes the shared IndexedDB instance.
 */
export function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(HANDLES_STORE)) {
          db.createObjectStore(HANDLES_STORE);
        }
        if (!db.objectStoreNames.contains(STATE_STORE)) {
          db.createObjectStore(STATE_STORE);
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

/**
 * Safely executes a transaction with automatic connection cleanup and error handling.
 */
export async function withTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore, tx: IDBTransaction) => Promise<T> | T
): Promise<T | null> {
  try {
    const db = await openDatabase();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);

        let callbackResult: Promise<T> | T;
        try {
          callbackResult = callback(store, tx);
        } catch {
          db.close();
          resolve(null);
          return;
        }

        tx.oncomplete = async () => {
          try {
            const res = await callbackResult;
            db.close();
            resolve(res);
          } catch {
            db.close();
            resolve(null);
          }
        };

        tx.onerror = () => {
          db.close();
          resolve(null);
        };

        tx.onabort = () => {
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
 * Generic key-value retrieval from an IndexedDB object store.
 */
export async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  try {
    const db = await openDatabase();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);

        req.onsuccess = () => {
          const result = req.result;
          db.close();
          resolve(result !== undefined ? (result as T) : null);
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
 * Generic key-value write to an IndexedDB object store.
 */
export async function idbPut(storeName: string, key: string, value: unknown): Promise<boolean> {
  try {
    const db = await openDatabase();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.put(value, key);

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
 * Generic key-value deletion from an IndexedDB object store.
 */
export async function idbDelete(storeName: string, key: string): Promise<boolean> {
  try {
    const db = await openDatabase();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.delete(key);

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
