import { TrackItem, FileStatus } from '../types/music';

export const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  'mp3',
  'm4a',
  'aac',
  'wav',
  'wave',
  'ogg',
  'oga',
  'flac',
  'opus',
  'weba',
]);

export function isSupportedAudioFile(filename: string): boolean {
  const parts = filename.split('.');
  if (parts.length < 2) return false;
  const ext = parts.pop()?.toLowerCase();
  return ext !== undefined && SUPPORTED_AUDIO_EXTENSIONS.has(ext);
}

export function isLrcFile(filename: string): boolean {
  return filename.toLowerCase().endsWith('.lrc');
}

/**
 * Returns the standard MIME type for an audio filename.
 */
export function getMimeTypeForFilename(filename: string): string | null {
  const parts = filename.split('.');
  if (parts.length < 2) return null;
  const ext = parts.pop()?.toLowerCase();
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
    case 'aac':
      return 'audio/aac';
    case 'wav':
    case 'wave':
      return 'audio/wav';
    case 'flac':
      return 'audio/flac';
    case 'ogg':
    case 'oga':
      return 'audio/ogg';
    case 'opus':
      return 'audio/ogg; codecs="opus"';
    case 'weba':
      return 'audio/webm';
    default:
      return null;
  }
}

/**
 * Checks whether the current browser environment can play this audio format/codec.
 * Returns false only when the browser explicitly reports no support (canPlayType returns "").
 */
export function isFormatSupportedByBrowser(filename: string): boolean {
  if (typeof Audio === 'undefined') return true;
  const mime = getMimeTypeForFilename(filename);
  if (!mime) return false;
  try {
    const audio = new Audio();
    const canPlay = audio.canPlayType(mime);
    return canPlay === 'probably' || canPlay === 'maybe';
  } catch {
    return true;
  }
}

/**
 * Determines the effective FileStatus for a track.
 */
export function getTrackStatus(track: TrackItem): FileStatus {
  if (track.status) {
    return track.status;
  }
  return track.size === 0 ? 'empty' : 'normal';
}

/**
 * Checks whether a track is normally playable.
 */
export function isTrackPlayable(track: TrackItem): boolean {
  return getTrackStatus(track) === 'normal';
}

/**
 * Strips audio extension from filename for fallback titles or LRC matching.
 */
export function stripExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0) return filename;
  return filename.substring(0, lastDot);
}
