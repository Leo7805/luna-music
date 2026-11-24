import { TrackItem } from '../types/music';

export type TrackMatchType = 'id' | 'alias' | 'relativePath' | 'nestedPath';

export interface TrackResolution {
  track: TrackItem | null;
  matchedBy: TrackMatchType | null;
  ambiguous: boolean;
}

export interface TrackResolveOptions {
  allowRelativePathFallback?: boolean;
  /** Opt-in recovery after reopening a different directory level; never a verified alias. */
  allowNestedPathFallback?: boolean;
}

export interface TrackReferenceResolver {
  resolve(savedTrackId: string, options?: TrackResolveOptions): TrackResolution;
}

/**
 * Extracts the bare relative path from a folder/source-prefixed Track ID
 * (e.g. "fsa_123:Pop/Hello.mp3" -> "Pop/Hello.mp3"), or returns the input as-is
 * for legacy bare relative-path IDs.
 */
export function extractRelativePathFromTrackId(savedTrackId: string): string {
  const colonIdx = savedTrackId.indexOf(':');
  return colonIdx >= 0 ? savedTrackId.slice(colonIdx + 1) : savedTrackId;
}

function addUniqueCanonicalTrack(
  map: Map<string, TrackItem[]>,
  key: string,
  track: TrackItem
): void {
  if (!key) return;
  const list = map.get(key);
  if (!list) {
    map.set(key, [track]);
    return;
  }
  if (!list.some((existing) => existing.id === track.id)) {
    list.push(track);
  }
}

/**
 * Builds an indexed resolver over the current canonical Library tracks.
 * Matching priority:
 * 1. Exact canonical `track.id`
 * 2. Verified `track.aliases` (must map to a single canonical track)
 * 3. Unique `track.relativePath` fallback (only when `allowRelativePathFallback: true`
 *    and exactly one logical Library track shares that relative path)
 *
 * Note: relative-path fallback is a practical recovery heuristic, not proof of
 * identical physical file identity.
 */
export function createTrackReferenceResolver(
  libraryTracks: TrackItem[]
): TrackReferenceResolver {
  const trackById = new Map<string, TrackItem>();
  const tracksByAlias = new Map<string, TrackItem[]>();
  const tracksByRelativePath = new Map<string, TrackItem[]>();

  for (const track of libraryTracks) {
    if (!trackById.has(track.id)) {
      trackById.set(track.id, track);
    }
    if (track.aliases) {
      for (const alias of track.aliases) {
        addUniqueCanonicalTrack(tracksByAlias, alias, track);
      }
    }
    addUniqueCanonicalTrack(tracksByRelativePath, track.relativePath, track);
  }

  return {
    resolve(
      savedTrackId: string,
      options?: TrackResolveOptions
    ): TrackResolution {
      if (!savedTrackId) {
        return { track: null, matchedBy: null, ambiguous: false };
      }

      // 1. Exact canonical ID match
      const direct = trackById.get(savedTrackId);
      if (direct) {
        return { track: direct, matchedBy: 'id', ambiguous: false };
      }

      // 2. Verified alias match (reject unexpected multi-track ambiguity)
      const aliasCandidates = tracksByAlias.get(savedTrackId);
      if (aliasCandidates && aliasCandidates.length > 0) {
        if (aliasCandidates.length === 1) {
          return { track: aliasCandidates[0], matchedBy: 'alias', ambiguous: false };
        }
        return { track: null, matchedBy: null, ambiguous: true };
      }

      // 3. Unique relativePath fallback (explicit opt-in only)
      if (options?.allowRelativePathFallback) {
        const relativePath = extractRelativePathFromTrackId(savedTrackId);
        const relCandidates = tracksByRelativePath.get(relativePath);
        if (relCandidates && relCandidates.length > 0) {
          if (relCandidates.length === 1) {
            return {
              track: relCandidates[0],
              matchedBy: 'relativePath',
              ambiguous: false,
            };
          }
          return { track: null, matchedBy: null, ambiguous: true };
        }
        // A source may be reopened as a parent or child directory. Require a complete
        // path suffix at a directory boundary and reject multiple logical candidates.
        // This is a recovery heuristic, not a verified alias or a persisted ID migration.
        const sourcePrefix = savedTrackId.includes(':') ? savedTrackId.slice(0, savedTrackId.indexOf(':') + 1) : null;
        const sourceStillPresent = options.allowNestedPathFallback && sourcePrefix && libraryTracks.some(track =>
          track.id.startsWith(sourcePrefix) || track.aliases?.some(alias => alias.startsWith(sourcePrefix)) ||
          track.folderIds?.includes(sourcePrefix.slice(0, -1)));
        if (options.allowNestedPathFallback && !sourceStillPresent) {
          const candidates = new Map<string, TrackItem>();
          for (const track of libraryTracks) {
            if (track.relativePath.endsWith(`/${relativePath}`) ||
                relativePath.endsWith(`/${track.relativePath}`)) {
              candidates.set(track.id, track);
            }
          }
          if (candidates.size === 1) {
            return { track: candidates.values().next().value!, matchedBy: 'nestedPath', ambiguous: false };
          }
          if (candidates.size > 1) return { track: null, matchedBy: null, ambiguous: true };
        }
      }

      return { track: null, matchedBy: null, ambiguous: false };
    },
  };
}
