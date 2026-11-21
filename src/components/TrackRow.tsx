import { useRef } from 'react';
import {
  Play,
  Pause,
  Heart,
  MoreHorizontal,
  ChevronUp,
  ChevronDown,
  CheckSquare,
  Square,
} from 'lucide-react';
import { TrackItem } from '../types/music';
import { formatDuration } from '../utils/formatters';
import { getTrackStatus } from '../utils/audioFileTypes';
import { isFavouriteTrack } from '../utils/favouriteResolvers';
import { TrackStatusBadge } from './TrackStatusBadge';
import { TrackActionMenu } from './TrackActionMenu';
import { TrackThumbnail } from './TrackThumbnail';

export interface TrackRowProps {
  track: TrackItem;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  isSelected: boolean;
  showCheckboxes: boolean;
  favourites: Set<string>;
  libraryTracks?: TrackItem[];
  allTracks: TrackItem[];
  isPlaylistMode: boolean;
  isPlaylistView?: boolean;
  isImportedFilesView?: boolean;
  activeMenuTrackId: string | null;
  onToggleMenu: (trackId: string) => void;
  onRowClick: (e: React.MouseEvent, track: TrackItem, index: number) => void;
  onCheckboxClick: (e: React.MouseEvent, track: TrackItem) => void;
  onPlayTrack: (track: TrackItem) => void;
  onTogglePlay: () => void;
  onToggleFavourite: (trackId: string) => void;
  onPlayNext?: (track: TrackItem) => 'added' | 'moved' | void;
  onAddToQueue?: (track: TrackItem) => boolean | void;
  onOpenPlaylistModal: (track: TrackItem) => void;
  onRemoveFromPlaylist?: (trackId: string, index: number) => void;
  onRemoveImportedFiles?: (trackIds: string[]) => void;
  onMoveTrackUp?: (index: number) => void;
  onMoveTrackDown?: (index: number) => void;
  onTouchStart: (e: React.TouchEvent | any, track?: TrackItem) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  isTouchActionSuppressed?: () => boolean;
  showToast: (msg: string) => void;
}

export function TrackRow({
  track,
  index,
  isCurrent,
  isPlaying,
  isSelected,
  showCheckboxes,
  favourites,
  libraryTracks,
  allTracks,
  isPlaylistMode,
  isPlaylistView = false,
  isImportedFilesView = false,
  activeMenuTrackId,
  onToggleMenu,
  onRowClick,
  onCheckboxClick,
  onPlayTrack,
  onTogglePlay,
  onToggleFavourite,
  onPlayNext,
  onAddToQueue,
  onOpenPlaylistModal,
  onRemoveFromPlaylist,
  onRemoveImportedFiles,
  onMoveTrackUp,
  onMoveTrackDown,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  isTouchActionSuppressed,
  showToast,
}: TrackRowProps) {
  const lastPlayClickRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });
  const isFav = isFavouriteTrack(track, favourites, libraryTracks || allTracks);
  const extension = track.name.split('.').pop()?.toUpperCase() || '';
  const status = getTrackStatus(track);
  const isAbnormal = status !== 'normal';
  const isMenuOpen = activeMenuTrackId === track.id;

  const handleRowClick = (e: React.MouseEvent) => {
    // 1. Interactive child controls: do not trigger row-level playback or selection
    const target = e.target as HTMLElement;
    if (target.closest('button, [data-track-menu], input[type="checkbox"], a')) {
      return;
    }

    // 5. Touch scrolling or longpress suppression
    if (isTouchActionSuppressed && isTouchActionSuppressed()) {
      return;
    }

    // 2. Selection modifier keys (Cmd/Ctrl and Shift)
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      onRowClick(e, track, index);
      return;
    }

    // 3. Active Select mode (or active selection with checkboxes visible)
    if (showCheckboxes) {
      onRowClick(e, track, index);
      return;
    }

    // Clear any previous selection if present
    if (isSelected) {
      onRowClick(e, track, index);
    }

    // 4. Normal song-row click: Single-click playback
    const now = Date.now();
    if (
      lastPlayClickRef.current.id === track.id &&
      now - lastPlayClickRef.current.time < 350
    ) {
      return;
    }
    lastPlayClickRef.current = { id: track.id, time: now };

    if (isCurrent) {
      // If currently playing, preserve playback without audio reload or queue reset
      if (!isPlaying) {
        onTogglePlay();
      }
      return;
    }

    onPlayTrack(track);
  };

  return (
    <div
      onClick={handleRowClick}
      onTouchStart={(e) => onTouchStart(e, track)}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove || onTouchEnd}
      data-testid={`track-row-${track.id}`}
      className={`group grid grid-cols-[48px_minmax(200px,2fr)_minmax(120px,1.5fr)_72px_88px] gap-3 px-4 py-2.5 items-center rounded-xl border transition-colors duration-150 cursor-pointer select-none text-xs relative ${
        isMenuOpen ? 'z-30' : 'z-0'
      } ${
        isSelected
          ? 'bg-indigo-600/20 bg-[var(--bg-active)] dark:bg-indigo-600/25 border-indigo-500/40 border-[var(--accent-primary)]/40 shadow-sm'
          : isCurrent
          ? 'bg-indigo-600/15 bg-[var(--bg-active)]/70 dark:bg-indigo-600/20 border-indigo-500/25 border-[var(--accent-primary)]/25 shadow-sm'
          : 'border-transparent hover:bg-[var(--bg-hover)]/70 dark:hover:bg-white/[0.04]'
      } ${isAbnormal ? 'opacity-85' : ''}`}
    >
      {/* Col 1: Number, Checkbox, Equalizer, or Play Button */}
      <div className="flex items-center justify-center">
        {showCheckboxes ? (
          <button
            type="button"
            onClick={(e) => onCheckboxClick(e, track)}
            className="p-1 rounded text-slate-400 hover:text-[var(--accent-primary)] dark:hover:text-indigo-400 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50"
            data-testid={`track-checkbox-${track.id}`}
          >
            {isSelected ? (
              <CheckSquare className="w-4 h-4 text-[var(--accent-primary)] dark:text-indigo-400" />
            ) : (
              <Square className="w-4 h-4" />
            )}
          </button>
        ) : isCurrent && isPlaying ? (
          <div className="w-4 h-4 flex items-end justify-center gap-[2px]">
            <span className="w-[3px] bg-[var(--accent-primary)] dark:bg-indigo-400 rounded-full animate-bar-1" />
            <span className="w-[3px] bg-[var(--accent-primary)] dark:bg-indigo-400 rounded-full animate-bar-2" />
            <span className="w-[3px] bg-[var(--accent-primary)] dark:bg-indigo-400 rounded-full animate-bar-3" />
          </div>
        ) : (
          <>
            <span
              className={`group-hover:hidden ${
                isCurrent
                  ? 'text-[var(--accent-primary)] dark:text-indigo-400 font-bold'
                  : 'text-[var(--text-secondary)] dark:text-slate-500'
              }`}
            >
              {index + 1}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isCurrent) {
                  onTogglePlay();
                } else {
                  onPlayTrack(track);
                }
              }}
              className="hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white dark:bg-white dark:text-black hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer"
            >
              {isCurrent && isPlaying ? (
                <Pause className="w-3 h-3 fill-current" />
              ) : (
                <Play className="w-3 h-3 fill-current ml-0.5" />
              )}
            </button>
          </>
        )}
      </div>

      {/* Col 2: Thumbnail Artwork + Title + Artist + Badges */}
      <div className="flex items-center gap-3 min-w-0">
        <TrackThumbnail metadata={track.metadata} track={track} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`font-medium truncate ${
                isCurrent
                  ? 'text-[var(--accent-primary)] dark:text-indigo-300 font-semibold'
                  : 'text-[var(--text-primary)] dark:text-slate-100 group-hover:text-[var(--text-primary)] dark:group-hover:text-white'
              }`}
            >
              {track.metadata.title || track.name}
            </span>
            {extension && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--border-subtle)]/70 dark:bg-white/[0.08] text-[var(--text-secondary)] dark:text-slate-400 uppercase tracking-wider font-mono shrink-0">
                {extension}
              </span>
            )}
            <TrackStatusBadge status={status} />
            {track.lrcHandle || track.lrcFile || track.lrcContent ? (
              <span
                className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold shrink-0"
                title="Synchronized LRC Lyrics Available"
              >
                LRC
              </span>
            ) : null}
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] dark:text-slate-400 truncate mt-0.5">
            {track.metadata.artist || 'Unknown Artist'}
          </p>
        </div>
      </div>

      {/* Col 3: Album */}
      <div className="text-[var(--text-secondary)] dark:text-slate-400 truncate text-[11px]">
        {track.metadata.album || 'Unknown Album'}
      </div>

      {/* Col 4: Duration */}
      <div className="text-right text-[11px] font-mono text-[var(--text-secondary)] dark:text-slate-400">
        {formatDuration(track.metadata.duration)}
      </div>

      {/* Col 5: Reorder controls + Heart Favourite + ... Context Menu */}
      <div className="flex items-center justify-end gap-1 shrink-0">
        {isPlaylistMode && onMoveTrackUp && onMoveTrackDown && (
          <div className="hidden group-hover:flex items-center gap-0.5">
            <button
              type="button"
              disabled={index === 0}
              onClick={(e) => {
                e.stopPropagation();
                onMoveTrackUp(index);
              }}
              title="Move up"
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20 cursor-pointer"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              disabled={index === allTracks.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                onMoveTrackDown(index);
              }}
              title="Move down"
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20 cursor-pointer"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavourite(track.id);
          }}
          className={`p-1.5 rounded-full transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
            isFav
              ? 'text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100'
          }`}
          title={isFav ? 'Remove from favourites' : 'Add to favourites'}
        >
          <Heart
            className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 dark:fill-rose-400' : ''}`}
          />
        </button>

        {/* Track Row ... Menu */}
        <div className="relative" data-track-menu>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu(track.id);
            }}
            title="Track actions"
            className={`p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.08] transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50 ${
              isMenuOpen ? 'opacity-100 bg-slate-200/80 dark:bg-white/[0.1]' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
            }`}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>

          {/* Dropdown Menu */}
          {isMenuOpen && (
            <TrackActionMenu
              track={track}
              index={index}
              isFav={isFav}
              isPlaylistView={isPlaylistView}
              isImportedFilesView={isImportedFilesView}
              onClose={() => onToggleMenu(track.id)}
              onPlayNext={onPlayNext}
              onAddToQueue={onAddToQueue}
              onOpenPlaylistModal={onOpenPlaylistModal}
              onToggleFavourite={onToggleFavourite}
              onRemoveFromPlaylist={onRemoveFromPlaylist}
              onRemoveImportedFiles={onRemoveImportedFiles}
              showToast={showToast}
            />
          )}
        </div>
      </div>
    </div>
  );
}
