import { useCallback } from 'react';
import {
  TrackItem,
  ImportedFolder,
  StoredImportedFileRecord,
  MusicLibrary,
  IMPORTED_FILES_ROOT_ID,
  IMPORTED_FILES_COLLECTION_NAME,
} from '../types/music';
import { promptOpenFiles } from '../services/directoryAccess';
import {
  storeImportedFiles,
  storeRegisteredFolders,
  clearStoredDirectoryHandle,
} from '../services/idbStorage';
import {
  buildUnifiedMultiFolderTree,
  combineFlatPlaylists,
  isSupportedAudioFile,
  isLrcFile,
  migratePlaylistsTrackIds,
} from '../utils/musicTree';
import { isSameTrack, findExistingTrackByHandle } from '../utils/trackIdentity';
import { stripExtension } from '../utils/audioFileTypes';
import { createFallbackMetadata } from '../utils/metadata';

export interface UseImportedFilesManagerProps {
  library: MusicLibrary | null;
  onLibraryUpdated: (updater: (prev: MusicLibrary | null) => MusicLibrary | null) => void;
  onRemoveFavourites: (trackIds: string[]) => void;
  startMetadataExtraction: (tracks: TrackItem[]) => void;
  setIsLoading: (loading: boolean) => void;
}

export interface UseImportedFilesManagerReturn {
  openFilesPicker: () => Promise<void>;
  handleOpenFilesSelect: (files: FileList | File[] | null) => Promise<void>;
  removeImportedFiles: (trackIds: string[]) => Promise<void>;
  removeAllImportedFiles: () => Promise<void>;
}

function createImportedFolderRecord(tracks: TrackItem[], addedAt?: number): ImportedFolder {
  return {
    id: IMPORTED_FILES_ROOT_ID,
    name: IMPORTED_FILES_COLLECTION_NAME,
    sourceType: 'files',
    tree: {
      id: IMPORTED_FILES_ROOT_ID,
      name: IMPORTED_FILES_COLLECTION_NAME,
      relativePath: IMPORTED_FILES_ROOT_ID,
      tracks,
      subfolders: [],
      totalTrackCount: tracks.length,
    },
    tracks,
    trackCount: tracks.length,
    addedAt: addedAt || Date.now(),
    lastScannedAt: Date.now(),
    permissionStatus: 'granted',
  };
}

function persistImportedFileRecords(tracks: TrackItem[]): Promise<boolean> {
  const recordsToStore: StoredImportedFileRecord[] = tracks.map((t) => ({
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
  return storeImportedFiles(recordsToStore);
}

/**
 * Hook to manage individual audio file imports, fallback reconnects, and removals
 * within the unified virtual Imported Files collection.
 */
export function useImportedFilesManager({
  library,
  onLibraryUpdated,
  onRemoveFavourites: _onRemoveFavourites,
  startMetadataExtraction,
  setIsLoading,
}: UseImportedFilesManagerProps): UseImportedFilesManagerReturn {
  // Pick individual files via native File System Access API
  const openFilesPicker = useCallback(async () => {
    try {
      const handles = await promptOpenFiles();
      if (!handles || handles.length === 0) return;

      setIsLoading(true);

      const lrcHandles = new Map<string, FileSystemFileHandle>();
      const audioHandles: FileSystemFileHandle[] = [];

      for (const h of handles) {
        if (isLrcFile(h.name)) {
          lrcHandles.set(stripExtension(h.name).toLowerCase(), h);
        } else if (isSupportedAudioFile(h.name)) {
          audioHandles.push(h);
        }
      }

      if (audioHandles.length === 0) {
        setIsLoading(false);
        return;
      }

      const allLibraryTracks = (library?.folders || []).flatMap((f) => f.tracks);
      const existingImportedFolder = library?.folders.find((f) => f.id === IMPORTED_FILES_ROOT_ID);
      const allImportedTracks = existingImportedFolder ? [...existingImportedFolder.tracks] : [];
      const newTracksForMetadata: TrackItem[] = [];

      for (const handle of audioHandles) {
        const baseName = stripExtension(handle.name).toLowerCase();
        const batchLrc = lrcHandles.get(baseName);

        // Check if handle matches an existing track anywhere in the library
        const matched = await findExistingTrackByHandle(handle, allLibraryTracks);

        if (matched) {
          // Reconcile source membership
          const folderIds = matched.folderIds || [];
          if (!folderIds.includes(IMPORTED_FILES_ROOT_ID)) {
            matched.folderIds = [...folderIds, IMPORTED_FILES_ROOT_ID];
          }

          // Generate stable alias if not present
          const stableId = `${IMPORTED_FILES_ROOT_ID}:${matched.name}`;
          const aliases = matched.aliases || [matched.id];
          if (!aliases.includes(stableId)) {
            matched.aliases = [...aliases, stableId];
          }

          // Pair with batch .lrc if provided
          if (batchLrc) {
            matched.lrcHandle = batchLrc;
          }

          // Keep fresh handle and update status
          matched.handle = handle;
          if (matched.status === 'unreadable') {
            matched.status = 'normal';
          }

          // Ensure it is in allImportedTracks
          const alreadyInImported = allImportedTracks.some((t) => isSameTrack(t, matched));
          if (!alreadyInImported) {
            allImportedTracks.push(matched);
          }
        } else {
          // Check if already in allImportedTracks
          const inImported = await findExistingTrackByHandle(handle, allImportedTracks);
          if (inImported) {
            if (batchLrc) inImported.lrcHandle = batchLrc;
            inImported.handle = handle;
            continue;
          }

          try {
            const file = await handle.getFile();
            const stableId = `${IMPORTED_FILES_ROOT_ID}:${file.name}`;
            const finalId =
              allImportedTracks.some((t) => t.id === stableId)
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
              lrcHandle: batchLrc,
              metadata: createFallbackMetadata(file.name, file.name),
              status: file.size === 0 ? 'empty' : 'normal',
              folderIds: [IMPORTED_FILES_ROOT_ID],
              aliases: [finalId],
            };
            allImportedTracks.push(trackItem);
            newTracksForMetadata.push(trackItem);
          } catch (err) {
            console.error('Error reading file handle:', err);
          }
        }
      }

      const updatedImportedFolder = createImportedFolderRecord(
        allImportedTracks,
        existingImportedFolder?.addedAt
      );
      await persistImportedFileRecords(allImportedTracks);

      const otherFolders = (library?.folders || []).filter((f) => f.id !== IMPORTED_FILES_ROOT_ID);
      const nextFolders = [...otherFolders, updatedImportedFolder];
      const unifiedTree = buildUnifiedMultiFolderTree(nextFolders);
      const flatPlaylist = combineFlatPlaylists(nextFolders);

      onLibraryUpdated((prev) => ({
        id: 'multi-library',
        name: 'Music Library',
        folders: nextFolders,
        tree: unifiedTree,
        flatPlaylist,
        sourceType: prev?.sourceType || 'fs-access',
        handle: nextFolders[0]?.handle,
      }));

      if (newTracksForMetadata.length > 0) {
        startMetadataExtraction(newTracksForMetadata);
      }
    } catch (err) {
      console.error('Failed to open files:', err);
    } finally {
      setIsLoading(false);
    }
  }, [library, onLibraryUpdated, startMetadataExtraction, setIsLoading]);

  // Handle fallback file selection input (iPad / Safari reconnect and additive import)
  const handleOpenFilesSelect = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;

      setIsLoading(true);
      const fileArray = Array.from(files);

      const lrcFiles = new Map<string, File>();
      const audioFiles: File[] = [];

      for (const file of fileArray) {
        if (isLrcFile(file.name)) {
          lrcFiles.set(stripExtension(file.name).toLowerCase(), file);
        } else if (isSupportedAudioFile(file.name)) {
          audioFiles.push(file);
        }
      }

      const existingImportedFolder = library?.folders.find((f) => f.id === IMPORTED_FILES_ROOT_ID);
      const existingTracks = existingImportedFolder ? [...existingImportedFolder.tracks] : [];

      const unreadableTracks = existingTracks.filter((t) => !t.file || t.status === 'unreadable');
      const reconnectedIds = new Set<string>();
      const updatedExistingTracks = [...existingTracks];
      const newTracksToAdd: TrackItem[] = [];

      for (const file of audioFiles) {
        const baseName = stripExtension(file.name).toLowerCase();
        const batchLrc = lrcFiles.get(baseName);

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
              lrcFile: batchLrc || updatedExistingTracks[idx].lrcFile,
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
            lrcFile: batchLrc,
            metadata: createFallbackMetadata(file.name, file.name),
            status: file.size === 0 ? 'empty' : 'normal',
            folderIds: [IMPORTED_FILES_ROOT_ID],
            aliases: [finalId],
          });
        }
      }

      const allTracks = [...updatedExistingTracks, ...newTracksToAdd];
      if (allTracks.length === 0) {
        setIsLoading(false);
        return;
      }

      const updatedImportedFolder = createImportedFolderRecord(
        allTracks,
        existingImportedFolder?.addedAt
      );
      await persistImportedFileRecords(allTracks);

      const otherFolders = (library?.folders || []).filter((f) => f.id !== IMPORTED_FILES_ROOT_ID);
      const nextFolders = [...otherFolders, updatedImportedFolder];
      const unifiedTree = buildUnifiedMultiFolderTree(nextFolders);
      const flatPlaylist = combineFlatPlaylists(nextFolders);

      onLibraryUpdated((prev) => ({
        id: 'multi-library',
        name: 'Music Library',
        folders: nextFolders,
        tree: unifiedTree,
        flatPlaylist,
        sourceType: prev?.sourceType || 'files',
        handle: nextFolders[0]?.handle,
      }));

      startMetadataExtraction(newTracksToAdd);
      setIsLoading(false);
    },
    [library, onLibraryUpdated, startMetadataExtraction, setIsLoading]
  );

  // Remove individual imported files from the virtual collection
  const removeImportedFiles = useCallback(
    async (trackIds: string[]) => {
      const idSet = new Set(trackIds);
      const existingImportedFolder = library?.folders.find(
        (f) => f.id === IMPORTED_FILES_ROOT_ID || f.id === 'imported-files-root'
      );
      if (!existingImportedFolder) return;

      const remainingTracks: TrackItem[] = [];
      const actuallyRemovedIds: string[] = [];
      const idMigrations = new Map<string, string>();

      for (const track of existingImportedFolder.tracks) {
        const isTargeted =
          idSet.has(track.id) || (track.aliases && track.aliases.some((a) => idSet.has(a)));

        if (isTargeted) {
          // Remove IMPORTED_FILES_ROOT_ID from folderIds
          const remainingFolderIds = (track.folderIds || []).filter(
            (id) => id !== IMPORTED_FILES_ROOT_ID && id !== 'imported-files-root'
          );
          track.folderIds = remainingFolderIds;

          if (remainingFolderIds.length > 0) {
            // Track still has other folder sources: preserve it in the library!
            if (
              track.id.startsWith(`${IMPORTED_FILES_ROOT_ID}:`) ||
              track.id.startsWith('imported-files-root:')
            ) {
              const folderAlias = track.aliases?.find(
                (a) =>
                  !a.startsWith(`${IMPORTED_FILES_ROOT_ID}:`) &&
                  !a.startsWith('imported-files-root:')
              );
              if (folderAlias) {
                idMigrations.set(track.id, folderAlias);
                track.id = folderAlias;
              }
            }
          } else {
            // Track has no other sources left: truly removed from library
            actuallyRemovedIds.push(track.id);
            if (track.aliases) {
              track.aliases.forEach((a) => actuallyRemovedIds.push(a));
            }
          }
        } else {
          remainingTracks.push(track);
        }
      }

      const updatedFolder = createImportedFolderRecord(
        remainingTracks,
        existingImportedFolder.addedAt
      );
      await persistImportedFileRecords(remainingTracks);

      // If canonical ID migrated, update stored playlists
      if (idMigrations.size > 0) {
        migratePlaylistsTrackIds(idMigrations);
      }

      const otherFolders = (library?.folders || []).filter(
        (f) =>
          f.id !== IMPORTED_FILES_ROOT_ID &&
          f.id !== 'imported-files-root' &&
          f.sourceType !== 'files'
      );

      // Clean up folderIds in otherFolders for tracks that were removed from Imported Files
      const cleanedOtherFolders = otherFolders.map((f) => ({
        ...f,
        tracks: f.tracks.map((t) => {
          const isTargeted =
            idSet.has(t.id) || (t.aliases && t.aliases.some((a) => idSet.has(a)));
          if (isTargeted) {
            return {
              ...t,
              folderIds: (t.folderIds || []).filter(
                (id) => id !== IMPORTED_FILES_ROOT_ID && id !== 'imported-files-root'
              ),
            };
          }
          return t;
        }),
      }));

      const nextFolders =
        remainingTracks.length > 0 ? [...cleanedOtherFolders, updatedFolder] : cleanedOtherFolders;

      if (nextFolders.length === 0) {
        onLibraryUpdated(() => null);
        await storeRegisteredFolders([]);
        await clearStoredDirectoryHandle();
        return;
      }

      await storeRegisteredFolders(cleanedOtherFolders);

      const unifiedTree = buildUnifiedMultiFolderTree(nextFolders);
      const flatPlaylist = combineFlatPlaylists(nextFolders);

      onLibraryUpdated((prev) =>
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
    [library, onLibraryUpdated]
  );

  // Remove all imported files from library
  const removeAllImportedFiles = useCallback(async () => {
    const existingImportedFolder = library?.folders.find((f) => f.id === IMPORTED_FILES_ROOT_ID);
    if (!existingImportedFolder) return;
    const allIds = existingImportedFolder.tracks.map((t) => t.id);
    await removeImportedFiles(allIds);
  }, [library, removeImportedFiles]);

  return {
    openFilesPicker,
    handleOpenFilesSelect,
    removeImportedFiles,
    removeAllImportedFiles,
  };
}
