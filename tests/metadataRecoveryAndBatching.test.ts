import { describe, it, expect } from 'vitest';
import { MetadataExtractionQueue } from '../src/utils/metadataExtractionQueue';
import { MetadataUpdateBatcher } from '../src/utils/metadataUpdateBatcher';
import {
  updateTracksMetadataInLibrary,
  mergeTrackMetadataSafely,
} from '../src/utils/libraryAggregation';
import { extractAudioMetadata } from '../src/utils/metadata';
import { naturalSort } from '../src/utils/naturalSort';
import {
  MetadataCacheMap,
  MetadataCacheBatchWriter,
  applyCachedMetadataToTracks,
  buildCacheEntryFromTrack,
  isCacheEntryTagsComplete,
} from '../src/services/metadataCacheStorage';
import { MusicLibrary, TrackItem } from '../src/types/music';

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

function makeLibrary(folderId: string, tracks: TrackItem[]): MusicLibrary {
  const tree = {
    id: folderId,
    name: folderId,
    relativePath: folderId,
    tracks,
    subfolders: [],
    totalTrackCount: tracks.length,
  };
  return {
    id: 'multi-library',
    name: 'Music Library',
    sourceType: 'fs-access',
    folders: [
      {
        id: folderId,
        name: folderId,
        sourceType: 'fs-access',
        tracks,
        trackCount: tracks.length,
        tree,
        addedAt: 1700000000,
        lastScannedAt: 1700000000,
        permissionStatus: 'granted',
      },
    ],
    tree: {
      id: 'root',
      name: 'Music Library',
      relativePath: '',
      tracks: [],
      subfolders: [tree],
      totalTrackCount: tracks.length,
    },
    flatPlaylist: tracks,
  };
}

describe('Metadata Pipeline Recovery — Sync Ref, Batching & Visible Order', () => {
  it('processes a 319-track folder immediately after synchronous libraryRef update with 0 dropped jobs and batched UI commits', async () => {
    // Unsorted filesystem order -> naturalSort puts track_001..track_020 first
    const tracks: TrackItem[] = [];
    for (let i = 319; i >= 1; i--) {
      const padded = String(i).padStart(3, '0');
      tracks.push(makeTrack(`folderB:track_${padded}.mp3`, `track_${padded}.mp3`));
    }

    const libraryRef: { current: MusicLibrary | null } = { current: makeLibrary('folderB', tracks) };
    const extractionOrder: string[] = [];
    let batchFlushes = 0;

    let queue!: MetadataExtractionQueue;
    const batcher = new MetadataUpdateBatcher({
      flushIntervalMs: 5000, // Force batching by size (20) + final drain flush
      maxBatchSize: 20,
      isEntryStillValid: (entry) =>
        queue.isSourceGenerationCurrent(entry.sourceId, entry.generation) &&
        Boolean(libraryRef.current?.folders.some((f) => f.id === entry.sourceId)),
      onFlushBatch: (validEntries) => {
        batchFlushes++;
        const updates = new Map(validEntries.map((e) => [e.track.id, e.metadata]));
        libraryRef.current = libraryRef.current
          ? updateTracksMetadataInLibrary(libraryRef.current, updates)
          : null;
      },
    });

    let drainedResolve!: () => void;
    const drained = new Promise<void>((r) => {
      drainedResolve = r;
    });

    queue = new MetadataExtractionQueue({
      concurrency: 3,
      extractFn: async (_blob, title) => {
        extractionOrder.push(title);
        return {
          title,
          artist: `Artist ${title}`,
          album: `Album ${title}`,
          duration: 210,
          codec: 'MPEG 1 Layer 3',
          isMetadataLoaded: true,
        };
      },
      isTrackStillValid: (track, sourceId) =>
        Boolean(
          libraryRef.current?.folders.some((f) => f.id === sourceId) &&
            libraryRef.current?.flatPlaylist.some((t) => t.id === track.id)
        ),
      onTrackExtracted: (track, meta, sourceId, generation) => {
        batcher.enqueue(track, meta, sourceId, generation);
      },
      onDrained: () => {
        batcher.flush();
        drainedResolve();
      },
    });

    const ordered = naturalSort(tracks, (t) => t.relativePath || t.name);
    expect(queue.enqueueBatch('folderB', ordered)).toBe(319);
    await drained;

    // 0 dropped jobs: all 319 tracks populated
    expect(extractionOrder).toHaveLength(319);
    // Visible top rows extracted first
    expect(extractionOrder[0]).toBe('track_001');
    expect(extractionOrder[1]).toBe('track_002');
    // Batched: 319 tracks / 20 per batch = 16 flushes (15 full + 1 final partial), NOT 319!
    expect(batchFlushes).toBe(16);
    expect(libraryRef.current?.flatPlaylist.every((t) => t.metadata.duration === 210)).toBe(true);
    expect(libraryRef.current?.folders[0].tree.tracks.every((t) => t.metadata.artist.startsWith('Artist '))).toBe(true);
  });

  it('discards buffered metadata and revokes blob URLs when a source is removed before flush', () => {
    const revoked: string[] = [];
    const origRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => revoked.push(url);

    try {
      let validSource = true;
      const flushedIds: string[] = [];
      const batcher = new MetadataUpdateBatcher({
        flushIntervalMs: 5000,
        maxBatchSize: 20,
        isEntryStillValid: (entry) => entry.sourceId !== 'folderA' || validSource,
        onFlushBatch: (entries) => entries.forEach((e) => flushedIds.push(e.track.id)),
      });

      const a1 = makeTrack('folderA:a1.mp3', 'a1.mp3');
      const b1 = makeTrack('folderB:b1.mp3', 'b1.mp3');
      batcher.enqueue(a1, { artist: 'A', artworkUrl: 'blob:http://localhost/a1', isMetadataLoaded: true }, 'folderA', 1);
      batcher.enqueue(b1, { artist: 'B', isMetadataLoaded: true }, 'folderB', 1);

      // User removes folderA while results are buffered
      validSource = false;
      batcher.invalidateSource('folderA');
      batcher.flush();

      expect(flushedIds).toEqual(['folderB:b1.mp3']);
      expect(revoked).toEqual(['blob:http://localhost/a1']);
    } finally {
      URL.revokeObjectURL = origRevoke;
    }
  });
});

describe('Metadata Cache Completeness, Parse Failure & Playback-Duration Provenance', () => {
  it('returns isMetadataLoaded: false on corrupted parse and never poisons cache', async () => {
    const garbageBlob = new Blob([new Uint8Array([0x00, 0x01, 0x02, 0x03])], { type: 'audio/mpeg' });
    const parsed = await extractAudioMetadata(garbageBlob, 'broken');
    expect(parsed.isMetadataLoaded).toBe(false);

    const t = makeTrack('f1:broken.mp3', 'broken.mp3');
    // Fallback-only entry without tagsParsed or duration is rejected from cache
    const entry = buildCacheEntryFromTrack(t, parsed, { tagsParsed: false });
    expect(entry).toBeNull();
  });

  it('does NOT mark playback-learned duration alone as tagsParsed, while genuinely tagless parsed MP3s are not reparsed', async () => {
    let store: MetadataCacheMap = {};
    const writer = new MetadataCacheBatchWriter({
      readCache: async () => ({ ...store }),
      writeCache: async (next) => {
        store = next;
        return true;
      },
      debounceMs: 0,
    });

    // 1. Track with duration learned ONLY from playback (tags never parsed)
    const playbackOnly = makeTrack('f1:played.mp3', 'played.mp3');
    writer.queueUpsert(playbackOnly, { duration: 225 }, { tagsParsed: false });
    await writer.flush();

    expect(store['f1:played.mp3'].duration).toBe(225);
    expect(store['f1:played.mp3'].tagsParsed).toBe(false);
    expect(isCacheEntryTagsComplete(store['f1:played.mp3'])).toBe(false);

    // On refresh: restores cached 225s duration immediately, YET still schedules tag extraction!
    const refreshedPlayed = makeTrack('f1:played.mp3', 'played.mp3');
    const hyd1 = applyCachedMetadataToTracks([refreshedPlayed], store);
    expect(hyd1.hydratedTracks[0].metadata.duration).toBe(225);
    expect(hyd1.hydratedTracks[0].metadata.isMetadataLoaded).toBe(false);
    expect(hyd1.tracksNeedingExtraction).toHaveLength(1);

    // 2. Genuinely tagless MP3 that WAS successfully parsed (tagsParsed: true)
    const tagless = makeTrack('f1:tagless.mp3', 'tagless.mp3');
    writer.queueUpsert(
      tagless,
      { artist: 'Unknown Artist', album: 'Unknown Album', duration: 231.9, codec: 'MPEG 1 Layer 3', isMetadataLoaded: true },
      { tagsParsed: true }
    );
    await writer.flush();

    const refreshedTagless = makeTrack('f1:tagless.mp3', 'tagless.mp3');
    const hyd2 = applyCachedMetadataToTracks([refreshedTagless], store);
    expect(hyd2.hydratedTracks[0].metadata.duration).toBe(231.9);
    expect(hyd2.hydratedTracks[0].metadata.isMetadataLoaded).toBe(true);
    expect(hyd2.tracksNeedingExtraction).toHaveLength(0); // Not reparsed repeatedly!

    // 3. Legacy fallback-only cache entry (no tagsParsed flag, no duration, no codec) self-heals
    const legacyPoisonedCache: MetadataCacheMap = {
      'f1:legacy.mp3': {
        trackId: 'f1:legacy.mp3',
        size: 1024,
        lastModified: 1700000000000,
        title: 'legacy',
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        hasEmbeddedArtwork: false,
        updatedAt: 1700000000000,
      },
    };
    const legacyTrack = makeTrack('f1:legacy.mp3', 'legacy.mp3');
    const hyd3 = applyCachedMetadataToTracks([legacyTrack], legacyPoisonedCache);
    expect(hyd3.tracksNeedingExtraction).toHaveLength(1);
  });

  it('extracts CBR MP3 without Xing header + ID3v1 tail quickly without full-frame Blob.slice storms', async () => {
    // Build a 1,000-frame (~417 KB, ~26s) CBR 128kbps MP3 with NO Xing/VBRI header and an ID3v1 tail
    const frame = new Uint8Array(417);
    frame.set([0xff, 0xfb, 0x90, 0x00], 0);
    const totalAudioBytes = frame.length * 1000;
    const audio = new Uint8Array(totalAudioBytes);
    for (let i = 0; i < 1000; i++) audio.set(frame, i * frame.length);

    const enc = new TextEncoder();
    const v1 = new Uint8Array(128);
    v1.set(enc.encode('TAG'), 0);
    v1.set(enc.encode('Fast CBR Song').slice(0, 30), 3);
    v1.set(enc.encode('CBR Artist').slice(0, 30), 33);
    v1.set(enc.encode('CBR Album').slice(0, 30), 63);

    const rawBlob = new Blob([audio, v1], { type: 'audio/mpeg' });
    let sliceCalls = 0;
    const wrap = (b: Blob): Blob =>
      new Proxy(b, {
        get(target, prop) {
          if (prop === 'slice') {
            return (...args: Parameters<Blob['slice']>) => {
              sliceCalls++;
              return wrap(target.slice(...args));
            };
          }
          const val = Reflect.get(target, prop);
          return typeof val === 'function' ? val.bind(target) : val;
        },
      });

    const parsed = await extractAudioMetadata(wrap(rawBlob), 'fallback');
    expect(parsed.isMetadataLoaded).toBe(true);
    expect(parsed.title).toBe('Fast CBR Song');
    expect(parsed.artist).toBe('CBR Artist');
    expect(parsed.album).toBe('CBR Album');
    expect(parsed.duration).toBeGreaterThan(25);
    expect(parsed.duration).toBeLessThan(27);
    // With duration: false, parsing reads only header + tail (~20 slices), NOT ~2,000+ frame slices
    expect(sliceCalls).toBeLessThan(100);
  });

  it('allows playback-measured duration to refine an estimate while preventing late background parsing from overwriting it', () => {
    // 1. Playback refines a fast-pass VBR estimate (242.0 -> 248.27) while preserving Artist/Album
    const estimated = {
      title: 'VBR Song',
      artist: 'Known Artist',
      album: 'Known Album',
      duration: 242.0,
      isMetadataLoaded: true,
    };
    const refined = mergeTrackMetadataSafely(estimated, { duration: 248.27 });
    expect(refined.duration).toBe(248.27);
    expect(refined.artist).toBe('Known Artist');
    expect(refined.album).toBe('Known Album');

    // 2. Late background extraction (isMetadataLoaded: true) does NOT overwrite an already-measured playback duration
    const afterPlaybackBeforeTags = {
      title: 'vbr_song',
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      duration: 248.27,
      isMetadataLoaded: false,
    };
    const lateExtraction = mergeTrackMetadataSafely(afterPlaybackBeforeTags, {
      title: 'VBR Song',
      artist: 'Real Artist',
      album: 'Real Album',
      duration: 242.0,
      isMetadataLoaded: true,
    });
    expect(lateExtraction.duration).toBe(248.27);
    expect(lateExtraction.artist).toBe('Real Artist');
    expect(lateExtraction.album).toBe('Real Album');
    expect(lateExtraction.isMetadataLoaded).toBe(true);
  });
});
