import { Playlist } from '../types/music';
import {
  openDatabase,
  STATE_STORE,
  PLAYLISTS_KEY,
  LOCAL_STORAGE_PLAYLISTS_KEY,
} from './idbCore';

/**
 * Persists user playlists to IndexedDB and localStorage.
 */
export async function storePlaylists(playlists: Playlist[]): Promise<boolean> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_PLAYLISTS_KEY, JSON.stringify(playlists));
    }
  } catch {
    // Ignore localStorage quota errors
  }

  try {
    const db = await openDatabase();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STATE_STORE, 'readwrite');
        const store = tx.objectStore(STATE_STORE);
        store.put(playlists, PLAYLISTS_KEY);
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
 * Loads stored playlists from localStorage (fast) or IndexedDB.
 */
export async function getStoredPlaylists(): Promise<Playlist[]> {
  // 1. Try localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_PLAYLISTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    }
  } catch {
    // Ignore localStorage parse error
  }

  // 2. Try IndexedDB
  try {
    const db = await openDatabase();
    if (!db) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STATE_STORE, 'readonly');
        const store = tx.objectStore(STATE_STORE);
        const req = store.get(PLAYLISTS_KEY);

        req.onsuccess = () => {
          const result = req.result;
          db.close();
          if (Array.isArray(result)) {
            resolve(result);
          } else {
            resolve([]);
          }
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
