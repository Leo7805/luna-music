import { useState, useMemo, useCallback } from 'react';
import { LibraryView, FolderNode, MusicLibrary } from '../types/music';
import { findFolderNodeByPath } from '../utils/musicTree';

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
 */
export function useLibraryNavigation(library: MusicLibrary | null): UseLibraryNavigationReturn {
  const [currentView, setCurrentView] = useState<LibraryView>('all');
  const [selectedFolderPath, setSelectedFolderPath] = useState<string>('');
  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const currentFolderNode = useMemo((): FolderNode | null => {
    if (!library) return null;
    return findFolderNodeByPath(library.tree, selectedFolderPath);
  }, [library, selectedFolderPath]);

  const selectFolder = useCallback((path: string) => {
    setSelectedFolderPath(path);
    setCurrentView('folder');
  }, []);

  const selectArtist = useCallback((artistName: string | null) => {
    setSelectedArtistName(artistName);
    setCurrentView('artists');
  }, []);

  const selectAlbum = useCallback((albumId: string | null) => {
    setSelectedAlbumId(albumId);
    setCurrentView('albums');
  }, []);

  const resetFolderSelectionIfMatching = useCallback((folderId: string) => {
    setSelectedFolderPath((prev) => {
      if (prev === folderId || prev.startsWith(`${folderId}/`)) {
        return '';
      }
      return prev;
    });
  }, []);

  const clearFolderSelection = useCallback(() => {
    setSelectedFolderPath('');
  }, []);

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
