import { parseBlob, selectCover } from 'music-metadata';
import { TrackMetadata } from '../types/music';
import { cleanTrackTitle } from './formatters';

const GRADIENT_PALETTES = [
  'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', // Indigo to Violet
  'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)', // Sky to Blue
  'linear-gradient(135deg, #059669 0%, #0d9488 100%)', // Emerald to Teal
  'linear-gradient(135deg, #e11d48 0%, #be123c 100%)', // Rose to Crimson
  'linear-gradient(135deg, #d97706 0%, #b45309 100%)', // Amber to Bronze
  'linear-gradient(135deg, #9333ea 0%, #db2777 100%)', // Purple to Pink
  'linear-gradient(135deg, #0891b2 0%, #0369a1 100%)', // Cyan to Ocean
  'linear-gradient(135deg, #475569 0%, #1e293b 100%)', // Slate to Dark
];

/**
 * Computes a deterministic integer hash from a string.
 */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Generates a deterministic vibrant gradient based on a track's identity string.
 */
export function getPlaceholderGradient(seed: string): string {
  const hash = hashString(seed || 'Luna Music');
  const index = hash % GRADIENT_PALETTES.length;
  return GRADIENT_PALETTES[index];
}

/**
 * Creates initial fallback metadata from filename and path.
 */
export function createFallbackMetadata(filename: string, relativePath?: string): TrackMetadata {
  const title = cleanTrackTitle(filename);
  const seed = relativePath || filename;

  return {
    title,
    artist: 'Unknown Artist',
    album: 'Unknown Album',
    placeholderGradient: getPlaceholderGradient(seed),
    isMetadataLoaded: false,
  };
}

/**
 * Parses embedded audio metadata and album art from a File/Blob.
 */
export async function extractAudioMetadata(file: Blob, fallbackTitle = ''): Promise<Partial<TrackMetadata>> {
  if (file.size === 0) {
    return {
      title: fallbackTitle,
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      isMetadataLoaded: true,
    };
  }

  try {
    const parsed = await parseBlob(file, {
      duration: true,
      skipPostHeaders: true,
    });

    const common = parsed.common;
    const format = parsed.format;

    let artworkUrl: string | undefined;

    if (common.picture && common.picture.length > 0) {
      const cover = selectCover(common.picture);
      if (cover && cover.data) {
        try {
          const blob = new Blob([cover.data as BlobPart], { type: cover.format || 'image/jpeg' });
          artworkUrl = URL.createObjectURL(blob);
        } catch {
          // Ignore invalid image buffer
        }
      }
    }

    const title = common.title?.trim() || fallbackTitle;
    const artist = common.artist?.trim() || (common.artists && common.artists.length > 0 ? common.artists.join(', ') : undefined);
    const album = common.album?.trim();
    const duration = format.duration;
    const trackNo = common.track?.no ?? undefined;
    const diskNo = common.disk?.no ?? undefined;
    const year = common.year;
    const genre = common.genre && common.genre.length > 0 ? common.genre.join(', ') : undefined;
    const codec = format.codec;
    const bitrate = format.bitrate;

    return {
      title: title || undefined,
      artist: artist || undefined,
      album: album || undefined,
      duration: duration && duration > 0 ? duration : undefined,
      trackNo: trackNo || undefined,
      diskNo: diskNo || undefined,
      year: year || undefined,
      genre: genre || undefined,
      artworkUrl,
      codec,
      bitrate,
      isMetadataLoaded: true,
    };
  } catch {
    // If parsing fails, retain fallback metadata
    return {
      isMetadataLoaded: true,
    };
  }
}
