import {
  ImportedFolder,
  StoredImportedFileRecord,
  TrackItem,
  IMPORTED_FILES_COLLECTION_NAME,
  IMPORTED_FILES_ROOT_ID,
} from '../types/music';
import { storeImportedFiles } from '../services/idbStorage';

export function createImportedFolderRecord(
  tracks: TrackItem[],
  addedAt?: number
): ImportedFolder {
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

export function persistImportedFileRecords(tracks: TrackItem[]): Promise<boolean> {
  const recordsToStore: StoredImportedFileRecord[] = tracks.map((t) => ({
    id: t.id,
    name: t.name,
    relativePath: t.relativePath,
    size: t.size,
    lastModified: t.lastModified,
    handle: t.handle,
    lrcHandle: t.lrcHandle,
    status: t.status,
    metadata: t.metadata,
    addedAt: Date.now(),
    aliases: t.aliases,
  }));
  return storeImportedFiles(recordsToStore);
}

export function partitionImportedFilesForRemoval(
  tracks: TrackItem[],
  idSet: Set<string>
): {
  remainingTracks: TrackItem[];
  removedTrackItems: TrackItem[];
  actuallyRemovedIds: string[];
  idMigrations: Map<string, string>;
} {
  const remainingTracks: TrackItem[] = [];
  const removedTrackItems: TrackItem[] = [];
  const actuallyRemovedIds: string[] = [];
  const idMigrations = new Map<string, string>();

  for (const track of tracks) {
    const isTargeted =
      idSet.has(track.id) || (track.aliases && track.aliases.some((a) => idSet.has(a)));

    if (isTargeted) {
      const remainingFolderIds = (track.folderIds || []).filter(
        (id) => id !== IMPORTED_FILES_ROOT_ID && id !== 'imported-files-root'
      );
      track.folderIds = remainingFolderIds;

      if (remainingFolderIds.length > 0) {
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
        removedTrackItems.push(track);
        actuallyRemovedIds.push(track.id);
        if (track.aliases) {
          track.aliases.forEach((a) => actuallyRemovedIds.push(a));
        }
      }
    } else {
      remainingTracks.push(track);
    }
  }

  return { remainingTracks, removedTrackItems, actuallyRemovedIds, idMigrations };
}

export function cleanOtherFoldersAfterImportedRemoval(
  folders: ImportedFolder[],
  idSet: Set<string>
): ImportedFolder[] {
  return folders
    .filter(
      (f) =>
        f.id !== IMPORTED_FILES_ROOT_ID &&
        f.id !== 'imported-files-root' &&
        f.sourceType !== 'files'
    )
    .map((f) => ({
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
}
