import { TrackItem } from '../types/music';
import { createTrackReferenceResolver } from './trackReferenceResolver';

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
  unresolvedIds: string[];
  migratedMap: Map<string, string>;
}

/**
 * Resolves stored favourite IDs against the library tracks using the shared resolver.
 * - Deduplicates resolved tracks by canonical ID (avoiding inflated counts).
 * - Preserves unresolved favourite IDs so they are not lost when folders are detached.
 * - Migrates resolved alias and unambiguous relativePath matches to current canonical IDs.
 * - Preserves ambiguous IDs in unresolvedIds to prevent marking the wrong track.
 */
export function resolveFavouriteTracks(
  libraryTracks: TrackItem[],
  favourites: Set<string>
): FavouriteResolutionResult {
  const resolvedTracks: TrackItem[] = [];
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
      }
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
    unresolvedIds,
    migratedMap,
  };
}
