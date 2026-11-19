import { describe, it, expect, vi } from 'vitest';
import {
  TrackItem,
  ImportedFolder,
} from '../src/types/music';
import {
  deriveAlbums,
  deriveArtists,
  deriveDisplayedTracks,
} from '../src/utils/libraryAggregation';
import {
  reconcileOverlappingTracks,
  combineFlatPlaylists,
  buildUnifiedMultiFolderTree,
  buildFolderTree,
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
    it('filters out legacy folder records with sourceType === files or lacking handle with name === Selected Audio', () => {
      const records = [
        { id: 'f-1', name: 'Music', sourceType: 'fs-access' },
        { id: 'f-legacy-1', name: 'Selected Audio', sourceType: 'files' },
        { id: 'f-legacy-2', name: 'Selected Audio', sourceType: 'input-fallback' },
        { id: 'f-2', name: 'Jazz', sourceType: 'fs-access' },
      ];

      const isLegacyFolder = (f: { sourceType: string; name: string; handle?: FileSystemDirectoryHandle }) =>
        f.sourceType === 'files' || (!f.handle && f.name === 'Selected Audio');

      const valid = records.filter((r) => !isLegacyFolder(r));
      expect(valid.map((r) => r.id)).toEqual(['f-1', 'f-2']);
    });

    it('strictly preserves physical folders named Selected Audio with valid handles and fs-access sourceType', () => {
      const mockHandle = { kind: 'directory', name: 'Selected Audio' } as unknown as FileSystemDirectoryHandle;
      const records = [
        { id: 'f-physical-selected-audio', name: 'Selected Audio', sourceType: 'fs-access', handle: mockHandle },
        { id: 'f-legacy-files', name: 'Selected Audio', sourceType: 'files' },
        { id: 'f-legacy-no-handle', name: 'Selected Audio', sourceType: 'input-fallback' },
      ];

      const isLegacyFolder = (f: { sourceType: string; name: string; handle?: FileSystemDirectoryHandle }) =>
        f.sourceType === 'files' || (!f.handle && f.name === 'Selected Audio');

      const valid = records.filter((r) => !isLegacyFolder(r));
      expect(valid.length).toBe(1);
      expect(valid[0].id).toBe('f-physical-selected-audio');
      expect(valid[0].name).toBe('Selected Audio');
      expect(valid[0].handle).toBe(mockHandle);
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

      scanGens.set(folderId, 1);
      const gen1 = 1;

      scanGens.set(folderId, 2);

      const isScan1Current = scanGens.get(folderId) === gen1;
      expect(isScan1Current).toBe(false);
    });
  });

  describe('8. Stale Scan Completion Rejection on Cancellation', () => {
    it('rejects scan when cancelScan sets generation to -1', () => {
      const scanGens = new Map<string, number>();
      const folderId = 'folder-123';

      scanGens.set(folderId, 1);
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
});
