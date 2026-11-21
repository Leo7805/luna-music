import { parseBlob, selectCover } from 'music-metadata';
import { TrackMetadata } from '../types/music';
import { cleanTrackTitle } from './formatters';
import { sanitizeMetadataTitle, sanitizeMetadataField } from './encodingRecovery';

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
      isMetadataLoaded: false,
    };
  }

  try {
    const parsed = await parseBlob(file, {
      duration: true,
      skipPostHeaders: false,
    });

    const common = parsed.common;
    const format = parsed.format;

    let artworkUrl: string | undefined;
    const hasEmbeddedArtwork = Boolean(common.picture && common.picture.length > 0);

    if (hasEmbeddedArtwork && common.picture) {
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

    const title = sanitizeMetadataTitle(common.title, fallbackTitle);
    const rawArtist = common.artist?.trim() || (common.artists && common.artists.length > 0 ? common.artists.join(', ') : undefined);
    const artist = sanitizeMetadataField(rawArtist);
    const album = sanitizeMetadataField(common.album?.trim());
    const duration = format.duration;
    const trackNo = common.track?.no ?? undefined;
    const diskNo = common.disk?.no ?? undefined;
    const year = common.year;
    const genre = common.genre && common.genre.length > 0 ? common.genre.join(', ') : undefined;
    const codec = format.codec;
    const bitrate = format.bitrate;

    const hasValidDuration = typeof duration === 'number' && Number.isFinite(duration) && duration > 0;
    const hasEmbeddedTitle = Boolean(common.title?.trim());
    const parsedAnySignal = Boolean(
      hasEmbeddedTitle || artist || album || hasValidDuration || codec || bitrate || hasEmbeddedArtwork
    );

    const result: Partial<TrackMetadata> = {
      isMetadataLoaded: parsedAnySignal,
      hasEmbeddedArtwork,
    };
    if (title) result.title = title;
    if (artist) result.artist = artist;
    if (album) result.album = album;
    if (hasValidDuration) {
      result.duration = duration;
    }
    if (trackNo) result.trackNo = trackNo;
    if (diskNo) result.diskNo = diskNo;
    if (year) result.year = year;
    if (genre) result.genre = genre;
    if (artworkUrl) result.artworkUrl = artworkUrl;
    if (codec) result.codec = codec;
    if (bitrate) result.bitrate = bitrate;

    return result;
  } catch {
    // Parsing failed (e.g. unreadable/corrupted file or transient I/O error):
    // Do NOT mark as loaded so the track is not permanently cached as fallback-only.
    return {
      isMetadataLoaded: false,
    };
  }
}

/**
 * Extracts only the embedded cover artwork from a File/Blob on demand.
 * Returns a temporary Blob URL if embedded artwork exists, otherwise null.
 */
export async function extractTrackArtwork(file: Blob): Promise<string | null> {
  if (file.size === 0) return null;

  try {
    const parsed = await parseBlob(file, {
      duration: false,
      skipCovers: false,
      skipPostHeaders: false,
    });
    const pictures = parsed.common.picture;
    if (!pictures || pictures.length === 0) return null;

    const cover = selectCover(pictures);
    if (!cover || !cover.data) return null;

    const blob = new Blob([cover.data as BlobPart], { type: cover.format || 'image/jpeg' });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
