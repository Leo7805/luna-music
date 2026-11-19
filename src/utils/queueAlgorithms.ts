import { TrackItem, RepeatMode } from '../types/music';
import { isSameTrack } from './trackIdentity';

/**
 * Checks whether a track is already in the upcoming section of the playback queue
 * (i.e. strictly after the currently playing track).
 */
export function isInUpcomingQueue(
  track: TrackItem,
  queue: TrackItem[],
  currentTrack: TrackItem | null
): boolean {
  if (queue.length === 0) return false;
  const curIdx = currentTrack
    ? queue.findIndex((t) => isSameTrack(t, currentTrack))
    : -1;
  const upcoming = curIdx >= 0 ? queue.slice(curIdx + 1) : queue;
  return upcoming.some((t) => isSameTrack(t, track));
}

/**
 * Computes the updated queue and outcome for a Play Next operation.
 * - If the selected track already exists in the upcoming queue, move the existing occurrence to immediately after current track.
 * - Do not create another occurrence.
 * - If multiple duplicate occurrences already exist in upcoming queue, consolidate into one.
 * - If selected track is currently playing, allow one additional occurrence immediately after current track.
 * - If not in upcoming queue, insert immediately after current track.
 * - Preserves relative order of unrelated tracks.
 */
export function applyPlayNext(
  queue: TrackItem[],
  currentTrack: TrackItem | null,
  trackToInsert: TrackItem
): { nextQueue: TrackItem[]; outcome: 'added' | 'moved' } {
  if (queue.length === 0) {
    return {
      nextQueue: [trackToInsert],
      outcome: 'added',
    };
  }

  const curIdx = currentTrack
    ? queue.findIndex((t) => isSameTrack(t, currentTrack))
    : -1;

  if (curIdx >= 0) {
    const historyAndCurrent = queue.slice(0, curIdx + 1);
    const upcoming = queue.slice(curIdx + 1);
    const wasInUpcoming = upcoming.some((t) => isSameTrack(t, trackToInsert));
    const outcome = wasInUpcoming ? 'moved' : 'added';

    // Remove any occurrences of this track from the upcoming queue
    const filteredUpcoming = upcoming.filter((t) => !isSameTrack(t, trackToInsert));

    return {
      nextQueue: [...historyAndCurrent, trackToInsert, ...filteredUpcoming],
      outcome,
    };
  } else {
    // If current track is not found in queue, the entire queue is upcoming
    const wasInQueue = queue.some((t) => isSameTrack(t, trackToInsert));
    const outcome = wasInQueue ? 'moved' : 'added';
    const filtered = queue.filter((t) => !isSameTrack(t, trackToInsert));

    return {
      nextQueue: currentTrack
        ? [currentTrack, trackToInsert, ...filtered]
        : [trackToInsert, ...filtered],
      outcome,
    };
  }
}

/**
 * Computes updated queue for bulk Play Next operation.
 * - Inserts tracksToInsert immediately after currentTrack in their visible order.
 * - If any selected track already exists in upcoming queue, moves it rather than duplicating.
 * - Preserves visible order of tracksToInsert.
 * - Preserves relative order of unrelated queue entries.
 * - Atomic and non-destructive.
 */
export function applyBulkPlayNext(
  queue: TrackItem[],
  currentTrack: TrackItem | null,
  tracksToInsert: TrackItem[]
): { nextQueue: TrackItem[]; movedCount: number; addedCount: number } {
  if (tracksToInsert.length === 0) {
    return { nextQueue: queue, movedCount: 0, addedCount: 0 };
  }

  // Deduplicate incoming list internally while preserving visible order
  const uniqueIncoming: TrackItem[] = [];
  for (const t of tracksToInsert) {
    if (!uniqueIncoming.some((item) => isSameTrack(item, t))) {
      uniqueIncoming.push(t);
    }
  }

  if (queue.length === 0 && !currentTrack) {
    return { nextQueue: uniqueIncoming, movedCount: 0, addedCount: uniqueIncoming.length };
  }

  const curIdx = currentTrack
    ? queue.findIndex((t) => isSameTrack(t, currentTrack))
    : -1;

  if (curIdx >= 0) {
    const prefix = queue.slice(0, curIdx + 1);
    const upcoming = queue.slice(curIdx + 1);

    let movedCount = 0;
    let addedCount = 0;

    for (const inc of uniqueIncoming) {
      if (upcoming.some((u) => isSameTrack(u, inc))) {
        movedCount++;
      } else {
        addedCount++;
      }
    }

    // Filter upcoming to remove any items that are being inserted/moved
    const filteredUpcoming = upcoming.filter(
      (u) => !uniqueIncoming.some((inc) => isSameTrack(inc, u))
    );

    return {
      nextQueue: [...prefix, ...uniqueIncoming, ...filteredUpcoming],
      movedCount,
      addedCount,
    };
  } else {
    // No current track playing
    let movedCount = 0;
    let addedCount = 0;
    for (const inc of uniqueIncoming) {
      if (queue.some((q) => isSameTrack(q, inc))) {
        movedCount++;
      } else {
        addedCount++;
      }
    }

    const filteredQueue = queue.filter(
      (q) => !uniqueIncoming.some((inc) => isSameTrack(inc, q))
    );

    return {
      nextQueue: currentTrack
        ? [currentTrack, ...uniqueIncoming, ...filteredQueue]
        : [...uniqueIncoming, ...filteredQueue],
      movedCount,
      addedCount,
    };
  }
}

/**
 * Computes the updated queue and outcome for an Add to Queue operation.
 * - If an incoming track is already in the upcoming queue, do not append another occurrence.
 * - If an incoming track is not in the upcoming queue, append it normally.
 * - Does not modify the currently playing track.
 */
export function applyAddToQueue(
  queue: TrackItem[],
  currentTrack: TrackItem | null,
  incoming: TrackItem | TrackItem[]
): { nextQueue: TrackItem[]; addedCount: number } {
  const tracks = Array.isArray(incoming) ? incoming : [incoming];
  if (tracks.length === 0) {
    return { nextQueue: queue, addedCount: 0 };
  }

  if (queue.length === 0 && !currentTrack) {
    return { nextQueue: tracks, addedCount: tracks.length };
  }

  const curIdx = currentTrack
    ? queue.findIndex((t) => isSameTrack(t, currentTrack))
    : -1;

  const upcoming = curIdx >= 0 ? queue.slice(curIdx + 1) : queue;

  const toAppend: TrackItem[] = [];
  for (const track of tracks) {
    const isAlreadyUpcoming =
      upcoming.some((t) => isSameTrack(t, track)) ||
      toAppend.some((t) => isSameTrack(t, track));

    if (!isAlreadyUpcoming) {
      toAppend.push(track);
    }
  }

  if (toAppend.length === 0) {
    return { nextQueue: queue, addedCount: 0 };
  }

  return {
    nextQueue: [...queue, ...toAppend],
    addedCount: toAppend.length,
  };
}

/**
 * Determines the next track to play taking into account Play Next overrides, shuffle, and repeat modes.
 */
export function getNextTrackToPlay(
  queue: TrackItem[],
  currentTrack: TrackItem | null,
  shuffle: boolean,
  repeatMode: RepeatMode,
  playNextTrackId: string | null
): { nextTrack: TrackItem | null; shouldClearOverride: boolean } {
  if (queue.length === 0) return { nextTrack: null, shouldClearOverride: false };
  if (!currentTrack) return { nextTrack: queue[0], shouldClearOverride: false };

  const currentIndex = queue.findIndex((t) => isSameTrack(t, currentTrack));

  // 1. Play Next override takes precedence over shuffle
  if (playNextTrackId) {
    const nextIdx = currentIndex >= 0 ? currentIndex + 1 : 0;
    if (
      nextIdx < queue.length &&
      (queue[nextIdx].id === playNextTrackId ||
        Boolean(queue[nextIdx].aliases?.includes(playNextTrackId)))
    ) {
      return { nextTrack: queue[nextIdx], shouldClearOverride: true };
    }

    const candidateIdx = queue.findIndex(
      (t, idx) =>
        (currentIndex < 0 || idx > currentIndex) &&
        (t.id === playNextTrackId || Boolean(t.aliases?.includes(playNextTrackId)))
    );
    if (candidateIdx >= 0) {
      return { nextTrack: queue[candidateIdx], shouldClearOverride: true };
    }
  }

  // 2. Shuffle mode (when no Play Next override)
  if (shuffle) {
    const otherIndices = queue
      .map((_, i) => i)
      .filter((i) => !isSameTrack(queue[i], currentTrack));
    const nextIndex =
      otherIndices.length > 0
        ? otherIndices[Math.floor(Math.random() * otherIndices.length)]
        : 0;
    return { nextTrack: queue[nextIndex], shouldClearOverride: false };
  }

  // 3. Normal queue progression
  if (currentIndex === -1 || currentIndex === queue.length - 1) {
    if (repeatMode === 'all') {
      return { nextTrack: queue[0], shouldClearOverride: false };
    }
    return { nextTrack: null, shouldClearOverride: false };
  }

  return { nextTrack: queue[currentIndex + 1], shouldClearOverride: false };
}
