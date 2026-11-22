import { TrackItem, FileStatus } from '../types/music';
import { extractAudioMetadata } from './metadata';

export interface ResolveAudioFileCallbacks {
  onTrackStatusChanged?: (
    trackId: string,
    status: FileStatus,
    size?: number,
    metadata?: Partial<TrackItem['metadata']>
  ) => void;
  onTrackUpdated?: (track: TrackItem) => void;
}

export interface ResolveAudioFileResult {
  file: File | Blob | null;
  aborted: boolean;
  errorMessage?: string;
}

/**
 * Resolves a playable File/Blob from a TrackItem, validating readability/non-emptiness
 * and refreshing metadata if the file was previously abnormal or modified on disk.
 */
export async function resolvePlayableAudioFile(
  track: TrackItem,
  isCurrentRequest: () => boolean,
  callbacks: ResolveAudioFileCallbacks
): Promise<ResolveAudioFileResult> {
  if (track.status === 'unreadable') {
    return {
      file: null,
      aborted: false,
      errorMessage:
        'Cannot access this audio file. Please check file permissions or reopen the music folder.',
    };
  }

  let file: File | Blob | null = null;
  if (track.handle) {
    try {
      file = await track.handle.getFile();
    } catch {
      if (!isCurrentRequest()) return { file: null, aborted: true };
      track.status = 'unreadable';
      callbacks.onTrackStatusChanged?.(track.id, 'unreadable');
      return {
        file: null,
        aborted: false,
        errorMessage:
          'Cannot access this audio file. Please check file permissions or reopen the music folder.',
      };
    }
  } else if (track.file) {
    file = track.file;
  }

  if (!isCurrentRequest()) return { file: null, aborted: true };

  if (!file) {
    track.status = 'unreadable';
    callbacks.onTrackStatusChanged?.(track.id, 'unreadable');
    return {
      file: null,
      aborted: false,
      errorMessage:
        'Cannot access this audio file. Please check file permissions or reopen the music folder.',
    };
  }

  if (file.size === 0) {
    track.status = 'empty';
    track.size = 0;
    callbacks.onTrackStatusChanged?.(track.id, 'empty', 0);
    return {
      file: null,
      aborted: false,
      errorMessage:
        'This audio file is empty (0 bytes). Please check or replace the original file.',
    };
  }

  // Refresh status and metadata if previously abnormal or modified/replaced on disk
  const isStatusAbnormal = track.status && track.status !== 'normal';
  const isFileModified =
    (track.lastModified &&
      'lastModified' in file &&
      track.lastModified !== (file as File).lastModified) ||
    track.size !== file.size;

  if (isStatusAbnormal || isFileModified) {
    track.status = 'normal';
    track.size = file.size;
    if ('lastModified' in file) {
      track.lastModified = (file as File).lastModified;
    }

    let freshMetadata: Partial<TrackItem['metadata']> | undefined;
    try {
      const extracted = await extractAudioMetadata(file, track.name);
      if (extracted && isCurrentRequest()) {
        if (
          track.metadata.artworkUrl &&
          extracted.artworkUrl &&
          track.metadata.artworkUrl !== extracted.artworkUrl
        ) {
          URL.revokeObjectURL(track.metadata.artworkUrl);
        }

        freshMetadata = extracted;
        track.metadata = {
          ...track.metadata,
          ...extracted,
          isMetadataLoaded: true,
        };
        callbacks.onTrackUpdated?.({ ...track });
      }
    } catch {
      // Ignore metadata parse error on raw audio
    }

    if (!isCurrentRequest()) return { file: null, aborted: true };

    callbacks.onTrackStatusChanged?.(track.id, 'normal', file.size, freshMetadata);
  }

  if (!isCurrentRequest()) return { file: null, aborted: true };

  return { file, aborted: false };
}
