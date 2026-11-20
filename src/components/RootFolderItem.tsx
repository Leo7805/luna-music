import { useState, useEffect } from 'react';
import {
  Folder,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Key,
  Loader2,
} from 'lucide-react';
import { ImportedFolder } from '../types/music';
import { SubfolderTreeNode } from './SidebarFolderTree';

export interface RootFolderItemProps {
  folder: ImportedFolder;
  selectedPath: string;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onSelectFolder: (path: string) => void;
  onRefreshFolder: (folderId: string) => void;
  onRemoveFolder: (folder: ImportedFolder) => void;
  onRequestPermission: (folderId: string) => void;
}

export function RootFolderItem({
  folder,
  selectedPath,
  isMenuOpen,
  onToggleMenu,
  onSelectFolder,
  onRefreshFolder,
  onRemoveFolder,
  onRequestPermission,
}: RootFolderItemProps) {
  const isInside =
    selectedPath === folder.tree.relativePath ||
    selectedPath.startsWith(`${folder.tree.relativePath}/`);
  const [isOpen, setIsOpen] = useState<boolean>(isInside);
  const isSelected = selectedPath === folder.tree.relativePath;
  const hasSubfolders = folder.tree.subfolders.length > 0;
  const isNeedsPermission =
    folder.permissionStatus === 'prompt' || folder.permissionStatus === 'denied';

  useEffect(() => {
    if (isInside) {
      setIsOpen(true);
    }
  }, [isInside]);

  return (
    <div className="select-none relative" data-testid={`root-folder-${folder.id}`}>
      <div
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectFolder(folder.tree.relativePath);
          }
        }}
        className={`group flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer border transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 focus-visible:border-transparent ${
          isSelected
            ? 'bg-indigo-600/20 bg-[var(--bg-active)] dark:bg-indigo-600/25 text-[var(--accent-primary)] dark:text-white font-medium border-indigo-500/30 border-[var(--accent-primary)]/30 shadow-sm'
            : 'border-transparent text-[var(--text-secondary)] dark:text-slate-300 hover:text-[var(--text-primary)] dark:hover:text-white hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.04]'
        }`}
        onClick={() => onSelectFolder(folder.tree.relativePath)}
      >
        {/* Left icon + name */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {hasSubfolders ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
              aria-label={isOpen ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
              className="p-0.5 rounded hover:bg-slate-300/60 dark:hover:bg-white/[0.1] text-slate-400 hover:text-slate-700 dark:hover:text-white shrink-0 cursor-pointer"
            >
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4.5 shrink-0" />
          )}

          <Folder
            className={`w-3.5 h-3.5 shrink-0 ${
              isNeedsPermission
                ? 'text-amber-500'
                : 'text-indigo-500 dark:text-indigo-400'
            }`}
          />
          <span className="truncate text-xs font-medium" title={folder.name}>
            {folder.name}
          </span>
        </div>

        {/* Right side: status, track count, menu */}
        <div className="flex items-center gap-1 shrink-0 ml-1.5">
          {isNeedsPermission && (
            <span
              title="Permission required to access folder"
              className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium shrink-0"
            >
              Access needed
            </span>
          )}

          {folder.isScanning && (
            <Loader2 className="w-3 h-3 text-indigo-500 animate-spin shrink-0" />
          )}

          {folder.trackCount !== undefined && folder.trackCount > 0 && (
            <span className="text-[10px] text-[var(--text-secondary)] dark:text-slate-400 px-1.5 py-0.2 rounded bg-[var(--border-subtle)]/70 dark:bg-white/[0.04] shrink-0 font-medium">
              {folder.trackCount}
            </span>
          )}

          {/* ... Menu Button */}
          <div className="relative" data-folder-menu>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMenu();
              }}
              aria-label={`Options for ${folder.name}`}
              title="Folder options"
              className={`p-1 rounded hover:bg-slate-300/60 dark:hover:bg-white/[0.1] text-slate-400 hover:text-slate-700 dark:hover:text-white transition-opacity cursor-pointer ${
                isMenuOpen
                  ? 'opacity-100 bg-slate-300/60 dark:bg-white/[0.1]'
                  : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
              }`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {/* Dropdown Menu */}
            {isMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-30 min-w-[170px] bg-white dark:bg-[#0c192c] border border-slate-200 dark:border-white/[0.1] rounded-xl shadow-xl py-1 text-xs select-none animate-scale-up"
                onClick={(e) => e.stopPropagation()}
              >
                {isNeedsPermission ? (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleMenu();
                      onRequestPermission(folder.id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors cursor-pointer"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>Reconnect / Grant Access</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleMenu();
                      onRefreshFolder(folder.id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Refresh Folder</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onToggleMenu();
                    onRemoveFolder(folder);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove from Library</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Subfolder list */}
      {hasSubfolders && isOpen && (
        <div className="space-y-0.5 mt-0.5">
          {folder.tree.subfolders.map((sub) => (
            <SubfolderTreeNode
              key={sub.id}
              node={sub}
              selectedPath={selectedPath}
              onSelect={onSelectFolder}
              depth={1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
