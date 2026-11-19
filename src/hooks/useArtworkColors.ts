import { useState, useEffect } from 'react';
import { extractDominantColor } from '../utils/colorExtractor';

export interface AmbientColors {
  primary: string;
  glow: string;
}

const DEFAULT_AMBIENT_COLORS: AmbientColors = {
  primary: 'rgba(56, 189, 248, 0.15)',
  glow: 'rgba(99, 102, 241, 0.12)',
};

/**
 * Hook to manage ambient glow and background colors based on track artwork.
 */
export function useArtworkColors(artworkUrl?: string): AmbientColors {
  const [ambientColors, setAmbientColors] = useState<AmbientColors>(DEFAULT_AMBIENT_COLORS);

  useEffect(() => {
    if (!artworkUrl) {
      setAmbientColors(DEFAULT_AMBIENT_COLORS);
      return;
    }

    let isMounted = true;
    extractDominantColor(artworkUrl).then((colors) => {
      if (isMounted && colors) {
        setAmbientColors(colors);
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty('--ambient-color', colors.primary);
          document.documentElement.style.setProperty('--ambient-glow', colors.glow);
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [artworkUrl]);

  return ambientColors;
}
