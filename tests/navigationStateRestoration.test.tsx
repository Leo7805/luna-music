import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  getStoredNavigation,
  storeNavigation,
  clearStoredNavigation,
  SESSION_STORAGE_NAV_KEY,
} from '../src/utils/navigationStorage';
import { useLibraryNavigation } from '../src/hooks/useLibraryNavigation';
import { usePlaylists } from '../src/hooks/usePlaylists';
import { MusicLibrary, FolderNode, ImportedFolder } from '../src/types/music';

const createSessionStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

function renderHookSync<T>(useHook: () => T): T {
  let result!: T;
  function TestComponent() {
    result = useHook();
    return null;
  }
  renderToStaticMarkup(<TestComponent />);
  return result;
}

describe('Navigation State Restoration on Page Reload', () => {
  beforeEach(() => {
    if (typeof globalThis.sessionStorage === 'undefined') {
      // @ts-expect-error Mocking sessionStorage in test environment
      globalThis.sessionStorage = createSessionStorageMock();
    }
    globalThis.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. navigationStorage Primitives & Safety', () => {
    it('returns null when sessionStorage is empty', () => {
      expect(getStoredNavigation()).toBeNull();
    });

    it('stores and retrieves all primary views with contextual identifiers', () => {
      storeNavigation({
        view: 'folder',
        selectedFolderPath: 'f1/Rock/Queen',
      });
      let state = getStoredNavigation();
      expect(state?.view).toBe('folder');
      expect(state?.selectedFolderPath).toBe('f1/Rock/Queen');

      storeNavigation({
        view: 'playlists',
        selectedPlaylistId: 'pl_123',
      });
      state = getStoredNavigation();
      expect(state?.view).toBe('playlists');
      expect(state?.selectedPlaylistId).toBe('pl_123');

      storeNavigation({
        view: 'albums',
        selectedAlbumId: 'album_456',
      });
      state = getStoredNavigation();
      expect(state?.view).toBe('albums');
      expect(state?.selectedAlbumId).toBe('album_456');

      storeNavigation({
        view: 'artists',
        selectedArtistName: 'Led Zeppelin',
      });
      state = getStoredNavigation();
      expect(state?.view).toBe('artists');
      expect(state?.selectedArtistName).toBe('Led Zeppelin');

      storeNavigation({ view: 'favourites' });
      state = getStoredNavigation();
      expect(state?.view).toBe('favourites');

      storeNavigation({ view: 'imported-files' });
      state = getStoredNavigation();
      expect(state?.view).toBe('imported-files');
    });

    it('gracefully ignores invalid views or corrupt JSON', () => {
      sessionStorage.setItem(SESSION_STORAGE_NAV_KEY, 'invalid-json{{{');
      expect(getStoredNavigation()).toBeNull();

      sessionStorage.setItem(SESSION_STORAGE_NAV_KEY, JSON.stringify({ view: 'invalid_view_name' }));
      expect(getStoredNavigation()).toBeNull();
    });

    it('clears stored navigation when requested', () => {
      storeNavigation({ view: 'favourites' });
      expect(getStoredNavigation()?.view).toBe('favourites');
      clearStoredNavigation();
      expect(getStoredNavigation()).toBeNull();
    });
  });

  describe('2. Synchronous State Restoration in useLibraryNavigation', () => {
    it('restores initial view and folder path synchronously on mount', () => {
      storeNavigation({
        view: 'folder',
        selectedFolderPath: 'root-1/Audio',
      });

      const nav = renderHookSync(() => useLibraryNavigation(null));
      expect(nav.currentView).toBe('folder');
      expect(nav.selectedFolderPath).toBe('root-1/Audio');
    });

    it('restores initial album and artist selection synchronously on mount', () => {
      storeNavigation({
        view: 'albums',
        selectedAlbumId: 'album-night-at-the-opera',
      });

      const nav = renderHookSync(() => useLibraryNavigation(null));
      expect(nav.currentView).toBe('albums');
      expect(nav.selectedAlbumId).toBe('album-night-at-the-opera');
    });

    it('restores favourites and imported-files views synchronously without flash of "all"', () => {
      storeNavigation({ view: 'favourites' });
      const navFav = renderHookSync(() => useLibraryNavigation(null));
      expect(navFav.currentView).toBe('favourites');

      storeNavigation({ view: 'imported-files' });
      const navImp = renderHookSync(() => useLibraryNavigation(null));
      expect(navImp.currentView).toBe('imported-files');
    });

    it('updates sessionStorage when navigation actions are invoked', () => {
      const nav = renderHookSync(() => useLibraryNavigation(null));
      nav.selectFolder('root-1/Jazz');
      expect(getStoredNavigation()?.view).toBe('folder');
      expect(getStoredNavigation()?.selectedFolderPath).toBe('root-1/Jazz');

      nav.selectArtist('Miles Davis');
      expect(getStoredNavigation()?.view).toBe('artists');
      expect(getStoredNavigation()?.selectedArtistName).toBe('Miles Davis');

      nav.setCurrentView('all');
      expect(getStoredNavigation()?.view).toBe('all');
    });
  });

  describe('3. Asynchronous Validation & Graceful Fallback', () => {
    const mockTree: FolderNode = {
      id: 'f1',
      name: 'Music Root',
      relativePath: 'f1',
      tracks: [],
      totalTrackCount: 0,
      subfolders: [
        {
          id: 'f1/Rock',
          name: 'Rock',
          relativePath: 'f1/Rock',
          tracks: [],
          totalTrackCount: 0,
          subfolders: [],
        },
      ],
    };

    const mockFolder: ImportedFolder = {
      id: 'f1',
      name: 'Music Root',
      sourceType: 'fs-access',
      tracks: [],
      trackCount: 0,
      addedAt: 1000,
      lastScannedAt: 1000,
      permissionStatus: 'granted',
      tree: mockTree,
    };

    const mockLibrary: MusicLibrary = {
      id: 'lib1',
      name: 'Music Library',
      tree: mockTree,
      folders: [mockFolder],
      flatPlaylist: [],
      sourceType: 'fs-access',
    };

    it('does not reset stored folder path while library is null (loading)', () => {
      storeNavigation({
        view: 'folder',
        selectedFolderPath: 'f1/Rock',
      });

      const nav = renderHookSync(() => useLibraryNavigation(null));
      expect(nav.selectedFolderPath).toBe('f1/Rock');
      expect(getStoredNavigation()?.selectedFolderPath).toBe('f1/Rock');
    });

    it('preserves folder path when folder needs permission re-grant', () => {
      storeNavigation({
        view: 'folder',
        selectedFolderPath: 'f1/Rock',
      });

      const promptFolder: ImportedFolder = {
        ...mockFolder,
        permissionStatus: 'prompt',
      };
      const libWithPrompt: MusicLibrary = {
        ...mockLibrary,
        folders: [promptFolder],
      };

      const nav = renderHookSync(() => useLibraryNavigation(libWithPrompt));
      expect(nav.selectedFolderPath).toBe('f1/Rock');
      expect(getStoredNavigation()?.selectedFolderPath).toBe('f1/Rock');
    });
  });

  describe('4. usePlaylists Navigation State Restoration', () => {
    it('synchronously initializes selectedPlaylistId from sessionStorage', () => {
      storeNavigation({
        view: 'playlists',
        selectedPlaylistId: 'pl_my_faves',
      });

      const pl = renderHookSync(() => usePlaylists());
      expect(pl.selectedPlaylistId).toBe('pl_my_faves');
    });

    it('persists selectedPlaylistId on selectPlaylist call', () => {
      const pl = renderHookSync(() => usePlaylists());
      pl.selectPlaylist('pl_new_selection');
      expect(getStoredNavigation()?.selectedPlaylistId).toBe('pl_new_selection');

      pl.selectPlaylist(null);
      expect(getStoredNavigation()?.selectedPlaylistId).toBeNull();
    });
  });
});
