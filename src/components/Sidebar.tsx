import { useState, useEffect } from 'react';
import {
  Folder,
  Music,
  Heart,
  Disc,
  Mic2,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Key,
  Loader2,
  ListMusic,
  Plus,
  Edit2,
} from 'lucide-react';
import { FolderNode, ImportedFolder, LibraryView, Playlist } from '../types/music';
import { OpenMusicControl } from './OpenMusicControl';
import { ConfirmModal } from './ConfirmModal';
import { PlaylistModal } from './PlaylistModal';

interface SidebarProps {
  currentView: LibraryView;
  selectedFolderPath: string;
  folderTree?: FolderNode | null;
  folders?: ImportedFolder[];
  playlists?: Playlist[];
  selectedPlaylistId?: string | null;
  favouritesCount: number;
  totalTracksCount: number;
  hasLibrary: boolean;
  isScanning?: boolean;
  scanCount?: number;
  onSelectView: (view: LibraryView) => void;
  onSelectFolder: (path: string) => void;
  onSelectPlaylist?: (playlistId: string | null) => void;
  onCreatePlaylist?: (name: string) => void;
  onRenamePlaylist?: (id: string, newName: string) => void;
  onDeletePlaylist?: (id: string) => void;
  onOpenFolder: () => void;
  onRefreshFolder?: (folderId: string) => void;
  onRemoveFolder?: (folderId: string) => void;
  onRequestFolderPermission?: (folderId: string) => void;
  onFallbackFolderSelect: (files: FileList | null) => void;
  onOpenFilesSelect: (files: FileList | null) => void;
}

export function Sidebar({
  currentView,
  selectedFolderPath,
  folderTree,
  folders = [],
  playlists = [],
  selectedPlaylistId,
  favouritesCount,
  totalTracksCount,
  hasLibrary,
  isScanning,
  scanCount,
  onSelectView,
  onSelectFolder,
  onSelectPlaylist,
  onCreatePlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onOpenFolder,
  onRefreshFolder,
  onRemoveFolder,
  onRequestFolderPermission,
  onFallbackFolderSelect,
  onOpenFilesSelect,
}: SidebarProps) {
  const [activeMenuFolderId, setActiveMenuFolderId] = useState<string | null>(null);
  const [folderToRemove, setFolderToRemove] = useState<ImportedFolder | null>(null);

  const [activeMenuPlaylistId, setActiveMenuPlaylistId] = useState<string | null>(null);
  const [playlistModal, setPlaylistModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'rename';
    playlist?: Playlist;
  }>({ isOpen: false, mode: 'create' });
  const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null);

  // Close context menu on outside click or escape
  useEffect(() => {
    if (!activeMenuFolderId && !activeMenuPlaylistId) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-folder-menu]')) {
        setActiveMenuFolderId(null);
      }
      if (!target.closest('[data-playlist-menu]')) {
        setActiveMenuPlaylistId(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenuFolderId(null);
        setActiveMenuPlaylistId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMenuFolderId, activeMenuPlaylistId]);

  const handleConfirmRemove = () => {
    if (folderToRemove && onRemoveFolder) {
      onRemoveFolder(folderToRemove.id);
    }
    setFolderToRemove(null);
  };

  const handleConfirmDeletePlaylist = () => {
    if (playlistToDelete && onDeletePlaylist) {
      onDeletePlaylist(playlistToDelete.id);
    }
    setPlaylistToDelete(null);
  };

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

      {/* Primary Navigation - Requirement 2 Order */}
      <div className="p-3 space-y-1">
        {/* 1. All Tracks */}
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

        {/* 2. Folders */}
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

        {/* 3. Playlists (New Phase 2 Item) */}
        <button
          onClick={() => onSelectView('playlists')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
            currentView === 'playlists'
              ? 'bg-indigo-600/15 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center gap-3">
            <ListMusic className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            <span>Playlists</span>
          </div>
          {playlists.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400">
              {playlists.length}
            </span>
          )}
        </button>

        {/* 4. Albums */}
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

        {/* 5. Artists */}
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

        {/* 6. Favourites */}
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

      {/* Contextual Sidebar Section - Requirement 3 */}
      {currentView === 'folder' ? (
        <div className="flex-1 flex flex-col min-h-0 border-t border-slate-300/80 dark:border-white/[0.08] mt-2">
          {/* Section Header */}
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Music Folders
            </span>
            <button
              type="button"
              onClick={onOpenFolder}
              title="Add Music Folder"
              className="p-1 rounded-lg hover:bg-slate-200/80 dark:hover:bg-white/[0.08] text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>

          {/* Root Folders Tree / List */}
          <div className="flex-1 overflow-y-auto px-2 py-1 custom-scrollbar text-sm space-y-0.5">
            {folders.length > 0 ? (
              folders.map((folder) => (
                <RootFolderItem
                  key={folder.id}
                  folder={folder}
                  selectedPath={selectedFolderPath}
                  isMenuOpen={activeMenuFolderId === folder.id}
                  onToggleMenu={() =>
                    setActiveMenuFolderId((prev) => (prev === folder.id ? null : folder.id))
                  }
                  onSelectFolder={onSelectFolder}
                  onRefreshFolder={(id) => onRefreshFolder?.(id)}
                  onRemoveFolder={(f) => setFolderToRemove(f)}
                  onRequestPermission={(id) => onRequestFolderPermission?.(id)}
                />
              ))
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
      ) : currentView === 'playlists' ? (
        <div className="flex-1 flex flex-col min-h-0 border-t border-slate-300/80 dark:border-white/[0.08] mt-2">
          {/* Section Header */}
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              My Playlists
            </span>
            <button
              type="button"
              onClick={() => setPlaylistModal({ isOpen: true, mode: 'create' })}
              title="Create Playlist"
              aria-label="Create Playlist"
              className="p-1 rounded-lg hover:bg-slate-200/80 dark:hover:bg-white/[0.08] text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Playlist List or Clean Empty State */}
          <div className="flex-1 overflow-y-auto px-2 py-1 custom-scrollbar text-sm space-y-0.5">
            {playlists.length > 0 ? (
              playlists.map((pl) => (
                <div
                  key={pl.id}
                  className="select-none relative"
                  data-testid={`sidebar-playlist-${pl.id}`}
                >
                  <div
                    className={`group flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer transition-all ${
                      selectedPlaylistId === pl.id
                        ? 'bg-indigo-600/20 dark:bg-indigo-600/25 text-indigo-700 dark:text-white font-medium border border-indigo-500/30 shadow-sm'
                        : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
                    }`}
                    onClick={() => {
                      onSelectView('playlists');
                      onSelectPlaylist?.(pl.id);
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <ListMusic className="w-3.5 h-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
                      <span className="truncate text-xs font-medium" title={pl.name}>
                        {pl.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-1.5">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-white/[0.04] shrink-0">
                        {pl.tracks.length}
                      </span>

                      <div className="relative" data-playlist-menu>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuPlaylistId((prev) => (prev === pl.id ? null : pl.id));
                          }}
                          aria-label={`Options for ${pl.name}`}
                          title="Playlist options"
                          className={`p-1 rounded hover:bg-slate-300/60 dark:hover:bg-white/[0.1] text-slate-400 hover:text-slate-700 dark:hover:text-white transition-opacity cursor-pointer ${
                            activeMenuPlaylistId === pl.id
                              ? 'opacity-100 bg-slate-300/60 dark:bg-white/[0.1]'
                              : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                          }`}
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>

                        {activeMenuPlaylistId === pl.id && (
                          <div
                            className="absolute right-0 top-full mt-1 w-36 py-1 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-white/[0.08] z-50 text-xs animate-fade-in"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuPlaylistId(null);
                                setPlaylistModal({ isOpen: true, mode: 'rename', playlist: pl });
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                              <span>Rename</span>
                            </button>
                            <div className="my-1 border-t border-slate-100 dark:border-white/[0.06]" />
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuPlaylistId(null);
                                setPlaylistToDelete(pl);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                <ListMusic className="w-8 h-8 mx-auto mb-2 opacity-40 text-amber-500" />
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">No playlists yet</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 max-w-[180px] leading-relaxed">
                  Create a playlist to organize your favorite tracks
                </p>
                {onCreatePlaylist && (
                  <button
                    type="button"
                    onClick={() => setPlaylistModal({ isOpen: true, mode: 'create' })}
                    className="mt-3 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Playlist</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Requirement 3: All Tracks / Albums / Artists / Favourites: Hide contextual section */
        <div className="flex-1" />
      )}

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

      {/* Folder Removal Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(folderToRemove)}
        title="Remove Folder from Library"
        message={
          folderToRemove
            ? `Are you sure you want to remove "${folderToRemove.name}" from your Luna Music library? Your physical audio files will not be deleted from disk.`
            : ''
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        isDanger={true}
        onConfirm={handleConfirmRemove}
        onCancel={() => setFolderToRemove(null)}
      />

      {/* Playlist Deletion Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(playlistToDelete)}
        title="Delete Playlist"
        message={
          playlistToDelete
            ? `Are you sure you want to delete the playlist "${playlistToDelete.name}"? Audio files will remain in your library.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDanger={true}
        onConfirm={handleConfirmDeletePlaylist}
        onCancel={() => setPlaylistToDelete(null)}
      />

      {/* Playlist Create/Rename Modal */}
      <PlaylistModal
        isOpen={playlistModal.isOpen}
        mode={playlistModal.mode}
        initialName={playlistModal.playlist ? playlistModal.playlist.name : ''}
        onClose={() => setPlaylistModal({ isOpen: false, mode: 'create' })}
        onSubmitName={(name) => {
          if (playlistModal.mode === 'create') {
            onCreatePlaylist?.(name);
          } else if (playlistModal.mode === 'rename' && playlistModal.playlist) {
            onRenamePlaylist?.(playlistModal.playlist.id, name);
          }
        }}
      />
    </aside>
  );
}

// Root Folder Item Component
interface RootFolderItemProps {
  folder: ImportedFolder;
  selectedPath: string;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onSelectFolder: (path: string) => void;
  onRefreshFolder: (folderId: string) => void;
  onRemoveFolder: (folder: ImportedFolder) => void;
  onRequestPermission: (folderId: string) => void;
}

function RootFolderItem({
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
        className={`group flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer transition-all ${
          isSelected
            ? 'bg-indigo-600/20 dark:bg-indigo-600/25 text-indigo-700 dark:text-white font-medium border border-indigo-500/30 shadow-sm'
            : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
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
            <span className="text-[10px] text-slate-500 dark:text-slate-400 px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-white/[0.04] shrink-0">
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
                isMenuOpen ? 'opacity-100 bg-slate-300/60 dark:bg-white/[0.1]' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
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

// Subfolder Node Component (Nested Tree)
interface SubfolderTreeNodeProps {
  node: FolderNode;
  selectedPath: string;
  onSelect: (path: string) => void;
  depth: number;
}

function SubfolderTreeNode({
  node,
  selectedPath,
  onSelect,
  depth,
}: SubfolderTreeNodeProps) {
  const isInside =
    selectedPath === node.relativePath ||
    selectedPath.startsWith(`${node.relativePath}/`);
  const [isOpen, setIsOpen] = useState<boolean>(isInside);
  const isSelected = selectedPath === node.relativePath;
  const hasSubfolders = node.subfolders.length > 0;

  useEffect(() => {
    if (isInside) {
      setIsOpen(true);
    }
  }, [isInside]);

  return (
    <div className="select-none">
      <div
        className={`group flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer transition-all ${
          isSelected
            ? 'bg-indigo-600/20 dark:bg-indigo-600/25 text-indigo-700 dark:text-white font-medium border border-indigo-500/30'
            : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
        }`}
        style={{ paddingLeft: `${depth * 14 + 10}px` }}
        onClick={() => onSelect(node.relativePath)}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {hasSubfolders ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
              aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
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

          <Folder className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-amber-500 dark:group-hover:text-amber-300" />
          <span className="truncate text-xs" title={node.name}>
            {node.name}
          </span>
        </div>

        {node.totalTrackCount > 0 && (
          <span className="text-[10px] text-slate-500 dark:text-slate-400 px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-white/[0.04] shrink-0">
            {node.totalTrackCount}
          </span>
        )}
      </div>

      {hasSubfolders && isOpen && (
        <div className="space-y-0.5 mt-0.5">
          {node.subfolders.map((child) => (
            <SubfolderTreeNode
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

// Fallback Legacy Single-Root Tree Component
interface LegacyFolderTreeNodeProps {
  node: FolderNode;
  selectedPath: string;
  onSelect: (path: string) => void;
  depth: number;
  isRoot?: boolean;
}

function LegacyFolderTreeNode({
  node,
  selectedPath,
  onSelect,
  depth,
  isRoot = false,
}: LegacyFolderTreeNodeProps) {
  const [isOpen, setIsOpen] = useState<boolean>(depth < 2);
  const isSelected = selectedPath === node.relativePath;
  const hasSubfolders = node.subfolders.length > 0;

  if (isRoot && node.id === 'root') {
    return (
      <div className="space-y-0.5">
        {node.subfolders.map((sub) => (
          <LegacyFolderTreeNode
            key={sub.id}
            node={sub}
            selectedPath={selectedPath}
            onSelect={onSelect}
            depth={0}
          />
        ))}
      </div>
    );
  }

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
              type="button"
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
            <LegacyFolderTreeNode
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
