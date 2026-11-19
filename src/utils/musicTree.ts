import { FolderNode, TrackItem, FileStatus, ImportedFolder } from '../types/music';
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
