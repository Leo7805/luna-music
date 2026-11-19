import { FolderNode, TrackItem, FileStatus } from '../types/music';
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
 */
export function buildFolderTree(
  rootName: string,
  rawTracks: TrackItem[]
): FolderNode {
  const rootBuilder: RawFolderBuilder = {
    name: rootName || 'Music Library',
    relativePath: '',
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
    let accumulatedPath = '';

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
      id: 'root',
      name: rootName || 'Music Library',
      relativePath: '',
      tracks: [],
      subfolders: [],
      totalTrackCount: 0,
    };
  }

  return rootNode;
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
 */
export function getBreadcrumbs(rootName: string, relativePath: string): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [{ name: rootName || 'Library', path: '' }];
  const normalized = normalizePath(relativePath);
  if (!normalized) return items;

  const parts = normalized.split('/');
  let currentPath = '';

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    items.push({
      name: part,
      path: currentPath,
    });
  }

  return items;
}
