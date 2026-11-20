import { describe, it, expect } from 'vitest';
import {
  applyPlayNext,
  applyBulkPlayNext,
  getNextTrackToPlay,
} from '../src/utils/queueAlgorithms';
import { TrackItem } from '../src/types/music';

function makeTrack(id: string, name: string): TrackItem {
  return {
    id,
    name: `${name}.mp3`,
    relativePath: `${name}.mp3`,
    size: 1024,
    lastModified: 1000,
    metadata: {
      title: name,
      artist: 'Artist',
      album: 'Album',
      duration: 180,
      isMetadataLoaded: true,
    },
    status: 'normal',
  };
}

describe('Play Next Queue Indexing & Mutations', () => {
  // Scenario A: 12 tracks, current is H (pos 8, index 7), Play Next on track C (pos 3, index 2)
  it('Scenario A: moves track from before current track to immediately after current track without off-by-one error', () => {
    // 12 tracks: A, B, C, D, E, F, G, H, I, J, K, L
    const tracks = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map((letter) =>
      makeTrack(`id-${letter}`, `Track ${letter}`)
    );
    const [tA, tB, tC, tD, tE, tF, tG, tH, tI, tJ, tK, tL] = tracks;
    const initialQueue = [...tracks];
    const currentTrack = tH; // pos 8 (index 7)

    expect(initialQueue[7].id).toBe(tH.id);
    expect(initialQueue[2].id).toBe(tC.id);

    const result = applyPlayNext(initialQueue, currentTrack, tC);

    expect(result.outcome).toBe('moved');
    expect(result.nextQueue).toHaveLength(12);
    expect(result.nextQueue.map((t) => t.id)).toEqual([
      tA.id,
      tB.id,
      tD.id,
      tE.id,
      tF.id,
      tG.id,
      tH.id, // index 6 (current)
      tC.id, // index 7 (next!)
      tI.id,
      tJ.id,
      tK.id,
      tL.id,
    ]);

    // Current track remains H
    const currentIdx = result.nextQueue.findIndex((t) => t.id === currentTrack.id);
    expect(currentIdx).toBe(6);
    expect(result.nextQueue[currentIdx + 1].id).toBe(tC.id);

    // Next track played will be C
    const { nextTrack } = getNextTrackToPlay(result.nextQueue, currentTrack, false, 'all', null);
    expect(nextTrack?.id).toBe(tC.id);
  });

  // Scenario B: 12 tracks, current is H (pos 8, index 7), Play Next on track K (pos 11, index 10)
  it('Scenario B: moves track from after current track to immediately after current track', () => {
    const tracks = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map((letter) =>
      makeTrack(`id-${letter}`, `Track ${letter}`)
    );
    const [tA, tB, tC, tD, tE, tF, tG, tH, tI, tJ, tK, tL] = tracks;
    const initialQueue = [...tracks];
    const currentTrack = tH; // pos 8 (index 7)

    const result = applyPlayNext(initialQueue, currentTrack, tK);

    expect(result.outcome).toBe('moved');
    expect(result.nextQueue).toHaveLength(12);
    expect(result.nextQueue.map((t) => t.id)).toEqual([
      tA.id,
      tB.id,
      tC.id,
      tD.id,
      tE.id,
      tF.id,
      tG.id,
      tH.id, // index 7 (current)
      tK.id, // index 8 (next!)
      tI.id,
      tJ.id,
      tL.id,
    ]);

    const currentIdx = result.nextQueue.findIndex((t) => t.id === currentTrack.id);
    expect(currentIdx).toBe(7);
    expect(result.nextQueue[currentIdx + 1].id).toBe(tK.id);
  });

  // Scenario C: Play Next on already-next track
  it('retains position when Play Next is called on track that is already next in queue', () => {
    const tA = makeTrack('id-A', 'Track A');
    const tB = makeTrack('id-B', 'Track B');
    const tC = makeTrack('id-C', 'Track C');
    const queue = [tA, tB, tC];
    const current = tA;

    const result = applyPlayNext(queue, current, tB);
    expect(result.outcome).toBe('moved');
    expect(result.nextQueue.map((t) => t.id)).toEqual([tA.id, tB.id, tC.id]);
    expect(result.nextQueue[1].id).toBe(tB.id);
  });

  // Scenario D: Play Next on current playing track
  it('does not move or disrupt when Play Next is called on current track itself', () => {
    const tA = makeTrack('id-A', 'Track A');
    const tB = makeTrack('id-B', 'Track B');
    const queue = [tA, tB];
    const current = tA;

    const result = applyPlayNext(queue, current, tA);
    expect(result.outcome).toBe('noop');
    expect(result.nextQueue.map((t) => t.id)).toEqual([tA.id, tB.id]);
  });

  // Scenario E: Insert new track absent from Queue
  it('inserts new track immediately after current track without duplicates', () => {
    const tA = makeTrack('id-A', 'Track A');
    const tB = makeTrack('id-B', 'Track B');
    const tNew = makeTrack('id-New', 'Track New');
    const queue = [tA, tB];
    const current = tA;

    const result = applyPlayNext(queue, current, tNew);
    expect(result.outcome).toBe('added');
    expect(result.nextQueue.map((t) => t.id)).toEqual([tA.id, tNew.id, tB.id]);
  });

  // Scenario F: Bulk Play Next with mixed positions (before, after, and new)
  it('handles bulk Play Next with mixed track positions preserving selected order', () => {
    const tA = makeTrack('id-A', 'Track A');
    const tB = makeTrack('id-B', 'Track B');
    const tC = makeTrack('id-C', 'Track C');
    const tD = makeTrack('id-D', 'Track D');
    const tNew1 = makeTrack('id-New1', 'New 1');
    const tNew2 = makeTrack('id-New2', 'New 2');

    // Queue: [A, B, C, D], current is C (index 2)
    const queue = [tA, tB, tC, tD];
    const current = tC;

    // Bulk Play Next: [tA (before C), tNew1 (new), tD (after C), tNew2 (new)]
    const result = applyBulkPlayNext(queue, current, [tA, tNew1, tD, tNew2]);
    expect(result.addedCount + result.movedCount).toBe(4);

    // Current is C.
    // Resulting queue should have:
    // [B, C, A, New1, D, New2]
    expect(result.nextQueue.map((t) => t.id)).toEqual([
      tB.id,
      tC.id,
      tA.id,
      tNew1.id,
      tD.id,
      tNew2.id,
    ]);

    const curIdx = result.nextQueue.findIndex((t) => t.id === current.id);
    expect(curIdx).toBe(1);
    expect(result.nextQueue[curIdx + 1].id).toBe(tA.id);
  });

  // Scenario G: Canonical duplicate deduplication
  it('deduplicates tracks with matching canonical IDs or aliases during Play Next', () => {
    const t1 = makeTrack('track-canon-1', 'Song');
    t1.aliases = ['alias-1', 'alias-2'];
    const t2 = makeTrack('track-canon-2', 'Other Song');
    const queue = [t1, t2];
    const current = t1;

    // Attempting to Play Next an alias of t1 should be treated as current track (noop)
    const t1Alias = makeTrack('alias-1', 'Song');
    const res1 = applyPlayNext(queue, current, t1Alias);
    expect(res1.outcome).toBe('noop');

    // Attempting to Play Next an alias of t2 moves t2 to next position
    const t3 = makeTrack('track-3', 'Track 3');
    const queue3 = [t1, t3, t2];
    const t2Alias = makeTrack('alias-2-variant', 'Other Song');
    t2.aliases = ['alias-2-variant'];
    const res2 = applyPlayNext(queue3, t1, t2Alias);
    expect(res2.outcome).toBe('moved');
    expect(res2.nextQueue).toHaveLength(3);
    expect(res2.nextQueue[0].id).toBe(t1.id);
    expect(res2.nextQueue[1].id).toBe('alias-2-variant');
    expect(res2.nextQueue[2].id).toBe(t3.id);
  });
});
