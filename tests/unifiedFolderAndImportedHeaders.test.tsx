// @vitest-environment jsdom
import { act, useMemo, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { FolderView } from '../src/components/FolderView';
import { Header } from '../src/components/Header';
import { TrackListLayoutSlots } from '../src/components/TrackList';
import {
  FileStatus,
  FolderNode,
  IMPORTED_FILES_ROOT_ID,
  ImportedFolder,
  LibraryView,
  MusicLibrary,
  TrackItem,
} from '../src/types/music';
import {
  buildFolderTree,
  buildUnifiedMultiFolderTree,
  combineFlatPlaylists,
  findFolderNodeByPath,
} from '../src/utils/musicTree';
import { deriveDisplayedTracks } from '../src/utils/libraryAggregation';

const noop = () => {};
const calls = {
  playQueue: vi.fn(),
  playTrack: vi.fn(),
  removeImportedFiles: vi.fn(),
  addToQueue: vi.fn(),
};

let initialView: LibraryView = 'folder';
let initialFolderPath = '';
let mockLibraryData: MusicLibrary | null = null;

function createTrack(
  id: string,
  name: string,
  relativePath = name,
  status: FileStatus = 'normal',
  aliases?: string[]
): TrackItem {
  return {
    id,
    name,
    relativePath,
    size: 1024,
    lastModified: 1000,
    status,
    aliases,
    metadata: {
      title: name.replace(/\.[^.]+$/, ''),
      artist: 'Artist',
      album: 'Album',
      duration: 180,
      isMetadataLoaded: true,
    },
  };
}

function createFolder(id: string, name: string, tracks: TrackItem[]): ImportedFolder {
  const tree = buildFolderTree(name, tracks, id);
  return {
    id,
    name,
    sourceType: id === IMPORTED_FILES_ROOT_ID ? 'files' : 'fs-access',
    tree,
    tracks,
    trackCount: tracks.length,
    addedAt: 1,
    lastScannedAt: 1,
    permissionStatus: 'granted',
  };
}

function createLibrary(folders: ImportedFolder[]): MusicLibrary {
  return {
    id: 'multi',
    name: 'Music Library',
    sourceType: 'fs-access',
    folders,
    tree: buildUnifiedMultiFolderTree(folders),
    flatPlaylist: combineFlatPlaylists(folders),
  };
}

vi.mock('../src/hooks/useMusicLibrary', () => ({
  useMusicLibrary: () => {
    const [currentView, setCurrentView] = useState<LibraryView>(initialView);
    const [selectedFolderPath, setSelectedFolderPath] = useState<string>(initialFolderPath);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const currentFolderNode = useMemo<FolderNode | null>(
      () => (mockLibraryData ? findFolderNodeByPath(mockLibraryData.tree, selectedFolderPath) : null),
      [selectedFolderPath]
    );
    const displayedTracks = useMemo(
      () =>
        deriveDisplayedTracks({
          library: mockLibraryData,
          currentView,
          currentFolderNode,
          selectedArtistName: null,
          selectedAlbumId: null,
          albums: [],
          favouriteTracks: [],
          searchQuery,
        }),
      [currentView, currentFolderNode, searchQuery]
    );
    return {
      library: mockLibraryData,
      folders: mockLibraryData?.folders ?? [],
      isLoading: false,
      isInitialized: true,
      hasRegisteredSources: Boolean(mockLibraryData?.folders.length),
      needsPermission: false,
      scanProgress: 0,
      currentView,
      selectedFolderPath,
      selectedArtistName: null,
      selectedAlbumId: null,
      searchQuery,
      currentFolderNode,
      displayedTracks,
      albums: [],
      artists: [],
      favourites: new Set<string>(),
      favouritesCount: 0,
      lastSourceRemoval: null,
      setCurrentView,
      selectFolder: (path: string) => {
        setSelectedFolderPath(path);
        setCurrentView('folder');
      },
      selectArtist: noop,
      selectAlbum: noop,
      setSearchQuery,
      toggleFavourite: noop,
      addTracksToFavourites: noop,
      removeTracksFromFavourites: noop,
      removeImportedFiles: calls.removeImportedFiles,
      removeAllImportedFiles: noop,
      openFolderPicker: noop,
      openFilesPicker: noop,
      refreshFolder: noop,
      removeFolder: noop,
      requestPermissionForFolder: noop,
      requestPermissionAndLoad: noop,
      handleFallbackFolderSelect: noop,
      handleOpenFilesSelect: noop,
      updateTrackStatus: noop,
      updateTrackMetadata: noop,
      requestTrackArtwork: noop,
    };
  },
}));

vi.mock('../src/hooks/usePlaylists', () => ({
  usePlaylists: () => ({
    playlists: [],
    selectedPlaylistId: null,
    selectPlaylist: noop,
    createPlaylist: noop,
    renamePlaylist: noop,
    deletePlaylist: noop,
    addTrackToPlaylist: () => true,
    addTracksToPlaylist: () => ({ addedCount: 0 }),
    removeTrackFromPlaylist: noop,
    removeTracksFromPlaylist: noop,
    reorderPlaylistTracks: noop,
    saveQueueAsPlaylist: noop,
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
    clearPlaybackError: noop,
    lyrics: [],
    ambientColors: { primary: '#6366f1', glow: '#4f46e5' },
    queue: [],
    playTrack: calls.playTrack,
    playQueueTrack: noop,
    playQueue: calls.playQueue,
    playNext: noop,
    playNextBulk: noop,
    addToQueue: calls.addToQueue,
    removeFromQueue: noop,
    removeTracksFromQueue: () => 0,
    clearQueue: noop,
    reorderQueue: noop,
    togglePlay: noop,
    nextTrack: noop,
    prevTrack: noop,
    seekTo: noop,
    seekRelative: noop,
    changeVolume: noop,
    adjustVolume: noop,
    toggleMute: noop,
    cycleRepeatMode: noop,
    toggleShuffle: noop,
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
  initialView = 'folder';
  initialFolderPath = '';
  mockLibraryData = null;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mountApp = () => act(() => root.render(<App />));

describe('Phase 2: Unified Folder Detail & Imported Files Headers', () => {
  describe('1. Folder Detail Unified Header, Play All & Selection Reset', () => {
    it('places Breadcrumb, direct track count, Play All and Select inside one main Header with no duplicate toolbar', () => {
      const t1 = createTrack('f1:Direct1.mp3', 'Direct1.mp3');
      const t2 = createTrack('f1:Direct2.mp3', 'Direct2.mp3');
      const tUnavail = createTrack('f1:Broken.mp3', 'Broken.mp3', 'Broken.mp3', 'unreadable');
      const tChild = createTrack('f1:Sub/Child.mp3', 'Child.mp3', 'Sub/Child.mp3');
      const folderA = createFolder('f1', 'hot-2026.11.19', [t1, t2, tUnavail, tChild]);
      const folderB = createFolder('f2', 'mp3', [createTrack('f2:Other.mp3', 'Other.mp3')]);
      mockLibraryData = createLibrary([folderA, folderB]);
      initialView = 'folder';
      initialFolderPath = 'f1';

      mountApp();

      const header = host.querySelector('main > header');
      expect(header).not.toBeNull();
      expect(header!.querySelector('[data-testid="folder-breadcrumb"]')?.textContent).toContain('hot-2026.11.19');
      expect(header!.querySelector('[data-testid="header-subtitle"]')?.textContent).toBe('3 tracks');
      expect(host.querySelectorAll('[data-testid="play-all-button"]')).toHaveLength(1);
      expect(host.querySelectorAll('[data-testid="toggle-select-mode"]')).toHaveLength(1);
      expect(byId('play-all-button')?.closest('header')).toBe(header);
      expect(byId('toggle-select-mode')?.closest('header')).toBe(header);
      expect(byId('tracklist-toolbar')).toBeNull();

      // Single scroll container below header; subfolder cards appear above table headings
      const mainScroll = host.querySelector('main > div.overflow-y-auto');
      expect(mainScroll).not.toBeNull();
      expect(mainScroll!.querySelector('header')).toBeNull();
      const html = mainScroll!.innerHTML;
      expect(html.indexOf('data-testid="folder-subfolders-section"')).toBeLessThan(html.indexOf('Title'));

      // Folder Detail Play All plays ONLY playable direct tracks (excludes unreadable & child subfolder track)
      click(byId('play-all-button'));
      expect(calls.playQueue).toHaveBeenCalledExactlyOnceWith([t1, t2], 0, false);

      // Select mode works inside Folder A, then resets when navigating to Folder B
      click(byId('toggle-select-mode'));
      expect(byId('toggle-select-mode')?.textContent).toContain('Done');
      click(byId('track-checkbox-f1:Direct1.mp3'));
      expect(byId('bulk-action-toolbar')?.textContent).toContain('1 selected');

      // Navigate to Folder B via Sidebar -> selection and Select mode reset cleanly
      click(host.querySelector('[data-testid="root-folder-f2"] [role="button"]'));
      expect(byId('folder-breadcrumb')?.textContent).toContain('mp3');
      expect(byId('header-subtitle')?.textContent).toBe('1 track');
      expect(byId('toggle-select-mode')?.textContent).toContain('Select');
      expect(byId('bulk-action-toolbar')).toBeNull();

      // Navigate back to Music Folders Overview via parent breadcrumb -> overview has no Play All / Select
      click(host.querySelector('[data-testid="folder-breadcrumb"] button'));
      expect(byId('header-subtitle')?.textContent).toBe('2 folders · 5 tracks');
      expect(byId('play-all-button')).toBeNull();
      expect(byId('toggle-select-mode')).toBeNull();
    });

    it('handles subfolder-only (0 direct tracks), completely empty folder, and missing currentNode without duplicate headers', () => {
      const onlyChildTrack = createTrack('f1:Sub/Only.mp3', 'Only.mp3', 'Sub/Only.mp3');
      const folderSubOnly = createFolder('f1', 'ParentOnly', [onlyChildTrack]);
      const emptyFolder = createFolder('f2', 'EmptyDir', []);
      mockLibraryData = createLibrary([folderSubOnly, emptyFolder]);
      initialView = 'folder';
      initialFolderPath = 'f1';

      mountApp();

      // Subfolders-only folder: unified header shows 0 tracks + disabled Play All / Select, cards visible, NO table headings or legacy toolbar
      expect(host.querySelectorAll('main > header')).toHaveLength(1);
      expect(byId('header-subtitle')?.textContent).toBe('0 tracks');
      expect((byId('play-all-button') as HTMLButtonElement).disabled).toBe(true);
      expect((byId('toggle-select-mode') as HTMLButtonElement).disabled).toBe(true);
      expect(byId('tracklist-toolbar')).toBeNull();
      expect(byId('folder-subfolders-section')?.textContent).toContain('Sub');
      expect(host.querySelector('main')?.textContent).not.toContain('ALBUM');

      // Navigate into nested subfolder -> breadcrumb updates and Play All enables
      click(byId('folder-card-f1/Sub'));
      expect(byId('folder-breadcrumb')?.textContent).toContain('ParentOnly');
      expect(byId('folder-breadcrumb')?.textContent).toContain('Sub');
      expect(byId('header-subtitle')?.textContent).toBe('1 track');
      expect((byId('play-all-button') as HTMLButtonElement).disabled).toBe(false);

      // Navigate to completely empty folder -> unified header + disabled actions + empty state
      click(host.querySelector('[data-testid="root-folder-f2"] [role="button"]'));
      expect(byId('header-subtitle')?.textContent).toBe('0 tracks');
      expect((byId('play-all-button') as HTMLButtonElement).disabled).toBe(true);
      expect((byId('toggle-select-mode') as HTMLButtonElement).disabled).toBe(true);
      expect(byId('tracklist-toolbar')).toBeNull();

      // Standalone FolderView with null currentNode and renderLayout -> renders header once with disabled actions
      const renderLayout = ({ actions, content }: TrackListLayoutSlots) => (
        <>
          <Header
            title="Folder"
            subtitle="0 tracks"
            actions={actions}
            searchQuery=""
            theme="light"
            lightStyle="warm"
            onSearchChange={noop}
            onOpenShortcutsModal={noop}
            onSelectTheme={noop}
            onSelectLightStyle={noop}
          />
          <div data-testid="fallback-scroll">{content}</div>
        </>
      );
      act(() =>
        root.render(
          <FolderView
            currentNode={null}
            isFolderOverview={false}
            renderLayout={renderLayout}
            isPlaying={false}
            favourites={new Set()}
            onSelectFolder={noop}
            onPlayTrack={noop}
            onTogglePlay={noop}
            onToggleFavourite={noop}
          />
        )
      );
      expect(host.querySelectorAll('header')).toHaveLength(1);
      expect((byId('play-all-button') as HTMLButtonElement).disabled).toBe(true);
      expect((byId('toggle-select-mode') as HTMLButtonElement).disabled).toBe(true);
      expect(byId('fallback-scroll')?.textContent).toContain('No folder selected');
    });
  });

  describe('2. Imported Files Unified Header, Search, Play All & Bulk Removal', () => {
    it('renders Imported Files title, count, Play All and Select in one Header and preserves search & removal', () => {
      const imp1 = createTrack('imp:1', 'Lemon Tree.mp3');
      const imp2 = createTrack('imp:2', 'EyesOnMe.mp3');
      const physical = createFolder('f1', 'mp3', [createTrack('f1:Other.mp3', 'Other.mp3')]);
      const imported = createFolder(IMPORTED_FILES_ROOT_ID, 'Imported Files', [imp1, imp2]);
      mockLibraryData = createLibrary([physical, imported]);
      initialView = 'imported-files';
      initialFolderPath = '';

      mountApp();

      const header = host.querySelector('main > header');
      expect(header).not.toBeNull();
      expect(header!.querySelector('h1')?.textContent).toBe('Imported Files');
      expect(header!.querySelector('[data-testid="header-subtitle"]')?.textContent).toBe('2 tracks');
      expect(host.querySelectorAll('[data-testid="play-all-button"]')).toHaveLength(1);
      expect(host.querySelectorAll('[data-testid="toggle-select-mode"]')).toHaveLength(1);
      expect(byId('play-all-button')?.closest('header')).toBe(header);
      expect(byId('toggle-select-mode')?.closest('header')).toBe(header);
      expect(byId('tracklist-toolbar')).toBeNull();

      // Play All operates ONLY on Imported Files tracks (not physical folder tracks)
      click(byId('play-all-button'));
      expect(calls.playQueue).toHaveBeenCalledExactlyOnceWith([imp1, imp2], 0, false);

      // Search filters Imported Files and updates header count
      typeSearch('Lemon');
      expect(byId('header-subtitle')?.textContent).toBe('1 track');
      click(byId('play-all-button'));
      expect(calls.playQueue).toHaveBeenLastCalledWith([imp1], 0, false);
      typeSearch('');

      // Select & Bulk Remove invokes removeImportedFiles with selected track IDs
      click(byId('toggle-select-mode'));
      click(byId('track-checkbox-imp:2'));
      expect(byId('bulk-action-toolbar')?.textContent).toContain('1 selected');
      const removeBtn = [...host.querySelectorAll<HTMLButtonElement>('[data-testid="bulk-action-toolbar"] button')].find(
        (btn) => btn.textContent?.includes('Remove')
      );
      click(removeBtn ?? null);
      expect(calls.removeImportedFiles).toHaveBeenCalledExactlyOnceWith(['imp:2']);
    });

    it('keeps unified Header with disabled actions when Imported Files is empty', () => {
      const physical = createFolder('f1', 'mp3', [createTrack('f1:Other.mp3', 'Other.mp3')]);
      mockLibraryData = createLibrary([physical]);
      initialView = 'imported-files';
      initialFolderPath = '';

      mountApp();

      expect(host.querySelectorAll('main > header')).toHaveLength(1);
      expect(byId('header-subtitle')?.textContent).toBe('0 tracks');
      expect((byId('play-all-button') as HTMLButtonElement).disabled).toBe(true);
      expect((byId('toggle-select-mode') as HTMLButtonElement).disabled).toBe(true);
      expect(byId('tracklist-toolbar')).toBeNull();
      expect(host.querySelector('main')?.textContent).toContain('No imported files found.');
    });
  });
});
