import { useState, useEffect, useCallback } from 'react';
import {
  TrackItem,
  FileStatus,
  ImportedFolder,
  StoredFolderRecord,
  MusicLibrary,
  IMPORTED_FILES_ROOT_ID,
  IMPORTED_FILES_COLLECTION_NAME,
} from '../types/music';
import {
  scanRootFolderHandle,
  verifyHandlePermission,
  isFileSystemAccessSupported,
} from '../services/directoryAccess';
import {
  storeRegisteredFolders,
  getStoredRegisteredFolders,
  getStoredImportedFiles,
  getStoredPlaybackState,
  getMetadataCache,
  applyCachedMetadataToTracks,
} from '../services/idbStorage';
import {
  buildFolderTree,
  buildUnifiedMultiFolderTree,
  combineFlatPlaylists,
  reconcileOverlappingTracks,
  mergeTrackMetadataAndSources,
} from '../utils/musicTree';
import { createFallbackMetadata } from '../utils/metadata';

export interface UseLibraryInitializationProps {
  library: MusicLibrary | null;
  onLibraryInitialized: (library: MusicLibrary) => void;
  onSetInitialFavourites: (favourites: Set<string>) => void;
  startIncrementalMetadataExtraction: (
    tracks: TrackItem[],
    sourceId?: string,
    options?: { invalidatePreviousForSource?: boolean }
  ) => void;
  setIsLoading: (loading: boolean) => void;
}

export interface UseLibraryInitializationReturn {
  isInitialized: boolean;
  needsPermission: boolean;
  setNeedsPermission: React.Dispatch<React.SetStateAction<boolean>>;
  pendingFolders: StoredFolderRecord[];
  setPendingFolders: React.Dispatch<React.SetStateAction<StoredFolderRecord[]>>;
  requestPermissionAndLoad: () => Promise<void>;
  requestPermissionForFolder: (folderId: string) => Promise<void>;
}

/**
 * Hook to manage startup library restoration from IndexedDB, legacy record migration,
 * handle permission checks, and user-initiated permission resolution workflows.
 */
export function useLibraryInitialization({
  library,
  onLibraryInitialized,
  onSetInitialFavourites,
  startIncrementalMetadataExtraction,
  setIsLoading,
}: UseLibraryInitializationProps): UseLibraryInitializationReturn {
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [needsPermission, setNeedsPermission] = useState<boolean>(false);
  const [pendingFolders, setPendingFolders] = useState<StoredFolderRecord[]>([]);

  // Load stored state and registered folders on mount
  useEffect(() => {
    async function init() {
      const [storedState, metadataCache] = await Promise.all([
        getStoredPlaybackState(),
        getMetadataCache(),
      ]);
      if (storedState.favourites) {
        onSetInitialFavourites(new Set(storedState.favourites));
      }

      let loadedFolders: ImportedFolder[] = [];
      let promptImportedFolders: ImportedFolder[] = [];
      const extractionBatches: Array<{ sourceId: string; tracks: TrackItem[] }> = [];

      if (isFileSystemAccessSupported()) {
        const storedFolders = await getStoredRegisteredFolders();
        // Check for legacy migration: remove legacy pseudo-folders created for individual file fallback.
        // Legitimate folders imported through FSA or HTML folder-input fallback (sourceType: 'input-fallback')
        // are strictly preserved, even if named 'Selected Audio' without a persistent directory handle.
        const isLegacyFolder = (f: StoredFolderRecord) =>
          f.sourceType === 'files' ||
          f.id === IMPORTED_FILES_ROOT_ID ||
          f.id === 'imported-files-root' ||
          f.id.startsWith('files:') ||
          (!f.sourceType && f.name === 'Selected Audio');
        const legacyFolders = storedFolders.filter(isLegacyFolder);
        const validStoredFolders = storedFolders.filter((f) => !isLegacyFolder(f));
        if (legacyFolders.length > 0) {
          await storeRegisteredFolders(validStoredFolders);
        }

        if (validStoredFolders.length > 0) {
          const grantedFolders: StoredFolderRecord[] = [];
          const promptFolders: StoredFolderRecord[] = [];

          for (const record of validStoredFolders) {
            if (record.handle) {
              const hasPerm = await verifyHandlePermission(record.handle, false);
              if (hasPerm) {
                grantedFolders.push(record);
              } else {
                promptFolders.push(record);
              }
            }
          }

          if (promptFolders.length > 0) {
            setPendingFolders(promptFolders);
            setNeedsPermission(true);
          }

          promptImportedFolders = promptFolders.map((p) => ({
            id: p.id,
            name: p.name,
            sourceType: p.sourceType,
            handle: p.handle,
            tree: {
              id: p.id,
              name: p.name,
              relativePath: p.id,
              tracks: [],
              subfolders: [],
              totalTrackCount: p.trackCount || 0,
            },
            tracks: [],
            trackCount: p.trackCount || 0,
            addedAt: p.addedAt,
            lastScannedAt: p.lastScannedAt || p.addedAt,
            permissionStatus: 'prompt',
          }));

          let existingTracksAccum: TrackItem[] = [];

          if (grantedFolders.length > 0) {
            setIsLoading(true);

            for (const record of grantedFolders) {
              try {
                const scanned = await scanRootFolderHandle(record.handle!, record.id);
                scanned.tracks = await reconcileOverlappingTracks(
                  scanned.tracks,
                  existingTracksAccum,
                  scanned.id
                );
                const hydrated = applyCachedMetadataToTracks(scanned.tracks, metadataCache);
                scanned.tracks = hydrated.hydratedTracks;
                if (hydrated.tracksNeedingExtraction.length > 0) {
                  extractionBatches.push({ sourceId: scanned.id, tracks: hydrated.tracksNeedingExtraction });
                }
                scanned.tree = buildFolderTree(scanned.name, scanned.tracks, scanned.id);
                scanned.permissionStatus = 'granted';
                loadedFolders.push(scanned);
                existingTracksAccum = combineFlatPlaylists(loadedFolders);
              } catch (err) {
                console.error(`Failed to load folder ${record.name}:`, err);
              }
            }
            setIsLoading(false);
          }
        }
      }

      // Load stored imported files (virtual collection)
      const storedImported = await getStoredImportedFiles();
      let importedFilesFolder: ImportedFolder | null = null;

      if (storedImported && storedImported.length > 0) {
        const importedTracks: TrackItem[] = [];
        for (const rec of storedImported) {
          let fileObj: File | undefined = undefined;
          let status: FileStatus = rec.status || 'normal';

          if (rec.handle) {
            const hasPerm = await verifyHandlePermission(rec.handle, false);
            if (hasPerm) {
              try {
                fileObj = await rec.handle.getFile();
                status = fileObj.size === 0 ? 'empty' : 'normal';
              } catch {
                status = 'unreadable';
              }
            } else {
              status = 'unreadable';
            }
          } else {
            status = 'unreadable';
          }

          importedTracks.push({
            id: rec.id,
            name: rec.name,
            relativePath: rec.relativePath,
            size: rec.size,
            lastModified: rec.lastModified,
            handle: rec.handle,
            file: fileObj,
            status,
            metadata: rec.metadata || createFallbackMetadata(rec.name, rec.relativePath),
            folderIds: [IMPORTED_FILES_ROOT_ID],
            aliases: rec.aliases || [rec.id],
          });
        }

        // Reconcile imported tracks with loaded folder tracks to unify identity and share lyrics
        const allLoadedTracks = loadedFolders.flatMap((f) => f.tracks);
        for (let i = 0; i < importedTracks.length; i++) {
          const imp = importedTracks[i];
          if (imp.handle) {
            for (const loaded of allLoadedTracks) {
              if (loaded.handle && loaded.name === imp.name) {
                try {
                  let isSame = false;
                  if (typeof imp.handle.isSameEntry === 'function') {
                    isSame = await imp.handle.isSameEntry(loaded.handle);
                  }
                  if (!isSame && typeof loaded.handle.isSameEntry === 'function') {
                    isSame = await loaded.handle.isSameEntry(imp.handle);
                  }
                  if (isSame) {
                    mergeTrackMetadataAndSources(loaded, imp);
                    importedTracks[i] = loaded;
                    break;
                  }
                } catch {
                  // Ignore handle comparison error
                }
              }
            }
          }
        }

        const hydratedImported = applyCachedMetadataToTracks(importedTracks, metadataCache);
        const finalImportedTracks = hydratedImported.hydratedTracks;
        if (hydratedImported.tracksNeedingExtraction.length > 0) {
          extractionBatches.push({
            sourceId: IMPORTED_FILES_ROOT_ID,
            tracks: hydratedImported.tracksNeedingExtraction,
          });
        }

        importedFilesFolder = {
          id: IMPORTED_FILES_ROOT_ID,
          name: IMPORTED_FILES_COLLECTION_NAME,
          sourceType: 'files',
          tree: {
            id: IMPORTED_FILES_ROOT_ID,
            name: IMPORTED_FILES_COLLECTION_NAME,
            relativePath: IMPORTED_FILES_ROOT_ID,
            tracks: finalImportedTracks,
            subfolders: [],
            totalTrackCount: finalImportedTracks.length,
          },
          tracks: finalImportedTracks,
          trackCount: finalImportedTracks.length,
          addedAt: storedImported[0]?.addedAt || Date.now(),
          lastScannedAt: Date.now(),
          permissionStatus: 'granted',
        };
      }

      const allInitialFolders = [
        ...loadedFolders,
        ...promptImportedFolders,
        ...(importedFilesFolder ? [importedFilesFolder] : []),
      ];

      if (allInitialFolders.length > 0) {
        const unifiedTree = buildUnifiedMultiFolderTree(allInitialFolders);
        const playableFolders = [
          ...loadedFolders,
          ...(importedFilesFolder ? [importedFilesFolder] : []),
        ];
        const flatPlaylist = combineFlatPlaylists(playableFolders);

        const initialLib: MusicLibrary = {
          id: 'multi-library',
          name: 'Music Library',
          folders: allInitialFolders,
          tree: unifiedTree,
          flatPlaylist,
          sourceType: loadedFolders.length > 0 ? 'fs-access' : 'files',
          handle: allInitialFolders[0]?.handle,
        };

        onLibraryInitialized(initialLib);

        for (const batch of extractionBatches) {
          startIncrementalMetadataExtraction(batch.tracks, batch.sourceId);
        }
      }
      setIsInitialized(true);
    }

    init();
  }, []);

  // Request permission for previously stored handles
  const requestPermissionAndLoad = useCallback(async () => {
    if (pendingFolders.length === 0) return;

    setIsLoading(true);
    const metadataCache = await getMetadataCache();
    const stillPending: StoredFolderRecord[] = [];
    const newlyGrantedFolders: ImportedFolder[] = [];
    const grantedBatches: Array<{ sourceId: string; tracks: TrackItem[] }> = [];

    let currentTracks = library ? library.flatPlaylist : [];

    for (const record of pendingFolders) {
      if (!record.handle) continue;
      try {
        const granted = await verifyHandlePermission(record.handle, true);
        if (granted) {
          const scanned = await scanRootFolderHandle(record.handle, record.id);
          scanned.tracks = await reconcileOverlappingTracks(scanned.tracks, currentTracks, record.id);
          const hydrated = applyCachedMetadataToTracks(scanned.tracks, metadataCache);
          scanned.tracks = hydrated.hydratedTracks;
          if (hydrated.tracksNeedingExtraction.length > 0) {
            grantedBatches.push({ sourceId: record.id, tracks: hydrated.tracksNeedingExtraction });
          }
          scanned.tree = buildFolderTree(scanned.name, scanned.tracks, record.id);
          newlyGrantedFolders.push(scanned);
          currentTracks = combineFlatPlaylists([...(library?.folders || []), ...newlyGrantedFolders]);
        } else {
          stillPending.push(record);
        }
      } catch {
        stillPending.push(record);
      }
    }

    setPendingFolders(stillPending);
    setNeedsPermission(stillPending.length > 0);

    if (newlyGrantedFolders.length > 0) {
      const mergedFolders = [...(library?.folders || []), ...newlyGrantedFolders];
      const unifiedTree = buildUnifiedMultiFolderTree(mergedFolders);
      const flatPlaylist = combineFlatPlaylists(mergedFolders);

      const nextLib: MusicLibrary = {
        id: 'multi-library',
        name: 'Music Library',
        folders: mergedFolders,
        tree: unifiedTree,
        flatPlaylist,
        sourceType: 'fs-access',
        handle: mergedFolders[0]?.handle,
      };

      onLibraryInitialized(nextLib);

      await storeRegisteredFolders(mergedFolders);
      for (const batch of grantedBatches) {
        startIncrementalMetadataExtraction(batch.tracks, batch.sourceId);
      }
    }
    setIsLoading(false);
  }, [pendingFolders, library, onLibraryInitialized, startIncrementalMetadataExtraction, setIsLoading]);

  // Request permission for a single folder and scan it
  const requestPermissionForFolder = useCallback(
    async (folderId: string) => {
      const targetFolder = library?.folders.find((f) => f.id === folderId);
      const targetPending = pendingFolders.find((f) => f.id === folderId);
      const handle = targetFolder?.handle || targetPending?.handle;
      if (!handle) return;

      setIsLoading(true);
      try {
        const granted = await verifyHandlePermission(handle, true);
        if (granted) {
          const scanned = await scanRootFolderHandle(handle, folderId);
          const otherFolders = (library?.folders || []).filter((f) => f.id !== folderId);
          const otherTracks = otherFolders.flatMap((f) => f.tracks);

          scanned.tracks = await reconcileOverlappingTracks(scanned.tracks, otherTracks, folderId);
          const metadataCache = await getMetadataCache();
          const hydrated = applyCachedMetadataToTracks(scanned.tracks, metadataCache);
          scanned.tracks = hydrated.hydratedTracks;
          scanned.tree = buildFolderTree(scanned.name, scanned.tracks, folderId);
          scanned.permissionStatus = 'granted';

          const exists = (library?.folders || []).some((f) => f.id === folderId);
          const nextFolders = exists
            ? (library?.folders || []).map((f) => (f.id === folderId ? scanned : f))
            : [...(library?.folders || []), scanned];

          const unifiedTree = buildUnifiedMultiFolderTree(nextFolders);
          const flatPlaylist = combineFlatPlaylists(nextFolders);

          const nextLib: MusicLibrary = {
            id: 'multi-library',
            name: 'Music Library',
            folders: nextFolders,
            tree: unifiedTree,
            flatPlaylist,
            sourceType: 'fs-access',
            handle: nextFolders[0]?.handle,
          };

          onLibraryInitialized(nextLib);

          const remainingPending = pendingFolders.filter((f) => f.id !== folderId);
          setPendingFolders(remainingPending);
          setNeedsPermission(remainingPending.length > 0);

          await storeRegisteredFolders(nextFolders);
          startIncrementalMetadataExtraction(hydrated.tracksNeedingExtraction, folderId);
        } else {
          if (targetFolder) {
            targetFolder.permissionStatus = 'denied';
            onLibraryInitialized({ ...library! });
          }
        }
      } catch (err) {
        console.error(`Failed to grant permission for folder ${folderId}:`, err);
      } finally {
        setIsLoading(false);
      }
    },
    [library, pendingFolders, onLibraryInitialized, startIncrementalMetadataExtraction, setIsLoading]
  );

  return {
    isInitialized,
    needsPermission,
    setNeedsPermission,
    pendingFolders,
    setPendingFolders,
    requestPermissionAndLoad,
    requestPermissionForFolder,
  };
}
