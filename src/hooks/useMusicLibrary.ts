import { useState, useMemo, useCallback } from 'react';
import {
  MusicLibrary,
  FileStatus,
  TrackItem,
} from '../types/music';
import {
  deriveAlbums,
  deriveArtists,
  deriveDisplayedTracks,
  updateTrackInLibrary,
} from '../utils/libraryAggregation';
import { useLibraryNavigation } from './useLibraryNavigation';
import { useLibraryFavourites } from './useLibraryFavourites';
import { useFolderScanning } from './useFolderScanning';
import { useImportedFilesManager } from './useImportedFilesManager';
import { useLibraryInitialization } from './useLibraryInitialization';

/**
 * Luna Music Library Hook (Public Orchestration Boundary)
 *
 * Coordinates multi-root physical folders, the unified virtual Imported Files collection,
 * favourites resolution, navigation state, and background scanning.
 */
export function useMusicLibrary() {
  // Authoritative source of truth for loaded library
  const [library, setLibrary] = useState<MusicLibrary | null>(null);

  const flatPlaylist = useMemo(() => library?.flatPlaylist || [], [library?.flatPlaylist]);

  // Aggregate albums & artists
  const albums = useMemo(() => deriveAlbums(flatPlaylist), [flatPlaylist]);
  const artists = useMemo(() => deriveArtists(flatPlaylist), [flatPlaylist]);

  // Domain 1: Navigation (restores tab-scoped state)
  const navigation = useLibraryNavigation(library, { albums, artists });

  // Domain 2: Favourites
  const favouritesManager = useLibraryFavourites({ flatPlaylist });

  // Domain 4: Displayed tracks derived selector
  const displayedTracks = useMemo(
    () =>
      deriveDisplayedTracks({
        library,
        currentView: navigation.currentView,
        currentFolderNode: navigation.currentFolderNode,
        selectedArtistName: navigation.selectedArtistName,
        selectedAlbumId: navigation.selectedAlbumId,
        albums,
        favouriteTracks: favouritesManager.favouriteTracks,
        searchQuery: navigation.searchQuery,
      }),
    [
      library,
      navigation.currentView,
      navigation.currentFolderNode,
      navigation.selectedArtistName,
      navigation.selectedAlbumId,
      albums,
      favouritesManager.favouriteTracks,
      navigation.searchQuery,
    ]
  );

  // Forward ref / helper for removing all imported files
  const removeAllImportedFilesRef = useCallback(async () => {
    await importedFilesManager.removeAllImportedFiles();
  }, []);

  // Domain 5: Folder Scanning & Mutations
  const scanning = useFolderScanning({
    library,
    onLibraryUpdated: setLibrary,
    onMigrateFavourites: favouritesManager.migrateFavouritesOnRootRemoval,
    onResetNavigationForFolder: navigation.resetFolderSelectionIfMatching,
    onRemoveAllImportedFiles: removeAllImportedFilesRef,
    setPendingFolders: (val) => initialization.setPendingFolders(val),
    setNeedsPermission: (val) => initialization.setNeedsPermission(val),
  });

  // Domain 6: Imported Files Manager
  const importedFilesManager = useImportedFilesManager({
    library,
    onLibraryUpdated: setLibrary,
    onRemoveFavourites: favouritesManager.removeFavouritesForTrackIds,
    startMetadataExtraction: scanning.startIncrementalMetadataExtraction,
    setIsLoading: scanning.setIsLoading,
  });

  // Domain 7: Initialization & Permission Handling
  const initialization = useLibraryInitialization({
    library,
    onLibraryInitialized: setLibrary,
    onSetInitialFavourites: favouritesManager.setFavourites,
    startIncrementalMetadataExtraction: scanning.startIncrementalMetadataExtraction,
    setIsLoading: scanning.setIsLoading,
  });

  // Update track status & metadata across the library tree
  const updateTrackStatus = useCallback(
    (
      trackId: string,
      status: FileStatus,
      size?: number,
      metadata?: Partial<TrackItem['metadata']>
    ) => {
      setLibrary((prevLib) => {
        if (!prevLib) return null;
        return updateTrackInLibrary(prevLib, trackId, status, size, metadata);
      });
    },
    []
  );

  return {
    library,
    folders: library?.folders || [],
    currentView: navigation.currentView,
    selectedFolderPath: navigation.selectedFolderPath,
    selectedArtistName: navigation.selectedArtistName,
    selectedAlbumId: navigation.selectedAlbumId,
    searchQuery: navigation.searchQuery,
    favourites: favouritesManager.favourites,
    favouriteTracks: favouritesManager.favouriteTracks,
    favouritesCount: favouritesManager.favouritesCount,
    isLoading: scanning.isLoading,
    scanProgress: scanning.scanProgress,
    needsPermission: initialization.needsPermission,
    pendingFolders: initialization.pendingFolders,
    currentFolderNode: navigation.currentFolderNode,
    displayedTracks,
    albums,
    artists,
    setCurrentView: navigation.setCurrentView,
    selectFolder: navigation.selectFolder,
    selectArtist: navigation.selectArtist,
    selectAlbum: navigation.selectAlbum,
    setSearchQuery: navigation.setSearchQuery,
    toggleFavourite: favouritesManager.toggleFavourite,
    addTracksToFavourites: favouritesManager.addTracksToFavourites,
    removeTracksFromFavourites: favouritesManager.removeTracksFromFavourites,
    openFolderPicker: scanning.openFolderPicker,
    openFilesPicker: importedFilesManager.openFilesPicker,
    addFolder: scanning.openFolderPicker,
    refreshFolder: scanning.refreshFolder,
    removeFolder: scanning.removeFolder,
    removeImportedFiles: importedFilesManager.removeImportedFiles,
    removeAllImportedFiles: importedFilesManager.removeAllImportedFiles,
    handleFallbackFolderSelect: scanning.handleFallbackFolderSelect,
    handleOpenFilesSelect: importedFilesManager.handleOpenFilesSelect,
    handleFolderInput: scanning.handleFallbackFolderSelect,
    handleFilesInput: importedFilesManager.handleOpenFilesSelect,
    requestPermissionAndLoad: initialization.requestPermissionAndLoad,
    requestPermissionForFolder: initialization.requestPermissionForFolder,
    updateTrackStatus,
  };
}
