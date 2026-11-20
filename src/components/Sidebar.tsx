import { useState, useEffect } from 'react';
import {
  FolderNode,
  ImportedFolder,
  LibraryView,
  Playlist,
} from '../types/music';
import { OpenMusicControl } from './OpenMusicControl';
import { ConfirmModal } from './ConfirmModal';
import { PlaylistModal } from './PlaylistModal';
import { SidebarNavigation } from './SidebarNavigation';
import { SidebarFolderSection } from './SidebarFolderSection';
import { SidebarPlaylists } from './SidebarPlaylists';

export interface SidebarProps {
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
  onOpenFiles?: () => void;
  onRefreshFolder?: (folderId: string) => void;
  onRemoveFolder?: (folderId: string) => void;
  onRemoveAllImportedFiles?: () => void;
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
  onOpenFiles,
  onRefreshFolder,
  onRemoveFolder,
  onRemoveAllImportedFiles,
  onRequestFolderPermission,
  onFallbackFolderSelect,
  onOpenFilesSelect,
}: SidebarProps) {
  const [activeMenuFolderId, setActiveMenuFolderId] = useState<string | null>(null);
  const [folderToRemove, setFolderToRemove] = useState<ImportedFolder | null>(null);
  const [showClearImportedFilesModal, setShowClearImportedFilesModal] = useState<boolean>(false);

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
    <aside className="w-64 md:w-72 shrink-0 flex flex-col h-full bg-[var(--bg-sidebar)] dark:bg-[#071427]/95 backdrop-blur-xl border-r border-[var(--border-subtle)] dark:border-white/[0.08] select-none text-[var(--text-primary)] dark:text-slate-100 transition-colors duration-200">
      {/* Brand Header */}
      <div className="p-5 border-b border-[var(--border-subtle)] dark:border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center shrink-0">
            <img
              src="/favicon.svg"
              alt="Luna Music"
              className="h-10 w-10 object-contain drop-shadow-sm"
            />
          </div>
          <div>
            <span className="font-bold text-lg tracking-tight text-[var(--text-primary)] dark:text-white">
              Luna Music
            </span>
            <p className="text-xs text-[var(--text-secondary)] dark:text-slate-400 font-medium">Local Music Player</p>
          </div>
        </div>
      </div>

      {/* Primary Navigation */}
      <SidebarNavigation
        currentView={currentView}
        totalTracksCount={totalTracksCount}
        playlistsCount={playlists.length}
        favouritesCount={favouritesCount}
        onSelectView={onSelectView}
        onSelectFolder={onSelectFolder}
      />

      {/* Contextual Sidebar Section */}
      {currentView === 'folder' || currentView === 'imported-files' ? (
        <SidebarFolderSection
          currentView={currentView}
          selectedFolderPath={selectedFolderPath}
          folders={folders}
          folderTree={folderTree}
          activeMenuFolderId={activeMenuFolderId}
          onToggleMenu={(id) =>
            setActiveMenuFolderId((prev) => (prev === id ? null : id))
          }
          onOpenFolder={onOpenFolder}
          onSelectView={onSelectView}
          onSelectFolder={onSelectFolder}
          onRefreshFolder={onRefreshFolder}
          onRemoveFolderPrompt={(folder) => setFolderToRemove(folder)}
          onRequestFolderPermission={onRequestFolderPermission}
          onClearImportedFilesPrompt={() => setShowClearImportedFilesModal(true)}
        />
      ) : currentView === 'playlists' ? (
        <SidebarPlaylists
          playlists={playlists}
          selectedPlaylistId={selectedPlaylistId}
          activeMenuPlaylistId={activeMenuPlaylistId}
          onToggleMenu={(id) =>
            setActiveMenuPlaylistId((prev) => (prev === id ? null : id))
          }
          onSelectPlaylist={onSelectPlaylist}
          onSelectView={onSelectView}
          onCreatePrompt={() => setPlaylistModal({ isOpen: true, mode: 'create' })}
          onRenamePrompt={(pl) =>
            setPlaylistModal({ isOpen: true, mode: 'rename', playlist: pl })
          }
          onDeletePrompt={(pl) => setPlaylistToDelete(pl)}
        />
      ) : (
        <div className="flex-1" />
      )}

      {/* Loaded State: Single Compact Open Music Split Button */}
      {hasLibrary && (
        <div
          data-testid="sidebar-open-music-container"
          className="p-3 border-t border-[var(--border-subtle)] dark:border-white/[0.08] bg-[var(--bg-hover)]/60 dark:bg-[#071427]/80"
        >
          <OpenMusicControl
            variant="sidebar"
            isScanning={isScanning}
            scanCount={scanCount}
            onOpenFolder={onOpenFolder}
            onOpenFiles={onOpenFiles}
            onFallbackFolderSelect={onFallbackFolderSelect}
            onOpenFilesSelect={onOpenFilesSelect}
          />
        </div>
      )}

      {/* Remove All Imported Files Modal */}
      <ConfirmModal
        isOpen={showClearImportedFilesModal}
        title="Remove All Imported Files"
        message="Are you sure you want to remove all imported files from your library? Your physical files on disk will not be deleted."
        confirmLabel="Remove All"
        cancelLabel="Cancel"
        isDanger={true}
        onConfirm={() => {
          setShowClearImportedFilesModal(false);
          onRemoveAllImportedFiles?.();
        }}
        onCancel={() => setShowClearImportedFilesModal(false)}
      />

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
