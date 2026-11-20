import { MusicLibrary, TrackItem, FileStatus, ImportedFolder } from '../types/music';
import {
  isSupportedAudioFile,
  isLrcFile,
  stripExtension,
  buildFolderTree,
} from '../utils/musicTree';
import { createFallbackMetadata } from '../utils/metadata';

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function promptOpenDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null;

  try {
    const handle = await window.showDirectoryPicker({
      mode: 'read',
    });
    return handle;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return null;
    }
    throw err;
  }
}

export async function promptOpenFiles(): Promise<FileSystemFileHandle[] | null> {
  if (typeof window === 'undefined' || !('showOpenFilePicker' in window)) return null;

  try {
    const handles = await window.showOpenFilePicker({
      multiple: true,
      types: [
        {
          description: 'Audio & Lyrics Files',
          accept: {
            'audio/*': ['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.weba'],
            'text/plain': ['.lrc'],
          },
        },
      ],
    });
    return handles;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return null;
    }
    throw err;
  }
}

export async function verifyHandlePermission(
  handle: FileSystemHandle,
  requestIfPrompt = false
): Promise<boolean> {
  try {
    const current = await handle.queryPermission({ mode: 'read' });
    if (current === 'granted') return true;

    if (requestIfPrompt && current === 'prompt') {
      const requested = await handle.requestPermission({ mode: 'read' });
      return requested === 'granted';
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Scans a single directory handle into a self-contained ImportedFolder.
 */
export async function scanRootFolderHandle(
  rootHandle: FileSystemDirectoryHandle,
  folderId?: string,
  onProgress?: (count: number) => void
): Promise<ImportedFolder> {
  const rootName = rootHandle.name || 'Local Music';
  const id = folderId || `fsa_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const discoveredAudio: {
    name: string;
    relativePath: string;
    dirPath: string;
    baseName: string;
    handle: FileSystemFileHandle;
    size: number;
    lastModified: number;
    status: FileStatus;
  }[] = [];

  // Map of dirPath -> Map<lowerBaseName, FileSystemFileHandle> for .lrc files
  const lrcMap = new Map<string, Map<string, FileSystemFileHandle>>();

  async function walk(dirHandle: FileSystemDirectoryHandle, currentPath: string): Promise<void> {
    const dirLrc = new Map<string, FileSystemFileHandle>();

    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const name = entry.name;
        if (isSupportedAudioFile(name)) {
          const fileHandle = entry as FileSystemFileHandle;
          const relativePath = currentPath ? `${currentPath}/${name}` : name;
          try {
            const file = await fileHandle.getFile();
            discoveredAudio.push({
              name,
              relativePath,
              dirPath: currentPath,
              baseName: stripExtension(name).toLowerCase(),
              handle: fileHandle,
              size: file.size,
              lastModified: file.lastModified,
              status: file.size === 0 ? 'empty' : 'normal',
            });

            if (onProgress && discoveredAudio.length % 25 === 0) {
              onProgress(discoveredAudio.length);
            }
          } catch {
            // Keep locked or unreadable files visible in library marked as unreadable
            discoveredAudio.push({
              name,
              relativePath,
              dirPath: currentPath,
              baseName: stripExtension(name).toLowerCase(),
              handle: fileHandle,
              size: 0,
              lastModified: Date.now(),
              status: 'unreadable',
            });
          }
        } else if (isLrcFile(name)) {
          const base = stripExtension(name).toLowerCase();
          dirLrc.set(base, entry as FileSystemFileHandle);
        }
      } else if (entry.kind === 'directory') {
        // Skip hidden folders
        if (entry.name.startsWith('.')) continue;

        const subPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        try {
          await walk(entry as FileSystemDirectoryHandle, subPath);
        } catch {
          // Gracefully skip inaccessible folders
        }
      }
    }

    if (dirLrc.size > 0) {
      lrcMap.set(currentPath, dirLrc);
    }
  }

  await walk(rootHandle, '');

  const tracks: TrackItem[] = discoveredAudio.map((item) => {
    const dirLrcs = lrcMap.get(item.dirPath);
    const lrcHandle = dirLrcs ? dirLrcs.get(item.baseName) : undefined;

    return {
      id: `${id}:${item.relativePath}`,
      name: item.name,
      relativePath: item.relativePath,
      size: item.size,
      lastModified: item.lastModified,
      handle: item.handle,
      metadata: createFallbackMetadata(item.name, item.relativePath),
      lrcHandle,
      status: item.status,
      folderIds: [id],
    };
  });

  const tree = buildFolderTree(rootName, tracks, id);

  return {
    id,
    name: rootName,
    sourceType: 'fs-access',
    handle: rootHandle,
    tree,
    tracks,
    trackCount: tracks.length,
    addedAt: Date.now(),
    lastScannedAt: Date.now(),
    permissionStatus: 'granted',
  };
}

/**
 * Recursively scans directory handle, collecting audio files and pairing with .lrc companion files.
 * Backwards-compatible single root entrypoint.
 */
export async function scanDirectoryHandle(
  rootHandle: FileSystemDirectoryHandle,
  onProgress?: (count: number) => void
): Promise<MusicLibrary> {
  const folder = await scanRootFolderHandle(rootHandle, undefined, onProgress);

  return {
    id: folder.id,
    name: folder.name,
    folders: [folder],
    tree: folder.tree,
    flatPlaylist: folder.tracks,
    sourceType: 'fs-access',
    handle: rootHandle,
  };
}
