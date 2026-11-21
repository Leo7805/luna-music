import { TrackItem, TrackMetadata } from '../types/music';
import {
  CachedTrackMetadataEntry,
  CacheUpsertOptions,
  MetadataCacheMap,
  buildCacheEntryFromTrack,
  computeObsoleteCacheIds,
  getMetadataCache,
  mergeCacheEntriesSafely,
  storeMetadataCache,
} from './metadataCacheStorage';

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

  queueUpsert(track: TrackItem, patch?: Partial<TrackMetadata>, options?: CacheUpsertOptions): void {
    const entry = buildCacheEntryFromTrack(track, patch, options);
    if (!entry) return;
    this.pendingRemovals.delete(entry.trackId);
    const existing = this.pendingUpserts.get(entry.trackId);
    this.pendingUpserts.set(
      entry.trackId,
      existing ? mergeCacheEntriesSafely(existing, entry) : entry
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
          existingTarget ? mergeCacheEntriesSafely(existingTarget, migrated) : migrated
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
            next[newId] = next[newId] ? mergeCacheEntriesSafely(next[newId], moved) : moved;
            delete next[oldId];
          }
        }

        for (const removedId of removals) {
          delete next[removedId];
        }

        for (const [id, entry] of upserts.entries()) {
          next[id] = next[id] ? mergeCacheEntriesSafely(next[id], entry) : entry;
        }

        return await this.writeCache(next);
      } catch {
        return false;
      }
    };

    this.activeFlush = run();
    const ok = await this.activeFlush;
    this.activeFlush = null;

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

export function queueMetadataCacheUpsert(
  track: TrackItem,
  patch?: Partial<TrackMetadata>,
  options?: CacheUpsertOptions
): void {
  defaultMetadataCacheWriter.queueUpsert(track, patch, options);
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
