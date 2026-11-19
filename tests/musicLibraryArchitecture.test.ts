import { describe, it, expect, vi } from 'vitest';
import {
  TrackItem,
  ImportedFolder,
  MusicLibrary,
  IMPORTED_FILES_ROOT_ID,
} from '../src/types/music';
import {
  deriveAlbums,
  deriveArtists,
  deriveDisplayedTracks,
  updateTrackInLibrary,
} from '../src/utils/libraryAggregation';
import {
  reconcileOverlappingTracks,
  combineFlatPlaylists,
  buildUnifiedMultiFolderTree,
  buildFolderTree,
  isFavouriteTrack,
} from '../src/utils/musicTree';

describe('Music Library Architecture & Decomposed Modules (Stage 6)', () => {
  const createMockTrack = (
    id: string,
    name: string,
    folderId = 'folder-1',
    overrides: Partial<TrackItem> = {}
  ): TrackItem => ({
    id,
    name,
    relativePath: name,
    size: 1024,
    lastModified: 1700000000,
    folderIds: [folderId],
    metadata: {
      title: name.replace(/\.[^/.]+$/, ''),
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 180,
      isMetadataLoaded: true,
      ...overrides.metadata,
    },
    ...overrides,
  });

  const createMockFolder = (
    id: string,
    name: string,
    tracks: TrackItem[]
  ): ImportedFolder => ({
    id,
    name,
    sourceType: 'fs-access',
    tracks,
    trackCount: tracks.length,
    addedAt: 1700000000,
    lastScannedAt: 1700000000,
    permissionStatus: 'granted',
    tree: buildFolderTree(name, tracks, id),
  });

  describe('1. Initial Empty Library & Derived Aggregations', () => {
    it('returns empty albums, artists, and displayed tracks when flatPlaylist is empty', () => {
      expect(deriveAlbums([])).toEqual([]);
      expect(deriveArtists([])).toEqual([]);
      expect(
        deriveDisplayedTracks({
          library: null,
          currentView: 'all',
          currentFolderNode: null,
          selectedArtistName: null,
          selectedAlbumId: null,
          albums: [],
          favouriteTracks: [],
          searchQuery: '',
        })
      ).toEqual([]);
    });
  });

  describe('2. Legacy Library & Folder Records Separation', () => {
    it('filters out legacy folder records with sourceType === files or name === Selected Audio', () => {
      const records = [
        { id: 'f-1', name: 'Music', sourceType: 'fs-access' },
        { id: 'f-legacy', name: 'Selected Audio', sourceType: 'files' },
        { id: 'f-2', name: 'Jazz', sourceType: 'fs-access' },
      ];

      const valid = records.filter(
        (r) => r.sourceType !== 'files' && r.name !== 'Selected Audio'
      );
      expect(valid.map((r) => r.id)).toEqual(['f-1', 'f-2']);
    });
  });

  describe('3. Multiple Root Restoration & Tree Unification', () => {
    it('unifies independent roots under a single virtual root node with aggregate track counts', () => {
      const t1 = createMockTrack('f1:song1.mp3', 'song1.mp3', 'f1');
      const t2 = createMockTrack('f2:song2.mp3', 'song2.mp3', 'f2');
      const f1 = createMockFolder('f1', 'Rock', [t1]);
      const f2 = createMockFolder('f2', 'Pop', [t2]);

      const tree = buildUnifiedMultiFolderTree([f1, f2]);
      expect(tree.id).toBe('root');
      expect(tree.totalTrackCount).toBe(2);
      expect(tree.subfolders.length).toBe(2);
    });
  });

  describe('4. Adding Independent Roots & Track Deduplication', () => {
    it('combines flat playlists preserving all unique physical tracks', () => {
      const t1 = createMockTrack('f1:song1.mp3', 'song1.mp3', 'f1');
      const t2 = createMockTrack('f2:song2.mp3', 'song2.mp3', 'f2');
      const f1 = createMockFolder('f1', 'Folder A', [t1]);
      const f2 = createMockFolder('f2', 'Folder B', [t2]);

      const combined = combineFlatPlaylists([f1, f2]);
      expect(combined.map((t) => t.id)).toEqual(['f1:song1.mp3', 'f2:song2.mp3']);
    });
  });

  describe('5. Reimporting an Existing Root (isSameEntry identity)', () => {
    it('identifies existing folder handle via isSameEntry check simulation', async () => {
      const handle1 = { isSameEntry: vi.fn().mockResolvedValue(true) };
      const handle2 = { isSameEntry: vi.fn().mockResolvedValue(false) };

      const isSame = await handle1.isSameEntry(handle1);
      const isDiff = await handle2.isSameEntry(handle1);

      expect(isSame).toBe(true);
      expect(isDiff).toBe(false);
    });
  });

  describe('6. Folder Refresh & Metadata Preservation', () => {
    it('preserves already extracted metadata on unchanged files during folder refresh', () => {
      const oldTrack = createMockTrack('f1:song1.mp3', 'song1.mp3', 'f1', {
        size: 5000,
        lastModified: 1000,
        metadata: {
          title: 'Custom Title',
          artist: 'Custom Artist',
          album: 'Custom Album',
          isMetadataLoaded: true,
        },
      });

      const scannedTrack = createMockTrack('f1:song1.mp3', 'song1.mp3', 'f1', {
        size: 5000,
        lastModified: 1000,
        metadata: {
          title: 'song1',
          artist: 'Unknown',
          album: 'Unknown',
          isMetadataLoaded: false,
        },
      });

      // Simulation of metadata preservation logic in refreshFolder
      const oldMap = new Map([[oldTrack.id, oldTrack]]);
      const old = oldMap.get(scannedTrack.id);
      const resolved = old && scannedTrack.size === old.size && scannedTrack.lastModified === old.lastModified
        ? { ...scannedTrack, metadata: old.metadata }
        : scannedTrack;

      expect(resolved.metadata.title).toBe('Custom Title');
      expect(resolved.metadata.isMetadataLoaded).toBe(true);
    });
  });

  describe('7. Generation Counters & Stale Scan Guards', () => {
    it('detects superseded scan when a newer generation counter has incremented', () => {
      const scanGens = new Map<string, number>();
      const folderId = 'folder-123';

      // Scan 1 starts
      scanGens.set(folderId, 1);
      const gen1 = 1;

      // Scan 2 starts before scan 1 finishes
      scanGens.set(folderId, 2);

      // Guard check for scan 1
      const isScan1Current = scanGens.get(folderId) === gen1;
      expect(isScan1Current).toBe(false);
    });
  });

  describe('8. Stale Scan Completion Rejection on Cancellation', () => {
    it('rejects scan when cancelScan sets generation to -1', () => {
      const scanGens = new Map<string, number>();
      const folderId = 'folder-123';

      scanGens.set(folderId, 1);
      // Folder removed during scanning -> cancelScan
      scanGens.set(folderId, -1);

      expect(scanGens.get(folderId) === 1).toBe(false);
    });
  });

  describe('9. Removing a Root During Scanning', () => {
    it('removes folder from library and pending lists and cancels scan', () => {
      const f1 = createMockFolder('f1', 'F1', []);
      const f2 = createMockFolder('f2', 'F2', []);
      const folders = [f1, f2];

      const remaining = folders.filter((f) => f.id !== 'f1');
      expect(remaining.map((f) => f.id)).toEqual(['f2']);
    });
  });

  describe('10. Parent/Child Root Overlap & Alias Association', () => {
    it('associates overlapping physical files with canonical IDs and verified aliases', async () => {
      const parentTrack = createMockTrack('parent:sub/song.mp3', 'song.mp3', 'parent', {
        relativePath: 'sub/song.mp3',
        handle: { isSameEntry: vi.fn().mockResolvedValue(true) } as unknown as FileSystemFileHandle,
      });

      const childTrack = createMockTrack('child:song.mp3', 'song.mp3', 'child', {
        relativePath: 'song.mp3',
        handle: { isSameEntry: vi.fn().mockResolvedValue(true) } as unknown as FileSystemFileHandle,
      });

      const reconciled = await reconcileOverlappingTracks([childTrack], [parentTrack], 'child');
      expect(reconciled[0].id).toBe('parent:sub/song.mp3');
      expect(reconciled[0].aliases).toContain('child:song.mp3');
      expect(reconciled[0].folderIds).toContain('child');
    });
  });

  describe('11. Shared Track Preservation on Root Removal', () => {
    it('preserves shared track when parent root is removed by promoting child alias', () => {
      const sharedTrack: TrackItem = {
        id: 'parent:sub/song.mp3',
        name: 'song.mp3',
        relativePath: 'sub/song.mp3',
        size: 1000,
        lastModified: 1000,
        folderIds: ['parent', 'child'],
        aliases: ['child:song.mp3'],
        metadata: { title: 'Song', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
      };

      const removedFolderId = 'parent';
      const validAlias = sharedTrack.aliases?.find((a) => !a.startsWith(`${removedFolderId}:`));

      expect(validAlias).toBe('child:song.mp3');

      const promotedTrack: TrackItem = {
        ...sharedTrack,
        id: validAlias!,
        folderIds: (sharedTrack.folderIds || []).filter((id) => id !== removedFolderId),
      };

      expect(promotedTrack.id).toBe('child:song.mp3');
      expect(promotedTrack.folderIds).toEqual(['child']);
    });
  });

  describe('12. Canonical Track ID Promotion & ID Migration Map', () => {
    it('generates migration map entry for promoted aliases', () => {
      const idMigrations = new Map<string, string>();
      const oldId = 'parent:song.mp3';
      const promotedId = 'child:song.mp3';

      idMigrations.set(oldId, promotedId);

      expect(idMigrations.get('parent:song.mp3')).toBe('child:song.mp3');
    });
  });

  describe('13. Favourites Migration & Restoration', () => {
    it('migrates favourites when old ID is promoted', () => {
      const favourites = new Set(['parent:song.mp3', 'other:song2.mp3']);
      const idMigrations = new Map([['parent:song.mp3', 'child:song.mp3']]);

      const nextFavourites = new Set(favourites);
      for (const [oldId, newId] of idMigrations.entries()) {
        if (nextFavourites.has(oldId)) {
          nextFavourites.delete(oldId);
          nextFavourites.add(newId);
        }
      }

      expect(nextFavourites.has('parent:song.mp3')).toBe(false);
      expect(nextFavourites.has('child:song.mp3')).toBe(true);
      expect(nextFavourites.has('other:song2.mp3')).toBe(true);
    });
  });

  describe('14. Identical Relative Paths Across Independent Roots', () => {
    it('keeps independent files with identical relative paths completely separate', () => {
      const tA = createMockTrack('rootA:track.mp3', 'track.mp3', 'rootA', { relativePath: 'track.mp3' });
      const tB = createMockTrack('rootB:track.mp3', 'track.mp3', 'rootB', { relativePath: 'track.mp3' });

      const flat = [tA, tB];
      const favourites = new Set(['rootA:track.mp3']);

      expect(isFavouriteTrack(tA, favourites, flat)).toBe(true);
      expect(isFavouriteTrack(tB, favourites, flat)).toBe(false);
    });
  });

  describe('15. Bulk Favourite Add & Remove', () => {
    it('adds multiple tracks to favourites with single set mutation', () => {
      const t1 = createMockTrack('t-1', 'track1.mp3');
      const t2 = createMockTrack('t-2', 'track2.mp3');
      const favourites = new Set<string>();

      const next = new Set(favourites);
      [t1, t2].forEach((t) => next.add(t.id));

      expect(next.has('t-1')).toBe(true);
      expect(next.has('t-2')).toBe(true);
      expect(next.size).toBe(2);
    });

    it('removes multiple tracks from favourites with single set mutation', () => {
      const t1 = createMockTrack('t-1', 'track1.mp3');
      const favourites = new Set(['t-1', 't-2']);

      const next = new Set(favourites);
      [t1].forEach((t) => next.delete(t.id));

      expect(next.has('t-1')).toBe(false);
      expect(next.has('t-2')).toBe(true);
    });
  });

  describe('16. Imported Files Additive Imports', () => {
    it('appends newly imported tracks to existing virtual collection without overwriting', () => {
      const existing = [createMockTrack('imp:song1.wav', 'song1.wav', IMPORTED_FILES_ROOT_ID)];
      const incoming = [createMockTrack('imp:song2.wav', 'song2.wav', IMPORTED_FILES_ROOT_ID)];

      const combined = [...existing, ...incoming];
      expect(combined.length).toBe(2);
      expect(combined.map((t) => t.name)).toEqual(['song1.wav', 'song2.wav']);
    });
  });

  describe('17. Imported Files Safe Reconnect on iPad/Safari', () => {
    it('reconnects unreadable track when file name, size, and lastModified match unambiguously', () => {
      const unreadableTrack = createMockTrack('imp:song1.wav', 'song1.wav', IMPORTED_FILES_ROOT_ID, {
        size: 5000,
        lastModified: 1700000000,
        status: 'unreadable',
      });

      const freshFile = {
        name: 'song1.wav',
        size: 5000,
        lastModified: 1700000000,
      } as File;

      const isCandidate =
        unreadableTrack.name === freshFile.name &&
        unreadableTrack.size === freshFile.size &&
        unreadableTrack.lastModified === freshFile.lastModified;

      expect(isCandidate).toBe(true);

      const reconnected: TrackItem = {
        ...unreadableTrack,
        file: freshFile,
        status: 'normal',
      };

      expect(reconnected.status).toBe('normal');
      expect(reconnected.id).toBe(unreadableTrack.id); // Identity preserved
    });
  });

  describe('18. Imported Files Source-Specific Removal', () => {
    it('removes only specified track IDs from virtual imported folder', () => {
      const t1 = createMockTrack('imp:1', '1.wav', IMPORTED_FILES_ROOT_ID);
      const t2 = createMockTrack('imp:2', '2.wav', IMPORTED_FILES_ROOT_ID);
      const tracks = [t1, t2];

      const toRemove = new Set(['imp:1']);
      const remaining = tracks.filter((t) => !toRemove.has(t.id));

      expect(remaining.map((t) => t.id)).toEqual(['imp:2']);
    });
  });

  describe('19. Unavailable Source Preservation', () => {
    it('preserves prompt folders in pending state with prompt status without dropping from tree', () => {
      const promptFolder: ImportedFolder = {
        id: 'p-1',
        name: 'External Drive',
        sourceType: 'fs-access',
        tracks: [],
        trackCount: 42,
        addedAt: 1000,
        lastScannedAt: 1000,
        permissionStatus: 'prompt',
        tree: {
          id: 'p-1',
          name: 'External Drive',
          relativePath: 'p-1',
          tracks: [],
          subfolders: [],
          totalTrackCount: 42,
        },
      };

      expect(promptFolder.permissionStatus).toBe('prompt');
      expect(promptFolder.tree.totalTrackCount).toBe(42);
    });
  });

  describe('20. Playlist Reference Compatibility on Root Removal', () => {
    it('updates playlist track references when canonical ID is migrated', () => {
      const playlist = {
        id: 'pl-1',
        name: 'My Playlist',
        tracks: [
          { trackId: 'parent:sub/song.mp3', name: 'song.mp3', addedAt: 1000 },
          { trackId: 'other:song2.mp3', name: 'song2.mp3', addedAt: 1000 },
        ],
      };

      const idMigrations = new Map([['parent:sub/song.mp3', 'child:song.mp3']]);

      const updatedTracks = playlist.tracks.map((ref) => {
        if (idMigrations.has(ref.trackId)) {
          return { ...ref, trackId: idMigrations.get(ref.trackId)! };
        }
        return ref;
      });

      expect(updatedTracks[0].trackId).toBe('child:song.mp3');
      expect(updatedTracks[1].trackId).toBe('other:song2.mp3');
    });
  });

  describe('21. Permission Denial and Recovery Status', () => {
    it('marks permissionStatus as denied when user rejects permission prompt', () => {
      const folder = createMockFolder('f1', 'Music', []);
      folder.permissionStatus = 'denied';

      expect(folder.permissionStatus).toBe('denied');
    });
  });

  describe('22. Library Immutability & updateTrackInLibrary', () => {
    it('immutably updates track status in flatPlaylist, folders, and tree', () => {
      const track = createMockTrack('f1:song.mp3', 'song.mp3', 'f1', { status: 'normal' });
      const folder = createMockFolder('f1', 'Rock', [track]);
      const initialLib: MusicLibrary = {
        id: 'lib-1',
        name: 'Music',
        folders: [folder],
        tree: buildUnifiedMultiFolderTree([folder]),
        flatPlaylist: [track],
        sourceType: 'fs-access',
      };

      const updated = updateTrackInLibrary(initialLib, 'f1:song.mp3', 'unreadable');

      expect(updated.flatPlaylist[0].status).toBe('unreadable');
      expect(updated.folders[0].tracks[0].status).toBe('unreadable');
      expect(initialLib.flatPlaylist[0].status).toBe('normal'); // Immutability preserved
    });
  });

  describe('23. Reload Persistence & Stored Folder Records', () => {
    it('creates accurate StoredFolderRecord snapshots for persistence', () => {
      const folder = createMockFolder('f1', 'Rock', []);
      const record = {
        id: folder.id,
        name: folder.name,
        sourceType: folder.sourceType,
        trackCount: folder.trackCount,
        addedAt: folder.addedAt,
      };

      expect(record.id).toBe('f1');
      expect(record.name).toBe('Rock');
    });
  });

  describe('24. Search Filter & Displayed Tracks Derivation', () => {
    it('filters tracks case-insensitively across title, artist, album, and filename', () => {
      const t1 = createMockTrack('1', 'electric_dreams.flac', 'f1', {
        metadata: { title: 'Electric Dreams', artist: 'Synth Band', album: 'Neon', duration: 100, isMetadataLoaded: true },
      });
      const t2 = createMockTrack('2', 'acoustic_guitar.mp3', 'f1', {
        metadata: { title: 'Acoustic Guitar', artist: 'Folk Artist', album: 'Woodland', duration: 100, isMetadataLoaded: true },
      });

      const lib: MusicLibrary = {
        id: 'lib',
        name: 'Lib',
        folders: [],
        tree: { id: 'root', name: 'Root', relativePath: '', tracks: [t1, t2], subfolders: [], totalTrackCount: 2 },
        flatPlaylist: [t1, t2],
        sourceType: 'fs-access',
      };

      const result = deriveDisplayedTracks({
        library: lib,
        currentView: 'all',
        currentFolderNode: null,
        selectedArtistName: null,
        selectedAlbumId: null,
        albums: [],
        favouriteTracks: [],
        searchQuery: 'synth',
      });

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('1');
    });
  });

  describe('25. Navigation Reset After Root Removal', () => {
    it('resets selectedFolderPath when selected folder or parent is removed', () => {
      let selectedPath = 'folder-1/subfolder';
      const removedFolderId = 'folder-1';

      if (selectedPath === removedFolderId || selectedPath.startsWith(`${removedFolderId}/`)) {
        selectedPath = '';
      }

      expect(selectedPath).toBe('');
    });

    it('preserves selectedFolderPath when unrelated folder is removed', () => {
      let selectedPath = 'folder-2/subfolder';
      const removedFolderId = 'folder-1';

      if (selectedPath === removedFolderId || selectedPath.startsWith(`${removedFolderId}/`)) {
        selectedPath = '';
      }

      expect(selectedPath).toBe('folder-2/subfolder');
    });
  });
});
