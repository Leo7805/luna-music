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
  clearQueue: (currentTrack: TrackItem | null) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  getNextTrack: (
    currentTrack: TrackItem | null,
    shuffle: boolean,
    repeatMode: RepeatMode
  ) => TrackItem | null;
  getPrevTrack: (
    currentTrack: TrackItem | null,
    repeatMode: RepeatMode
  ) => { targetTrack: TrackItem | null; shouldRestartCurrent: boolean };
  clearPlayNextOverride: () => void;
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

  const playNextTrackIdRef = useRef<string | null>(null);

  const clearPlayNextOverride = useCallback(() => {
    playNextTrackIdRef.current = null;
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
        playNextTrackIdRef.current = null;
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

      // Override shuffle for the very next track
      playNextTrackIdRef.current = track.id;
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
        playNextTrackIdRef.current = null;
        return { movedCount: 0, addedCount: playable.length };
      }

      const { nextQueue, movedCount, addedCount } = applyBulkPlayNext(
        queueRef.current,
        currentTrack,
        playable
      );

      queueRef.current = nextQueue;
      setQueue(nextQueue);

      if (playable.length > 0) {
        playNextTrackIdRef.current = playable[0].id;
      }

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

  // Clear upcoming items in queue (preserving current track)
  const clearQueue = useCallback((currentTrack: TrackItem | null) => {
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

  // Compute next track using queue algorithms
  const getNextTrack = useCallback(
    (
      currentTrack: TrackItem | null,
      shuffle: boolean,
      repeatMode: RepeatMode
    ): TrackItem | null => {
      const currentList = queueRef.current;
      if (currentList.length === 0) return null;

      const { nextTrack: targetTrack, shouldClearOverride } = getNextTrackToPlay(
        currentList,
        currentTrack,
        shuffle,
        repeatMode,
        playNextTrackIdRef.current
      );

      if (shouldClearOverride) {
        playNextTrackIdRef.current = null;
      }

      return targetTrack;
    },
    []
  );

  // Compute previous track in queue
  const getPrevTrack = useCallback(
    (
      currentTrack: TrackItem | null,
      repeatMode: RepeatMode
    ): { targetTrack: TrackItem | null; shouldRestartCurrent: boolean } => {
      return getPrevTrackToPlay(queueRef.current, currentTrack, repeatMode);
    },
    []
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
    clearQueue,
    reorderQueue,
    getNextTrack,
    getPrevTrack,
    clearPlayNextOverride,
  };
}
