import { TrackItem, RepeatMode } from '../types/music';
import { isSameTrack } from './trackIdentity';
import { isTrackPlayable } from './audioFileTypes';

/**
 * Reconciles Queue track snapshots with the authoritative canonical libraryTracks
 * so resolved durations, artwork, titles, and lyrics stay in sync without re-reading files.
 * Returns the original array reference if nothing changed.
 */
export function reconcileQueueWithLibrary(
  queue: TrackItem[],
  libraryTracks: TrackItem[]
): TrackItem[] {
  if (queue.length === 0 || libraryTracks.length === 0) return queue;

  const canonicalMap = new Map<string, TrackItem>();
  for (const libTrack of libraryTracks) {
    canonicalMap.set(libTrack.id, libTrack);
    if (libTrack.aliases) {
      for (const alias of libTrack.aliases) {
        if (!canonicalMap.has(alias)) {
          canonicalMap.set(alias, libTrack);
        }
      }
    }
  }

  let changed = false;
  const updated = queue.map((qTrack) => {
    let canonical = canonicalMap.get(qTrack.id);
    if (!canonical && qTrack.aliases) {
      for (const alias of qTrack.aliases) {
        canonical = canonicalMap.get(alias);
        if (canonical) break;
      }
    }
    if (!canonical) return qTrack;

    const qMeta = qTrack.metadata;
    const cMeta = canonical.metadata;

    const durationChanged =
      cMeta.duration !== undefined &&
      cMeta.duration > 0 &&
      qMeta.duration !== cMeta.duration;
    const titleChanged =
      cMeta.isMetadataLoaded && !qMeta.isMetadataLoaded && cMeta.title !== qMeta.title;
    const artistChanged =
      cMeta.isMetadataLoaded && cMeta.artist !== qMeta.artist;
    const albumChanged =
      cMeta.isMetadataLoaded && cMeta.album !== qMeta.album;
    const artworkChanged = Boolean(cMeta.artworkUrl && qMeta.artworkUrl !== cMeta.artworkUrl);
    const statusChanged = canonical.status !== qTrack.status;
    const canonicalHasLyrics = Boolean(
      canonical.lrcHandle || canonical.lrcFile || canonical.lrcContent
    );
    const lyricsChanged =
      canonicalHasLyrics &&
      (canonical.lrcHandle !== qTrack.lrcHandle ||
        canonical.lrcFile !== qTrack.lrcFile ||
        canonical.lrcContent !== qTrack.lrcContent);

    if (
      !durationChanged &&
      !titleChanged &&
      !artistChanged &&
      !albumChanged &&
      !artworkChanged &&
      !statusChanged &&
      !lyricsChanged
    ) {
      return qTrack;
    }

    changed = true;
    return {
      ...qTrack,
      status: canonical.status ?? qTrack.status,
      lrcHandle: canonicalHasLyrics ? canonical.lrcHandle : qTrack.lrcHandle,
      lrcFile: canonicalHasLyrics ? canonical.lrcFile : qTrack.lrcFile,
      lrcContent: canonicalHasLyrics ? canonical.lrcContent : qTrack.lrcContent,
      metadata: {
        ...qMeta,
        ...(cMeta.isMetadataLoaded ? cMeta : {}),
        duration:
          cMeta.duration !== undefined && cMeta.duration > 0
            ? cMeta.duration
            : qMeta.duration,
        artworkUrl: cMeta.artworkUrl || qMeta.artworkUrl,
      },
    };
  });

  return changed ? updated : queue;
}

export interface QueueRemovalTransition {
  nextQueue: TrackItem[];
  wasCurrent: boolean;
  nextTrack: TrackItem | null;
  shouldStop: boolean;
}

/**
 * Computes the next Queue and playback transition when removing a track at `index`.
 * - Non-current removal: keeps current playback uninterrupted.
 * - Current removal: advances to the next playable track in effective Queue order,
 *   wrapping if repeatMode === 'all', or stops cleanly if none remain.
 */
export function computeQueueRemovalTransition(
  queue: TrackItem[],
  index: number,
  currentTrack: TrackItem | null,
  repeatMode: RepeatMode
): QueueRemovalTransition {
  if (index < 0 || index >= queue.length) {
    return { nextQueue: queue, wasCurrent: false, nextTrack: currentTrack, shouldStop: false };
  }

  const removedTrack = queue[index];
  const nextQueue = queue.filter((_, idx) => idx !== index);
  const wasCurrent = Boolean(currentTrack && isSameTrack(removedTrack, currentTrack));

  if (!wasCurrent) {
    return { nextQueue, wasCurrent: false, nextTrack: currentTrack, shouldStop: false };
  }

  if (nextQueue.length === 0) {
    return { nextQueue: [], wasCurrent: true, nextTrack: null, shouldStop: true };
  }

  // Search forward from the removed track's position (next upcoming track in effective order)
  for (let i = index; i < nextQueue.length; i++) {
    if (isTrackPlayable(nextQueue[i])) {
      return { nextQueue, wasCurrent: true, nextTrack: nextQueue[i], shouldStop: false };
    }
  }

  // Wrap around only when repeatMode === 'all'
  if (repeatMode === 'all') {
    for (let i = 0; i < Math.min(index, nextQueue.length); i++) {
      if (isTrackPlayable(nextQueue[i])) {
        return { nextQueue, wasCurrent: true, nextTrack: nextQueue[i], shouldStop: false };
      }
    }
  }

  return { nextQueue, wasCurrent: true, nextTrack: null, shouldStop: true };
}
