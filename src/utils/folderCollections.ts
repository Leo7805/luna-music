import { FolderNode, ImportedFolder, IMPORTED_FILES_ROOT_ID } from '../types/music';

export interface FolderCollections {
  physicalFolders: ImportedFolder[];
  physicalFoldersCount: number;
  importedFilesFolder?: ImportedFolder;
  overviewNodes: FolderNode[];
}

export function isImportedFilesCollection(id: string): boolean {
  return id === IMPORTED_FILES_ROOT_ID;
}

/** Projects source order for display without rebuilding or changing any folder nodes. */
export function deriveFolderCollections(folders: readonly ImportedFolder[]): FolderCollections {
  const physicalFolders = folders.filter((folder) => !isImportedFilesCollection(folder.id));
  const imported = folders.find((folder) => isImportedFilesCollection(folder.id));
  const importedFilesFolder = imported && imported.tracks.length > 0 ? imported : undefined;
  return {
    physicalFolders,
    physicalFoldersCount: physicalFolders.length,
    importedFilesFolder,
    overviewNodes: [
      ...physicalFolders.map((folder) => folder.tree),
      ...(importedFilesFolder ? [importedFilesFolder.tree] : []),
    ],
  };
}
