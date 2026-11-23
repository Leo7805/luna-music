import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  reconcileQueueAfterSourceRemoval,
  shouldClearOrphanedQueueOnInit,
} from '../src/utils/queueSourceRemoval';
import { deriveViewHeaderInfo } from '../src/utils/libraryAggregation';
import { resolvePlaylistTracks } from '../src/utils/playlistResolvers';
import { LibraryContent } from '../src/components/LibraryContent';
import { PlaylistsView } from '../src/components/PlaylistsView';
import { Playlist, TrackItem } from '../src/types/music';

function makeTrack(
  id: string,
  title: string,
  overrides: Partial<TrackItem> = {}
): TrackItem {
  return {
    id,
    name: `${title}.mp3`,
    relativePath: `${title}.mp3`,
    size: 4096000,
    lastModified: 1700000000,
    status: 'normal',
    metadata: {
      title,
      artist: 'Known Artist',
      album: 'Known Album',
      duration: 166,
      isMetadataLoaded: true,
    },
    ...overrides,
  };
}

describe('Source Removal — Queue Reconciliation & Legacy Orphan Cleanup', () => {
  const a = makeTrack('f1:a.mp3', 'Track A');
  const b = makeTrack('f2:b.mp3', 'Track B');
  const c = makeTrack('f2:c.mp3', 'Track C');
  const d = makeTrack('f2:d.mp3', 'Track D');
  const e = makeTrack('f1:e.mp3', 'Track E');

  it('Screenshot A: removing all sources empties a 2-track Queue and stops orphaned playback', () => {
    const res = reconcileQueueAfterSourceRemoval([a, b], b, [], new Map(), 'off');
    expect(res.nextQueue).toEqual([]);
    expect(res.nextTrack).toBeNull();
    expect(res.currentTrackRemoved).toBe(true);
    expect(res.shouldStop).toBe(true);
    expect(res.queueChanged).toBe(true);
  });

  it('removes multiple exclusive tracks [B, C, D] in one logical transition and selects surviving successor E', () => {
    const res = reconcileQueueAfterSourceRemoval([a, b, c, d, e], c, [a, e], new Map(), 'off');
    expect(res.nextQueue.map((t) => t.id)).toEqual([a.id, e.id]);
    expect(res.currentTrackRemoved).toBe(true);
    expect(res.nextTrack?.id).toBe(e.id);
    expect(res.shouldStop).toBe(false);
  });

  it('wraps to first surviving playable track under Repeat All when removed current track was at the tail', () => {
    const res = reconcileQueueAfterSourceRemoval([a, b], b, [a], new Map(), 'all');
    expect(res.nextQueue.map((t) => t.id)).toEqual([a.id]);
    expect(res.nextTrack?.id).toBe(a.id);
    expect(res.shouldStop).toBe(false);

    // Repeat Off at tail stops cleanly without wrapping
    const resOff = reconcileQueueAfterSourceRemoval([a, b], b, [a], new Map(), 'off');
    expect(resOff.nextQueue.map((t) => t.id)).toEqual([a.id]);
    expect(resOff.nextTrack).toBeNull();
    expect(resOff.shouldStop).toBe(true);
  });

  it('preserves active track and playback uninterrupted when it survives via verified overlapping source migration', () => {
    const sharedOld = makeTrack('folderA:song.mp3', 'Shared Song', {
      aliases: ['folderA:song.mp3', 'folderB:song.mp3'],
    });
    const sharedMigrated = makeTrack('folderB:song.mp3', 'Shared Song', {
      aliases: ['folderB:song.mp3'],
    });
    const migrations = new Map([['folderA:song.mp3', 'folderB:song.mp3']]);

    const res = reconcileQueueAfterSourceRemoval(
      [sharedOld, b],
      sharedOld,
      [sharedMigrated],
      migrations,
      'off'
    );

    expect(res.nextQueue.map((t) => t.id)).toEqual(['folderB:song.mp3']);
    expect(res.currentTrackRemoved).toBe(false);
    expect(res.currentTrackMigrated).toBe(true);
    expect(res.nextTrack?.id).toBe('folderB:song.mp3');
    expect(res.shouldStop).toBe(false);
  });

  it('cleans up pre-existing orphaned Queues ONLY after init completes with 0 registered sources and no permission prompt', () => {
    // 1. Initialization still pending -> MUST NOT clear
    expect(
      shouldClearOrphanedQueueOnInit({
        isLibraryInitialized: false,
        hasRegisteredSources: false,
        needsPermission: false,
        liveQueueLength: 2,
        hasCurrentTrack: true,
        storedQueueIdsCount: 2,
        hasStoredLastTrackId: true,
      })
    ).toBe(false);

    // 2. Temporary permission loss -> MUST NOT clear
    expect(
      shouldClearOrphanedQueueOnInit({
        isLibraryInitialized: true,
        hasRegisteredSources: true,
        needsPermission: true,
        liveQueueLength: 0,
        hasCurrentTrack: false,
        storedQueueIdsCount: 2,
        hasStoredLastTrackId: true,
      })
    ).toBe(false);

    // 3. Initialized with 0 registered sources and stale persisted Queue -> MUST clear
    expect(
      shouldClearOrphanedQueueOnInit({
        isLibraryInitialized: true,
        hasRegisteredSources: false,
        needsPermission: false,
        liveQueueLength: 0,
        hasCurrentTrack: false,
        storedQueueIdsCount: 2,
        hasStoredLastTrackId: true,
      })
    ).toBe(true);
  });
});

describe('Screenshot B — Playlist Visibility & Unavailable Entries with Empty Library', () => {
  const playlist222: Playlist = {
    id: 'pl-222',
    name: '222',
    createdAt: 1700000000,
    updatedAt: 1700000000,
    tracks: [
      { trackId: 'f1:s1.mp3', name: '墨尔本的秋天', artist: '七元', album: '墨尔本的秋天', duration: 166, addedAt: 1 },
      { trackId: 'f1:s2.mp3', name: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, addedAt: 2 },
      { trackId: 'f1:s3.mp3', name: '青花瓷', artist: '周杰伦', album: '我很忙', duration: 239, addedAt: 3 },
    ],
  };

  it('renders selected Playlist 222 with all 3 unavailable entries in order instead of Welcome Screen when All Tracks is 0', () => {
    const html = renderToStaticMarkup(
      <LibraryContent
        library={{
          library: null,
          folders: [],
          currentView: 'playlists',
          selectedFolderPath: '',
          selectedArtistName: null,
          selectedAlbumId: null,
          searchQuery: '',
          favourites: new Set(['f1:s1.mp3']),
          favouriteTracks: [],
          favouritesCount: 0,
          isLoading: false,
          scanProgress: 0,
          isInitialized: true,
          hasRegisteredSources: false,
          lastSourceRemoval: null,
          needsPermission: false,
          pendingFolders: [],
          currentFolderNode: null,
          displayedTracks: [],
          albums: [],
          artists: [],
          setCurrentView: vi.fn(),
          selectFolder: vi.fn(),
          selectArtist: vi.fn(),
          selectAlbum: vi.fn(),
          setSearchQuery: vi.fn(),
          toggleFavourite: vi.fn(),
          addTracksToFavourites: vi.fn(),
          removeTracksFromFavourites: vi.fn(),
          openFolderPicker: vi.fn(),
          openFilesPicker: vi.fn(),
          addFolder: vi.fn(),
          refreshFolder: vi.fn(),
          removeFolder: vi.fn(),
          removeImportedFiles: vi.fn(),
          removeAllImportedFiles: vi.fn(),
          handleFallbackFolderSelect: vi.fn(),
          handleOpenFilesSelect: vi.fn(),
          handleFolderInput: vi.fn(),
          handleFilesInput: vi.fn(),
          requestPermissionAndLoad: vi.fn(),
          requestPermissionForFolder: vi.fn(),
          updateTrackStatus: vi.fn(),
          updateTrackMetadata: vi.fn(),
          requestTrackArtwork: vi.fn(),
        }}
        playlists={{
          playlists: [playlist222],
          selectedPlaylistId: 'pl-222',
          selectedPlaylist: playlist222,
          setPlaylists: vi.fn(),
          selectPlaylist: vi.fn(),
          createPlaylist: vi.fn(),
          renamePlaylist: vi.fn(),
          deletePlaylist: vi.fn(),
          addTrackToPlaylist: vi.fn(),
          addTracksToPlaylist: vi.fn(),
          removeTrackFromPlaylist: vi.fn(),
          removeTracksFromPlaylist: vi.fn(),
          reorderPlaylistTracks: vi.fn(),
          saveQueueAsPlaylist: vi.fn(),
        }}
        audioPlayer={{
          currentTrack: null,
          isPlaying: false,
          playTrack: vi.fn(),
          playQueue: vi.fn(),
          togglePlay: vi.fn(),
          playNext: vi.fn(),
          playNextBulk: vi.fn(),
          addToQueue: vi.fn(),
        } as unknown as Parameters<typeof LibraryContent>[0]['audioPlayer']}
      />
    );

    // MUST NOT show generic Welcome Screen
    expect(html).not.toContain('Your Music, 100% Local &amp; Private');
    expect(html).toContain('data-testid="playlists-view-container"');
    expect(html).toContain('222');
    expect(html).toContain('3 tracks');
    // All 3 saved entries appear in original order
    const i1 = html.indexOf('墨尔本的秋天');
    const i2 = html.indexOf('晴天');
    const i3 = html.indexOf('青花瓷');
    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
  });

  it('disables Play All, Shuffle, and Add to Queue when all playlist entries are unavailable, and resolves them back on re-import', () => {
    const html = renderToStaticMarkup(
      <PlaylistsView
        playlists={[playlist222]}
        selectedPlaylistId="pl-222"
        libraryTracks={[]}
        currentTrackId={null}
        isPlaying={false}
        favourites={new Set()}
        onSelectPlaylist={vi.fn()}
        onCreatePlaylist={vi.fn()}
        onRenamePlaylist={vi.fn()}
        onDeletePlaylist={vi.fn()}
        onPlayPlaylist={vi.fn()}
        onPlayTrack={vi.fn()}
        onTogglePlay={vi.fn()}
        onToggleFavourite={vi.fn()}
        onAddToQueue={vi.fn()}
        onRemoveTrackFromPlaylist={vi.fn()}
        onReorderPlaylistTracks={vi.fn()}
      />
    );

    // Play All is disabled when all playlist entries are unavailable; dedicated Shuffle/Add to Queue hero buttons are removed
    expect(html).toMatch(/disabled=""[^>]*>.*?Play All/s);
    expect(html).not.toContain('>Shuffle<');
    expect(html).not.toContain('>Add to Queue<');

    // Header shows "Playlists" and "1 playlist · 3 tracks" even when hasLibrary is false
    const header = deriveViewHeaderInfo({
      hasLibrary: false,
      currentView: 'playlists',
      searchQuery: '',
      selectedFolderPath: '',
      currentFolderNode: null,
      selectedAlbumId: null,
      selectedArtistName: null,
      displayedTracksCount: 0,
      playlistsCount: 1,
      playlistsTotalTracks: 3,
    });
    expect(header.title).toBe('Playlists');
    expect(header.subtitle).toBe('1 playlist · 3 tracks');

    // Re-importing a verified matching track restores availability in original order
    const reimported = makeTrack('f1:s2.mp3', '晴天');
    const resolved = resolvePlaylistTracks(playlist222.tracks, [reimported]);
    expect(resolved.map((t) => t.status)).toEqual(['unreadable', 'normal', 'unreadable']);
  });
});
