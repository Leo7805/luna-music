import { ListPlus, Plus, FolderPlus, Heart, Trash2, X } from 'lucide-react';

export interface BulkActionToolbarProps {
  selectedCount: number;
  areAllSelectedFavourites: boolean;
  isPlaylistView?: boolean;
  isImportedFilesView?: boolean;
  hasRemoveFromPlaylist?: boolean;
  hasRemoveImportedFiles?: boolean;
  onBulkPlayNext: () => void;
  onBulkAddToQueue: () => void;
  onOpenBulkPlaylistModal: () => void;
  onBulkToggleFavourites: () => void;
  onBulkRemoveFromPlaylist: () => void;
  onBulkRemoveFromImportedFiles: () => void;
  onClearSelection: () => void;
}

export function BulkActionToolbar({
  selectedCount,
  areAllSelectedFavourites,
  isPlaylistView = false,
  isImportedFilesView = false,
  hasRemoveFromPlaylist = false,
  hasRemoveImportedFiles = false,
  onBulkPlayNext,
  onBulkAddToQueue,
  onOpenBulkPlaylistModal,
  onBulkToggleFavourites,
  onBulkRemoveFromPlaylist,
  onBulkRemoveFromImportedFiles,
  onClearSelection,
}: BulkActionToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      data-testid="bulk-action-toolbar"
      className="sticky bottom-6 z-40 mt-4 mx-auto max-w-xl px-4 py-2.5 rounded-2xl bg-slate-900/95 dark:bg-[#0c192c]/95 text-white shadow-2xl backdrop-blur-md border border-slate-700 dark:border-white/10 flex items-center justify-between gap-2 animate-fade-in"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 shrink-0">
          {selectedCount} selected
        </span>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar py-0.5">
        {/* Play Next */}
        <button
          type="button"
          onClick={onBulkPlayNext}
          data-testid="bulk-play-next"
          className="px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          title="Play Next"
        >
          <ListPlus className="w-3.5 h-3.5 text-indigo-400" />
          <span>Play Next</span>
        </button>

        {/* Add to Queue */}
        <button
          type="button"
          onClick={onBulkAddToQueue}
          data-testid="bulk-add-queue"
          className="px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          title="Add to Queue"
        >
          <Plus className="w-3.5 h-3.5 text-emerald-400" />
          <span>Add to Queue</span>
        </button>

        {/* Add to Playlist */}
        <button
          type="button"
          onClick={onOpenBulkPlaylistModal}
          data-testid="bulk-add-playlist"
          className="px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          title="Add to Playlist"
        >
          <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
          <span>Playlist</span>
        </button>

        {/* Favourites */}
        <button
          type="button"
          onClick={onBulkToggleFavourites}
          data-testid="bulk-toggle-favourites"
          className="px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          title={areAllSelectedFavourites ? 'Remove from Favourites' : 'Add to Favourites'}
        >
          <Heart
            className={`w-3.5 h-3.5 ${
              areAllSelectedFavourites ? 'text-rose-400 fill-rose-400' : 'text-rose-400'
            }`}
          />
          <span>{areAllSelectedFavourites ? 'Unfavourite' : 'Favourite'}</span>
        </button>

        {/* Context-Specific Removal: Only playlist view or imported files view */}
        {isPlaylistView && hasRemoveFromPlaylist && (
          <button
            type="button"
            onClick={onBulkRemoveFromPlaylist}
            data-testid="bulk-remove-playlist"
            className="px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            title="Remove from Playlist"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove</span>
          </button>
        )}

        {isImportedFilesView && hasRemoveImportedFiles && (
          <button
            type="button"
            onClick={onBulkRemoveFromImportedFiles}
            data-testid="bulk-remove-imported"
            className="px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            title="Remove from Imported Files"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove</span>
          </button>
        )}

        <div className="w-px h-4 bg-white/20 mx-1 shrink-0" />

        {/* Clear Selection */}
        <button
          type="button"
          onClick={onClearSelection}
          data-testid="bulk-clear-selection"
          className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
          title="Clear selection (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
