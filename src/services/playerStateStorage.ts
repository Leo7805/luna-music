import { StoredPlaybackState } from '../types/music';
import {
  openDatabase,
  STATE_STORE,
  PLAYBACK_STATE_KEY,
  LOCAL_STORAGE_STATE_KEY,
} from './idbCore';

export const DEFAULT_STATE: StoredPlaybackState = {
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
 * Synchronously retrieves stored playback state from localStorage cache for instant hydration.
 */
export function getStoredPlaybackStateSync(): StoredPlaybackState {
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
  return DEFAULT_STATE;
}

/**
 * Loads stored playback state, falling back to defaults.
 */
export async function getStoredPlaybackState(): Promise<StoredPlaybackState> {
  // 1. Try localStorage for zero-latency retrieval
  const localCache = getStoredPlaybackStateSync();
  if (typeof localStorage !== 'undefined' && localStorage.getItem(LOCAL_STORAGE_STATE_KEY)) {
    // If local cache is populated, return it directly but also verify with IndexedDB if needed
    return localCache;
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
