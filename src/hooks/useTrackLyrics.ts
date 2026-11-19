import { useState, useEffect } from 'react';
import { TrackItem, LrcLine } from '../types/music';
import { parseLrc } from '../utils/lrcParser';

/**
 * Hook to load and parse LRC lyrics for the current track.
 */
export function useTrackLyrics(currentTrack: TrackItem | null): LrcLine[] {
  const [lyrics, setLyrics] = useState<LrcLine[]>([]);

  useEffect(() => {
    let isCancelled = false;
    setLyrics([]);

    async function loadLyrics() {
      if (!currentTrack) return;

      try {
        let text: string | null = null;
        if (currentTrack.lrcContent) {
          text = currentTrack.lrcContent;
        } else if (currentTrack.lrcHandle) {
          const file = await currentTrack.lrcHandle.getFile();
          text = await file.text();
        } else if (currentTrack.lrcFile) {
          text = await currentTrack.lrcFile.text();
        }

        if (text && !isCancelled) {
          const parsed = parseLrc(text);
          setLyrics(parsed);
        }
      } catch {
        if (!isCancelled) setLyrics([]);
      }
    }

    loadLyrics();

    return () => {
      isCancelled = true;
    };
  }, [currentTrack]);

  return lyrics;
}
