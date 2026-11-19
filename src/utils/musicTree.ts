import { FolderNode, TrackItem, ImportedFolder } from '../types/music';
import { naturalSort } from './naturalSort';

// Re-export extracted modules to maintain backward compatibility
export * from './audioFileTypes';
export * from './trackIdentity';
export * from './favouriteResolvers';
export * from './playlistResolvers';
export * from './queueAlgorithms';

/**
 * Normalizes relative paths to forward slashes with no leading/trailing slashes.
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
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
