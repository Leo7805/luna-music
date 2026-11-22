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
import { SourceRemovalEvent } from '../utils/queueSourceRemoval';
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
  // Authoritative source of truth for loaded library + synchronous ref for async pipelines
  const [library, setLibraryState] = useState<MusicLibrary | null>(null);
  const [lastSourceRemoval, setLastSourceRemoval] = useState<SourceRemovalEvent | null>(null);
  const removalSeqRef = useRef<number>(0);
  const libraryRef = useRef<MusicLibrary | null>(null);

  // Updates libraryRef synchronously without side effects inside React state updaters
  const updateLibrary = useCallback(
    (updater: MusicLibrary | null | ((prev: MusicLibrary | null) => MusicLibrary | null)) => {
      const next = typeof updater === 'function' ? updater(libraryRef.current) : updater;
      libraryRef.current = next;
      setLibraryState(next);
    },
    []
  );

  const handleSourcesRemoved = useCallback(
    (remainingTracks: TrackItem[], removedIds: string[], idMigrations: Map<string, string>) => {
      removalSeqRef.current += 1;
      setLastSourceRemoval({
        seq: removalSeqRef.current,
        remainingTracks,
        removedIds,
        idMigrations,
      });
    },
    []
  );

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
    libraryRef,
    onLibraryUpdated: updateLibrary,
    onMigrateFavourites: favouritesManager.migrateFavouritesOnRootRemoval,
    onResetNavigationForFolder: navigation.resetFolderSelectionIfMatching,
    onRemoveAllImportedFiles: removeAllImportedFilesRef,
    onSourcesRemoved: handleSourcesRemoved,
    setPendingFolders: (val) => initialization.setPendingFolders(val),
    setNeedsPermission: (val) => initialization.setNeedsPermission(val),
  });

  // Domain 6: Imported Files Manager
  const importedFilesManager = useImportedFilesManager({
    library,
    onLibraryUpdated: updateLibrary,
    onRemoveFavourites: favouritesManager.removeFavouritesForTrackIds,
    onSourcesRemoved: handleSourcesRemoved,
    startMetadataExtraction: scanning.startIncrementalMetadataExtraction,
    invalidateMetadataTracks: scanning.invalidateMetadataTracks,
    setIsLoading: scanning.setIsLoading,
  });

  // Domain 7: Initialization & Permission Handling
  const initialization = useLibraryInitialization({
    library,
    onLibraryInitialized: updateLibrary,
    onSetInitialFavourites: favouritesManager.setInitialFavourites,
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
      updateLibrary((prevLib) => {
        if (!prevLib) return null;
        return updateTrackInLibrary(prevLib, trackId, status, size, metadata);
      });
    },
    [updateLibrary]
  );

  // Update track metadata only across the library tree without altering status or size,
  // and persist valid metadata updates (such as playback-learned duration) to IndexedDB cache.
  const updateTrackMetadata = useCallback(
    (trackId: string, metadata: Partial<TrackItem['metadata']>) => {
      updateLibrary((prevLib) => {
        if (!prevLib) return null;
        return updateTrackMetadataInLibrary(prevLib, trackId, metadata);
      });
      const liveTrack = libraryRef.current?.flatPlaylist.find(
        (t) => t.id === trackId || Boolean(t.aliases?.includes(trackId))
      );
      if (liveTrack) {
        queueMetadataCacheUpsert(liveTrack, metadata, {
          tagsParsed: liveTrack.metadata.isMetadataLoaded,
        });
      }
    },
    [updateLibrary]
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
        updateLibrary((prevLib) =>
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
    isInitialized: initialization.isInitialized,
    hasRegisteredSources:
      Boolean(library && library.folders.length > 0) || initialization.pendingFolders.length > 0,
    lastSourceRemoval,
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
