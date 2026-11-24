import { useEffect } from 'react';
import { TrackItem } from '../types/music';
import { getTrackDisplayTitle } from '../utils/librarySearch';

const DEFAULT_TITLE = 'Luna Music';

/** Owns the static browser title independently of playback state. */
export function useDocumentTitle(currentTrack: TrackItem | null): void {
  const title = currentTrack ? getTrackDisplayTitle(currentTrack).trim() || DEFAULT_TITLE : DEFAULT_TITLE;

  useEffect(() => {
    document.title = title;
  }, [title]);
}
