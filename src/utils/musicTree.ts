import { FolderNode, TrackItem, FileStatus, ImportedFolder, PlaylistTrackReference, RepeatMode } from '../types/music';
import { naturalSort } from './naturalSort';

export const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  'mp3',
  'm4a',
  'aac',
  'wav',
  'wave',
  'ogg',
  'oga',
  'flac',
  'opus',
  'weba',
]);

export function isSupportedAudioFile(filename: string): boolean {
  const parts = filename.split('.');
  if (parts.length < 2) return false;
  const ext = parts.pop()?.toLowerCase();
  return ext !== undefined && SUPPORTED_AUDIO_EXTENSIONS.has(ext);
}

export function isLrcFile(filename: string): boolean {
  return filename.toLowerCase().endsWith('.lrc');
}

/**
 * Returns the standard MIME type for an audio filename.
 */
export function getMimeTypeForFilename(filename: string): string | null {
  const parts = filename.split('.');
  if (parts.length < 2) return null;
  const ext = parts.pop()?.toLowerCase();
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
    case 'aac':
      return 'audio/aac';
    case 'wav':
    case 'wave':
      return 'audio/wav';
    case 'flac':
      return 'audio/flac';
    case 'ogg':
    case 'oga':
      return 'audio/ogg';
    case 'opus':
      return 'audio/ogg; codecs="opus"';
    case 'weba':
      return 'audio/webm';
    default:
      return null;
  }
}

/**
 * Checks whether the current browser environment can play this audio format/codec.
 * Returns false only when the browser explicitly reports no support (canPlayType returns "").
 */
export function isFormatSupportedByBrowser(filename: string): boolean {
  if (typeof Audio === 'undefined') return true;
  const mime = getMimeTypeForFilename(filename);
  if (!mime) return false;
  try {
    const audio = new Audio();
    const canPlay = audio.canPlayType(mime);
    return canPlay === 'probably' || canPlay === 'maybe';
  } catch {
    return true;
  }
}

/**
 * Determines the effective FileStatus for a track.
 */
export function getTrackStatus(track: TrackItem): FileStatus {
  if (track.status) {
    return track.status;
  }
  return track.size === 0 ? 'empty' : 'normal';
}

/**
 * Checks whether a track is normally playable.
 */
export function isTrackPlayable(track: TrackItem): boolean {
  return getTrackStatus(track) === 'normal';
}

/**
 * Normalizes relative paths to forward slashes with no leading/trailing slashes.
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

/**
 * Strips audio extension from filename for fallback titles or LRC matching.
 */
export function stripExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0) return filename;
  return filename.substring(0, lastDot);
}

interface RawFolderBuilder {
  name: string;
  relativePath: string;
  tracks: TrackItem[];
  subfolderMap: Map<string, RawFolderBuilder>;
}

/**
 * Builds a pruned, naturally sorted folder tree from a flat list of discovered tracks.
 * Supports optional pathPrefix to namespace subfolder paths for multi-folder integration.
 */
export function buildFolderTree(
  rootName: string,
  rawTracks: TrackItem[],
  pathPrefix = ''
): FolderNode {
  const rootBuilder: RawFolderBuilder = {
    name: rootName || 'Music Library',
    relativePath: pathPrefix,
    tracks: [],
    subfolderMap: new Map(),
  };

  for (const track of rawTracks) {
    const normalized = normalizePath(track.relativePath);
    const parts = normalized.split('/');

    if (parts.length <= 1) {
      rootBuilder.tracks.push(track);
      continue;
    }

    let current = rootBuilder;
    const folderParts = parts.slice(0, parts.length - 1);
    let accumulatedPath = pathPrefix;

    for (const folderName of folderParts) {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${folderName}` : folderName;
      let next = current.subfolderMap.get(folderName);
      if (!next) {
        next = {
          name: folderName,
          relativePath: accumulatedPath,
          tracks: [],
          subfolderMap: new Map(),
        };
        current.subfolderMap.set(folderName, next);
      }
      current = next;
    }

    current.tracks.push(track);
  }

  function convert(builder: RawFolderBuilder): FolderNode | null {
    // Sort direct tracks naturally by filename or title
    const sortedTracks = naturalSort(builder.tracks, (t) => t.name);

    // Sort subfolders naturally and recursively prune
    const sortedSubfolderBuilders = naturalSort(
      Array.from(builder.subfolderMap.values()),
      (b) => b.name
    );

    const prunedSubfolders: FolderNode[] = [];
    let childTrackCount = 0;

    for (const subBuilder of sortedSubfolderBuilders) {
      const childNode = convert(subBuilder);
      if (childNode && childNode.totalTrackCount > 0) {
        prunedSubfolders.push(childNode);
        childTrackCount += childNode.totalTrackCount;
      }
    }

    const totalTrackCount = sortedTracks.length + childTrackCount;

    if (totalTrackCount === 0 && builder.relativePath !== '') {
      return null;
    }

    return {
      id: builder.relativePath || 'root',
      name: builder.name,
      relativePath: builder.relativePath,
      tracks: sortedTracks,
      subfolders: prunedSubfolders,
      totalTrackCount,
    };
  }

  const rootNode = convert(rootBuilder);
  if (!rootNode) {
    return {
      id: pathPrefix || 'root',
      name: rootName || 'Music Library',
      relativePath: pathPrefix,
      tracks: [],
      subfolders: [],
      totalTrackCount: 0,
    };
  }

  return rootNode;
}

/**
 * Combines multiple ImportedFolder trees into a unified virtual root FolderNode.
 * Each imported folder is represented as a top-level subfolder in the unified tree.
 */
export function buildUnifiedMultiFolderTree(folders: ImportedFolder[]): FolderNode {
  if (folders.length === 0) {
    return {
      id: 'root',
      name: 'Music Library',
      relativePath: '',
      tracks: [],
      subfolders: [],
      totalTrackCount: 0,
    };
  }

  const topSubfolders: FolderNode[] = naturalSort(
    folders.map((f) => f.tree),
    (node) => node.name
  );

  const totalTrackCount = topSubfolders.reduce((sum, f) => sum + f.totalTrackCount, 0);

  return {
    id: 'root',
    name: 'Music Library',
    relativePath: '',
    tracks: [],
    subfolders: topSubfolders,
    totalTrackCount,
  };
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
 * Deterministic Depth-First Search (DFS) playback order:
 * 1. Current folder's sorted tracks first.
 * 2. Then recursively each sorted subfolder in order.
 */
export function flattenTreeToDfsPlaylist(node: FolderNode): TrackItem[] {
  const result: TrackItem[] = [];

  function traverse(current: FolderNode) {
    for (const track of current.tracks) {
      result.push(track);
    }
    for (const sub of current.subfolders) {
      traverse(sub);
    }
  }

  traverse(node);
  return result;
}

/**
 * Finds a folder node within the tree by its relative path.
 */
export function findFolderNodeByPath(root: FolderNode, path: string): FolderNode | null {
  const normalized = normalizePath(path);
  if (!normalized || normalized === 'root' || normalized === root.relativePath) {
    return root;
  }

  function search(node: FolderNode): FolderNode | null {
    if (node.relativePath === normalized) return node;
    for (const sub of node.subfolders) {
      const found = search(sub);
      if (found) return found;
    }
    return null;
  }

  return search(root);
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

/**
 * Generates breadcrumbs array from a relative path.
 * When folders is provided, maps root folder IDs to friendly folder names.
 */
export function getBreadcrumbs(
  rootName: string,
  relativePath: string,
  folders?: ImportedFolder[]
): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [{ name: rootName || 'Library', path: '' }];
  const normalized = normalizePath(relativePath);
  if (!normalized) return items;

  const parts = normalized.split('/');
  let currentPath = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    let displayName = part;
    if (i === 0 && folders && folders.length > 0) {
      const matched = folders.find((f) => f.id === part);
      if (matched) {
        displayName = matched.name;
      }
    }
    items.push({
      name: displayName,
      path: currentPath,
    });
  }

  return items;
}

/**
 * Resolves an ordered list of PlaylistTrackReferences against library tracks,
 * using canonical track IDs and aliases.
 * If a track is not currently loaded in the library (e.g. source folder disconnected or offline),
 * creates a placeholder TrackItem with status 'unreadable' preserving its metadata.
 */
export function resolvePlaylistTracks(
  references: PlaylistTrackReference[],
  libraryTracks: TrackItem[]
): TrackItem[] {
  const idMap = new Map<string, TrackItem>();
  for (const track of libraryTracks) {
    idMap.set(track.id, track);
    if (track.aliases) {
      for (const alias of track.aliases) {
        idMap.set(alias, track);
      }
    }
  }

  return references.map((ref) => {
    const matched = idMap.get(ref.trackId);
    if (matched) {
      return matched;
    }

    // Source is offline / disconnected: preserve entry with 'unreadable' status
    const placeholder: TrackItem = {
      id: ref.trackId,
      name: ref.name,
      relativePath: ref.name,
      size: 0,
      lastModified: ref.addedAt,
      status: 'unreadable',
      metadata: {
        title: ref.name,
        artist: ref.artist || 'Unknown Artist',
        album: ref.album || 'Unknown Album',
        duration: ref.duration || 0,
        isMetadataLoaded: true,
      },
    };
    return placeholder;
  });
}

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
 * Authoritative check if a track matches the user's favourites set.
 * Checks canonical id, aliases, and relative path matching.
 * When libraryTracks is provided, legacy relative path matching is only applied
 * if the relative path unambiguously refers to exactly one track in the library.
 */
export function isFavouriteTrack(
  track: TrackItem,
  favourites: Set<string>,
  libraryTracks?: TrackItem[]
): boolean {
  if (favourites.size === 0) return false;
  if (favourites.has(track.id)) return true;
  if (track.aliases && track.aliases.some((alias) => favourites.has(alias))) return true;

  // Check legacy relative path matching (bare relativePath without folder prefix)
  if (favourites.has(track.relativePath)) {
    if (libraryTracks && libraryTracks.length > 0) {
      const matchCount = libraryTracks.filter(
        (t) => t.relativePath === track.relativePath
      ).length;
      if (matchCount === 1) {
        return true;
      }
      // Ambiguous: multiple tracks across independent folders share this relative path
      return false;
    }
    return true;
  }

  return false;
}

export interface FavouriteResolutionResult {
  resolvedTracks: TrackItem[];
  unresolvedIds: string[];
  migratedMap: Map<string, string>;
}

/**
 * Resolves stored favourite IDs against the library tracks.
 * - Deduplicates resolved tracks by canonical ID (avoiding inflated counts).
 * - Preserves unresolved favourite IDs so they are not lost when folders are detached.
 * - Only migrates legacy relativePath matches when the match is strictly unambiguous (exactly 1 track).
 * - Preserves ambiguous IDs in unresolvedIds to prevent marking the wrong track.
 */
export function resolveFavouriteTracks(
  libraryTracks: TrackItem[],
  favourites: Set<string>
): FavouriteResolutionResult {
  const resolvedTracks: TrackItem[] = [];
  const resolvedTrackIds = new Set<string>();
  const matchedFavIds = new Set<string>();
  const migratedMap = new Map<string, string>();

  const trackById = new Map<string, TrackItem>();
  const trackByAlias = new Map<string, TrackItem>();
  const tracksByRelativePath = new Map<string, TrackItem[]>();

  for (const track of libraryTracks) {
    trackById.set(track.id, track);
    if (track.aliases) {
      for (const alias of track.aliases) {
        trackByAlias.set(alias, track);
      }
    }
    const relList = tracksByRelativePath.get(track.relativePath);
    if (relList) {
      relList.push(track);
    } else {
      tracksByRelativePath.set(track.relativePath, [track]);
    }
  }

  for (const favId of favourites) {
    let matchedTrack: TrackItem | undefined = trackById.get(favId);

    if (!matchedTrack) {
      matchedTrack = trackByAlias.get(favId);
      if (matchedTrack) {
        migratedMap.set(favId, matchedTrack.id);
      }
    }

    if (!matchedTrack) {
      let relativePathCandidate = favId;
      const colonIdx = favId.indexOf(':');
      if (colonIdx >= 0) {
        relativePathCandidate = favId.slice(colonIdx + 1);
      }
      const candidates = tracksByRelativePath.get(relativePathCandidate);
      // Strictly require unambiguous match (exactly 1 track across all imported folders)
      if (candidates && candidates.length === 1) {
        matchedTrack = candidates[0];
        migratedMap.set(favId, matchedTrack.id);
      }
    }

    if (matchedTrack) {
      matchedFavIds.add(favId);
      if (!resolvedTrackIds.has(matchedTrack.id)) {
        resolvedTrackIds.add(matchedTrack.id);
        resolvedTracks.push(matchedTrack);
      }
    }
  }

  const unresolvedIds: string[] = [];
  for (const favId of favourites) {
    if (!matchedFavIds.has(favId)) {
      unresolvedIds.push(favId);
    }
  }

  return {
    resolvedTracks,
    unresolvedIds,
    migratedMap,
  };
}

/**
 * Checks whether a track is already in the upcoming section of the playback queue
 * (i.e. strictly after the currently playing track).
 */
export function isInUpcomingQueue(
  track: TrackItem,
  queue: TrackItem[],
  currentTrack: TrackItem | null
): boolean {
  if (queue.length === 0) return false;
  const curIdx = currentTrack
    ? queue.findIndex((t) => isSameTrack(t, currentTrack))
    : -1;
  const upcoming = curIdx >= 0 ? queue.slice(curIdx + 1) : queue;
  return upcoming.some((t) => isSameTrack(t, track));
}

/**
 * Computes the updated queue and outcome for a Play Next operation.
 * - If the selected track already exists in the upcoming queue, move the existing occurrence to immediately after current track.
 * - Do not create another occurrence.
 * - If multiple duplicate occurrences already exist in upcoming queue, consolidate into one.
 * - If selected track is currently playing, allow one additional occurrence immediately after current track.
 * - If not in upcoming queue, insert immediately after current track.
 * - Preserves relative order of unrelated tracks.
 */
export function applyPlayNext(
  queue: TrackItem[],
  currentTrack: TrackItem | null,
  trackToInsert: TrackItem
): { nextQueue: TrackItem[]; outcome: 'added' | 'moved' } {
  if (queue.length === 0) {
    return {
      nextQueue: [trackToInsert],
      outcome: 'added',
    };
  }

  const curIdx = currentTrack
    ? queue.findIndex((t) => isSameTrack(t, currentTrack))
    : -1;

  if (curIdx >= 0) {
    const historyAndCurrent = queue.slice(0, curIdx + 1);
    const upcoming = queue.slice(curIdx + 1);
    const wasInUpcoming = upcoming.some((t) => isSameTrack(t, trackToInsert));
    const outcome = wasInUpcoming ? 'moved' : 'added';

    // Remove any occurrences of this track from the upcoming queue
    const filteredUpcoming = upcoming.filter((t) => !isSameTrack(t, trackToInsert));

    return {
      nextQueue: [...historyAndCurrent, trackToInsert, ...filteredUpcoming],
      outcome,
    };
  } else {
    // If current track is not found in queue, the entire queue is upcoming
    const wasInQueue = queue.some((t) => isSameTrack(t, trackToInsert));
    const outcome = wasInQueue ? 'moved' : 'added';
    const filtered = queue.filter((t) => !isSameTrack(t, trackToInsert));

    return {
      nextQueue: currentTrack
        ? [currentTrack, trackToInsert, ...filtered]
        : [trackToInsert, ...filtered],
      outcome,
    };
  }
}

/**
 * Computes the updated queue and outcome for an Add to Queue operation.
 * - If an incoming track is already in the upcoming queue, do not append another occurrence.
 * - If an incoming track is not in the upcoming queue, append it normally.
 * - Does not modify the currently playing track.
 */
export function applyAddToQueue(
  queue: TrackItem[],
  currentTrack: TrackItem | null,
  incoming: TrackItem | TrackItem[]
): { nextQueue: TrackItem[]; addedCount: number } {
  const tracks = Array.isArray(incoming) ? incoming : [incoming];
  if (tracks.length === 0) {
    return { nextQueue: queue, addedCount: 0 };
  }

  if (queue.length === 0 && !currentTrack) {
    return { nextQueue: tracks, addedCount: tracks.length };
  }

  const curIdx = currentTrack
    ? queue.findIndex((t) => isSameTrack(t, currentTrack))
    : -1;

  const upcoming = curIdx >= 0 ? queue.slice(curIdx + 1) : queue;

  const toAppend: TrackItem[] = [];
  for (const track of tracks) {
    const isAlreadyUpcoming =
      upcoming.some((t) => isSameTrack(t, track)) ||
      toAppend.some((t) => isSameTrack(t, track));

    if (!isAlreadyUpcoming) {
      toAppend.push(track);
    }
  }

  if (toAppend.length === 0) {
    return { nextQueue: queue, addedCount: 0 };
  }

  return {
    nextQueue: [...queue, ...toAppend],
    addedCount: toAppend.length,
  };
}

/**
 * Determines the next track to play taking into account Play Next overrides, shuffle, and repeat modes.
 */
export function getNextTrackToPlay(
  queue: TrackItem[],
  currentTrack: TrackItem | null,
  shuffle: boolean,
  repeatMode: RepeatMode,
  playNextTrackId: string | null
): { nextTrack: TrackItem | null; shouldClearOverride: boolean } {
  if (queue.length === 0) return { nextTrack: null, shouldClearOverride: false };
  if (!currentTrack) return { nextTrack: queue[0], shouldClearOverride: false };

  const currentIndex = queue.findIndex((t) => isSameTrack(t, currentTrack));

  // 1. Play Next override takes precedence over shuffle
  if (playNextTrackId) {
    const nextIdx = currentIndex >= 0 ? currentIndex + 1 : 0;
    if (
      nextIdx < queue.length &&
      (queue[nextIdx].id === playNextTrackId ||
        Boolean(queue[nextIdx].aliases?.includes(playNextTrackId)))
    ) {
      return { nextTrack: queue[nextIdx], shouldClearOverride: true };
    }

    const candidateIdx = queue.findIndex(
      (t, idx) =>
        (currentIndex < 0 || idx > currentIndex) &&
        (t.id === playNextTrackId || Boolean(t.aliases?.includes(playNextTrackId)))
    );
    if (candidateIdx >= 0) {
      return { nextTrack: queue[candidateIdx], shouldClearOverride: true };
    }
  }

  // 2. Shuffle mode (when no Play Next override)
  if (shuffle) {
    const otherIndices = queue
      .map((_, i) => i)
      .filter((i) => !isSameTrack(queue[i], currentTrack));
    const nextIndex =
      otherIndices.length > 0
        ? otherIndices[Math.floor(Math.random() * otherIndices.length)]
        : 0;
    return { nextTrack: queue[nextIndex], shouldClearOverride: false };
  }

  // 3. Normal queue progression
  if (currentIndex === -1 || currentIndex === queue.length - 1) {
    if (repeatMode === 'all') {
      return { nextTrack: queue[0], shouldClearOverride: false };
    }
    return { nextTrack: null, shouldClearOverride: false };
  }

  return { nextTrack: queue[currentIndex + 1], shouldClearOverride: false };
}
