import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MAX_SHUFFLE_HISTORY,
  createShuffleState,
  recordShuffleTrack,
  stepBackwardInHistory,
  stepForwardInHistory,
  pickNextShuffledTrack,
} from '../src/utils/shufflePlayback';
import { usePlaybackQueue } from '../src/hooks/usePlaybackQueue';
import { extractAudioMetadata } from '../src/utils/metadata';
import {
  mergeTrackMetadataSafely,
  updateTrackMetadataInLibrary,
} from '../src/utils/libraryAggregation';
import { MusicLibrary, TrackItem } from '../src/types/music';

function makeTrack(
  id: string,
  title: string,
  overrides: Partial<TrackItem> = {}
): TrackItem {
  return {
    id,
    name: `${title}.mp3`,
    relativePath: `${title}.mp3`,
    size: 4096000,
    lastModified: 1700000000,
    status: 'normal',
    metadata: {
      title,
      artist: 'Known Artist',
      album: 'Known Album',
      duration: 200,
      isMetadataLoaded: true,
    },
    ...overrides,
  };
}

function renderHookSync<T>(useHook: () => T): T {
  let result!: T;
  function Harness() {
    result = useHook();
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return result;
}

/**
 * Builds a minimal valid synthetic MP3 Blob with:
 * - Partial ID3v2.3 header containing ONLY TIT2 (title), no TPE1/TALB
 * - Valid MPEG1 Layer3 128kbps 44.1kHz frame padding
 * - ID3v1 128-byte tail containing artist & album
 */
function buildSyntheticMp3WithId3v1Tail(
  v2Title: string,
  v1Artist: string,
  v1Album: string
): Blob {
  const enc = new TextEncoder();
  const titleBytes = enc.encode(v2Title);
  const frameSize = 1 + titleBytes.length;
  const v2PayloadSize = 10 + frameSize;
  const v2 = new Uint8Array(10 + v2PayloadSize);
  v2.set([0x49, 0x44, 0x33, 0x03, 0x00, 0x00], 0); // ID3v2.3
  v2[6] = (v2PayloadSize >> 21) & 0x7f;
  v2[7] = (v2PayloadSize >> 14) & 0x7f;
  v2[8] = (v2PayloadSize >> 7) & 0x7f;
  v2[9] = v2PayloadSize & 0x7f;
  v2.set(enc.encode('TIT2'), 10);
  v2[14] = (frameSize >> 24) & 0xff;
  v2[15] = (frameSize >> 16) & 0xff;
  v2[16] = (frameSize >> 8) & 0xff;
  v2[17] = frameSize & 0xff;
  v2[20] = 0x03; // UTF-8
  v2.set(titleBytes, 21);

  // Two minimal MPEG1 Layer3 128kbps 44.1kHz frames (417 bytes each)
  const frame = new Uint8Array(417);
  frame.set([0xff, 0xfb, 0x90, 0x00], 0);

  // ID3v1 128-byte tail
  const v1 = new Uint8Array(128);
  v1.set(enc.encode('TAG'), 0);
  v1.set(enc.encode(v2Title).slice(0, 30), 3);
  v1.set(enc.encode(v1Artist).slice(0, 30), 33);
  v1.set(enc.encode(v1Album).slice(0, 30), 63);

  return new Blob([v2, frame, frame, v1], { type: 'audio/mpeg' });
}

describe('Phase 1 — Fixed Queue + Shuffle Playback', () => {
  const a = makeTrack('a', 'Track A');
  const b = makeTrack('b', 'Track B');
  const c = makeTrack('c', 'Track C');
  const d = makeTrack('d', 'Track D');
  const e = makeTrack('e', 'Track E');
  const queue = [a, b, c, d, e];

  it('supports cursor-based listening history (A -> E -> C -> Prev(E) -> Next(C)) without reordering Queue', () => {
    const queueIdsBefore = queue.map((t) => t.id);
    let state = createShuffleState(a.id);
    state = recordShuffleTrack(state, e.id, true);
    state = recordShuffleTrack(state, c.id, true);

    const backToE = stepBackwardInHistory(state, queue, c);
    expect(backToE.track?.id).toBe(e.id);

    const forwardToC = stepForwardInHistory(backToE.nextState, queue, e);
    expect(forwardToC.track?.id).toBe(c.id);

    // Queue order was never mutated
    expect(queue.map((t) => t.id)).toEqual(queueIdsBefore);
  });

  it('truncates forward history when the user branches manually after stepping backward', () => {
    let state = createShuffleState(a.id);
    state = recordShuffleTrack(state, e.id, true);
    state = recordShuffleTrack(state, c.id, true);

    // Step back to E
    const back = stepBackwardInHistory(state, queue, c);
    expect(back.track?.id).toBe(e.id);

    // User manually clicks Track B -> truncates forward branch (C)
    const branched = recordShuffleTrack(back.nextState, b.id, true);
    expect(branched.history).toEqual([a.id, e.id, b.id]);
    expect(branched.historyIndex).toBe(2);

    const forward = stepForwardInHistory(branched, queue, b);
    expect(forward.track).toBeNull();
  });

  it('respects Repeat Off vs Repeat All on shuffle cycle exhaustion and avoids immediate repeat', () => {
    const smallQueue = [a, b, c];
    let state = createShuffleState(a.id);

    // Pick 2nd track (deterministic rng=0 picks b)
    const step1 = pickNextShuffledTrack(state, smallQueue, a, 'off', () => 0);
    expect(step1.nextTrack?.id).toBe(b.id);
    state = step1.nextState;

    // Pick 3rd track (only c left)
    const step2 = pickNextShuffledTrack(state, smallQueue, b, 'off', () => 0);
    expect(step2.nextTrack?.id).toBe(c.id);
    state = step2.nextState;

    // Cycle exhausted with Repeat Off -> stops cleanly
    const exhaustedOff = pickNextShuffledTrack(state, smallQueue, c, 'off', () => 0);
    expect(exhaustedOff.nextTrack).toBeNull();

    // Cycle exhausted with Repeat All -> starts new cycle excluding current track c
    const exhaustedAll = pickNextShuffledTrack(state, smallQueue, c, 'all', () => 0);
    expect(exhaustedAll.nextTrack).not.toBeNull();
    expect(exhaustedAll.nextTrack?.id).not.toBe(c.id);
  });

  it('skips removed or unplayable tracks when navigating history', () => {
    const unplayableE = makeTrack('e', 'Track E', { status: 'unreadable' });
    const modifiedQueue = [a, b, c, unplayableE];
    let state = createShuffleState(a.id);
    state = recordShuffleTrack(state, unplayableE.id, true);
    state = recordShuffleTrack(state, c.id, true);

    // Stepping backward from C should skip unplayable E and land on A
    const back = stepBackwardInHistory(state, modifiedQueue, c);
    expect(back.track?.id).toBe(a.id);
  });

  it('uses a large Queue-aware history bound (>= 1000) rather than truncating at 200', () => {
    expect(MAX_SHUFFLE_HISTORY).toBeGreaterThanOrEqual(1000);
    let state = createShuffleState('t-0');
    for (let i = 1; i <= 300; i++) {
      state = recordShuffleTrack(state, `t-${i}`, true);
    }
    expect(state.history.length).toBe(301);
    expect(state.history[0]).toBe('t-0');
  });

  it('prioritizes manual Play Next over Shuffle and forward history in usePlaybackQueue', () => {
    const controls = renderHookSync(() => usePlaybackQueue({ initialQueue: queue }));
    controls.resetShuffleCycle(a);
    controls.recordPlayedTrack(e, true);
    controls.recordPlayedTrack(c, true);

    // Step backward to E so C is in forward history
    const prev = controls.getPrevTrack(c, 'off', true);
    expect(prev.targetTrack?.id).toBe(e.id);

    // User triggers Play Next on Track D -> Next must play D before forward history or random
    controls.playNext(d, e, () => {});
    const next = controls.getNextTrack(e, true, 'off');
    expect(next?.id).toBe(d.id);
    // Visible Queue order still starts with a, b, c, e, d (only Play Next moved d after e, no shuffle scramble)
    expect(controls.queueRef.current[0].id).toBe(a.id);
  });
});

describe('Phase 1 — Metadata Extraction & Safe Merging', () => {
  it('extracts ID3v1 post-header Artist and Album when ID3v2 is partial and omits undefined keys', async () => {
    const blob = buildSyntheticMp3WithId3v1Tail('Partial Title', 'V1 Artist', 'V1 Album');
    const extracted = await extractAudioMetadata(blob, 'fallback.mp3');

    expect(extracted.title).toBe('Partial Title');
    expect(extracted.artist).toBe('V1 Artist');
    expect(extracted.album).toBe('V1 Album');
    for (const value of Object.values(extracted)) {
      expect(value).not.toBeUndefined();
    }
  });

  it('prevents undefined, empty strings, invalid durations, and placeholders from overwriting valid metadata', () => {
    const existing = {
      title: 'Real Title',
      artist: 'Real Artist',
      album: 'Real Album',
      duration: 245.5,
      year: 2022,
      isMetadataLoaded: true,
    };

    const merged = mergeTrackMetadataSafely(existing, {
      title: '',
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      duration: Number.NaN,
      year: undefined,
    });

    expect(merged.title).toBe('Real Title');
    expect(merged.artist).toBe('Real Artist');
    expect(merged.album).toBe('Real Album');
    expect(merged.duration).toBe(245.5);
    expect(merged.year).toBe(2022);

    // Valid duration update succeeds
    const updatedDuration = mergeTrackMetadataSafely(
      { ...existing, duration: undefined },
      { duration: 183.2 }
    );
    expect(updatedDuration.duration).toBe(183.2);
  });

  it('updates track duration in library without resetting status or size', () => {
    const t = makeTrack('t-unsupported', 'Broken Track', {
      status: 'unsupported',
      size: 12345,
      metadata: {
        title: 'Broken Track',
        artist: 'Artist X',
        album: 'Album Y',
        duration: undefined,
        isMetadataLoaded: true,
      },
    });
    const folderTree = {
      id: 'folder-1',
      name: 'Folder 1',
      relativePath: 'Folder 1',
      tracks: [t],
      subfolders: [],
      totalTrackCount: 1,
    };
    const lib: MusicLibrary = {
      id: 'lib-1',
      name: 'Library',
      sourceType: 'fs-access',
      tree: {
        id: 'root',
        name: 'Library',
        relativePath: '',
        tracks: [],
        subfolders: [folderTree],
        totalTrackCount: 1,
      },
      folders: [
        {
          id: 'f1',
          name: 'Folder 1',
          tracks: [t],
          trackCount: 1,
          tree: folderTree,
          sourceType: 'fs-access',
          addedAt: 1700000000,
          lastScannedAt: 1700000000,
          permissionStatus: 'granted',
        },
      ],
      flatPlaylist: [t],
    };

    const updated = updateTrackMetadataInLibrary(lib, t.id, { duration: 198.4 });
    expect(updated.flatPlaylist[0].metadata.duration).toBe(198.4);
    expect(updated.flatPlaylist[0].status).toBe('unsupported');
    expect(updated.flatPlaylist[0].size).toBe(12345);
    expect(updated.folders[0].tracks[0].metadata.duration).toBe(198.4);
    expect(updated.folders[0].tracks[0].status).toBe('unsupported');
  });
});
