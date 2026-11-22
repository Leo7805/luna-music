import { useRef } from 'react';
import {
  Play,
  Pause,
  ChevronUp,
  ChevronDown,
  CheckSquare,
  Square,
} from 'lucide-react';
import { TrackItem } from '../types/music';
import { isFavouriteTrack } from '../utils/favouriteResolvers';
import { TrackActionMenu } from './TrackActionMenu';
import { TrackRowLayout } from './TrackRowLayout';
import { TrackPlayingIndicator } from './TrackPlayingIndicator';
import { TrackFavouriteButton } from './TrackFavouriteButton';
import { TrackActionMenuTrigger } from './TrackActionMenuTrigger';

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

  const leadingSlot = showCheckboxes ? (
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
  ) : (
    <>
      {isCurrent ? (
        <TrackPlayingIndicator
          isPlaying={isPlaying}
          testId={`track-playing-indicator-${track.id}`}
          className="group-hover:hidden"
        />
      ) : (
        <span className="group-hover:hidden text-[11px] tabular-nums text-[var(--text-secondary)] dark:text-slate-500">
          {index + 1}
        </span>
      )}
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
        aria-label={isCurrent && isPlaying ? 'Pause' : `Play ${track.metadata.title || track.name}`}
        className="hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white dark:bg-white dark:text-black hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer"
      >
        {isCurrent && isPlaying ? (
          <Pause className="w-3 h-3 fill-current" />
        ) : (
          <Play className="w-3 h-3 fill-current ml-0.5" />
        )}
      </button>
    </>
  );

  const actionsSlot = (
    <>
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

      <TrackFavouriteButton
        isFavourite={isFav}
        onToggle={() => onToggleFavourite(track.id)}
        testId={`track-favourite-${track.id}`}
      />

      {/* Track Row ... Menu */}
      <div className="relative" data-track-menu>
        <TrackActionMenuTrigger
          isOpen={isMenuOpen}
          onToggle={() => onToggleMenu(track.id)}
          ariaLabel={`Track actions for ${track.metadata.title || track.name}`}
          testId={`track-menu-button-${track.id}`}
        />

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
    </>
  );

  return (
    <TrackRowLayout
      track={track}
      isCurrent={isCurrent}
      isSelected={isSelected}
      isMenuOpen={isMenuOpen}
      currentHighlight="tinted"
      leadingSlot={leadingSlot}
      actionsSlot={actionsSlot}
      testId={`track-row-${track.id}`}
      onClick={handleRowClick}
      onTouchStart={(e) => onTouchStart(e, track)}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove || onTouchEnd}
    />
  );
}
