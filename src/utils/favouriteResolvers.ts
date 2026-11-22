import { FavouriteTrackSnapshot, TrackItem } from '../types/music';
import { createTrackReferenceResolver } from './trackReferenceResolver';
import { createUnavailableTrack } from './trackPlaceholders';

/**
 * Authoritative check if a track matches the user's favourites set.
 * Checks canonical id, aliases, and unambiguous legacy relative-path matching.
 */
export function isFavouriteTrack(
  track: TrackItem,
  favourites: Set<string>,
  libraryTracks?: TrackItem[]
): boolean {
  if (favourites.size === 0) return false;
  if (favourites.has(track.id)) return true;
  if (track.aliases && track.aliases.some((alias) => favourites.has(alias))) return true;

  // Check legacy bare relative path matching (without folder prefix)
  if (favourites.has(track.relativePath)) {
    if (libraryTracks && libraryTracks.length > 0) {
      const resolver = createTrackReferenceResolver(libraryTracks);
      const res = resolver.resolve(track.relativePath, { allowRelativePathFallback: true });
      return Boolean(res.track && res.track.id === track.id);
    }
    return true;
  }

  return false;
}

export interface FavouriteResolutionResult {
  resolvedTracks: TrackItem[];
  displayTracks: TrackItem[];
  unresolvedIds: string[];
  migratedMap: Map<string, string>;
}

/**
 * Merges live TrackItem metadata into an existing FavouriteTrackSnapshot without
 * overwriting previously valid Artist, Album, or Duration with placeholders/unknown values.
 * Returns null if nothing changed.
 */
export function mergeFavouriteSnapshot(
  existing: FavouriteTrackSnapshot | undefined,
  track: TrackItem
): FavouriteTrackSnapshot | null {
  const incomingName = track.metadata.title?.trim() || track.name;
  const incomingArtist =
    track.metadata.artist && track.metadata.artist !== 'Unknown Artist'
      ? track.metadata.artist.trim()
      : undefined;
  const incomingAlbum =
    track.metadata.album && track.metadata.album !== 'Unknown Album'
      ? track.metadata.album.trim()
      : undefined;
  const incomingDuration =
    typeof track.metadata.duration === 'number' &&
    Number.isFinite(track.metadata.duration) &&
    track.metadata.duration > 0
      ? track.metadata.duration
      : undefined;

  const next: FavouriteTrackSnapshot = {
    trackId: track.id,
    name: incomingName || existing?.name || track.name,
    artist: incomingArtist || existing?.artist,
    album: incomingAlbum || existing?.album,
    duration: incomingDuration ?? existing?.duration,
  };

  if (
    existing &&
    existing.trackId === next.trackId &&
    existing.name === next.name &&
    existing.artist === next.artist &&
    existing.album === next.album &&
    existing.duration === next.duration
  ) {
    return null;
  }
  return next;
}

/**
 * Resolves stored favourite IDs against the library tracks using the shared resolver.
 * - `resolvedTracks`: currently available canonical Library tracks (deduplicated).
 * - `displayTracks`: full ordered display list including both available tracks and
 *   shared unavailable placeholders for unresolved/ambiguous saved references.
 * - `unresolvedIds`: saved IDs not currently matched to an unambiguous Library track.
 * - `migratedMap`: alias/relativePath matches eligible for canonical ID migration.
 */
export function resolveFavouriteTracks(
  libraryTracks: TrackItem[],
  favourites: Set<string>,
  snapshots?: Record<string, FavouriteTrackSnapshot>
): FavouriteResolutionResult {
  const resolvedTracks: TrackItem[] = [];
  const displayTracks: TrackItem[] = [];
  const resolvedTrackIds = new Set<string>();
  const matchedFavIds = new Set<string>();
  const migratedMap = new Map<string, string>();

  const resolver = createTrackReferenceResolver(libraryTracks);

  for (const favId of favourites) {
    const res = resolver.resolve(favId, { allowRelativePathFallback: true });
    if (res.track) {
      if (res.matchedBy !== 'id' && res.track.id !== favId) {
        migratedMap.set(favId, res.track.id);
      }
      matchedFavIds.add(favId);
      if (!resolvedTrackIds.has(res.track.id)) {
        resolvedTrackIds.add(res.track.id);
        resolvedTracks.push(res.track);
        displayTracks.push(res.track);
      }
    } else {
      const snap = snapshots?.[favId];
      displayTracks.push(
        createUnavailableTrack(
          snap
            ? {
                trackId: favId,
                name: snap.name,
                artist: snap.artist,
                album: snap.album,
                duration: snap.duration,
              }
            : { trackId: favId }
        )
      );
    }
  }

  const unresolvedIds: string[] = [];
  for (const favId of favourites) {
    if (!matchedFavIds.has(favId)) {
      unresolvedIds.push(favId);
    }
  }

  return {
    resolvedTracks,
    displayTracks,
    unresolvedIds,
    migratedMap,
  };
}
