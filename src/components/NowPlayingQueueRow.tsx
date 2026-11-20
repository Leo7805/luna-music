import React from 'react';
import {
  Play,
  ListEnd,
  ListPlus,
  Info,
  Trash2,
  MoreHorizontal,
  CheckSquare,
  Square,
} from 'lucide-react';
import { TrackItem } from '../types/music';
import { formatDuration } from '../utils/formatters';

export interface NowPlayingQueueRowProps {
  track: TrackItem;
  originalIndex: number;
  isCurrent: boolean;
  isPlaying: boolean;
  isSelectMode: boolean;
  isSelected: boolean;
  isMenuOpen: boolean;
  rowRef?: React.Ref<HTMLDivElement>;
  onPlayQueueTrack: (track: TrackItem) => void;
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
  isSelectMode,
  isSelected,
  isMenuOpen,
  rowRef,
  onPlayQueueTrack,
  onToggleSelect,
  onToggleMenu,
  onPlayNext,
  onAddToPlaylist,
  onOpenTrackInfo,
  onRemoveFromQueue,
}) => {
  const handleRowClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, [data-queue-row-menu]')) return;
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

  return (
    <div
      ref={rowRef}
      data-testid={`queue-row-${originalIndex}`}
      data-current={isCurrent ? 'true' : undefined}
      tabIndex={0}
      role="button"
      onClick={handleRowClick}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (isSelectMode) {
            if (!isCurrent) onToggleSelect(originalIndex);
          } else {
            onPlayQueueTrack(track);
          }
        }
      }}
      className="group relative grid grid-cols-[48px_minmax(200px,2fr)_minmax(120px,1.2fr)_72px_44px] gap-3 items-center px-4 py-2.5 rounded-xl border border-transparent text-xs transition-colors duration-150 cursor-pointer hover:bg-[var(--bg-hover)]/70 dark:hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50 dark:focus-visible:ring-white/30 focus-visible:border-transparent"
    >
      {/* Col 1: Checkbox (in select mode) OR Equalizer / Original Queue Number */}
      <div className="flex items-center justify-center">
        {isSelectMode ? (
          <button
            type="button"
            disabled={isCurrent}
            onClick={(e) => {
              e.stopPropagation();
              if (!isCurrent) onToggleSelect(originalIndex);
            }}
            aria-label={isCurrent ? 'Currently playing track cannot be bulk removed' : `Select ${track.metadata.title || track.name}`}
            title={isCurrent ? 'Currently playing track is protected' : undefined}
            data-testid={`queue-checkbox-${originalIndex}`}
            className="p-1 rounded text-slate-400 hover:text-[var(--accent-primary)] dark:hover:text-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSelected ? (
              <CheckSquare className="w-4 h-4 text-[var(--accent-primary)] dark:text-indigo-400" />
            ) : (
              <Square className="w-4 h-4" />
            )}
          </button>
        ) : isCurrent ? (
          <span
            data-testid="queue-playing-indicator"
            data-playing={isPlaying ? 'true' : 'false'}
            aria-label={isPlaying ? 'Playing' : 'Paused'}
            className="w-3.5 h-3.5 inline-flex items-end justify-center gap-[2px]"
          >
            <span
              className={`w-[2.5px] rounded-full bg-[var(--accent-primary)] dark:bg-indigo-300 ${
                isPlaying ? 'animate-bar-1' : 'h-[45%]'
              }`}
            />
            <span
              className={`w-[2.5px] rounded-full bg-[var(--accent-primary)] dark:bg-indigo-300 ${
                isPlaying ? 'animate-bar-2' : 'h-[85%]'
              }`}
            />
            <span
              className={`w-[2.5px] rounded-full bg-[var(--accent-primary)] dark:bg-indigo-300 ${
                isPlaying ? 'animate-bar-3' : 'h-[60%]'
              }`}
            />
          </span>
        ) : (
          <span className="text-[11px] tabular-nums text-[var(--text-secondary)] dark:text-slate-500">
            {originalIndex + 1}
          </span>
        )}
      </div>

      {/* Col 2: Artwork + Title + Artist */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-9 h-9 rounded-lg shrink-0 overflow-hidden border border-[var(--border-subtle)] dark:border-white/[0.08] flex items-center justify-center"
          style={{
            background:
              track.metadata.placeholderGradient ||
              'linear-gradient(135deg, #4338ca, #6d28d9)',
          }}
        >
          {track.metadata.artworkUrl ? (
            <img
              src={track.metadata.artworkUrl}
              alt={track.metadata.title || track.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-[9px] font-bold text-white/70 uppercase">
              {(track.metadata.title || track.name).substring(0, 2)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-xs ${
              isCurrent
                ? 'font-semibold text-[var(--accent-primary)] dark:text-white'
                : 'font-medium text-[var(--text-primary)]/90 dark:text-slate-200'
            }`}
            title={track.metadata.title || track.name}
          >
            {track.metadata.title || track.name}
          </p>
          <p
            className={`truncate text-[11px] mt-0.5 ${
              isCurrent
                ? 'text-[var(--text-primary)]/75 dark:text-slate-300'
                : 'text-[var(--text-secondary)] dark:text-slate-400'
            }`}
          >
            {track.metadata.artist || 'Unknown Artist'}
          </p>
        </div>
      </div>

      {/* Col 3: Album */}
      <div className="truncate text-xs text-[var(--text-secondary)] dark:text-slate-400">
        {track.metadata.album || 'Unknown Album'}
      </div>

      {/* Col 4: Duration */}
      <div
        className={`text-right text-[11px] font-mono tabular-nums ${
          isCurrent
            ? 'text-[var(--accent-primary)] dark:text-slate-200 font-medium'
            : 'text-[var(--text-secondary)] dark:text-slate-400'
        }`}
      >
        {formatDuration(track.metadata.duration)}
      </div>

      {/* Col 5: Context Menu (...) */}
      <div className="relative flex justify-end" data-queue-row-menu>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMenu(isMenuOpen ? null : originalIndex);
          }}
          aria-label={`Queue actions for ${track.metadata.title || track.name}`}
          title="Track actions"
          data-testid={`queue-menu-button-${originalIndex}`}
          className={`p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:text-slate-400 dark:hover:text-white hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.08] transition-opacity cursor-pointer ${
            isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
          }`}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {isMenuOpen && (
          <div
            data-testid={`queue-menu-dropdown-${originalIndex}`}
            className="absolute right-0 top-full mt-1 w-48 py-1.5 rounded-xl bg-[var(--bg-panel)] dark:bg-[#0c192c] border border-[var(--border-subtle)] dark:border-white/[0.1] shadow-xl z-40 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                onToggleMenu(null);
                onPlayQueueTrack(track);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[var(--text-primary)] dark:text-slate-200 hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.06] cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 text-[var(--accent-primary)] dark:text-indigo-400" />
              <span>{isCurrent ? (isPlaying ? 'Playing' : 'Resume') : 'Jump to Track'}</span>
            </button>

            {!isCurrent && onPlayNext && (
              <button
                type="button"
                onClick={() => {
                  onToggleMenu(null);
                  onPlayNext(track);
                }}
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

            {!isCurrent && (
              <>
                <div className="my-1 border-t border-[var(--border-subtle)] dark:border-white/[0.06]" />
                <button
                  type="button"
                  onClick={() => {
                    onToggleMenu(null);
                    onRemoveFromQueue(originalIndex);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove from Queue</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
