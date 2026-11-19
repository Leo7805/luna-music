import { TrackItem } from '../types/music';

/**
 * Authoritative check if a track matches the user's favourites set.
 * Checks canonical id, aliases, and relative path matching.
 * When libraryTracks is provided, legacy relative path matching is only applied
 * if the relative path unambiguously refers to exactly one track in the library.
 */
export function isFavouriteTrack(
  track: TrackItem,
  favourites: Set<string>,
  libraryTracks?: TrackItem[]
): boolean {
  if (favourites.size === 0) return false;
  if (favourites.has(track.id)) return true;
  if (track.aliases && track.aliases.some((alias) => favourites.has(alias))) return true;

  // Check legacy relative path matching (bare relativePath without folder prefix)
  if (favourites.has(track.relativePath)) {
    if (libraryTracks && libraryTracks.length > 0) {
      const matchCount = libraryTracks.filter(
        (t) => t.relativePath === track.relativePath
      ).length;
      if (matchCount === 1) {
        return true;
      }
      // Ambiguous: multiple tracks across independent folders share this relative path
      return false;
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
 * Resolves stored favourite IDs against the library tracks.
 * - Deduplicates resolved tracks by canonical ID (avoiding inflated counts).
 * - Preserves unresolved favourite IDs so they are not lost when folders are detached.
 * - Only migrates legacy relativePath matches when the match is strictly unambiguous (exactly 1 track).
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

  const trackById = new Map<string, TrackItem>();
  const trackByAlias = new Map<string, TrackItem>();
  const tracksByRelativePath = new Map<string, TrackItem[]>();

  for (const track of libraryTracks) {
    trackById.set(track.id, track);
    if (track.aliases) {
      for (const alias of track.aliases) {
        trackByAlias.set(alias, track);
      }
    }
    const relList = tracksByRelativePath.get(track.relativePath);
    if (relList) {
      relList.push(track);
    } else {
      tracksByRelativePath.set(track.relativePath, [track]);
    }
  }

  for (const favId of favourites) {
    let matchedTrack: TrackItem | undefined = trackById.get(favId);

    if (!matchedTrack) {
      matchedTrack = trackByAlias.get(favId);
      if (matchedTrack) {
        migratedMap.set(favId, matchedTrack.id);
      }
    }

    if (!matchedTrack) {
      let relativePathCandidate = favId;
      const colonIdx = favId.indexOf(':');
      if (colonIdx >= 0) {
        relativePathCandidate = favId.slice(colonIdx + 1);
      }
      const candidates = tracksByRelativePath.get(relativePathCandidate);
      // Strictly require unambiguous match (exactly 1 track across all imported folders)
      if (candidates && candidates.length === 1) {
        matchedTrack = candidates[0];
        migratedMap.set(favId, matchedTrack.id);
      }
    }

    if (matchedTrack) {
      matchedFavIds.add(favId);
      if (!resolvedTrackIds.has(matchedTrack.id)) {
        resolvedTrackIds.add(matchedTrack.id);
        resolvedTracks.push(matchedTrack);
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
