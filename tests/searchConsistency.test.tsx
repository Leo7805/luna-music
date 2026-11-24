// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  AlbumGroup,
  ArtistGroup,
  FolderNode,
  IMPORTED_FILES_COLLECTION_NAME,
  IMPORTED_FILES_ROOT_ID,
  LibraryView,
  Playlist,
  TrackItem,
  TrackMetadata,
} from '../src/types/music';
import {
  filterAlbumsByQuery,
  filterArtistsByQuery,
  filterFolderNodesByQuery,
  filterIndexedTracksByQuery,
  filterPlaylistsByQuery,
  filterTracksByQuery,
} from '../src/utils/librarySearch';
import { deriveViewHeaderInfo } from '../src/utils/libraryAggregation';
import { FolderView } from '../src/components/FolderView';
import { AlbumsView } from '../src/components/AlbumsView';
import { ArtistsView } from '../src/components/ArtistsView';
import { PlaylistsView } from '../src/components/PlaylistsView';
import { LibraryContent } from '../src/components/LibraryContent';
import { useLibraryNavigation } from '../src/hooks/useLibraryNavigation';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function makeTrack(
  id: string,
  overrides: Partial<Omit<TrackItem, 'metadata'>> & { metadata?: Partial<TrackMetadata> } = {}
): TrackItem {
  const { metadata, ...rest } = overrides;
  const name = rest.name ?? `${id}.mp3`;
  return {
    id,
    name,
    relativePath: rest.relativePath ?? `Root/${name}`,
    size: rest.size ?? 1024,
    lastModified: rest.lastModified ?? 1000,
    file: rest.file ?? ({ name } as File),
    status: rest.status ?? 'normal',
    ...rest,
    metadata: {
      title: metadata?.title ?? id,
      artist: metadata?.artist ?? 'Artist',
      album: metadata?.album ?? 'Album',
      duration: metadata?.duration ?? 180,
      isMetadataLoaded: metadata?.isMetadataLoaded ?? true,
      ...metadata,
    },
  };
}

function makeNode(
  id: string,
  name: string,
  tracks: TrackItem[] = [],
  subfolders: FolderNode[] = []
): FolderNode {
  return {
    id,
    name,
    relativePath: id,
    tracks,
    subfolders,
    totalTrackCount: tracks.length + subfolders.reduce((s, f) => s + f.totalTrackCount, 0),
  };
}

function makeAlbum(id: string, name: string, artist: string, tracks: TrackItem[]): AlbumGroup {
  return {
    id,
    name,
    artist,
    tracks,
    totalDuration: tracks.reduce((s, t) => s + (t.metadata.duration || 0), 0),
  };
}

function makeArtist(id: string, name: string, tracks: TrackItem[], albumCount = 1): ArtistGroup {
  return {
    id,
    name,
    tracks,
    albumCount,
    totalDuration: tracks.reduce((s, t) => s + (t.metadata.duration || 0), 0),
  };
}

const noop = () => {};

describe('librarySearch unit helpers', () => {
  const t1 = makeTrack('t1', {
    name: '01-sunrise.flac',
    relativePath: 'Jazz/01-sunrise.flac',
    metadata: { title: 'Sunrise Melody', artist: 'Miles Davis', album: 'Kind of Blue', duration: 200 },
  });
  const t2 = makeTrack('t2', {
    name: '02-midnight.mp3',
    relativePath: 'Rock/02-midnight.mp3',
    metadata: { title: 'Midnight Express', artist: 'Queen', album: 'Night Opera', duration: 240 },
  });
  const tMissingMeta = makeTrack('t3', {
    name: 'raw_demo_file.wav',
    relativePath: 'Demos/raw_demo_file.wav',
    status: 'unreadable',
    file: undefined,
    metadata: { title: '', artist: '', album: '', duration: 0, isMetadataLoaded: false },
  });

  it('handles empty, whitespace, case-insensitive display titles, missing metadata fallback, order and non-mutation', () => {
    const input = [t1, t2, tMissingMeta];
    const snapshot = [...input];

    expect(filterTracksByQuery(input, '')).toEqual(input);
    expect(filterTracksByQuery(input, '   ')).toEqual(input);
    expect(filterTracksByQuery(input, 'SUNRISE')).toEqual([t1]);
    expect(filterTracksByQuery(input, 'midnight express')).toEqual([t2]);
    expect(filterTracksByQuery(input, 'raw_demo')).toEqual([tMissingMeta]);
    // Artist, album, path, and extension must not match by default
    expect(filterTracksByQuery(input, 'MILES')).toEqual([]);
    expect(filterTracksByQuery(input, 'night opera')).toEqual([]);
    expect(filterTracksByQuery(input, 'rock/')).toEqual([]);
    expect(filterTracksByQuery(input, 'wav')).toEqual([]);
    expect(filterTracksByQuery(input, 'zzz-no-match')).toEqual([]);
    expect(input).toEqual(snapshot);
  });

  it('preserves originalIndex in filterIndexedTracksByQuery including duplicate entries', () => {
    const entries = [t1, t2, tMissingMeta, t2];
    const matches = filterIndexedTracksByQuery(entries, 'midnight');
    expect(matches.map((m) => ({ id: m.track.id, idx: m.originalIndex }))).toEqual([
      { id: 't2', idx: 1 },
      { id: 't2', idx: 3 },
    ]);
  });

  it('filters albums, artists, playlists, and top-level folder nodes by displayed name only', () => {
    const albums = [
      makeAlbum('a1', 'Kind of Blue', 'Miles Davis', [t1]),
      makeAlbum('a2', 'Night Opera', 'Queen', [t2]),
    ];
    expect(filterAlbumsByQuery(albums, 'blue').map((a) => a.id)).toEqual(['a1']);
    expect(filterAlbumsByQuery(albums, 'sunrise')).toEqual([]);
    expect(filterAlbumsByQuery(albums, 'queen')).toEqual([]);

    const artists = [makeArtist('ar1', 'Miles Davis', [t1]), makeArtist('ar2', 'Queen', [t2])];
    expect(filterArtistsByQuery(artists, 'miles').map((a) => a.id)).toEqual(['ar1']);
    expect(filterArtistsByQuery(artists, 'kind of blue')).toEqual([]);

    const playlists: Playlist[] = [
      {
        id: 'p1',
        name: 'Chill Vibes',
        tracks: [{ trackId: 't1', name: t1.name, artist: 'Miles Davis', addedAt: 1 }],
        createdAt: 1,
        updatedAt: 1,
      },
      { id: 'p2', name: 'Workout', tracks: [], createdAt: 2, updatedAt: 2 },
    ];
    expect(filterPlaylistsByQuery(playlists, 'chill', [t1, t2]).map((p) => p.id)).toEqual(['p1']);
    expect(filterPlaylistsByQuery(playlists, 'sunrise', [t1, t2])).toEqual([]);
    expect(filterPlaylistsByQuery(playlists, 'work', [t1, t2]).map((p) => p.id)).toEqual(['p2']);

    const nodes = [
      makeNode('src-1', 'Rock Library', [t2]),
      makeNode(IMPORTED_FILES_ROOT_ID, IMPORTED_FILES_COLLECTION_NAME, [t1]),
    ];
    expect(filterFolderNodesByQuery(nodes, 'rock').map((n) => n.name)).toEqual(['Rock Library']);
    expect(filterFolderNodesByQuery(nodes, 'imported').map((n) => n.name)).toEqual(['Imported Files']);
    // Must match root collection display name only, NOT descendant track names
    expect(filterFolderNodesByQuery(nodes, 'sunrise')).toEqual([]);
  });
});

describe('Phase 5 Search Consistency DOM & Interaction Behaviour', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const click = (el: HTMLElement | null) => {
    expect(el).not.toBeNull();
    act(() => el!.click());
  };

  it('Playlist Detail: filters tracks, preserves original indices for duplicate removal, hides reorder during search, and scopes Play All', () => {
    const tA = makeTrack('tA', { metadata: { title: 'Alpha Song', artist: 'Singer A', album: 'Alb' } });
    const tB = makeTrack('tB', { metadata: { title: 'Beta Song', artist: 'Singer B', album: 'Alb' } });
    const tC = makeTrack('tC', { metadata: { title: 'Gamma Song', artist: 'Singer C', album: 'Alb' } });
    const libraryTracks = [tA, tB, tC];

    const playlist: Playlist = {
      id: 'pl-1',
      name: 'Mix Tape',
      tracks: [
        { trackId: 'tA', name: tA.name, addedAt: 1 },
        { trackId: 'tB', name: tB.name, addedAt: 2 },
        { trackId: 'tC', name: tC.name, addedAt: 3 },
        { trackId: 'tB', name: tB.name, addedAt: 4 },
      ],
      createdAt: 1,
      updatedAt: 1,
    };

    const onRemoveTrackFromPlaylist = vi.fn();
    const onRemoveTracksFromPlaylist = vi.fn();
    const onReorderPlaylistTracks = vi.fn();
    const onPlayQueue = vi.fn();
    const onPlayPlaylist = vi.fn();

    const renderView = (searchQuery: string) =>
      act(() => {
        root.render(
          <PlaylistsView
            playlists={[playlist]}
            selectedPlaylistId="pl-1"
            libraryTracks={libraryTracks}
            searchQuery={searchQuery}
            isPlaying={false}
            favourites={new Set()}
            renderLayout={({ actions, content }) => (
              <div>
                <header>{actions}</header>
                <section>{content}</section>
              </div>
            )}
            onSelectPlaylist={noop}
            onCreatePlaylist={() => playlist}
            onRenamePlaylist={noop}
            onDeletePlaylist={noop}
            onPlayPlaylist={onPlayPlaylist}
            onPlayQueue={onPlayQueue}
            onPlayTrack={noop}
            onTogglePlay={noop}
            onToggleFavourite={noop}
            onRemoveTrackFromPlaylist={onRemoveTrackFromPlaylist}
            onRemoveTracksFromPlaylist={onRemoveTracksFromPlaylist}
            onReorderPlaylistTracks={onReorderPlaylistTracks}
          />
        );
      });

    renderView('');
    expect(host.querySelectorAll('button[title="Move down"]').length).toBeGreaterThan(0);

    // Filtered to "Beta": 2 rows (original indices 1 and 3), Hero stays total (4 tracks), reorder hidden
    renderView('Beta');
    expect(host.querySelectorAll('[data-testid^="track-row-"]').length).toBe(2);
    expect(host.querySelector('[data-testid="playlist-hero"]')?.textContent).toContain('4 tracks');
    expect(host.querySelectorAll('button[title="Move up"]').length).toBe(0);
    expect(host.querySelectorAll('button[title="Move down"]').length).toBe(0);

    // Play All while filtered queues only visible matching tracks
    click(host.querySelector<HTMLElement>('[data-testid="play-all-button"]'));
    expect(onPlayQueue).toHaveBeenCalledWith([tB, tB]);
    expect(onPlayPlaylist).not.toHaveBeenCalled();

    // Remove 1st visible match -> originalIndex 1 (NOT 0!)
    const menuBtns = host.querySelectorAll<HTMLElement>('[data-testid^="track-menu-button-"]');
    expect(menuBtns.length).toBe(2);
    click(menuBtns[0]);
    const removeBtn1 = Array.from(document.querySelectorAll<HTMLElement>('[data-track-menu] button')).find((b) =>
      b.textContent?.includes('Remove from Playlist')
    );
    click(removeBtn1 ?? null);
    expect(onRemoveTrackFromPlaylist).toHaveBeenNthCalledWith(1, 'pl-1', '', 1);

    // Remove 2nd visible match -> originalIndex 3 (NOT 1!)
    click(menuBtns[1]);
    const removeBtn2 = Array.from(document.querySelectorAll<HTMLElement>('[data-track-menu] button')).find((b) =>
      b.textContent?.includes('Remove from Playlist')
    );
    click(removeBtn2 ?? null);
    expect(onRemoveTrackFromPlaylist).toHaveBeenNthCalledWith(2, 'pl-1', '', 3);

    // Zero-match search: Hero & Rename/Delete remain, Play All & Select disabled, search empty state shown
    renderView('no-such-track');
    expect(host.querySelector('[data-testid="playlist-hero"]')).not.toBeNull();
    expect(host.textContent).toContain('No tracks found matching your search.');
    expect(host.textContent).not.toContain('This playlist is empty');
    expect(host.querySelector<HTMLButtonElement>('[data-testid="play-all-button"]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-testid="toggle-select-mode"]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-testid="playlist-rename-button"]')?.disabled).toBe(false);
    expect(host.querySelector<HTMLButtonElement>('[data-testid="playlist-delete-button"]')?.disabled).toBe(false);

    // Clearing search restores reorder buttons
    renderView('');
    expect(host.querySelectorAll('button[title="Move down"]').length).toBeGreaterThan(0);
  });

  it('Folder Detail, Album Detail, and Artist Detail filter tracks, scope Play All, and keep Hero / subfolders intact on 0 matches', () => {
    const t1 = makeTrack('t1', { metadata: { title: 'Starlight', artist: 'Muse', album: 'Black Holes' } });
    const t2 = makeTrack('t2', { metadata: { title: 'Supermassive', artist: 'Muse', album: 'Black Holes' } });
    const onPlayQueue = vi.fn();

    const folderNode = makeNode('src-1', 'Muse Folder', [t1, t2], [makeNode('src-1/Live Disc', 'Live Disc')]);
    const renderFolder = (q: string) =>
      act(() => {
        root.render(
          <FolderView
            currentNode={folderNode}
            isFolderOverview={false}
            searchQuery={q}
            isPlaying={false}
            favourites={new Set()}
            renderLayout={({ actions, content }) => (
              <div>
                <header>{actions}</header>
                <section>{content}</section>
              </div>
            )}
            onSelectFolder={noop}
            onPlayTrack={noop}
            onPlayQueue={onPlayQueue}
            onTogglePlay={noop}
            onToggleFavourite={noop}
          />
        );
      });

    renderFolder('star');
    expect(host.querySelectorAll('[data-testid^="track-row-"]').length).toBe(1);
    expect(host.querySelector('[data-testid="folder-subfolders-section"]')).toBeNull();
    click(host.querySelector<HTMLElement>('[data-testid="play-all-button"]'));
    expect(onPlayQueue).toHaveBeenCalledWith([t1]);

    renderFolder('Live');
    expect(host.querySelector('[data-testid="folder-subfolders-section"]')?.textContent).toContain('Live Disc');
    expect(host.textContent).not.toContain('No tracks found matching your search.');

    renderFolder('zzz');
    expect(host.querySelector('[data-testid="folder-subfolders-section"]')).toBeNull();
    expect(host.textContent).toContain('No tracks found matching your search.');

    const album = makeAlbum('alb-1', 'Black Holes', 'Muse', [t1, t2]);
    act(() => {
      root.render(
        <AlbumsView
          albums={[album]}
          selectedAlbumId="alb-1"
          searchQuery="zzz"
          isPlaying={false}
          favourites={new Set()}
          renderLayout={({ actions, content }) => (
            <div>
              <header>{actions}</header>
              <section>{content}</section>
            </div>
          )}
          onSelectAlbum={noop}
          onPlayTrack={noop}
          onPlayQueue={onPlayQueue}
          onTogglePlay={noop}
          onToggleFavourite={noop}
        />
      );
    });
    expect(host.querySelector('[data-testid="album-hero"]')?.textContent).toContain('2 tracks');
    expect(host.textContent).toContain('No tracks found matching your search.');
    expect(host.querySelector<HTMLButtonElement>('[data-testid="play-all-button"]')?.disabled).toBe(true);

    const artist = makeArtist('art-1', 'Muse', [t1, t2]);
    act(() => {
      root.render(
        <ArtistsView
          artists={[artist]}
          selectedArtistName="art-1"
          searchQuery="zzz"
          isPlaying={false}
          favourites={new Set()}
          renderLayout={({ actions, content }) => (
            <div>
              <header>{actions}</header>
              <section>{content}</section>
            </div>
          )}
          onSelectArtist={noop}
          onPlayTrack={noop}
          onPlayQueue={onPlayQueue}
          onTogglePlay={noop}
          onToggleFavourite={noop}
        />
      );
    });
    expect(host.querySelector('[data-testid="artist-hero"]')?.textContent).toContain('2 tracks');
    expect(host.textContent).toContain('No tracks found matching your search.');
    expect(host.querySelector<HTMLButtonElement>('[data-testid="play-all-button"]')?.disabled).toBe(true);
  });

  it('Overview grids (Albums, Artists, Playlists, Music Folders) filter cards and render search empty states', () => {
    const t1 = makeTrack('t1', { metadata: { title: 'Alpha', artist: 'Queen', album: 'Jazz' } });
    const t2 = makeTrack('t2', { metadata: { title: 'Beta', artist: 'Muse', album: 'Drones' } });

    const albums = [makeAlbum('a1', 'Jazz', 'Queen', [t1]), makeAlbum('a2', 'Drones', 'Muse', [t2])];
    act(() => {
      root.render(
        <AlbumsView albums={albums} selectedAlbumId={null} searchQuery="none" isPlaying={false} favourites={new Set()}
          onSelectAlbum={noop} onPlayTrack={noop} onPlayQueue={noop} onTogglePlay={noop} onToggleFavourite={noop} />
      );
    });
    expect(host.querySelector('[data-testid="albums-search-empty"]')?.textContent).toContain('No albums match');

    const artists = [makeArtist('ar1', 'Queen', [t1]), makeArtist('ar2', 'Muse', [t2])];
    act(() => {
      root.render(
        <ArtistsView artists={artists} selectedArtistName={null} searchQuery="none" isPlaying={false} favourites={new Set()}
          onSelectArtist={noop} onPlayTrack={noop} onPlayQueue={noop} onTogglePlay={noop} onToggleFavourite={noop} />
      );
    });
    expect(host.querySelector('[data-testid="artists-search-empty"]')?.textContent).toContain('No artists match');

    const pls: Playlist[] = [{ id: 'p1', name: 'Favorites Mix', tracks: [], createdAt: 1, updatedAt: 1 }];
    act(() => {
      root.render(
        <PlaylistsView playlists={pls} selectedPlaylistId={null} libraryTracks={[t1, t2]} searchQuery="none"
          isPlaying={false} favourites={new Set()} onSelectPlaylist={noop} onCreatePlaylist={() => pls[0]}
          onRenamePlaylist={noop} onDeletePlaylist={noop} onPlayPlaylist={noop} onPlayTrack={noop}
          onTogglePlay={noop} onToggleFavourite={noop} onRemoveTrackFromPlaylist={noop} onReorderPlaylistTracks={noop} />
      );
    });
    expect(host.querySelector('[data-testid="playlists-search-empty"]')?.textContent).toContain('No playlists match');
    expect(host.textContent).not.toContain('No playlists yet');

    const nodes = [
      makeNode('src-1', 'Rock', [t1]),
      makeNode(IMPORTED_FILES_ROOT_ID, IMPORTED_FILES_COLLECTION_NAME, [t2]),
    ];
    const rootTree = makeNode('', 'Library', [], nodes);
    act(() => {
      root.render(
        <FolderView currentNode={rootTree} isFolderOverview={true} overviewNodes={nodes} searchQuery="imported"
          isPlaying={false} favourites={new Set()} onSelectFolder={noop} onPlayTrack={noop} onTogglePlay={noop} onToggleFavourite={noop} />
      );
    });
    expect(host.textContent).toContain('Imported Files');
    expect(host.textContent).not.toContain('Rock');
  });

  it('Favourites shows search empty state (not "No favourite tracks yet") when search matches 0 tracks', () => {
    const t1 = makeTrack('t1');
    const mockLibrary = {
      library: { name: 'Lib', flatPlaylist: [t1], folders: [], tree: makeNode('', 'Lib', [t1]) },
      folders: [],
      currentView: 'favourites' as LibraryView,
      isLoading: false,
      scanProgress: 0,
      searchQuery: 'unmatched',
      displayedTracks: [],
      currentFolderNode: null,
      albums: [],
      artists: [],
      selectedAlbumId: null,
      selectedArtistName: null,
      selectedFolderPath: '',
      favourites: new Set(['t1']),
      selectFolder: noop,
      selectAlbum: noop,
      selectArtist: noop,
      setSearchQuery: noop,
      toggleFavourite: noop,
      addTracksToFavourites: noop,
      removeTracksFromFavourites: noop,
      removeImportedFiles: noop,
      openFolderPicker: noop,
      openFilesPicker: noop,
      handleFallbackFolderSelect: noop,
      handleOpenFilesSelect: noop,
    };
    const mockPlaylists = {
      playlists: [],
      selectedPlaylistId: null,
      selectPlaylist: noop,
      createPlaylist: vi.fn(),
      renamePlaylist: noop,
      deletePlaylist: noop,
      reorderPlaylistTracks: noop,
      removeTrackFromPlaylist: noop,
      removeTracksFromPlaylist: noop,
      addTrackToPlaylist: vi.fn(),
      addTracksToPlaylist: vi.fn(),
    };
    const mockAudio = {
      currentTrack: null,
      isPlaying: false,
      playTrack: noop,
      playQueue: noop,
      togglePlay: noop,
      playNext: noop,
      playNextBulk: noop,
      addToQueue: noop,
    };

    act(() => {
      root.render(
        <LibraryContent
          library={mockLibrary as never}
          playlists={mockPlaylists as never}
          audioPlayer={mockAudio as never}
        />
      );
    });
    expect(host.textContent).toContain('No tracks found matching your search.');
    expect(host.textContent).not.toContain('No favourite tracks yet');
  });

  it('derives accurate Header subtitles for active search across Overview and Detail views', () => {
    const base = {
      hasLibrary: true,
      selectedFolderPath: '',
      currentFolderNode: null,
      selectedAlbumId: null,
      selectedArtistName: null,
      displayedTracksCount: 0,
      playlistsCount: 4,
    };

    expect(
      deriveViewHeaderInfo({ ...base, currentView: 'albums', searchQuery: 'jazz', albumsCount: 10, filteredOverviewCount: 2 }).subtitle
    ).toBe('2 of 10 albums');

    expect(
      deriveViewHeaderInfo({ ...base, currentView: 'artists', searchQuery: 'queen', artistsCount: 5, filteredOverviewCount: 1 }).subtitle
    ).toBe('1 of 5 artists');

    expect(
      deriveViewHeaderInfo({ ...base, currentView: 'playlists', searchQuery: 'mix', filteredOverviewCount: 1 }).subtitle
    ).toBe('1 of 4 playlists');

    expect(
      deriveViewHeaderInfo({
        ...base,
        currentView: 'folder',
        searchQuery: 'rock',
        folderOverviewFoldersCount: 2,
        folderOverviewTracksCount: 20,
        filteredOverviewCount: 1,
        totalOverviewCollectionsCount: 3,
      }).subtitle
    ).toBe('1 of 3 collections');

    expect(
      deriveViewHeaderInfo({
        ...base,
        currentView: 'playlists',
        searchQuery: 'beta',
        isPlaylistDetail: true,
        selectedPlaylistName: 'Mix Tape',
        filteredDetailTracksCount: 2,
        totalDetailTracksCount: 4,
      }).subtitle
    ).toBe('2 of 4 tracks');
  });

  it('useLibraryNavigation clears searchQuery on view switch, folder/album/artist drill-down, and breadcrumb back', () => {
    let nav!: ReturnType<typeof useLibraryNavigation>;
    function Harness() {
      nav = useLibraryNavigation(null);
      return <div data-testid="q">{nav.searchQuery}</div>;
    }

    act(() => root.render(<Harness />));
    act(() => nav.setSearchQuery('miles'));
    expect(nav.searchQuery).toBe('miles');

    act(() => nav.setCurrentView('albums'));
    expect(nav.searchQuery).toBe('');

    act(() => nav.setSearchQuery('blue'));
    act(() => nav.selectAlbum('alb-1'));
    expect(nav.searchQuery).toBe('');

    act(() => nav.setSearchQuery('track'));
    act(() => nav.selectAlbum(null));
    expect(nav.searchQuery).toBe('');

    act(() => nav.setSearchQuery('queen'));
    act(() => nav.selectArtist('Queen'));
    expect(nav.searchQuery).toBe('');

    act(() => nav.setSearchQuery('rock'));
    act(() => nav.selectFolder('src-1'));
    expect(nav.searchQuery).toBe('');
  });
});
