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
  updatedAt: number;
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
  return clean;
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
        isMetadataLoaded: true,
      });
      hydratedTracks.push({
        ...track,
        metadata: merged,
      });
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
  patch?: Partial<TrackMetadata>
): CachedTrackMetadataEntry | null {
  if (track.size <= 0 || track.lastModified <= 0) return null;

  const merged = patch ? mergeTrackMetadataSafely(track.metadata, patch) : track.metadata;
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
    updatedAt: Date.now(),
  });
}

function mergeEntriesSafely(
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

export interface MetadataCacheWriterOptions {
  readCache?: () => Promise<MetadataCacheMap>;
  writeCache?: (cache: MetadataCacheMap) => Promise<boolean>;
  debounceMs?: number;
}

/**
 * Batched, debounced IndexedDB writer with tombstone protection against stale writes.
 */
export class MetadataCacheBatchWriter {
  private pendingUpserts = new Map<string, CachedTrackMetadataEntry>();
  private pendingRemovals = new Set<string>();
  private pendingMigrations = new Map<string, string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private activeFlush: Promise<boolean> | null = null;
  private readCache: () => Promise<MetadataCacheMap>;
  private writeCache: (cache: MetadataCacheMap) => Promise<boolean>;
  private debounceMs: number;

  constructor(options: MetadataCacheWriterOptions = {}) {
    this.readCache = options.readCache || getMetadataCache;
    this.writeCache = options.writeCache || storeMetadataCache;
    this.debounceMs = options.debounceMs ?? 350;
  }

  queueUpsert(track: TrackItem, patch?: Partial<TrackMetadata>): void {
    const entry = buildCacheEntryFromTrack(track, patch);
    if (!entry) return;
    this.pendingRemovals.delete(entry.trackId);
    const existing = this.pendingUpserts.get(entry.trackId);
    this.pendingUpserts.set(
      entry.trackId,
      existing ? mergeEntriesSafely(existing, entry) : entry
    );
    this.scheduleFlush();
  }

  queueRemoval(trackIds: string[]): void {
    if (trackIds.length === 0) return;
    for (const id of trackIds) {
      this.pendingUpserts.delete(id);
      this.pendingRemovals.add(id);
    }
    this.scheduleFlush();
  }

  queueMigration(idMigrations: Map<string, string>): void {
    if (idMigrations.size === 0) return;
    for (const [oldId, newId] of idMigrations.entries()) {
      if (oldId === newId) continue;
      this.pendingMigrations.set(oldId, newId);
      const pending = this.pendingUpserts.get(oldId);
      if (pending) {
        this.pendingUpserts.delete(oldId);
        const migrated = { ...pending, trackId: newId };
        const existingTarget = this.pendingUpserts.get(newId);
        this.pendingUpserts.set(
          newId,
          existingTarget ? mergeEntriesSafely(existingTarget, migrated) : migrated
        );
      }
      this.pendingRemovals.add(oldId);
      this.pendingRemovals.delete(newId);
    }
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.debounceMs);
  }

  async flush(): Promise<boolean> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.activeFlush) {
      await this.activeFlush;
    }

    if (
      this.pendingUpserts.size === 0 &&
      this.pendingRemovals.size === 0 &&
      this.pendingMigrations.size === 0
    ) {
      return true;
    }

    const upserts = new Map(this.pendingUpserts);
    const removals = new Set(this.pendingRemovals);
    const migrations = new Map(this.pendingMigrations);
    this.pendingUpserts.clear();
    this.pendingRemovals.clear();
    this.pendingMigrations.clear();

    const run = async (): Promise<boolean> => {
      try {
        const current = await this.readCache();
        const next: MetadataCacheMap = { ...current };

        for (const [oldId, newId] of migrations.entries()) {
          const oldEntry = next[oldId];
          if (oldEntry) {
            const moved = { ...oldEntry, trackId: newId };
            next[newId] = next[newId] ? mergeEntriesSafely(next[newId], moved) : moved;
            delete next[oldId];
          }
        }

        for (const removedId of removals) {
          delete next[removedId];
        }

        for (const [id, entry] of upserts.entries()) {
          next[id] = next[id] ? mergeEntriesSafely(next[id], entry) : entry;
        }

        return await this.writeCache(next);
      } catch {
        return false;
      }
    };

    this.activeFlush = run();
    const ok = await this.activeFlush;
    this.activeFlush = null;

    // If more mutations arrived while flushing, drain them too
    if (
      this.pendingUpserts.size > 0 ||
      this.pendingRemovals.size > 0 ||
      this.pendingMigrations.size > 0
    ) {
      return this.flush();
    }

    return ok;
  }
}

export const defaultMetadataCacheWriter = new MetadataCacheBatchWriter();

export function queueMetadataCacheUpsert(track: TrackItem, patch?: Partial<TrackMetadata>): void {
  defaultMetadataCacheWriter.queueUpsert(track, patch);
}

export function queueMetadataCacheRemoval(trackIds: string[]): void {
  defaultMetadataCacheWriter.queueRemoval(trackIds);
}

export function queueMetadataCacheMigration(idMigrations: Map<string, string>): void {
  defaultMetadataCacheWriter.queueMigration(idMigrations);
}

export function flushMetadataCacheWrites(): Promise<boolean> {
  return defaultMetadataCacheWriter.flush();
}

/**
 * Coordinates cache migration and obsolete-entry pruning after removing a source or tracks.
 * Preserves shared metadata if another verified source still owns the track.
 */
export function cleanupCacheOnSourceRemoval(
  candidateRemovedIds: string[],
  remainingTracks: TrackItem[],
  idMigrations?: Map<string, string>
): void {
  const hasMigrations = Boolean(idMigrations && idMigrations.size > 0);
  if (hasMigrations && idMigrations) {
    queueMetadataCacheMigration(idMigrations);
  }
  const obsoleteIds = computeObsoleteCacheIds(candidateRemovedIds, remainingTracks);
  if (obsoleteIds.length > 0) {
    queueMetadataCacheRemoval(obsoleteIds);
  }
  if (hasMigrations || obsoleteIds.length > 0) {
    void flushMetadataCacheWrites();
  }
}
