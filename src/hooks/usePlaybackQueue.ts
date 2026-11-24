import { useState, useRef, useCallback } from 'react';
import { TrackItem, RepeatMode } from '../types/music';
import { isTrackPlayable } from '../utils/audioFileTypes';
import {
  isSameTrack,
  applyPlayNow,
  applyPlayNext,
  applyBulkPlayNext,
  applyAddToQueue,
  getNextTrackToPlay,
  getPrevTrackToPlay,
  PlayNowResult,
} from '../utils/musicTree';
import {
  ShufflePlaybackState,
  MAX_SHUFFLE_HISTORY,
  createShuffleState,
  recordShuffleTrack,
  pickNextShuffledTrack,
  stepBackwardInHistory,
  prependPendingPlayNextIds,
  consumeNextPendingPlayNext,
  removeTrackFromPendingPlayNext,
} from '../utils/shufflePlayback';

export interface UsePlaybackQueueProps {
  initialQueue?: TrackItem[];
  playlist?: TrackItem[];
}

export interface UsePlaybackQueueReturn {
  queue: TrackItem[];
  queueRef: React.MutableRefObject<TrackItem[]>;
  setQueue: React.Dispatch<React.SetStateAction<TrackItem[]>>;
  setQueueImmediate: (newQueue: TrackItem[]) => void;
  appendTrackIfMissing: (track: TrackItem) => void;
  playNow: (
    selectedTrack: TrackItem,
    currentTrack: TrackItem | null,
    isPlaying: boolean
  ) => PlayNowResult;
  playNext: (
    track: TrackItem,
    currentTrack: TrackItem | null,
    onFallbackPlayTrack: (track: TrackItem, queue: TrackItem[]) => void
  ) => 'added' | 'moved' | void;
  playNextBulk: (
    tracks: TrackItem[],
    currentTrack: TrackItem | null,
    onFallbackPlayTrack: (track: TrackItem, queue: TrackItem[]) => void
  ) => { movedCount: number; addedCount: number };
  addToQueue: (
    trackOrTracks: TrackItem | TrackItem[],
    currentTrack: TrackItem | null,
    onFallbackPlayTrack: (track: TrackItem, queue: TrackItem[]) => void
  ) => boolean;
  removeFromQueue: (index: number) => void;
  removeTracksFromQueue: (indices: number[], currentTrack: TrackItem | null) => number;
  clearQueue: (currentTrack: TrackItem | null) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  getNextTrack: (
    currentTrack: TrackItem | null,
    shuffle: boolean,
    repeatMode: RepeatMode
  ) => TrackItem | null;
  getPrevTrack: (
    currentTrack: TrackItem | null,
    repeatMode: RepeatMode,
    shuffle?: boolean
  ) => { targetTrack: TrackItem | null; shouldRestartCurrent: boolean };
  clearPlayNextOverride: () => void;
  consumePendingPlayNextTrack: (track: TrackItem) => void;
  recordPlayedTrack: (track: TrackItem | null, truncateForward?: boolean) => void;
  resetShuffleCycle: (currentTrack: TrackItem | null) => void;
}

/**
 * Hook to manage the playback queue and track ordering algorithms.
 */
export function usePlaybackQueue({
  initialQueue,
  playlist,
}: UsePlaybackQueueProps = {}): UsePlaybackQueueReturn {
  const [queue, setQueue] = useState<TrackItem[]>(() => initialQueue || playlist || []);
  const queueRef = useRef<TrackItem[]>(queue);
  queueRef.current = queue;

  const pendingPlayNextIdsRef = useRef<string[]>([]);
  const shuffleStateRef = useRef<ShufflePlaybackState>(createShuffleState());

  const clearPlayNextOverride = useCallback(() => {
    pendingPlayNextIdsRef.current = [];
  }, []);

  const consumePendingPlayNextTrack = useCallback((track: TrackItem) => {
    pendingPlayNextIdsRef.current = removeTrackFromPendingPlayNext(
      pendingPlayNextIdsRef.current,
      track,
      queueRef.current
    );
  }, []);

  const recordPlayedTrack = useCallback(
    (track: TrackItem | null, truncateForward = true) => {
      if (!track) return;
      const cap = Math.max(MAX_SHUFFLE_HISTORY, queueRef.current.length * 2);
      shuffleStateRef.current = recordShuffleTrack(
        shuffleStateRef.current,
        track.id,
        truncateForward,
        cap
      );
    },
    []
  );

  const resetShuffleCycle = useCallback((currentTrack: TrackItem | null) => {
    shuffleStateRef.current = createShuffleState(currentTrack?.id ?? null);
  }, []);

  const setQueueImmediate = useCallback((newQueue: TrackItem[]) => {
    queueRef.current = newQueue;
    setQueue(newQueue);
  }, []);

  const appendTrackIfMissing = useCallback((track: TrackItem) => {
    if (!queueRef.current.some((t) => isSameTrack(t, track))) {
      const nextQ = [...queueRef.current, track];
      queueRef.current = nextQ;
      setQueue(nextQ);
    }
  }, []);

  // Compute Play Now queue mutation and action
  const playNow = useCallback(
    (
      selectedTrack: TrackItem,
      currentTrack: TrackItem | null,
      isPlaying: boolean
    ): PlayNowResult => {
      const result = applyPlayNow(
        queueRef.current,
        currentTrack,
        selectedTrack,
        isPlaying
      );
      if (result.action === 'play') {
        queueRef.current = result.nextQueue;
        setQueue(result.nextQueue);
      }
      return result;
    },
    []
  );

  // Insert track immediately after currentTrack in queue (Play Next)
  const playNext = useCallback(
    (
      track: TrackItem,
      currentTrack: TrackItem | null,
      onFallbackPlayTrack: (track: TrackItem, queue: TrackItem[]) => void
    ): 'added' | 'moved' | void => {
      if (!isTrackPlayable(track)) {
        return undefined;
      }

      if (!currentTrack && queueRef.current.length === 0) {
        onFallbackPlayTrack(track, [track]);
        pendingPlayNextIdsRef.current = [];
        return 'added';
      }

      const { nextQueue, outcome } = applyPlayNext(
        queueRef.current,
        currentTrack,
        track
      );

      if (outcome === 'noop') {
        return undefined;
      }

      queueRef.current = nextQueue;
      setQueue(nextQueue);

      // Prepend explicit Play Next ahead of any earlier pending items (matches visible Queue order)
      pendingPlayNextIdsRef.current = prependPendingPlayNextIds(
        pendingPlayNextIdsRef.current,
        [track],
        currentTrack,
        nextQueue
      );
      return outcome;
    },
    []
  );

  // Insert multiple tracks to play next in visible order
  const playNextBulk = useCallback(
    (
      tracks: TrackItem[],
      currentTrack: TrackItem | null,
      onFallbackPlayTrack: (track: TrackItem, queue: TrackItem[]) => void
    ): { movedCount: number; addedCount: number } => {
      const playable = tracks.filter(isTrackPlayable);
      if (playable.length === 0) return { movedCount: 0, addedCount: 0 };

      if (!currentTrack && queueRef.current.length === 0) {
        onFallbackPlayTrack(playable[0], playable);
        pendingPlayNextIdsRef.current = prependPendingPlayNextIds(
          [],
          playable.slice(1),
          playable[0],
          playable
        );
        return { movedCount: 0, addedCount: playable.length };
      }

      const { nextQueue, movedCount, addedCount } = applyBulkPlayNext(
        queueRef.current,
        currentTrack,
        playable
      );

      queueRef.current = nextQueue;
      setQueue(nextQueue);

      pendingPlayNextIdsRef.current = prependPendingPlayNextIds(
        pendingPlayNextIdsRef.current,
        playable,
        currentTrack,
        nextQueue
      );

      return { movedCount, addedCount };
    },
    []
  );

  // Append track(s) to end of queue (Add to Queue)
  const addToQueue = useCallback(
    (
      trackOrTracks: TrackItem | TrackItem[],
      currentTrack: TrackItem | null,
      onFallbackPlayTrack: (track: TrackItem, queue: TrackItem[]) => void
    ): boolean => {
      const raw = Array.isArray(trackOrTracks) ? trackOrTracks : [trackOrTracks];
      const incoming = raw.filter(isTrackPlayable);
      if (incoming.length === 0) return false;

      if (!currentTrack && queueRef.current.length === 0) {
        onFallbackPlayTrack(incoming[0], incoming);
        return true;
      }

      const { nextQueue, addedCount } = applyAddToQueue(
        queueRef.current,
        currentTrack,
        incoming
      );

      if (addedCount > 0) {
        queueRef.current = nextQueue;
        setQueue(nextQueue);
        return true;
      }

      return false;
    },
    []
  );

  // Remove track at index from queue
  const removeFromQueue = useCallback((index: number) => {
    setQueue((prevQueue) => {
      if (index < 0 || index >= prevQueue.length) return prevQueue;
      const nextQueue = prevQueue.filter((_, idx) => idx !== index);
      queueRef.current = nextQueue;
      return nextQueue;
    });
  }, []);

  // Bulk remove tracks by original Queue indices while strictly protecting the currently playing track
  const removeTracksFromQueue = useCallback(
    (indices: number[], currentTrack: TrackItem | null): number => {
      if (indices.length === 0) return 0;
      const indexSet = new Set(indices);
      const prevQueue = queueRef.current;
      let removedCount = 0;
      const nextQueue = prevQueue.filter((track, idx) => {
        if (!indexSet.has(idx)) return true;
        if (currentTrack && isSameTrack(track, currentTrack)) {
          return true;
        }
        removedCount++;
        return false;
      });
      if (removedCount > 0) {
        queueRef.current = nextQueue;
        setQueue(nextQueue);
      }
      return removedCount;
    },
    []
  );

  // Clear upcoming items in queue (preserving current track)
  const clearQueue = useCallback((currentTrack: TrackItem | null) => {
    pendingPlayNextIdsRef.current = [];
    shuffleStateRef.current = createShuffleState(currentTrack?.id ?? null);
    if (currentTrack) {
      const nextQueue = [currentTrack];
      queueRef.current = nextQueue;
      setQueue(nextQueue);
    } else {
      queueRef.current = [];
      setQueue([]);
    }
  }, []);

  // Reorder queue items
  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    setQueue((prevQueue) => {
      if (
        fromIndex < 0 ||
        fromIndex >= prevQueue.length ||
        toIndex < 0 ||
        toIndex >= prevQueue.length ||
        fromIndex === toIndex
      ) {
        return prevQueue;
      }
      const nextQueue = [...prevQueue];
      const [moved] = nextQueue.splice(fromIndex, 1);
      nextQueue.splice(toIndex, 0, moved);
      queueRef.current = nextQueue;
      return nextQueue;
    });
  }, []);

  // Compute next track using Play Next overrides, Shuffle cycle/history, and Repeat modes
  const getNextTrack = useCallback(
    (
      currentTrack: TrackItem | null,
      shuffle: boolean,
      repeatMode: RepeatMode
    ): TrackItem | null => {
      const currentList = queueRef.current;
      if (currentList.length === 0) return null;

      // 1. Explicit Play Next / Bulk Play Next sequence always takes priority over Shuffle & forward history
      if (pendingPlayNextIdsRef.current.length > 0) {
        const { nextTrack: priorityTrack, remainingIds } = consumeNextPendingPlayNext(
          pendingPlayNextIdsRef.current,
          currentList,
          currentTrack
        );
        pendingPlayNextIdsRef.current = remainingIds;
        if (priorityTrack) {
          recordPlayedTrack(priorityTrack, true);
          return priorityTrack;
        }
      }

      // 2. Shuffle ON: follow forward history or pick random unplayed track without reordering Queue
      if (shuffle) {
        const { nextTrack, nextState } = pickNextShuffledTrack(
          shuffleStateRef.current,
          currentList,
          currentTrack,
          repeatMode
        );
        shuffleStateRef.current = nextState;
        return nextTrack;
      }

      // 3. Shuffle OFF: normal sequential Queue order
      const { nextTrack: seqTrack } = getNextTrackToPlay(
        currentList,
        currentTrack,
        false,
        repeatMode,
        null
      );
      if (seqTrack) {
        recordPlayedTrack(seqTrack, true);
      }
      return seqTrack;
    },
    [recordPlayedTrack]
  );

  // Compute previous track: actual listening history in Shuffle mode, or sequential order when Shuffle OFF
  const getPrevTrack = useCallback(
    (
      currentTrack: TrackItem | null,
      repeatMode: RepeatMode,
      shuffle = false
    ): { targetTrack: TrackItem | null; shouldRestartCurrent: boolean } => {
      if (shuffle) {
        const { track, nextState } = stepBackwardInHistory(
          shuffleStateRef.current,
          queueRef.current,
          currentTrack
        );
        if (track) {
          shuffleStateRef.current = nextState;
          return { targetTrack: track, shouldRestartCurrent: false };
        }
        return { targetTrack: null, shouldRestartCurrent: Boolean(currentTrack) };
      }
      const prevRes = getPrevTrackToPlay(queueRef.current, currentTrack, repeatMode);
      if (prevRes.targetTrack) {
        recordPlayedTrack(prevRes.targetTrack, true);
      }
      return prevRes;
    },
    [recordPlayedTrack]
  );

  return {
    queue,
    queueRef,
    setQueue,
    setQueueImmediate,
    appendTrackIfMissing,
    playNow,
    playNext,
    playNextBulk,
    addToQueue,
    removeFromQueue,
    removeTracksFromQueue,
    clearQueue,
    reorderQueue,
    getNextTrack,
    getPrevTrack,
    clearPlayNextOverride,
    consumePendingPlayNextTrack,
    recordPlayedTrack,
    resetShuffleCycle,
  };
}
