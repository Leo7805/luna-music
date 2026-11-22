import { useEffect, useRef } from 'react';
import { TrackItem } from '../types/music';
import { isSameTrack } from '../utils/musicTree';
import { storePlaybackState, storePlaybackStateSync } from '../services/idbStorage';

export interface UsePlaybackPersistenceProps {
  queue: TrackItem[];
  currentTrack: TrackItem | null;
  isPlaying: boolean;
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  allowEmptyPersist?: boolean;
  isHydrated?: boolean;
}

/**
 * Persists Queue track IDs, current Queue index, playback position, and real playing intent.
 * Uses synchronous localStorage capture on beforeunload/pagehide and guards against
 * hydration and teardown races overwriting stored playing intent.
 */
export function usePlaybackPersistence({
  queue,
  currentTrack,
  isPlaying,
  audioRef,
  allowEmptyPersist = false,
  isHydrated = true,
}: UsePlaybackPersistenceProps) {
  const isUnloadingRef = useRef<boolean>(false);
  const hasObservedInitialStateRef = useRef<boolean>(false);
  const isPlayingRef = useRef<boolean>(isPlaying);
  isPlayingRef.current = isPlaying;
  const currentTrackRef = useRef<TrackItem | null>(currentTrack);
  currentTrackRef.current = currentTrack;

  // Persist queue updates (and explicitly clear stored state when emptied after hydration)
  useEffect(() => {
    if (isUnloadingRef.current) return;
    if (queue.length > 0) {
      const qIds = queue.map((t) => t.id);
      const currIdx = currentTrack ? queue.findIndex((t) => isSameTrack(t, currentTrack)) : -1;
      storePlaybackState({
        queueTrackIds: qIds,
        queueIndex: currIdx >= 0 ? currIdx : 0,
      });
    } else if (allowEmptyPersist) {
      storePlaybackState({
        queueTrackIds: [],
        queueIndex: 0,
        lastTrackId: null,
        lastPosition: 0,
        wasPlaying: false,
      });
    }
  }, [queue, currentTrack, allowEmptyPersist]);

  // Persist real play/pause state transitions without letting initial isPlaying=false clobber stored intent
  useEffect(() => {
    if (!isHydrated || isUnloadingRef.current || !currentTrack) return;

    if (!hasObservedInitialStateRef.current) {
      hasObservedInitialStateRef.current = true;
      if (!isPlaying) {
        return;
      }
    }

    const audio = audioRef.current;
    const pos =
      audio && Number.isFinite(audio.currentTime) && audio.currentTime > 0
        ? audio.currentTime
        : undefined;

    storePlaybackState({
      lastTrackId: currentTrack.id,
      ...(pos !== undefined ? { lastPosition: pos } : {}),
      wasPlaying: isPlaying,
    });
  }, [isPlaying, isHydrated, currentTrack, audioRef]);

  // Persist playback position throttled during playback, and capture final state synchronously on unload
  useEffect(() => {
    if (!currentTrack) return;

    const interval = setInterval(() => {
      if (isPlayingRef.current && !isUnloadingRef.current) {
        const audio = audioRef.current;
        const track = currentTrackRef.current;
        if (audio && track) {
          storePlaybackState({
            lastTrackId: track.id,
            lastPosition: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
            wasPlaying: true,
          });
        }
      }
    }, 1000);

    const handleUnload = () => {
      if (isUnloadingRef.current) return;
      isUnloadingRef.current = true;
      const track = currentTrackRef.current;
      if (!track) return;
      const audio = audioRef.current;
      const livePlaying = audio ? !audio.paused && !audio.ended : isPlayingRef.current;
      const pos =
        audio && Number.isFinite(audio.currentTime) && audio.currentTime >= 0
          ? audio.currentTime
          : undefined;
      storePlaybackStateSync({
        lastTrackId: track.id,
        ...(pos !== undefined ? { lastPosition: pos } : {}),
        wasPlaying: livePlaying,
      });
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [currentTrack, audioRef]);
}
