import { useEffect, useRef } from 'react';
import { RepeatMode, TrackItem } from '../types/music';
import { getStoredPlaybackState, storePlaybackState } from '../services/idbStorage';
import { isSameTrack } from '../utils/trackIdentity';
import {
  SourceRemovalEvent,
  reconcileQueueAfterSourceRemoval,
  shouldClearOrphanedQueueOnInit,
} from '../utils/queueSourceRemoval';

export interface UseSourceRemovalSyncProps {
  lastSourceRemoval?: SourceRemovalEvent | null;
  isLibraryInitialized?: boolean;
  hasRegisteredSources?: boolean;
  needsPermission?: boolean;
  storedQueueIds: string[];
  storedLastTrackId: string | null;
  queueRef: React.MutableRefObject<TrackItem[]>;
  currentTrackRef: React.MutableRefObject<TrackItem | null>;
  isPlayingRef: React.MutableRefObject<boolean>;
  repeatModeRef: React.MutableRefObject<RepeatMode>;
  setQueueImmediate: (tracks: TrackItem[]) => void;
  setCurrentTrack: (track: TrackItem | null) => void;
  clearPlayNextOverride: () => void;
  resetShuffleCycle: (track: TrackItem | null) => void;
  stopPlayback: () => void;
  loadAudioSource: (track: TrackItem, autoPlay?: boolean) => Promise<void>;
}

/**
 * Coordinates Queue pruning, orphaned-audio stopping, and empty-Queue persistence
 * on explicit source removal and post-initialization legacy-orphan cleanup.
 */
export function useSourceRemovalSync({
  lastSourceRemoval,
  isLibraryInitialized = false,
  hasRegisteredSources = true,
  needsPermission = false,
  storedQueueIds,
  storedLastTrackId,
  queueRef,
  currentTrackRef,
  isPlayingRef,
  repeatModeRef,
  setQueueImmediate,
  setCurrentTrack,
  clearPlayNextOverride,
  resetShuffleCycle,
  stopPlayback,
  loadAudioSource,
}: UseSourceRemovalSyncProps): void {
  const lastProcessedSeqRef = useRef<number>(0);
  const didRunInitOrphanCheckRef = useRef<boolean>(false);

  // 1. Explicit source removal (folder removal or imported files removal)
  useEffect(() => {
    if (!lastSourceRemoval || lastSourceRemoval.seq <= lastProcessedSeqRef.current) {
      return;
    }
    lastProcessedSeqRef.current = lastSourceRemoval.seq;

    const transition = reconcileQueueAfterSourceRemoval(
      queueRef.current,
      currentTrackRef.current,
      lastSourceRemoval.remainingTracks,
      lastSourceRemoval.idMigrations,
      repeatModeRef.current
    );

    if (transition.queueChanged) {
      setQueueImmediate(transition.nextQueue);
    }

    if (transition.shouldStop) {
      clearPlayNextOverride();
      stopPlayback();
      setCurrentTrack(null);
      resetShuffleCycle(null);
      storePlaybackState({
        queueTrackIds: transition.nextQueue.map((t) => t.id),
        queueIndex: 0,
        lastTrackId: null,
        lastPosition: 0,
      });
      return;
    }

    if (transition.currentTrackRemoved && transition.nextTrack) {
      const wasPlaying = isPlayingRef.current;
      clearPlayNextOverride();
      stopPlayback();
      setCurrentTrack(transition.nextTrack);
      resetShuffleCycle(transition.nextTrack);
      void loadAudioSource(transition.nextTrack, wasPlaying);

      const nextIdx = transition.nextQueue.findIndex((t) =>
        isSameTrack(t, transition.nextTrack!)
      );
      storePlaybackState({
        queueTrackIds: transition.nextQueue.map((t) => t.id),
        queueIndex: nextIdx >= 0 ? nextIdx : 0,
        lastTrackId: transition.nextTrack.id,
        lastPosition: 0,
      });
      return;
    }

    if (transition.currentTrackMigrated && transition.nextTrack) {
      setCurrentTrack(transition.nextTrack);
    }

    if (transition.queueChanged || transition.currentTrackMigrated) {
      const active = transition.nextTrack || currentTrackRef.current;
      const nextIdx = active
        ? transition.nextQueue.findIndex((t) => isSameTrack(t, active))
        : 0;
      storePlaybackState({
        queueTrackIds: transition.nextQueue.map((t) => t.id),
        queueIndex: nextIdx >= 0 ? nextIdx : 0,
        ...(active ? { lastTrackId: active.id } : {}),
      });
    }
  }, [
    lastSourceRemoval,
    queueRef,
    currentTrackRef,
    isPlayingRef,
    repeatModeRef,
    setQueueImmediate,
    setCurrentTrack,
    clearPlayNextOverride,
    resetShuffleCycle,
    stopPlayback,
    loadAudioSource,
  ]);

  // 2. Post-upgrade cleanup for pre-existing orphaned Queues when 0 sources are registered
  useEffect(() => {
    if (!isLibraryInitialized || didRunInitOrphanCheckRef.current) return;
    didRunInitOrphanCheckRef.current = true;
    if (hasRegisteredSources || needsPermission) return;

    const runCleanup = async () => {
      const persisted = await getStoredPlaybackState().catch(() => null);
      const storedIdsCount = Math.max(
        storedQueueIds.length,
        persisted?.queueTrackIds?.length || 0
      );
      const hasStoredTrack = Boolean(storedLastTrackId || persisted?.lastTrackId);

      const shouldClear = shouldClearOrphanedQueueOnInit({
        isLibraryInitialized,
        hasRegisteredSources,
        needsPermission,
        liveQueueLength: queueRef.current.length,
        hasCurrentTrack: currentTrackRef.current !== null,
        storedQueueIdsCount: storedIdsCount,
        hasStoredLastTrackId: hasStoredTrack,
      });

      if (!shouldClear) return;

      clearPlayNextOverride();
      stopPlayback();
      setQueueImmediate([]);
      setCurrentTrack(null);
      resetShuffleCycle(null);
      storePlaybackState({
        queueTrackIds: [],
        queueIndex: 0,
        lastTrackId: null,
        lastPosition: 0,
      });
    };

    void runCleanup();
  }, [
    isLibraryInitialized,
    hasRegisteredSources,
    needsPermission,
    storedQueueIds.length,
    storedLastTrackId,
    queueRef,
    currentTrackRef,
    clearPlayNextOverride,
    stopPlayback,
    setQueueImmediate,
    setCurrentTrack,
    resetShuffleCycle,
  ]);
}
