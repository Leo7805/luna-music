import { useEffect } from 'react';
import { TrackItem } from '../types/music';
import { getTrackDisplayTitle } from '../utils/librarySearch';

const DEFAULT_TITLE = 'Luna Music';
const LONG_TITLE_THRESHOLD = 20;
const INITIAL_DELAY_MS = 1200;
const STEP_MS = 600;

/** Owns the browser title without updating React or playback state. */
export function useDocumentTitle(currentTrack: TrackItem | null, isPlaying: boolean): void {
  const title = currentTrack ? getTrackDisplayTitle(currentTrack).trim() || DEFAULT_TITLE : DEFAULT_TITLE;
  const trackId = currentTrack?.id;

  useEffect(() => {
    const characters = typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(title), part => part.segment)
      : Array.from(title);
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;
    let disposed = false;

    const stop = () => {
      generation++;
      clearTimeout(timer);
      timer = undefined;
    };
    const restart = () => {
      if (disposed) return;
      stop();
      document.title = title;
      if (!trackId || !isPlaying || title === DEFAULT_TITLE || media?.matches ||
          characters.length <= LONG_TITLE_THRESHOLD) return;

      // Non-breaking spaces preserve the gap in document.title's whitespace normalization.
      const cycle = [...characters, '\u00a0', '\u00a0', '\u00a0'];
      const activeGeneration = generation;
      let offset = 0;
      const step = () => {
        if (disposed || generation !== activeGeneration) return;
        offset = (offset + 1) % cycle.length;
        document.title = offset === 0 ? title : [...cycle.slice(offset), ...cycle.slice(0, offset)].join('');
        timer = setTimeout(step, offset === 0 ? INITIAL_DELAY_MS : STEP_MS);
      };
      timer = setTimeout(step, INITIAL_DELAY_MS);
    };

    restart();
    if (typeof media?.addEventListener === 'function') media.addEventListener('change', restart);
    else media?.addListener?.(restart);

    return () => {
      disposed = true;
      stop();
      if (typeof media?.removeEventListener === 'function') media.removeEventListener('change', restart);
      else media?.removeListener?.(restart);
    };
  }, [title, trackId, isPlaying]);
}
