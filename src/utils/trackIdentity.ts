import { TrackItem, ImportedFolder } from '../types/music';
import { naturalSort } from './naturalSort';

/**
 * Authoritative check for logical track identity based on canonical ID and aliases.
 * Does not compare tracks solely by filename, artist, file size, or metadata.
 */
export function isSameTrack(a: TrackItem, b: TrackItem): boolean {
  if (a.id === b.id) return true;
  if (a.aliases && a.aliases.includes(b.id)) return true;
  if (b.aliases && b.aliases.includes(a.id)) return true;
  if (
    a.aliases &&
    b.aliases &&
    a.aliases.some((alias) => b.aliases!.includes(alias))
  ) {
    return true;
  }
  return false;
}

/**
 * Reconciles metadata, lyrics, usable handles, and source memberships
 * between two references representing the same physical file.
 * Preserves existing metadata and lyrics without overwriting populated fields with empty values.
 */
export function mergeTrackMetadataAndSources(target: TrackItem, source: TrackItem): TrackItem {
  // 1. Reconcile source memberships (folderIds)
  const targetFolderIds = target.folderIds || [];
  const sourceFolderIds = source.folderIds || [];
  const mergedFolderIds = Array.from(new Set([...targetFolderIds, ...sourceFolderIds]));
  target.folderIds = mergedFolderIds;
  source.folderIds = mergedFolderIds;

  // 2. Reconcile verified aliases
  const targetAliases = target.aliases || [target.id];
  const sourceAliases = source.aliases || [source.id];
  const mergedAliases = Array.from(
    new Set([...targetAliases, ...sourceAliases, target.id, source.id])
  );
  target.aliases = mergedAliases;
  source.aliases = mergedAliases;

  // 3. Reconcile lyrics associations in both directions
  const lrcHandle = target.lrcHandle || source.lrcHandle;
  const lrcFile = target.lrcFile || source.lrcFile;
  const lrcContent = target.lrcContent || source.lrcContent;

  if (lrcHandle) {
    target.lrcHandle = lrcHandle;
    source.lrcHandle = lrcHandle;
  }
  if (lrcFile) {
    target.lrcFile = lrcFile;
    source.lrcFile = lrcFile;
  }
  if (lrcContent) {
    target.lrcContent = lrcContent;
    source.lrcContent = lrcContent;
  }

  // 4. Reconcile handles and file blobs
  if (source.handle) target.handle = source.handle;
  if (!source.handle && target.handle) source.handle = target.handle;
  if (!target.file && source.file) target.file = source.file;
  if (!source.file && target.file) source.file = target.file;

  // 5. Reconcile metadata without overwriting populated fields with fallback/empty values
  if (source.metadata.isMetadataLoaded && !target.metadata.isMetadataLoaded) {
    target.metadata = { ...source.metadata };
  } else if (target.metadata.isMetadataLoaded && !source.metadata.isMetadataLoaded) {
    source.metadata = { ...target.metadata };
  } else {
    // Both loaded or both fallback: preserve best non-empty attributes
    if (!target.metadata.artworkUrl && source.metadata.artworkUrl) {
      target.metadata.artworkUrl = source.metadata.artworkUrl;
      source.metadata.artworkUrl = source.metadata.artworkUrl;
    }
    if (!target.metadata.duration && source.metadata.duration) {
      target.metadata.duration = source.metadata.duration;
      source.metadata.duration = source.metadata.duration;
    }
    if (
      (!target.metadata.title || target.metadata.title === target.name) &&
      source.metadata.title &&
      source.metadata.title !== source.name
    ) {
      target.metadata.title = source.metadata.title;
      source.metadata.title = source.metadata.title;
    }
    if (
      (!target.metadata.artist || target.metadata.artist === 'Unknown Artist') &&
      source.metadata.artist &&
      source.metadata.artist !== 'Unknown Artist'
    ) {
      target.metadata.artist = source.metadata.artist;
      source.metadata.artist = source.metadata.artist;
    }
    if (
      (!target.metadata.album || target.metadata.album === 'Unknown Album') &&
      source.metadata.album &&
      source.metadata.album !== 'Unknown Album'
    ) {
      target.metadata.album = source.metadata.album;
      source.metadata.album = source.metadata.album;
    }
  }

  // 6. Reconcile size and status
  if (target.status === 'unreadable' && source.status === 'normal') {
    target.status = 'normal';
  } else if (source.status === 'unreadable' && target.status === 'normal') {
    source.status = 'normal';
  }

  if (source.size !== target.size || source.lastModified !== target.lastModified) {
    if (source.size > 0 && target.size === 0) {
      target.size = source.size;
      target.lastModified = source.lastModified;
      target.status = 'normal';
    } else if (source.size > 0) {
      target.size = source.size;
      target.lastModified = source.lastModified;
    } else if (target.size > 0 && source.size === 0) {
      source.size = target.size;
      source.lastModified = target.lastModified;
      source.status = 'normal';
    }
  }

  return target;
}

/**
 * Checks an existing track pool for a reliable match with a FileSystemFileHandle using isSameEntry().
 */
export async function findExistingTrackByHandle(
  handle: FileSystemFileHandle,
  existingTracks: TrackItem[],
  fileName?: string
): Promise<TrackItem | null> {
  const targetName = fileName || handle.name;
  for (const existing of existingTracks) {
    if (existing.handle) {
      if (targetName && existing.name !== targetName) {
        continue;
      }
      try {
        let isSame = false;
        if (typeof handle.isSameEntry === 'function') {
          isSame = await handle.isSameEntry(existing.handle);
        }
        if (!isSame && typeof existing.handle.isSameEntry === 'function') {
          isSame = await existing.handle.isSameEntry(handle);
        }
        if (isSame) {
          return existing;
        }
      } catch {
        // isSameEntry failed or permission issue; do not merge
      }
    }
  }
  return null;
}

/**
 * Safely reconciles tracks from a new/refreshed folder against existing tracks.
 * Uses FileSystemHandle.isSameEntry() as the authoritative identity comparison.
 * Does NOT require file size to match, as file sizes are mutable (e.g. hydration/edits).
 * Does NOT merge independent sources based merely on metadata (name, size, timestamp).
 */
export async function reconcileOverlappingTracks(
  newTracks: TrackItem[],
  existingTracks: TrackItem[],
  folderId: string
): Promise<TrackItem[]> {
  const result: TrackItem[] = [];

  for (const newTrack of newTracks) {
    let matchedExisting: TrackItem | null = null;

    // 1. Authoritative identity matching via FileSystemHandle.isSameEntry()
    if (newTrack.handle) {
      matchedExisting = await findExistingTrackByHandle(newTrack.handle, existingTracks, newTrack.name);
    }

    // 2. Existing verified aliases / canonical ID match (for already-reconciled items)
    if (!matchedExisting) {
      for (const existing of existingTracks) {
        if (isSameTrack(existing, newTrack)) {
          matchedExisting = existing;
          break;
        }
      }
    }

    if (matchedExisting) {
      mergeTrackMetadataAndSources(matchedExisting, newTrack);

      const currentFolderIds = matchedExisting.folderIds || [];
      if (!currentFolderIds.includes(folderId)) {
        matchedExisting.folderIds = [...currentFolderIds, folderId];
      }

      const currentAliases = matchedExisting.aliases || [matchedExisting.id];
      if (!currentAliases.includes(newTrack.id)) {
        matchedExisting.aliases = [...currentAliases, newTrack.id];
      }

      result.push(matchedExisting);
    } else {
      // Independent track - preserve separate identity
      const folderIds = newTrack.folderIds || [];
      if (!folderIds.includes(folderId)) {
        newTrack.folderIds = [...folderIds, folderId];
      }
      if (!newTrack.aliases) {
        newTrack.aliases = [newTrack.id];
      }
      result.push(newTrack);
    }
  }

  return result;
}

/**
 * Merges and deduplicates tracks across all imported roots to generate the global flat playlist.
 * Ensures each logical track appears only once in the global list, even if referenced by multiple roots.
 * Reconciles metadata, lyrics, and source memberships for shared tracks across roots.
 */
export function combineFlatPlaylists(folders: ImportedFolder[]): TrackItem[] {
  const seenTrackIds = new Set<string>();
  const combined: TrackItem[] = [];

  for (const folder of folders) {
    for (const track of folder.tracks) {
      const alreadyInCombined =
        seenTrackIds.has(track.id) ||
        (track.aliases && track.aliases.some((alias) => seenTrackIds.has(alias))) ||
        combined.some((existing) => isSameTrack(existing, track));

      if (!alreadyInCombined) {
        seenTrackIds.add(track.id);
        if (track.aliases) {
          track.aliases.forEach((alias) => seenTrackIds.add(alias));
        }
        combined.push(track);
      } else {
        const existing = combined.find((e) => isSameTrack(e, track));
        if (existing) {
          mergeTrackMetadataAndSources(existing, track);
          seenTrackIds.add(track.id);
          if (track.aliases) {
            track.aliases.forEach((alias) => seenTrackIds.add(alias));
          }
        }
      }
    }
  }

  return naturalSort(combined, (t) => t.name);
}
