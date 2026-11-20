import { Folder, FolderPlus } from 'lucide-react';
import {
  FolderNode,
  ImportedFolder,
  LibraryView,
  IMPORTED_FILES_ROOT_ID,
} from '../types/music';
import { RootFolderItem } from './RootFolderItem';
import { SidebarImportedFiles } from './SidebarImportedFiles';
import { LegacyFolderTreeNode } from './SidebarFolderTree';

export interface SidebarFolderSectionProps {
  currentView: LibraryView;
  selectedFolderPath: string;
  folders: ImportedFolder[];
  folderTree?: FolderNode | null;
  activeMenuFolderId: string | null;
  onToggleMenu: (id: string) => void;
  onOpenFolder: () => void;
  onSelectView: (view: LibraryView) => void;
  onSelectFolder: (path: string) => void;
  onRefreshFolder?: (folderId: string) => void;
  onRemoveFolderPrompt: (folder: ImportedFolder) => void;
  onRequestFolderPermission?: (folderId: string) => void;
  onClearImportedFilesPrompt: () => void;
}

export function SidebarFolderSection({
  currentView,
  selectedFolderPath,
  folders,
  folderTree,
  activeMenuFolderId,
  onToggleMenu,
  onOpenFolder,
  onSelectView,
  onSelectFolder,
  onRefreshFolder,
  onRemoveFolderPrompt,
  onRequestFolderPermission,
  onClearImportedFilesPrompt,
}: SidebarFolderSectionProps) {
  const physicalFolders = folders.filter((f) => f.id !== IMPORTED_FILES_ROOT_ID);
  const importedFilesFolder = folders.find((f) => f.id === IMPORTED_FILES_ROOT_ID);

  return (
    <div className="flex-1 flex flex-col min-h-0 border-t border-[var(--border-subtle)] dark:border-white/[0.08] mt-2">
      {/* Section Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] dark:text-slate-400">
          Music Folders
        </span>
        <button
          type="button"
          onClick={onOpenFolder}
          title="Add Music Folder"
          aria-label="Add Music Folder"
          className="p-1 rounded-lg hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.08] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] dark:text-slate-400 dark:hover:text-indigo-400 transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70"
        >
          <FolderPlus className="w-4 h-4" />
        </button>
      </div>

      {/* Root Folders Tree / List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 custom-scrollbar text-sm space-y-0.5">
        {folders.length > 0 ? (
          <>
            {physicalFolders.map((folder) => (
              <RootFolderItem
                key={folder.id}
                folder={folder}
                selectedPath={selectedFolderPath}
                isMenuOpen={activeMenuFolderId === folder.id}
                onToggleMenu={() => onToggleMenu(folder.id)}
                onSelectFolder={onSelectFolder}
                onRefreshFolder={(id) => onRefreshFolder?.(id)}
                onRemoveFolder={onRemoveFolderPrompt}
                onRequestPermission={(id) => onRequestFolderPermission?.(id)}
              />
            ))}

            {/* Virtual Imported Files collection rendered after physical folders */}
            {importedFilesFolder && importedFilesFolder.tracks.length > 0 && (
              <SidebarImportedFiles
                importedFolder={importedFilesFolder}
                isSelected={currentView === 'imported-files'}
                isMenuOpen={activeMenuFolderId === 'imported_files'}
                onToggleMenu={() => onToggleMenu('imported_files')}
                onSelect={() => onSelectView('imported-files')}
                onClearAllPrompt={onClearImportedFilesPrompt}
              />
            )}
          </>
        ) : folderTree ? (
          <LegacyFolderTreeNode
            node={folderTree}
            selectedPath={selectedFolderPath}
            onSelect={onSelectFolder}
            depth={0}
            isRoot={true}
          />
        ) : (
          <div className="px-3 py-6 text-center">
            <Folder className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-2 opacity-50" />
            <p className="text-xs text-slate-500 dark:text-slate-400">No folder loaded yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
