import { ListPlus, Plus, FolderPlus, Heart, Trash2 } from 'lucide-react';
import { TrackItem } from '../types/music';
import { isTrackPlayable } from '../utils/audioFileTypes';

export interface TrackActionMenuProps {
  track: TrackItem;
  index: number;
  isFav: boolean;
  isPlaylistView?: boolean;
  isImportedFilesView?: boolean;
  onClose: () => void;
  onPlayNext?: (track: TrackItem) => 'added' | 'moved' | void;
  onAddToQueue?: (track: TrackItem) => boolean | void;
  onOpenPlaylistModal: (track: TrackItem) => void;
  onToggleFavourite: (trackId: string) => void;
  onRemoveFromPlaylist?: (trackId: string, index: number) => void;
  onRemoveImportedFiles?: (trackIds: string[]) => void;
  showToast: (msg: string) => void;
}

export function TrackActionMenu({
  track,
  index,
  isFav,
  isPlaylistView = false,
  isImportedFilesView = false,
  onClose,
  onPlayNext,
  onAddToQueue,
  onOpenPlaylistModal,
  onToggleFavourite,
  onRemoveFromPlaylist,
  onRemoveImportedFiles,
  showToast,
}: TrackActionMenuProps) {
  const playable = isTrackPlayable(track);

  return (
    <div
      className="absolute right-0 top-full mt-1 z-30 min-w-[170px] bg-white dark:bg-[#0c192c] border border-slate-200 dark:border-white/[0.1] rounded-xl shadow-xl py-1 text-xs select-none animate-scale-up"
      onClick={(e) => e.stopPropagation()}
    >
      {playable && onPlayNext && (
        <button
          type="button"
          onClick={() => {
            onClose();
            const res = onPlayNext(track);
            if (res === 'moved') {
              showToast('Moved to play next');
            } else {
              showToast('Added to play next');
            }
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <ListPlus className="w-3.5 h-3.5 text-indigo-500" />
          <span>Play Next</span>
        </button>
      )}

      {playable && onAddToQueue && (
        <button
          type="button"
          onClick={() => {
            onClose();
            const added = onAddToQueue(track);
            if (added === false) {
              showToast('Already in queue');
            } else {
              showToast('Added to queue');
            }
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-emerald-500" />
          <span>Add to Queue</span>
        </button>
      )}

      {playable && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenPlaylistModal(track);
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <FolderPlus className="w-3.5 h-3.5 text-amber-500" />
          <span>Add to Playlist...</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          onClose();
          onToggleFavourite(track.id);
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
      >
        <Heart className={`w-3.5 h-3.5 ${isFav ? 'text-rose-500 fill-rose-500' : 'text-slate-400'}`} />
        <span>{isFav ? 'Remove Favourite' : 'Add to Favourites'}</span>
      </button>

      {isPlaylistView && onRemoveFromPlaylist && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onRemoveFromPlaylist(track.id, index);
            showToast('Removed from playlist');
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Remove from Playlist</span>
        </button>
      )}

      {isImportedFilesView && onRemoveImportedFiles && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onRemoveImportedFiles([track.id]);
            showToast('Removed file from library');
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Remove from Library</span>
        </button>
      )}
    </div>
  );
}
