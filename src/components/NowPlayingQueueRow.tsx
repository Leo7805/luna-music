import React from 'react';
import { CheckSquare, Square } from 'lucide-react';
import { TrackItem } from '../types/music';
import { TrackRowLayout } from './TrackRowLayout';
import { TrackPlayingIndicator } from './TrackPlayingIndicator';
import { TrackFavouriteButton } from './TrackFavouriteButton';
import { TrackActionMenuTrigger } from './TrackActionMenuTrigger';

export interface QueueRowMenuAnchor {
  type: 'cursor' | 'button';
  x: number;
  y: number;
  rect?: { left: number; right: number; top: number; bottom: number };
  triggerElement?: HTMLElement | null;
}

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
  onOpenMenu?: (index: number, anchor: QueueRowMenuAnchor) => void;
  /** @deprecated Prefer onOpenMenu */
  onToggleMenu?: (index: number | null) => void;
  /** @deprecated Handled via shared NowPlayingContextMenu */
  onPlayNext?: (track: TrackItem) => void;
  /** @deprecated Handled via shared NowPlayingContextMenu */
  onAddToPlaylist?: (track: TrackItem) => void;
  /** @deprecated Handled via shared NowPlayingContextMenu */
  onOpenTrackInfo?: (track: TrackItem) => void;
  /** @deprecated Handled via shared NowPlayingContextMenu */
  onRemoveFromQueue?: (index: number) => void;
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
  onOpenMenu,
  onToggleMenu,
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
    e.stopPropagation();
    if (onOpenMenu) {
      onOpenMenu(originalIndex, {
        type: 'cursor',
        x: e.clientX,
        y: e.clientY,
        triggerElement: e.currentTarget as HTMLElement,
      });
    } else {
      onToggleMenu?.(isMenuOpen ? null : originalIndex);
    }
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
          ? 'Currently playing track cannot be bulk selected'
          : `Select ${track.metadata.title || track.name}`
      }
      aria-pressed={isSelected}
      title={isCurrent ? 'Currently playing track is protected' : undefined}
      data-testid={`queue-checkbox-${originalIndex}`}
      className="p-1 rounded text-slate-400 hover:text-[var(--track-selected-accent)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--track-selected-accent)]/60"
    >
      {isSelected ? (
        <CheckSquare className="w-4 h-4 text-[var(--track-selected-accent)]" />
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
          onToggle={(e) => {
            if (onOpenMenu && e?.currentTarget) {
              const rect = e.currentTarget.getBoundingClientRect();
              onOpenMenu(originalIndex, {
                type: 'button',
                x: rect.right,
                y: rect.bottom,
                rect: {
                  left: rect.left,
                  right: rect.right,
                  top: rect.top,
                  bottom: rect.bottom,
                },
                triggerElement: e.currentTarget,
              });
            } else {
              onToggleMenu?.(isMenuOpen ? null : originalIndex);
            }
          }}
          ariaLabel={`Queue actions for ${track.metadata.title || track.name}`}
          testId={`queue-menu-button-${originalIndex}`}
        />
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
