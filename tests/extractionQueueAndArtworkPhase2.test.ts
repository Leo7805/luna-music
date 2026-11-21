import { describe, it, expect, vi } from 'vitest';
import { MetadataExtractionQueue } from '../src/utils/metadataExtractionQueue';
import { OnDemandArtworkLoader, revokeUnusedArtworkUrls } from '../src/utils/artworkLoader';
import { TrackItem } from '../src/types/music';

function makeTrack(id: string, name: string, overrides: Partial<TrackItem> = {}): TrackItem {
  const file = new File([new Uint8Array(1024)], name, {
    type: 'audio/mpeg',
    lastModified: 1700000000000,
  });
  return {
    id,
    name,
    relativePath: name,
    size: file.size,
    lastModified: file.lastModified,
    file,
    status: 'normal',
    metadata: {
      title: name.replace(/\.[^/.]+$/, ''),
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      isMetadataLoaded: false,
    },
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (val: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('Phase 2 — Multi-Batch Metadata Extraction Scheduler', () => {
  it('allows batch B to coexist without cancelling batch A and deduplicates repeated imports', async () => {
    const extracted: string[] = [];
    const gates = new Map<string, ReturnType<typeof deferred<void>>>();

    const queue = new MetadataExtractionQueue({
      concurrency: 2,
      extractFn: async (_blob, title) => {
        const g = gates.get(title);
        if (g) await g.promise;
        return { title, artist: `Artist ${title}`, isMetadataLoaded: true };
      },
      onTrackExtracted: (track) => extracted.push(track.id),
    });

    const a1 = makeTrack('sourceA:a1.mp3', 'a1.mp3');
    const b1 = makeTrack('sourceB:b1.mp3', 'b1.mp3');
    gates.set('a1', deferred<void>());
    gates.set('b1', deferred<void>());

    expect(queue.enqueueBatch('sourceA', [a1])).toBe(1);
    // Duplicate enqueue of same track is ignored
    expect(queue.enqueueBatch('sourceA', [a1])).toBe(0);
    // Enqueueing batch B does NOT cancel batch A
    expect(queue.enqueueBatch('sourceB', [b1])).toBe(1);

    gates.get('a1')!.resolve();
    gates.get('b1')!.resolve();
    await new Promise((r) => setTimeout(r, 20));

    expect(extracted).toEqual(['sourceA:a1.mp3', 'sourceB:b1.mp3']);
  });

  it('discards stale results and revokes blob URLs when source A is removed or refreshed while source B proceeds', async () => {
    const extracted: string[] = [];
    const revokedUrls: string[] = [];
    const origRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => {
      revokedUrls.push(url);
    };

    try {
      const gateA = deferred<void>();
      const gateB = deferred<void>();

      const queue = new MetadataExtractionQueue({
        concurrency: 2,
        extractFn: async (_blob, title) => {
          if (title === 'a1') {
            await gateA.promise;
            return {
              title: 'A1',
              artist: 'Stale Artist',
              artworkUrl: 'blob:http://localhost/stale-a1',
              isMetadataLoaded: true,
            };
          }
          await gateB.promise;
          return { title: 'B1', artist: 'Valid Artist B', isMetadataLoaded: true };
        },
        onTrackExtracted: (track) => extracted.push(track.id),
      });

      const a1 = makeTrack('sourceA:a1.mp3', 'a1.mp3');
      const a2 = makeTrack('sourceA:a2.mp3', 'a2.mp3');
      const b1 = makeTrack('sourceB:b1.mp3', 'b1.mp3');

      queue.enqueueBatch('sourceA', [a1, a2]);
      queue.enqueueBatch('sourceB', [b1]);

      // Remove sourceA while a1 is in-flight and a2 is pending
      queue.invalidateSource('sourceA');

      gateA.resolve();
      gateB.resolve();
      await new Promise((r) => setTimeout(r, 20));

      expect(extracted).toEqual(['sourceB:b1.mp3']);
      expect(revokedUrls).toContain('blob:http://localhost/stale-a1');
    } finally {
      URL.revokeObjectURL = origRevoke;
    }
  });

  it('invalidates previous generation on source refresh without affecting other sources', async () => {
    const extracted: string[] = [];
    const gateOld = deferred<void>();
    let callCount = 0;

    const queue = new MetadataExtractionQueue({
      concurrency: 2,
      extractFn: async (_blob, title) => {
        callCount++;
        if (callCount === 1) await gateOld.promise;
        return { title, artist: `Gen ${callCount}`, isMetadataLoaded: true };
      },
      onTrackExtracted: (track, meta) => extracted.push(`${track.id}:${meta.artist}`),
    });

    const t1 = makeTrack('folder1:t1.mp3', 't1.mp3');
    const t2 = makeTrack('folder1:t2.mp3', 't2.mp3');
    queue.enqueueBatch('folder1', [t1]);

    // Refresh folder1 with new generation
    queue.enqueueBatch('folder1', [t2], { invalidatePreviousForSource: true });
    gateOld.resolve();
    await new Promise((r) => setTimeout(r, 20));

    // Stale gen-1 t1 was discarded; gen-2 t2 succeeded
    expect(extracted).toEqual(['folder1:t2.mp3:Gen 2']);
  });
});

describe('Phase 2 — On-Demand Embedded Artwork Loader & Safe Blob Cleanup', () => {
  it('prioritizes currently playing track (high), deduplicates requests, and never scans unrequested tracks', async () => {
    const loadedOrder: string[] = [];
    const extractSpy = vi.fn(async (blob: Blob) => `blob:http://localhost/art-${blob.size}-${loadedOrder.length}`);
    const gate = deferred<void>();
    let first = true;

    const loader = new OnDemandArtworkLoader({
      concurrency: 1,
      extractArtworkFn: async (blob) => {
        if (first) {
          first = false;
          await gate.promise;
        }
        return extractSpy(blob);
      },
      onArtworkLoaded: (trackId) => loadedOrder.push(trackId),
    });

    const t1 = makeTrack('t1', 't1.mp3', {
      metadata: { title: 'T1', artist: 'A', album: 'B', isMetadataLoaded: true, hasEmbeddedArtwork: true },
    });
    const t2 = makeTrack('t2', 't2.mp3', {
      metadata: { title: 'T2', artist: 'A', album: 'B', isMetadataLoaded: true, hasEmbeddedArtwork: true },
    });
    const t3NowPlaying = makeTrack('t3', 't3.mp3', {
      metadata: { title: 'T3', artist: 'A', album: 'B', isMetadataLoaded: true, hasEmbeddedArtwork: true },
    });
    const t4NoArt = makeTrack('t4', 't4.mp3', {
      metadata: { title: 'T4', artist: 'A', album: 'B', isMetadataLoaded: true, hasEmbeddedArtwork: false },
    });

    expect(loader.request(t1, 'normal')).toBe(true); // starts immediately on concurrency=1
    expect(loader.request(t2, 'normal')).toBe(true); // queued behind t1
    expect(loader.request(t2, 'normal')).toBe(false); // deduplicated!
    expect(loader.request(t3NowPlaying, 'high')).toBe(true); // jumps ahead of t2!
    expect(loader.request(t4NoArt, 'normal')).toBe(false); // no embedded artwork -> skipped

    gate.resolve();
    await new Promise((r) => setTimeout(r, 20));

    expect(loadedOrder).toEqual(['t1', 't3', 't2']);
    expect(extractSpy).toHaveBeenCalledTimes(3);
  });

  it('safely revokes obsolete Blob URLs without revoking URLs still referenced by remaining tracks', () => {
    const revoked: string[] = [];
    const origRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => revoked.push(url);

    try {
      const removedExclusive = makeTrack('r1', 'r1.mp3', {
        metadata: {
          title: 'R1',
          artist: 'A',
          album: 'B',
          isMetadataLoaded: true,
          artworkUrl: 'blob:http://localhost/exclusive',
        },
      });
      const removedShared = makeTrack('r2', 'r2.mp3', {
        metadata: {
          title: 'R2',
          artist: 'A',
          album: 'B',
          isMetadataLoaded: true,
          artworkUrl: 'blob:http://localhost/shared',
        },
      });
      const survivingShared = makeTrack('s1', 's1.mp3', {
        metadata: {
          title: 'S1',
          artist: 'A',
          album: 'B',
          isMetadataLoaded: true,
          artworkUrl: 'blob:http://localhost/shared',
        },
      });

      const count = revokeUnusedArtworkUrls([removedExclusive, removedShared], [survivingShared]);
      expect(count).toBe(1);
      expect(revoked).toEqual(['blob:http://localhost/exclusive']);
    } finally {
      URL.revokeObjectURL = origRevoke;
    }
  });
});
