import { useEffect } from 'react';
import { TrackItem } from '../types/music';
import { isSameTrack } from '../utils/musicTree';
import { storePlaybackState } from '../services/idbStorage';

export interface UsePlaybackPersistenceProps {
  queue: TrackItem[];
  currentTrack: TrackItem | null;
  isPlaying: boolean;
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
}

/**
 * Persists Queue track IDs, current Queue index, and playback position.
 */
export function usePlaybackPersistence({
  queue,
  currentTrack,
  isPlaying,
  audioRef,
}: UsePlaybackPersistenceProps) {
  // Persist queue updates
  useEffect(() => {
    if (queue.length > 0) {
      const qIds = queue.map((t) => t.id);
      const currIdx = currentTrack ? queue.findIndex((t) => isSameTrack(t, currentTrack)) : -1;
      storePlaybackState({
        queueTrackIds: qIds,
        queueIndex: currIdx >= 0 ? currIdx : 0,
      });
    }
  }, [queue, currentTrack]);

  // Persist playback position throttled and on beforeunload
  useEffect(() => {
    if (!currentTrack) return;
    const saveCurrent = () => {
      const audio = audioRef.current;
      if (audio) {
        storePlaybackState({
          lastTrackId: currentTrack.id,
          lastPosition: audio.currentTime,
        });
      }
    };

    const interval = setInterval(() => {
      if (isPlaying) {
        saveCurrent();
      }
    }, 1000);

    const handleBeforeUnload = () => {
      saveCurrent();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentTrack, isPlaying, audioRef]);
}
