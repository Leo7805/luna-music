/**
 * Shared visual-state styling for all track-row lists (All Tracks, Folder Detail,
 * Imported Files, Playlist Detail, Album Detail, Artist Detail, Favourites, and
 * Now Playing / Queue). Implements the unified Option 3 currently-playing highlight
 * with theme-aware CSS tokens defined in src/index.css.
 */

export type TrackRowVisualState = 'current-selected' | 'current' | 'selected' | 'default';

/**
 * Resolves the authoritative visual state for a track row.
 * Priority:
 * 1. current-selected: preserves Option 3 playing highlight + adds selection ring
 * 2. current: elevated Option 3 currently-playing container (stronger than hover)
 * 3. selected: multi-select surface highlight
 * 4. default: transparent surface with subtle neutral hover
 */
export function resolveTrackRowVisualState(params: {
  isCurrent: boolean;
  isSelected?: boolean;
}): TrackRowVisualState {
  if (params.isCurrent && params.isSelected) return 'current-selected';
  if (params.isCurrent) return 'current';
  if (params.isSelected) return 'selected';
  return 'default';
}

export function getTrackRowSurfaceClass(state: TrackRowVisualState): string {
  switch (state) {
    case 'current-selected':
      return 'track-row-current ring-1 ring-[var(--track-current-accent)]/60 dark:ring-indigo-300/60';
    case 'current':
      return 'track-row-current';
    case 'selected':
      return 'track-row-selected';
    case 'default':
    default:
      return 'border-transparent hover:bg-[var(--bg-hover)]/75 dark:hover:bg-white/[0.05]';
  }
}

export function getTrackRowTitleClass(isCurrent: boolean): string {
  return isCurrent
    ? 'font-semibold text-[var(--text-primary)] dark:text-white'
    : 'font-medium text-[var(--text-primary)] dark:text-slate-100 group-hover:text-[var(--text-primary)] dark:group-hover:text-white';
}

export function getTrackRowSubtitleClass(isCurrent: boolean): string {
  return isCurrent
    ? 'text-[var(--text-primary)]/75 dark:text-slate-200'
    : 'text-[var(--text-secondary)] dark:text-slate-400';
}

export function getTrackRowDurationClass(isCurrent: boolean): string {
  return isCurrent
    ? 'text-[var(--text-primary)]/85 dark:text-indigo-200 font-medium'
    : 'text-[var(--text-secondary)] dark:text-slate-400';
}

export const TRACK_PLAYING_BADGE_CLASS =
  'w-7 h-7 rounded-lg inline-flex items-center justify-center track-playing-badge';

export const TRACK_PLAYING_BAR_CLASS =
  'w-[2.5px] rounded-full bg-[var(--track-current-accent)]';
