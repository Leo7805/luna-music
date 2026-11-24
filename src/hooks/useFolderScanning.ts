import { useState, useRef, useCallback } from 'react';
import { TrackItem, MusicLibrary, StoredFolderRecord, IMPORTED_FILES_ROOT_ID } from '../types/music';
import { scanRootFolderHandle, promptOpenDirectory, verifyHandlePermission } from '../services/directoryAccess';
import { parseFileList } from '../services/fallbackAccess';
import {
  storeRegisteredFolders, clearStoredDirectoryHandle, storeImportedFiles,
  getMetadataCache, applyCachedMetadataToTracks, cleanupCacheOnSourceRemoval,
} from '../services/idbStorage';
import {
  buildFolderTree, buildUnifiedMultiFolderTree, combineFlatPlaylists,
  reconcileOverlappingTracks, migratePlaylistsTrackIds,
} from '../utils/musicTree';
import { revokeUnusedArtworkUrls } from '../utils/artworkLoader';
import { useMetadataExtractionPipeline } from './useMetadataExtractionPipeline';

export interface UseFolderScanningProps {
  library: MusicLibrary | null;
  libraryRef?: React.MutableRefObject<MusicLibrary | null>;
  onLibraryUpdated: (updater: (prev: MusicLibrary | null) => MusicLibrary | null) => void;
  onMigrateFavourites: (idMigrations: Map<string, string>) => void;
  onResetNavigationForFolder: (folderId: string) => void;
  onRemoveAllImportedFiles: () => Promise<void>;
  onSourcesRemoved?: (remainingTracks: TrackItem[], removedIds: string[], idMigrations: Map<string, string>) => void;
  setPendingFolders: React.Dispatch<React.SetStateAction<StoredFolderRecord[]>>;
  setNeedsPermission: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface UseFolderScanningReturn {
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  scanProgress: number;
  setScanProgress: React.Dispatch<React.SetStateAction<number>>;
  startIncrementalMetadataExtraction: (
    tracks: TrackItem[],
    sourceId?: string,
    options?: { invalidatePreviousForSource?: boolean }
  ) => void;
  invalidateMetadataSource: (sourceId: string) => void;
  invalidateMetadataTracks: (trackIds: string[]) => void;
  refreshFolder: (folderId: string) => Promise<void>;
  openFolderPicker: () => Promise<void>;
  removeFolder: (folderId: string) => Promise<void>;
  handleFallbackFolderSelect: (files: FileList | File[] | null) => Promise<void>;
}

/**
 * Hook to manage folder scanning, race guards, background metadata extraction,
 * folder refreshing, and root removal with alias promotion.
 */
export function useFolderScanning({
  library,
  libraryRef: externalLibraryRef,
  onLibraryUpdated,
  onMigrateFavourites,
  onResetNavigationForFolder,
  onRemoveAllImportedFiles,
  onSourcesRemoved,
  setPendingFolders,
  setNeedsPermission,
}: UseFolderScanningProps): UseFolderScanningReturn {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);

  // Generation counter per folder to prevent stale scans from overwriting newer state
  const scanGenerationsRef = useRef<Map<string, number>>(new Map());

  const getNextScanGen = (folderId: string): number => {
    const next = (scanGenerationsRef.current.get(folderId) || 0) + 1;
    scanGenerationsRef.current.set(folderId, next);
    return next;
  };

  const isScanCurrent = (folderId: string, gen: number): boolean => {
    return scanGenerationsRef.current.get(folderId) === gen;
  };

  const cancelScan = (folderId: string) => {
    scanGenerationsRef.current.set(folderId, -1);
  };

  const fallbackLibraryRef = useRef<MusicLibrary | null>(library);
  fallbackLibraryRef.current = library;
  const activeLibraryRef = externalLibraryRef || fallbackLibraryRef;

  const {
    startIncrementalMetadataExtraction,
    invalidateMetadataSource,
    invalidateMetadataTracks,
  } = useMetadataExtractionPipeline({
    libraryRef: activeLibraryRef,
    onLibraryUpdated,
  });

  // Refresh an existing root folder
  const refreshFolder = useCallback(
    async (folderId: string) => {
      const targetFolder = library?.folders.find((f) => f.id === folderId);
      if (!targetFolder || !targetFolder.handle) return;

      const gen = getNextScanGen(folderId);
      setIsLoading(true);
      setScanProgress(0);

      targetFolder.isScanning = true;
      onLibraryUpdated((prev) => (prev ? { ...prev } : null));

      try {
        const hasPerm = await verifyHandlePermission(targetFolder.handle, false);
        if (!hasPerm) {
          targetFolder.permissionStatus = 'prompt';
          targetFolder.isScanning = false;
          onLibraryUpdated((prev) => (prev ? { ...prev } : null));
          return;
        }

        const scanned = await scanRootFolderHandle(targetFolder.handle, folderId, (count) => {
          setScanProgress(count);
        });

        if (!isScanCurrent(folderId, gen)) return;

        const otherFolders = (library?.folders || []).filter((f) => f.id !== folderId);
        const otherTracks = otherFolders.flatMap((f) => f.tracks);

        scanned.tracks = await reconcileOverlappingTracks(scanned.tracks, otherTracks, folderId);
        scanned.tree = buildFolderTree(scanned.name, scanned.tracks, folderId);
        scanned.permissionStatus = 'granted';

        // Preserve metadata already loaded if file content is unchanged
        const oldTrackMap = new Map<string, TrackItem>();
        for (const oldT of targetFolder.tracks) {
          oldTrackMap.set(oldT.id, oldT);
          if (oldT.aliases) {
            for (const a of oldT.aliases) {
              oldTrackMap.set(a, oldT);
            }
          }
        }

        scanned.tracks = scanned.tracks.map((t) => {
          const old = oldTrackMap.get(t.id);
          if (
            old &&
            old.metadata.isMetadataLoaded &&
            old.size === t.size &&
            old.lastModified === t.lastModified
          ) {
            return {
              ...t,
              metadata: old.metadata,
              status: old.status,
            };
          }
          return t;
        });

        const cache = await getMetadataCache();
        const { hydratedTracks, tracksNeedingExtraction } = applyCachedMetadataToTracks(
          scanned.tracks,
          cache
        );
        scanned.tracks = hydratedTracks;
        scanned.tree = buildFolderTree(scanned.name, scanned.tracks, folderId);

        const nextFolders = (library?.folders || []).map((f) => (f.id === folderId ? scanned : f));
        const unifiedTree = buildUnifiedMultiFolderTree(nextFolders);
        const flatPlaylist = combineFlatPlaylists(nextFolders);

        onLibraryUpdated(() => ({
          id: 'multi-library',
          name: 'Music Library',
          folders: nextFolders,
          tree: unifiedTree,
          flatPlaylist,
          sourceType: 'fs-access',
          handle: nextFolders[0]?.handle,
        }));

        await storeRegisteredFolders(nextFolders);
        startIncrementalMetadataExtraction(tracksNeedingExtraction, folderId, {
          invalidatePreviousForSource: true,
        });
      } catch (err) {
        console.error(`Failed to refresh folder ${folderId}:`, err);
      } finally {
        if (targetFolder) targetFolder.isScanning = false;
        setIsLoading(false);
      }
    },
    [library, onLibraryUpdated, startIncrementalMetadataExtraction]
  );

  // Pick folder via native File System Access API
  const openFolderPicker = useCallback(async () => {
    try {
      const handle = await promptOpenDirectory();
      if (!handle) return;

      const existingFolders = library?.folders || [];
      for (const existing of existingFolders) {
        if (existing.handle) {
          try {
            if (await existing.handle.isSameEntry(handle)) {
              await refreshFolder(existing.id);
              return;
            }
          } catch {
            // Ignore handle comparison error
          }
        }
      }

      const folderId = `fsa_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const gen = getNextScanGen(folderId);
      setIsLoading(true);
      setScanProgress(0);

      const scanned = await scanRootFolderHandle(handle, folderId, (count) => {
        setScanProgress(count);
      });

      if (!isScanCurrent(folderId, gen)) return;

      const currentFlat = library ? library.flatPlaylist : [];
      scanned.tracks = await reconcileOverlappingTracks(scanned.tracks, currentFlat, folderId);
      const cache = await getMetadataCache();
      const { hydratedTracks, tracksNeedingExtraction } = applyCachedMetadataToTracks(
        scanned.tracks,
        cache
      );
      scanned.tracks = hydratedTracks;
      scanned.tree = buildFolderTree(scanned.name, scanned.tracks, folderId);

      const nextFolders = [...existingFolders, scanned];
      const unifiedTree = buildUnifiedMultiFolderTree(nextFolders);
      const flatPlaylist = combineFlatPlaylists(nextFolders);

      onLibraryUpdated(() => ({
        id: 'multi-library',
        name: 'Music Library',
        folders: nextFolders,
        tree: unifiedTree,
        flatPlaylist,
        sourceType: 'fs-access',
        handle: nextFolders[0]?.handle,
      }));

      await storeRegisteredFolders(nextFolders);
      startIncrementalMetadataExtraction(tracksNeedingExtraction, folderId);
    } catch (err) {
      console.error('Folder picker error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [library, refreshFolder, onLibraryUpdated, startIncrementalMetadataExtraction]);

  // Remove a root folder from the library
  const removeFolder = useCallback(
    async (folderId: string) => {
      if (folderId === IMPORTED_FILES_ROOT_ID || folderId === 'imported-files-root') {
        await onRemoveAllImportedFiles();
        return;
      }

      cancelScan(folderId);
      invalidateMetadataSource(folderId);

      setPendingFolders((prev) => {
        const next = prev.filter((f) => f.id !== folderId);
        if (next.length === 0) {
          setNeedsPermission(false);
        }
        return next;
      });

      onResetNavigationForFolder(folderId);

      if (!library) return;

      const removedFolder = library.folders.find((f) => f.id === folderId);
      const candidateRemovedIds = removedFolder
        ? removedFolder.tracks.flatMap((t) => [t.id, ...(t.aliases || [])])
        : [];
      const remainingFolders = library.folders.filter((f) => f.id !== folderId);

      if (remainingFolders.length === 0) {
        cleanupCacheOnSourceRemoval(candidateRemovedIds, []);
        if (removedFolder) revokeUnusedArtworkUrls(removedFolder.tracks, []);
        onLibraryUpdated(() => null);
        onSourcesRemoved?.([], candidateRemovedIds, new Map());
        await storeRegisteredFolders([]);
        await clearStoredDirectoryHandle();
        return;
      }

      const idMigrations = new Map<string, string>();

      const updatedFolders = remainingFolders.map((f) => ({
        ...f,
        tracks: f.tracks.map((t) => {
          let updatedTrack: TrackItem = {
            ...t,
            folderIds: (t.folderIds || []).filter((id) => id !== folderId),
          };

          if (updatedTrack.id.startsWith(`${folderId}:`)) {
            const validAlias = updatedTrack.aliases?.find(
              (alias) => !alias.startsWith(`${folderId}:`)
            );
            if (validAlias) {
              idMigrations.set(updatedTrack.id, validAlias);
              const remainingAliases = (updatedTrack.aliases || []).filter(
                (a) => a !== updatedTrack.id
              );
              updatedTrack = {
                ...updatedTrack,
                id: validAlias,
                aliases: remainingAliases.includes(validAlias)
                  ? remainingAliases
                  : [validAlias, ...remainingAliases],
              };
            }
          }

          return updatedTrack;
        }),
      }));

      const refreshedFolders = updatedFolders.map((f) => ({
        ...f,
        tree: buildFolderTree(f.name, f.tracks, f.id),
      }));

      if (idMigrations.size > 0) {
        onMigrateFavourites(idMigrations);
        migratePlaylistsTrackIds(idMigrations);
      }

      // Separate physical folders from virtual imported files
      const physicalFolders = refreshedFolders.filter(
        (f) =>
          f.id !== IMPORTED_FILES_ROOT_ID &&
          f.id !== 'imported-files-root' &&
          f.sourceType !== 'files'
      );
      const remainingImported = refreshedFolders.find(
        (f) => f.id === IMPORTED_FILES_ROOT_ID || f.id === 'imported-files-root'
      );

      if (remainingImported) {
        const recordsToStore = remainingImported.tracks.map((t) => ({
          id: t.id,
          name: t.name,
          relativePath: t.relativePath,
          size: t.size,
          lastModified: t.lastModified,
          handle: t.handle,
          status: t.status,
          metadata: t.metadata,
          addedAt: Date.now(),
          aliases: t.aliases,
        }));
        await storeImportedFiles(recordsToStore);
      }

      await storeRegisteredFolders(physicalFolders);

      if (physicalFolders.length === 0) {
        await clearStoredDirectoryHandle();
      }

      const unifiedTree = buildUnifiedMultiFolderTree(refreshedFolders);
      const flatPlaylist = combineFlatPlaylists(refreshedFolders);

      cleanupCacheOnSourceRemoval(candidateRemovedIds, flatPlaylist, idMigrations);
      if (removedFolder) revokeUnusedArtworkUrls(removedFolder.tracks, flatPlaylist);
      onSourcesRemoved?.(flatPlaylist, candidateRemovedIds, idMigrations);

      onLibraryUpdated((prev) =>
        prev
          ? {
              ...prev,
              folders: refreshedFolders,
              tree: unifiedTree,
              flatPlaylist,
            }
          : null
      );
    },
    [
      library,
      onLibraryUpdated,
      onMigrateFavourites,
      onResetNavigationForFolder,
      onRemoveAllImportedFiles,
      setPendingFolders,
      setNeedsPermission,
    ]
  );

  // Handle fallback directory input
  const handleFallbackFolderSelect = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;

      setIsLoading(true);
      const parsed = parseFileList(files);
      if (parsed && parsed.folders.length > 0) {
        const newFolder = parsed.folders[0];
        // Reselecting a unique handleless source restores its original namespace.
        const candidates = (library?.folders || []).filter(folder =>
          folder.sourceType === 'input-fallback' && !folder.handle &&
          folder.permissionStatus !== 'granted' && folder.name === newFolder.name);
        const previous = candidates.length === 1 ? candidates[0] : undefined;
        if (previous) {
          newFolder.id = previous.id;
          newFolder.addedAt = previous.addedAt;
          newFolder.tracks = newFolder.tracks.map(track => ({ ...track,
            id: `${previous.id}:${track.relativePath}`, folderIds: [previous.id] }));
        }
        const cache = await getMetadataCache();
        const { hydratedTracks, tracksNeedingExtraction } = applyCachedMetadataToTracks(
          newFolder.tracks,
          cache
        );
        newFolder.tracks = hydratedTracks;
        newFolder.tree = buildFolderTree(newFolder.name, newFolder.tracks, newFolder.id);
        const existing = library?.folders || [];
        const nextFolders = previous
          ? existing.map(folder => folder.id === newFolder.id ? newFolder : folder)
          : [...existing, newFolder];
        setPendingFolders(pending => {
          const remaining = pending.filter(folder => folder.id !== newFolder.id);
          setNeedsPermission(remaining.length > 0);
          return remaining;
        });
        const unifiedTree = buildUnifiedMultiFolderTree(nextFolders);
        const flatPlaylist = combineFlatPlaylists(nextFolders);

        onLibraryUpdated(() => ({
          id: 'multi-library',
          name: 'Music Library',
          folders: nextFolders,
          tree: unifiedTree,
          flatPlaylist,
          sourceType: 'input-fallback',
        }));

        await storeRegisteredFolders(nextFolders);
        startIncrementalMetadataExtraction(tracksNeedingExtraction, newFolder.id);
      }
      setIsLoading(false);
    },
    [library, onLibraryUpdated, startIncrementalMetadataExtraction, setPendingFolders, setNeedsPermission]
  );

  return {
    isLoading,
    setIsLoading,
    scanProgress,
    setScanProgress,
    startIncrementalMetadataExtraction,
    invalidateMetadataSource,
    invalidateMetadataTracks,
    refreshFolder,
    openFolderPicker,
    removeFolder,
    handleFallbackFolderSelect,
  };
}
