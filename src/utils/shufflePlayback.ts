import { TrackItem, RepeatMode } from '../types/music';
import { isSameTrack } from './trackIdentity';
import { isTrackPlayable } from './audioFileTypes';

export const MAX_SHUFFLE_HISTORY = 1000;

export interface ShufflePlaybackState {
  history: string[];
  historyIndex: number;
  playedIds: Set<string>;
}

function matchesTrackId(track: TrackItem, id: string): boolean {
  return track.id === id || Boolean(track.aliases?.includes(id));
}

function findTrackById(queue: TrackItem[], id: string): TrackItem | null {
  return queue.find((t) => matchesTrackId(t, id)) || null;
}

function isTrackInSet(track: TrackItem, idSet: Set<string>): boolean {
  if (idSet.has(track.id)) return true;
  if (track.aliases) {
    for (const alias of track.aliases) {
      if (idSet.has(alias)) return true;
    }
  }
  return false;
}

/**
 * Creates a clean initial shuffle playback state seeded with the optional current track.
 */
export function createShuffleState(initialTrackId?: string | null): ShufflePlaybackState {
  if (initialTrackId) {
    return {
      history: [initialTrackId],
      historyIndex: 0,
      playedIds: new Set([initialTrackId]),
    };
  }
  return {
    history: [],
    historyIndex: -1,
    playedIds: new Set(),
  };
}

/**
 * Records a played track into the cursor-based listening history and shuffle cycle set.
 * When `truncateForward` is true and the cursor is behind the tip, trims the forward branch.
 */
export function recordShuffleTrack(
  state: ShufflePlaybackState,
  trackId: string,
  truncateForward = true,
  maxHistory = MAX_SHUFFLE_HISTORY
): ShufflePlaybackState {
  const nextPlayed = new Set(state.playedIds);
  nextPlayed.add(trackId);

  let nextHistory =
    truncateForward && state.historyIndex >= 0 && state.historyIndex < state.history.length - 1
      ? state.history.slice(0, state.historyIndex + 1)
      : [...state.history];

  let nextIndex = Math.min(state.historyIndex, nextHistory.length - 1);

  // Avoid pushing consecutive identical entries
  if (nextIndex >= 0 && nextHistory[nextIndex] === trackId) {
    return {
      history: nextHistory,
      historyIndex: nextIndex,
      playedIds: nextPlayed,
    };
  }

  nextHistory.push(trackId);
  nextIndex = nextHistory.length - 1;

  // Enforce Queue-aware / configured upper bound
  const cap = Math.max(1, maxHistory);
  if (nextHistory.length > cap) {
    const excess = nextHistory.length - cap;
    nextHistory = nextHistory.slice(excess);
    nextIndex = Math.max(0, nextIndex - excess);
  }

  return {
    history: nextHistory,
    historyIndex: nextIndex,
    playedIds: nextPlayed,
  };
}

/**
 * Steps backward through actual listening history, skipping entries removed or unplayable.
 * Preserves the forward branch so a subsequent Next returns to the previously visited track.
 */
export function stepBackwardInHistory(
  state: ShufflePlaybackState,
  queue: TrackItem[],
  currentTrack: TrackItem | null
): { track: TrackItem | null; nextState: ShufflePlaybackState } {
  for (let idx = state.historyIndex - 1; idx >= 0; idx--) {
    const candidate = findTrackById(queue, state.history[idx]);
    if (
      candidate &&
      isTrackPlayable(candidate) &&
      (!currentTrack || !isSameTrack(candidate, currentTrack))
    ) {
      return {
        track: candidate,
        nextState: {
          ...state,
          historyIndex: idx,
        },
      };
    }
  }
  return { track: null, nextState: state };
}

/**
 * Steps forward through previously visited listening history if the cursor is behind the tip.
 */
export function stepForwardInHistory(
  state: ShufflePlaybackState,
  queue: TrackItem[],
  currentTrack: TrackItem | null
): { track: TrackItem | null; nextState: ShufflePlaybackState } {
  for (let idx = state.historyIndex + 1; idx < state.history.length; idx++) {
    const candidate = findTrackById(queue, state.history[idx]);
    if (
      candidate &&
      isTrackPlayable(candidate) &&
      (!currentTrack || !isSameTrack(candidate, currentTrack))
    ) {
      return {
        track: candidate,
        nextState: {
          ...state,
          historyIndex: idx,
        },
      };
    }
  }
  return { track: null, nextState: state };
}

/**
 * Selects the next track when Shuffle is ON without mutating the visible Queue order.
 * 1. If forward history exists (user pressed Previous earlier), steps forward to that exact track.
 * 2. Otherwise, picks uniformly at random from unplayed eligible tracks in the current cycle.
 * 3. When the cycle is exhausted:
 *    - repeatMode === 'all': starts a fresh cycle excluding currentTrack to avoid immediate repeat.
 *    - repeatMode !== 'all': returns null so playback stops cleanly.
 */
export function pickNextShuffledTrack(
  state: ShufflePlaybackState,
  queue: TrackItem[],
  currentTrack: TrackItem | null,
  repeatMode: RepeatMode,
  randomFn: () => number = Math.random
): { nextTrack: TrackItem | null; nextState: ShufflePlaybackState } {
  if (queue.length === 0) {
    return { nextTrack: null, nextState: state };
  }

  // Ensure currentTrack is anchored in state if history was empty
  let workingState = state;
  if (currentTrack && workingState.history.length === 0) {
    workingState = createShuffleState(currentTrack.id);
  } else if (currentTrack && !isTrackInSet(currentTrack, workingState.playedIds)) {
    const nextPlayed = new Set(workingState.playedIds);
    nextPlayed.add(currentTrack.id);
    workingState = { ...workingState, playedIds: nextPlayed };
  }

  // 1. Follow forward listening history first (A -> E -> C -> Prev(E) -> Next(C))
  const forward = stepForwardInHistory(workingState, queue, currentTrack);
  if (forward.track) {
    return { nextTrack: forward.track, nextState: forward.nextState };
  }

  // 2. Pick randomly from unplayed eligible tracks in the current cycle
  const eligible = queue.filter(
    (t) =>
      isTrackPlayable(t) &&
      (!currentTrack || !isSameTrack(t, currentTrack)) &&
      !isTrackInSet(t, workingState.playedIds)
  );

  const historyCap = Math.max(MAX_SHUFFLE_HISTORY, queue.length * 2);

  if (eligible.length > 0) {
    const chosen = eligible[Math.floor(randomFn() * eligible.length)];
    const nextState = recordShuffleTrack(workingState, chosen.id, true, historyCap);
    return { nextTrack: chosen, nextState };
  }

  // 3. Cycle exhausted
  if (repeatMode === 'all') {
    const freshPlayed = new Set<string>(currentTrack ? [currentTrack.id] : []);
    const cycleCandidates = queue.filter(
      (t) => isTrackPlayable(t) && (!currentTrack || !isSameTrack(t, currentTrack))
    );

    if (cycleCandidates.length > 0) {
      const chosen = cycleCandidates[Math.floor(randomFn() * cycleCandidates.length)];
      const resetState: ShufflePlaybackState = {
        ...workingState,
        playedIds: freshPlayed,
      };
      const nextState = recordShuffleTrack(resetState, chosen.id, true, historyCap);
      return { nextTrack: chosen, nextState };
    }

    // Single playable track in Queue with repeat all
    const onlyPlayable = queue.find(isTrackPlayable) || null;
    if (onlyPlayable) {
      return { nextTrack: onlyPlayable, nextState: { ...workingState, playedIds: freshPlayed } };
    }
  }

  return { nextTrack: null, nextState: workingState };
}
