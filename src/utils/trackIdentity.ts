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

    // Authoritative identity matching via FileSystemHandle.isSameEntry()
    // Pre-filtered by filename only; file size is not required to match as size can change
    if (newTrack.handle) {
      for (const existing of existingTracks) {
        if (existing.handle && existing.name === newTrack.name) {
          try {
            const isSame = await newTrack.handle.isSameEntry(existing.handle);
            if (isSame) {
              matchedExisting = existing;
              break;
            }
          } catch {
            // isSameEntry failed or permission issue; do not merge
          }
        }
      }
    }

    if (matchedExisting) {
      // Reliable match confirmed via isSameEntry!
      const currentFolderIds = matchedExisting.folderIds || [];
      if (!currentFolderIds.includes(folderId)) {
        matchedExisting.folderIds = [...currentFolderIds, folderId];
      }

      // Record newTrack's ID as an alias so references across either root can resolve
      const currentAliases = matchedExisting.aliases || [matchedExisting.id];
      if (!currentAliases.includes(newTrack.id)) {
        matchedExisting.aliases = [...currentAliases, newTrack.id];
      }

      // If newTrack observed a newer, nonzero, or hydrated file size, update existing track state
      if (
        newTrack.size !== matchedExisting.size ||
        newTrack.lastModified !== matchedExisting.lastModified
      ) {
        if (newTrack.size > 0 && matchedExisting.size === 0) {
          matchedExisting.size = newTrack.size;
          matchedExisting.lastModified = newTrack.lastModified;
          matchedExisting.status = 'normal';
        } else if (newTrack.size > 0) {
          matchedExisting.size = newTrack.size;
          matchedExisting.lastModified = newTrack.lastModified;
        }
      }

      // Keep fresh handle if present
      if (newTrack.handle) {
        matchedExisting.handle = newTrack.handle;
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
 */
export function combineFlatPlaylists(folders: ImportedFolder[]): TrackItem[] {
  const seenTrackIds = new Set<string>();
  const combined: TrackItem[] = [];

  for (const folder of folders) {
    for (const track of folder.tracks) {
      if (!seenTrackIds.has(track.id)) {
        seenTrackIds.add(track.id);
        combined.push(track);
      }
    }
  }

  return naturalSort(combined, (t) => t.name);
}
