// @vitest-environment jsdom
import { act, useMemo, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from '../src/components/Header';
import { LibraryContent, LibraryContentProps } from '../src/components/LibraryContent';
import { TrackListLayoutSlots } from '../src/components/TrackList';
import { LightStyle, Theme } from '../src/hooks/useTheme';
import { LibraryView, MusicLibrary, TrackItem } from '../src/types/music';
import { deriveDisplayedTracks } from '../src/utils/libraryAggregation';

const track = (id: string, title: string, overrides: Partial<TrackItem> = {}): TrackItem => ({
  id, name: `${title}.mp3`, relativePath: `${title}.mp3`, size: 100, lastModified: 1,
  status: 'normal', metadata: { title, artist: 'Artist', album: 'Album', duration: 180, isMetadataLoaded: true }, ...overrides,
});
const tracks = [track('a', 'Alpha'), track('b', 'Beta'), track('c', 'Gamma')];
const noop = () => {};
const calls = {
  playQueue: vi.fn(), addToQueue: vi.fn(), playNextBulk: vi.fn(), addFavourites: vi.fn(),
  theme: vi.fn(), lightStyle: vi.fn(), shortcuts: vi.fn(), playTrack: vi.fn(),
};

interface HarnessProps {
  items?: TrackItem[];
  view?: LibraryView;
  loading?: boolean;
  emptyLibrary?: boolean;
}

function Harness({ items = tracks, view = 'all', loading = false, emptyLibrary = false }: HarnessProps) {
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState<Theme>('light');
  const [lightStyle, setLightStyle] = useState<LightStyle>('warm');
  const musicLibrary = useMemo<MusicLibrary | null>(() => emptyLibrary ? null : ({
    id: 'library', name: 'Library', sourceType: 'files', flatPlaylist: items, folders: [],
    tree: { id: '', name: 'Library', relativePath: '', tracks: items, subfolders: [], totalTrackCount: items.length },
  }), [items, emptyLibrary]);
  const displayedTracks = useMemo(() => deriveDisplayedTracks({
    library: musicLibrary, currentView: view, currentFolderNode: musicLibrary?.tree ?? null,
    selectedArtistName: null, selectedAlbumId: null, albums: [], favouriteTracks: items, searchQuery: query,
  }), [musicLibrary, view, items, query]);
  const library = {
    library: musicLibrary, currentView: view, isLoading: loading, scanProgress: 0,
    searchQuery: query, displayedTracks, currentFolderNode: musicLibrary?.tree,
    albums: [], artists: [], favourites: new Set<string>(),
    toggleFavourite: noop, addTracksToFavourites: calls.addFavourites,
    removeTracksFromFavourites: noop, selectFolder: noop, selectAlbum: noop, selectArtist: noop,
    openFolderPicker: noop, openFilesPicker: noop, handleFallbackFolderSelect: noop, handleOpenFilesSelect: noop,
  } as unknown as LibraryContentProps['library'];
  const playlists = { playlists: [], selectedPlaylistId: null, createPlaylist: noop } as unknown as LibraryContentProps['playlists'];
  const audioPlayer = {
    isPlaying: false, currentTrack: null, playQueue: calls.playQueue, playTrack: calls.playTrack,
    togglePlay: noop, addToQueue: calls.addToQueue, playNextBulk: calls.playNextBulk,
  } as unknown as LibraryContentProps['audioPlayer'];
  const layout = ({ actions, content }: TrackListLayoutSlots) => <>
    <Header title="All Tracks" subtitle={`${displayedTracks.length} tracks`} searchQuery={query}
      theme={theme} lightStyle={lightStyle} actions={actions} onSearchChange={setQuery}
      onSelectTheme={(value) => { calls.theme(value); setTheme(value); }}
      onSelectLightStyle={(value) => { calls.lightStyle(value); setLightStyle(value); }}
      onOpenShortcutsModal={calls.shortcuts} />
    <div data-testid="scroll-content" className="flex-1 min-h-0 overflow-y-auto">{content}</div>
  </>;
  return <LibraryContent library={library} playlists={playlists} audioPlayer={audioPlayer}
    renderAllTracksLayout={layout} />;
}

let host: HTMLDivElement;
let root: Root;
const byId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const toggle = () => byId('toggle-select-mode');
const selectedCount = () => byId('bulk-action-toolbar')?.textContent?.match(/\d+ selected/)?.[0] ?? null;
const row = (title: string) => [...host.querySelectorAll<HTMLElement>('[data-testid^="track-row-"]')]
  .find((element) => element.textContent?.includes(title))!;
const click = (element: Element, options: MouseEventInit = {}) => act(() => {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, ...options }));
});
const key = (value: string, options: KeyboardEventInit = {}) => act(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, ...options }));
});
function search(value: string) {
  const input = host.querySelector('input')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});
const mount = (props: HarnessProps = {}) => act(() => root.render(<Harness {...props} />));

describe('Unified All Tracks header', () => {
  it('renders one pair of actions inside the header, separate from the table scroll area', () => {
    mount();
    expect(host.querySelectorAll('[data-testid="play-all-button"]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-testid="toggle-select-mode"]')).toHaveLength(1);
    expect(byId('play-all-button').closest('header')).not.toBeNull();
    expect(toggle().closest('header')).not.toBeNull();
    expect(byId('tracklist-toolbar')).toBeNull();
    expect(byId('scroll-content').querySelector('header')).toBeNull();
    expect(byId('scroll-content').textContent).toContain('TitleAlbum');
    expect(row('Alpha')).toBeDefined();
  });

  it('uses the actual list mode and clears selections and range anchor on Done', () => {
    mount();
    click(toggle());
    expect(toggle().textContent).toContain('Done');
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    click(byId('track-checkbox-a'));
    expect(selectedCount()).toBe('1 selected');
    click(toggle());
    expect(toggle().textContent).toContain('Select');
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(selectedCount()).toBeNull();
    click(row('Gamma'), { shiftKey: true });
    expect(selectedCount()).toBe('1 selected');
    expect(calls.playTrack).not.toHaveBeenCalled();
  });

  it('preserves individual checkboxes, Select All, modifier ranges and Escape', () => {
    mount();
    click(toggle());
    click(byId('track-checkbox-a'));
    click(host.querySelector('[aria-label="Select all"]')!);
    expect(selectedCount()).toBe('3 selected');
    click(host.querySelector('[aria-label="Select all"]')!);
    expect(selectedCount()).toBeNull();
    click(toggle());
    click(row('Alpha'), { metaKey: true });
    click(row('Beta'), { ctrlKey: true });
    expect(selectedCount()).toBe('2 selected');
    click(row('Gamma'), { shiftKey: true });
    expect(selectedCount()).toBe('3 selected');
    key('Escape');
    expect(selectedCount()).toBeNull();
    click(toggle());
    key('a', { ctrlKey: true });
    expect(selectedCount()).toBe('3 selected');
    key('Escape');
    key('Escape');
    expect(toggle().textContent).toContain('Select');
  });

  it('reconciles search selection without remounting the list, header or scroll area', () => {
    mount();
    click(toggle());
    key('a', { metaKey: true });
    const scroller = byId('scroll-content');
    const header = host.querySelector('header');
    const input = host.querySelector('input');
    scroller.scrollTop = 80;
    search('Alpha');
    expect(selectedCount()).toBe('1 selected');
    expect(row('Beta')).toBeUndefined();
    expect(toggle().textContent).toContain('Done');
    expect(byId('scroll-content')).toBe(scroller);
    expect(scroller.scrollTop).toBe(80);
    expect(host.querySelector('header')).toBe(header);
    expect(host.querySelector('input')).toBe(input);
    search('no matches');
    expect(byId('play-all-button').hasAttribute('disabled')).toBe(true);
    expect(toggle().hasAttribute('disabled')).toBe(false);
    expect(toggle().textContent).toContain('Done');
    click(toggle());
    expect(toggle().textContent).toContain('Select');
    click(host.querySelector('[aria-label="Clear search"]')!);
    expect(row('Alpha')).toBeDefined();
    expect(selectedCount()).toBeNull();
  });

  it('plays the latest filtered order once, excluding unavailable tracks and logical duplicates', () => {
    const beta = track('b', 'Keep Beta');
    const alpha = track('a', 'Keep Alpha');
    mount({ items: [beta, track('bad', 'Keep Bad', { status: 'unreadable' }),
      track('empty', 'Keep Empty', { status: 'empty' }),
      track('unsupported', 'Keep Unsupported', { status: 'unsupported' }), alpha,
      track('alias', 'Keep Alias', { aliases: ['a'] }), track('other', 'Other')] });
    search('Keep');
    click(byId('play-all-button'));
    expect(calls.playQueue).toHaveBeenCalledExactlyOnceWith([beta, alpha]);
    search('Beta');
    click(byId('play-all-button'));
    expect(calls.playQueue).toHaveBeenLastCalledWith([beta]);
    search('Bad');
    click(byId('play-all-button'));
    expect(calls.playQueue).toHaveBeenCalledTimes(2);
    expect(byId('play-all-button').hasAttribute('disabled')).toBe(true);
  });

  it.each([{ loading: true }, { emptyLibrary: true }, { items: [] }])(
    'keeps search, settings and disabled actions in unavailable state %j', (props) => {
      mount(props);
      expect(host.querySelector('header')).not.toBeNull();
      expect(host.querySelector('input')).not.toBeNull();
      expect(byId('play-all-button').hasAttribute('disabled')).toBe(true);
      expect(toggle().hasAttribute('disabled')).toBe(true);
      expect(host.textContent).toContain(props.loading ? 'Scanning local library' : 'Your Music');
      search('anything');
      expect(host.querySelector('input')?.value).toBe('anything');
      click(byId('appearance-menu-button'));
      expect(byId('appearance-popover')).not.toBeNull();
    },
  );

  it('preserves bulk callbacks and clears selection after each action', () => {
    mount();
    click(toggle());
    click(byId('track-checkbox-a'));
    click(byId('bulk-add-queue'));
    expect(calls.addToQueue).toHaveBeenCalledExactlyOnceWith([tracks[0]]);
    expect(selectedCount()).toBeNull();
    click(byId('track-checkbox-b'));
    click(byId('bulk-play-next'));
    expect(calls.playNextBulk).toHaveBeenCalledExactlyOnceWith([tracks[1]]);
    click(byId('track-checkbox-c'));
    click(byId('bulk-toggle-favourites'));
    expect(calls.addFavourites).toHaveBeenCalledExactlyOnceWith([tracks[2]]);
    expect(selectedCount()).toBeNull();
  });

  it('updates the same header from touch long-press selection', () => {
    vi.useFakeTimers();
    mount();
    act(() => {
      const event = new Event('touchstart', { bubbles: true });
      Object.defineProperty(event, 'touches', { value: [{ clientX: 0, clientY: 0 }] });
      row('Alpha').dispatchEvent(event);
      vi.advanceTimersByTime(500);
    });
    expect(toggle().textContent).toContain('Done');
    expect(selectedCount()).toBe('1 selected');
    act(() => row('Alpha').dispatchEvent(new Event('touchend', { bubbles: true })));
    click(toggle());
    expect(selectedCount()).toBeNull();
  });

  it('preserves appearance callbacks and dismissal by Escape, outside click and shortcut entry', () => {
    mount();
    click(byId('appearance-menu-button'));
    click(byId('light-style-mist'));
    expect(calls.lightStyle).toHaveBeenCalledWith('mist');
    click(byId('theme-dark-button'));
    expect(calls.theme).toHaveBeenCalledWith('dark');
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(byId('appearance-popover')).toBeNull();
    click(byId('appearance-menu-button'));
    act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(byId('appearance-popover')).toBeNull();
    click(byId('appearance-menu-button'));
    click(byId('keyboard-shortcuts-menu-button'));
    expect(calls.shortcuts).toHaveBeenCalledOnce();
    expect(byId('appearance-popover')).toBeNull();
  });

  it('keeps folder overview actions outside the unified header', () => {
    mount({ view: 'folder' });
    expect(host.querySelector('header')).toBeNull();
    expect(byId('tracklist-toolbar')).not.toBeNull();
    expect(byId('play-all-button').closest('[data-testid="tracklist-toolbar"]')).not.toBeNull();
  });
});
