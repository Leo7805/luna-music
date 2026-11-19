import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  MusicLibrary,
  TrackItem,
  LibraryView,
  AlbumGroup,
  ArtistGroup,
  FolderNode,
  FileStatus,
  ImportedFolder,
  StoredFolderRecord,
  StoredImportedFileRecord,
  IMPORTED_FILES_ROOT_ID,
  IMPORTED_FILES_COLLECTION_NAME,
} from '../types/music';
import {
  scanRootFolderHandle,
  promptOpenDirectory,
  promptOpenFiles,
  verifyHandlePermission,
  isFileSystemAccessSupported,
} from '../services/directoryAccess';
import { parseFileList } from '../services/fallbackAccess';
import {
  storeRegisteredFolders,
  getStoredRegisteredFolders,
  storeImportedFiles,
  getStoredImportedFiles,
  storePlaybackState,
  getStoredPlaybackState,
  getStoredPlaylists,
  storePlaylists,
} from '../services/idbStorage';
import {
  findFolderNodeByPath,
  buildFolderTree,
  buildUnifiedMultiFolderTree,
  combineFlatPlaylists,
  reconcileOverlappingTracks,
  resolveFavouriteTracks,
  isFavouriteTrack,
  isSupportedAudioFile,
  isLrcFile,
} from '../utils/musicTree';
import { extractAudioMetadata, createFallbackMetadata } from '../utils/metadata';
import { naturalSort } from '../utils/naturalSort';

export function useMusicLibrary() {
  const [library, setLibrary] = useState<MusicLibrary | null>(null);
  const [currentView, setCurrentView] = useState<LibraryView>('all');
  const [selectedFolderPath, setSelectedFolderPath] = useState<string>('');
  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [needsPermission, setNeedsPermission] = useState<boolean>(false);
  const [pendingFolders, setPendingFolders] = useState<StoredFolderRecord[]>([]);

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

  const metadataQueueRef = useRef<{ isRunning: boolean; cancel: boolean }>({
    isRunning: false,
    cancel: false,
  });

  // Load stored state and registered folders on mount
  useEffect(() => {
    async function init() {
      const storedState = await getStoredPlaybackState();
      if (storedState.favourites) {
        setFavourites(new Set(storedState.favourites));
      }

      let loadedFolders: ImportedFolder[] = [];
      let promptImportedFolders: ImportedFolder[] = [];

      if (isFileSystemAccessSupported()) {
        const storedFolders = await getStoredRegisteredFolders();
        // Check for legacy migration: remove any legacy folder with sourceType === 'files' or name === 'Selected Audio'
        const legacyFolders = storedFolders.filter(
          (f) => f.sourceType === 'files' || f.name === 'Selected Audio'
        );
        const validStoredFolders = storedFolders.filter(
          (f) => f.sourceType !== 'files' && f.name !== 'Selected Audio'
        );
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
            tracks: importedTracks,
            subfolders: [],
            totalTrackCount: importedTracks.length,
          },
          tracks: importedTracks,
          trackCount: importedTracks.length,
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

        setLibrary({
          id: 'multi-library',
          name: 'Music Library',
          folders: allInitialFolders,
          tree: unifiedTree,
          flatPlaylist,
          sourceType: loadedFolders.length > 0 ? 'fs-access' : 'files',
          handle: allInitialFolders[0]?.handle,
        });

        if (flatPlaylist.length > 0) {
          startIncrementalMetadataExtraction(flatPlaylist);
        }
      }
    }

    init();
  }, []);

  // Queue to incrementally extract metadata in background
  const startIncrementalMetadataExtraction = useCallback((tracks: TrackItem[]) => {
    // Cancel previous runner if any
    metadataQueueRef.current.cancel = true;

    const currentRunner = { isRunning: true, cancel: false };
    metadataQueueRef.current = currentRunner;

    const unparsed = [...tracks];

    async function processQueue() {
      const concurrency = 3;
      let idx = 0;

      async function worker() {
        while (idx < unparsed.length && !currentRunner.cancel) {
          const track = unparsed[idx++];
          if (!track || track.metadata.isMetadataLoaded || track.size === 0) continue;

          try {
            let blob: Blob | null = null;
            if (track.handle) {
              blob = await track.handle.getFile();
            } else if (track.file) {
              blob = track.file;
            }

            if (blob && !currentRunner.cancel) {
              const meta = await extractAudioMetadata(blob, track.metadata.title);
              if (!currentRunner.cancel && meta) {
                setLibrary((prevLib) => {
                  if (!prevLib) return null;
                  const updatedFlat = prevLib.flatPlaylist.map((t) => {
                    if (t.id === track.id) {
                      return {
                        ...t,
                        metadata: {
                          ...t.metadata,
                          ...meta,
                          isMetadataLoaded: true,
                        },
                      };
                    }
                    return t;
                  });

                  function updateNode(node: FolderNode): FolderNode {
                    return {
                      ...node,
                      tracks: node.tracks.map((t) => {
                        if (t.id === track.id) {
                          return {
                            ...t,
                            metadata: {
                              ...t.metadata,
                              ...meta,
                              isMetadataLoaded: true,
                            },
                          };
                        }
                        return t;
                      }),
                      subfolders: node.subfolders.map(updateNode),
                    };
                  }

                  const updatedFolders = (prevLib.folders || []).map((f) => ({
                    ...f,
                    tracks: f.tracks.map((t) => {
                      if (t.id === track.id) {
                        return {
                          ...t,
                          metadata: {
                            ...t.metadata,
                            ...meta,
                            isMetadataLoaded: true,
                          },
                        };
                      }
                      return t;
                    }),
                    tree: updateNode(f.tree),
                  }));

                  return {
                    ...prevLib,
                    folders: updatedFolders,
                    flatPlaylist: updatedFlat,
                    tree: updateNode(prevLib.tree),
                  };
                });
              }
            }
          } catch {
            // Ignore parse errors on individual track
          }
        }
      }

      await Promise.all(
        Array.from({ length: concurrency }).map(() => worker())
      );

      currentRunner.isRunning = false;
    }

    processQueue();
  }, []);

  // Request permission for previously stored handles
  const requestPermissionAndLoad = useCallback(async () => {
    if (pendingFolders.length === 0) return;

    setIsLoading(true);
    const stillPending: StoredFolderRecord[] = [];
    const newlyGrantedFolders: ImportedFolder[] = [];

    // Snapshot of existing tracks for handle-level reconciliation
    let currentTracks = library ? library.flatPlaylist : [];

    for (const record of pendingFolders) {
      if (!record.handle) continue;
      try {
        const granted = await verifyHandlePermission(record.handle, true);
        if (granted) {
          const scanned = await scanRootFolderHandle(record.handle, record.id);
          scanned.tracks = await reconcileOverlappingTracks(scanned.tracks, currentTracks, scanned.id);
          scanned.tree = buildFolderTree(scanned.name, scanned.tracks, scanned.id);
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

      setLibrary({
        id: 'multi-library',
        name: 'Music Library',
        folders: mergedFolders,
        tree: unifiedTree,
        flatPlaylist,
        sourceType: 'fs-access',
        handle: mergedFolders[0]?.handle,
      });

      await storeRegisteredFolders(mergedFolders);
      startIncrementalMetadataExtraction(flatPlaylist);
    }
    setIsLoading(false);
  }, [pendingFolders, library, startIncrementalMetadataExtraction]);

  // Refresh an existing root folder
  const refreshFolder = useCallback(
    async (folderId: string) => {
      const targetFolder = library?.folders.find((f) => f.id === folderId);
      if (!targetFolder || !targetFolder.handle) return;

      const gen = getNextScanGen(folderId);
      setIsLoading(true);
      setScanProgress(0);

      // Mark folder scanning state
      targetFolder.isScanning = true;
      setLibrary((prev) => (prev ? { ...prev } : null));

      try {
        const hasPerm = await verifyHandlePermission(targetFolder.handle, false);
        if (!hasPerm) {
          targetFolder.permissionStatus = 'prompt';
          targetFolder.isScanning = false;
          setLibrary((prev) => (prev ? { ...prev } : null));
          return;
        }

        const scanned = await scanRootFolderHandle(targetFolder.handle, folderId, (count) => {
          setScanProgress(count);
        });

        if (!isScanCurrent(folderId, gen)) return;

        // Reconcile with other folders' tracks to maintain stable IDs and deduplication
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

        const nextFolders = (library?.folders || []).map((f) => (f.id === folderId ? scanned : f));
        const unifiedTree = buildUnifiedMultiFolderTree(nextFolders);
        const flatPlaylist = combineFlatPlaylists(nextFolders);

        setLibrary({
          id: 'multi-library',
          name: 'Music Library',
          folders: nextFolders,
          tree: unifiedTree,
          flatPlaylist,
          sourceType: 'fs-access',
          handle: nextFolders[0]?.handle,
        });

        await storeRegisteredFolders(nextFolders);
        startIncrementalMetadataExtraction(flatPlaylist);
      } catch (err) {
        console.error(`Failed to refresh folder ${folderId}:`, err);
      } finally {
        if (targetFolder) targetFolder.isScanning = false;
        setIsLoading(false);
      }
    },
    [library, startIncrementalMetadataExtraction]
  );

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
          scanned.tree = buildFolderTree(scanned.name, scanned.tracks, folderId);
          scanned.permissionStatus = 'granted';

          const exists = (library?.folders || []).some((f) => f.id === folderId);
          const nextFolders = exists
            ? (library?.folders || []).map((f) => (f.id === folderId ? scanned : f))
            : [...(library?.folders || []), scanned];

          const unifiedTree = buildUnifiedMultiFolderTree(nextFolders);
          const flatPlaylist = combineFlatPlaylists(nextFolders);

          setLibrary({
            id: 'multi-library',
            name: 'Music Library',
            folders: nextFolders,
            tree: unifiedTree,
            flatPlaylist,
            sourceType: 'fs-access',
            handle: nextFolders[0]?.handle,
          });

          const remainingPending = pendingFolders.filter((f) => f.id !== folderId);
          setPendingFolders(remainingPending);
          setNeedsPermission(remainingPending.length > 0);

          await storeRegisteredFolders(nextFolders);
          startIncrementalMetadataExtraction(flatPlaylist);
        } else {
          if (targetFolder) {
            targetFolder.permissionStatus = 'denied';
            setLibrary((prev) => (prev ? { ...prev } : null));
          }
        }
      } catch (err) {
        console.error(`Failed to grant permission for folder ${folderId}:`, err);
      } finally {
        setIsLoading(false);
      }
    },
    [library, pendingFolders, startIncrementalMetadataExtraction]
  );

  // Pick folder via native File System Access API
  const openFolderPicker = useCallback(async () => {
    try {
      const handle = await promptOpenDirectory();
      if (!handle) return;

      // Deduplication check: Is this exact directory handle already imported?
      const existingFolders = library?.folders || [];
      for (const existing of existingFolders) {
        if (existing.handle) {
          try {
            if (await existing.handle.isSameEntry(handle)) {
              // Same directory selected again -> refresh it instead of adding duplicate!
              await refreshFolder(existing.id);
              return;
            }
          } catch {
            // isSameEntry failed or permission issue
          }
        }
      }

      // Generate stable folder ID and start scan with race guard
      const folderId = `fsa_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const gen = getNextScanGen(folderId);
      setIsLoading(true);
      setScanProgress(0);

      const scanned = await scanRootFolderHandle(handle, folderId, (count) => {
        setScanProgress(count);
      });

      // Generation guard check: was this folder cancelled or superseded?
      if (!isScanCurrent(folderId, gen)) return;

      // Reconcile overlapping tracks using handle.isSameEntry
      const currentFlat = library ? library.flatPlaylist : [];
      scanned.tracks = await reconcileOverlappingTracks(scanned.tracks, currentFlat, folderId);
      scanned.tree = buildFolderTree(scanned.name, scanned.tracks, folderId);

      // Merge into library folders list
      const nextFolders = [...existingFolders, scanned];
      const unifiedTree = buildUnifiedMultiFolderTree(nextFolders);
      const flatPlaylist = combineFlatPlaylists(nextFolders);

      setLibrary({
        id: 'multi-library',
        name: 'Music Library',
        folders: nextFolders,
        tree: unifiedTree,
        flatPlaylist,
        sourceType: 'fs-access',
        handle: nextFolders[0]?.handle,
      });

      await storeRegisteredFolders(nextFolders);
      startIncrementalMetadataExtraction(flatPlaylist);
    } catch (err) {
      console.error('Folder picker error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [library, refreshFolder, startIncrementalMetadataExtraction]);

  // Pick individual files via native File System Access API
  const openFilesPicker = useCallback(async () => {
    try {
      const handles = await promptOpenFiles();
      if (!handles || handles.length === 0) return;

      setIsLoading(true);
      const existingImportedFolder = library?.folders.find((f) => f.id === IMPORTED_FILES_ROOT_ID);
      const existingTracks = existingImportedFolder ? [...existingImportedFolder.tracks] : [];
      const newTracks: TrackItem[] = [];

      for (const handle of handles) {
        let alreadyExists = false;
        for (const existing of existingTracks) {
          if (existing.handle) {
            try {
              if (await existing.handle.isSameEntry(handle)) {
                alreadyExists = true;
                break;
              }
            } catch {
              // Ignore
            }
          }
        }
        if (alreadyExists) continue;

        try {
          const file = await handle.getFile();
          const stableId = `${IMPORTED_FILES_ROOT_ID}:${file.name}`;
          const finalId =
            existingTracks.some((t) => t.id === stableId) ||
            newTracks.some((t) => t.id === stableId)
              ? `${IMPORTED_FILES_ROOT_ID}:${file.name}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
              : stableId;

          const trackItem: TrackItem = {
            id: finalId,
            name: file.name,
            relativePath: file.name,
            size: file.size,
            lastModified: file.lastModified,
            handle,
            file,
            metadata: createFallbackMetadata(file.name, file.name),
            status: file.size === 0 ? 'empty' : 'normal',
            folderIds: [IMPORTED_FILES_ROOT_ID],
          };
          newTracks.push(trackItem);
        } catch (err) {
          console.error('Error reading file handle:', err);
        }
      }

      if (newTracks.length === 0) {
        setIsLoading(false);
        return;
      }

      const allImportedTracks = [...existingTracks, ...newTracks];
      const updatedImportedFolder: ImportedFolder = {
        id: IMPORTED_FILES_ROOT_ID,
        name: IMPORTED_FILES_COLLECTION_NAME,
        sourceType: 'files',
        tree: {
          id: IMPORTED_FILES_ROOT_ID,
          name: IMPORTED_FILES_COLLECTION_NAME,
          relativePath: IMPORTED_FILES_ROOT_ID,
          tracks: allImportedTracks,
          subfolders: [],
          totalTrackCount: allImportedTracks.length,
        },
        tracks: allImportedTracks,
        trackCount: allImportedTracks.length,
        addedAt: existingImportedFolder?.addedAt || Date.now(),
        lastScannedAt: Date.now(),
        permissionStatus: 'granted',
      };

      const recordsToStore: StoredImportedFileRecord[] = allImportedTracks.map((t) => ({
        id: t.id,
        name: t.name,
        relativePath: t.relativePath,
        size: t.size,
        lastModified: t.lastModified,
        handle: t.handle,
        status: t.status,
        metadata: t.metadata,
        addedAt: Date.now(),
      }));
      await storeImportedFiles(recordsToStore);

      const otherFolders = (library?.folders || []).filter((f) => f.id !== IMPORTED_FILES_ROOT_ID);
      const nextFolders = [...otherFolders, updatedImportedFolder];
      const unifiedTree = buildUnifiedMultiFolderTree(nextFolders);
      const flatPlaylist = combineFlatPlaylists(nextFolders);

      setLibrary({
        id: 'multi-library',
        name: 'Music Library',
        folders: nextFolders,
        tree: unifiedTree,
        flatPlaylist,
        sourceType: library?.sourceType || 'fs-access',
        handle: nextFolders[0]?.handle,
      });

      startIncrementalMetadataExtraction(newTracks);
    } catch (err) {
      console.error('Failed to open files:', err);
    } finally {
      setIsLoading(false);
    }
  }, [library, startIncrementalMetadataExtraction]);

  // Remove individual imported files from the virtual collection
  const removeImportedFiles = useCallback(
    async (trackIds: string[]) => {
      const idSet = new Set(trackIds);
      const existingImportedFolder = library?.folders.find((f) => f.id === IMPORTED_FILES_ROOT_ID);
      if (!existingImportedFolder) return;

      const remainingTracks = existingImportedFolder.tracks.filter((t) => !idSet.has(t.id));

      const updatedFolder: ImportedFolder = {
        ...existingImportedFolder,
        tracks: remainingTracks,
        trackCount: remainingTracks.length,
        tree: {
          ...existingImportedFolder.tree,
          tracks: remainingTracks,
          totalTrackCount: remainingTracks.length,
        },
      };

      const recordsToStore: StoredImportedFileRecord[] = remainingTracks.map((t) => ({
        id: t.id,
        name: t.name,
        relativePath: t.relativePath,
        size: t.size,
        lastModified: t.lastModified,
        handle: t.handle,
        status: t.status,
        metadata: t.metadata,
        addedAt: Date.now(),
      }));
      await storeImportedFiles(recordsToStore);

      // Clean up favourites for removed tracks that don't belong to any other remaining folder
      setFavourites((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const trackId of trackIds) {
          if (next.has(trackId)) {
            next.delete(trackId);
            changed = true;
          }
        }
        if (changed) {
          storePlaybackState({ favourites: Array.from(next) });
          return next;
        }
        return prev;
      });

      const otherFolders = (library?.folders || []).filter((f) => f.id !== IMPORTED_FILES_ROOT_ID);
      const nextFolders = remainingTracks.length > 0 ? [...otherFolders, updatedFolder] : otherFolders;

      if (nextFolders.length === 0) {
        setLibrary(null);
        setSelectedFolderPath('');
        return;
      }

      const unifiedTree = buildUnifiedMultiFolderTree(nextFolders);
      const flatPlaylist = combineFlatPlaylists(nextFolders);

      setLibrary((prev) =>
        prev
          ? {
              ...prev,
              folders: nextFolders,
              tree: unifiedTree,
              flatPlaylist,
            }
          : null
      );
    },
    [library]
  );

  // Remove all imported files from library
  const removeAllImportedFiles = useCallback(async () => {
    const existingImportedFolder = library?.folders.find((f) => f.id === IMPORTED_FILES_ROOT_ID);
    if (!existingImportedFolder) return;
    const allIds = existingImportedFolder.tracks.map((t) => t.id);
    await removeImportedFiles(allIds);
  }, [library, removeImportedFiles]);

  // Remove a root folder from the library
  const removeFolder = useCallback(
    async (folderId: string) => {
      if (folderId === IMPORTED_FILES_ROOT_ID) {
        await removeAllImportedFiles();
        return;
      }

      // Invalidate any in-flight scan for this folder
      cancelScan(folderId);

      // Also clean up pendingFolders if this folder was in pending status
      setPendingFolders((prev) => {
        const next = prev.filter((f) => f.id !== folderId);
        if (next.length === 0) {
          setNeedsPermission(false);
        }
        return next;
      });

      // If the removed folder was selected or parent of selected, reset folder path
      setSelectedFolderPath((prev) => {
        if (prev === folderId || prev.startsWith(`${folderId}/`)) {
          return '';
        }
        return prev;
      });

      if (!library) return;

      const remainingFolders = library.folders.filter((f) => f.id !== folderId);

      if (remainingFolders.length === 0) {
        setLibrary(null);
        setSelectedFolderPath('');
        await storeRegisteredFolders([]);
        return;
      }

      // Track ID migration map (oldId -> newId) for promoted aliases
      const idMigrations = new Map<string, string>();

      // Update remaining folders: prune folderId and promote alias if needed
      const updatedFolders = remainingFolders.map((f) => ({
        ...f,
        tracks: f.tracks.map((t) => {
          let updatedTrack: TrackItem = {
            ...t,
            folderIds: (t.folderIds || []).filter((id) => id !== folderId),
          };

          if (updatedTrack.id.startsWith(`${folderId}:`)) {
            // Find an alias that belongs to one of the remaining folders
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

      // Rebuild trees for folders where tracks were updated
      const refreshedFolders = updatedFolders.map((f) => ({
        ...f,
        tree: buildFolderTree(f.name, f.tracks, f.id),
      }));

      // Migrate favourites if any track IDs were updated
      if (idMigrations.size > 0) {
        setFavourites((prev) => {
          const next = new Set(prev);
          for (const [oldId, newId] of idMigrations.entries()) {
            if (next.has(oldId)) {
              next.delete(oldId);
              next.add(newId);
            }
          }
          storePlaybackState({ favourites: Array.from(next) });
          return next;
        });

        // Migrate stored playlist track references
        getStoredPlaylists().then((storedPlaylists) => {
          let playlistsChanged = false;
          const updated = storedPlaylists.map((pl) => {
            let changed = false;
            const newTracks = pl.tracks.map((ref) => {
              if (idMigrations.has(ref.trackId)) {
                changed = true;
                return { ...ref, trackId: idMigrations.get(ref.trackId)! };
              }
              return ref;
            });
            if (changed) {
              playlistsChanged = true;
              return { ...pl, tracks: newTracks, updatedAt: Date.now() };
            }
            return pl;
          });
          if (playlistsChanged) {
            storePlaylists(updated);
          }
        });
      }

      const unifiedTree = buildUnifiedMultiFolderTree(refreshedFolders);
      const flatPlaylist = combineFlatPlaylists(refreshedFolders);

      setLibrary({
        ...library,
        folders: refreshedFolders,
        tree: unifiedTree,
        flatPlaylist,
      });

      await storeRegisteredFolders(refreshedFolders);
    },
    [library]
  );

  // Handle fallback directory input
  const handleFallbackFolderSelect = useCallback(
    (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;

      setIsLoading(true);
      const parsed = parseFileList(files);
      if (parsed && parsed.folders.length > 0) {
        const newFolder = parsed.folders[0];
        const nextFolders = [...(library?.folders || []), newFolder];
        const unifiedTree = buildUnifiedMultiFolderTree(nextFolders);
        const flatPlaylist = combineFlatPlaylists(nextFolders);

        setLibrary({
          id: 'multi-library',
          name: 'Music Library',
          folders: nextFolders,
          tree: unifiedTree,
          flatPlaylist,
          sourceType: 'input-fallback',
        });
        setSelectedFolderPath('');
        startIncrementalMetadataExtraction(flatPlaylist);
      }
      setIsLoading(false);
    },
    [library, startIncrementalMetadataExtraction]
  );

  // Handle fallback file selection input (iPad / Safari reconnect and additive import)
  const handleOpenFilesSelect = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;

      setIsLoading(true);
      const fileArray = Array.from(files);

      const existingImportedFolder = library?.folders.find((f) => f.id === IMPORTED_FILES_ROOT_ID);
      const existingTracks = existingImportedFolder ? [...existingImportedFolder.tracks] : [];

      const unreadableTracks = existingTracks.filter((t) => !t.file || t.status === 'unreadable');
      const reconnectedIds = new Set<string>();
      const updatedExistingTracks = [...existingTracks];
      const newTracksToAdd: TrackItem[] = [];

      for (const file of fileArray) {
        if (!isSupportedAudioFile(file.name) && !isLrcFile(file.name)) continue;
        if (isLrcFile(file.name)) continue;

        // Candidate matching for safe reconnect on iPad/Safari:
        // Match only if (name === file.name && size === file.size && lastModified === file.lastModified)
        const matchingCandidates = unreadableTracks.filter(
          (t) =>
            !reconnectedIds.has(t.id) &&
            t.name === file.name &&
            t.size === file.size &&
            t.lastModified === file.lastModified
        );

        if (matchingCandidates.length >= 1) {
          // Reconnect unambiguous candidate without creating duplicate
          const matched = matchingCandidates[0];
          reconnectedIds.add(matched.id);
          const idx = updatedExistingTracks.findIndex((t) => t.id === matched.id);
          if (idx !== -1) {
            updatedExistingTracks[idx] = {
              ...updatedExistingTracks[idx],
              file,
              status: file.size === 0 ? 'empty' : 'normal',
            };
          }
        } else {
          // Check if file is already active and readable
          const alreadyReadable = updatedExistingTracks.some(
            (t) =>
              t.file &&
              t.name === file.name &&
              t.size === file.size &&
              t.lastModified === file.lastModified
          );
          if (alreadyReadable) {
            continue;
          }

          // New imported file -> append additively
          const stableId = `${IMPORTED_FILES_ROOT_ID}:${file.name}`;
          const finalId =
            updatedExistingTracks.some((t) => t.id === stableId) ||
            newTracksToAdd.some((t) => t.id === stableId)
              ? `${IMPORTED_FILES_ROOT_ID}:${file.name}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
              : stableId;

          newTracksToAdd.push({
            id: finalId,
            name: file.name,
            relativePath: file.name,
            size: file.size,
            lastModified: file.lastModified,
            file,
            metadata: createFallbackMetadata(file.name, file.name),
            status: file.size === 0 ? 'empty' : 'normal',
            folderIds: [IMPORTED_FILES_ROOT_ID],
          });
        }
      }

      const allTracks = [...updatedExistingTracks, ...newTracksToAdd];
      if (allTracks.length === 0) {
        setIsLoading(false);
        return;
      }

      const updatedImportedFolder: ImportedFolder = {
        id: IMPORTED_FILES_ROOT_ID,
        name: IMPORTED_FILES_COLLECTION_NAME,
        sourceType: 'files',
        tree: {
          id: IMPORTED_FILES_ROOT_ID,
          name: IMPORTED_FILES_COLLECTION_NAME,
          relativePath: IMPORTED_FILES_ROOT_ID,
          tracks: allTracks,
          subfolders: [],
          totalTrackCount: allTracks.length,
        },
        tracks: allTracks,
        trackCount: allTracks.length,
        addedAt: existingImportedFolder?.addedAt || Date.now(),
        lastScannedAt: Date.now(),
        permissionStatus: 'granted',
      };

      const recordsToStore: StoredImportedFileRecord[] = allTracks.map((t) => ({
        id: t.id,
        name: t.name,
        relativePath: t.relativePath,
        size: t.size,
        lastModified: t.lastModified,
        handle: t.handle,
        status: t.status,
        metadata: t.metadata,
        addedAt: Date.now(),
      }));
      await storeImportedFiles(recordsToStore);

      const otherFolders = (library?.folders || []).filter((f) => f.id !== IMPORTED_FILES_ROOT_ID);
      const nextFolders = [...otherFolders, updatedImportedFolder];
      const unifiedTree = buildUnifiedMultiFolderTree(nextFolders);
      const flatPlaylist = combineFlatPlaylists(nextFolders);

      setLibrary({
        id: 'multi-library',
        name: 'Music Library',
        folders: nextFolders,
        tree: unifiedTree,
        flatPlaylist,
        sourceType: library?.sourceType || 'files',
        handle: nextFolders[0]?.handle,
      });

      startIncrementalMetadataExtraction(newTracksToAdd);
      setIsLoading(false);
    },
    [library, startIncrementalMetadataExtraction]
  );

  // Resolve favourites against library tracks
  const favouriteResolution = useMemo(() => {
    if (!library) {
      return { resolvedTracks: [], unresolvedIds: Array.from(favourites), migratedMap: new Map<string, string>() };
    }
    return resolveFavouriteTracks(library.flatPlaylist, favourites);
  }, [library, favourites]);

  const favouriteTracks = favouriteResolution.resolvedTracks;
  const favouritesCount = favouriteTracks.length;

  // Auto-heal legacy or alias favourite IDs to canonical IDs without dropping unresolved IDs
  useEffect(() => {
    if (favouriteResolution.migratedMap.size > 0) {
      setFavourites((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const [oldId, canonicalId] of favouriteResolution.migratedMap.entries()) {
          // Replace legacy ID with canonical ID in persistent storage
          if (next.has(oldId)) {
            next.delete(oldId);
            changed = true;
          }
          if (!next.has(canonicalId)) {
            next.add(canonicalId);
            changed = true;
          }
        }
        if (changed) {
          storePlaybackState({ favourites: Array.from(next) });
          return next;
        }
        return prev;
      });
    }
  }, [favouriteResolution.migratedMap]);

  // Toggle favorite track
  const toggleFavourite = useCallback((trackId: string) => {
    let track = library?.flatPlaylist.find(
      (t) => t.id === trackId || (t.aliases && t.aliases.includes(trackId))
    );
    if (!track && library) {
      // Fallback for legacy bare relative path (without folder prefix) only if unambiguous
      const candidates = library.flatPlaylist.filter(
        (t) => t.relativePath === trackId
      );
      if (candidates.length === 1) {
        track = candidates[0];
      }
    }
    const canonicalId = track ? track.id : trackId;

    setFavourites((prev) => {
      const next = new Set(prev);
      const isFav = track
        ? isFavouriteTrack(track, next, library?.flatPlaylist)
        : next.has(trackId);

      if (isFav) {
        // 1. Remove canonical ID and trackId
        next.delete(canonicalId);
        next.delete(trackId);

        // 2. Remove verified aliases of this logical track (e.g. from overlapping parent/child imports)
        if (track?.aliases) {
          track.aliases.forEach((alias) => next.delete(alias));
        }

        // 3. Remove legacy relative-path key ONLY if it unambiguously belongs to this track
        if (track && library) {
          const sameRelPathTracks = library.flatPlaylist.filter(
            (t) => t.relativePath === track.relativePath
          );
          if (sameRelPathTracks.length === 1) {
            next.delete(track.relativePath);
          }
        }

        // 4. Remove any legacy ID that was unambiguously migrated to this canonical track
        for (const [oldId, mappedCanonicalId] of favouriteResolution.migratedMap.entries()) {
          if (mappedCanonicalId === canonicalId) {
            next.delete(oldId);
          }
        }
      } else {
        next.add(canonicalId);
      }
      storePlaybackState({ favourites: Array.from(next) });
      return next;
    });
  }, [library, favouriteResolution.migratedMap]);

  // Bulk add tracks to favourites (single state and storage update)
  const addTracksToFavourites = useCallback((tracks: TrackItem[]) => {
    setFavourites((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const track of tracks) {
        const canonicalId = track.id;
        if (!next.has(canonicalId)) {
          next.add(canonicalId);
          changed = true;
        }
      }
      if (changed) {
        storePlaybackState({ favourites: Array.from(next) });
        return next;
      }
      return prev;
    });
  }, []);

  // Bulk remove tracks from favourites (single state and storage update)
  const removeTracksFromFavourites = useCallback((tracks: TrackItem[]) => {
    setFavourites((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const track of tracks) {
        const canonicalId = track.id;
        if (next.has(canonicalId)) {
          next.delete(canonicalId);
          changed = true;
        }
        if (track.aliases) {
          for (const a of track.aliases) {
            if (next.has(a)) {
              next.delete(a);
              changed = true;
            }
          }
        }
      }
      if (changed) {
        storePlaybackState({ favourites: Array.from(next) });
        return next;
      }
      return prev;
    });
  }, []);

  // Aggregate albums from library
  const albums = useMemo((): AlbumGroup[] => {
    if (!library) return [];

    const map = new Map<string, TrackItem[]>();
    for (const track of library.flatPlaylist) {
      const albumKey = `${track.metadata.album || 'Unknown Album'}___${track.metadata.artist || 'Unknown Artist'}`;
      let list = map.get(albumKey);
      if (!list) {
        list = [];
        map.set(albumKey, list);
      }
      list.push(track);
    }

    const groups: AlbumGroup[] = [];
    for (const [key, tracks] of map.entries()) {
      const [name, artist] = key.split('___');
      const firstWithCover = tracks.find((t) => t.metadata.artworkUrl);
      const firstWithYear = tracks.find((t) => t.metadata.year);
      const totalDur = tracks.reduce((sum, t) => sum + (t.metadata.duration || 0), 0);

      groups.push({
        id: key,
        name,
        artist,
        year: firstWithYear?.metadata.year,
        artworkUrl: firstWithCover?.metadata.artworkUrl,
        placeholderGradient: tracks[0]?.metadata.placeholderGradient,
        tracks,
        totalDuration: totalDur,
      });
    }

    return naturalSort(groups, (g) => g.name);
  }, [library]);

  // Aggregate artists from library
  const artists = useMemo((): ArtistGroup[] => {
    if (!library) return [];

    const map = new Map<string, TrackItem[]>();
    for (const track of library.flatPlaylist) {
      const artist = track.metadata.artist || 'Unknown Artist';
      let list = map.get(artist);
      if (!list) {
        list = [];
        map.set(artist, list);
      }
      list.push(track);
    }

    const groups: ArtistGroup[] = [];
    for (const [name, tracks] of map.entries()) {
      const uniqueAlbums = new Set(tracks.map((t) => t.metadata.album));
      const totalDur = tracks.reduce((sum, t) => sum + (t.metadata.duration || 0), 0);

      groups.push({
        id: name,
        name,
        tracks,
        albumCount: uniqueAlbums.size,
        totalDuration: totalDur,
      });
    }

    return naturalSort(groups, (g) => g.name);
  }, [library]);

  // Current folder node for folder view
  const currentFolderNode = useMemo((): FolderNode | null => {
    if (!library) return null;
    return findFolderNodeByPath(library.tree, selectedFolderPath);
  }, [library, selectedFolderPath]);

  // Displayed tracks based on view, selections, and search
  const displayedTracks = useMemo((): TrackItem[] => {
    if (!library) return [];

    let baseList: TrackItem[] = [];

    if (currentView === 'all') {
      baseList = library.flatPlaylist;
    } else if (currentView === 'favourites') {
      baseList = favouriteTracks;
    } else if (currentView === 'folder') {
      if (currentFolderNode) {
        baseList = currentFolderNode.tracks;
      } else {
        baseList = library.flatPlaylist;
      }
    } else if (currentView === 'artists') {
      if (selectedArtistName) {
        baseList = library.flatPlaylist.filter(
          (t) => (t.metadata.artist || 'Unknown Artist') === selectedArtistName
        );
      } else {
        baseList = library.flatPlaylist;
      }
    } else if (currentView === 'albums') {
      if (selectedAlbumId) {
        const album = albums.find((a) => a.id === selectedAlbumId);
        baseList = album ? album.tracks : library.flatPlaylist;
      } else {
        baseList = library.flatPlaylist;
      }
    } else if (currentView === 'imported-files') {
      const importedFolder = library.folders.find((f) => f.id === IMPORTED_FILES_ROOT_ID);
      baseList = importedFolder ? importedFolder.tracks : [];
    }

    // Apply search query filter
    const query = searchQuery.trim().toLowerCase();
    if (!query) return baseList;

    return baseList.filter((t) => {
      return (
        t.name.toLowerCase().includes(query) ||
        t.metadata.title.toLowerCase().includes(query) ||
        t.metadata.artist.toLowerCase().includes(query) ||
        t.metadata.album.toLowerCase().includes(query) ||
        t.relativePath.toLowerCase().includes(query)
      );
    });
  }, [
    library,
    currentView,
    currentFolderNode,
    selectedArtistName,
    selectedAlbumId,
    albums,
    favouriteTracks,
    searchQuery,
  ]);

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

  const updateTrackStatus = useCallback(
    (
      trackId: string,
      status: FileStatus,
      size?: number,
      metadata?: Partial<TrackItem['metadata']>
    ) => {
      setLibrary((prevLib) => {
        if (!prevLib) return null;

        const updateItem = (t: TrackItem): TrackItem => {
          if (t.id !== trackId) return t;
          return {
            ...t,
            status,
            size: size !== undefined ? size : t.size,
            metadata: metadata
              ? {
                  ...t.metadata,
                  ...metadata,
                  isMetadataLoaded: true,
                }
              : t.metadata,
          };
        };

        const updatedFlat = prevLib.flatPlaylist.map(updateItem);

        function updateNode(node: FolderNode): FolderNode {
          return {
            ...node,
            tracks: node.tracks.map(updateItem),
            subfolders: node.subfolders.map(updateNode),
          };
        }

        const updatedFolders = (prevLib.folders || []).map((f) => ({
          ...f,
          tracks: f.tracks.map(updateItem),
          tree: updateNode(f.tree),
        }));

        return {
          ...prevLib,
          folders: updatedFolders,
          tree: updateNode(prevLib.tree),
          flatPlaylist: updatedFlat,
        };
      });
    },
    []
  );

  return {
    library,
    folders: library?.folders || [],
    currentView,
    selectedFolderPath,
    selectedArtistName,
    selectedAlbumId,
    searchQuery,
    favourites,
    favouriteTracks,
    favouritesCount,
    isLoading,
    scanProgress,
    needsPermission,
    pendingFolders,
    currentFolderNode,
    displayedTracks,
    albums,
    artists,
    setCurrentView,
    selectFolder,
    selectArtist,
    selectAlbum,
    setSearchQuery,
    toggleFavourite,
    addTracksToFavourites,
    removeTracksFromFavourites,
    openFolderPicker,
    openFilesPicker,
    addFolder: openFolderPicker,
    refreshFolder,
    removeFolder,
    removeImportedFiles,
    removeAllImportedFiles,
    handleFallbackFolderSelect,
    handleOpenFilesSelect,
    handleFolderInput: handleFallbackFolderSelect,
    handleFilesInput: handleOpenFilesSelect,
    requestPermissionAndLoad,
    requestPermissionForFolder,
    updateTrackStatus,
  };
}
