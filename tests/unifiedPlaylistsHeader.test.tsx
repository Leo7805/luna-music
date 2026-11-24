// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import {
  FileStatus,
  LibraryView,
  MusicLibrary,
  Playlist,
  TrackItem,
} from '../src/types/music';
import { buildFolderTree, buildUnifiedMultiFolderTree, combineFlatPlaylists } from '../src/utils/musicTree';

const calls = {
  playQueue: vi.fn(),
  playTrack: vi.fn(),
  playNext: vi.fn(),
  addToQueue: vi.fn(),
  toggleFavourite: vi.fn(),
  removeTrackFromPlaylist: vi.fn(),
  removeTracksFromPlaylist: vi.fn(),
  reorderPlaylistTracks: vi.fn(),
};

let initialPlaylists: Playlist[] = [];
let initialSelectedPlaylistId: string | null = null;
let mockTracks: TrackItem[] = [];
let mockFavourites = new Set<string>();

function makeTrack(id: string, title: string, duration = 200, status: FileStatus = 'normal'): TrackItem {
  return {
    id,
    name: `${title}.mp3`,
    relativePath: `${title}.mp3`,
    size: 2048,
    lastModified: 1000,
    status,
    metadata: {
      title,
      artist: 'Artist',
      album: 'Album',
      duration,
      isMetadataLoaded: true,
    },
  };
}

function makePlaylist(id: string, name: string, trackIds: string[]): Playlist {
  return {
    id,
    name,
    tracks: trackIds.map((trackId, i) => ({
      trackId,
      name: `${trackId}.mp3`,
      artist: 'Artist',
      album: 'Album',
      duration: 200,
      addedAt: 1000 + i,
    })),
    createdAt: 1000,
    updatedAt: 1000,
  };
}

vi.mock('../src/hooks/useMusicLibrary', () => ({
  useMusicLibrary: () => {
    const [currentView, setCurrentView] = useState<LibraryView>('playlists');
    const [searchQuery, setSearchQuery] = useState<string>('');
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
      selectedArtistName: null,
      selectedAlbumId: null,
      searchQuery,
      currentFolderNode: lib.tree,
      displayedTracks: mockTracks,
      albums: [],
      artists: [],
      favourites: mockFavourites,
      favouritesCount: mockFavourites.size,
      lastSourceRemoval: null,
      setCurrentView,
      selectFolder: () => {},
      selectArtist: () => {},
      selectAlbum: () => {},
      setSearchQuery,
      toggleFavourite: calls.toggleFavourite,
      addTracksToFavourites: () => {},
      removeTracksFromFavourites: () => {},
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
  usePlaylists: () => {
    const [playlists, setPlaylists] = useState<Playlist[]>(initialPlaylists);
    const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(initialSelectedPlaylistId);
    return {
      playlists,
      selectedPlaylistId,
      selectPlaylist: setSelectedPlaylistId,
      createPlaylist: (name: string) => {
        const created: Playlist = {
          id: `pl-${playlists.length + 1}`,
          name,
          tracks: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setPlaylists((prev) => [...prev, created]);
        return created;
      },
      renamePlaylist: (id: string, newName: string) => {
        setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, name: newName } : p)));
      },
      deletePlaylist: (id: string) => {
        setPlaylists((prev) => prev.filter((p) => p.id !== id));
        setSelectedPlaylistId((prev) => (prev === id ? null : prev));
      },
      addTrackToPlaylist: () => true,
      addTracksToPlaylist: () => ({ addedCount: 0 }),
      removeTrackFromPlaylist: calls.removeTrackFromPlaylist,
      removeTracksFromPlaylist: calls.removeTracksFromPlaylist,
      reorderPlaylistTracks: calls.reorderPlaylistTracks,
      saveQueueAsPlaylist: () => {},
    };
  },
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
    playNext: calls.playNext,
    playNextBulk: () => {},
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
function typeInto(input: HTMLInputElement | null, value: string) {
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
  initialPlaylists = [];
  initialSelectedPlaylistId = null;
  mockTracks = [];
  mockFavourites = new Set();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mountApp = () => act(() => root.render(<App />));

describe('Phase 3: Unified Playlists Overview, Detail & Track Actions', () => {
  describe('1. Playlists Overview Consolidation & Totals', () => {
    it('shows playlist count + total playlist track entries (counting shared memberships & unavailable entries) with single Create Playlist in Header and no New Playlist card', () => {
      const t1 = makeTrack('t1', 'Song One');
      const t2 = makeTrack('t2', 'Song Two');
      mockTracks = [t1, t2];
      // t1 appears in BOTH playlists; tMissing is unavailable -> total entries = 2 + 2 = 4
      initialPlaylists = [
        makePlaylist('p1', 'Mix A', ['t1', 't2']),
        makePlaylist('p2', 'Mix B', ['t1', 'tMissing']),
      ];
      initialSelectedPlaylistId = null;

      mountApp();

      const header = host.querySelector('main > header');
      expect(header).not.toBeNull();
      expect(header!.querySelector('h1')?.textContent).toBe('Playlists');
      expect(header!.querySelector('[data-testid="header-subtitle"]')?.textContent).toBe('2 playlists · 4 tracks');
      expect(byId('create-playlist-header-button')?.closest('header')).toBe(header);

      // No duplicate heading or permanent dashed New Playlist card inside content
      const scrollArea = host.querySelector('main > div.overflow-y-auto');
      expect(scrollArea).not.toBeNull();
      expect(scrollArea!.querySelector('h2')).toBeNull();
      expect(scrollArea!.textContent).not.toContain('New Playlist');
      expect(scrollArea!.textContent).not.toContain('Click to create');
      expect(byId('playlist-card-p1')).not.toBeNull();
      expect(byId('playlist-card-p2')).not.toBeNull();
    });

    it('keeps Create Playlist in Header and empty-state prompt when zero playlists exist, and creates a playlist via modal', () => {
      initialPlaylists = [];
      mountApp();

      expect(byId('header-subtitle')?.textContent).toBe('0 playlists · 0 tracks');
      expect(byId('create-playlist-header-button')?.closest('header')).not.toBeNull();
      expect(host.querySelector('main')?.textContent).toContain('No playlists yet');

      // Open Create Playlist modal from Header button and submit
      click(byId('create-playlist-header-button'));
      const modalInput = host.querySelector<HTMLInputElement>('form input[type="text"]');
      typeInto(modalInput, 'Road Trip');
      const submitBtn = host.querySelector<HTMLButtonElement>('form button[type="submit"]');
      click(submitBtn);

      // Navigates into newly created playlist detail with breadcrumb in Header
      expect(byId('folder-breadcrumb')?.textContent).toContain('Playlists');
      expect(byId('folder-breadcrumb')?.textContent).toContain('Road Trip');
    });
  });

  describe('2. Playlist Detail Header, Breadcrumb, Simplified Hero, Modals & Selection Reset', () => {
    it('moves Breadcrumb, Play All, Select, Rename & Delete to main Header, simplifies Hero, preserves search breadcrumb, and resets selection across playlists', () => {
      const t1 = makeTrack('t1', 'Alpha', 210);
      const t2 = makeTrack('t2', 'Beta', 190);
      mockTracks = [t1, t2];
      initialPlaylists = [
        makePlaylist('p1', '222', ['t1', 't2', 'tOffline']),
        makePlaylist('p2', 'Chill', ['t2']),
      ];
      initialSelectedPlaylistId = 'p1';

      mountApp();

      const header = host.querySelector('main > header');
      expect(header).not.toBeNull();
      // Main Header breadcrumb shows Playlists > 222
      expect(header!.querySelector('[data-testid="folder-breadcrumb"]')?.textContent).toContain('Playlists');
      expect(header!.querySelector('[data-testid="folder-breadcrumb"]')?.textContent).toContain('222');
      // Header actions present; no duplicate toolbar or inner breadcrumb
      expect(byId('play-all-button')?.closest('header')).toBe(header);
      expect(byId('toggle-select-mode')?.closest('header')).toBe(header);
      expect(byId('playlist-rename-button')?.closest('header')).toBe(header);
      expect(byId('playlist-delete-button')?.closest('header')).toBe(header);
      expect(byId('tracklist-toolbar')).toBeNull();
      expect(host.querySelector('main')?.textContent).not.toContain('ALL PLAYLISTS /');

      // Simplified Hero retains artwork/name/metadata and has ZERO buttons (no Shuffle / Add to Queue / etc.)
      const hero = byId('playlist-hero');
      expect(hero).not.toBeNull();
      expect(hero!.textContent).toContain('User Playlist');
      expect(hero!.textContent).toContain('222');
      expect(hero!.textContent).toContain('3 tracks');
      expect(hero!.querySelectorAll('button')).toHaveLength(0);
      expect(host.querySelector('main')?.textContent).not.toContain('Shuffle');

      // Breadcrumb stays accessible during active search
      typeInto(host.querySelector<HTMLInputElement>('header input[type="text"]'), 'Alpha');
      expect(byId('folder-breadcrumb')?.textContent).toContain('Playlists');
      typeInto(host.querySelector<HTMLInputElement>('header input[type="text"]'), '');

      // Play All invokes playQueue with ONLY playable tracks in playlist order
      click(byId('play-all-button'));
      expect(calls.playQueue).toHaveBeenCalledExactlyOnceWith([t1, t2], 0);

      // Select mode activates in p1, then resets cleanly when switching to p2 via Sidebar
      click(byId('toggle-select-mode'));
      expect(byId('toggle-select-mode')?.textContent).toContain('Done');
      click(byId('track-checkbox-t1'));
      expect(byId('bulk-action-toolbar')?.textContent).toContain('1 selected');

      click(host.querySelector('[data-testid="sidebar-playlist-p2"] [role="button"]'));
      expect(byId('folder-breadcrumb')?.textContent).toContain('Chill');
      expect(byId('toggle-select-mode')?.textContent).toContain('Select');
      expect(byId('bulk-action-toolbar')).toBeNull();

      // Rename via Header button updates breadcrumb & Hero
      click(byId('playlist-rename-button'));
      const renameInput = host.querySelector<HTMLInputElement>('form input[type="text"]');
      typeInto(renameInput, 'Evening Chill');
      click(host.querySelector<HTMLButtonElement>('form button[type="submit"]'));
      expect(byId('folder-breadcrumb')?.textContent).toContain('Evening Chill');
      expect(byId('playlist-hero')?.textContent).toContain('Evening Chill');

      // Delete via Header button requires confirmation: Cancel preserves, Confirm deletes & returns to Overview
      click(byId('playlist-delete-button'));
      const cancelBtn = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent === 'Cancel'
      );
      click(cancelBtn ?? null);
      expect(byId('playlist-hero')?.textContent).toContain('Evening Chill');

      click(byId('playlist-delete-button'));
      const confirmDeleteBtn = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent === 'Delete'
      );
      click(confirmDeleteBtn ?? null);
      expect(byId('playlist-hero')).toBeNull();
      expect(byId('header-subtitle')?.textContent).toBe('1 playlist · 3 tracks');
    });

    it('renders empty Playlist Detail cleanly with disabled Play All & Select, enabled Rename & Delete, and no table headings', () => {
      initialPlaylists = [makePlaylist('p-empty', 'Empty List', [])];
      initialSelectedPlaylistId = 'p-empty';
      mountApp();

      expect(host.querySelectorAll('main > header')).toHaveLength(1);
      expect((byId('play-all-button') as HTMLButtonElement).disabled).toBe(true);
      expect((byId('toggle-select-mode') as HTMLButtonElement).disabled).toBe(true);
      expect((byId('playlist-rename-button') as HTMLButtonElement).disabled).toBe(false);
      expect((byId('playlist-delete-button') as HTMLButtonElement).disabled).toBe(false);
      expect(byId('playlist-hero')?.textContent).toContain('0 tracks');
      expect(host.querySelector('main')?.textContent).toContain('This playlist is empty');
      expect(host.querySelector('main')?.textContent).not.toContain('ALBUM');

      // Clicking Playlists parent breadcrumb returns to overview
      click(host.querySelector('[data-testid="folder-breadcrumb"] button'));
      expect(byId('header-subtitle')?.textContent).toBe('1 playlist · 0 tracks');
    });
  });

  describe('3. Playlist Track-Row Actions (Shared Favourite, Context Menu, Reorder & Unavailable)', () => {
    it('exposes working Favourite button, three-dot menu actions, Remove from Playlist, and reorder controls', () => {
      const t1 = makeTrack('t1', 'First Song');
      const t2 = makeTrack('t2', 'Second Song');
      mockTracks = [t1, t2];
      mockFavourites = new Set(['t1']);
      initialPlaylists = [makePlaylist('p1', 'My Mix', ['t1', 't2', 'tOffline'])];
      initialSelectedPlaylistId = 'p1';

      mountApp();

      // Shared Favourite button reflects state & toggles favourite
      const fav1 = byId('track-favourite-t1');
      const fav2 = byId('track-favourite-t2');
      expect(fav1?.getAttribute('aria-pressed')).toBe('true');
      expect(fav2?.getAttribute('aria-pressed')).toBe('false');
      click(fav2);
      expect(calls.toggleFavourite).toHaveBeenCalledExactlyOnceWith('t2');

      // Open three-dot menu on t1 -> Play Next, Add to Queue, Add to Playlist..., Remove Favourite, Remove from Playlist
      click(byId('track-menu-button-t1'));
      const menuText = host.querySelector('[data-track-menu]')?.textContent || '';
      expect(menuText).toContain('Play Next');
      expect(menuText).toContain('Add to Queue');
      expect(menuText).toContain('Add to Playlist...');
      expect(menuText).toContain('Remove Favourite');
      expect(menuText).toContain('Remove from Playlist');

      const playNextBtn = [...host.querySelectorAll<HTMLButtonElement>('[data-track-menu] button')].find(
        (b) => b.textContent?.includes('Play Next')
      );
      click(playNextBtn ?? null);
      expect(calls.playNext).toHaveBeenCalledWith(t1);

      // Re-open menu and click Remove from Playlist (index 0)
      click(byId('track-menu-button-t1'));
      const removeFromPlBtn = [...host.querySelectorAll<HTMLButtonElement>('[data-track-menu] button')].find(
        (b) => b.textContent?.includes('Remove from Playlist')
      );
      click(removeFromPlBtn ?? null);
      expect(calls.removeTrackFromPlaylist).toHaveBeenCalledWith('p1', '', 0);

      // Reorder Down on row 0 invokes reorderPlaylistTracks('p1', 0, 1)
      const moveDownBtn = byId('track-row-t1')?.querySelector<HTMLButtonElement>('button[title="Move down"]');
      click(moveDownBtn ?? null);
      expect(calls.reorderPlaylistTracks).toHaveBeenCalledWith('p1', 0, 1);

      // Unavailable track preserves placeholder badge & safe Favourite / Remove from Playlist actions
      expect(byId('track-row-tOffline')?.textContent).toContain('Cannot access file');
      expect((byId('track-favourite-tOffline') as HTMLButtonElement).disabled).toBe(false);
    });
  });
  it('removes recovered playlist entries by their original saved IDs in bulk', () => {
    const current = { ...makeTrack('new:Parent/Song.mp3', 'Song', 180), relativePath: 'Parent/Song.mp3' };
    mockTracks = [current];
    initialPlaylists = [makePlaylist('p1', 'Recovered', ['old:Song.mp3', 'old:Song.mp3'])];
    initialSelectedPlaylistId = 'p1';
    mountApp();
    click(byId('toggle-select-mode'));
    click(byId('track-checkbox-new:Parent/Song.mp3'));
    const remove = [...host.querySelectorAll<HTMLButtonElement>('[data-testid="bulk-action-toolbar"] button')]
      .find(button => button.title === 'Remove from Playlist');
    click(remove ?? null);
    expect(calls.removeTracksFromPlaylist).toHaveBeenCalledWith('p1', ['old:Song.mp3', 'old:Song.mp3']);
  });

});
