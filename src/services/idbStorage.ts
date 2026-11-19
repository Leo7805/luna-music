import { StoredPlaybackState, StoredFolderRecord } from '../types/music';

const DB_NAME = 'LunaMusicDB';
const DB_VERSION = 1;
const HANDLES_STORE = 'handles';
const STATE_STORE = 'player_state';

const DIR_HANDLE_KEY = 'directory_handle';
const REGISTERED_FOLDERS_KEY = 'registered_root_folders';
const MIGRATION_DONE_KEY = 'migrated_single_to_multi';
const LAST_SOURCE_KEY = 'last_library_source';
const PLAYBACK_STATE_KEY = 'playback_state';
const LOCAL_STORAGE_STATE_KEY = 'luna_music_playback_state';

export type LibrarySourceType = 'folder' | 'files';

function openDatabase(): Promise<IDBDatabase | null> {
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
    const records: StoredFolderRecord[] = folders.map((f) => ({
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

const DEFAULT_STATE: StoredPlaybackState = {
  volume: 0.8,
  isMuted: false,
  repeatMode: 'off',
  shuffle: false,
  lastTrackId: null,
  lastPosition: 0,
  favourites: [],
};

/**
 * Persists player state to both IndexedDB and localStorage for instant hydration.
 */
export async function storePlaybackState(state: Partial<StoredPlaybackState>): Promise<void> {
  const current = await getStoredPlaybackState();
  const merged: StoredPlaybackState = {
    ...current,
    ...state,
  };

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_STATE_KEY, JSON.stringify(merged));
    }
  } catch {
    // Ignore localStorage quota errors
  }

  try {
    const db = await openDatabase();
    if (!db) return;

    const tx = db.transaction(STATE_STORE, 'readwrite');
    const store = tx.objectStore(STATE_STORE);
    store.put(merged, PLAYBACK_STATE_KEY);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  } catch {
    // Ignore IDB write error
  }
}

/**
 * Loads stored playback state, falling back to defaults.
 */
export async function getStoredPlaybackState(): Promise<StoredPlaybackState> {
  // 1. Try localStorage for zero-latency retrieval
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_STATE,
          ...parsed,
          favourites: Array.isArray(parsed.favourites) ? parsed.favourites : [],
        };
      }
    }
  } catch {
    // Ignore localStorage parse error
  }

  // 2. Fallback to IndexedDB
  try {
    const db = await openDatabase();
    if (!db) return DEFAULT_STATE;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STATE_STORE, 'readonly');
        const store = tx.objectStore(STATE_STORE);
        const req = store.get(PLAYBACK_STATE_KEY);

        req.onsuccess = () => {
          const result = req.result;
          db.close();
          if (result && typeof result === 'object') {
            resolve({
              ...DEFAULT_STATE,
              ...result,
              favourites: Array.isArray(result.favourites) ? result.favourites : [],
            });
          } else {
            resolve(DEFAULT_STATE);
          }
        };
        req.onerror = () => {
          db.close();
          resolve(DEFAULT_STATE);
        };
      } catch {
        db.close();
        resolve(DEFAULT_STATE);
      }
    });
  } catch {
    return DEFAULT_STATE;
  }
}
