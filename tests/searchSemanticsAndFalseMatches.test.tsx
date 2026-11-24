// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AlbumGroup, ArtistGroup, FolderNode, Playlist, TrackItem, TrackMetadata } from '../src/types/music';
import {
  deriveSearchHeaderCounts,
  filterAlbumsByQuery,
  filterArtistsByQuery,
  filterPlaylistsByQuery,
  filterTracksByQuery,
  getSearchPlaceholder,
  getTrackDisplayTitle,
} from '../src/utils/librarySearch';
import { deriveViewHeaderInfo } from '../src/utils/libraryAggregation';
import { createUnavailableTrack } from '../src/utils/trackPlaceholders';
import { FolderView } from '../src/components/FolderView';
import { TrackRowLayout } from '../src/components/TrackRowLayout';
import { Header } from '../src/components/Header';

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
    relativePath: rest.relativePath ?? `mp3/${name}`,
    size: rest.size ?? 2048,
    lastModified: rest.lastModified ?? 1000,
    file: rest.file ?? ({ name } as File),
    status: rest.status ?? 'normal',
    ...rest,
    metadata: {
      title: metadata?.title ?? '',
      artist: metadata?.artist ?? 'Artist',
      album: metadata?.album ?? 'Album',
      duration: metadata?.duration ?? 180,
      isMetadataLoaded: metadata?.isMetadataLoaded ?? true,
      ...metadata,
    },
  };
}

function makeNode(id: string, name: string, tracks: TrackItem[] = [], subfolders: FolderNode[] = []): FolderNode {
  return {
    id,
    name,
    relativePath: id,
    tracks,
    subfolders,
    totalTrackCount: tracks.length + subfolders.reduce((s, f) => s + f.totalTrackCount, 0),
  };
}

const noop = () => {};

describe('Phase 5.1 Display Title Resolution & False-Match Guards', () => {
  it('resolves display & search titles cleanly across metadata, filename fallbacks, dots, CJK, and unavailable placeholders', () => {
    expect(getTrackDisplayTitle(makeTrack('1', { name: 'Sunrise.mp3', metadata: { title: '' } }))).toBe('Sunrise');
    expect(getTrackDisplayTitle(makeTrack('2', { name: 'Sunrise.mp3', metadata: { title: 'Morning Sun' } }))).toBe('Morning Sun');
    expect(getTrackDisplayTitle(makeTrack('3', { name: 'MP3.mp3', metadata: { title: '' } }))).toBe('MP3');
    expect(getTrackDisplayTitle(makeTrack('4', { name: 'Mr. Brightside.mp3', metadata: { title: '' } }))).toBe('Mr. Brightside');
    expect(getTrackDisplayTitle(makeTrack('5', { name: '3.14.flac', metadata: { title: '' } }))).toBe('3.14');
    expect(getTrackDisplayTitle(makeTrack('6', { name: 'Raw_Demo.flac', metadata: { title: '' } }))).toBe('Raw_Demo');
    expect(getTrackDisplayTitle(makeTrack('7', { name: '七年的爱.mp3', metadata: { title: '' } }))).toBe('七年的爱');

    // Explicit metadata.title containing a dot or extension that differs from raw filename stays authoritative
    expect(getTrackDisplayTitle(makeTrack('8', { name: 'track08.flac', metadata: { title: 'Version 2.0.mp3' } }))).toBe('Version 2.0.mp3');

    // Unavailable playlist placeholder whose saved name was a raw filename with extension
    const offline = createUnavailableTrack({ trackId: 'fsa_1:mp3/OfflineTrack.mp3', name: 'OfflineTrack.mp3' });
    expect(getTrackDisplayTitle(offline)).toBe('OfflineTrack');
  });

  it('Scenario A: searching "3" in Playlists Overview matches "333" and NOT "111" with 3 MP3 tracks', () => {
    const mp3Tracks = [
      makeTrack('t1', { name: 'a.mp3', metadata: { title: 'Alpha' } }),
      makeTrack('t2', { name: 'b.mp3', metadata: { title: 'Beta' } }),
      makeTrack('t3', { name: 'c.mp3', metadata: { title: 'Gamma' } }),
    ];
    const playlists: Playlist[] = [
      {
        id: 'p111',
        name: '111',
        tracks: mp3Tracks.map((t, i) => ({ trackId: t.id, name: t.name, addedAt: i + 1 })),
        createdAt: 1,
        updatedAt: 1,
      },
      { id: 'p333', name: '333', tracks: [], createdAt: 2, updatedAt: 2 },
    ];

    expect(filterPlaylistsByQuery(playlists, '3', mp3Tracks).map((p) => p.name)).toEqual(['333']);
    // Contained track title must not match unrelated playlist card
    expect(filterPlaylistsByQuery(playlists, 'Alpha', mp3Tracks)).toEqual([]);
    // Unavailable playlist reference must not introduce false match on "mp3" or "3"
    const withOffline: Playlist[] = [
      {
        id: 'pOff',
        name: 'Roadtrip',
        tracks: [{ trackId: 'fsa_1:mp3/Track3.mp3', name: 'Track3.mp3', addedAt: 1 }],
        createdAt: 3,
        updatedAt: 3,
      },
    ];
    expect(filterPlaylistsByQuery(withOffline, '3', [])).toEqual([]);
    expect(filterPlaylistsByQuery(withOffline, 'mp3', [])).toEqual([]);
  });

  it('Scenario B: searching "MP3" or "flac" does not match audio extensions or parent paths, while genuine "MP3" title matches', () => {
    const regularMp3 = makeTrack('t1', { name: 'Sunrise.mp3', relativePath: 'mp3/Sunrise.mp3', metadata: { title: 'Sunrise', artist: 'MP3 Band', album: 'MP3 Hits' } });
    const regularFlac = makeTrack('t2', { name: 'Raw_Demo.flac', relativePath: 'flac/Raw_Demo.flac', metadata: { title: '' } });
    const genuineMp3Title = makeTrack('t3', { name: 'song.ogg', relativePath: 'ogg/song.ogg', metadata: { title: 'MP3' } });
    const genuineMp3Fallback = makeTrack('t4', { name: 'MP3.mp3', relativePath: 'mp3/MP3.mp3', metadata: { title: '' } });
    const chineseTrack = makeTrack('t5', { name: '七年的爱.mp3', relativePath: 'mp3/七年的爱.mp3', metadata: { title: '七年的爱', artist: '周杰伦' } });

    const tracks = [regularMp3, regularFlac, genuineMp3Title, genuineMp3Fallback, chineseTrack];

    expect(filterTracksByQuery(tracks, 'MP3').map((t) => t.id)).toEqual(['t3', 't4']);
    expect(filterTracksByQuery(tracks, 'flac')).toEqual([]);
    expect(filterTracksByQuery(tracks, 'MP3 Band')).toEqual([]);
    expect(filterTracksByQuery(tracks, 'MP3 Hits')).toEqual([]);
    expect(filterTracksByQuery(tracks, '七年的爱').map((t) => t.id)).toEqual(['t5']);
    expect(filterTracksByQuery(tracks, '周杰伦')).toEqual([]);
    expect(filterTracksByQuery(tracks, '   ').length).toBe(5);
  });

  it('Albums and Artists Overviews match only their own display names', () => {
    const t1 = makeTrack('t1', { name: 'a.mp3', metadata: { title: 'Bohemian', artist: 'Queen', album: 'Night Opera' } });
    const albums: AlbumGroup[] = [{ id: 'a1', name: 'Night Opera', artist: 'Queen', tracks: [t1], totalDuration: 180 }];
    const artists: ArtistGroup[] = [{ id: 'ar1', name: 'Queen', tracks: [t1], albumCount: 1, totalDuration: 180 }];

    expect(filterAlbumsByQuery(albums, 'opera').map((a) => a.id)).toEqual(['a1']);
    expect(filterAlbumsByQuery(albums, 'Queen')).toEqual([]);
    expect(filterAlbumsByQuery(albums, 'Bohemian')).toEqual([]);
    expect(filterAlbumsByQuery(albums, 'mp3')).toEqual([]);

    expect(filterArtistsByQuery(artists, 'QUEEN').map((a) => a.id)).toEqual(['ar1']);
    expect(filterArtistsByQuery(artists, 'Bohemian')).toEqual([]);
    expect(filterArtistsByQuery(artists, 'Night Opera')).toEqual([]);
    expect(filterArtistsByQuery(artists, 'mp3')).toEqual([]);
  });

  it('derives accurate contextual Search placeholders for all 11 views', () => {
    expect(getSearchPlaceholder({ currentView: 'all', isFolderOverview: false })).toBe('Search song titles...');
    expect(getSearchPlaceholder({ currentView: 'imported-files', isFolderOverview: false })).toBe('Search song titles...');
    expect(getSearchPlaceholder({ currentView: 'favourites', isFolderOverview: false })).toBe('Search song titles...');
    expect(getSearchPlaceholder({ currentView: 'playlists', isFolderOverview: false, isPlaylistDetail: false })).toBe('Search playlists...');
    expect(getSearchPlaceholder({ currentView: 'playlists', isFolderOverview: false, isPlaylistDetail: true })).toBe('Search song titles...');
    expect(getSearchPlaceholder({ currentView: 'albums', isFolderOverview: false, isAlbumDetail: false })).toBe('Search albums...');
    expect(getSearchPlaceholder({ currentView: 'albums', isFolderOverview: false, isAlbumDetail: true })).toBe('Search song titles...');
    expect(getSearchPlaceholder({ currentView: 'artists', isFolderOverview: false, isArtistDetail: false })).toBe('Search artists...');
    expect(getSearchPlaceholder({ currentView: 'artists', isFolderOverview: false, isArtistDetail: true })).toBe('Search song titles...');
    expect(getSearchPlaceholder({ currentView: 'folder', isFolderOverview: true })).toBe('Search folders...');
    expect(getSearchPlaceholder({ currentView: 'folder', isFolderOverview: false, hasSubfolders: true })).toBe('Search folders and song titles...');
    expect(getSearchPlaceholder({ currentView: 'folder', isFolderOverview: false, hasSubfolders: false })).toBe('Search song titles...');
  });
});

describe('Phase 5.1 Folder Detail Mixed Search, Header Counts & TrackRow Rendering', () => {
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

  it('TrackRowLayout renders the exact extension-stripped display title matched by Search', () => {
    const track = makeTrack('t1', { name: 'Mr. Brightside.mp3', metadata: { title: '' } });
    act(() => {
      root.render(
        <TrackRowLayout track={track} isCurrent={false} leadingSlot={<span>1</span>} actionsSlot={<span />} />
      );
    });
    const titleSpan = host.querySelector('span[title="Mr. Brightside"]');
    expect(titleSpan?.textContent).toBe('Mr. Brightside');
    expect(host.textContent).not.toContain('Mr. Brightside.mp3');
  });

  it('Folder Detail filters direct songs and child folders independently with accurate mixed Header counts and empty states', () => {
    const tSun = makeTrack('t1', { name: 'Sunshine.mp3', metadata: { title: 'Sunshine' } });
    const tMoon = makeTrack('t2', { name: 'Moonlight.flac', metadata: { title: 'Moonlight' } });
    const subRock = makeNode('root/Rock', 'Rock');
    const subJazz = makeNode('root/Jazz', 'Jazz');
    const mixedFolder = makeNode('root', 'Music', [tSun, tMoon], [subRock, subJazz]);
    const onPlayQueue = vi.fn();

    const renderMixed = (q: string) =>
      act(() => {
        root.render(
          <FolderView
            currentNode={mixedFolder}
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

    // 1. Query matches only subfolder "Rock" -> shows Rock card, hides Jazz & songs, NO "No tracks found" message, disables Play All
    renderMixed('Rock');
    expect(host.querySelector('[data-testid="folder-subfolders-section"]')?.textContent).toContain('Rock');
    expect(host.querySelector('[data-testid="folder-subfolders-section"]')?.textContent).not.toContain('Jazz');
    expect(host.querySelectorAll('[data-testid^="track-row-"]').length).toBe(0);
    expect(host.textContent).not.toContain('No tracks found matching your search.');
    expect(host.querySelector<HTMLButtonElement>('[data-testid="play-all-button"]')?.disabled).toBe(true);

    // 2. Query matches only song "Sun" -> shows Sunshine, hides both subfolders, Play All queues only Sunshine
    renderMixed('Sun');
    expect(host.querySelector('[data-testid="folder-subfolders-section"]')).toBeNull();
    expect(host.querySelectorAll('[data-testid^="track-row-"]').length).toBe(1);
    act(() => host.querySelector<HTMLElement>('[data-testid="play-all-button"]')!.click());
    expect(onPlayQueue).toHaveBeenCalledWith([tSun]);

    // 3. Query matches neither -> shows single search empty state
    renderMixed('zzz');
    expect(host.querySelector('[data-testid="folder-subfolders-section"]')).toBeNull();
    expect(host.textContent).toContain('No tracks found matching your search.');

    // 4. Header counts for mixed, subfolder-only, and leaf folders
    const mixedCounts = deriveSearchHeaderCounts({
      currentView: 'folder',
      searchQuery: 'Rock',
      isFolderOverview: false,
      currentFolderNode: mixedFolder,
      overviewNodes: [],
      albums: [],
      selectedAlbum: null,
      artists: [],
      selectedArtist: null,
      playlists: [],
      selectedPlaylist: null,
      libraryTracks: [tSun, tMoon],
    });
    expect(
      deriveViewHeaderInfo({
        hasLibrary: true,
        currentView: 'folder',
        searchQuery: 'Rock',
        selectedFolderPath: 'root',
        currentFolderNode: mixedFolder,
        selectedAlbumId: null,
        selectedArtistName: null,
        displayedTracksCount: 0,
        playlistsCount: 0,
        ...mixedCounts,
      }).subtitle
    ).toBe('1 of 2 folders · 0 of 2 tracks');

    const subOnlyFolder = makeNode('subs', 'Containers', [], [subRock, subJazz]);
    const subOnlyCounts = deriveSearchHeaderCounts({
      currentView: 'folder',
      searchQuery: 'Jazz',
      isFolderOverview: false,
      currentFolderNode: subOnlyFolder,
      overviewNodes: [],
      albums: [],
      selectedAlbum: null,
      artists: [],
      selectedArtist: null,
      playlists: [],
      selectedPlaylist: null,
      libraryTracks: [],
    });
    expect(
      deriveViewHeaderInfo({
        hasLibrary: true,
        currentView: 'folder',
        searchQuery: 'Jazz',
        selectedFolderPath: 'subs',
        currentFolderNode: subOnlyFolder,
        selectedAlbumId: null,
        selectedArtistName: null,
        displayedTracksCount: 0,
        playlistsCount: 0,
        ...subOnlyCounts,
      }).subtitle
    ).toBe('1 of 2 folders');

    const leafFolder = makeNode('leaf', 'Leaf', [tSun, tMoon], []);
    const leafCounts = deriveSearchHeaderCounts({
      currentView: 'folder',
      searchQuery: 'Sun',
      isFolderOverview: false,
      currentFolderNode: leafFolder,
      overviewNodes: [],
      albums: [],
      selectedAlbum: null,
      artists: [],
      selectedArtist: null,
      playlists: [],
      selectedPlaylist: null,
      libraryTracks: [tSun, tMoon],
    });
    expect(
      deriveViewHeaderInfo({
        hasLibrary: true,
        currentView: 'folder',
        searchQuery: 'Sun',
        selectedFolderPath: 'leaf',
        currentFolderNode: leafFolder,
        selectedAlbumId: null,
        selectedArtistName: null,
        displayedTracksCount: 1,
        playlistsCount: 0,
        ...leafCounts,
      }).subtitle
    ).toBe('1 of 2 tracks');
  });

  it('Header renders contextual placeholder and matching accessible label', () => {
    act(() => {
      root.render(
        <Header
          title="Playlists"
          searchQuery=""
          searchPlaceholder="Search playlists..."
          theme="light"
          lightStyle="warm"
          onSearchChange={noop}
          onOpenShortcutsModal={noop}
          onSelectTheme={noop}
          onSelectLightStyle={noop}
        />
      );
    });
    const input = host.querySelector<HTMLInputElement>('input[type="text"]');
    expect(input?.placeholder).toBe('Search playlists...');
    expect(input?.getAttribute('aria-label')).toBe('Search playlists');
  });
});
