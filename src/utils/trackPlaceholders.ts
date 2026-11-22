import { TrackItem } from '../types/music';
import { cleanTrackTitle } from './formatters';
import { extractRelativePathFromTrackId } from './trackReferenceResolver';

export interface SavedTrackDisplayReference {
  trackId: string;
  name?: string;
  artist?: string;
  album?: string;
  duration?: number;
  addedAt?: number;
}

/**
 * Derives a readable filename from a saved Track ID when no display snapshot exists.
 * Example: "fsa_123:Pop/Hello.mp3" -> "Hello.mp3"
 */
export function deriveReadableNameFromTrackId(trackId: string): string {
  const relPath = extractRelativePathFromTrackId(trackId);
  const segments = relPath.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : trackId;
}

/**
 * Creates a standardized unavailable TrackItem placeholder for saved Playlist
 * or Favourite references whose underlying music source is currently absent or ambiguous.
 * - Preserves saved Track ID and display metadata without inventing values.
 * - Sets status: 'unreadable' and attaches no File or FileSystemHandle.
 * - Rejected by isTrackPlayable() and never registered as an active Library source.
 */
export function createUnavailableTrack(
  reference: SavedTrackDisplayReference
): TrackItem {
  const fallbackFileName = deriveReadableNameFromTrackId(reference.trackId);
  const displayName = reference.name?.trim() || fallbackFileName;
  const displayTitle = reference.name?.trim()
    ? reference.name.trim()
    : cleanTrackTitle(fallbackFileName);

  const validDuration =
    typeof reference.duration === 'number' &&
    Number.isFinite(reference.duration) &&
    reference.duration > 0
      ? reference.duration
      : 0;

  return {
    id: reference.trackId,
    name: displayName,
    relativePath: extractRelativePathFromTrackId(reference.trackId) || displayName,
    size: 0,
    lastModified: reference.addedAt || 0,
    status: 'unreadable',
    metadata: {
      title: displayTitle,
      artist: reference.artist?.trim() || 'Unknown Artist',
      album: reference.album?.trim() || 'Unknown Album',
      duration: validDuration,
      isMetadataLoaded: true,
    },
  };
}
