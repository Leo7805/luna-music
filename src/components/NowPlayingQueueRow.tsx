import React from 'react';
import {
  Play,
  ListEnd,
  ListPlus,
  Info,
  Trash2,
  CheckSquare,
  Square,
} from 'lucide-react';
import { TrackItem } from '../types/music';
import { TrackRowLayout } from './TrackRowLayout';
import { TrackPlayingIndicator } from './TrackPlayingIndicator';
import { TrackFavouriteButton } from './TrackFavouriteButton';
import { TrackActionMenuTrigger } from './TrackActionMenuTrigger';

export interface NowPlayingQueueRowProps {
  track: TrackItem;
  originalIndex: number;
  isCurrent: boolean;
  isPlaying: boolean;
  isFavourite?: boolean;
  isSelectMode: boolean;
  isSelected: boolean;
  isMenuOpen: boolean;
  rowRef?: React.Ref<HTMLDivElement>;
  onPlayQueueTrack: (track: TrackItem) => void;
  onToggleFavourite?: (trackId: string) => void;
  onToggleSelect: (index: number) => void;
  onToggleMenu: (index: number | null) => void;
  onPlayNext?: (track: TrackItem) => void;
  onAddToPlaylist: (track: TrackItem) => void;
  onOpenTrackInfo: (track: TrackItem) => void;
  onRemoveFromQueue: (index: number) => void;
}

export const NowPlayingQueueRow: React.FC<NowPlayingQueueRowProps> = ({
  track,
  originalIndex,
  isCurrent,
  isPlaying,
  isFavourite = false,
  isSelectMode,
  isSelected,
  isMenuOpen,
  rowRef,
  onPlayQueueTrack,
  onToggleFavourite,
  onToggleSelect,
  onToggleMenu,
  onPlayNext,
  onAddToPlaylist,
  onOpenTrackInfo,
  onRemoveFromQueue,
}) => {
  const handleRowClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, [data-queue-row-menu], input, a')) return;
    if (isSelectMode) {
      if (!isCurrent) onToggleSelect(originalIndex);
      return;
    }
    onPlayQueueTrack(track);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onToggleMenu(isMenuOpen ? null : originalIndex);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (
      target !== e.currentTarget &&
      target.closest('button, [data-queue-row-menu], input, a')
    ) {
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isSelectMode) {
        if (!isCurrent) onToggleSelect(originalIndex);
      } else {
        onPlayQueueTrack(track);
      }
    }
  };

  const leadingSlot = isSelectMode ? (
    <button
      type="button"
      disabled={isCurrent}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (!isCurrent) onToggleSelect(originalIndex);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
        }
      }}
      aria-label={
        isCurrent
          ? 'Currently playing track cannot be bulk removed'
          : `Select ${track.metadata.title || track.name}`
      }
      title={isCurrent ? 'Currently playing track is protected' : undefined}
      data-testid={`queue-checkbox-${originalIndex}`}
      className="p-1 rounded text-slate-400 hover:text-[var(--accent-primary)] dark:hover:text-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50"
    >
      {isSelected ? (
        <CheckSquare className="w-4 h-4 text-[var(--accent-primary)] dark:text-indigo-400" />
      ) : (
        <Square className="w-4 h-4" />
      )}
    </button>
  ) : isCurrent ? (
    <TrackPlayingIndicator
      isPlaying={isPlaying}
      testId="queue-playing-indicator"
    />
  ) : (
    <span className="text-[11px] tabular-nums text-[var(--text-secondary)] dark:text-slate-500">
      {originalIndex + 1}
    </span>
  );

  const actionsSlot = (
    <>
      <TrackFavouriteButton
        isFavourite={isFavourite}
        onToggle={() => onToggleFavourite?.(track.id)}
        testId={`queue-favourite-button-${originalIndex}`}
      />

      <div className="relative flex justify-end" data-queue-row-menu>
        <TrackActionMenuTrigger
          isOpen={isMenuOpen}
          onToggle={() => onToggleMenu(isMenuOpen ? null : originalIndex)}
          ariaLabel={`Queue actions for ${track.metadata.title || track.name}`}
          testId={`queue-menu-button-${originalIndex}`}
        />

        {isMenuOpen && (
          <div
            data-testid={`queue-menu-dropdown-${originalIndex}`}
            className="absolute right-0 top-full mt-1 w-48 py-1.5 rounded-xl bg-[var(--bg-panel)] dark:bg-[#0c192c] border border-[var(--border-subtle)] dark:border-white/[0.1] shadow-xl z-40 text-xs"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {!isCurrent && (
              <button
                type="button"
                onClick={() => {
                  onToggleMenu(null);
                  onPlayQueueTrack(track);
                }}
                data-testid={`queue-play-now-action-${originalIndex}`}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[var(--text-primary)] dark:text-slate-200 hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.06] cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-[var(--accent-primary)] dark:text-indigo-400" />
                <span>Play Now</span>
              </button>
            )}

            {!isCurrent && onPlayNext && (
              <button
                type="button"
                onClick={() => {
                  onToggleMenu(null);
                  onPlayNext(track);
                }}
                data-testid={`queue-play-next-action-${originalIndex}`}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[var(--text-primary)] dark:text-slate-200 hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.06] cursor-pointer"
              >
                <ListEnd className="w-3.5 h-3.5 text-[var(--text-secondary)] dark:text-slate-400" />
                <span>Play Next</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onToggleMenu(null);
                onAddToPlaylist(track);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[var(--text-primary)] dark:text-slate-200 hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.06] cursor-pointer"
            >
              <ListPlus className="w-3.5 h-3.5 text-[var(--text-secondary)] dark:text-slate-400" />
              <span>Add to Playlist</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onToggleMenu(null);
                onOpenTrackInfo(track);
              }}
              data-testid={`queue-track-info-action-${originalIndex}`}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[var(--text-primary)] dark:text-slate-200 hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.06] cursor-pointer"
            >
              <Info className="w-3.5 h-3.5 text-[var(--text-secondary)] dark:text-slate-400" />
              <span>Track Info</span>
            </button>

            <div className="my-1 border-t border-[var(--border-subtle)] dark:border-white/[0.06]" />
            <button
              type="button"
              onClick={() => {
                onToggleMenu(null);
                onRemoveFromQueue(originalIndex);
              }}
              data-testid={`queue-remove-action-${originalIndex}`}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove from Queue</span>
            </button>
          </div>
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
      leadingSlot={leadingSlot}
      actionsSlot={actionsSlot}
      rowRef={rowRef}
      testId={`queue-row-${originalIndex}`}
      tabIndex={0}
      role="button"
      onClick={handleRowClick}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
    />
  );
};
