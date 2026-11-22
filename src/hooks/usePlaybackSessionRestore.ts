import { useEffect, MutableRefObject } from 'react';
import { TrackItem } from '../types/music';
import {
  resolveInitialQueue,
  resolveInitialTrack,
  shouldAutoResumeOnRestore,
} from '../utils/playbackSession';
import { LoadAudioSourceOptions } from './useAudioEngine';

export interface UsePlaybackSessionRestoreProps {
  libraryTracks?: TrackItem[];
  queue: TrackItem[];
  storedQueueIds?: string[];
  effectiveInitialTrackId: string | null;
  effectiveInitialPosition: number;
  wasPlaying?: boolean;
  isReload: boolean;
  hasExplicitSourceRemoval: boolean;
  hasHydratedSessionRef: MutableRefObject<boolean>;
  setQueueImmediate: (tracks: TrackItem[]) => void;
  setCurrentTrack: (track: TrackItem | null) => void;
  resetShuffleCycle: (track: TrackItem | null) => void;
  loadAudioSource: (
    track: TrackItem,
    autoPlay?: boolean,
    options?: LoadAudioSourceOptions
  ) => Promise<void>;
}

/**
 * Restores the saved Queue, active track, and playback position once library tracks are available.
 * Automatically resumes playback only on a genuine page reload when the player was actively playing.
 */
export function usePlaybackSessionRestore({
  libraryTracks,
  queue,
  storedQueueIds,
  effectiveInitialTrackId,
  effectiveInitialPosition,
  wasPlaying,
  isReload,
  hasExplicitSourceRemoval,
  hasHydratedSessionRef,
  setQueueImmediate,
  setCurrentTrack,
  resetShuffleCycle,
  loadAudioSource,
}: UsePlaybackSessionRestoreProps) {
  useEffect(() => {
    if (hasHydratedSessionRef.current) return;
    const availableTracks = libraryTracks && libraryTracks.length > 0 ? libraryTracks : queue;
    if (availableTracks.length === 0) return;

    const restoredQueue = resolveInitialQueue({
      storedQueueIds,
      effectiveInitialTrackId,
      libraryTracks: availableTracks,
    });

    if (restoredQueue.length > 0) {
      hasHydratedSessionRef.current = true;
      setQueueImmediate(restoredQueue);

      const targetTrack =
        resolveInitialTrack({
          effectiveInitialTrackId,
          libraryTracks: availableTracks,
          queue: restoredQueue,
        }) || restoredQueue[0];

      if (targetTrack) {
        setCurrentTrack(targetTrack);
        resetShuffleCycle(targetTrack);
        const shouldResume = shouldAutoResumeOnRestore({
          isReload,
          wasPlaying,
          targetTrack,
          storedLastTrackId: effectiveInitialTrackId,
          hasExplicitSourceRemoval,
        });
        loadAudioSource(targetTrack, shouldResume, {
          preservePendingSeek: true,
          initialSeekPosition: effectiveInitialPosition,
          isAutoResume: shouldResume,
        });
      }
    }
  }, [
    libraryTracks,
    queue,
    storedQueueIds,
    effectiveInitialTrackId,
    effectiveInitialPosition,
    wasPlaying,
    isReload,
    hasExplicitSourceRemoval,
    hasHydratedSessionRef,
    setQueueImmediate,
    setCurrentTrack,
    resetShuffleCycle,
    loadAudioSource,
  ]);
}
