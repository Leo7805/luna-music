import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createUnavailableTrack,
  deriveReadableNameFromTrackId,
} from '../src/utils/trackPlaceholders';
import {
  resolveFavouriteTracks,
  mergeFavouriteSnapshot,
} from '../src/utils/favouriteResolvers';
import { resolvePlaylistTracks } from '../src/utils/playlistResolvers';
import { isTrackPlayable } from '../src/utils/audioFileTypes';
import {
  deriveDisplayedTracks,
  deriveViewHeaderInfo,
} from '../src/utils/libraryAggregation';
import { LibraryContent } from '../src/components/LibraryContent';
import { TrackActionMenu } from '../src/components/TrackActionMenu';
import { FavouriteTrackSnapshot, TrackItem } from '../src/types/music';

function makeTrack(
  id: string,
  relativePath: string,
  overrides: Partial<TrackItem> = {}
): TrackItem {
  const name = relativePath.split('/').pop() || relativePath;
  return {
    id,
    name,
    relativePath,
    size: 4096000,
    lastModified: 1700000000,
    status: 'normal',
    metadata: {
      title: name.replace(/\.[^/.]+$/, ''),
      artist: 'Known Artist',
      album: 'Known Album',
      duration: 210,
      isMetadataLoaded: true,
    },
    ...overrides,
  };
}

describe('Shared Unavailable Track Placeholder Helper', () => {
  it('builds consistent unreadable non-playable placeholders for Playlists and Favourites without mutating input', () => {
    const ref = {
      trackId: 'fsa_old:Pop/Hello.mp3',
      name: 'Hello',
      artist: 'Adele',
      album: '25',
      duration: 295,
      addedAt: 1700000000,
    };
    const frozenRef = { ...ref };
    const placeholder = createUnavailableTrack(ref);

    expect(ref).toEqual(frozenRef);
    expect(placeholder.id).toBe('fsa_old:Pop/Hello.mp3');
    expect(placeholder.status).toBe('unreadable');
    expect(isTrackPlayable(placeholder)).toBe(false);
    expect(placeholder.file).toBeUndefined();
    expect(placeholder.handle).toBeUndefined();
    expect(placeholder.metadata.title).toBe('Hello');
    expect(placeholder.metadata.artist).toBe('Adele');
    expect(placeholder.metadata.album).toBe('25');
    expect(placeholder.metadata.duration).toBe(295);

    // Legacy ID without snapshot produces a clean readable filename & title
    expect(deriveReadableNameFromTrackId('fsa_old:Chinese/青花瓷.mp3')).toBe('青花瓷.mp3');
    const legacyPlaceholder = createUnavailableTrack({ trackId: 'fsa_old:Chinese/青花瓷.mp3' });
    expect(legacyPlaceholder.metadata.title).toBe('青花瓷');
    expect(legacyPlaceholder.metadata.artist).toBe('Unknown Artist');
    expect(legacyPlaceholder.metadata.album).toBe('Unknown Album');
    expect(legacyPlaceholder.metadata.duration).toBe(0);

    // Playlist resolver uses the exact same placeholder contract
    const [fromPlaylist] = resolvePlaylistTracks([ref], []);
    expect(fromPlaylist.status).toBe('unreadable');
    expect(fromPlaylist.metadata.artist).toBe('Adele');
    expect(fromPlaylist.metadata.duration).toBe(295);
  });
});

describe('Favourites Unavailable Display, Snapshots & Re-Import Recovery', () => {
  const snapshots: Record<string, FavouriteTrackSnapshot> = {
    'fsa_old:墨尔本的秋天.mp3': {
      trackId: 'fsa_old:墨尔本的秋天.mp3',
      name: '墨尔本的秋天',
      artist: '七元',
      album: '墨尔本的秋天',
      duration: 166,
    },
    'fsa_old:晴天.mp3': {
      trackId: 'fsa_old:晴天.mp3',
      name: '晴天',
      artist: '周杰伦',
      album: '叶惠美',
      duration: 269,
    },
  };
  // 3rd favourite is a legacy ID with NO snapshot
  const favSet = new Set([
    'fsa_old:墨尔本的秋天.mp3',
    'fsa_old:晴天.mp3',
    'fsa_old:Pop/青花瓷.mp3',
  ]);

  it('preserves all 3 saved Favourites as unavailable placeholders with snapshots when all sources are removed, and recovers on re-import', () => {
    const offline = resolveFavouriteTracks([], favSet, snapshots);
    expect(offline.resolvedTracks).toHaveLength(0);
    expect(offline.unresolvedIds).toHaveLength(3);
    expect(offline.displayTracks).toHaveLength(3);
    expect(offline.displayTracks.every((t) => t.status === 'unreadable')).toBe(true);
    expect(offline.displayTracks.every((t) => !isTrackPlayable(t))).toBe(true);
    expect(offline.displayTracks[0].metadata.artist).toBe('七元');
    expect(offline.displayTracks[1].metadata.album).toBe('叶惠美');
    // Legacy ID without snapshot still displays clean title
    expect(offline.displayTracks[2].metadata.title).toBe('青花瓷');

    // Re-importing 2 of the 3 tracks under a new Folder ID restores them while keeping the missing 3rd unavailable
    const r1 = makeTrack('fsa_new:墨尔本的秋天.mp3', '墨尔本的秋天.mp3', {
      metadata: { title: '墨尔本的秋天', artist: '七元', album: '墨尔本的秋天', duration: 166, isMetadataLoaded: true },
    });
    const r2 = makeTrack('fsa_new:晴天.mp3', '晴天.mp3', {
      metadata: { title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, isMetadataLoaded: true },
    });
    const restored = resolveFavouriteTracks([r1, r2], favSet, snapshots);
    expect(restored.displayTracks).toHaveLength(3);
    expect(restored.displayTracks.map((t) => t.status)).toEqual(['normal', 'normal', 'unreadable']);
    expect(restored.migratedMap.get('fsa_old:墨尔本的秋天.mp3')).toBe('fsa_new:墨尔本的秋天.mp3');
    expect(restored.migratedMap.get('fsa_old:晴天.mp3')).toBe('fsa_new:晴天.mp3');
  });

  it('never overwrites valid snapshot metadata with Unknown Artist/Album or missing duration', () => {
    const existing: FavouriteTrackSnapshot = {
      trackId: 'f1:song.mp3',
      name: 'Real Song',
      artist: 'Real Artist',
      album: 'Real Album',
      duration: 245,
    };
    const fallbackTrack = makeTrack('f1:song.mp3', 'song.mp3', {
      metadata: {
        title: 'Real Song',
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        duration: undefined,
        isMetadataLoaded: false,
      },
    });
    expect(mergeFavouriteSnapshot(existing, fallbackTrack)).toBeNull();
  });

  it('renders Favourites with Cannot access file when library is null, keeps All Tracks empty, and hides playback actions on unavailable menu', () => {
    const offline = resolveFavouriteTracks([], favSet, snapshots);

    // deriveDisplayedTracks returns saved Favourites even when library === null, while All Tracks stays []
    expect(
      deriveDisplayedTracks({
        library: null,
        currentView: 'favourites',
        currentFolderNode: null,
        selectedArtistName: null,
        selectedAlbumId: null,
        albums: [],
        favouriteTracks: offline.displayTracks,
        searchQuery: '',
      })
    ).toHaveLength(3);
    expect(
      deriveDisplayedTracks({
        library: null,
        currentView: 'all',
        currentFolderNode: null,
        selectedArtistName: null,
        selectedAlbumId: null,
        albums: [],
        favouriteTracks: offline.displayTracks,
        searchQuery: '',
      })
    ).toHaveLength(0);

    const header = deriveViewHeaderInfo({
      hasLibrary: false,
      currentView: 'favourites',
      searchQuery: '',
      selectedFolderPath: '',
      currentFolderNode: null,
      selectedAlbumId: null,
      selectedArtistName: null,
      displayedTracksCount: 3,
      playlistsCount: 0,
    });
    expect(header.title).toBe('Favourites');
    expect(header.subtitle).toBe('3 tracks');

    // LibraryContent renders Favourites TrackList (NOT Welcome Screen) when library is null
    const html = renderToStaticMarkup(
      <LibraryContent
        library={{
          library: null,
          folders: [],
          currentView: 'favourites',
          selectedFolderPath: '',
          selectedArtistName: null,
          selectedAlbumId: null,
          searchQuery: '',
          favourites: favSet,
          favouriteTracks: offline.displayTracks,
          favouritesCount: offline.displayTracks.length,
          isLoading: false,
          scanProgress: 0,
          isInitialized: true,
          hasRegisteredSources: false,
          lastSourceRemoval: null,
          needsPermission: false,
          pendingFolders: [],
          currentFolderNode: null,
          displayedTracks: offline.displayTracks,
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
          playlists: [],
          selectedPlaylistId: null,
          selectedPlaylist: null,
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

    expect(html).not.toContain('Your Music, 100% Local &amp; Private');
    expect(html).toContain('墨尔本的秋天');
    expect(html).toContain('七元');
    expect(html).toContain('Cannot access file');

    // Unavailable Favourite action menu hides Play Next / Add to Queue / Add to Playlist, keeps Remove Favourite
    const menuHtml = renderToStaticMarkup(
      <TrackActionMenu
        track={offline.displayTracks[0]}
        index={0}
        isFav={true}
        onClose={vi.fn()}
        onPlayNext={vi.fn()}
        onAddToQueue={vi.fn()}
        onOpenPlaylistModal={vi.fn()}
        onToggleFavourite={vi.fn()}
        showToast={vi.fn()}
      />
    );
    expect(menuHtml).not.toContain('Play Next');
    expect(menuHtml).not.toContain('Add to Queue');
    expect(menuHtml).not.toContain('Add to Playlist...');
    expect(menuHtml).toContain('Remove Favourite');
  });
});
