// @vitest-environment jsdom
import { act, useMemo, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AlbumsView } from '../src/components/AlbumsView';
import { ArtistsView } from '../src/components/ArtistsView';
import { Header } from '../src/components/Header';
import { TrackListLayoutSlots } from '../src/components/TrackList';
import { FileStatus, LibraryView, MusicLibrary, TrackItem } from '../src/types/music';
import { buildFolderTree, buildUnifiedMultiFolderTree, combineFlatPlaylists } from '../src/utils/musicTree';
import { deriveAlbums, deriveArtists, deriveDisplayedTracks } from '../src/utils/libraryAggregation';

const calls = {
  playQueue: vi.fn(),
  playTrack: vi.fn(),
  playNextBulk: vi.fn(),
  addToQueue: vi.fn(),
  addTracksToFavourites: vi.fn(),
  removeTracksFromFavourites: vi.fn(),
  toggleFavourite: vi.fn(),
};

let initialView: LibraryView = 'albums';
let initialSelectedAlbumId: string | null = null;
let initialSelectedArtistName: string | null = null;
let mockTracks: TrackItem[] = [];
let mockFavouriteIds: string[] = [];

function makeTrack(
  id: string,
  title: string,
  artist: string,
  album: string,
  status: FileStatus = 'normal',
  duration = 237
): TrackItem {
  return {
    id,
    name: `${title}.mp3`,
    relativePath: `${title}.mp3`,
    size: 2048,
    lastModified: 1000,
    status,
    metadata: {
      title,
      artist,
      album,
      duration,
      isMetadataLoaded: true,
    },
  };
}

vi.mock('../src/hooks/useMusicLibrary', () => ({
  useMusicLibrary: () => {
    const [currentView, setCurrentView] = useState<LibraryView>(initialView);
    const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(initialSelectedAlbumId);
    const [selectedArtistName, setSelectedArtistName] = useState<string | null>(initialSelectedArtistName);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [favSet, setFavSet] = useState<Set<string>>(() => new Set(mockFavouriteIds));

    const folderTree = buildFolderTree('Music', mockTracks, 'root1');
    const folder = {
      id: 'root1',
      name: 'Music',
      sourceType: 'fs-access' as const,
      tree: folderTree,
      tracks: mockTracks,
      trackCount: mockTracks.length,
      addedAt: 1,
      lastScannedAt: 1,
      permissionStatus: 'granted' as const,
    };
    const lib: MusicLibrary = {
      id: 'multi',
      name: 'Music Library',
      sourceType: 'fs-access',
      folders: mockTracks.length > 0 ? [folder] : [],
      tree: buildUnifiedMultiFolderTree(mockTracks.length > 0 ? [folder] : []),
      flatPlaylist: combineFlatPlaylists(mockTracks.length > 0 ? [folder] : []),
    };
    const albums = useMemo(() => deriveAlbums(lib.flatPlaylist), [lib.flatPlaylist]);
    const artists = useMemo(() => deriveArtists(lib.flatPlaylist), [lib.flatPlaylist]);
    const favouriteTracks = useMemo(
      () => mockTracks.filter((t) => favSet.has(t.id)),
      [favSet]
    );
    const displayedTracks = useMemo(
      () =>
        deriveDisplayedTracks({
          library: lib,
          currentView,
          currentFolderNode: lib.tree,
          selectedArtistName,
          selectedAlbumId,
          albums,
          favouriteTracks,
          searchQuery,
        }),
      [lib, currentView, selectedArtistName, selectedAlbumId, albums, favouriteTracks, searchQuery]
    );

    return {
      library: lib,
      folders: lib.folders,
      isLoading: false,
      isInitialized: true,
      hasRegisteredSources: lib.folders.length > 0,
      needsPermission: false,
      scanProgress: 0,
      currentView,
      selectedFolderPath: '',
      selectedArtistName,
      selectedAlbumId,
      searchQuery,
      currentFolderNode: lib.tree,
      displayedTracks,
      albums,
      artists,
      favourites: favSet,
      favouritesCount: favSet.size,
      lastSourceRemoval: null,
      setCurrentView,
      selectFolder: () => {},
      selectArtist: (name: string | null) => {
        setSelectedArtistName(name);
        setCurrentView('artists');
      },
      selectAlbum: (id: string | null) => {
        setSelectedAlbumId(id);
        setCurrentView('albums');
      },
      setSearchQuery,
      toggleFavourite: (id: string) => {
        calls.toggleFavourite(id);
        setFavSet((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      },
      addTracksToFavourites: calls.addTracksToFavourites,
      removeTracksFromFavourites: calls.removeTracksFromFavourites,
      removeImportedFiles: () => {},
      removeAllImportedFiles: () => {},
      openFolderPicker: () => {},
      openFilesPicker: () => {},
      refreshFolder: () => {},
      removeFolder: () => {},
      requestPermissionForFolder: () => {},
      requestPermissionAndLoad: () => {},
      handleFallbackFolderSelect: () => {},
      handleOpenFilesSelect: () => {},
      updateTrackStatus: () => {},
      updateTrackMetadata: () => {},
      requestTrackArtwork: () => {},
    };
  },
}));

vi.mock('../src/hooks/usePlaylists', () => ({
  usePlaylists: () => ({
    playlists: [],
    selectedPlaylistId: null,
    selectPlaylist: () => {},
    createPlaylist: () => ({ id: 'pl', name: 'P', tracks: [], createdAt: 1, updatedAt: 1 }),
    renamePlaylist: () => {},
    deletePlaylist: () => {},
    addTrackToPlaylist: () => true,
    addTracksToPlaylist: () => ({ addedCount: 0 }),
    removeTrackFromPlaylist: () => {},
    removeTracksFromPlaylist: () => {},
    reorderPlaylistTracks: () => {},
    saveQueueAsPlaylist: () => {},
  }),
}));

vi.mock('../src/hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    isMuted: false,
    repeatMode: 'off',
    shuffle: false,
    playbackError: null,
    clearPlaybackError: () => {},
    lyrics: [],
    ambientColors: { primary: '#6366f1', glow: '#4f46e5' },
    queue: [],
    playTrack: calls.playTrack,
    playQueueTrack: () => {},
    playQueue: calls.playQueue,
    playNext: () => {},
    playNextBulk: calls.playNextBulk,
    addToQueue: calls.addToQueue,
    removeFromQueue: () => {},
    removeTracksFromQueue: () => 0,
    clearQueue: () => {},
    reorderQueue: () => {},
    togglePlay: () => {},
    nextTrack: () => {},
    prevTrack: () => {},
    seekTo: () => {},
    seekRelative: () => {},
    changeVolume: () => {},
    adjustVolume: () => {},
    toggleMute: () => {},
    cycleRepeatMode: () => {},
    toggleShuffle: () => {},
  }),
}));

vi.mock('../src/hooks/useShortcuts', () => ({ useShortcuts: () => {} }));
vi.mock('../src/utils/navigationStorage', () => ({
  getStoredNavigation: () => null,
  storeNavigation: () => {},
}));

let host: HTMLDivElement;
let root: Root;

const byId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = (el: Element | null) => {
  expect(el).not.toBeNull();
  act(() => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
function typeSearch(value: string) {
  const input = host.querySelector<HTMLInputElement>('header input[type="text"]');
  expect(input).not.toBeNull();
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  initialView = 'albums';
  initialSelectedAlbumId = null;
  initialSelectedArtistName = null;
  mockTracks = [];
  mockFavouriteIds = [];
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mountApp = () => act(() => root.render(<App />));

describe('Phase 4: Unified Albums, Artists & Favourites Headers', () => {
  describe('1. Albums Overview & Album Detail', () => {
    it('shows album & track counts in Overview, unifies Album Detail Header/Breadcrumb/Hero, preserves Play All & bulk actions, and resets selection', () => {
      // Duplicate album title ("Greatest Hits") across two different artists
      const t1 = makeTrack('t1', 'Song 1', 'Artist A', 'Greatest Hits');
      const t2 = makeTrack('t2', 'Song 2', 'Artist A', 'Greatest Hits', 'unreadable');
      const t3 = makeTrack('t3', 'Song 3', 'Artist B', 'Greatest Hits');
      mockTracks = [t1, t2, t3];
      initialView = 'albums';
      initialSelectedAlbumId = null;

      mountApp();

      // Overview: 2 albums · 3 tracks
      expect(host.querySelector('main > header h1')?.textContent).toBe('Albums');
      expect(byId('header-subtitle')?.textContent).toBe('2 albums · 3 tracks');
      expect(byId('play-all-button')).toBeNull();
      expect(byId('albums-overview-grid')).not.toBeNull();

      // Click first album card -> Album Detail
      click(byId('album-card-Greatest Hits___Artist A'));
      const header = host.querySelector('main > header');
      expect(header!.querySelector('[data-testid="folder-breadcrumb"]')?.textContent).toContain('Albums');
      expect(header!.querySelector('[data-testid="folder-breadcrumb"]')?.textContent).toContain('Greatest Hits');
      expect(byId('play-all-button')?.closest('header')).toBe(header);
      expect(byId('toggle-select-mode')?.closest('header')).toBe(header);
      expect(byId('tracklist-toolbar')).toBeNull();
      expect(host.querySelector('main')?.textContent).not.toContain('All Albums');
      expect(host.querySelector('main')?.textContent).not.toContain('Play Album');

      // Simplified square-cover Hero has ZERO buttons and accurate track count
      const hero = byId('album-hero');
      expect(hero).not.toBeNull();
      expect(hero!.querySelectorAll('button')).toHaveLength(0);
      expect(hero!.textContent).toContain('Artist A');
      expect(hero!.textContent).toContain('2 tracks');

      // Breadcrumb stays clickable during active search
      typeSearch('Song');
      expect(byId('folder-breadcrumb')?.textContent).toContain('Albums');
      typeSearch('');

      // Play All plays ONLY playable tracks of this album
      click(byId('play-all-button'));
      expect(calls.playQueue).toHaveBeenCalledExactlyOnceWith([t1], 0);

      // Select & Bulk action parity (Play Next Bulk)
      click(byId('toggle-select-mode'));
      click(byId('track-checkbox-t1'));
      const playNextBulkBtn = [...host.querySelectorAll<HTMLButtonElement>('[data-testid="bulk-action-toolbar"] button')].find(
        (b) => b.textContent?.includes('Play Next')
      );
      click(playNextBulkBtn ?? null);
      expect(calls.playNextBulk).toHaveBeenCalledExactlyOnceWith([t1]);

      // Click Albums parent breadcrumb -> returns to Overview cleanly
      click(host.querySelector('[data-testid="folder-breadcrumb"] button'));
      expect(byId('album-hero')).toBeNull();
      expect(byId('header-subtitle')?.textContent).toBe('2 albums · 3 tracks');

      // Open single-track album -> verify singular "1 track" in Hero (not "1 tracks")
      click(byId('album-card-Greatest Hits___Artist B'));
      expect(byId('album-hero')?.textContent).toContain('1 track');
      expect(byId('album-hero')?.textContent).not.toContain('1 tracks');
      expect(byId('toggle-select-mode')?.textContent).toContain('Select');
    });

    it('falls back cleanly to Overview when a selected Album disappears and preserves Hero on empty Album Detail', () => {
      mockTracks = [makeTrack('t1', 'Song 1', 'Artist A', 'Album A')];
      initialView = 'albums';
      initialSelectedAlbumId = 'NonExistent___Nobody';
      mountApp();

      // Missing selected album renders Overview safely with single Header
      expect(host.querySelectorAll('main > header')).toHaveLength(1);
      expect(byId('albums-overview-grid')).not.toBeNull();
      expect(byId('header-subtitle')?.textContent).toBe('1 album · 1 track');

      // Standalone empty Album Detail preserves Hero + unified Header with disabled actions
      const renderLayout = ({ actions, content }: TrackListLayoutSlots) => (
        <>
          <Header title="Empty Album" searchQuery="" actions={actions} theme="light" lightStyle="warm"
            onSearchChange={() => {}} onOpenShortcutsModal={() => {}} onSelectTheme={() => {}} onSelectLightStyle={() => {}} />
          <div data-testid="empty-album-scroll">{content}</div>
        </>
      );
      act(() =>
        root.render(
          <AlbumsView
            albums={[{ id: 'a1', name: 'Empty Album', artist: 'Nobody', tracks: [], totalDuration: 0 }]}
            selectedAlbumId="a1"
            isPlaying={false}
            favourites={new Set()}
            renderLayout={renderLayout}
            onSelectAlbum={() => {}}
            onPlayTrack={() => {}}
            onTogglePlay={() => {}}
            onToggleFavourite={() => {}}
          />
        )
      );
      expect(byId('album-hero')).not.toBeNull();
      expect((byId('play-all-button') as HTMLButtonElement).disabled).toBe(true);
      expect((byId('toggle-select-mode') as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('2. Artists Overview & Artist Detail', () => {
    it('shows artist & track counts in Overview, unifies Artist Detail Header/Breadcrumb/Circular Hero, and preserves Play All & bulk actions', () => {
      const t1 = makeTrack('t1', 'Fire', '张信哲', 'Album 1');
      const t2 = makeTrack('t2', 'Broken', '张信哲', 'Album 1', 'unreadable');
      const t3 = makeTrack('t3', 'Blue', '周杰伦', 'Album 2');
      mockTracks = [t1, t2, t3];
      initialView = 'artists';
      initialSelectedArtistName = null;

      mountApp();

      expect(host.querySelector('main > header h1')?.textContent).toBe('Artists');
      expect(byId('header-subtitle')?.textContent).toBe('2 artists · 3 tracks');
      expect(byId('play-all-button')).toBeNull();

      // Open Artist Detail
      click(byId('artist-card-周杰伦'));
      const header = host.querySelector('main > header');
      expect(header!.querySelector('[data-testid="folder-breadcrumb"]')?.textContent).toContain('Artists');
      expect(header!.querySelector('[data-testid="folder-breadcrumb"]')?.textContent).toContain('周杰伦');
      expect(byId('play-all-button')?.closest('header')).toBe(header);
      expect(byId('toggle-select-mode')?.closest('header')).toBe(header);
      expect(byId('tracklist-toolbar')).toBeNull();
      expect(host.querySelector('main')?.textContent).not.toContain('All Artists');
      expect(host.querySelector('main')?.textContent).not.toContain('Play Artist');

      // Circular avatar Hero preserved, singular "1 track · 1 album", zero buttons
      const hero = byId('artist-hero');
      expect(hero).not.toBeNull();
      expect(hero!.innerHTML).toContain('rounded-full');
      expect(hero!.querySelectorAll('button')).toHaveLength(0);
      expect(hero!.textContent).toContain('1 track');
      expect(hero!.textContent).not.toContain('1 tracks');
      expect(hero!.textContent).toContain('1 album');

      // Breadcrumb stays clickable during search
      typeSearch('Blue');
      expect(byId('folder-breadcrumb')?.textContent).toContain('Artists');
      typeSearch('');

      // Play All plays artist tracks
      click(byId('play-all-button'));
      expect(calls.playQueue).toHaveBeenCalledExactlyOnceWith([t3], 0);

      // Navigate back to Overview via Artists breadcrumb, then into 张信哲
      click(host.querySelector('[data-testid="folder-breadcrumb"] button'));
      expect(byId('artists-overview-grid')).not.toBeNull();
      click(byId('artist-card-张信哲'));
      click(byId('play-all-button'));
      expect(calls.playQueue).toHaveBeenLastCalledWith([t1], 0);

      // Standalone empty Artist Detail preserves Hero + unified Header with disabled actions
      const renderLayout = ({ actions, content }: TrackListLayoutSlots) => (
        <>
          <Header title="Empty Artist" searchQuery="" actions={actions} theme="light" lightStyle="warm"
            onSearchChange={() => {}} onOpenShortcutsModal={() => {}} onSelectTheme={() => {}} onSelectLightStyle={() => {}} />
          <div data-testid="empty-artist-scroll">{content}</div>
        </>
      );
      act(() =>
        root.render(
          <ArtistsView
            artists={[{ id: 'Empty', name: 'Empty', tracks: [], albumCount: 0, totalDuration: 0 }]}
            selectedArtistName="Empty"
            isPlaying={false}
            favourites={new Set()}
            renderLayout={renderLayout}
            onSelectArtist={() => {}}
            onPlayTrack={() => {}}
            onTogglePlay={() => {}}
            onToggleFavourite={() => {}}
          />
        )
      );
      expect(byId('artist-hero')).not.toBeNull();
      expect((byId('play-all-button') as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('3. Favourites Unified Flat-List Header', () => {
    it('renders Play All and Select inside main Header with no legacy toolbar, updates count on unfavourite, and handles empty state', () => {
      const t1 = makeTrack('t1', 'Fav One', 'Artist 1', 'Album 1');
      const t2 = makeTrack('t2', 'Fav Two', 'Artist 2', 'Album 2', 'unreadable');
      mockTracks = [t1, t2];
      mockFavouriteIds = ['t1', 't2'];
      initialView = 'favourites';

      mountApp();

      const header = host.querySelector('main > header');
      expect(header).not.toBeNull();
      expect(header!.querySelector('h1')?.textContent).toBe('Favourites');
      expect(byId('header-subtitle')?.textContent).toBe('2 tracks');
      expect(byId('play-all-button')?.closest('header')).toBe(header);
      expect(byId('toggle-select-mode')?.closest('header')).toBe(header);
      expect(byId('tracklist-toolbar')).toBeNull();
      expect(byId('folder-breadcrumb')).toBeNull();

      // Play All plays only playable favourites
      click(byId('play-all-button'));
      expect(calls.playQueue).toHaveBeenCalledExactlyOnceWith([t1], 0);

      // Unfavourite t1 -> count drops to 1 track; remaining track is unreadable so Play All disables
      click(byId('track-favourite-t1'));
      expect(byId('header-subtitle')?.textContent).toBe('1 track');
      expect((byId('play-all-button') as HTMLButtonElement).disabled).toBe(true);

      // Unfavourite unavailable t2 -> empty state retains unified Header with disabled actions
      click(byId('track-favourite-t2'));
      expect(byId('header-subtitle')?.textContent).toBe('0 tracks');
      expect((byId('play-all-button') as HTMLButtonElement).disabled).toBe(true);
      expect((byId('toggle-select-mode') as HTMLButtonElement).disabled).toBe(true);
      expect(host.querySelector('main')?.textContent).toContain('No favourite tracks yet');
    });
  });
});
