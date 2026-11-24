// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { FolderView } from '../src/components/FolderView';
import { ImportedFolder, LibraryView, MusicLibrary, TrackItem, IMPORTED_FILES_ROOT_ID } from '../src/types/music';
import { buildFolderTree, buildUnifiedMultiFolderTree, combineFlatPlaylists, findFolderNodeByPath } from '../src/utils/musicTree';
import { deriveDisplayedTracks } from '../src/utils/libraryAggregation';
import { useMusicLibrary } from '../src/hooks/useMusicLibrary';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';
import { usePlaylists } from '../src/hooks/usePlaylists';

vi.mock('../src/hooks/useMusicLibrary', () => ({ useMusicLibrary: () => useTestLibrary() }));
vi.mock('../src/hooks/useAudioPlayer', () => ({ useAudioPlayer: () => player }));
vi.mock('../src/hooks/usePlaylists', () => ({ usePlaylists: () => playlists }));

const noop = () => {};
const favourites = new Set<string>();
let libraryData: MusicLibrary | null;
const player = {
  queue: [], currentTrack: null, isPlaying: false, volume: 0.8, currentTime: 0, duration: 0,
  isMuted: false, shuffle: false, repeatMode: 'off', lyrics: [], ambientColors: [],
  playQueue: vi.fn(), playTrack: vi.fn(), togglePlay: noop, clearPlaybackError: noop,
} as unknown as ReturnType<typeof useAudioPlayer>;
const playlists = { playlists: [], selectedPlaylistId: null, selectPlaylist: noop } as unknown as ReturnType<typeof usePlaylists>;

function useTestLibrary(): ReturnType<typeof useMusicLibrary> {
  const [currentView, setView] = useState<LibraryView>('folder');
  const [selectedFolderPath, setPath] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const currentFolderNode = libraryData ? findFolderNodeByPath(libraryData.tree, selectedFolderPath) : null;
  const displayedTracks = deriveDisplayedTracks({ library: libraryData, currentView, currentFolderNode,
    searchQuery, selectedAlbumId: null, selectedArtistName: null, albums: [], favouriteTracks: [] });
  return {
    library: libraryData, currentView, selectedFolderPath, searchQuery, currentFolderNode, displayedTracks,
    folders: libraryData?.folders ?? [], favourites, favouritesCount: 0, albums: [], artists: [],
    selectedAlbumId: null, selectedArtistName: null, isLoading: false, needsPermission: false,
    isInitialized: true, hasRegisteredSources: Boolean(libraryData?.folders.length), scanProgress: 0,
    setSearchQuery, setCurrentView: (view: LibraryView) => { setView(view); if (view !== 'folder') setPath(''); },
    selectFolder: (path: string) => { setPath(path); setView('folder'); }, requestTrackArtwork: noop,
    toggleFavourite: noop, addTracksToFavourites: noop, removeTracksFromFavourites: noop,
    openFolderPicker: noop, openFilesPicker: noop, handleFallbackFolderSelect: noop, handleOpenFilesSelect: noop,
  } as unknown as ReturnType<typeof useMusicLibrary>;
}

const track = (id: string, name = 'Song.mp3', relativePath = name): TrackItem => ({
  id, name, relativePath, size: 100, lastModified: 1, status: 'normal',
  metadata: { title: name, artist: 'Artist', album: 'Album', duration: 180, isMetadataLoaded: true },
});
const folder = (id: string, tracks: TrackItem[]): ImportedFolder => ({
  id, name: id, tracks, tree: buildFolderTree(id, tracks, id), trackCount: tracks.length,
  sourceType: 'fs-access', addedAt: 1, lastScannedAt: 1, permissionStatus: 'granted',
});
function library(folders: ImportedFolder[]): MusicLibrary {
  return { id: 'library', name: 'Music Library', sourceType: 'fs-access', folders,
    tree: buildUnifiedMultiFolderTree(folders), flatPlaylist: combineFlatPlaylists(folders) };
}
let host: HTMLDivElement;
let root: Root;
const byId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const click = (element: HTMLElement) => act(() => element.click());
const mount = () => act(() => root.render(<App />));
function search(value: string) {
  const input = host.querySelector<HTMLInputElement>('header input')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // These stores belong exclusively to the isolated jsdom document.
  sessionStorage.clear(); localStorage.clear(); vi.clearAllMocks(); libraryData = null;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('Music Folders summary in the actual App composition', () => {
  it('counts 363 canonical tracks once in the header and preserves the three card counts', () => {
    libraryData = library([16, 319, 28].map((count, n) => folder(`Folder ${n + 1}`,
      Array.from({ length: count }, (_, i) => track(`${n}:${i}`, `Song ${i}.mp3`)))));
    expect(libraryData.tree.tracks).toHaveLength(0);
    mount();
    expect(host.querySelector('main h1')?.textContent).toBe('Music Folders');
    expect(byId('header-subtitle').textContent).toBe('3 folders · 363 tracks');
    expect(host.querySelector('main')?.textContent?.match(/363 tracks/g)).toHaveLength(1);
    expect(byId('tracklist-toolbar')).toBeNull(); expect(byId('tracklist-count')).toBeNull();
    const cards = byId('folder-subfolders-section').textContent;
    for (const count of [16, 319, 28]) expect(cards).toContain(`${count} tracks`);
  });

  it('uses canonical Library length rather than overlapping card totals', () => {
    const shared = track('parent:Shared.mp3');
    const alias = { ...track('child:Shared.mp3'), aliases: ['parent:Shared.mp3'] };
    libraryData = library([folder('Parent', [shared, track('parent:Other.mp3')]), folder('Child', [alias])]);
    expect(libraryData.tree.totalTrackCount).toBe(3);
    expect(libraryData.flatPlaylist).toHaveLength(2);
    mount(); expect(byId('header-subtitle').textContent).toBe('2 folders · 2 tracks');
  });

  it('keeps identical filenames from distinct track identities separate', () => {
    libraryData = library([folder('A', [track('a:same.mp3')]), folder('B', [track('b:same.mp3')])]);
    mount(); expect(byId('header-subtitle').textContent).toBe('2 folders · 2 tracks');
  });

  it('shows Music Folders and zero for an empty Library', () => {
    mount(); expect(host.querySelector('main h1')?.textContent).toBe('Music Folders');
    expect(byId('header-subtitle').textContent).toBe('0 folders · 0 tracks');
    expect(host.querySelector('main')?.textContent).toContain('Your Music');
  });

  it('refreshes the derived count and cards as Library folders are added and removed', () => {
    const a = folder('A', [track('a:1')]); const b = folder('B', [track('b:1'), track('b:2')]);
    libraryData = library([a]); mount(); expect(byId('header-subtitle').textContent).toBe('1 folder · 1 track');
    libraryData = library([a, b]); mount(); expect(byId('header-subtitle').textContent).toBe('2 folders · 3 tracks');
    expect(byId('folder-subfolders-section').textContent).toContain('B');
    libraryData = library([b]); mount(); expect(byId('header-subtitle').textContent).toBe('1 folder · 2 tracks');
    expect(byId('folder-subfolders-section').textContent).not.toContain('A');
  });

  it('filters overview collection cards by name and shows N of M collections while searching', () => {
    libraryData = library([folder('Rock Classics', [track('a:1', 'Alpha.mp3')]), folder('Jazz Club', [track('b:1', 'Beta.mp3')])]);
    mount();
    search('Rock');
    expect(host.querySelector('main h1')?.textContent).toBe('Search Results: "Rock"');
    expect(byId('header-subtitle').textContent).toBe('1 of 2 collections');
    expect(byId('folder-subfolders-section').textContent).toContain('Rock Classics');
    expect(byId('folder-subfolders-section').textContent).not.toContain('Jazz Club');
    search('no matches');
    expect(byId('header-subtitle').textContent).toBe('0 of 2 collections');
    expect(byId('folder-search-empty').textContent).toContain('No folders match');
    search('');
    expect(byId('header-subtitle').textContent).toBe('2 folders · 2 tracks');
    expect(byId('folder-subfolders-section').textContent).toContain('Rock Classics');
    expect(byId('folder-subfolders-section').textContent).toContain('Jazz Club');
  });

  it('preserves real folder detail counts, controls, descendant cards and breadcrumbs', () => {
    libraryData = library([folder('Root', [track('a:1', 'Direct.mp3'), track('a:2', 'Child.mp3', 'Disc/Child.mp3')])]);
    mount(); click(byId('folder-subfolders-section').querySelector<HTMLElement>('.group')!);
    expect(byId('folder-breadcrumb').textContent).toContain('Root');
    expect(byId('header-subtitle').textContent).toBe('1 folder · 2 tracks');
    expect(byId('tracklist-toolbar')).toBeNull();
    expect(byId('play-all-button').closest('header')).not.toBeNull();
    expect(byId('toggle-select-mode').closest('header')).not.toBeNull();
    expect(byId('folder-subfolders-section').textContent).toContain('Disc');
  });

  it('does not mistake an actual folder with an empty relative path for the overview', () => {
    const realFolder = buildFolderTree('Real Folder', [track('a:1', 'Child.mp3', 'Disc/Child.mp3')]);
    expect(realFolder.relativePath).toBe('');
    act(() => root.render(<FolderView currentNode={realFolder} isFolderOverview={false} isPlaying={false}
      favourites={favourites} onSelectFolder={noop} onPlayTrack={noop} onTogglePlay={noop} onToggleFavourite={noop} />));
    expect(byId('tracklist-count').textContent).toBe('0 tracks');
    expect(byId('folder-subfolders-section').textContent).toContain('1 track');
  });

  it('preserves All Tracks unified actions, search filtering and Favourites controls', () => {
    libraryData = library([folder('Root', [track('a:1', 'Alpha.mp3'), track('a:2', 'Beta.mp3')])]);
    mount();
    click([...host.querySelectorAll<HTMLButtonElement>('aside button')].find((b) => b.textContent?.startsWith('All Tracks'))!);
    expect(host.querySelector('header [data-testid="play-all-button"]')).not.toBeNull();
    expect(byId('tracklist-toolbar')).toBeNull();
    search('Alpha'); expect(byId('header-subtitle').textContent).toBe('1 track');
    click(byId('play-all-button'));
    expect(player.playQueue).toHaveBeenCalledExactlyOnceWith([libraryData.flatPlaylist[0]], 0);
    search('');
    click([...host.querySelectorAll<HTMLButtonElement>('aside button')].find((b) => b.textContent?.startsWith('Favourites'))!);
    expect(host.querySelector('main h1')?.textContent).toBe('Favourites');
    expect(host.querySelector('main')?.textContent).toContain('No favourite tracks yet');
  });

  it('shares source order and counts with Sidebar, with one sky Files card last', () => {
    const physical = [28, 16, 319].map((count, n) => ({
      ...folder(`root${n}`, Array.from({ length: count }, (_, i) => track(`${n}:${i}`, `Song ${i}.mp3`))),
      name: ['周杰伦', 'hot-2026.11.19', 'mp3'][n],
    }));
    const files = { ...folder(IMPORTED_FILES_ROOT_ID, [
      { ...track('alias0'), aliases: ['0:0'] }, { ...track('alias1'), aliases: ['1:0'] },
      track('imported:0'), track('imported:1'), track('imported:2'),
    ]), name: 'Imported Files', sourceType: 'files' as const };
    libraryData = library([physical[0], files, physical[1], physical[2]]);
    mount();
    expect(byId('header-subtitle').textContent).toBe('3 folders · 366 tracks');
    expect(byId('nav-badge-folders').textContent).toBe('3');
    const expected = ['root0', 'root1', 'root2', IMPORTED_FILES_ROOT_ID];
    const cardIds = () => [...byId('folder-subfolders-section').querySelectorAll('[data-testid^="folder-card-"]')]
      .map((card) => card.getAttribute('data-testid')!.replace('folder-card-', ''));
    expect(cardIds()).toEqual(expected);
    expect([...host.querySelectorAll('aside [data-testid^="root-folder-"], aside [data-testid="sidebar-imported-files"]')]
      .map((item) => item.getAttribute('data-testid')!.replace('root-folder-', '').replace('sidebar-imported-files', IMPORTED_FILES_ROOT_ID)))
      .toEqual(expected);
    const importedCard = byId(`folder-card-${IMPORTED_FILES_ROOT_ID}`);
    expect(importedCard.querySelector('.lucide-files')?.getAttribute('class')).toContain('text-sky-500 dark:text-sky-400');
    expect(byId('sidebar-imported-files').querySelector('.lucide-files')?.getAttribute('class')).toContain('text-sky-500 dark:text-sky-400');
    expect(importedCard.querySelector('.lucide-files')?.parentElement?.className).toContain('bg-sky-500/10');
    expect(importedCard.textContent).toContain('5 tracks');
    const ordinary = byId('folder-card-root0');
    expect(ordinary.querySelector('.lucide-folder')).not.toBeNull();
    expect(ordinary.querySelector('.lucide-files')).toBeNull();
    expect(host.querySelector('main')?.textContent?.match(/3 folders · 366 tracks/g)).toHaveLength(1);
    mount(); expect(cardIds()).toEqual(expected);
    libraryData = library([physical[0], files, physical[2]]); mount();
    expect(cardIds()).toEqual(['root0', 'root2', IMPORTED_FILES_ROOT_ID]);
    expect(byId('nav-badge-folders').textContent).toBe('2');
    expect(byId('header-subtitle').textContent).toMatch(/^2 folders · /);
    click(byId(`folder-card-${IMPORTED_FILES_ROOT_ID}`));
    expect(byId('folder-breadcrumb').textContent).toContain('Imported Files');
    expect(host.querySelector('h1')?.textContent).toBe('Imported Files');
    expect(byId('sidebar-imported-files').querySelector('[data-active]')?.getAttribute('data-active')).toBe('false');
  });

  it('does not apply the overview projection to nested folders or change card destinations', () => {
    const current = buildFolderTree('Root', [track('one', 'One.mp3', 'Z/One.mp3'), track('two', 'Two.mp3', 'A/Two.mp3')], 'root');
    const onSelect = vi.fn();
    act(() => root.render(<FolderView currentNode={current} isFolderOverview={false}
      overviewNodes={[folder('unrelated', []).tree]} isPlaying={false} favourites={favourites}
      onSelectFolder={onSelect} onPlayTrack={noop} onTogglePlay={noop} onToggleFavourite={noop} />));
    expect([...byId('folder-subfolders-section').querySelectorAll('[data-testid^="folder-card-"]')]
      .map((card) => card.getAttribute('data-testid'))).toEqual(['folder-card-root/A', 'folder-card-root/Z']);
    click(byId('folder-card-root/Z'));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(current.subfolders[1].relativePath);
    expect(byId('tracklist-count').textContent).toBe('0 tracks');
  });

  it('updates the document title from the root player state across playback transitions', () => {
    vi.useFakeTimers();
    const current = track('playing', 'Those Days With A Very Long Song Title.mp3');
    try {
      Object.assign(player, { currentTrack: current, isPlaying: true });
      mount();
      expect(document.title).toBe('Those Days With A Very Long Song Title');
      act(() => vi.advanceTimersByTime(1200));
      expect(document.title).toBe('Those Days With A Very Long Song Title');
      Object.assign(player, { isPlaying: false }); mount();
      expect(document.title).toBe('Those Days With A Very Long Song Title');
      Object.assign(player, { isPlaying: true }); mount();
      act(() => vi.advanceTimersByTime(10000));
      expect(document.title).toBe('Those Days With A Very Long Song Title');
      Object.assign(player, { currentTrack: track('next', '《七年的爱》.mp3') }); mount();
      expect(document.title).toBe('《七年的爱》');
      act(() => vi.advanceTimersByTime(10000));
      expect(document.title).toBe('《七年的爱》');
      Object.assign(player, { currentTrack: null, isPlaying: false }); mount();
      expect(document.title).toBe('Luna Music');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      Object.assign(player, { currentTrack: null, isPlaying: false });
      vi.useRealTimers();
    }
  });

  it('shows recursive folder totals at every navigation depth without changing overview or search semantics', () => {
    libraryData = library([folder('physical', [
      track('1', 'Song 1.mp3'), track('2', 'Song 2.mp3'),
      track('3', 'Song 3.mp3', 'A/Song 3.mp3'),
      track('4', 'Song 4.mp3', 'A/Nested/Song 4.mp3'),
      track('5', 'Song 5.mp3', 'A/Nested/Song 5.mp3'),
      track('6', 'Song 6.mp3', 'B/Song 6.mp3'),
    ])]);
    mount();
    expect(byId('header-subtitle').textContent).toBe('1 folder · 6 tracks');
    click(byId('folder-card-physical'));
    expect(byId('header-subtitle').textContent).toBe('2 folders · 6 tracks');
    expect(byId('folder-card-physical/A').textContent).toContain('3 tracks');
    click(byId('folder-card-physical/A'));
    expect(byId('header-subtitle').textContent).toBe('1 folder · 3 tracks');
    search('Song 3');
    expect(byId('header-subtitle').textContent).toBe('0 of 1 folder · 1 of 1 track');
    search('');
    expect(byId('header-subtitle').textContent).toBe('1 folder · 3 tracks');
    click(byId('folder-card-physical/A/Nested'));
    expect(byId('header-subtitle').textContent).toBe('2 tracks');
  });

  it('renders the reported six-child 433-track folder total from the canonical tree', () => {
    const tracks = [31, 16, 3, 319, 36, 28].flatMap((count, n) =>
      Array.from({ length: count }, (_, i) => track(`${n}:${i}`, `${i}.mp3`, `Child${n}/${i}.mp3`)));
    libraryData = library([{ ...folder('physical', tracks), name: '5.Musics' }]);
    mount(); click(byId('folder-card-physical'));
    expect(byId('header-subtitle').textContent).toBe('6 folders · 433 tracks');
    expect(byId('nav-badge-all').textContent).toBe('433');
  });

  it('toggles Now Playing from the button and empty space while preserving Library and playback state', () => {
    const current = track('current');
    libraryData = library([folder('physical', [current])]);
    Object.assign(player, { currentTrack: current, queue: [current], currentTime: 45, isPlaying: true });
    try {
      mount(); click(byId('folder-card-physical')); search('Song');
      click(byId('now-playing-toggle-button'));
      expect(byId('now-playing-toggle-button').getAttribute('aria-label')).toBe('Back to Library');
      click(byId('bottom-player'));
      expect(byId('folder-breadcrumb').textContent).toContain('physical');
      expect(host.querySelector<HTMLInputElement>('header input')?.value).toBe('Song');
      expect(player.currentTrack).toBe(current);
      expect(player.queue).toEqual([current]);
      expect(player.currentTime).toBe(45);
      expect(player.isPlaying).toBe(true);
      click(byId('bottom-player'));
      click(byId('now-playing-toggle-button'));
      expect(byId('folder-breadcrumb').textContent).toContain('physical');
      expect(player.playQueue).not.toHaveBeenCalled();
      expect(player.playTrack).not.toHaveBeenCalled();
    } finally {
      Object.assign(player, { currentTrack: null, queue: [], currentTime: 0, isPlaying: false });
    }
  });

});
