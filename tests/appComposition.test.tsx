import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LibraryContent } from '../src/components/LibraryContent';
import { Header } from '../src/components/Header';
import { deriveViewHeaderInfo } from '../src/utils/libraryAggregation';
import { getBreadcrumbs } from '../src/utils/musicTree';
import {
  TrackItem,
  Playlist,
  ImportedFolder,
  MusicLibrary,
} from '../src/types/music';
import { useMusicLibrary } from '../src/hooks/useMusicLibrary';
import { usePlaylists } from '../src/hooks/usePlaylists';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';

describe('App Composition & Component Integration (Stage 7)', () => {
  const mockTrack1: TrackItem = {
    id: 'f1:song1.mp3',
    name: 'song1.mp3',
    relativePath: 'song1.mp3',
    size: 5000000,
    lastModified: 1700000000,
    metadata: {
      title: 'Song One',
      artist: 'Artist A',
      album: 'Album X',
      duration: 180,
      isMetadataLoaded: true,
    },
  };

  const mockTrack2: TrackItem = {
    id: 'f1:song2.flac',
    name: 'song2.flac',
    relativePath: 'song2.flac',
    size: 20000000,
    lastModified: 1700001000,
    metadata: {
      title: 'Song Two',
      artist: 'Artist B',
      album: 'Album Y',
      duration: 240,
      isMetadataLoaded: true,
    },
  };

  const mockFolder: ImportedFolder = {
    id: 'f1',
    name: 'Music Root',
    sourceType: 'fs-access',
    tracks: [mockTrack1, mockTrack2],
    trackCount: 2,
    addedAt: 1000,
    lastScannedAt: 1000,
    permissionStatus: 'granted',
    tree: {
      id: 'f1',
      name: 'Music Root',
      relativePath: 'f1',
      tracks: [mockTrack1, mockTrack2],
      subfolders: [],
      totalTrackCount: 2,
    },
  };

  const mockLibrary: MusicLibrary = {
    id: 'multi-library',
    name: 'Music Library',
    folders: [mockFolder],
    tree: mockFolder.tree,
    flatPlaylist: [mockTrack1, mockTrack2],
    sourceType: 'fs-access',
  };

  const mockPlaylist: Playlist = {
    id: 'pl-1',
    name: 'Chill Vibes',
    createdAt: 1000,
    updatedAt: 1000,
    tracks: [{ trackId: 'f1:song1.mp3', name: 'song1.mp3', addedAt: 1000 }],
  };

  function createMockLibraryHook(overrides: Partial<any> = {}): ReturnType<typeof useMusicLibrary> {
    return {
      library: mockLibrary,
      folders: [mockFolder],
      currentView: 'all' as const,
      selectedFolderPath: '',
      selectedArtistName: null,
      selectedAlbumId: null,
      searchQuery: '',
      favourites: new Set(['f1:song1.mp3']),
      favouritesCount: 1,
      isLoading: false,
      scanProgress: 0,
      needsPermission: false,
      currentFolderNode: mockFolder.tree,
      displayedTracks: [mockTrack1, mockTrack2],
      albums: [],
      artists: [],
      setCurrentView: () => {},
      selectFolder: () => {},
      selectArtist: () => {},
      selectAlbum: () => {},
      setSearchQuery: () => {},
      toggleFavourite: () => {},
      addTracksToFavourites: () => {},
      removeTracksFromFavourites: () => {},
      openFolderPicker: () => {},
      openFilesPicker: () => {},
      refreshFolder: () => {},
      removeFolder: () => {},
      removeImportedFiles: () => {},
      removeAllImportedFiles: () => {},
      requestPermissionForFolder: () => {},
      handleFallbackFolderSelect: () => {},
      handleOpenFilesSelect: () => {},
      requestPermissionAndLoad: () => {},
      updateTrackStatus: () => {},
      ...overrides,
    } as unknown as ReturnType<typeof useMusicLibrary>;
  }

  function createMockPlaylistsHook(overrides: Partial<any> = {}): ReturnType<typeof usePlaylists> {
    return {
      playlists: [mockPlaylist],
      selectedPlaylistId: null,
      createPlaylist: () => mockPlaylist,
      renamePlaylist: () => {},
      deletePlaylist: () => {},
      addTrackToPlaylist: () => {},
      addTracksToPlaylist: () => {},
      removeTrackFromPlaylist: () => {},
      removeTracksFromPlaylist: () => {},
      reorderPlaylistTracks: () => {},
      saveQueueAsPlaylist: () => mockPlaylist,
      selectPlaylist: () => {},
      ...overrides,
    } as unknown as ReturnType<typeof usePlaylists>;
  }

  function createMockAudioPlayerHook(overrides: Partial<any> = {}): ReturnType<typeof useAudioPlayer> {
    return {
      currentTrack: mockTrack1,
      isPlaying: false,
      currentTime: 0,
      duration: 180,
      volume: 0.8,
      isMuted: false,
      repeatMode: 'off' as const,
      shuffle: false,
      playbackError: null,
      clearPlaybackError: () => {},
      lyrics: [],
      ambientColors: null,
      queue: [mockTrack1, mockTrack2],
      playTrack: () => {},
      playQueue: () => {},
      playNext: () => {},
      playNextBulk: () => {},
      addToQueue: () => {},
      removeFromQueue: () => {},
      clearQueue: () => {},
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
      ...overrides,
    } as unknown as ReturnType<typeof useAudioPlayer>;
  }

  describe('1. Empty & Loading States Composition', () => {
    it('renders loading spinner when library is scanning', () => {
      const library = createMockLibraryHook({ isLoading: true });
      const playlists = createMockPlaylistsHook();
      const audioPlayer = createMockAudioPlayerHook();

      const html = renderToStaticMarkup(
        <LibraryContent library={library} playlists={playlists} audioPlayer={audioPlayer} />
      );

      expect(html).toContain('Scanning local library...');
      expect(html).toContain('animate-spin');
    });

    it('renders EmptyState with Open Music button when no library exists', () => {
      const library = createMockLibraryHook({
        library: null,
        folders: [],
        displayedTracks: [],
      });
      const playlists = createMockPlaylistsHook();
      const audioPlayer = createMockAudioPlayerHook({ currentTrack: null });

      const html = renderToStaticMarkup(
        <LibraryContent library={library} playlists={playlists} audioPlayer={audioPlayer} />
      );

      expect(html).toContain('Open Music');
      expect(html).toContain('Your Music');
    });
  });

  describe('2. View Composition & Switching in LibraryContent', () => {
    it('renders All Tracks view with tracks table', () => {
      const library = createMockLibraryHook({ currentView: 'all' });
      const playlists = createMockPlaylistsHook();
      const audioPlayer = createMockAudioPlayerHook();

      const html = renderToStaticMarkup(
        <LibraryContent library={library} playlists={playlists} audioPlayer={audioPlayer} />
      );

      expect(html).toContain('Song One');
      expect(html).toContain('Song Two');
      expect(html).toContain('Artist A');
      expect(html).toContain('Artist B');
    });

    it('renders Favourites view with favourites empty state when empty', () => {
      const library = createMockLibraryHook({
        currentView: 'favourites',
        displayedTracks: [],
        favourites: new Set(),
      });
      const playlists = createMockPlaylistsHook();
      const audioPlayer = createMockAudioPlayerHook();

      const html = renderToStaticMarkup(
        <LibraryContent library={library} playlists={playlists} audioPlayer={audioPlayer} />
      );

      expect(html).toContain('No favourite tracks yet');
    });

    it('renders Imported Files view with empty message when no files imported', () => {
      const library = createMockLibraryHook({
        currentView: 'imported-files',
        displayedTracks: [],
      });
      const playlists = createMockPlaylistsHook();
      const audioPlayer = createMockAudioPlayerHook();

      const html = renderToStaticMarkup(
        <LibraryContent library={library} playlists={playlists} audioPlayer={audioPlayer} />
      );

      expect(html).toContain('No imported files found.');
    });

    it('renders Playlists view with playlist cards', () => {
      const library = createMockLibraryHook({ currentView: 'playlists' });
      const playlists = createMockPlaylistsHook();
      const audioPlayer = createMockAudioPlayerHook();

      const html = renderToStaticMarkup(
        <LibraryContent library={library} playlists={playlists} audioPlayer={audioPlayer} />
      );

      expect(html).toContain('Chill Vibes');
      expect(html).toContain('1 track');
    });

    it('renders Folder view with current folder node', () => {
      const library = createMockLibraryHook({
        currentView: 'folder',
        selectedFolderPath: 'f1',
        currentFolderNode: mockFolder.tree,
      });
      const playlists = createMockPlaylistsHook();
      const audioPlayer = createMockAudioPlayerHook();

      const html = renderToStaticMarkup(
        <LibraryContent library={library} playlists={playlists} audioPlayer={audioPlayer} />
      );

      expect(html).toContain('Song One');
      expect(html).toContain('Song Two');
    });

    it('renders Albums and Artists views', () => {
      const mockAlbum = {
        id: 'Album X___Artist A',
        name: 'Album X',
        artist: 'Artist A',
        tracks: [mockTrack1],
        totalDuration: 180,
      };
      const mockArtist = {
        id: 'Artist A',
        name: 'Artist A',
        tracks: [mockTrack1],
        albumCount: 1,
      };

      const libraryAlbums = createMockLibraryHook({
        currentView: 'albums',
        albums: [mockAlbum],
      });
      const libraryArtists = createMockLibraryHook({
        currentView: 'artists',
        artists: [mockArtist],
      });
      const playlists = createMockPlaylistsHook();
      const audioPlayer = createMockAudioPlayerHook();

      const htmlAlbums = renderToStaticMarkup(
        <LibraryContent library={libraryAlbums} playlists={playlists} audioPlayer={audioPlayer} />
      );
      expect(htmlAlbums).toContain('Album X');

      const htmlArtists = renderToStaticMarkup(
        <LibraryContent library={libraryArtists} playlists={playlists} audioPlayer={audioPlayer} />
      );
      expect(htmlArtists).toContain('Artist A');
    });
  });

  describe('All Tracks layout composition boundary', () => {
    it.each(['all', 'favourites', 'folder', 'imported-files', 'albums', 'artists', 'playlists'] as const)(
      'uses the external layout only for %s when All Tracks is active', (currentView) => {
        const html = renderToStaticMarkup(
          <LibraryContent library={createMockLibraryHook({ currentView })}
            playlists={createMockPlaylistsHook()} audioPlayer={createMockAudioPlayerHook()}
            renderAllTracksLayout={({ actions, content }) => <>
              <Header title="All Tracks" searchQuery="" theme="light" lightStyle="warm"
                actions={actions} onSearchChange={() => {}} onOpenShortcutsModal={() => {}}
                onSelectTheme={() => {}} onSelectLightStyle={() => {}} />
              <section data-testid="external-scroll">{content}</section>
            </>} />
        );
        if (currentView === 'all') {
          const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
          expect(header).toContain('data-testid="play-all-button"');
          expect(header).toContain('data-testid="toggle-select-mode"');
          expect(html).not.toContain('data-testid="tracklist-toolbar"');
          expect(html.match(/data-testid="play-all-button"/g)).toHaveLength(1);
          expect(html.indexOf('</header>')).toBeLessThan(html.indexOf('data-testid="external-scroll"'));
        } else {
          expect(html).not.toContain('data-testid="external-scroll"');
          expect(html).not.toContain('<header');
          if (currentView === 'favourites' || currentView === 'folder') {
            expect(html).toContain('data-testid="tracklist-toolbar"');
          }
        }
      },
    );
  });

  describe('3. Header Info & Breadcrumb Derivations', () => {
    it('computes view header info correctly across views and states', () => {
      // Empty library
      const emptyInfo = deriveViewHeaderInfo({
        hasLibrary: false,
        currentView: 'all',
        searchQuery: '',
        selectedFolderPath: '',
        currentFolderNode: null,
        selectedAlbumId: null,
        selectedArtistName: null,
        displayedTracksCount: 0,
        playlistsCount: 0,
      });
      expect(emptyInfo.title).toBe('Music Library');
      expect(emptyInfo.subtitle).toBe('');

      // Search query active
      const searchInfo = deriveViewHeaderInfo({
        hasLibrary: true,
        currentView: 'all',
        searchQuery: 'synthwave',
        selectedFolderPath: '',
        currentFolderNode: null,
        selectedAlbumId: null,
        selectedArtistName: null,
        displayedTracksCount: 5,
        playlistsCount: 1,
      });
      expect(searchInfo.title).toBe('Search Results: "synthwave"');
      expect(searchInfo.subtitle).toBe('5 tracks');

      // Playlists view
      const plInfo = deriveViewHeaderInfo({
        hasLibrary: true,
        currentView: 'playlists',
        searchQuery: '',
        selectedFolderPath: '',
        currentFolderNode: null,
        selectedAlbumId: null,
        selectedArtistName: null,
        displayedTracksCount: 0,
        playlistsCount: 3,
      });
      expect(plInfo.title).toBe('Playlists');
      expect(plInfo.subtitle).toBe('3 playlists');

      // Folder view root
      const folderRootInfo = deriveViewHeaderInfo({
        hasLibrary: true,
        currentView: 'folder',
        searchQuery: '',
        selectedFolderPath: '',
        currentFolderNode: null,
        selectedAlbumId: null,
        selectedArtistName: null,
        displayedTracksCount: 10,
        playlistsCount: 0,
        folderOverviewTracksCount: 12,
        folderOverviewFoldersCount: 3,
      });
      expect(folderRootInfo.title).toBe('Music Folders');
      expect(folderRootInfo.subtitle).toBe('3 folders · 12 tracks');
    });

    it('computes breadcrumbs correctly for folder navigation', () => {
      const breadcrumbs = getBreadcrumbs('Music Library', 'f1', [mockFolder]);
      expect(breadcrumbs.length).toBeGreaterThanOrEqual(1);
      expect(breadcrumbs[0].name).toBe('Music Library');
    });
  });
});
