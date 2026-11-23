import React from 'react';
import { TrackItem } from '../types/music';
import { formatDuration } from '../utils/formatters';
import { getTrackStatus } from '../utils/audioFileTypes';
import { getTrackDisplayTitle } from '../utils/librarySearch';
import { TrackStatusBadge } from './TrackStatusBadge';
import { TrackThumbnail } from './TrackThumbnail';

export const TRACK_ROW_GRID_CLASS =
  'grid grid-cols-[48px_minmax(180px,2fr)_minmax(100px,1.5fr)_64px_104px] gap-3 px-4 py-2.5';

export interface TrackRowLayoutProps {
  track: TrackItem;
  isCurrent: boolean;
  isSelected?: boolean;
  isMenuOpen?: boolean;
  currentHighlight?: 'tinted' | 'text-only';
  leadingSlot: React.ReactNode;
  actionsSlot: React.ReactNode;
  rowRef?: React.Ref<HTMLDivElement>;
  testId?: string;
  tabIndex?: number;
  role?: string;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: () => void;
}

export function TrackRowLayout({
  track,
  isCurrent,
  isSelected = false,
  isMenuOpen = false,
  currentHighlight = 'tinted',
  leadingSlot,
  actionsSlot,
  rowRef,
  testId,
  tabIndex,
  role,
  onClick,
  onContextMenu,
  onKeyDown,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: TrackRowLayoutProps) {
  const extension = track.name.split('.').pop()?.toUpperCase() || '';
  const status = getTrackStatus(track);
  const isAbnormal = status !== 'normal';
  const title = getTrackDisplayTitle(track);
  const hasLyrics = Boolean(track.lrcHandle || track.lrcFile || track.lrcContent);

  const rowSurfaceClass =
    currentHighlight === 'tinted' && isSelected
      ? 'bg-indigo-600/20 bg-[var(--bg-active)] dark:bg-indigo-600/25 border-indigo-500/40 border-[var(--accent-primary)]/40 shadow-sm'
      : currentHighlight === 'tinted' && isCurrent
      ? 'bg-indigo-600/15 bg-[var(--bg-active)]/70 dark:bg-indigo-600/20 border-indigo-500/25 border-[var(--accent-primary)]/25 shadow-sm'
      : 'border-transparent hover:bg-[var(--bg-hover)]/70 dark:hover:bg-white/[0.04]';

  return (
    <div
      ref={rowRef}
      data-testid={testId}
      data-current={isCurrent ? 'true' : undefined}
      tabIndex={tabIndex}
      role={role}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={`group ${TRACK_ROW_GRID_CLASS} items-center rounded-xl border transition-colors duration-150 cursor-pointer select-none text-xs relative focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50 dark:focus-visible:ring-white/30 ${
        isMenuOpen ? 'z-30' : 'z-0'
      } ${rowSurfaceClass} ${isAbnormal ? 'opacity-85' : ''}`}
    >
      {/* Col 1: Leading Indicator / Checkbox / Number / Hover Play */}
      <div className="flex items-center justify-center">{leadingSlot}</div>

      {/* Col 2: Thumbnail Artwork + Title + Artist + Badges */}
      <div className="flex items-center gap-3 min-w-0">
        <TrackThumbnail metadata={track.metadata} track={track} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`truncate ${
                isCurrent
                  ? currentHighlight === 'text-only'
                    ? 'font-semibold text-[var(--accent-primary)] dark:text-white'
                    : 'font-semibold text-[var(--accent-primary)] dark:text-indigo-300'
                  : 'font-medium text-[var(--text-primary)] dark:text-slate-100 group-hover:text-[var(--text-primary)] dark:group-hover:text-white'
              }`}
              title={title}
            >
              {title}
            </span>
            {extension && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--border-subtle)]/70 dark:bg-white/[0.08] text-[var(--text-secondary)] dark:text-slate-400 uppercase tracking-wider font-mono shrink-0">
                {extension}
              </span>
            )}
            <TrackStatusBadge status={status} />
            {hasLyrics && (
              <span
                className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold shrink-0"
                title="Synchronized LRC Lyrics Available"
              >
                LRC
              </span>
            )}
          </div>
          <p
            className={`text-[11px] truncate mt-0.5 ${
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
      <div className="text-[var(--text-secondary)] dark:text-slate-400 truncate text-[11px]">
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

      {/* Col 5: Trailing Actions (Reorder / Favourite / Context Menu) */}
      <div className="flex items-center justify-end gap-1 shrink-0">{actionsSlot}</div>
    </div>
  );
}
