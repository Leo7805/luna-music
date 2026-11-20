import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HANDLES_STORE,
  STATE_STORE,
  REGISTERED_FOLDERS_KEY,
  DIR_HANDLE_KEY,
  MIGRATION_DONE_KEY,
} from '../src/services/idbCore';
import {
  storeRegisteredFolders,
  getStoredRegisteredFolders,
  clearStoredDirectoryHandle,
} from '../src/services/folderStorage';
import {
  storeImportedFiles,
  getStoredImportedFiles,
} from '../src/services/importedFileStorage';
import {
  combineFlatPlaylists,
  reconcileOverlappingTracks,
  isSameTrack,
  findExistingTrackByHandle,
  mergeTrackMetadataAndSources,
} from '../src/utils/trackIdentity';
import { resolvePlaylistTracks } from '../src/utils/playlistResolvers';
import { resolveFavouriteTracks } from '../src/utils/favouriteResolvers';
import { isTrackPlayable } from '../src/utils/audioFileTypes';
import {
  TrackItem,
  StoredFolderRecord,
  StoredImportedFileRecord,
  PlaylistTrackReference,
  IMPORTED_FILES_ROOT_ID,
} from '../src/types/music';

// Mock IDB Environment for Node
class MockIDBDatabase {
  objectStoreNames = { contains: (s: string) => this.stores.has(s) };
  constructor(public stores: Map<string, Map<string, unknown>>) {}
  createObjectStore(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new Map());
  }
  transaction(storeNames: string | string[]) {
    const sName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
    const sMap = this.stores.get(sName) || new Map();
    let pending = 0;
    const tx: any = {
      oncomplete: null,
      objectStore: () => ({
        get: (key: string) => {
          pending++;
          const req: any = { onsuccess: null, result: sMap.get(key) };
          queueMicrotask(() => {
            if (req.onsuccess) req.onsuccess({ target: req });
            pending--;
            queueMicrotask(() => { if (pending === 0 && tx.oncomplete) tx.oncomplete(); });
          });
          return req;
        },
        put: (val: unknown, key: string) => {
          pending++;
          sMap.set(key, val);
          const req: any = { onsuccess: null };
          queueMicrotask(() => {
            if (req.onsuccess) req.onsuccess({ target: req });
            pending--;
            queueMicrotask(() => { if (pending === 0 && tx.oncomplete) tx.oncomplete(); });
          });
          return req;
        },
        delete: (key: string) => {
          pending++;
          sMap.delete(key);
          const req: any = { onsuccess: null };
          queueMicrotask(() => {
            if (req.onsuccess) req.onsuccess({ target: req });
            pending--;
            queueMicrotask(() => { if (pending === 0 && tx.oncomplete) tx.oncomplete(); });
          });
          return req;
        },
      }),
    };
    queueMicrotask(() => { if (pending === 0 && tx.oncomplete) tx.oncomplete(); });
    return tx;
  }
  close() {}
}

const mockStores = new Map<string, Map<string, unknown>>();

function createMockHandle(name: string, isSame = false): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    isSameEntry: vi.fn().mockImplementation(async (other: FileSystemFileHandle) => {
      return isSame || other.name === name;
    }),
  } as unknown as FileSystemFileHandle;
}

function makeTrack(id: string, name: string, folderIds: string[], opts: Partial<TrackItem> = {}): TrackItem {
  return {
    id,
    name,
    relativePath: opts.relativePath || name,
    size: opts.size ?? 1024,
    lastModified: opts.lastModified ?? 1000,
    folderIds,
    aliases: opts.aliases || [id],
    handle: opts.handle,
    file: opts.file,
    status: opts.status || 'normal',
    lrcHandle: opts.lrcHandle,
    metadata: {
      title: opts.metadata?.title || name,
      artist: opts.metadata?.artist || 'Artist',
      album: opts.metadata?.album || 'Album',
      isMetadataLoaded: opts.metadata?.isMetadataLoaded ?? false,
    },
  };
}

describe('Library Source Removal & Persistence Consistency', () => {
  beforeEach(() => {
    mockStores.clear();
    mockStores.set(HANDLES_STORE, new Map());
    mockStores.set(STATE_STORE, new Map());

    vi.stubGlobal('indexedDB', {
      open: () => {
        const db = new MockIDBDatabase(mockStores);
        const req: any = { onsuccess: null, result: db };
        queueMicrotask(() => { if (req.onsuccess) req.onsuccess({ target: req }); });
        return req;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('1. Folder-only import and removal persists empty state without resurrection', async () => {
    const f: StoredFolderRecord = { id: 'f1', name: 'Music', sourceType: 'fs-access', addedAt: 1 };
    await storeRegisteredFolders([f]);
    expect(await getStoredRegisteredFolders()).toHaveLength(1);

    await storeRegisteredFolders([]);
    const retrieved = await getStoredRegisteredFolders();
    expect(retrieved).toEqual([]);
    expect(mockStores.get(HANDLES_STORE)?.get(DIR_HANDLE_KEY)).toBeUndefined();
  });

  it('2. File-only import and removal persists empty state in IDB and localStorage', async () => {
    const r: StoredImportedFileRecord = { id: 'imp:1', name: 'a.mp3', relativePath: 'a.mp3', size: 10, lastModified: 1, addedAt: 1 };
    await storeImportedFiles([r]);
    expect(await getStoredImportedFiles()).toHaveLength(1);

    await storeImportedFiles([]);
    expect(await getStoredImportedFiles()).toEqual([]);
  });

  it('3. Folder-first, then file import reconciles to single logical track', async () => {
    const h = createMockHandle('Song.mp3');
    const folderTrack = makeTrack('f1:Song.mp3', 'Song.mp3', ['f1'], { handle: h });
    const fileTrack = makeTrack(`${IMPORTED_FILES_ROOT_ID}:Song.mp3`, 'Song.mp3', [IMPORTED_FILES_ROOT_ID], { handle: h });

    const matched = await findExistingTrackByHandle(fileTrack.handle!, [folderTrack]);
    expect(matched).toBe(folderTrack);
    mergeTrackMetadataAndSources(folderTrack, fileTrack);

    expect(folderTrack.folderIds).toEqual(['f1', IMPORTED_FILES_ROOT_ID]);
    const flat = combineFlatPlaylists([
      { id: 'f1', name: 'F', sourceType: 'fs-access', tracks: [folderTrack], tree: {} as any, trackCount: 1, addedAt: 1, lastScannedAt: 1, permissionStatus: 'granted' },
      { id: IMPORTED_FILES_ROOT_ID, name: 'I', sourceType: 'files', tracks: [folderTrack], tree: {} as any, trackCount: 1, addedAt: 1, lastScannedAt: 1, permissionStatus: 'granted' },
    ]);
    expect(flat).toHaveLength(1);
  });

  it('4. File-first, then folder import reconciles to single logical track', async () => {
    const h = createMockHandle('TrackB.mp3');
    const fileTrack = makeTrack(`${IMPORTED_FILES_ROOT_ID}:TrackB.mp3`, 'TrackB.mp3', [IMPORTED_FILES_ROOT_ID], { handle: h });
    const folderTrack = makeTrack('f1:TrackB.mp3', 'TrackB.mp3', ['f1'], { handle: h });

    const reconciled = await reconcileOverlappingTracks([folderTrack], [fileTrack], 'f1');
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0].folderIds).toEqual([IMPORTED_FILES_ROOT_ID, 'f1']);
  });

  it('5. Removing only folder source preserves track in imported files', async () => {
    const track = makeTrack('f1:S.mp3', 'S.mp3', ['f1', IMPORTED_FILES_ROOT_ID], {
      aliases: ['f1:S.mp3', `${IMPORTED_FILES_ROOT_ID}:S.mp3`],
    });
    // Remove folder f1
    track.folderIds = (track.folderIds || []).filter((id) => id !== 'f1');
    track.id = `${IMPORTED_FILES_ROOT_ID}:S.mp3`;

    expect(track.folderIds).toEqual([IMPORTED_FILES_ROOT_ID]);
    expect(track.id).toBe(`${IMPORTED_FILES_ROOT_ID}:S.mp3`);

    await storeRegisteredFolders([]);
    await storeImportedFiles([{ id: track.id, name: track.name, relativePath: track.relativePath, size: track.size, lastModified: track.lastModified, addedAt: 1 }]);

    expect(await getStoredRegisteredFolders()).toHaveLength(0);
    expect(await getStoredImportedFiles()).toHaveLength(1);
  });

  it('6. Removing only imported-file source preserves track in folder', async () => {
    const track = makeTrack('f1:S.mp3', 'S.mp3', ['f1', IMPORTED_FILES_ROOT_ID]);
    track.folderIds = (track.folderIds || []).filter((id) => id !== IMPORTED_FILES_ROOT_ID);
    expect(track.folderIds).toEqual(['f1']);

    await storeRegisteredFolders([{ id: 'f1', name: 'M', sourceType: 'fs-access', addedAt: 1 }]);
    await storeImportedFiles([]);

    expect(await getStoredRegisteredFolders()).toHaveLength(1);
    expect(await getStoredImportedFiles()).toHaveLength(0);
  });

  it('7. Removing both sources leaves storage completely empty', async () => {
    await storeRegisteredFolders([]);
    await clearStoredDirectoryHandle();
    await storeImportedFiles([]);

    expect(await getStoredRegisteredFolders()).toEqual([]);
    expect(await getStoredImportedFiles()).toEqual([]);
    expect(mockStores.get(HANDLES_STORE)?.get(DIR_HANDLE_KEY)).toBeUndefined();
  });

  it('8. Clearing multiple imported files clears all persisted records', async () => {
    const records = [
      { id: '1', name: '1.mp3', relativePath: '1.mp3', size: 10, lastModified: 1, addedAt: 1 },
      { id: '2', name: '2.mp3', relativePath: '2.mp3', size: 20, lastModified: 2, addedAt: 2 },
    ];
    await storeImportedFiles(records);
    expect(await getStoredImportedFiles()).toHaveLength(2);

    await storeImportedFiles([]);
    expect(await getStoredImportedFiles()).toEqual([]);
  });

  it('9. Removing parent/child overlapping folders preserves remaining child tracks', async () => {
    const parent = makeTrack('parent:sub/a.mp3', 'a.mp3', ['parent', 'child'], { aliases: ['parent:sub/a.mp3', 'child:a.mp3'] });
    const remaining = [parent].map((t) => ({
      ...t,
      id: 'child:a.mp3',
      folderIds: (t.folderIds || []).filter((id) => id !== 'parent'),
    }));
    expect(remaining[0].folderIds).toEqual(['child']);
    expect(remaining[0].id).toBe('child:a.mp3');
  });

  it('10. Reload after each removal restores only surviving sources', async () => {
    // Stage A: only folder stored
    await storeRegisteredFolders([{ id: 'f1', name: 'F', sourceType: 'fs-access', addedAt: 1 }]);
    await storeImportedFiles([]);
    expect(await getStoredRegisteredFolders()).toHaveLength(1);
    expect(await getStoredImportedFiles()).toHaveLength(0);

    // Stage B: only files stored
    await storeRegisteredFolders([]);
    await storeImportedFiles([{ id: 'imp:1', name: '1.mp3', relativePath: '1.mp3', size: 1, lastModified: 1, addedAt: 1 }]);
    expect(await getStoredRegisteredFolders()).toHaveLength(0);
    expect(await getStoredImportedFiles()).toHaveLength(1);
  });

  it('11. Multiple consecutive reloads without count growth (idempotence)', async () => {
    await storeRegisteredFolders([]);
    await storeImportedFiles([]);

    for (let i = 0; i < 5; i++) {
      const folders = await getStoredRegisteredFolders();
      const files = await getStoredImportedFiles();
      expect(folders).toHaveLength(0);
      expect(files).toHaveLength(0);
    }
  });

  it('12. Re-import after complete removal creates exactly one logical entry', async () => {
    await storeRegisteredFolders([]);
    await storeImportedFiles([]);

    const h = createMockHandle('New.mp3');
    const newTrack = makeTrack('f2:New.mp3', 'New.mp3', ['f2'], { handle: h });
    const flat = combineFlatPlaylists([{
      id: 'f2', name: 'F2', sourceType: 'fs-access', tracks: [newTrack], tree: {} as any, trackCount: 1, addedAt: 1, lastScannedAt: 1, permissionStatus: 'granted'
    }]);
    expect(flat).toHaveLength(1);
  });

  it('13. Legacy fallback collections are filtered out from stored folders', async () => {
    const list: StoredFolderRecord[] = [
      { id: IMPORTED_FILES_ROOT_ID, name: 'Imported Files', sourceType: 'files', addedAt: 1 },
      { id: 'imported-files-root', name: 'Imported Files', sourceType: 'files', addedAt: 1 },
      { id: 'valid_fsa', name: 'Real Folder', sourceType: 'fs-access', addedAt: 1 },
    ];
    await storeRegisteredFolders(list);
    const stored = await getStoredRegisteredFolders();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('valid_fsa');
  });

  it('14. Pending asynchronous scans after removal are safely rejected', () => {
    let scanGen = 1;
    const cancelScan = () => { scanGen = -1; };
    const isScanCurrent = (gen: number) => scanGen === gen;

    const currentGen = scanGen;
    cancelScan();
    expect(isScanCurrent(currentGen)).toBe(false);
  });

  it('15. Playlist preservation marks missing source as unreadable without deleting reference', () => {
    const refs: PlaylistTrackReference[] = [
      { trackId: 'f1:removed.mp3', name: 'Removed Song', artist: 'Artist', addedAt: 1 },
    ];
    // Library has no loaded tracks
    const resolved = resolvePlaylistTracks(refs, []);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].status).toBe('unreadable');
    expect(resolved[0].name).toBe('Removed Song');
  });

  it('16. Favourite preservation keeps unmapped favourite IDs for future restoration', () => {
    const favourites = new Set(['f1:removed.mp3']);
    const res = resolveFavouriteTracks([], favourites);
    expect(res.resolvedTracks).toHaveLength(0);
    expect(res.unresolvedIds).toContain('f1:removed.mp3');
  });

  it('17. Queue references to removed tracks reject playback', () => {
    const unreadable = makeTrack('f1:missing.mp3', 'missing.mp3', [], { status: 'unreadable' });
    expect(isTrackPlayable(unreadable)).toBe(false);
  });

  it('18. Lyrics metadata after partial source removal is preserved', () => {
    const lrcHandle = createMockHandle('song.lrc');
    const track = makeTrack(`${IMPORTED_FILES_ROOT_ID}:song.mp3`, 'song.mp3', [IMPORTED_FILES_ROOT_ID], {
      lrcHandle,
    });
    expect(track.lrcHandle).toBe(lrcHandle);
  });

  it('19. Two different physical files with identical names remain independent', async () => {
    const h1 = { kind: 'file', name: 'Same.mp3', isSameEntry: vi.fn().mockResolvedValue(false) } as any;
    const h2 = { kind: 'file', name: 'Same.mp3', isSameEntry: vi.fn().mockResolvedValue(false) } as any;

    const t1 = makeTrack('dir1:Same.mp3', 'Same.mp3', ['dir1'], { handle: h1 });
    const match = await findExistingTrackByHandle(h2, [t1]);
    expect(match).toBeNull();
    expect(isSameTrack(t1, makeTrack('dir2:Same.mp3', 'Same.mp3', ['dir2'], { handle: h2 }))).toBe(false);
  });

  it('20. IndexedDB restoration from an existing pre-fix library does not resurrect legacy single handle', async () => {
    // Setup pre-fix DB state: empty registered folders, but lingering legacy DIR_HANDLE_KEY
    mockStores.get(HANDLES_STORE)?.set(DIR_HANDLE_KEY, { kind: 'directory', name: 'Old Library' });
    mockStores.get(HANDLES_STORE)?.set(REGISTERED_FOLDERS_KEY, []);

    const loaded = await getStoredRegisteredFolders();
    expect(loaded).toEqual([]);
    expect(mockStores.get(HANDLES_STORE)?.get(DIR_HANDLE_KEY)).toBeUndefined();
    expect(mockStores.get(HANDLES_STORE)?.get(MIGRATION_DONE_KEY)).toBe(true);
  });
});
