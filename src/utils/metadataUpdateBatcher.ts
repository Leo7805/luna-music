import { TrackItem, TrackMetadata } from '../types/music';
import { mergeTrackMetadataSafely } from './libraryAggregation';

export interface BufferedMetadataEntry {
  sourceId: string;
  generation: number;
  track: TrackItem;
  metadata: Partial<TrackMetadata>;
}

export interface MetadataUpdateBatcherOptions {
  flushIntervalMs?: number;
  maxBatchSize?: number;
  isEntryStillValid: (entry: BufferedMetadataEntry) => boolean;
  onFlushBatch: (validEntries: BufferedMetadataEntry[]) => void;
}

function revokeIfBlobUrl(url?: string): void {
  if (
    url &&
    url.startsWith('blob:') &&
    typeof URL !== 'undefined' &&
    typeof URL.revokeObjectURL === 'function'
  ) {
    URL.revokeObjectURL(url);
  }
}

/**
 * Accumulates background metadata extraction results and flushes them in bounded
 * batches (by count or interval) to avoid per-track full-library React thrashing.
 * Re-validates every buffered entry right before flushing and revokes temporary
 * Blob artwork URLs for any entry whose source was removed or superseded.
 */
export class MetadataUpdateBatcher {
  private readonly flushIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly isEntryStillValid: (entry: BufferedMetadataEntry) => boolean;
  private readonly onFlushBatch: (validEntries: BufferedMetadataEntry[]) => void;

  private buffer = new Map<string, BufferedMetadataEntry>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: MetadataUpdateBatcherOptions) {
    this.flushIntervalMs = Math.max(16, options.flushIntervalMs ?? 120);
    this.maxBatchSize = Math.max(1, options.maxBatchSize ?? 20);
    this.isEntryStillValid = options.isEntryStillValid;
    this.onFlushBatch = options.onFlushBatch;
  }

  enqueue(
    track: TrackItem,
    metadata: Partial<TrackMetadata>,
    sourceId: string,
    generation: number
  ): void {
    const existing = this.buffer.get(track.id);
    if (existing) {
      if (
        existing.metadata.artworkUrl &&
        metadata.artworkUrl &&
        existing.metadata.artworkUrl !== metadata.artworkUrl
      ) {
        revokeIfBlobUrl(existing.metadata.artworkUrl);
      }
      const merged = mergeTrackMetadataSafely(
        { ...track.metadata, ...existing.metadata },
        metadata
      );
      this.buffer.set(track.id, { sourceId, generation, track, metadata: merged });
    } else {
      this.buffer.set(track.id, { sourceId, generation, track, metadata });
    }

    if (this.buffer.size >= this.maxBatchSize) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  invalidateSource(sourceId: string): void {
    for (const [id, entry] of Array.from(this.buffer.entries())) {
      if (entry.sourceId === sourceId) {
        revokeIfBlobUrl(entry.metadata.artworkUrl);
        this.buffer.delete(id);
      }
    }
    if (this.buffer.size === 0) {
      this.clearTimer();
    }
  }

  invalidateTracks(trackIds: string[]): void {
    if (trackIds.length === 0) return;
    const idSet = new Set(trackIds);
    for (const [id, entry] of Array.from(this.buffer.entries())) {
      if (idSet.has(id) || entry.track.aliases?.some((a) => idSet.has(a))) {
        revokeIfBlobUrl(entry.metadata.artworkUrl);
        this.buffer.delete(id);
      }
    }
    if (this.buffer.size === 0) {
      this.clearTimer();
    }
  }

  flush(): number {
    this.clearTimer();
    if (this.buffer.size === 0) return 0;

    const snapshot = Array.from(this.buffer.values());
    this.buffer.clear();

    const valid: BufferedMetadataEntry[] = [];
    for (const entry of snapshot) {
      if (this.isEntryStillValid(entry)) {
        valid.push(entry);
      } else {
        revokeIfBlobUrl(entry.metadata.artworkUrl);
      }
    }

    if (valid.length > 0) {
      this.onFlushBatch(valid);
    }
    return valid.length;
  }

  getBufferedCount(): number {
    return this.buffer.size;
  }

  dispose(): void {
    this.clearTimer();
    for (const entry of this.buffer.values()) {
      revokeIfBlobUrl(entry.metadata.artworkUrl);
    }
    this.buffer.clear();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushIntervalMs);
  }

  private clearTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
