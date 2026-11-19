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
import { storeImportedFiles } from '../services/idbStorage';
import {
  buildUnifiedMultiFolderTree,
  combineFlatPlaylists,
  isSupportedAudioFile,
  isLrcFile,
} from '../utils/musicTree';
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

/**
 * Hook to manage individual audio file imports, fallback reconnects, and removals
 * within the unified virtual Imported Files collection.
 */
export function useImportedFilesManager({
  library,
  onLibraryUpdated,
  onRemoveFavourites,
  startMetadataExtraction,
  setIsLoading,
}: UseImportedFilesManagerProps): UseImportedFilesManagerReturn {
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
              // Ignore handle comparison error
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

      onLibraryUpdated((prev) => ({
        id: 'multi-library',
        name: 'Music Library',
        folders: nextFolders,
        tree: unifiedTree,
        flatPlaylist,
        sourceType: prev?.sourceType || 'fs-access',
        handle: nextFolders[0]?.handle,
      }));

      startMetadataExtraction(newTracks);
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

      // Clean up favourites for removed tracks
      onRemoveFavourites(trackIds);

      const otherFolders = (library?.folders || []).filter((f) => f.id !== IMPORTED_FILES_ROOT_ID);
      const nextFolders = remainingTracks.length > 0 ? [...otherFolders, updatedFolder] : otherFolders;

      if (nextFolders.length === 0) {
        onLibraryUpdated(() => null);
        return;
      }

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
    [library, onLibraryUpdated, onRemoveFavourites]
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
