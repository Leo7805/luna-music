import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  LibraryView,
  FolderNode,
  MusicLibrary,
  AlbumGroup,
  ArtistGroup,
  IMPORTED_FILES_ROOT_ID,
} from '../types/music';
import { findFolderNodeByPath } from '../utils/musicTree';
import { getStoredNavigation, storeNavigation } from '../utils/navigationStorage';

export interface UseLibraryNavigationOptions {
  albums?: AlbumGroup[];
  artists?: ArtistGroup[];
  isLoading?: boolean;
}

export interface UseLibraryNavigationReturn {
  currentView: LibraryView;
  selectedFolderPath: string;
  selectedArtistName: string | null;
  selectedAlbumId: string | null;
  searchQuery: string;
  currentFolderNode: FolderNode | null;
  setCurrentView: (view: LibraryView) => void;
  selectFolder: (path: string) => void;
  selectArtist: (artistName: string | null) => void;
  selectAlbum: (albumId: string | null) => void;
  setSearchQuery: (query: string) => void;
  resetFolderSelectionIfMatching: (folderId: string) => void;
  clearFolderSelection: () => void;
}

/**
 * Hook to manage library navigation, active view, folder drilldown, and search query.
 * Restores and persists tab-scoped navigation state via sessionStorage.
 */
export function useLibraryNavigation(
  library: MusicLibrary | null,
  options?: UseLibraryNavigationOptions
): UseLibraryNavigationReturn {
  const initialNav = useMemo(() => getStoredNavigation(), []);

  const [currentView, setCurrentViewState] = useState<LibraryView>(
    () => initialNav?.view || 'all'
  );
  const [selectedFolderPath, setSelectedFolderPathState] = useState<string>(
    () => (initialNav?.view === 'folder' ? initialNav.selectedFolderPath || '' : '')
  );
  const [selectedArtistName, setSelectedArtistNameState] = useState<string | null>(
    () => initialNav?.selectedArtistName ?? null
  );
  const [selectedAlbumId, setSelectedAlbumIdState] = useState<string | null>(
    () => initialNav?.selectedAlbumId ?? null
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  const currentFolderNode = useMemo((): FolderNode | null => {
    if (!library) return null;
    return findFolderNodeByPath(library.tree, selectedFolderPath);
  }, [library, selectedFolderPath]);

  const setCurrentView = useCallback((view: LibraryView) => {
    setCurrentViewState(view);
    if (view !== 'folder') {
      setSelectedFolderPathState('');
      storeNavigation({ view, selectedFolderPath: '' });
    } else {
      storeNavigation({ view });
    }
  }, []);

  const selectFolder = useCallback((path: string) => {
    setSelectedFolderPathState(path);
    setCurrentViewState('folder');
    storeNavigation({ view: 'folder', selectedFolderPath: path });
  }, []);

  const selectArtist = useCallback((artistName: string | null) => {
    setSelectedArtistNameState(artistName);
    setSelectedFolderPathState('');
    setCurrentViewState('artists');
    storeNavigation({ view: 'artists', selectedArtistName: artistName, selectedFolderPath: '' });
  }, []);

  const selectAlbum = useCallback((albumId: string | null) => {
    setSelectedAlbumIdState(albumId);
    setSelectedFolderPathState('');
    setCurrentViewState('albums');
    storeNavigation({ view: 'albums', selectedAlbumId: albumId, selectedFolderPath: '' });
  }, []);

  const resetFolderSelectionIfMatching = useCallback(
    (folderId: string) => {
      if (
        selectedFolderPath === folderId ||
        selectedFolderPath.startsWith(`${folderId}/`)
      ) {
        setSelectedFolderPathState('');
        storeNavigation({ selectedFolderPath: '' });
      }
    },
    [selectedFolderPath]
  );

  const clearFolderSelection = useCallback(() => {
    setSelectedFolderPathState('');
    storeNavigation({ selectedFolderPath: '' });
  }, []);

  // Gracefully fallback if saved destination has genuinely been deleted after library loads
  useEffect(() => {
    if (!library || options?.isLoading) return;

    // 1. Folder view destination check
    if (currentView === 'folder' && selectedFolderPath) {
      const rootId = selectedFolderPath.split('/')[0];
      const rootFolder = library.folders?.find((f) => f.id === rootId);

      // If root folder requires permission, preserve selection and reconnect state
      if (
        rootFolder &&
        (rootFolder.permissionStatus === 'prompt' || rootFolder.permissionStatus === 'denied')
      ) {
        return;
      }

      const node = findFolderNodeByPath(library.tree, selectedFolderPath);
      if (!node) {
        if (!rootFolder) {
          // Entire root folder was deleted from library
          if (library.folders && library.folders.length > 0) {
            setSelectedFolderPathState('');
            storeNavigation({ selectedFolderPath: '' });
          } else {
            setCurrentViewState('all');
            setSelectedFolderPathState('');
            storeNavigation({ view: 'all', selectedFolderPath: '' });
          }
        } else {
          // Subfolder was removed from disk: fallback to closest existing parent
          let fallbackPath = '';
          const segments = selectedFolderPath.split('/');
          for (let i = segments.length - 1; i >= 1; i--) {
            const parentPath = segments.slice(0, i).join('/');
            if (findFolderNodeByPath(library.tree, parentPath)) {
              fallbackPath = parentPath;
              break;
            }
          }
          setSelectedFolderPathState(fallbackPath);
          storeNavigation({ selectedFolderPath: fallbackPath });
        }
      }
    }

    // 1b. Imported Files destination check
    if (currentView === 'imported-files') {
      const hasImported = Boolean(
        library.folders?.some((f) => f.id === IMPORTED_FILES_ROOT_ID && f.tracks.length > 0)
      );
      if (!hasImported) {
        const hasPhysical = Boolean(
          library.folders?.some((f) => f.id !== IMPORTED_FILES_ROOT_ID)
        );
        const nextView: LibraryView = hasPhysical ? 'folder' : 'all';
        setCurrentViewState(nextView);
        setSelectedFolderPathState('');
        storeNavigation({ view: nextView, selectedFolderPath: '' });
      }
    }

    // 2. Album view destination check
    if (currentView === 'albums' && selectedAlbumId && options?.albums && options.albums.length > 0) {
      const exists = options.albums.some((a) => a.id === selectedAlbumId);
      if (!exists) {
        setSelectedAlbumIdState(null);
        storeNavigation({ selectedAlbumId: null });
      }
    }

    // 3. Artist view destination check
    if (
      currentView === 'artists' &&
      selectedArtistName &&
      options?.artists &&
      options.artists.length > 0
    ) {
      const exists = options.artists.some((a) => a.name === selectedArtistName);
      if (!exists) {
        setSelectedArtistNameState(null);
        storeNavigation({ selectedArtistName: null });
      }
    }
  }, [
    library,
    options?.isLoading,
    currentView,
    selectedFolderPath,
    selectedAlbumId,
    selectedArtistName,
    options?.albums,
    options?.artists,
  ]);

  return {
    currentView,
    selectedFolderPath,
    selectedArtistName,
    selectedAlbumId,
    searchQuery,
    currentFolderNode,
    setCurrentView,
    selectFolder,
    selectArtist,
    selectAlbum,
    setSearchQuery,
    resetFolderSelectionIfMatching,
    clearFolderSelection,
  };
}
