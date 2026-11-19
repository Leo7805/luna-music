import { useState } from 'react';
import {
  Folder,
  Music,
  Heart,
  Disc,
  Mic2,
  ChevronRight,
  ChevronDown,
  FolderOpen,
} from 'lucide-react';
import { FolderNode, LibraryView } from '../types/music';
import { OpenMusicControl } from './OpenMusicControl';

interface SidebarProps {
  currentView: LibraryView;
  selectedFolderPath: string;
  folderTree: FolderNode | null;
  favouritesCount: number;
  totalTracksCount: number;
  hasLibrary: boolean;
  isScanning?: boolean;
  scanCount?: number;
  onSelectView: (view: LibraryView) => void;
  onSelectFolder: (path: string) => void;
  onOpenFolder: () => void;
  onFallbackFolderSelect: (files: FileList | null) => void;
  onOpenFilesSelect: (files: FileList | null) => void;
}

export function Sidebar({
  currentView,
  selectedFolderPath,
  folderTree,
  favouritesCount,
  totalTracksCount,
  hasLibrary,
  isScanning,
  scanCount,
  onSelectView,
  onSelectFolder,
  onOpenFolder,
  onFallbackFolderSelect,
  onOpenFilesSelect,
}: SidebarProps) {
  return (
    <aside className="w-64 md:w-72 shrink-0 flex flex-col h-full bg-slate-100/95 dark:bg-[#071427]/95 backdrop-blur-xl border-r border-slate-300/80 dark:border-white/[0.08] select-none text-slate-800 dark:text-slate-100 transition-colors duration-200">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-300/80 dark:border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center shrink-0">
            <img
              src="/favicon.svg"
              alt="Luna Music"
              className="h-10 w-10 object-contain drop-shadow-sm"
            />
          </div>
          <div>
            <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white">
              Luna Music
            </span>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Local Music Player</p>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="p-3 space-y-1">
        <button
          onClick={() => onSelectView('all')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
            currentView === 'all'
              ? 'bg-indigo-600/15 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center gap-3">
            <Music className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            <span>All Tracks</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400">
            {totalTracksCount}
          </span>
        </button>

        <button
          onClick={() => onSelectView('folder')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
            currentView === 'folder'
              ? 'bg-indigo-600/15 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center gap-3">
            <FolderOpen className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
            <span>Folders</span>
          </div>
        </button>

        <button
          onClick={() => onSelectView('albums')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
            currentView === 'albums'
              ? 'bg-indigo-600/15 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center gap-3">
            <Disc className="w-4 h-4 text-sky-500 dark:text-sky-400" />
            <span>Albums</span>
          </div>
        </button>

        <button
          onClick={() => onSelectView('artists')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
            currentView === 'artists'
              ? 'bg-indigo-600/15 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center gap-3">
            <Mic2 className="w-4 h-4 text-purple-500 dark:text-purple-400" />
            <span>Artists</span>
          </div>
        </button>

        <button
          onClick={() => onSelectView('favourites')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
            currentView === 'favourites'
              ? 'bg-indigo-600/15 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center gap-3">
            <Heart className="w-4 h-4 text-rose-500 dark:text-rose-400 fill-rose-500/20 dark:fill-rose-400/20" />
            <span>Favourites</span>
          </div>
          {favouritesCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-300 font-semibold">
              {favouritesCount}
            </span>
          )}
        </button>
      </div>

      {/* MusicBee-inspired Local Folder Tree */}
      <div className="flex-1 flex flex-col min-h-0 border-t border-slate-300/80 dark:border-white/[0.08] mt-2">
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Folder Browser
          </span>
          {folderTree && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {folderTree.subfolders.length} subfolders
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1 custom-scrollbar text-sm">
          {folderTree ? (
            <FolderTreeNode
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

      {/* Loaded State: Single Compact Open Music Split Button (Hidden during Empty State) */}
      {hasLibrary && (
        <div
          data-testid="sidebar-open-music-container"
          className="p-3 border-t border-slate-300/80 dark:border-white/[0.08] bg-slate-200/50 dark:bg-[#071427]/80"
        >
          <OpenMusicControl
            variant="sidebar"
            isScanning={isScanning}
            scanCount={scanCount}
            onOpenFolder={onOpenFolder}
            onFallbackFolderSelect={onFallbackFolderSelect}
            onOpenFilesSelect={onOpenFilesSelect}
          />
        </div>
      )}
    </aside>
  );
}

interface FolderTreeNodeProps {
  node: FolderNode;
  selectedPath: string;
  onSelect: (path: string) => void;
  depth: number;
  isRoot?: boolean;
}

function FolderTreeNode({
  node,
  selectedPath,
  onSelect,
  depth,
  isRoot = false,
}: FolderTreeNodeProps) {
  const [isOpen, setIsOpen] = useState<boolean>(depth < 2);
  const isSelected = selectedPath === node.relativePath;
  const hasSubfolders = node.subfolders.length > 0;

  return (
    <div className="select-none">
      <div
        className={`group flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer transition-all ${
          isSelected
            ? 'bg-indigo-600/20 dark:bg-indigo-600/25 text-indigo-700 dark:text-white font-medium border border-indigo-500/30'
            : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => onSelect(node.relativePath)}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {hasSubfolders ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
              className="p-0.5 rounded hover:bg-slate-300/60 dark:hover:bg-white/[0.1] text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4.5" />
          )}

          <Folder
            className={`w-3.5 h-3.5 shrink-0 ${
              isRoot ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 group-hover:text-amber-500 dark:group-hover:text-amber-300'
            }`}
          />
          <span className="truncate text-xs">{node.name}</span>
        </div>

        {node.totalTrackCount > 0 && (
          <span className="text-[10px] text-slate-500 dark:text-slate-400 px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-white/[0.04]">
            {node.totalTrackCount}
          </span>
        )}
      </div>

      {hasSubfolders && isOpen && (
        <div className="space-y-0.5">
          {node.subfolders.map((child) => (
            <FolderTreeNode
              key={child.id}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
