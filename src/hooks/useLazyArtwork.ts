import { useEffect, useRef } from 'react';
import { TrackItem } from '../types/music';
import { useArtworkRequester } from '../contexts/ArtworkRequestContext';

/**
 * Observes a DOM container and requests on-demand embedded artwork restoration
 * only when the track needs artwork and the element enters the viewport.
 */
export function useLazyArtwork<T extends HTMLElement = HTMLDivElement>(
  track: TrackItem | null | undefined
): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const requestArtwork = useArtworkRequester();

  const needsArtwork = Boolean(
    track &&
      track.metadata.hasEmbeddedArtwork &&
      !track.metadata.artworkUrl &&
      track.status !== 'unreadable' &&
      track.size > 0
  );

  useEffect(() => {
    if (!needsArtwork || !track) return;
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      requestArtwork(track, 'normal');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            requestArtwork(track, 'normal');
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: '120px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [needsArtwork, track, requestArtwork]);

  return ref;
}
