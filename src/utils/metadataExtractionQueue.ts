import { TrackItem, TrackMetadata } from '../types/music';
import { extractAudioMetadata } from './metadata';

export interface ExtractionJob {
  sourceId: string;
  generation: number;
  track: TrackItem;
}

export interface MetadataExtractionQueueOptions {
  concurrency?: number;
  extractFn?: (blob: Blob, fallbackTitle: string) => Promise<Partial<TrackMetadata>>;
  isTrackStillValid?: (track: TrackItem, sourceId: string) => boolean;
  onTrackExtracted: (track: TrackItem, metadata: Partial<TrackMetadata>) => void;
  onDrained?: () => void;
}

/**
 * Multi-batch, per-source generation-guarded background metadata extraction scheduler.
 * - Multiple import batches coexist without cancelling unrelated sources.
 * - Deduplicates active and pending jobs by canonical track ID.
 * - Bounds concurrency and discards stale results (revoking any temporary artwork URL).
 */
export class MetadataExtractionQueue {
  private readonly concurrency: number;
  private readonly extractFn: (blob: Blob, fallbackTitle: string) => Promise<Partial<TrackMetadata>>;
  private readonly isTrackStillValid?: (track: TrackItem, sourceId: string) => boolean;
  private readonly onTrackExtracted: (track: TrackItem, metadata: Partial<TrackMetadata>) => void;
  private readonly onDrained?: () => void;

  private sourceGenerations = new Map<string, number>();
  private invalidatedTrackIds = new Set<string>();
  private pendingJobs: ExtractionJob[] = [];
  private pendingTrackIds = new Set<string>();
  private activeTrackIds = new Set<string>();
  private activeWorkers = 0;

  constructor(options: MetadataExtractionQueueOptions) {
    this.concurrency = Math.max(1, options.concurrency ?? 3);
    this.extractFn = options.extractFn || extractAudioMetadata;
    this.isTrackStillValid = options.isTrackStillValid;
    this.onTrackExtracted = options.onTrackExtracted;
    this.onDrained = options.onDrained;
  }

  private getGeneration(sourceId: string): number {
    return this.sourceGenerations.get(sourceId) || 1;
  }

  private isJobCurrent(job: ExtractionJob): boolean {
    if (this.getGeneration(job.sourceId) !== job.generation) return false;
    if (this.invalidatedTrackIds.has(job.track.id)) return false;
    if (this.isTrackStillValid && !this.isTrackStillValid(job.track, job.sourceId)) {
      return false;
    }
    return true;
  }

  /**
   * Enqueues tracks for a given source without cancelling jobs belonging to other sources.
   * When `invalidatePreviousForSource` is true (e.g. folder refresh), bumps that source's
   * generation and drops its stale pending jobs while leaving other sources untouched.
   */
  enqueueBatch(
    sourceId: string,
    tracks: TrackItem[],
    options: { invalidatePreviousForSource?: boolean } = {}
  ): number {
    let gen = this.getGeneration(sourceId);
    if (options.invalidatePreviousForSource) {
      gen += 1;
      this.sourceGenerations.set(sourceId, gen);
      this.dropPendingForSource(sourceId);
    } else if (!this.sourceGenerations.has(sourceId)) {
      this.sourceGenerations.set(sourceId, gen);
    }

    let enqueued = 0;
    for (const track of tracks) {
      if (!track || track.metadata.isMetadataLoaded || track.size === 0 || track.status === 'unreadable') {
        continue;
      }
      this.invalidatedTrackIds.delete(track.id);
      if (this.pendingTrackIds.has(track.id) || this.activeTrackIds.has(track.id)) {
        continue;
      }
      this.pendingJobs.push({ sourceId, generation: gen, track });
      this.pendingTrackIds.add(track.id);
      enqueued++;
    }

    this.pump();
    return enqueued;
  }

  /**
   * Invalidates all pending and in-flight jobs for a removed or replaced source.
   */
  invalidateSource(sourceId: string): void {
    const nextGen = this.getGeneration(sourceId) + 1;
    this.sourceGenerations.set(sourceId, nextGen);
    this.dropPendingForSource(sourceId);
  }

  /**
   * Invalidates specific tracks (e.g. when individual imported files are removed).
   */
  invalidateTracks(trackIds: string[]): void {
    if (trackIds.length === 0) return;
    const idSet = new Set(trackIds);
    for (const id of idSet) {
      this.invalidatedTrackIds.add(id);
    }
    this.pendingJobs = this.pendingJobs.filter((job) => {
      if (idSet.has(job.track.id)) {
        this.pendingTrackIds.delete(job.track.id);
        return false;
      }
      return true;
    });
  }

  getPendingCount(): number {
    return this.pendingJobs.length;
  }

  getActiveCount(): number {
    return this.activeWorkers;
  }

  private dropPendingForSource(sourceId: string): void {
    this.pendingJobs = this.pendingJobs.filter((job) => {
      if (job.sourceId === sourceId) {
        this.pendingTrackIds.delete(job.track.id);
        return false;
      }
      return true;
    });
  }

  private pump(): void {
    while (this.activeWorkers < this.concurrency && this.pendingJobs.length > 0) {
      const job = this.pendingJobs.shift()!;
      this.pendingTrackIds.delete(job.track.id);

      if (!this.isJobCurrent(job)) {
        continue;
      }

      this.activeWorkers++;
      this.activeTrackIds.add(job.track.id);
      void this.runJob(job);
    }
  }

  private async runJob(job: ExtractionJob): Promise<void> {
    try {
      let blob: Blob | null = null;
      if (job.track.handle) {
        blob = await job.track.handle.getFile();
      } else if (job.track.file) {
        blob = job.track.file;
      }

      if (!blob || !this.isJobCurrent(job)) {
        return;
      }

      // Verify file freshness didn't drift between scan and file read
      if (
        job.track.size > 0 &&
        blob.size !== job.track.size
      ) {
        return;
      }

      const meta = await this.extractFn(blob, job.track.metadata.title);
      if (!meta) return;

      // Re-verify before applying result to state or cache
      if (!this.isJobCurrent(job)) {
        if (meta.artworkUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          URL.revokeObjectURL(meta.artworkUrl);
        }
        return;
      }

      this.onTrackExtracted(job.track, meta);
    } catch {
      // Ignore individual track extraction errors so other tracks proceed
    } finally {
      this.activeTrackIds.delete(job.track.id);
      this.activeWorkers--;
      this.pump();

      if (this.activeWorkers === 0 && this.pendingJobs.length === 0) {
        this.onDrained?.();
      }
    }
  }
}
