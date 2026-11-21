import { describe, it, expect } from 'vitest';
import {
  MetadataCacheMap,
  MetadataCacheBatchWriter,
  findFreshCachedMetadata,
  applyCachedMetadataToTracks,
  buildCacheEntryFromTrack,
  computeObsoleteCacheIds,
} from '../src/services/metadataCacheStorage';
import { deriveAlbums, deriveArtists } from '../src/utils/libraryAggregation';
import { TrackItem } from '../src/types/music';

function makeTrack(
  id: string,
  name: string,
  overrides: Partial<TrackItem> = {}
): TrackItem {
  return {
    id,
    name,
    relativePath: name,
    size: 5000000,
    lastModified: 1700000000000,
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

describe('Phase 2 — Persistent Metadata Cache & Identity Rules', () => {
  it('persists extracted metadata without blob URLs and restores unchanged tracks on refresh without reparsing', async () => {
    let store: MetadataCacheMap = {};
    const writer = new MetadataCacheBatchWriter({
      readCache: async () => ({ ...store }),
      writeCache: async (next) => {
        store = next;
        return true;
      },
      debounceMs: 0,
    });

    const trackA = makeTrack('folderA:song1.mp3', 'song1.mp3');
    writer.queueUpsert(trackA, {
      title: 'Midnight Rain',
      artist: 'Taylor Swift',
      album: 'Midnights',
      duration: 174.8,
      year: 2022,
      artworkUrl: 'blob:http://localhost/temp-cover-1',
      hasEmbeddedArtwork: true,
      isMetadataLoaded: true,
    });
    await writer.flush();

    // Verify blob URL is NEVER persisted, while hasEmbeddedArtwork flag IS persisted
    const persisted = store['folderA:song1.mp3'];
    expect(persisted).toBeDefined();
    expect(persisted.artist).toBe('Taylor Swift');
    expect(persisted.album).toBe('Midnights');
    expect(persisted.duration).toBe(174.8);
    expect(persisted.hasEmbeddedArtwork).toBe(true);
    expect((persisted as unknown as Record<string, unknown>).artworkUrl).toBeUndefined();

    // Simulate page refresh: freshly scanned track with fallback metadata
    const refreshedTrack = makeTrack('folderA:song1.mp3', 'song1.mp3');
    const { hydratedTracks, tracksNeedingExtraction, cacheHits } =
      applyCachedMetadataToTracks([refreshedTrack], store);

    expect(cacheHits).toBe(1);
    expect(tracksNeedingExtraction).toHaveLength(0); // Unchanged file skips full reparsing!
    expect(hydratedTracks[0].metadata.title).toBe('Midnight Rain');
    expect(hydratedTracks[0].metadata.artist).toBe('Taylor Swift');
    expect(hydratedTracks[0].metadata.album).toBe('Midnights');
    expect(hydratedTracks[0].metadata.duration).toBe(174.8);
    expect(hydratedTracks[0].metadata.hasEmbeddedArtwork).toBe(true);
    expect(hydratedTracks[0].metadata.artworkUrl).toBeUndefined();
    expect(hydratedTracks[0].metadata.isMetadataLoaded).toBe(true);

    // Albums and Artists grouping react immediately to restored cached metadata
    const albums = deriveAlbums(hydratedTracks);
    const artists = deriveArtists(hydratedTracks);
    expect(albums.map((a) => a.name)).toEqual(['Midnights']);
    expect(artists.map((a) => a.name)).toEqual(['Taylor Swift']);
  });

  it('invalidates cached metadata when file size or lastModified changes', () => {
    const original = makeTrack('folderA:track.mp3', 'track.mp3', {
      size: 4000000,
      lastModified: 1700000000000,
    });
    const entry = buildCacheEntryFromTrack(original, {
      title: 'Old Title',
      artist: 'Old Artist',
      album: 'Old Album',
      duration: 180,
      isMetadataLoaded: true,
    })!;
    const cache: MetadataCacheMap = { [original.id]: entry };

    // Modified file (different size)
    const modifiedSize = makeTrack('folderA:track.mp3', 'track.mp3', {
      size: 4000999,
      lastModified: 1700000000000,
    });
    const res1 = applyCachedMetadataToTracks([modifiedSize], cache);
    expect(res1.cacheHits).toBe(0);
    expect(res1.tracksNeedingExtraction).toHaveLength(1);

    // Modified file (different lastModified)
    const modifiedTime = makeTrack('folderA:track.mp3', 'track.mp3', {
      size: 4000000,
      lastModified: 1700000099999,
    });
    const res2 = applyCachedMetadataToTracks([modifiedTime], cache);
    expect(res2.cacheHits).toBe(0);
    expect(res2.tracksNeedingExtraction).toHaveLength(1);
  });

  it('matches verified aliases but NEVER shares metadata between unrelated files with identical size/mtime/name', () => {
    const trackFromFolderA = makeTrack('folderA:shared.mp3', 'shared.mp3', {
      size: 3141592,
      lastModified: 1700000001234,
    });
    const entry = buildCacheEntryFromTrack(trackFromFolderA, {
      title: 'Verified Track',
      artist: 'Verified Artist',
      album: 'Verified Album',
      duration: 210,
      isMetadataLoaded: true,
    })!;
    const cache: MetadataCacheMap = { [trackFromFolderA.id]: entry };

    // 1. Verified alias (e.g., reconciled via isSameEntry) DOES match
    const aliasedTrack = makeTrack('folderB:shared.mp3', 'shared.mp3', {
      size: 3141592,
      lastModified: 1700000001234,
      aliases: ['folderB:shared.mp3', 'folderA:shared.mp3'],
    });
    expect(findFreshCachedMetadata(cache, aliasedTrack)?.entry.artist).toBe('Verified Artist');

    // 2. Unrelated file with IDENTICAL filename, size, and lastModified does NOT match!
    const unrelatedTrack = makeTrack('folderC:shared.mp3', 'shared.mp3', {
      size: 3141592,
      lastModified: 1700000001234,
      aliases: ['folderC:shared.mp3'],
    });
    expect(findFreshCachedMetadata(cache, unrelatedTrack)).toBeNull();
  });

  it('prunes only obsolete cache entries on source removal, preserves shared tracks, migrates canonical IDs, and never resurrects removed tracks', async () => {
    let store: MetadataCacheMap = {
      'folderA:onlyA.mp3': buildCacheEntryFromTrack(makeTrack('folderA:onlyA.mp3', 'onlyA.mp3'), {
        title: 'Only A',
        artist: 'Artist A',
        album: 'Album A',
        isMetadataLoaded: true,
      })!,
      'folderA:shared.mp3': buildCacheEntryFromTrack(makeTrack('folderA:shared.mp3', 'shared.mp3'), {
        title: 'Shared Song',
        artist: 'Shared Artist',
        album: 'Shared Album',
        isMetadataLoaded: true,
      })!,
    };

    const writer = new MetadataCacheBatchWriter({
      readCache: async () => ({ ...store }),
      writeCache: async (next) => {
        store = next;
        return true;
      },
      debounceMs: 0,
    });

    // Folder A is removed; Folder B still owns shared.mp3 (canonical ID migrated to folderB:shared.mp3)
    const remainingTracks = [
      makeTrack('folderB:shared.mp3', 'shared.mp3', {
        aliases: ['folderB:shared.mp3'],
      }),
    ];
    const migrations = new Map([['folderA:shared.mp3', 'folderB:shared.mp3']]);
    const obsolete = computeObsoleteCacheIds(
      ['folderA:onlyA.mp3', 'folderA:shared.mp3'],
      remainingTracks
    );

    writer.queueMigration(migrations);
    writer.queueRemoval(obsolete);
    await writer.flush();

    expect(store['folderA:onlyA.mp3']).toBeUndefined();
    expect(store['folderA:shared.mp3']).toBeUndefined();
    expect(store['folderB:shared.mp3']?.artist).toBe('Shared Artist');

    // Old cache cannot resurrect removed tracks
    const hydrated = applyCachedMetadataToTracks(remainingTracks, store);
    expect(hydrated.hydratedTracks.map((t) => t.id)).toEqual(['folderB:shared.mp3']);
  });

  it('persists playback-learned duration without overwriting valid tags and handles storage write failures gracefully', async () => {
    let store: MetadataCacheMap = {};
    const writer = new MetadataCacheBatchWriter({
      readCache: async () => ({ ...store }),
      writeCache: async (next) => {
        store = next;
        return true;
      },
      debounceMs: 0,
    });

    const t = makeTrack('f1:vbr.mp3', 'vbr.mp3');
    writer.queueUpsert(t, {
      title: 'VBR Song',
      artist: 'Real Artist',
      album: 'Real Album',
      isMetadataLoaded: true,
    });
    await writer.flush();
    expect(store['f1:vbr.mp3'].duration).toBeUndefined();

    // Playback discovers exact duration while track object still has fallback placeholders
    writer.queueUpsert(t, { duration: 243.6 });
    await writer.flush();
    expect(store['f1:vbr.mp3'].duration).toBe(243.6);
    expect(store['f1:vbr.mp3'].artist).toBe('Real Artist');
    expect(store['f1:vbr.mp3'].album).toBe('Real Album');

    // Storage failure must not throw or crash playback
    const failingWriter = new MetadataCacheBatchWriter({
      readCache: async () => {
        throw new Error('QuotaExceededError');
      },
      writeCache: async () => false,
      debounceMs: 0,
    });
    failingWriter.queueUpsert(t, { duration: 243.6 });
    await expect(failingWriter.flush()).resolves.toBe(false);
  });
});
