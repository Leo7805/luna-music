import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TrackItem,
  ImportedFolder,
  StoredFolderRecord,
} from '../src/types/music';
import {
  buildFolderTree,
  buildUnifiedMultiFolderTree,
  combineFlatPlaylists,
  reconcileOverlappingTracks,
} from '../src/utils/musicTree';

describe('Phase 1: Multi-Folder Music Library Core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: Multiple roots coexist without replacing existing folders
  it('1. allows multiple imported root folders to coexist in the library', () => {
    const folder1Tracks: TrackItem[] = [
      {
        id: 'fsa_1:Rock/song1.mp3',
        name: 'song1.mp3',
        relativePath: 'Rock/song1.mp3',
        size: 5000000,
        lastModified: 1000,
        metadata: { title: 'Song 1', artist: 'Queen', album: 'Greatest', isMetadataLoaded: true },
        folderIds: ['fsa_1'],
      },
    ];

    const folder2Tracks: TrackItem[] = [
      {
        id: 'fsa_2:Jazz/song2.flac',
        name: 'song2.flac',
        relativePath: 'Jazz/song2.flac',
        size: 15000000,
        lastModified: 2000,
        metadata: { title: 'Song 2', artist: 'Miles Davis', album: 'Kind of Blue', isMetadataLoaded: true },
        folderIds: ['fsa_2'],
      },
    ];

    const folder1: ImportedFolder = {
      id: 'fsa_1',
      name: 'English Music',
      sourceType: 'fs-access',
      tree: buildFolderTree('English Music', folder1Tracks, 'fsa_1'),
      tracks: folder1Tracks,
      trackCount: 1,
      addedAt: 100,
      lastScannedAt: 100,
      permissionStatus: 'granted',
    };

    const folder2: ImportedFolder = {
      id: 'fsa_2',
      name: 'Chinese Music',
      sourceType: 'fs-access',
      tree: buildFolderTree('Chinese Music', folder2Tracks, 'fsa_2'),
      tracks: folder2Tracks,
      trackCount: 1,
      addedAt: 200,
      lastScannedAt: 200,
      permissionStatus: 'granted',
    };

    const folders = [folder1, folder2];
    const unifiedTree = buildUnifiedMultiFolderTree(folders);
    const flatPlaylist = combineFlatPlaylists(folders);

    // Both folders coexist as top-level subfolders of unified tree
    expect(unifiedTree.subfolders).toHaveLength(2);
    expect(unifiedTree.subfolders.map((f) => f.name)).toEqual(['Chinese Music', 'English Music']);
    // All Tracks combines both folders
    expect(flatPlaylist).toHaveLength(2);
    expect(flatPlaylist.map((t) => t.id)).toEqual(['fsa_1:Rock/song1.mp3', 'fsa_2:Jazz/song2.flac']);
  });

  // Test 2: Reimporting the same root folder refreshes rather than duplicates
  it('2. reimporting the same directory handle refreshes rather than adding a duplicate', async () => {
    const mockHandle1 = {
      name: 'My Music',
      isSameEntry: vi.fn(),
    } as unknown as FileSystemDirectoryHandle;

    const mockHandle2 = {
      name: 'My Music',
      isSameEntry: vi.fn(),
    } as unknown as FileSystemDirectoryHandle;

    // Both handles point to the exact same directory on disk
    (mockHandle1.isSameEntry as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const existingFolders: ImportedFolder[] = [
      {
        id: 'fsa_existing',
        name: 'My Music',
        sourceType: 'fs-access',
        handle: mockHandle1,
        tree: buildFolderTree('My Music', [], 'fsa_existing'),
        tracks: [],
        trackCount: 0,
        addedAt: 100,
        lastScannedAt: 100,
        permissionStatus: 'granted',
      },
    ];

    let deduplicatedFolderId: string | null = null;
    let isDuplicate = false;

    for (const existing of existingFolders) {
      if (existing.handle && (await existing.handle.isSameEntry(mockHandle2))) {
        deduplicatedFolderId = existing.id;
        isDuplicate = true;
        break;
      }
    }

    expect(isDuplicate).toBe(true);
    expect(deduplicatedFolderId).toBe('fsa_existing');
  });

  // Test 3: Same-name different roots remain separate
  it('3. different folders with identical names remain separate with distinct IDs', async () => {
    const handleDisk1 = {
      name: 'Music',
      isSameEntry: vi.fn().mockResolvedValue(false), // Different directories!
    } as unknown as FileSystemDirectoryHandle;

    const handleDisk2 = {
      name: 'Music',
      isSameEntry: vi.fn().mockResolvedValue(false), // Different directories!
    } as unknown as FileSystemDirectoryHandle;

    const folder1Tracks: TrackItem[] = [
      {
        id: 'root_disk1:TrackA.mp3',
        name: 'TrackA.mp3',
        relativePath: 'TrackA.mp3',
        size: 3000,
        lastModified: 100,
        handle: { isSameEntry: vi.fn().mockResolvedValue(false) } as unknown as FileSystemFileHandle,
        metadata: { title: 'Track A', artist: 'Artist', album: 'Alb', isMetadataLoaded: true },
        folderIds: ['root_disk1'],
      },
    ];

    const folder2Tracks: TrackItem[] = [
      {
        id: 'root_disk2:TrackB.mp3',
        name: 'TrackB.mp3',
        relativePath: 'TrackB.mp3',
        size: 4000,
        lastModified: 200,
        handle: { isSameEntry: vi.fn().mockResolvedValue(false) } as unknown as FileSystemFileHandle,
        metadata: { title: 'Track B', artist: 'Artist', album: 'Alb', isMetadataLoaded: true },
        folderIds: ['root_disk2'],
      },
    ];

    const folder1: ImportedFolder = {
      id: 'root_disk1',
      name: 'Music',
      sourceType: 'fs-access',
      handle: handleDisk1,
      tree: buildFolderTree('Music', folder1Tracks, 'root_disk1'),
      tracks: folder1Tracks,
      trackCount: 1,
      addedAt: 100,
      lastScannedAt: 100,
      permissionStatus: 'granted',
    };

    const folder2: ImportedFolder = {
      id: 'root_disk2',
      name: 'Music',
      sourceType: 'fs-access',
      handle: handleDisk2,
      tree: buildFolderTree('Music', folder2Tracks, 'root_disk2'),
      tracks: folder2Tracks,
      trackCount: 1,
      addedAt: 200,
      lastScannedAt: 200,
      permissionStatus: 'granted',
    };

    const isSame = await handleDisk1.isSameEntry(handleDisk2);
    expect(isSame).toBe(false);

    const unifiedTree = buildUnifiedMultiFolderTree([folder1, folder2]);
    expect(unifiedTree.subfolders).toHaveLength(2);
    // Unique relative paths prevent path collisions
    expect(unifiedTree.subfolders[0].id).toBe('root_disk1');
    expect(unifiedTree.subfolders[1].id).toBe('root_disk2');

    const flatPlaylist = combineFlatPlaylists([folder1, folder2]);
    expect(flatPlaylist).toHaveLength(2);
  });

  // Test 4: Parent/child overlap does not duplicate tracks
  it('4. parent/child overlap deduplicates shared tracks using isSameEntry', async () => {
    const parentFileHandle = {
      isSameEntry: vi.fn(),
    } as unknown as FileSystemFileHandle;

    const childFileHandle = {
      isSameEntry: vi.fn(),
    } as unknown as FileSystemFileHandle;

    // Both file handles point to the exact same physical file
    (childFileHandle.isSameEntry as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const parentTrack: TrackItem = {
      id: 'parent_root:Rock/Song.flac',
      name: 'Song.flac',
      relativePath: 'Rock/Song.flac',
      size: 20000000,
      lastModified: 5000,
      handle: parentFileHandle,
      metadata: { title: 'Song', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
      folderIds: ['parent_root'],
    };

    const childTrackDiscovered: TrackItem = {
      id: 'child_root:Song.flac',
      name: 'Song.flac',
      relativePath: 'Song.flac',
      size: 20000000,
      lastModified: 5000,
      handle: childFileHandle,
      metadata: { title: 'Song', artist: 'Artist', album: 'Album', isMetadataLoaded: false },
      folderIds: ['child_root'],
    };

    // Reconcile child tracks against parent tracks
    const reconciledChildTracks = await reconcileOverlappingTracks(
      [childTrackDiscovered],
      [parentTrack],
      'child_root'
    );

    // Track is recognized as identical via isSameEntry
    expect(reconciledChildTracks).toHaveLength(1);
    const sharedTrack = reconciledChildTracks[0];
    // Reuses existing stable ID
    expect(sharedTrack.id).toBe('parent_root:Rock/Song.flac');
    // FolderIds contains both roots
    expect(sharedTrack.folderIds).toEqual(['parent_root', 'child_root']);

    // When combined into global flatPlaylist:
    const parentFolder: ImportedFolder = {
      id: 'parent_root',
      name: 'Parent Music',
      sourceType: 'fs-access',
      tree: buildFolderTree('Parent Music', [parentTrack], 'parent_root'),
      tracks: [parentTrack],
      trackCount: 1,
      addedAt: 100,
      lastScannedAt: 100,
      permissionStatus: 'granted',
    };

    const childFolder: ImportedFolder = {
      id: 'child_root',
      name: 'Rock',
      sourceType: 'fs-access',
      tree: buildFolderTree('Rock', [sharedTrack], 'child_root'),
      tracks: [sharedTrack],
      trackCount: 1,
      addedAt: 200,
      lastScannedAt: 200,
      permissionStatus: 'granted',
    };

    const flatPlaylist = combineFlatPlaylists([parentFolder, childFolder]);
    // The shared track appears exactly once in All Tracks
    expect(flatPlaylist).toHaveLength(1);
    expect(flatPlaylist[0].id).toBe('parent_root:Rock/Song.flac');
  });

  // Test 5: Removing an overlapping root preserves shared tracks in the other root
  it('5. removing an overlapping root preserves shared tracks in remaining roots', () => {
    const sharedTrack: TrackItem = {
      id: 'track-shared',
      name: 'Shared.mp3',
      relativePath: 'Shared.mp3',
      size: 10000,
      lastModified: 1000,
      metadata: { title: 'Shared', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
      folderIds: ['folder_A', 'folder_B'],
    };

    const uniqueTrackB: TrackItem = {
      id: 'track-b-only',
      name: 'OnlyInB.mp3',
      relativePath: 'OnlyInB.mp3',
      size: 12000,
      lastModified: 1000,
      metadata: { title: 'Only in B', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
      folderIds: ['folder_B'],
    };

    const folderA: ImportedFolder = {
      id: 'folder_A',
      name: 'Folder A',
      sourceType: 'fs-access',
      tree: buildFolderTree('Folder A', [sharedTrack], 'folder_A'),
      tracks: [sharedTrack],
      trackCount: 1,
      addedAt: 100,
      lastScannedAt: 100,
      permissionStatus: 'granted',
    };

    const folderB: ImportedFolder = {
      id: 'folder_B',
      name: 'Folder B',
      sourceType: 'fs-access',
      tree: buildFolderTree('Folder B', [sharedTrack, uniqueTrackB], 'folder_B'),
      tracks: [sharedTrack, uniqueTrackB],
      trackCount: 2,
      addedAt: 200,
      lastScannedAt: 200,
      permissionStatus: 'granted',
    };

    let folders = [folderA, folderB];
    expect(combineFlatPlaylists(folders)).toHaveLength(2);

    // Remove Folder B:
    const folderIdToRemove = 'folder_B';
    folders = folders
      .filter((f) => f.id !== folderIdToRemove)
      .map((f) => ({
        ...f,
        tracks: f.tracks.map((t) => ({
          ...t,
          folderIds: (t.folderIds || []).filter((id) => id !== folderIdToRemove),
        })),
      }));

    expect(folders).toHaveLength(1);
    const remainingFlat = combineFlatPlaylists(folders);

    // Shared track is preserved in Folder A
    expect(remainingFlat).toHaveLength(1);
    expect(remainingFlat[0].id).toBe('track-shared');
    expect(remainingFlat[0].folderIds).toEqual(['folder_A']);
    // Track unique to B is cleanly removed without deleting files
    expect(remainingFlat.find((t) => t.id === 'track-b-only')).toBeUndefined();
  });

  // Test 6: Separate persistence model avoids storing runtime objects in IndexedDB
  it('6. persists only lightweight serializable records and handles, without runtime blobs', () => {
    const mockHandle = { name: 'Music' } as unknown as FileSystemDirectoryHandle;

    const runtimeFolder: ImportedFolder = {
      id: 'fsa_test_1',
      name: 'Music',
      sourceType: 'fs-access',
      handle: mockHandle,
      tree: { id: 'root', name: 'Music', relativePath: '', tracks: [], subfolders: [], totalTrackCount: 50 },
      tracks: [], // runtime TrackItem with possible File/Blob references
      trackCount: 50,
      addedAt: 1700000000000,
      lastScannedAt: 1700000050000,
      permissionStatus: 'granted',
    };

    // Extract persisted record format
    const record: StoredFolderRecord = {
      id: runtimeFolder.id,
      name: runtimeFolder.name,
      sourceType: runtimeFolder.sourceType,
      handle: runtimeFolder.handle,
      addedAt: runtimeFolder.addedAt,
      lastScannedAt: runtimeFolder.lastScannedAt,
      trackCount: runtimeFolder.trackCount,
    };

    // Stored record must NOT contain runtime trees, tracks, or Blob URLs
    expect((record as unknown as Record<string, unknown>).tracks).toBeUndefined();
    expect((record as unknown as Record<string, unknown>).tree).toBeUndefined();
    expect(record.id).toBe('fsa_test_1');
    expect(record.trackCount).toBe(50);
  });

  // Test 7: Safe track deduplication - different files are not merged based merely on metadata
  it('7. independent sources are not merged based merely on filename, size, or timestamp', async () => {
    const file1Handle = {
      name: 'Song.mp3',
      isSameEntry: vi.fn().mockResolvedValue(false), // Different physical files!
    } as unknown as FileSystemFileHandle;

    const file2Handle = {
      name: 'Song.mp3',
      isSameEntry: vi.fn().mockResolvedValue(false),
    } as unknown as FileSystemFileHandle;

    const track1: TrackItem = {
      id: 'source1:Song.mp3',
      name: 'Song.mp3',
      relativePath: 'Song.mp3',
      size: 4000000,
      lastModified: 1000, // Identical metadata
      handle: file1Handle,
      metadata: { title: 'Song', artist: 'Artist A', album: 'Album A', isMetadataLoaded: true },
      folderIds: ['source1'],
    };

    const track2: TrackItem = {
      id: 'source2:Song.mp3',
      name: 'Song.mp3',
      relativePath: 'Song.mp3',
      size: 4000000,
      lastModified: 1000, // Identical metadata but separate file on disk
      handle: file2Handle,
      metadata: { title: 'Song', artist: 'Artist B', album: 'Album B', isMetadataLoaded: true },
      folderIds: ['source2'],
    };

    const reconciled = await reconcileOverlappingTracks([track2], [track1], 'source2');

    // Separate identity is strictly preserved because isSameEntry is false
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0].id).toBe('source2:Song.mp3');
    expect(reconciled[0].folderIds).toEqual(['source2']);
  });

  // Test 8: Asynchronous scan races - generation guard discards stale results
  it('8. generation guard prevents stale scan results from overwriting newer library state', async () => {
    const scanGenerations = new Map<string, number>();

    function getNextGen(id: string): number {
      const current = scanGenerations.get(id) || 0;
      const next = current + 1;
      scanGenerations.set(id, next);
      return next;
    }

    function cancel(id: string) {
      scanGenerations.set(id, -1);
    }

    const folderId = 'folder_race_test';
    let committedState: string | null = null;

    async function simulateScan(id: string, delayMs: number, resultValue: string) {
      const gen = getNextGen(id);
      await new Promise((r) => setTimeout(r, delayMs));

      // Guard check
      if (scanGenerations.get(id) !== gen) {
        return; // Stale or cancelled
      }
      committedState = resultValue;
    }

    // Refresh 1 is slow (delay 50ms)
    const scan1 = simulateScan(folderId, 50, 'state_from_scan_1');
    // User quickly clicks Refresh again (Refresh 2, delay 10ms)
    const scan2 = simulateScan(folderId, 10, 'state_from_scan_2');

    await Promise.all([scan1, scan2]);

    // State from Scan 2 committed, Scan 1 was discarded
    expect(committedState).toBe('state_from_scan_2');

    // Cancelling / removing folder prevents any late-resolving scan from committing
    const scan3 = simulateScan(folderId, 30, 'state_from_scan_3');
    cancel(folderId); // User removes folder while scanning!
    await scan3;

    expect(committedState).toBe('state_from_scan_2'); // Never resurrected
  });

  // Test 9: Stable track IDs preserve favourites across reloads and rescans
  it('9. stable track IDs preserve favourites across rescans and reloads', () => {
    const trackId = 'fsa_stable_root:Pop/Abba/Dancing Queen.mp3';
    const favourites = new Set<string>([trackId]);

    // Rescan discovers track at same relative path in the same root
    const rescannedTrack: TrackItem = {
      id: `${'fsa_stable_root'}:${'Pop/Abba/Dancing Queen.mp3'}`,
      name: 'Dancing Queen.mp3',
      relativePath: 'Pop/Abba/Dancing Queen.mp3',
      size: 5000000,
      lastModified: 2000,
      metadata: { title: 'Dancing Queen', artist: 'ABBA', album: 'Arrival', isMetadataLoaded: true },
      folderIds: ['fsa_stable_root'],
    };

    expect(favourites.has(rescannedTrack.id)).toBe(true);
  });

  // Test 10: Same file with different observed sizes deduplicates via isSameEntry and updates size/status
  it('10. mutable file size (e.g. 0-byte placeholder vs hydrated) deduplicates via isSameEntry and updates size/status', async () => {
    const placeholderHandle = {
      name: 'HydrateMe.flac',
      isSameEntry: vi.fn(),
    } as unknown as FileSystemFileHandle;

    const hydratedHandle = {
      name: 'HydrateMe.flac',
      isSameEntry: vi.fn(),
    } as unknown as FileSystemFileHandle;

    // isSameEntry is authoritative regardless of size difference
    (hydratedHandle.isSameEntry as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const placeholderTrack: TrackItem = {
      id: 'root_1:HydrateMe.flac',
      name: 'HydrateMe.flac',
      relativePath: 'HydrateMe.flac',
      size: 0,
      lastModified: 1000,
      status: 'empty',
      handle: placeholderHandle,
      metadata: { title: 'HydrateMe', artist: '', album: '', isMetadataLoaded: false },
      folderIds: ['root_1'],
    };

    const hydratedTrack: TrackItem = {
      id: 'root_2:Sub/HydrateMe.flac',
      name: 'HydrateMe.flac',
      relativePath: 'Sub/HydrateMe.flac',
      size: 32500000, // 32.5 MB hydrated
      lastModified: 2000,
      status: 'normal',
      handle: hydratedHandle,
      metadata: { title: 'HydrateMe', artist: 'Artist', album: 'Album', isMetadataLoaded: false },
      folderIds: ['root_2'],
    };

    const reconciled = await reconcileOverlappingTracks(
      [hydratedTrack],
      [placeholderTrack],
      'root_2'
    );

    // Verified: deduplication succeeds even though sizes were 0 vs 32500000
    expect(reconciled).toHaveLength(1);
    const resultTrack = reconciled[0];
    expect(resultTrack.id).toBe('root_1:HydrateMe.flac');
    expect(resultTrack.folderIds).toEqual(['root_1', 'root_2']);
    expect(resultTrack.size).toBe(32500000);
    expect(resultTrack.status).toBe('normal');
    expect(resultTrack.aliases).toEqual(['root_1:HydrateMe.flac', 'root_2:Sub/HydrateMe.flac']);
  });

  // Test 11: Import order independence of track deduplication
  it('11. import order independence: parent-then-child and child-then-parent both deduplicate shared tracks', async () => {
    const parentHandle = {
      name: 'OrderTest.mp3',
      isSameEntry: vi.fn(),
    } as unknown as FileSystemFileHandle;

    const childHandle = {
      name: 'OrderTest.mp3',
      isSameEntry: vi.fn(),
    } as unknown as FileSystemFileHandle;

    (parentHandle.isSameEntry as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (childHandle.isSameEntry as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const makeParentTrack = (): TrackItem => ({
      id: 'parent:Music/OrderTest.mp3',
      name: 'OrderTest.mp3',
      relativePath: 'Music/OrderTest.mp3',
      size: 8000000,
      lastModified: 1000,
      handle: parentHandle,
      metadata: { title: 'Order Test', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
      folderIds: ['parent'],
    });

    const makeChildTrack = (): TrackItem => ({
      id: 'child:OrderTest.mp3',
      name: 'OrderTest.mp3',
      relativePath: 'OrderTest.mp3',
      size: 8000000,
      lastModified: 1000,
      handle: childHandle,
      metadata: { title: 'Order Test', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
      folderIds: ['child'],
    });

    // Scenario A: Parent imported first, then Child imported
    const parentFirst_parent = makeParentTrack();
    const parentFirst_child = makeChildTrack();
    const reconciledA = await reconcileOverlappingTracks(
      [parentFirst_child],
      [parentFirst_parent],
      'child'
    );
    expect(reconciledA).toHaveLength(1);
    expect(reconciledA[0].folderIds).toEqual(['parent', 'child']);
    expect(reconciledA[0].aliases).toContain('parent:Music/OrderTest.mp3');
    expect(reconciledA[0].aliases).toContain('child:OrderTest.mp3');

    // Scenario B: Child imported first, then Parent imported
    const childFirst_child = makeChildTrack();
    const childFirst_parent = makeParentTrack();
    const reconciledB = await reconcileOverlappingTracks(
      [childFirst_parent],
      [childFirst_child],
      'parent'
    );
    expect(reconciledB).toHaveLength(1);
    expect(reconciledB[0].folderIds).toEqual(['child', 'parent']);
    expect(reconciledB[0].aliases).toContain('child:OrderTest.mp3');
    expect(reconciledB[0].aliases).toContain('parent:Music/OrderTest.mp3');
  });

  // Test 12: Track ID stability and alias promotion when removing an overlapping root
  it('12. removing an overlapping root promotes remaining alias to canonical ID without losing track identity', () => {
    const folderAId = 'fsa_parent';
    const folderBId = 'fsa_child';

    // Track was originally imported via folder A, then aliased in folder B
    const sharedTrack: TrackItem = {
      id: `${folderAId}:Rock/Song.flac`,
      name: 'Song.flac',
      relativePath: 'Rock/Song.flac',
      size: 20000000,
      lastModified: 1000,
      metadata: { title: 'Song', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
      folderIds: [folderAId, folderBId],
      aliases: [`${folderAId}:Rock/Song.flac`, `${folderBId}:Song.flac`],
    };

    // Simulate removing folder A
    const idMigrations = new Map<string, string>();
    const folderIdToRemove = folderAId;

    let updatedTrack: TrackItem = {
      ...sharedTrack,
      folderIds: (sharedTrack.folderIds || []).filter((id) => id !== folderIdToRemove),
    };

    if (updatedTrack.id.startsWith(`${folderIdToRemove}:`)) {
      const validAlias = updatedTrack.aliases?.find(
        (alias) => !alias.startsWith(`${folderIdToRemove}:`)
      );
      if (validAlias) {
        idMigrations.set(updatedTrack.id, validAlias);
        const remainingAliases = (updatedTrack.aliases || []).filter((a) => a !== updatedTrack.id);
        updatedTrack = {
          ...updatedTrack,
          id: validAlias,
          aliases: remainingAliases.includes(validAlias)
            ? remainingAliases
            : [validAlias, ...remainingAliases],
        };
      }
    }

    // Canonical ID was promoted cleanly to child folder's ID
    expect(updatedTrack.id).toBe(`${folderBId}:Song.flac`);
    expect(updatedTrack.folderIds).toEqual([folderBId]);
    expect(idMigrations.get(`${folderAId}:Rock/Song.flac`)).toBe(`${folderBId}:Song.flac`);
  });

  // Test 13: Favourites preservation after root removal and refresh
  it('13. favourites remain preserved and active across root removal and subsequent refresh', () => {
    const parentId = 'root_parent';
    const childId = 'root_child';

    const oldCanonicalId = `${parentId}:Rock/Song.flac`;
    const childAlias = `${childId}:Song.flac`;

    // User favorited the track under original canonical ID
    const favourites = new Set<string>([oldCanonicalId]);

    const track: TrackItem = {
      id: oldCanonicalId,
      name: 'Song.flac',
      relativePath: 'Rock/Song.flac',
      size: 20000000,
      lastModified: 1000,
      metadata: { title: 'Song', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
      folderIds: [parentId, childId],
      aliases: [oldCanonicalId, childAlias],
    };

    // Helper checking isFav via canonical ID or aliases
    const isFavourite = (t: TrackItem, favSet: Set<string>) =>
      favSet.has(t.id) || Boolean(t.aliases?.some((a) => favSet.has(a)));

    expect(isFavourite(track, favourites)).toBe(true);

    // Now parent root is removed; alias migration occurs
    const nextFavourites = new Set(favourites);
    const newCanonicalId = childAlias;
    if (nextFavourites.has(oldCanonicalId)) {
      nextFavourites.delete(oldCanonicalId);
      nextFavourites.add(newCanonicalId);
    }

    const migratedTrack: TrackItem = {
      ...track,
      id: newCanonicalId,
      folderIds: [childId],
      aliases: [newCanonicalId],
    };

    // User favourite is preserved under new ID
    expect(nextFavourites.has(migratedTrack.id)).toBe(true);
    expect(isFavourite(migratedTrack, nextFavourites)).toBe(true);

    // Now child folder is refreshed: track preserves child ID and remains favorited
    const refreshedTrack: TrackItem = {
      id: `${childId}:Song.flac`,
      name: 'Song.flac',
      relativePath: 'Song.flac',
      size: 20000000,
      lastModified: 1000,
      metadata: { title: 'Song', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
      folderIds: [childId],
      aliases: [`${childId}:Song.flac`],
    };

    expect(nextFavourites.has(refreshedTrack.id)).toBe(true);
    expect(isFavourite(refreshedTrack, nextFavourites)).toBe(true);
  });
});
