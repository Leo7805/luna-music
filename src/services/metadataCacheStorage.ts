import { TrackItem, TrackMetadata } from '../types/music';
import { idbGet, idbPut, STATE_STORE, TRACK_METADATA_CACHE_KEY } from './idbCore';
import { mergeTrackMetadataSafely } from '../utils/libraryAggregation';

export interface CachedTrackMetadataEntry {
  trackId: string;
  size: number;
  lastModified: number;
  title: string;
  artist: string;
  album: string;
  duration?: number;
  trackNo?: number;
  diskNo?: number;
  year?: number | string;
  genre?: string;
  codec?: string;
  bitrate?: number;
  hasEmbeddedArtwork: boolean;
  /** True only when embedded audio metadata parsing completed successfully. */
  tagsParsed?: boolean;
  updatedAt: number;
}

export interface CacheUpsertOptions {
  tagsParsed?: boolean;
}

export type MetadataCacheMap = Record<string, CachedTrackMetadataEntry>;

export interface CacheHydrationResult {
  hydratedTracks: TrackItem[];
  tracksNeedingExtraction: TrackItem[];
  cacheHits: number;
}

/**
 * Reads the persisted metadata cache map from IndexedDB in a single operation.
 * Returns an empty map if IndexedDB is unavailable or corrupted.
 */
export async function getMetadataCache(): Promise<MetadataCacheMap> {
  try {
    const raw = await idbGet<MetadataCacheMap>(STATE_STORE, TRACK_METADATA_CACHE_KEY);
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Persists the metadata cache map into IndexedDB.
 * Strips any accidental blob URLs before writing. Never throws on storage failure.
 */
export async function storeMetadataCache(cache: MetadataCacheMap): Promise<boolean> {
  try {
    const sanitized: MetadataCacheMap = {};
    for (const [key, entry] of Object.entries(cache)) {
      if (!entry || typeof entry !== 'object') continue;
      sanitized[key] = sanitizeCacheEntry(entry);
    }
    return await idbPut(STATE_STORE, TRACK_METADATA_CACHE_KEY, sanitized);
  } catch {
    return false;
  }
}

function sanitizeCacheEntry(entry: CachedTrackMetadataEntry): CachedTrackMetadataEntry {
  const clean: CachedTrackMetadataEntry = {
    trackId: entry.trackId,
    size: entry.size,
    lastModified: entry.lastModified,
    title: entry.title,
    artist: entry.artist,
    album: entry.album,
    hasEmbeddedArtwork: Boolean(entry.hasEmbeddedArtwork),
    updatedAt: entry.updatedAt || Date.now(),
  };
  if (typeof entry.duration === 'number' && Number.isFinite(entry.duration) && entry.duration > 0) {
    clean.duration = entry.duration;
  }
  if (entry.trackNo !== undefined) clean.trackNo = entry.trackNo;
  if (entry.diskNo !== undefined) clean.diskNo = entry.diskNo;
  if (entry.year !== undefined && String(entry.year).trim() !== '') clean.year = entry.year;
  if (entry.genre?.trim()) clean.genre = entry.genre.trim();
  if (entry.codec?.trim()) clean.codec = entry.codec.trim();
  if (typeof entry.bitrate === 'number' && entry.bitrate > 0) clean.bitrate = entry.bitrate;
  if (typeof entry.tagsParsed === 'boolean') clean.tagsParsed = entry.tagsParsed;
  return clean;
}

/**
 * Determines whether a cached metadata entry represents a completed embedded-tag parse.
 * - Explicit `tagsParsed === true`: complete (including genuinely tagless parsed MP3s).
 * - Explicit `tagsParsed === false`: incomplete (e.g. duration learned only from playback).
 * - Legacy entry (`tagsParsed === undefined`): complete only if it has both valid duration
 *   and at least one parsed non-placeholder tag or audio codec; fallback-only entries self-heal.
 */
export function isCacheEntryTagsComplete(entry: CachedTrackMetadataEntry): boolean {
  if (entry.tagsParsed === true) return true;
  if (entry.tagsParsed === false) return false;
  const hasDuration = typeof entry.duration === 'number' && Number.isFinite(entry.duration) && entry.duration > 0;
  const hasParsedEvidence =
    (Boolean(entry.artist) && entry.artist !== 'Unknown Artist') ||
    (Boolean(entry.album) && entry.album !== 'Unknown Album') ||
    Boolean(entry.codec);
  return hasDuration && hasParsedEvidence;
}

function isFreshForTrack(entry: CachedTrackMetadataEntry, track: TrackItem): boolean {
  return (
    track.size > 0 &&
    track.lastModified > 0 &&
    entry.size === track.size &&
    entry.lastModified === track.lastModified
  );
}

/**
 * Finds a fresh cached metadata entry using ONLY verified canonical ID or verified aliases.
 * Never matches unrelated files by filename, title, artist, size, or lastModified alone.
 */
export function findFreshCachedMetadata(
  cache: MetadataCacheMap,
  track: TrackItem
): { matchedKey: string; entry: CachedTrackMetadataEntry } | null {
  const direct = cache[track.id];
  if (direct && isFreshForTrack(direct, track)) {
    return { matchedKey: track.id, entry: direct };
  }

  if (track.aliases && track.aliases.length > 0) {
    for (const alias of track.aliases) {
      const aliased = cache[alias];
      if (aliased && isFreshForTrack(aliased, track)) {
        return { matchedKey: alias, entry: aliased };
      }
    }
  }

  return null;
}

/**
 * Applies valid, fresh cached metadata to a list of tracks and returns which tracks
 * still need background metadata extraction.
 */
export function applyCachedMetadataToTracks(
  tracks: TrackItem[],
  cache: MetadataCacheMap
): CacheHydrationResult {
  const hydratedTracks: TrackItem[] = [];
  const tracksNeedingExtraction: TrackItem[] = [];
  let cacheHits = 0;

  for (const track of tracks) {
    if (track.metadata.isMetadataLoaded) {
      hydratedTracks.push(track);
      continue;
    }

    const match = findFreshCachedMetadata(cache, track);
    if (match) {
      cacheHits++;
      const entry = match.entry;
      const tagsComplete = isCacheEntryTagsComplete(entry);
      const merged = mergeTrackMetadataSafely(track.metadata, {
        title: entry.title,
        artist: entry.artist,
        album: entry.album,
        duration: entry.duration,
        trackNo: entry.trackNo,
        diskNo: entry.diskNo,
        year: entry.year,
        genre: entry.genre,
        codec: entry.codec,
        bitrate: entry.bitrate,
        hasEmbeddedArtwork: entry.hasEmbeddedArtwork,
        isMetadataLoaded: tagsComplete,
      });
      const hydratedTrack: TrackItem = {
        ...track,
        metadata: merged,
      };
      hydratedTracks.push(hydratedTrack);
      // Incomplete / playback-duration-only / legacy fallback entries still schedule tag parsing
      if (!tagsComplete && track.size > 0 && track.status !== 'unreadable') {
        tracksNeedingExtraction.push(hydratedTrack);
      }
    } else {
      hydratedTracks.push(track);
      if (track.size > 0 && track.status !== 'unreadable') {
        tracksNeedingExtraction.push(track);
      }
    }
  }

  return { hydratedTracks, tracksNeedingExtraction, cacheHits };
}

/**
 * Builds a sanitized cache entry from a TrackItem and optional fresh metadata patch.
 * Returns null if the track lacks verifiable file freshness (size/lastModified).
 */
export function buildCacheEntryFromTrack(
  track: TrackItem,
  patch?: Partial<TrackMetadata>,
  options?: CacheUpsertOptions
): CachedTrackMetadataEntry | null {
  if (track.size <= 0 || track.lastModified <= 0) return null;

  const merged = patch ? mergeTrackMetadataSafely(track.metadata, patch) : track.metadata;
  const tagsParsed =
    options?.tagsParsed !== undefined
      ? options.tagsParsed
      : Boolean(patch?.isMetadataLoaded || track.metadata.isMetadataLoaded);

  const hasDuration = typeof merged.duration === 'number' && Number.isFinite(merged.duration) && merged.duration > 0;
  const hasRealTags =
    (Boolean(merged.artist) && merged.artist !== 'Unknown Artist') ||
    (Boolean(merged.album) && merged.album !== 'Unknown Album') ||
    Boolean(merged.codec);

  // Refuse to persist empty fallback-only records that were never parsed and have no duration
  if (!tagsParsed && !hasDuration && !hasRealTags) {
    return null;
  }

  return sanitizeCacheEntry({
    trackId: track.id,
    size: track.size,
    lastModified: track.lastModified,
    title: merged.title,
    artist: merged.artist,
    album: merged.album,
    duration: merged.duration,
    trackNo: merged.trackNo,
    diskNo: merged.diskNo,
    year: merged.year,
    genre: merged.genre,
    codec: merged.codec,
    bitrate: merged.bitrate,
    hasEmbeddedArtwork: Boolean(merged.hasEmbeddedArtwork || merged.artworkUrl),
    tagsParsed,
    updatedAt: Date.now(),
  });
}

export function mergeCacheEntriesSafely(
  existing: CachedTrackMetadataEntry,
  incoming: CachedTrackMetadataEntry
): CachedTrackMetadataEntry {
  // If file size or lastModified changed, the newer file metadata replaces the stale entry
  if (existing.size !== incoming.size || existing.lastModified !== incoming.lastModified) {
    return sanitizeCacheEntry(incoming);
  }
  const mergedMeta = mergeTrackMetadataSafely(
    {
      title: existing.title,
      artist: existing.artist,
      album: existing.album,
      duration: existing.duration,
      trackNo: existing.trackNo,
      diskNo: existing.diskNo,
      year: existing.year,
      genre: existing.genre,
      codec: existing.codec,
      bitrate: existing.bitrate,
      hasEmbeddedArtwork: existing.hasEmbeddedArtwork,
      isMetadataLoaded: true,
    },
    {
      title: incoming.title,
      artist: incoming.artist,
      album: incoming.album,
      duration: incoming.duration,
      trackNo: incoming.trackNo,
      diskNo: incoming.diskNo,
      year: incoming.year,
      genre: incoming.genre,
      codec: incoming.codec,
      bitrate: incoming.bitrate,
      hasEmbeddedArtwork: incoming.hasEmbeddedArtwork,
      isMetadataLoaded: true,
    }
  );
  return sanitizeCacheEntry({
    trackId: incoming.trackId,
    size: incoming.size,
    lastModified: incoming.lastModified,
    title: mergedMeta.title,
    artist: mergedMeta.artist,
    album: mergedMeta.album,
    duration: mergedMeta.duration,
    trackNo: mergedMeta.trackNo,
    diskNo: mergedMeta.diskNo,
    year: mergedMeta.year,
    genre: mergedMeta.genre,
    codec: mergedMeta.codec,
    bitrate: mergedMeta.bitrate,
    hasEmbeddedArtwork: Boolean(mergedMeta.hasEmbeddedArtwork),
    tagsParsed: Boolean(existing.tagsParsed || incoming.tagsParsed),
    updatedAt: incoming.updatedAt,
  });
}

/**
 * Computes which candidate removed track IDs are truly obsolete (no longer referenced by
 * any remaining track's canonical ID or verified aliases).
 */
export function computeObsoleteCacheIds(
  candidateRemovedIds: string[],
  remainingTracks: TrackItem[]
): string[] {
  const survivingIds = new Set<string>();
  for (const track of remainingTracks) {
    survivingIds.add(track.id);
    if (track.aliases) {
      for (const alias of track.aliases) {
        survivingIds.add(alias);
      }
    }
  }
  return candidateRemovedIds.filter((id) => !survivingIds.has(id));
}

export * from './metadataCacheWriter';
