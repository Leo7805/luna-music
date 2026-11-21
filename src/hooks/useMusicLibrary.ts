import { useState, useMemo, useCallback, useRef } from 'react';
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
  updateTrackMetadataInLibrary,
} from '../utils/libraryAggregation';
import { queueMetadataCacheUpsert } from '../services/idbStorage';
import { OnDemandArtworkLoader, ArtworkPriority } from '../utils/artworkLoader';
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
  const libraryRef = useRef<MusicLibrary | null>(library);
  libraryRef.current = library;

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
    invalidateMetadataTracks: scanning.invalidateMetadataTracks,
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

  // Update track metadata only across the library tree without altering status or size,
  // and persist valid metadata updates (such as playback-learned duration) to IndexedDB cache.
  const updateTrackMetadata = useCallback(
    (trackId: string, metadata: Partial<TrackItem['metadata']>) => {
      let matchedTrack: TrackItem | undefined;
      setLibrary((prevLib) => {
        if (!prevLib) return null;
        const nextLib = updateTrackMetadataInLibrary(prevLib, trackId, metadata);
        matchedTrack = nextLib.flatPlaylist.find(
          (t) => t.id === trackId || Boolean(t.aliases?.includes(trackId))
        );
        return nextLib;
      });
      const liveTrack =
        matchedTrack ||
        libraryRef.current?.flatPlaylist.find(
          (t) => t.id === trackId || Boolean(t.aliases?.includes(trackId))
        );
      if (liveTrack) {
        queueMetadataCacheUpsert(liveTrack, metadata);
      }
    },
    []
  );

  // On-demand embedded artwork loader (priority-aware, deduplicated, bounded concurrency)
  const artworkLoaderRef = useRef<OnDemandArtworkLoader | null>(null);
  if (!artworkLoaderRef.current) {
    artworkLoaderRef.current = new OnDemandArtworkLoader({
      concurrency: 2,
      isTrackStillValid: (track) => {
        const cur = libraryRef.current?.flatPlaylist.find(
          (t) => t.id === track.id || Boolean(t.aliases?.includes(track.id))
        );
        return Boolean(cur && cur.size === track.size && cur.lastModified === track.lastModified);
      },
      onArtworkLoaded: (trackId, artworkUrl) => {
        setLibrary((prevLib) =>
          prevLib ? updateTrackMetadataInLibrary(prevLib, trackId, { artworkUrl }) : null
        );
      },
    });
  }

  const requestTrackArtwork = useCallback(
    (track: TrackItem | null | undefined, priority: ArtworkPriority = 'normal') => {
      artworkLoaderRef.current?.request(track, priority);
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
    updateTrackMetadata,
    requestTrackArtwork,
  };
}
