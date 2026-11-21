import { TrackItem } from '../types/music';
import { extractTrackArtwork } from './metadata';

export type ArtworkPriority = 'high' | 'normal';

interface ArtworkJob {
  key: string;
  track: TrackItem;
}

export interface OnDemandArtworkLoaderOptions {
  concurrency?: number;
  extractArtworkFn?: (blob: Blob) => Promise<string | null>;
  isTrackStillValid?: (track: TrackItem) => boolean;
  onArtworkLoaded: (trackId: string, artworkUrl: string) => void;
}

function buildArtworkKey(track: TrackItem): string {
  return `${track.id}:${track.size}:${track.lastModified}`;
}

/**
 * On-demand, priority-aware, deduplicated embedded artwork loader.
 * Never scans the entire library eagerly; extracts cover art only for
 * requested tracks (currently playing = high priority, visible rows/cards = normal).
 */
export class OnDemandArtworkLoader {
  private readonly concurrency: number;
  private readonly extractArtworkFn: (blob: Blob) => Promise<string | null>;
  private readonly isTrackStillValid?: (track: TrackItem) => boolean;
  private readonly onArtworkLoaded: (trackId: string, artworkUrl: string) => void;

  private pendingQueue: ArtworkJob[] = [];
  private pendingKeys = new Set<string>();
  private inFlightKeys = new Set<string>();
  private completedKeys = new Set<string>();
  private activeWorkers = 0;

  constructor(options: OnDemandArtworkLoaderOptions) {
    this.concurrency = Math.max(1, options.concurrency ?? 2);
    this.extractArtworkFn = options.extractArtworkFn || extractTrackArtwork;
    this.isTrackStillValid = options.isTrackStillValid;
    this.onArtworkLoaded = options.onArtworkLoaded;
  }

  /**
   * Requests embedded artwork restoration for a track if it is marked as having
   * embedded artwork and does not currently have a live Blob URL.
   */
  request(track: TrackItem | null | undefined, priority: ArtworkPriority = 'normal'): boolean {
    if (!track) return false;
    if (track.metadata.artworkUrl) return false;
    if (!track.metadata.hasEmbeddedArtwork) return false;
    if (track.status === 'unreadable' || track.size === 0) return false;
    if (!track.handle && !track.file) return false;

    const key = buildArtworkKey(track);
    if (this.inFlightKeys.has(key) || this.completedKeys.has(key)) {
      return false;
    }

    if (this.pendingKeys.has(key)) {
      if (priority === 'high') {
        const idx = this.pendingQueue.findIndex((j) => j.key === key);
        if (idx > 0) {
          const [job] = this.pendingQueue.splice(idx, 1);
          this.pendingQueue.unshift(job);
        }
      }
      return false;
    }

    const job: ArtworkJob = { key, track };
    this.pendingKeys.add(key);
    if (priority === 'high') {
      this.pendingQueue.unshift(job);
    } else {
      this.pendingQueue.push(job);
    }

    this.pump();
    return true;
  }

  /**
   * Clears cached completion/pending entries for removed tracks.
   */
  invalidateTracks(trackIds: string[]): void {
    if (trackIds.length === 0) return;
    const idSet = new Set(trackIds);
    this.pendingQueue = this.pendingQueue.filter((job) => {
      if (idSet.has(job.track.id)) {
        this.pendingKeys.delete(job.key);
        return false;
      }
      return true;
    });
    for (const key of Array.from(this.completedKeys)) {
      const id = key.split(':')[0];
      // Check full prefix match against any invalidated trackId
      for (const removedId of idSet) {
        if (key.startsWith(`${removedId}:`) || id === removedId) {
          this.completedKeys.delete(key);
          break;
        }
      }
    }
  }

  private pump(): void {
    while (this.activeWorkers < this.concurrency && this.pendingQueue.length > 0) {
      const job = this.pendingQueue.shift()!;
      this.pendingKeys.delete(job.key);

      if (this.isTrackStillValid && !this.isTrackStillValid(job.track)) {
        continue;
      }

      this.activeWorkers++;
      this.inFlightKeys.add(job.key);
      void this.runJob(job);
    }
  }

  private async runJob(job: ArtworkJob): Promise<void> {
    try {
      let blob: Blob | null = null;
      if (job.track.handle) {
        blob = await job.track.handle.getFile();
      } else if (job.track.file) {
        blob = job.track.file;
      }

      if (!blob) return;

      const artworkUrl = await this.extractArtworkFn(blob);
      if (!artworkUrl) {
        this.completedKeys.add(job.key);
        return;
      }

      // Discard and revoke if track was removed or modified while extracting
      if (this.isTrackStillValid && !this.isTrackStillValid(job.track)) {
        if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          URL.revokeObjectURL(artworkUrl);
        }
        return;
      }

      this.completedKeys.add(job.key);
      this.onArtworkLoaded(job.track.id, artworkUrl);
    } catch {
      // Ignore individual artwork extraction failures
    } finally {
      this.inFlightKeys.delete(job.key);
      this.activeWorkers--;
      this.pump();
    }
  }
}

/**
 * Safely revokes Blob URLs from removed tracks ONLY if no remaining track
 * in the library still references the same Blob URL.
 */
export function revokeUnusedArtworkUrls(
  removedTracks: TrackItem[],
  remainingTracks: TrackItem[]
): number {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
    return 0;
  }

  const activeUrls = new Set<string>();
  for (const track of remainingTracks) {
    if (track.metadata.artworkUrl) {
      activeUrls.add(track.metadata.artworkUrl);
    }
  }

  const revoked = new Set<string>();
  for (const track of removedTracks) {
    const url = track.metadata.artworkUrl;
    if (url && url.startsWith('blob:') && !activeUrls.has(url) && !revoked.has(url)) {
      URL.revokeObjectURL(url);
      revoked.add(url);
    }
  }

  return revoked.size;
}
