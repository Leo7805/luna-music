import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  openDatabase,
  DB_NAME,
  DB_VERSION,
  HANDLES_STORE,
  STATE_STORE,
  DIR_HANDLE_KEY,
  MIGRATION_DONE_KEY,
  LOCAL_STORAGE_STATE_KEY,
  LOCAL_STORAGE_IMPORTED_FILES_KEY,
  withTransaction,
  idbGet,
  idbPut,
  idbDelete,
} from '../src/services/idbCore';
import {
  storeDirectoryHandle,
  getStoredDirectoryHandle,
  clearStoredDirectoryHandle,
  storeRegisteredFolders,
  getStoredRegisteredFolders,
} from '../src/services/folderStorage';
import {
  storeImportedFiles,
  getStoredImportedFiles,
} from '../src/services/importedFileStorage';
import {
  storePlaybackState,
  getStoredPlaybackState,
  DEFAULT_STATE,
} from '../src/services/playerStateStorage';
import {
  storePlaylists,
  getStoredPlaylists,
} from '../src/services/playlistStorage';
import * as idbStorageFacade from '../src/services/idbStorage';
import { StoredFolderRecord, StoredImportedFileRecord, Playlist } from '../src/types/music';

// Mock in-memory IndexedDB implementation for reliable node testing
class MockIDBDatabase {
  name: string;
  version: number;
  objectStoreNames: { contains: (s: string) => boolean };
  private stores: Map<string, Map<string, unknown>>;
  isClosed = false;

  constructor(name: string, version: number, stores: Map<string, Map<string, unknown>>) {
    this.name = name;
    this.version = version;
    this.stores = stores;
    this.objectStoreNames = {
      contains: (s: string) => this.stores.has(s),
    };
  }

  createObjectStore(name: string) {
    if (!this.stores.has(name)) {
      this.stores.set(name, new Map());
    }
  }

  transaction(storeNames: string | string[], _mode: IDBTransactionMode) {
    const primaryStoreName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
    const storeMap = this.stores.get(primaryStoreName) || new Map();

    let pendingRequests = 0;
    const tx: any = {
      oncomplete: null,
      onerror: null,
      onabort: null,
      objectStore: (_name: string) => ({
        get: (key: string) => {
          pendingRequests++;
          const req: any = { onsuccess: null, onerror: null, result: storeMap.get(key) };
          queueMicrotask(() => {
            if (req.onsuccess) req.onsuccess({ target: req });
            pendingRequests--;
            queueMicrotask(() => {
              if (pendingRequests === 0 && tx.oncomplete) tx.oncomplete();
            });
          });
          return req;
        },
        put: (val: unknown, key: string) => {
          pendingRequests++;
          storeMap.set(key, val);
          const req: any = { onsuccess: null, onerror: null };
          queueMicrotask(() => {
            if (req.onsuccess) req.onsuccess({ target: req });
            pendingRequests--;
            queueMicrotask(() => {
              if (pendingRequests === 0 && tx.oncomplete) tx.oncomplete();
            });
          });
          return req;
        },
        delete: (key: string) => {
          pendingRequests++;
          storeMap.delete(key);
          const req: any = { onsuccess: null, onerror: null };
          queueMicrotask(() => {
            if (req.onsuccess) req.onsuccess({ target: req });
            pendingRequests--;
            queueMicrotask(() => {
              if (pendingRequests === 0 && tx.oncomplete) tx.oncomplete();
            });
          });
          return req;
        },
      }),
    };

    queueMicrotask(() => {
      if (pendingRequests === 0 && tx.oncomplete) tx.oncomplete();
    });

    return tx;
  }

  close() {
    this.isClosed = true;
  }
}

describe('Storage Architecture & Regression (Stage 2)', () => {
  let mockStores: Map<string, Map<string, unknown>>;
  let localStorageData: Record<string, string>;

  beforeEach(() => {
    mockStores = new Map();
    mockStores.set(HANDLES_STORE, new Map());
    mockStores.set(STATE_STORE, new Map());

    localStorageData = {};
    const mockLocalStorage = {
      getItem: (k: string) => localStorageData[k] ?? null,
      setItem: (k: string, v: string) => {
        localStorageData[k] = v;
      },
      removeItem: (k: string) => {
        delete localStorageData[k];
      },
      clear: () => {
        localStorageData = {};
      },
    };

    vi.stubGlobal('localStorage', mockLocalStorage);

    const mockIDBFactory = {
      open: vi.fn((name: string, version: number) => {
        const db = new MockIDBDatabase(name, version, mockStores);
        const req: any = {
          result: db,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
          onblocked: null,
        };

        queueMicrotask(() => {
          if (!mockStores.has(HANDLES_STORE) || !mockStores.has(STATE_STORE)) {
            if (req.onupgradeneeded) req.onupgradeneeded();
          }
          if (req.onsuccess) req.onsuccess();
        });

        return req;
      }),
    };

    vi.stubGlobal('indexedDB', mockIDBFactory);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // 1. Fresh database initialization
  it('1. initializes fresh database with correct stores and version', async () => {
    expect(DB_NAME).toBe('LunaMusicDB');
    expect(DB_VERSION).toBe(1);

    const opened = await openDatabase();
    expect(opened).not.toBeNull();
    expect(mockStores.has(HANDLES_STORE)).toBe(true);
    expect(mockStores.has(STATE_STORE)).toBe(true);
  });

  // 2. Existing database reopening
  it('2. safely reopens existing database without modifying existing stores', async () => {
    mockStores.get(HANDLES_STORE)!.set('existing_key', 'existing_value');
    const opened = await openDatabase();
    expect(opened).not.toBeNull();
    expect(mockStores.get(HANDLES_STORE)!.get('existing_key')).toBe('existing_value');
  });

  // 3. Legacy single-folder migration
  it('3. idempotently migrates legacy single directory handle to registered_root_folders', async () => {
    const legacyHandle = { kind: 'directory', name: 'Legacy Library' } as unknown as FileSystemDirectoryHandle;
    mockStores.get(HANDLES_STORE)!.set(DIR_HANDLE_KEY, legacyHandle);

    const folders = await getStoredRegisteredFolders();
    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe('Legacy Library');
    expect(folders[0].sourceType).toBe('fs-access');
    expect(folders[0].handle).toBe(legacyHandle);
    expect(mockStores.get(HANDLES_STORE)!.get(MIGRATION_DONE_KEY)).toBe(true);

    // Second call does not re-migrate or duplicate
    const secondCall = await getStoredRegisteredFolders();
    expect(secondCall).toHaveLength(1);
    expect(secondCall[0].id).toBe(folders[0].id);
  });

  // 4. Multiple imported root folder restoration
  it('4. stores and restores multiple imported root folder records with handles', async () => {
    const handleA = { kind: 'directory', name: 'Folder A' } as unknown as FileSystemDirectoryHandle;
    const handleB = { kind: 'directory', name: 'Folder B' } as unknown as FileSystemDirectoryHandle;

    const testFolders: StoredFolderRecord[] = [
      { id: 'f-1', name: 'Folder A', sourceType: 'fs-access', handle: handleA, addedAt: 100, lastScannedAt: 200, trackCount: 15 },
      { id: 'f-2', name: 'Folder B', sourceType: 'fs-access', handle: handleB, addedAt: 300, lastScannedAt: 400, trackCount: 25 },
    ];

    const success = await storeRegisteredFolders(testFolders);
    expect(success).toBe(true);

    const loaded = await getStoredRegisteredFolders();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].name).toBe('Folder A');
    expect(loaded[0].handle).toBe(handleA);
    expect(loaded[1].name).toBe('Folder B');
    expect(loaded[1].handle).toBe(handleB);
  });

  // 5. Imported Files persistence
  it('5. persists imported files collection to both IndexedDB and localStorage cache', async () => {
    const fileHandle = { kind: 'file', name: 'song.mp3' } as unknown as FileSystemFileHandle;
    const records: StoredImportedFileRecord[] = [
      {
        id: 'file-1',
        name: 'song.mp3',
        relativePath: 'song.mp3',
        size: 5000,
        lastModified: 1000,
        handle: fileHandle,
        status: 'normal',
        addedAt: 1000,
      },
    ];

    const saved = await storeImportedFiles(records);
    expect(saved).toBe(true);

    // IndexedDB retains handle
    const loaded = await getStoredImportedFiles();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('song.mp3');
    expect(loaded[0].handle).toBe(fileHandle);

    // LocalStorage cache strips handle to prevent serialization errors
    const localCached = JSON.parse(localStorageData[LOCAL_STORAGE_IMPORTED_FILES_KEY]);
    expect(localCached).toHaveLength(1);
    expect(localCached[0].handle).toBeUndefined();
  });

  // 6. Stored file and directory handles
  it('6. preserves directory handles across store, get, and clear operations', async () => {
    const mockDirHandle = { kind: 'directory', name: 'Music' } as unknown as FileSystemDirectoryHandle;
    await storeDirectoryHandle(mockDirHandle);

    const retrieved = await getStoredDirectoryHandle();
    expect(retrieved).toBe(mockDirHandle);

    await clearStoredDirectoryHandle();
    const afterClear = await getStoredDirectoryHandle();
    expect(afterClear).toBeNull();
  });

  // 7. Playlist CRUD persistence
  it('7. persists playlists and retrieves them via localStorage or IndexedDB', async () => {
    const testPlaylists: Playlist[] = [
      {
        id: 'pl-1',
        name: 'My Playlist',
        tracks: [
          { trackId: 't-1', name: 'Track 1', addedAt: 1000 },
        ],
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    const stored = await storePlaylists(testPlaylists);
    expect(stored).toBe(true);

    const retrieved = await getStoredPlaylists();
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].name).toBe('My Playlist');
    expect(retrieved[0].tracks).toHaveLength(1);
  });

  // 8. Favourite persistence and state updates
  it('8. stores and retrieves playback state and favourite track IDs', async () => {
    await storePlaybackState({
      volume: 0.6,
      repeatMode: 'one',
      shuffle: true,
      favourites: ['canonical-1', 'canonical-2'],
    });

    const state = await getStoredPlaybackState();
    expect(state.volume).toBe(0.6);
    expect(state.repeatMode).toBe('one');
    expect(state.shuffle).toBe(true);
    expect(state.favourites).toEqual(['canonical-1', 'canonical-2']);
  });

  // 9. Fallback behaviour when IndexedDB is unavailable
  it('9. falls back gracefully to localStorage when indexedDB is undefined', async () => {
    vi.stubGlobal('indexedDB', undefined);

    // Should return default state without throwing
    const state = await getStoredPlaybackState();
    expect(state).toEqual(DEFAULT_STATE);

    // storePlaybackState still writes to localStorage
    await storePlaybackState({ volume: 0.3 });
    const localState = JSON.parse(localStorageData[LOCAL_STORAGE_STATE_KEY]);
    expect(localState.volume).toBe(0.3);

    // storePlaylists still writes to localStorage
    const testPlaylists: Playlist[] = [{ id: 'p1', name: 'Fallback PL', tracks: [], createdAt: 1, updatedAt: 1 }];
    await storePlaylists(testPlaylists);
    const loadedPlaylists = await getStoredPlaylists();
    expect(loadedPlaylists).toHaveLength(1);
    expect(loadedPlaylists[0].name).toBe('Fallback PL');
  });

  // 10. Permission and storage error handling
  it('10. handles database errors without crashing or throwing unhandled rejections', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('SecurityError: The operation is insecure');
      },
    });

    const db = await openDatabase();
    expect(db).toBeNull();

    const folders = await getStoredRegisteredFolders();
    expect(folders).toEqual([]);

    const handleSaved = await storeDirectoryHandle({} as any);
    expect(handleSaved).toBe(false);
  });

  // 11. Existing record compatibility after module extraction
  it('11. verifies facade re-exports match individual domain module exports identically', () => {
    expect(idbStorageFacade.storeRegisteredFolders).toBe(storeRegisteredFolders);
    expect(idbStorageFacade.getStoredRegisteredFolders).toBe(getStoredRegisteredFolders);
    expect(idbStorageFacade.storeImportedFiles).toBe(storeImportedFiles);
    expect(idbStorageFacade.getStoredImportedFiles).toBe(getStoredImportedFiles);
    expect(idbStorageFacade.storePlaybackState).toBe(storePlaybackState);
    expect(idbStorageFacade.getStoredPlaybackState).toBe(getStoredPlaybackState);
    expect(idbStorageFacade.storePlaylists).toBe(storePlaylists);
    expect(idbStorageFacade.getStoredPlaylists).toBe(getStoredPlaylists);
  });

  // 12. No accidental overwriting of unrelated data
  it('12. ensures updating one domain does not clobber or overwrite another domain', async () => {
    // 1. Store registered folders
    await storeRegisteredFolders([
      { id: 'f-1', name: 'Music', sourceType: 'fs-access', addedAt: 100 },
    ]);

    // 2. Store playback state
    await storePlaybackState({ volume: 0.9, favourites: ['fav-1'] });

    // 3. Store playlists
    await storePlaylists([
      { id: 'pl-1', name: 'Jazz', tracks: [], createdAt: 100, updatedAt: 100 },
    ]);

    // 4. Store imported files
    await storeImportedFiles([
      { id: 'imp-1', name: 'clip.wav', relativePath: 'clip.wav', size: 100, lastModified: 100, addedAt: 100 },
    ]);

    // Verify all four domains coexist without cross-contamination
    const folders = await getStoredRegisteredFolders();
    const state = await getStoredPlaybackState();
    const playlists = await getStoredPlaylists();
    const imported = await getStoredImportedFiles();

    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe('Music');

    expect(state.volume).toBe(0.9);
    expect(state.favourites).toEqual(['fav-1']);

    expect(playlists).toHaveLength(1);
    expect(playlists[0].name).toBe('Jazz');

    expect(imported).toHaveLength(1);
    expect(imported[0].name).toBe('clip.wav');
  });

  // Helper primitives verification
  it('verifies idbCore helper primitives withTransaction, idbGet, idbPut, idbDelete', async () => {
    const putRes = await idbPut(STATE_STORE, 'test_key', { count: 42 });
    expect(putRes).toBe(true);

    const getRes = await idbGet<{ count: number }>(STATE_STORE, 'test_key');
    expect(getRes).toEqual({ count: 42 });

    const txRes = await withTransaction(STATE_STORE, 'readonly', (store) => {
      return new Promise((res) => {
        const req = store.get('test_key');
        req.onsuccess = () => res(req.result);
      });
    });
    expect(txRes).toEqual({ count: 42 });

    const delRes = await idbDelete(STATE_STORE, 'test_key');
    expect(delRes).toBe(true);

    const afterDel = await idbGet(STATE_STORE, 'test_key');
    expect(afterDel).toBeNull();
  });
});
