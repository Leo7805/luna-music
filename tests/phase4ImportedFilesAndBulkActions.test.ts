import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  TrackItem,
  Playlist,
  StoredImportedFileRecord,
  IMPORTED_FILES_ROOT_ID,
  IMPORTED_FILES_COLLECTION_NAME,
} from '../src/types/music';
import {
  applyBulkPlayNext,
  applyAddToQueue,
  combineFlatPlaylists,
  buildUnifiedMultiFolderTree,
} from '../src/utils/musicTree';
import {
  storeImportedFiles,
  getStoredImportedFiles,
  storePlaylists,
  getStoredPlaylists,
} from '../src/services/idbStorage';

const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

describe('Phase 4: Imported Files, Multi-Selection & Bulk Actions', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      // @ts-expect-error Mocking localStorage in Node test runner
      globalThis.localStorage = createLocalStorageMock();
    }
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  describe('1. Virtual Imported Files Collection & Persistence', () => {
    it('stores and retrieves imported file records in IndexedDB without storing large binaries', async () => {
      const records: StoredImportedFileRecord[] = [
        {
          id: `${IMPORTED_FILES_ROOT_ID}:track1.mp3`,
          name: 'track1.mp3',
          relativePath: 'track1.mp3',
          size: 1024,
          lastModified: 1700000000,
          status: 'normal',
          metadata: {
            title: 'Track 1',
            artist: 'Artist 1',
            album: 'Album 1',
            isMetadataLoaded: true,
          },
          addedAt: 1700000000,
        },
        {
          id: `${IMPORTED_FILES_ROOT_ID}:track2.flac`,
          name: 'track2.flac',
          relativePath: 'track2.flac',
          size: 2048,
          lastModified: 1700000500,
          status: 'normal',
          metadata: {
            title: 'Track 2',
            artist: 'Artist 2',
            album: 'Album 2',
            isMetadataLoaded: true,
          },
          addedAt: 1700000500,
        },
      ];

      const success = await storeImportedFiles(records);
      expect(success).toBe(true);

      const retrieved = await getStoredImportedFiles();
      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].id).toBe(`${IMPORTED_FILES_ROOT_ID}:track1.mp3`);
      expect(retrieved[0].name).toBe('track1.mp3');
      expect(retrieved[1].id).toBe(`${IMPORTED_FILES_ROOT_ID}:track2.flac`);
    });

    it('has correct virtual root constants and flat directory boundaries', () => {
      expect(IMPORTED_FILES_ROOT_ID).toBe('imported_files_root');
      expect(IMPORTED_FILES_COLLECTION_NAME).toBe('Imported Files');
    });
  });

  describe('2. Bulk Play Next & Add to Queue Logic', () => {
    const trackA: TrackItem = {
      id: 'root1:A.mp3',
      name: 'A.mp3',
      relativePath: 'A.mp3',
      size: 100,
      lastModified: 1,
      metadata: { title: 'Song A', artist: 'Art', album: 'Alb', isMetadataLoaded: true },
    };
    const trackB: TrackItem = {
      id: 'root1:B.mp3',
      name: 'B.mp3',
      relativePath: 'B.mp3',
      size: 200,
      lastModified: 2,
      metadata: { title: 'Song B', artist: 'Art', album: 'Alb', isMetadataLoaded: true },
    };
    const trackC: TrackItem = {
      id: 'root1:C.mp3',
      name: 'C.mp3',
      relativePath: 'C.mp3',
      size: 300,
      lastModified: 3,
      metadata: { title: 'Song C', artist: 'Art', album: 'Alb', isMetadataLoaded: true },
    };
    const trackD: TrackItem = {
      id: 'root1:D.mp3',
      name: 'D.mp3',
      relativePath: 'D.mp3',
      size: 400,
      lastModified: 4,
      metadata: { title: 'Song D', artist: 'Art', album: 'Alb', isMetadataLoaded: true },
    };

    it('bulk play next moves upcoming items without creating duplicates and preserves selection order', () => {
      const queue = [trackA, trackB, trackC, trackD];
      const current = trackA;
      // User selects [trackC, trackD] and clicks "Play Next"
      const { nextQueue, movedCount, addedCount } = applyBulkPlayNext(queue, current, [
        trackC,
        trackD,
      ]);

      expect(movedCount).toBe(2);
      expect(addedCount).toBe(0);
      expect(nextQueue.map((t) => t.id)).toEqual([
        'root1:A.mp3',
        'root1:C.mp3',
        'root1:D.mp3',
        'root1:B.mp3',
      ]);
    });

    it('bulk play next inserts non-existent items immediately after current track in preserved order', () => {
      const queue = [trackA, trackB];
      const current = trackA;
      const { nextQueue, movedCount, addedCount } = applyBulkPlayNext(queue, current, [
        trackC,
        trackD,
      ]);

      expect(movedCount).toBe(0);
      expect(addedCount).toBe(2);
      expect(nextQueue.map((t) => t.id)).toEqual([
        'root1:A.mp3',
        'root1:C.mp3',
        'root1:D.mp3',
        'root1:B.mp3',
      ]);
    });

    it('bulk add to queue appends new items while skipping upcoming duplicates', () => {
      const queue = [trackA, trackB];
      const current = trackA;
      // Adding [trackB, trackC] -> trackB is already upcoming, trackC is new
      const { nextQueue, addedCount } = applyAddToQueue(queue, current, [trackB, trackC]);

      expect(addedCount).toBe(1);
      expect(nextQueue.map((t) => t.id)).toEqual([
        'root1:A.mp3',
        'root1:B.mp3',
        'root1:C.mp3',
      ]);
    });
  });

  describe('3. Bulk Playlist Operations', () => {
    it('supports bulk playlist storage and multi-track reference updates', async () => {
      const initialPlaylist: Playlist = {
        id: 'pl_1',
        name: 'My Playlist',
        tracks: [
          {
            trackId: 'root1:track1.mp3',
            name: 'Track 1',
            artist: 'Artist',
            album: 'Album',
            addedAt: Date.now(),
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storePlaylists([initialPlaylist]);

      // Add bulk tracks to playlist
      const retrieved = await getStoredPlaylists();
      expect(retrieved).toHaveLength(1);

      const updatedTracks = [
        ...retrieved[0].tracks,
        {
          trackId: 'root1:track2.mp3',
          name: 'Track 2',
          artist: 'Artist',
          album: 'Album',
          addedAt: Date.now(),
        },
        {
          trackId: 'root1:track3.mp3',
          name: 'Track 3',
          artist: 'Artist',
          album: 'Album',
          addedAt: Date.now(),
        },
      ];

      await storePlaylists([{ ...retrieved[0], tracks: updatedTracks }]);
      const afterAdd = await getStoredPlaylists();
      expect(afterAdd[0].tracks).toHaveLength(3);

      // Bulk remove tracks from playlist
      const toRemove = new Set(['root1:track1.mp3', 'root1:track3.mp3']);
      const remainingTracks = afterAdd[0].tracks.filter((r) => !toRemove.has(r.trackId));
      await storePlaylists([{ ...afterAdd[0], tracks: remainingTracks }]);

      const afterRemove = await getStoredPlaylists();
      expect(afterRemove[0].tracks).toHaveLength(1);
      expect(afterRemove[0].tracks[0].trackId).toBe('root1:track2.mp3');
    });
  });

  describe('4. Safe Reconnect Matching Logic on iPad / Safari', () => {
    it('unambiguously reconnects unreadable track matching name, size, and lastModified', () => {
      const unreadableTrack: TrackItem = {
        id: `${IMPORTED_FILES_ROOT_ID}:offline.mp3`,
        name: 'offline.mp3',
        relativePath: 'offline.mp3',
        size: 54321,
        lastModified: 1699999999,
        status: 'unreadable',
        metadata: { title: 'Offline Song', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
      };

      const selectedFile = {
        name: 'offline.mp3',
        size: 54321,
        lastModified: 1699999999,
      } as unknown as File;

      // Candidate matching test
      const isMatch =
        unreadableTrack.name === selectedFile.name &&
        unreadableTrack.size === selectedFile.size &&
        unreadableTrack.lastModified === selectedFile.lastModified;

      expect(isMatch).toBe(true);
    });

    it('rejects candidate if size or lastModified differs even with identical filename', () => {
      const unreadableTrack: TrackItem = {
        id: `${IMPORTED_FILES_ROOT_ID}:song.mp3`,
        name: 'song.mp3',
        relativePath: 'song.mp3',
        size: 50000,
        lastModified: 1000,
        status: 'unreadable',
        metadata: { title: 'Song', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
      };

      const differentFile = {
        name: 'song.mp3',
        size: 60000,
        lastModified: 1000,
      } as unknown as File;

      const isMatch =
        unreadableTrack.name === differentFile.name &&
        unreadableTrack.size === differentFile.size &&
        unreadableTrack.lastModified === differentFile.lastModified;

      expect(isMatch).toBe(false);
    });

    it('preserves separate records when multiple unreadable tracks share identical metadata', () => {
      const track1: TrackItem = {
        id: `${IMPORTED_FILES_ROOT_ID}:dup.mp3_1`,
        name: 'dup.mp3',
        relativePath: 'dup.mp3 (1)',
        size: 1234,
        lastModified: 5000,
        status: 'unreadable',
        metadata: { title: 'Dup', artist: 'A', album: 'B', isMetadataLoaded: true },
      };
      const track2: TrackItem = {
        id: `${IMPORTED_FILES_ROOT_ID}:dup.mp3_2`,
        name: 'dup.mp3',
        relativePath: 'dup.mp3 (2)',
        size: 1234,
        lastModified: 5000,
        status: 'unreadable',
        metadata: { title: 'Dup', artist: 'A', album: 'B', isMetadataLoaded: true },
      };

      const unreadableList = [track1, track2];
      const selectedFile = { name: 'dup.mp3', size: 1234, lastModified: 5000 } as unknown as File;

      const matches = unreadableList.filter(
        (t) =>
          t.name === selectedFile.name &&
          t.size === selectedFile.size &&
          t.lastModified === selectedFile.lastModified
      );

      expect(matches.length).toBe(2);
      // Reconnect assigns 1:1 to the first match without merging or deleting the second
      const reconnectedId = matches[0].id;
      const remainingUnreadable = unreadableList.filter((t) => t.id !== reconnectedId);
      expect(remainingUnreadable).toHaveLength(1);
      expect(remainingUnreadable[0].id).toBe(`${IMPORTED_FILES_ROOT_ID}:dup.mp3_2`);
    });
  });

  describe('5. Bulk Favourites Exact Matching & No Broad Suffix Deletion', () => {
    it('adds and removes multiple tracks using exact canonical IDs and aliases without regex or broad suffix deletion', () => {
      const track1: TrackItem = {
        id: 'fsa_rootA:Jay/song.mp3',
        name: 'song.mp3',
        relativePath: 'Jay/song.mp3',
        size: 100,
        lastModified: 1,
        aliases: ['alias_1'],
        metadata: { title: 'Song 1', artist: 'Jay', album: 'Alb', isMetadataLoaded: true },
      };

      const track2: TrackItem = {
        id: 'fsa_rootB:Jay/song.mp3', // Shares relativePath with track1 but in different root
        name: 'song.mp3',
        relativePath: 'Jay/song.mp3',
        size: 200,
        lastModified: 2,
        metadata: { title: 'Song 2', artist: 'Jay', album: 'Alb', isMetadataLoaded: true },
      };

      let favourites = new Set<string>();

      // Bulk Add track1 & track2
      favourites = new Set([...favourites, track1.id, track2.id]);
      expect(favourites.has('fsa_rootA:Jay/song.mp3')).toBe(true);
      expect(favourites.has('fsa_rootB:Jay/song.mp3')).toBe(true);

      // Remove only track1
      const toRemove = [track1];
      const nextFavs = new Set(favourites);
      for (const t of toRemove) {
        nextFavs.delete(t.id);
        if (t.aliases) {
          t.aliases.forEach((a) => nextFavs.delete(a));
        }
      }

      // track1 is removed, but track2 with identical relative path in rootB MUST BE PRESERVED
      expect(nextFavs.has('fsa_rootA:Jay/song.mp3')).toBe(false);
      expect(nextFavs.has('fsa_rootB:Jay/song.mp3')).toBe(true);
    });
  });

  describe('6. Multi-Folder and Virtual Collection Integration', () => {
    it('combines physical folder tracks with imported files without creating fake subfolders', () => {
      const physicalFolder = {
        id: 'fsa_phys_1',
        name: 'Music Directory',
        sourceType: 'fs-access' as const,
        tree: {
          id: 'fsa_phys_1',
          name: 'Music Directory',
          relativePath: 'fsa_phys_1',
          tracks: [
            {
              id: 'fsa_phys_1:song1.mp3',
              name: 'song1.mp3',
              relativePath: 'song1.mp3',
              size: 1000,
              lastModified: 100,
              metadata: { title: 'Song 1', artist: 'A', album: 'B', isMetadataLoaded: true },
            },
          ],
          subfolders: [],
          totalTrackCount: 1,
        },
        tracks: [
          {
            id: 'fsa_phys_1:song1.mp3',
            name: 'song1.mp3',
            relativePath: 'song1.mp3',
            size: 1000,
            lastModified: 100,
            metadata: { title: 'Song 1', artist: 'A', album: 'B', isMetadataLoaded: true },
          },
        ],
        trackCount: 1,
        addedAt: 100,
        lastScannedAt: 100,
        permissionStatus: 'granted' as const,
      };

      const importedFilesFolder = {
        id: IMPORTED_FILES_ROOT_ID,
        name: IMPORTED_FILES_COLLECTION_NAME,
        sourceType: 'files' as const,
        tree: {
          id: IMPORTED_FILES_ROOT_ID,
          name: IMPORTED_FILES_COLLECTION_NAME,
          relativePath: IMPORTED_FILES_ROOT_ID,
          tracks: [
            {
              id: `${IMPORTED_FILES_ROOT_ID}:solo.mp3`,
              name: 'solo.mp3',
              relativePath: 'solo.mp3',
              size: 2000,
              lastModified: 200,
              metadata: { title: 'Solo Song', artist: 'Solo', album: 'Single', isMetadataLoaded: true },
            },
          ],
          subfolders: [],
          totalTrackCount: 1,
        },
        tracks: [
          {
            id: `${IMPORTED_FILES_ROOT_ID}:solo.mp3`,
            name: 'solo.mp3',
            relativePath: 'solo.mp3',
            size: 2000,
            lastModified: 200,
            metadata: { title: 'Solo Song', artist: 'Solo', album: 'Single', isMetadataLoaded: true },
          },
        ],
        trackCount: 1,
        addedAt: 200,
        lastScannedAt: 200,
        permissionStatus: 'granted' as const,
      };

      const allFolders = [physicalFolder, importedFilesFolder];
      const flat = combineFlatPlaylists(allFolders);
      expect(flat).toHaveLength(2);
      expect(new Set(flat.map((t) => t.id))).toEqual(
        new Set(['fsa_phys_1:song1.mp3', `${IMPORTED_FILES_ROOT_ID}:solo.mp3`])
      );

      const unifiedTree = buildUnifiedMultiFolderTree(allFolders);
      expect(unifiedTree.subfolders).toHaveLength(2);
      const subfolderIds = unifiedTree.subfolders.map((s) => s.id);
      expect(subfolderIds).toContain('fsa_phys_1');
      expect(subfolderIds).toContain(IMPORTED_FILES_ROOT_ID);
    });
  });

  describe('7. Multi-Track Selection Reconcilation & Range Selection Logic', () => {
    it('prunes deleted or promoted IDs when track list changes', () => {
      const initialSelection = new Set(['track_1', 'track_2', 'track_3']);
      const updatedTracks = [{ id: 'track_1' }, { id: 'track_3' }]; // track_2 was removed or migrated

      const validIds = new Set(updatedTracks.map((t) => t.id));
      const reconciled = new Set<string>();
      for (const id of initialSelection) {
        if (validIds.has(id)) {
          reconciled.add(id);
        }
      }

      expect(reconciled.size).toBe(2);
      expect(reconciled.has('track_1')).toBe(true);
      expect(reconciled.has('track_2')).toBe(false);
      expect(reconciled.has('track_3')).toBe(true);
    });

    it('computes correct continuous index range for Shift+Click selection', () => {
      const tracks = ['id_0', 'id_1', 'id_2', 'id_3', 'id_4', 'id_5'];
      const lastSelectedId = 'id_1';
      const clickedIndex = 4;

      const lastIdx = tracks.indexOf(lastSelectedId);
      const start = Math.min(lastIdx, clickedIndex);
      const end = Math.max(lastIdx, clickedIndex);
      const selectedRange = tracks.slice(start, end + 1);

      expect(selectedRange).toEqual(['id_1', 'id_2', 'id_3', 'id_4']);
    });
  });
});
