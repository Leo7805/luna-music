import { useCallback } from 'react';
import {
  TrackItem,
  MusicLibrary,
  IMPORTED_FILES_ROOT_ID,
} from '../types/music';
import { promptOpenFiles } from '../services/directoryAccess';
import {
  storeRegisteredFolders,
  clearStoredDirectoryHandle,
  getMetadataCache,
  applyCachedMetadataToTracks,
  cleanupCacheOnSourceRemoval,
} from '../services/idbStorage';
import { revokeUnusedArtworkUrls } from '../utils/artworkLoader';
import {
  buildUnifiedMultiFolderTree,
  combineFlatPlaylists,
  migratePlaylistsTrackIds,
} from '../utils/musicTree';
import { isSameTrack, findExistingTrackByHandle } from '../utils/trackIdentity';
import {
  getFilenameStem,
  partitionImportItems,
  resolveUnambiguousBatchLrc,
  withUpdatedLrcHandle,
  withUpdatedLrcFile,
  applyStandaloneLrcToTracks,
  syncUpdatedLyricsToFolders,
} from '../utils/importedFileLyrics';
import {
  createImportedFolderRecord,
  persistImportedFileRecords,
  partitionImportedFilesForRemoval,
  cleanOtherFoldersAfterImportedRemoval,
} from '../utils/importedFileRecords';
import { createFallbackMetadata } from '../utils/metadata';

export interface UseImportedFilesManagerProps {
  library: MusicLibrary | null;
  onLibraryUpdated: (updater: (prev: MusicLibrary | null) => MusicLibrary | null) => void;
  onRemoveFavourites: (trackIds: string[]) => void;
  onSourcesRemoved?: (remainingTracks: TrackItem[], removedIds: string[], idMigrations: Map<string, string>) => void;
  startMetadataExtraction: (tracks: TrackItem[], sourceId?: string) => void;
  invalidateMetadataTracks: (trackIds: string[]) => void;
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
  onRemoveFavourites: _onRemoveFavourites,
  onSourcesRemoved,
  startMetadataExtraction,
  invalidateMetadataTracks,
  setIsLoading,
}: UseImportedFilesManagerProps): UseImportedFilesManagerReturn {
  // Pick individual files via native File System Access API
  const openFilesPicker = useCallback(async () => {
    try {
      const handles = await promptOpenFiles();
      if (!handles || handles.length === 0) return;

      setIsLoading(true);

      const { audioItems: audioHandles, lrcItems: lrcHandles } = partitionImportItems(handles);
      if (audioHandles.length === 0 && lrcHandles.size === 0) {
        return;
      }

      const { batchLrcByStem, consumedStems } = resolveUnambiguousBatchLrc(audioHandles, lrcHandles);
      const allLibraryTracks = (library?.folders || []).flatMap((f) => f.tracks);
      const existingImportedFolder = library?.folders.find((f) => f.id === IMPORTED_FILES_ROOT_ID);
      let allImportedTracks = existingImportedFolder ? [...existingImportedFolder.tracks] : [];
      const newTracksForMetadata: TrackItem[] = [];
      const tracksWithUpdatedLyrics: TrackItem[] = [];

      for (const handle of audioHandles) {
        const baseName = getFilenameStem(handle.name);
        const batchLrc = batchLrcByStem.get(baseName);

        // Check if handle matches an existing track anywhere in the library
        const matched = await findExistingTrackByHandle(handle, allLibraryTracks);

        if (matched) {
          const folderIds = matched.folderIds || [];
          const nextFolderIds = folderIds.includes(IMPORTED_FILES_ROOT_ID)
            ? folderIds
            : [...folderIds, IMPORTED_FILES_ROOT_ID];
          const stableId = `${IMPORTED_FILES_ROOT_ID}:${matched.name}`;
          const aliases = matched.aliases || [matched.id];
          const nextAliases = aliases.includes(stableId) ? aliases : [...aliases, stableId];
          const baseTrack: TrackItem = {
            ...matched,
            folderIds: nextFolderIds,
            aliases: nextAliases,
            handle,
            status: matched.status === 'unreadable' ? 'normal' : matched.status,
          };
          const updatedTrack = batchLrc ? withUpdatedLrcHandle(baseTrack, batchLrc) : baseTrack;
          if (batchLrc) tracksWithUpdatedLyrics.push(updatedTrack);

          const existingIdx = allImportedTracks.findIndex((t) => isSameTrack(t, updatedTrack));
          if (existingIdx !== -1) {
            allImportedTracks[existingIdx] = updatedTrack;
          } else {
            allImportedTracks.push(updatedTrack);
          }
        } else {
          // Check if already in allImportedTracks
          const inImported = await findExistingTrackByHandle(handle, allImportedTracks);
          if (inImported) {
            const baseTrack: TrackItem = { ...inImported, handle };
            const updatedTrack = batchLrc ? withUpdatedLrcHandle(baseTrack, batchLrc) : baseTrack;
            if (batchLrc) tracksWithUpdatedLyrics.push(updatedTrack);
            const idx = allImportedTracks.findIndex((t) => isSameTrack(t, inImported));
            if (idx !== -1) allImportedTracks[idx] = updatedTrack;
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

      const standalone = applyStandaloneLrcToTracks(
        allImportedTracks,
        lrcHandles,
        consumedStems,
        'handle'
      );
      allImportedTracks = standalone.tracks;
      if (standalone.updatedTracks.length > 0) {
        tracksWithUpdatedLyrics.push(...standalone.updatedTracks);
      }

      if (audioHandles.length === 0 && !standalone.changed) {
        return;
      }

      let finalImportedTracks = allImportedTracks;
      let tracksNeedingExtraction: TrackItem[] = [];
      if (newTracksForMetadata.length > 0) {
        const cache = await getMetadataCache();
        const hydratedNew = applyCachedMetadataToTracks(newTracksForMetadata, cache);
        const hydratedById = new Map(hydratedNew.hydratedTracks.map((t) => [t.id, t]));
        finalImportedTracks = allImportedTracks.map((t) => hydratedById.get(t.id) || t);
        tracksNeedingExtraction = hydratedNew.tracksNeedingExtraction;
      }

      const updatedImportedFolder = createImportedFolderRecord(finalImportedTracks, existingImportedFolder?.addedAt);
      await persistImportedFileRecords(finalImportedTracks);

      const otherFolders = syncUpdatedLyricsToFolders(
        (library?.folders || []).filter((f) => f.id !== IMPORTED_FILES_ROOT_ID),
        tracksWithUpdatedLyrics
      );
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

      if (tracksNeedingExtraction.length > 0) {
        startMetadataExtraction(tracksNeedingExtraction, IMPORTED_FILES_ROOT_ID);
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

      const { audioItems: audioFiles, lrcItems: lrcFiles } = partitionImportItems(fileArray);
      if (audioFiles.length === 0 && lrcFiles.size === 0) {
        setIsLoading(false);
        return;
      }

      const { batchLrcByStem, consumedStems } = resolveUnambiguousBatchLrc(audioFiles, lrcFiles);
      const existingImportedFolder = library?.folders.find((f) => f.id === IMPORTED_FILES_ROOT_ID);
      const existingTracks = existingImportedFolder ? [...existingImportedFolder.tracks] : [];

      const unreadableTracks = existingTracks.filter((t) => !t.file || t.status === 'unreadable');
      const reconnectedIds = new Set<string>();
      const updatedExistingTracks = [...existingTracks];
      const newTracksToAdd: TrackItem[] = [];
      const tracksWithUpdatedLyrics: TrackItem[] = [];

      for (const file of audioFiles) {
        const baseName = getFilenameStem(file.name);
        const batchLrc = batchLrcByStem.get(baseName);

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
            const reconnected: TrackItem = {
              ...updatedExistingTracks[idx],
              file,
              status: file.size === 0 ? 'empty' : 'normal',
            };
            const updatedTrack = batchLrc ? withUpdatedLrcFile(reconnected, batchLrc) : reconnected;
            if (batchLrc) tracksWithUpdatedLyrics.push(updatedTrack);
            updatedExistingTracks[idx] = updatedTrack;
          }
        } else {
          // Check if file is already active and readable
          const existingReadableIdx = updatedExistingTracks.findIndex(
            (t) =>
              t.file &&
              t.name === file.name &&
              t.size === file.size &&
              t.lastModified === file.lastModified
          );
          if (existingReadableIdx !== -1) {
            if (batchLrc) {
              const updatedTrack = withUpdatedLrcFile(
                updatedExistingTracks[existingReadableIdx],
                batchLrc
              );
              updatedExistingTracks[existingReadableIdx] = updatedTrack;
              tracksWithUpdatedLyrics.push(updatedTrack);
            }
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

      const standalone = applyStandaloneLrcToTracks(
        updatedExistingTracks,
        lrcFiles,
        consumedStems,
        'file'
      );
      const resolvedExistingTracks = standalone.tracks;
      if (standalone.updatedTracks.length > 0) {
        tracksWithUpdatedLyrics.push(...standalone.updatedTracks);
      }

      const hasChanges =
        newTracksToAdd.length > 0 ||
        reconnectedIds.size > 0 ||
        tracksWithUpdatedLyrics.length > 0 ||
        standalone.changed;
      if (!hasChanges) {
        setIsLoading(false);
        return;
      }

      let hydratedTracksToAdd = newTracksToAdd;
      let tracksNeedingExtraction: TrackItem[] = [];
      if (newTracksToAdd.length > 0) {
        const cache = await getMetadataCache();
        const hydratedNew = applyCachedMetadataToTracks(newTracksToAdd, cache);
        hydratedTracksToAdd = hydratedNew.hydratedTracks;
        tracksNeedingExtraction = hydratedNew.tracksNeedingExtraction;
      }

      const allTracks = [...resolvedExistingTracks, ...hydratedTracksToAdd];
      if (allTracks.length === 0) {
        setIsLoading(false);
        return;
      }

      const updatedImportedFolder = createImportedFolderRecord(allTracks, existingImportedFolder?.addedAt);
      await persistImportedFileRecords(allTracks);

      const otherFolders = syncUpdatedLyricsToFolders(
        (library?.folders || []).filter((f) => f.id !== IMPORTED_FILES_ROOT_ID),
        tracksWithUpdatedLyrics
      );
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

      if (tracksNeedingExtraction.length > 0) {
        startMetadataExtraction(tracksNeedingExtraction, IMPORTED_FILES_ROOT_ID);
      }
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

      const { remainingTracks, removedTrackItems, actuallyRemovedIds, idMigrations } =
        partitionImportedFilesForRemoval(existingImportedFolder.tracks, idSet);

      const updatedFolder = createImportedFolderRecord(
        remainingTracks,
        existingImportedFolder.addedAt
      );
      await persistImportedFileRecords(remainingTracks);

      if (actuallyRemovedIds.length > 0) invalidateMetadataTracks(actuallyRemovedIds);
      if (idMigrations.size > 0) migratePlaylistsTrackIds(idMigrations);

      const cleanedOtherFolders = cleanOtherFoldersAfterImportedRemoval(
        library?.folders || [],
        idSet
      );

      const nextFolders =
        remainingTracks.length > 0 ? [...cleanedOtherFolders, updatedFolder] : cleanedOtherFolders;

      if (nextFolders.length === 0) {
        cleanupCacheOnSourceRemoval(actuallyRemovedIds, [], idMigrations);
        revokeUnusedArtworkUrls(removedTrackItems, []);
        onLibraryUpdated(() => null);
        onSourcesRemoved?.([], actuallyRemovedIds, idMigrations);
        await storeRegisteredFolders([]);
        await clearStoredDirectoryHandle();
        return;
      }

      await storeRegisteredFolders(cleanedOtherFolders);

      const unifiedTree = buildUnifiedMultiFolderTree(nextFolders);
      const flatPlaylist = combineFlatPlaylists(nextFolders);
      cleanupCacheOnSourceRemoval(actuallyRemovedIds, flatPlaylist, idMigrations);
      revokeUnusedArtworkUrls(removedTrackItems, flatPlaylist);
      onSourcesRemoved?.(flatPlaylist, actuallyRemovedIds, idMigrations);

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
