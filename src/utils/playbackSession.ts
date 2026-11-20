import { TrackItem } from '../types/music';
import { isSameTrack } from './musicTree';

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
