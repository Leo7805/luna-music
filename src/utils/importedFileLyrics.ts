import { ImportedFolder, TrackItem } from '../types/music';
import { isLrcFile, isSupportedAudioFile, stripExtension } from './audioFileTypes';
import { buildFolderTree } from './musicTree';
import { isSameTrack } from './trackIdentity';

export function getFilenameStem(filename: string): string {
  return stripExtension(filename).toLowerCase();
}

export function partitionImportItems<T extends { name: string }>(
  items: T[]
): { audioItems: T[]; lrcItems: Map<string, T> } {
  const audioItems: T[] = [];
  const lrcItems = new Map<string, T>();

  for (const item of items) {
    if (isLrcFile(item.name)) {
      lrcItems.set(getFilenameStem(item.name), item);
    } else if (isSupportedAudioFile(item.name)) {
      audioItems.push(item);
    }
  }

  return { audioItems, lrcItems };
}

/**
 * Resolves batch-level LRC pairings when audio and LRC files are selected together.
 * Pairs an LRC file only when its stem uniquely matches a single audio item in the batch.
 * Ambiguous stems (2+ audio items sharing a stem in the same batch) are marked consumed
 * without pairing so they are never silently attached to an arbitrary track.
 */
export function resolveUnambiguousBatchLrc<T extends { name: string }>(
  audioItems: T[],
  lrcItems: Map<string, T>
): { batchLrcByStem: Map<string, T>; consumedStems: Set<string> } {
  const stemCounts = new Map<string, number>();
  for (const audio of audioItems) {
    const stem = getFilenameStem(audio.name);
    stemCounts.set(stem, (stemCounts.get(stem) ?? 0) + 1);
  }

  const batchLrcByStem = new Map<string, T>();
  const consumedStems = new Set<string>();

  for (const [stem, lrc] of lrcItems.entries()) {
    const count = stemCounts.get(stem) ?? 0;
    if (count === 1) {
      batchLrcByStem.set(stem, lrc);
      consumedStems.add(stem);
    } else if (count > 1) {
      consumedStems.add(stem);
    }
  }

  return { batchLrcByStem, consumedStems };
}

export function withUpdatedLrcHandle(
  track: TrackItem,
  lrcHandle: FileSystemFileHandle
): TrackItem {
  return {
    ...track,
    lrcHandle,
    lrcFile: undefined,
    lrcContent: undefined,
  };
}

export function withUpdatedLrcFile(track: TrackItem, lrcFile: File): TrackItem {
  return {
    ...track,
    lrcFile,
    lrcHandle: undefined,
    lrcContent: undefined,
  };
}

/**
 * Applies separately imported (standalone) LRC handles or files to existing tracks.
 * Only associates an LRC when its filename stem unambiguously matches exactly one
 * distinct logical track; unmatched and ambiguous stems are safely ignored.
 */
export function applyStandaloneLrcToTracks(
  tracks: TrackItem[],
  lrcEntries: Map<string, FileSystemFileHandle | File>,
  consumedStems: Set<string>,
  mode: 'handle' | 'file'
): { tracks: TrackItem[]; updatedTracks: TrackItem[]; changed: boolean } {
  if (lrcEntries.size === 0 || tracks.length === 0) {
    return { tracks, updatedTracks: [], changed: false };
  }

  const nextTracks = [...tracks];
  const updatedTracks: TrackItem[] = [];
  let changed = false;

  for (const [stem, lrc] of lrcEntries.entries()) {
    if (consumedStems.has(stem)) continue;

    const matchingIndices: number[] = [];
    const distinctMatches: TrackItem[] = [];

    for (let i = 0; i < nextTracks.length; i++) {
      const candidate = nextTracks[i];
      if (getFilenameStem(candidate.name) === stem) {
        matchingIndices.push(i);
        if (!distinctMatches.some((existing) => isSameTrack(existing, candidate))) {
          distinctMatches.push(candidate);
        }
      }
    }

    if (distinctMatches.length !== 1) {
      continue;
    }

    for (const idx of matchingIndices) {
      const updated =
        mode === 'handle'
          ? withUpdatedLrcHandle(nextTracks[idx], lrc as FileSystemFileHandle)
          : withUpdatedLrcFile(nextTracks[idx], lrc as File);
      nextTracks[idx] = updated;
      updatedTracks.push(updated);
      changed = true;
    }
  }

  return {
    tracks: changed ? nextTracks : tracks,
    updatedTracks,
    changed,
  };
}

/**
 * Propagates updated lyrics associations to any matching cross-source tracks
 * in other folders so combineFlatPlaylists reflects the latest lyrics.
 */
export function syncUpdatedLyricsToFolders(
  folders: ImportedFolder[],
  updatedTracks: TrackItem[]
): ImportedFolder[] {
  if (updatedTracks.length === 0 || folders.length === 0) {
    return folders;
  }

  return folders.map((folder) => {
    let folderChanged = false;
    const nextTracks = folder.tracks.map((track) => {
      const match = updatedTracks.find((updated) => isSameTrack(track, updated));
      if (!match) return track;
      folderChanged = true;
      return {
        ...track,
        lrcHandle: match.lrcHandle,
        lrcFile: match.lrcFile,
        lrcContent: match.lrcContent,
      };
    });

    if (!folderChanged) return folder;

    return {
      ...folder,
      tracks: nextTracks,
      tree: buildFolderTree(folder.name, nextTracks, folder.id),
    };
  });
}
