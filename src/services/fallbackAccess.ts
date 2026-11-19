import {
  MusicLibrary,
  TrackItem,
  ImportedFolder,
  IMPORTED_FILES_ROOT_ID,
  IMPORTED_FILES_COLLECTION_NAME,
} from '../types/music';
import {
  isSupportedAudioFile,
  isLrcFile,
  stripExtension,
  buildFolderTree,
  flattenTreeToDfsPlaylist,
} from '../utils/musicTree';
import { createFallbackMetadata } from '../utils/metadata';

/**
 * Parses files chosen via <input type="file" webkitdirectory>
 */
export function parseFileList(files: FileList | File[]): MusicLibrary | null {
  if (!files || files.length === 0) return null;

  const fileArray = Array.from(files);
  let rootName = 'Local Music';

  // Determine root name from the first file's webkitRelativePath
  for (const file of fileArray) {
    const fullPath = file.webkitRelativePath || file.name;
    const parts = fullPath.replace(/\\/g, '/').split('/');
    if (parts.length > 1) {
      rootName = parts[0];
      break;
    }
  }

  // Map of dirPath -> Map<lowerBaseName, File> for .lrc files
  const lrcMap = new Map<string, Map<string, File>>();
  const audioFiles: {
    file: File;
    name: string;
    relativePath: string;
    dirPath: string;
    baseName: string;
  }[] = [];

  for (const file of fileArray) {
    const fullPath = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const parts = fullPath.split('/');

    let relativePath = fullPath;
    if (parts.length > 1 && parts[0] === rootName) {
      relativePath = parts.slice(1).join('/');
    }

    const dirParts = relativePath.split('/');
    const dirPath = dirParts.length > 1 ? dirParts.slice(0, -1).join('/') : '';
    const baseName = stripExtension(file.name).toLowerCase();

    if (isSupportedAudioFile(file.name)) {
      audioFiles.push({
        file,
        name: file.name,
        relativePath,
        dirPath,
        baseName,
      });
    } else if (isLrcFile(file.name)) {
      let dirLrcs = lrcMap.get(dirPath);
      if (!dirLrcs) {
        dirLrcs = new Map();
        lrcMap.set(dirPath, dirLrcs);
      }
      dirLrcs.set(baseName, file);
    }
  }

  if (audioFiles.length === 0) return null;

  const folderId = `input_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const tracks: TrackItem[] = audioFiles.map((item) => {
    const dirLrcs = lrcMap.get(item.dirPath);
    const lrcFile = dirLrcs ? dirLrcs.get(item.baseName) : undefined;

    return {
      id: `${folderId}:${item.relativePath}`,
      name: item.name,
      relativePath: item.relativePath,
      size: item.file.size,
      lastModified: item.file.lastModified,
      file: item.file,
      metadata: createFallbackMetadata(item.name, item.relativePath),
      lrcFile,
      status: item.file.size === 0 ? 'empty' : 'normal',
      folderIds: [folderId],
    };
  });

  const libraryId = `input:${rootName}`;
  const tree = buildFolderTree(rootName, tracks, folderId);
  const flatPlaylist = flattenTreeToDfsPlaylist(tree);

  const importedFolder: ImportedFolder = {
    id: folderId,
    name: rootName,
    sourceType: 'input-fallback',
    tree,
    tracks,
    trackCount: tracks.length,
    addedAt: Date.now(),
    lastScannedAt: Date.now(),
    permissionStatus: 'granted',
  };

  return {
    id: libraryId,
    name: rootName,
    folders: [importedFolder],
    tree,
    flatPlaylist,
    sourceType: 'input-fallback',
  };
}

/**
 * Parses files chosen via standard multi-file picker <input type="file" multiple>
 */
export function parseSelectedFiles(files: FileList | File[]): MusicLibrary | null {
  if (!files || files.length === 0) return null;

  const fileArray = Array.from(files);
  const lrcMap = new Map<string, File>();
  const audioFiles: File[] = [];

  for (const file of fileArray) {
    if (isSupportedAudioFile(file.name)) {
      audioFiles.push(file);
    } else if (isLrcFile(file.name)) {
      const base = stripExtension(file.name).toLowerCase();
      lrcMap.set(base, file);
    }
  }

  if (audioFiles.length === 0) return null;

  const folderId = IMPORTED_FILES_ROOT_ID;
  const seenNames = new Map<string, number>();

  const tracks: TrackItem[] = audioFiles.map((file) => {
    const count = (seenNames.get(file.name) ?? 0) + 1;
    seenNames.set(file.name, count);
    const uniqueName = count === 1 ? file.name : `${file.name} (${count})`;
    const base = stripExtension(file.name).toLowerCase();
    const lrcFile = lrcMap.get(base);

    return {
      id: `${folderId}:${uniqueName}`,
      name: file.name,
      relativePath: uniqueName,
      size: file.size,
      lastModified: file.lastModified,
      file,
      metadata: createFallbackMetadata(file.name, file.name),
      lrcFile,
      status: file.size === 0 ? 'empty' : 'normal',
      folderIds: [folderId],
    };
  });

  const rootName = IMPORTED_FILES_COLLECTION_NAME;
  const libraryId = `files:${rootName}`;
  const tree = buildFolderTree(rootName, tracks, folderId);
  const flatPlaylist = flattenTreeToDfsPlaylist(tree);

  const importedFolder: ImportedFolder = {
    id: folderId,
    name: rootName,
    sourceType: 'files',
    tree,
    tracks,
    trackCount: tracks.length,
    addedAt: Date.now(),
    lastScannedAt: Date.now(),
    permissionStatus: 'granted',
  };

  return {
    id: libraryId,
    name: rootName,
    folders: [importedFolder],
    tree,
    flatPlaylist,
    sourceType: 'files',
  };
}
