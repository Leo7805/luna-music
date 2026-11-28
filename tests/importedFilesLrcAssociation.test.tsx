// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useImportedFilesManager } from '../src/hooks/useImportedFilesManager';
import { useLibraryInitialization } from '../src/hooks/useLibraryInitialization';
import { useTrackLyrics } from '../src/hooks/useTrackLyrics';
import { scanRootFolderHandle } from '../src/services/directoryAccess';
import { reconcileQueueWithLibrary } from '../src/utils/queueMetadata';
import {
  IMPORTED_FILES_ROOT_ID,
  LrcLine,
  MusicLibrary,
  StoredImportedFileRecord,
  TrackItem,
} from '../src/types/music';

const mocks = vi.hoisted(() => ({
  pickedHandles: [] as FileSystemFileHandle[] | null,
  storedImported: [] as StoredImportedFileRecord[],
  storeImportedFiles: vi.fn(),
  getMetadataCache: vi.fn(),
}));

vi.mock('../src/services/directoryAccess', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/directoryAccess')>()),
  promptOpenFiles: vi.fn(async () => mocks.pickedHandles),
  verifyHandlePermission: vi.fn(async () => true),
}));

vi.mock('../src/services/idbStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/idbStorage')>()),
  storeImportedFiles: vi.fn(async (records: StoredImportedFileRecord[]) => {
    mocks.storedImported = records;
    mocks.storeImportedFiles(records);
    return true;
  }),
  getStoredImportedFiles: vi.fn(async () => mocks.storedImported),
  getStoredRegisteredFolders: vi.fn(async () => []),
  getStoredPlaybackState: vi.fn(async () => ({
    volume: 0.8,
    isMuted: false,
    repeatMode: 'off',
    shuffle: false,
    lastTrackId: null,
    lastPosition: 0,
    favourites: [],
  })),
  getMetadataCache: vi.fn(async () => {
    mocks.getMetadataCache();
    return {};
  }),
}));

function createMockFileHandle(
  name: string,
  content: string,
  options?: { lastModified?: number; id?: string }
): FileSystemFileHandle {
  const fileId = options?.id ?? `${name}:${options?.lastModified ?? 1000}`;
  const file = new File([content], name, {
    lastModified: options?.lastModified ?? 1000,
    type: name.toLowerCase().endsWith('.lrc') ? 'text/plain' : 'audio/mpeg',
  });
  const handle = {
    kind: 'file' as const,
    name,
    __fileId: fileId,
    getFile: vi.fn(async () => file),
    isSameEntry: vi.fn(async (other: { __fileId?: string }) => other?.__fileId === fileId),
    queryPermission: vi.fn(async () => 'granted' as const),
    requestPermission: vi.fn(async () => 'granted' as const),
  };
  return handle as unknown as FileSystemFileHandle;
}

function createMockFile(name: string, content: string, lastModified = 1000): File {
  return new File([content], name, {
    lastModified,
    type: name.toLowerCase().endsWith('.lrc') ? 'text/plain' : 'audio/mpeg',
  });
}

describe('Imported Files LRC Lyrics Association', () => {
  let root: Root;
  let host: HTMLDivElement;
  let libraryState: MusicLibrary | null;
  let manager: ReturnType<typeof useImportedFilesManager>;
  let currentLyrics: LrcLine[];
  let startMetadataExtraction: ReturnType<typeof vi.fn<(tracks: TrackItem[], sourceId?: string) => void>>;
  let invalidateMetadataTracks: ReturnType<typeof vi.fn<(trackIds: string[]) => void>>;
  let setIsLoading: ReturnType<typeof vi.fn<(loading: boolean) => void>>;

  function ManagerHarness({ trackForLyrics }: { trackForLyrics?: TrackItem | null }) {
    const [library, setLibrary] = useState<MusicLibrary | null>(null);
    libraryState = library;
    manager = useImportedFilesManager({
      library,
      onLibraryUpdated: setLibrary,
      onRemoveFavourites: vi.fn(),
      startMetadataExtraction,
      invalidateMetadataTracks,
      setIsLoading,
    });
    const activeTrack =
      trackForLyrics !== undefined ? trackForLyrics : library?.flatPlaylist[0] ?? null;
    currentLyrics = useTrackLyrics(activeTrack);
    return null;
  }

  async function mountManager() {
    await act(async () => {
      root.render(<ManagerHarness />);
    });
  }

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.clear();
    mocks.pickedHandles = [];
    mocks.storedImported = [];
    mocks.storeImportedFiles.mockClear();
    mocks.getMetadataCache.mockClear();
    libraryState = null;
    currentLyrics = [];
    startMetadataExtraction = vi.fn();
    invalidateMetadataTracks = vi.fn();
    setIsLoading = vi.fn();
    host = document.createElement('div');
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it('associates audio and LRC selected in the same batch (native handle import)', async () => {
    await mountManager();
    const mp3 = createMockFileHandle('My Song.mp3', 'audio-bytes');
    const lrc = createMockFileHandle('My Song.lrc', '[00:01.00]Hello batch lyrics');
    mocks.pickedHandles = [mp3, lrc];

    await act(async () => {
      await manager.openFilesPicker();
    });

    expect(libraryState?.flatPlaylist).toHaveLength(1);
    expect(libraryState?.flatPlaylist[0].name).toBe('My Song.mp3');
    expect(libraryState?.flatPlaylist[0].lrcHandle).toBe(lrc);
    expect(currentLyrics).toEqual([{ time: 1, text: 'Hello batch lyrics' }]);
    expect(mocks.storedImported[0].lrcHandle).toBe(lrc);
  });

  it('associates separately imported LRC with previously imported track without re-extracting metadata (native)', async () => {
    await mountManager();
    const mp3 = createMockFileHandle('My Song.mp3', 'audio-bytes');
    mocks.pickedHandles = [mp3];

    await act(async () => {
      await manager.openFilesPicker();
    });

    expect(libraryState?.flatPlaylist).toHaveLength(1);
    expect(libraryState?.flatPlaylist[0].lrcHandle).toBeUndefined();
    expect(currentLyrics).toEqual([]);
    expect(startMetadataExtraction).toHaveBeenCalledTimes(1);

    startMetadataExtraction.mockClear();
    mocks.getMetadataCache.mockClear();

    // Import LRC separately in a later picker action
    const lrc = createMockFileHandle('my song.LRC', '[00:02.50]Case-insensitive separate lyric');
    mocks.pickedHandles = [lrc];

    await act(async () => {
      await manager.openFilesPicker();
    });

    expect(libraryState?.flatPlaylist).toHaveLength(1);
    expect(libraryState?.flatPlaylist[0].lrcHandle).toBe(lrc);
    expect(currentLyrics).toEqual([{ time: 2.5, text: 'Case-insensitive separate lyric' }]);
    expect(startMetadataExtraction).not.toHaveBeenCalled();
    expect(mocks.getMetadataCache).not.toHaveBeenCalled();
    expect(mocks.storedImported).toHaveLength(1);
    expect(mocks.storedImported[0].lrcHandle).toBe(lrc);
  });

  it('associates separately imported LRC in fallback File input mode and updates lyrics immediately', async () => {
    await mountManager();
    const mp3 = createMockFile('Fallback Track.mp3', 'audio-bytes', 2000);

    await act(async () => {
      await manager.handleOpenFilesSelect([mp3]);
    });

    expect(libraryState?.flatPlaylist).toHaveLength(1);
    expect(libraryState?.flatPlaylist[0].lrcFile).toBeUndefined();
    expect(currentLyrics).toEqual([]);

    startMetadataExtraction.mockClear();
    mocks.getMetadataCache.mockClear();

    const lrc = createMockFile('FALLBACK TRACK.lrc', '[00:03.00]Fallback separate lyric', 2500);
    await act(async () => {
      await manager.handleOpenFilesSelect([lrc]);
    });

    expect(libraryState?.flatPlaylist).toHaveLength(1);
    expect(libraryState?.flatPlaylist[0].lrcFile).toBe(lrc);
    expect(currentLyrics).toEqual([{ time: 3, text: 'Fallback separate lyric' }]);
    expect(startMetadataExtraction).not.toHaveBeenCalled();
    expect(mocks.getMetadataCache).not.toHaveBeenCalled();
  });

  it('ignores unmatched LRC without creating a fake audio track (native & fallback)', async () => {
    await mountManager();
    const mp3 = createMockFileHandle('Existing.mp3', 'audio-bytes');
    mocks.pickedHandles = [mp3];
    await act(async () => {
      await manager.openFilesPicker();
    });
    mocks.storeImportedFiles.mockClear();

    // Unmatched native LRC-only import
    const orphanLrcHandle = createMockFileHandle('NoSuchTrack.lrc', '[00:01.00]Orphan');
    mocks.pickedHandles = [orphanLrcHandle];
    await act(async () => {
      await manager.openFilesPicker();
    });

    expect(libraryState?.flatPlaylist).toHaveLength(1);
    expect(libraryState?.flatPlaylist[0].name).toBe('Existing.mp3');
    expect(libraryState?.flatPlaylist[0].lrcHandle).toBeUndefined();
    expect(mocks.storeImportedFiles).not.toHaveBeenCalled();

    // Unmatched fallback LRC-only import
    const orphanLrcFile = createMockFile('AlsoMissing.lrc', '[00:01.00]Orphan fallback');
    await act(async () => {
      await manager.handleOpenFilesSelect([orphanLrcFile]);
    });

    expect(libraryState?.flatPlaylist).toHaveLength(1);
    expect(libraryState?.flatPlaylist[0].lrcFile).toBeUndefined();
    expect(mocks.storeImportedFiles).not.toHaveBeenCalled();
  });

  it('updates lyrics without creating duplicates when re-selecting an already-imported audio file with LRC (native & fallback)', async () => {
    await mountManager();
    const mp3Handle = createMockFileHandle('Repeat.mp3', 'audio-bytes', { id: 'repeat-1' });
    mocks.pickedHandles = [mp3Handle];
    await act(async () => {
      await manager.openFilesPicker();
    });
    expect(libraryState?.flatPlaylist).toHaveLength(1);

    const lrcHandle = createMockFileHandle('Repeat.lrc', '[00:04.00]Updated via reimport');
    mocks.pickedHandles = [mp3Handle, lrcHandle];
    await act(async () => {
      await manager.openFilesPicker();
    });

    expect(libraryState?.flatPlaylist).toHaveLength(1);
    expect(libraryState?.flatPlaylist[0].lrcHandle).toBe(lrcHandle);
    expect(currentLyrics).toEqual([{ time: 4, text: 'Updated via reimport' }]);

    // Fallback duplicate audio + LRC re-selection
    const fbAudio = createMockFile('FallbackDup.mp3', 'audio-bytes', 3000);
    await act(async () => {
      await manager.handleOpenFilesSelect([fbAudio]);
    });
    expect(libraryState?.flatPlaylist).toHaveLength(2);

    const fbLrc = createMockFile('FallbackDup.lrc', '[00:05.00]Fallback reimport lyric', 3100);
    await act(async () => {
      await manager.handleOpenFilesSelect([fbAudio, fbLrc]);
    });

    const fbTrack = libraryState?.flatPlaylist.find((t) => t.name === 'FallbackDup.mp3');
    expect(libraryState?.flatPlaylist).toHaveLength(2);
    expect(fbTrack?.lrcFile).toBe(fbLrc);
  });

  it('replaces existing lyrics when a matching LRC file is reimported and syncs queue snapshot', async () => {
    await mountManager();
    const mp3 = createMockFileHandle('Evolving.mp3', 'audio-bytes');
    const lrcV1 = createMockFileHandle('Evolving.lrc', '[00:01.00]Version 1');
    mocks.pickedHandles = [mp3, lrcV1];
    await act(async () => {
      await manager.openFilesPicker();
    });

    const initialQueueSnapshot = [libraryState!.flatPlaylist[0]];
    expect(currentLyrics).toEqual([{ time: 1, text: 'Version 1' }]);

    const lrcV2 = createMockFileHandle('Evolving.lrc', '[00:01.00]Version 2');
    mocks.pickedHandles = [lrcV2];
    await act(async () => {
      await manager.openFilesPicker();
    });

    expect(libraryState?.flatPlaylist[0].lrcHandle).toBe(lrcV2);
    expect(currentLyrics).toEqual([{ time: 1, text: 'Version 2' }]);

    const reconciledQueue = reconcileQueueWithLibrary(
      initialQueueSnapshot,
      libraryState!.flatPlaylist
    );
    expect(reconciledQueue).not.toBe(initialQueueSnapshot);
    expect(reconciledQueue[0].lrcHandle).toBe(lrcV2);
  });

  it('handles ambiguous filename stems safely without silently associating lyrics to unrelated tracks', async () => {
    await mountManager();
    const mp3 = createMockFileHandle('Song.mp3', 'mp3-bytes', { id: 'song-mp3' });
    const flac = createMockFileHandle('Song.flac', 'flac-bytes', { id: 'song-flac' });
    mocks.pickedHandles = [mp3, flac];
    await act(async () => {
      await manager.openFilesPicker();
    });
    expect(libraryState?.flatPlaylist).toHaveLength(2);

    // Separate LRC import when both Song.mp3 and Song.flac exist -> ambiguous, skip safely
    const ambiguousLrc = createMockFileHandle('Song.lrc', '[00:01.00]Ambiguous');
    mocks.pickedHandles = [ambiguousLrc];
    await act(async () => {
      await manager.openFilesPicker();
    });

    expect(libraryState?.flatPlaylist).toHaveLength(2);
    expect(libraryState?.flatPlaylist.every((t) => t.lrcHandle === undefined)).toBe(true);

    // Same-batch ambiguous import: [Another.mp3, Another.flac, Another.lrc]
    const a1 = createMockFile('Another.mp3', 'a1', 4000);
    const a2 = createMockFile('Another.flac', 'a2', 4001);
    const aLrc = createMockFile('Another.lrc', '[00:01.00]Ambiguous batch', 4002);
    await act(async () => {
      await manager.handleOpenFilesSelect([a1, a2, aLrc]);
    });

    const anotherTracks = libraryState?.flatPlaylist.filter((t) => t.name.startsWith('Another.'));
    expect(anotherTracks).toHaveLength(2);
    expect(anotherTracks?.every((t) => t.lrcFile === undefined)).toBe(true);
  });

  it('restores persisted native lrcHandle on library initialization so lyrics survive reload', async () => {
    const mp3 = createMockFileHandle('Persisted.mp3', 'audio-bytes', { id: 'persisted-1' });
    const lrc = createMockFileHandle('Persisted.lrc', '[00:06.00]Survived reload', {
      id: 'persisted-lrc-1',
    });

    mocks.storedImported = [
      {
        id: `${IMPORTED_FILES_ROOT_ID}:Persisted.mp3`,
        name: 'Persisted.mp3',
        relativePath: 'Persisted.mp3',
        size: 11,
        lastModified: 1000,
        handle: mp3,
        lrcHandle: lrc,
        status: 'normal',
        addedAt: 1000,
        aliases: [`${IMPORTED_FILES_ROOT_ID}:Persisted.mp3`],
      },
    ];

    const restored = {
      library: null as MusicLibrary | null,
      lyrics: [] as LrcLine[],
    };

    function InitHarness() {
      const [lib, setLib] = useState<MusicLibrary | null>(null);
      restored.library = lib;
      useLibraryInitialization({
        library: lib,
        onLibraryInitialized: setLib,
        onSetInitialFavourites: vi.fn(),
        startIncrementalMetadataExtraction: vi.fn(),
        setIsLoading: vi.fn(),
      });
      restored.lyrics = useTrackLyrics(lib?.flatPlaylist[0] ?? null);
      return null;
    }

    await act(async () => {
      root.render(<InitHarness />);
    });

    expect(restored.library?.flatPlaylist).toHaveLength(1);
    expect(restored.library?.flatPlaylist[0].lrcHandle).toBe(lrc);
    expect(restored.lyrics).toEqual([{ time: 6, text: 'Survived reload' }]);
  });

  it('preserves existing Import Folder LRC pairing behaviour', async () => {
    const mp3 = createMockFileHandle('FolderSong.mp3', 'audio-bytes');
    const lrc = createMockFileHandle('FolderSong.lrc', '[00:07.00]Folder lyric');
    const dirHandle = {
      kind: 'directory' as const,
      name: 'Music',
      values: async function* () {
        yield mp3;
        yield lrc;
      },
    } as unknown as FileSystemDirectoryHandle;

    const folder = await scanRootFolderHandle(dirHandle, 'fsa_test');
    expect(folder.tracks).toHaveLength(1);
    expect(folder.tracks[0].lrcHandle).toBe(lrc);
  });
});
