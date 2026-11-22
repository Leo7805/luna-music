import { TrackItem } from '../types/music';
import { isSameTrack } from './musicTree';
import { isTrackPlayable } from './audioFileTypes';

interface ResolveQueueOptions {
  initialQueue?: TrackItem[];
  playlist?: TrackItem[];
  storedQueueIds?: string[];
  effectiveInitialTrackId?: string | null;
  libraryTracks?: TrackItem[];
}

/**
 * Resolves the initial playback queue synchronously from props or stored state.
 */
export function resolveInitialQueue({
  initialQueue,
  playlist,
  storedQueueIds,
  effectiveInitialTrackId,
  libraryTracks,
}: ResolveQueueOptions): TrackItem[] {
  if (initialQueue && initialQueue.length > 0) return initialQueue;
  if (playlist && playlist.length > 0) return playlist;

  if (storedQueueIds && storedQueueIds.length > 0 && libraryTracks && libraryTracks.length > 0) {
    const restored: TrackItem[] = [];
    for (const qId of storedQueueIds) {
      const found = libraryTracks.find((t) => t.id === qId || isSameTrack(t, { id: qId } as TrackItem));
      if (found && !restored.some((existing) => isSameTrack(existing, found))) {
        restored.push(found);
      }
    }
    if (restored.length > 0) return restored;
  }

  if (effectiveInitialTrackId && libraryTracks && libraryTracks.length > 0) {
    const match = libraryTracks.find(
      (t) => t.id === effectiveInitialTrackId || isSameTrack(t, { id: effectiveInitialTrackId } as TrackItem)
    );
    if (match) return [match];
  }

  return [];
}

interface ResolveTrackOptions {
  effectiveInitialTrackId?: string | null;
  libraryTracks?: TrackItem[];
  queue: TrackItem[];
}

/**
 * Resolves the initial active track from stored track ID or the active queue.
 */
export function resolveInitialTrack({
  effectiveInitialTrackId,
  libraryTracks,
  queue,
}: ResolveTrackOptions): TrackItem | null {
  if (effectiveInitialTrackId && libraryTracks && libraryTracks.length > 0) {
    const match = libraryTracks.find(
      (t) => t.id === effectiveInitialTrackId || isSameTrack(t, { id: effectiveInitialTrackId } as TrackItem)
    );
    if (match) return match;
  }

  if (queue.length > 0) {
    if (effectiveInitialTrackId) {
      const match = queue.find(
        (t) => t.id === effectiveInitialTrackId || isSameTrack(t, { id: effectiveInitialTrackId } as TrackItem)
      );
      if (match) return match;
    }
    return queue[0];
  }

  return null;
}

/**
 * Returns true only when the current document load is a genuine browser page reload.
 * Safely defaults to false for new navigations, history traversals, or unsupported environments.
 */
export function isPageReloadNavigation(
  perf?: Pick<Performance, 'getEntriesByType'> | null
): boolean {
  try {
    const targetPerf = perf !== undefined ? perf : typeof performance !== 'undefined' ? performance : null;
    if (!targetPerf || typeof targetPerf.getEntriesByType !== 'function') {
      return false;
    }
    const entries = targetPerf.getEntriesByType('navigation');
    if (!Array.isArray(entries) || entries.length === 0) {
      return false;
    }
    const first = entries[0] as PerformanceNavigationTiming | { type?: string } | undefined;
    return first?.type === 'reload';
  } catch {
    return false;
  }
}

export interface AutoResumeDecisionOptions {
  isReload: boolean;
  wasPlaying?: boolean;
  targetTrack: TrackItem | null;
  storedLastTrackId?: string | null;
  hasExplicitSourceRemoval?: boolean;
}

/**
 * Determines whether playback should automatically resume during session restoration.
 * Requires a genuine page reload, prior active playing intent, no explicit source removal,
 * a playable target track, and an exact match when a saved track ID was persisted.
 */
export function shouldAutoResumeOnRestore({
  isReload,
  wasPlaying,
  targetTrack,
  storedLastTrackId,
  hasExplicitSourceRemoval = false,
}: AutoResumeDecisionOptions): boolean {
  if (!isReload || wasPlaying !== true || hasExplicitSourceRemoval) {
    return false;
  }
  if (!targetTrack || !isTrackPlayable(targetTrack)) {
    return false;
  }
  if (storedLastTrackId) {
    const matchesSavedTrack =
      targetTrack.id === storedLastTrackId ||
      isSameTrack(targetTrack, { id: storedLastTrackId } as TrackItem);
    if (!matchesSavedTrack) {
      return false;
    }
  }
  return true;
}

/**
 * Clamps a restored seek position safely within the loaded media duration.
 */
export function clampSeekPosition(position: number, duration: number): number {
  if (!Number.isFinite(position) || position <= 0) return 0;
  if (Number.isFinite(duration) && duration > 0) {
    return Math.min(position, Math.max(0, duration - 0.1));
  }
  return position;
}

export interface PlayRejectionResult {
  ignore: boolean;
  isAutoplayBlocked: boolean;
  message: string | null;
}

/**
 * Classifies an HTMLAudioElement.play() rejection so AbortError is ignored and
 * browser NotAllowedError autoplay blocks are handled gracefully without corrupting track state.
 */
export function classifyPlayRejection(err: unknown, isAutoResume: boolean): PlayRejectionResult {
  const name = err instanceof Error ? err.name : (err as { name?: string })?.name || '';
  const msg = err instanceof Error ? err.message : String(err || 'Playback failed');
  if (name === 'AbortError') {
    return { ignore: true, isAutoplayBlocked: false, message: null };
  }
  if (name === 'NotAllowedError') {
    return {
      ignore: false,
      isAutoplayBlocked: true,
      message: isAutoResume
        ? null
        : 'Playback was blocked by browser autoplay policy. Click Play to start.',
    };
  }
  return { ignore: false, isAutoplayBlocked: false, message: `Playback failed: ${msg}` };
}
