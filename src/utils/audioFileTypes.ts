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
  'webm',
]);

export const SUPPORTED_AUDIO_PICKER_EXTENSIONS = Array.from(
  SUPPORTED_AUDIO_EXTENSIONS,
  (ext) => `.${ext}`
);

export const AUDIO_FILE_INPUT_ACCEPT = `audio/*,${SUPPORTED_AUDIO_PICKER_EXTENSIONS.join(',')},.lrc`;

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
    case 'webm':
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

export interface PlaybackErrorInfo {
  message: string;
  isUnsupported: boolean;
}

/**
 * Evaluates HTMLAudioElement error and translates it into user-friendly message
 * and unsupported format flag.
 */
export function evaluatePlaybackMediaError(
  err: { code: number; message?: string } | null,
  trackName: string
): PlaybackErrorInfo | null {
  if (!err) return null;
  // Code 1: MEDIA_ERR_ABORTED
  if (err.code === 1) {
    return null;
  }
  if (err.message && /empty src/i.test(err.message)) {
    return null;
  }

  let message = 'An error occurred while playing this audio file.';
  let isUnsupported = false;

  switch (err.code) {
    case 2: // MEDIA_ERR_NETWORK
      message = 'A network or file read error occurred.';
      break;
    case 3: // MEDIA_ERR_DECODE
      message = 'Audio decode failed. The audio codec or file may be corrupted.';
      break;
    case 4: { // MEDIA_ERR_SRC_NOT_SUPPORTED
      const isConfirmedUnsupported =
        Boolean(err.message && /unsupported_codec|no decoder|codec not supported/i.test(err.message)) ||
        Boolean(trackName && !isFormatSupportedByBrowser(trackName));

      if (isConfirmedUnsupported) {
        message = 'This audio format or codec may not be supported by your browser.';
        isUnsupported = true;
      } else {
        message = 'Audio decode failed. The audio codec or file may be corrupted.';
      }
      break;
    }
    default:
      message = err.message || 'Unable to play this audio file.';
      break;
  }

  return { message, isUnsupported };
}
