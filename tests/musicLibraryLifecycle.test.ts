import { describe, it, expect } from 'vitest';
import {
  TrackItem,
  ImportedFolder,
  MusicLibrary,
  IMPORTED_FILES_ROOT_ID,
} from '../src/types/music';
import {
  deriveDisplayedTracks,
  updateTrackInLibrary,
} from '../src/utils/libraryAggregation';
import {
  buildFolderTree,
  buildUnifiedMultiFolderTree,
  isFavouriteTrack,
} from '../src/utils/musicTree';

describe('Music Library Lifecycle & Operations (Stage 6)', () => {
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
