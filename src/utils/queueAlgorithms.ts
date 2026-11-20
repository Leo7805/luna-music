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

export interface PlayNowResult {
  nextQueue: TrackItem[];
  nextTrack: TrackItem;
  action: 'play' | 'resume' | 'noop';
}

/**
 * Computes the updated queue and action for Play Now (single-clicking a track).
 * Invariants & Contract:
 * - Immediately plays the selected track.
 * - Preserves the existing Queue.
 * - Inserts or moves the selected track to immediately after the previously current track (the new current position).
 * - Leaves history and upcoming tracks in their relative order.
 * - Never creates a duplicate of an existing logical Track.
 * - If clicking currently playing track: no reload, no restart at 0:00, no change to queue.
 * - If clicking current paused track: resumes playback.
 * - If queue is empty: queue becomes [selectedTrack].
 */
export function applyPlayNow(
  queue: TrackItem[],
  currentTrack: TrackItem | null,
  selectedTrack: TrackItem,
  isPlaying: boolean
): PlayNowResult {
  // Scenario D: Click the currently playing / current track
  if (currentTrack && isSameTrack(currentTrack, selectedTrack)) {
    return {
      nextQueue: queue,
      nextTrack: currentTrack,
      action: isPlaying ? 'noop' : 'resume',
    };
  }

  // Scenario E: Empty queue
  if (queue.length === 0) {
    return {
      nextQueue: [selectedTrack],
      nextTrack: selectedTrack,
      action: 'play',
    };
  }

  const curIdx = currentTrack
    ? queue.findIndex((t) => isSameTrack(t, currentTrack))
    : -1;

  if (curIdx >= 0) {
    // Remove any existing occurrence of selectedTrack from the entire queue
    const filtered = queue.filter((t) => !isSameTrack(t, selectedTrack));
    const newCurIdx = filtered.findIndex((t) => isSameTrack(t, currentTrack!));

    // Insert selectedTrack immediately after the previously current track
    const before = filtered.slice(0, newCurIdx + 1);
    const after = filtered.slice(newCurIdx + 1);

    return {
      nextQueue: [...before, selectedTrack, ...after],
      nextTrack: selectedTrack,
      action: 'play',
    };
  } else {
    // Current track is not found in queue: place selectedTrack at the beginning
    const filtered = queue.filter((t) => !isSameTrack(t, selectedTrack));
    return {
      nextQueue: [selectedTrack, ...filtered],
      nextTrack: selectedTrack,
      action: 'play',
    };
  }
}

/**
 * Computes the updated queue and outcome for a Play Next operation.
 * - Inserts trackToInsert immediately after current track.
 * - If trackToInsert is already in upcoming queue or history, moves it rather than duplicating.
 * - If trackToInsert is currently playing, leaves queue unchanged and does not duplicate.
 * - Preserves relative order of unrelated tracks.
 */
export function applyPlayNext(
  queue: TrackItem[],
  currentTrack: TrackItem | null,
  trackToInsert: TrackItem
): { nextQueue: TrackItem[]; outcome: 'added' | 'moved' | 'noop' } {
  // Scenario: Selected track is the currently playing track
  if (currentTrack && isSameTrack(trackToInsert, currentTrack)) {
    return {
      nextQueue: queue,
      outcome: 'noop',
    };
  }

  if (queue.length === 0 && !currentTrack) {
    return {
      nextQueue: [trackToInsert],
      outcome: 'added',
    };
  }

  const curIdx = currentTrack
    ? queue.findIndex((t) => isSameTrack(t, currentTrack))
    : -1;

  if (curIdx >= 0) {
    const wasInQueue = queue.some((t) => isSameTrack(t, trackToInsert));
    const outcome = wasInQueue ? 'moved' : 'added';

    // Remove any existing occurrence of trackToInsert from the entire queue
    const filtered = queue.filter((t) => !isSameTrack(t, trackToInsert));
    const newCurIdx = filtered.findIndex((t) => isSameTrack(t, currentTrack!));

    const before = filtered.slice(0, newCurIdx + 1);
    const after = filtered.slice(newCurIdx + 1);

    return {
      nextQueue: [...before, trackToInsert, ...after],
      outcome,
    };
  } else {
    // Current track is not in queue
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
 * - Deduplicates incoming tracks internally while preserving visible order.
 * - If any selected track already exists in queue (history or upcoming), moves it rather than duplicating.
 * - Excludes the currently playing track from being moved or duplicated.
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

  // Exclude current track from insertion list to prevent duplicate or moving playing track
  const toInsert = currentTrack
    ? uniqueIncoming.filter((t) => !isSameTrack(t, currentTrack))
    : uniqueIncoming;

  if (toInsert.length === 0) {
    return { nextQueue: queue, movedCount: 0, addedCount: 0 };
  }

  if (queue.length === 0 && !currentTrack) {
    return { nextQueue: toInsert, movedCount: 0, addedCount: toInsert.length };
  }

  let movedCount = 0;
  let addedCount = 0;
  for (const inc of toInsert) {
    if (queue.some((q) => isSameTrack(q, inc))) {
      movedCount++;
    } else {
      addedCount++;
    }
  }

  // Filter out all toInsert tracks from existing queue
  const filtered = queue.filter(
    (q) => !toInsert.some((inc) => isSameTrack(inc, q))
  );

  const curIdx = currentTrack
    ? filtered.findIndex((t) => isSameTrack(t, currentTrack))
    : -1;

  if (curIdx >= 0) {
    const before = filtered.slice(0, curIdx + 1);
    const after = filtered.slice(curIdx + 1);
    return {
      nextQueue: [...before, ...toInsert, ...after],
      movedCount,
      addedCount,
    };
  } else {
    return {
      nextQueue: currentTrack
        ? [currentTrack, ...toInsert, ...filtered]
        : [...toInsert, ...filtered],
      movedCount,
      addedCount,
    };
  }
}

/**
 * Computes the updated queue and outcome for an Add to Queue operation.
 * - Appends new logical tracks to the end of the queue.
 * - Skips tracks already present anywhere in the queue (or currently playing).
 * - Never moves existing entries or creates duplicates.
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

  // Deduplicate incoming list internally while preserving visible order
  const uniqueIncoming: TrackItem[] = [];
  for (const t of tracks) {
    if (!uniqueIncoming.some((item) => isSameTrack(item, t))) {
      uniqueIncoming.push(t);
    }
  }

  // Skip tracks already present ANYWHERE in queue or currently playing
  const toAppend: TrackItem[] = [];
  for (const track of uniqueIncoming) {
    const isAlreadyInQueue =
      queue.some((q) => isSameTrack(q, track)) ||
      (currentTrack && isSameTrack(currentTrack, track)) ||
      toAppend.some((t) => isSameTrack(t, track));

    if (!isAlreadyInQueue) {
      toAppend.push(track);
    }
  }

  if (toAppend.length === 0) {
    return { nextQueue: queue, addedCount: 0 };
  }

  let baseQueue = queue;
  if (baseQueue.length === 0 && currentTrack) {
    baseQueue = [currentTrack];
  }

  return {
    nextQueue: [...baseQueue, ...toAppend],
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

/**
 * Determines the previous track to play in queue.
 */
export function getPrevTrackToPlay(
  queue: TrackItem[],
  currentTrack: TrackItem | null,
  repeatMode: RepeatMode
): { targetTrack: TrackItem | null; shouldRestartCurrent: boolean } {
  if (queue.length === 0) {
    return { targetTrack: null, shouldRestartCurrent: false };
  }

  if (!currentTrack) {
    return { targetTrack: queue[0], shouldRestartCurrent: false };
  }

  const currentIndex = queue.findIndex((t) => isSameTrack(t, currentTrack));
  if (currentIndex > 0) {
    return { targetTrack: queue[currentIndex - 1], shouldRestartCurrent: false };
  } else if (repeatMode === 'all') {
    return { targetTrack: queue[queue.length - 1], shouldRestartCurrent: false };
  } else {
    return { targetTrack: null, shouldRestartCurrent: true };
  }
}
