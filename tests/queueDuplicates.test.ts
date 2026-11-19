import { describe, it, expect } from 'vitest';
import {
  isSameTrack,
  isInUpcomingQueue,
  applyPlayNext,
  applyAddToQueue,
  getNextTrackToPlay,
} from '../src/utils/musicTree';
import { TrackItem } from '../src/types/music';

function makeTrack(id: string, name: string, aliases: string[] = []): TrackItem {
  return {
    id,
    name: `${name}.mp3`,
    relativePath: `${name}.mp3`,
    size: 2048,
    lastModified: 1000,
    aliases,
    metadata: {
      title: name,
      artist: 'Artist',
      album: 'Album',
      duration: 200,
      isMetadataLoaded: true,
    },
    status: 'normal',
  };
}

describe('Playback Queue Duplicate Prevention & Play Next Handling', () => {
  const trackA = makeTrack('track-A', 'Track A');
  const trackB = makeTrack('track-B', 'Track B');
  const trackC = makeTrack('track-C', 'Track C');
  const trackD = makeTrack('track-D', 'Track D');
  const trackE = makeTrack('track-E', 'Track E');
  const trackF = makeTrack('track-F', 'Track F');

  // 1. Play Next on a track not in the queue
  it('1. Play Next on a track not in the queue inserts immediately after currently playing track', () => {
    const queue = [trackA, trackB, trackC];
    const currentTrack = trackB; // index 1
    const newTrack = trackD;

    const { nextQueue, outcome } = applyPlayNext(queue, currentTrack, newTrack);

    expect(outcome).toBe('added');
    // Result should place D immediately after B: [A, B, D, C]
    expect(nextQueue.map((t) => t.id)).toEqual(['track-A', 'track-B', 'track-D', 'track-C']);
    // Unrelated tracks preserve relative order
    expect(nextQueue[0].id).toBe('track-A');
    expect(nextQueue[1].id).toBe('track-B');
    expect(nextQueue[3].id).toBe('track-C');
  });

  // 2. Play Next on a track already in the upcoming queue
  it('2. Play Next on a track already in the upcoming queue moves existing occurrence without creating a duplicate', () => {
    const queue = [trackA, trackB, trackC, trackD, trackE];
    const currentTrack = trackB; // index 1, upcoming is [C, D, E]

    const { nextQueue, outcome } = applyPlayNext(queue, currentTrack, trackD);

    expect(outcome).toBe('moved');
    // Track D should be moved from index 3 to index 2 (immediately after B)
    expect(nextQueue.map((t) => t.id)).toEqual([
      'track-A',
      'track-B',
      'track-D',
      'track-C',
      'track-E',
    ]);
    // Exactly one occurrence of D exists in the entire queue
    const dOccurrences = nextQueue.filter((t) => isSameTrack(t, trackD));
    expect(dOccurrences).toHaveLength(1);
    // Relative order of unrelated upcoming tracks [C, E] is preserved
    expect(nextQueue[3].id).toBe('track-C');
    expect(nextQueue[4].id).toBe('track-E');
  });

  // 3. Play Next on a track appearing multiple times
  it('3. Play Next on a track appearing multiple times consolidates them into a single occurrence', () => {
    // Upcoming queue has two occurrences of track D
    const queue = [trackA, trackB, trackC, trackD, trackE, trackD, trackF];
    const currentTrack = trackB; // index 1

    const { nextQueue, outcome } = applyPlayNext(queue, currentTrack, trackD);

    expect(outcome).toBe('moved');
    // All duplicate occurrences of D in upcoming are consolidated into one right after B
    expect(nextQueue.map((t) => t.id)).toEqual([
      'track-A',
      'track-B',
      'track-D',
      'track-C',
      'track-E',
      'track-F',
    ]);
    const dOccurrences = nextQueue.filter((t) => isSameTrack(t, trackD));
    expect(dOccurrences).toHaveLength(1);
    // Unrelated tracks preserve order [C, E, F]
    expect(nextQueue.slice(3).map((t) => t.id)).toEqual(['track-C', 'track-E', 'track-F']);
  });

  // 4. Play Next on the currently playing track
  it('4. Play Next on the currently playing track allows one additional occurrence immediately after it', () => {
    const queue = [trackA, trackB, trackC];
    const currentTrack = trackB;

    const { nextQueue, outcome } = applyPlayNext(queue, currentTrack, trackB);

    expect(outcome).toBe('added');
    // Should result in [A, B, B, C]
    expect(nextQueue.map((t) => t.id)).toEqual([
      'track-A',
      'track-B',
      'track-B',
      'track-C',
    ]);

    // If B is playing AND already also in upcoming queue: [A, B, C, B, D]
    const queueWithUpcomingB = [trackA, trackB, trackC, trackB, trackD];
    const result2 = applyPlayNext(queueWithUpcomingB, trackB, trackB);
    expect(result2.outcome).toBe('moved');
    // Consolidated upcoming B to immediately after current track: [A, B, B, C, D]
    expect(result2.nextQueue.map((t) => t.id)).toEqual([
      'track-A',
      'track-B',
      'track-B',
      'track-C',
      'track-D',
    ]);
    expect(result2.nextQueue.filter((t) => isSameTrack(t, trackB))).toHaveLength(2);
  });

  // 5. Add to Queue on an existing upcoming track
  it('5. Add to Queue on an existing upcoming track prevents appending duplicates and reports feedback', () => {
    const queue = [trackA, trackB, trackC, trackD];
    const currentTrack = trackB; // Upcoming is [C, D]

    // Track C is already in upcoming queue
    expect(isInUpcomingQueue(trackC, queue, currentTrack)).toBe(true);
    const resultC = applyAddToQueue(queue, currentTrack, trackC);
    expect(resultC.addedCount).toBe(0);
    expect(resultC.nextQueue).toEqual(queue); // No change

    // Track E is NOT in upcoming queue
    expect(isInUpcomingQueue(trackE, queue, currentTrack)).toBe(false);
    const resultE = applyAddToQueue(queue, currentTrack, trackE);
    expect(resultE.addedCount).toBe(1);
    expect(resultE.nextQueue.map((t) => t.id)).toEqual([
      'track-A',
      'track-B',
      'track-C',
      'track-D',
      'track-E',
    ]);

    // Adding currently playing track B when B is not yet in upcoming queue appends to end
    const resultB = applyAddToQueue(queue, currentTrack, trackB);
    expect(resultB.addedCount).toBe(1);
    expect(resultB.nextQueue.map((t) => t.id)).toEqual([
      'track-A',
      'track-B',
      'track-C',
      'track-D',
      'track-B',
    ]);
    // The currently playing track B at index 1 is not modified
    expect(resultB.nextQueue[1].id).toBe('track-B');
  });

  // 6. Alias-equivalent tracks
  it('6. correctly compares logical identity of alias-equivalent tracks without relying on metadata', () => {
    const parentTrack = makeTrack('parent-root/song.mp3', 'Song Title', ['child-root/song.mp3']);
    const childTrack = makeTrack('child-root/song.mp3', 'Different Filename Format', ['parent-root/song.mp3']);

    // Direct alias equivalence
    expect(isSameTrack(parentTrack, childTrack)).toBe(true);

    const queue = [trackA, parentTrack, trackC];
    const currentTrack = trackA;

    // Add to Queue using childTrack when parentTrack is already in upcoming queue
    const addResult = applyAddToQueue(queue, currentTrack, childTrack);
    expect(addResult.addedCount).toBe(0);
    expect(addResult.nextQueue).toHaveLength(3);

    // Play Next using childTrack moves the existing parentTrack occurrence
    const playNextResult = applyPlayNext(queue, currentTrack, childTrack);
    expect(playNextResult.outcome).toBe('moved');
    // Placed right after A
    expect(playNextResult.nextQueue.map((t) => t.id)).toEqual([
      'track-A',
      'child-root/song.mp3',
      'track-C',
    ]);
    // Does not create another copy
    expect(playNextResult.nextQueue).toHaveLength(3);
  });

  // 7. Shuffle + Play Next
  it('7. Play Next overrides shuffle ordering for the next track and then resumes shuffle', () => {
    const queue = [trackA, trackB, trackC, trackD, trackE];
    const currentTrack = trackB;

    // User applies Play Next on track E
    const { nextQueue } = applyPlayNext(queue, currentTrack, trackE);
    // nextQueue is [A, B, E, C, D]
    const playNextTrackId = trackE.id;

    // While shuffle is ON, next track to play MUST be track E
    const firstNext = getNextTrackToPlay(nextQueue, currentTrack, true, 'off', playNextTrackId);
    expect(firstNext.nextTrack?.id).toBe('track-E');
    expect(firstNext.shouldClearOverride).toBe(true);

    // Once track E is playing, override is cleared (null), so next track uses normal shuffle
    const secondNext = getNextTrackToPlay(nextQueue, trackE, true, 'off', null);
    expect(secondNext.nextTrack).toBeDefined();
    // Cannot be track E itself (otherIndices filter)
    expect(secondNext.nextTrack?.id).not.toBe('track-E');
    expect(secondNext.shouldClearOverride).toBe(false);
  });

  // 8. Repeat + Play Next
  it('8. Play Next respects repeat mode boundaries', () => {
    // Scenario A: repeatMode = 'off' and playing the last track of queue
    const queue = [trackA, trackB];
    const currentTrack = trackB; // Last track

    // Without Play Next: next track is null (playback stops)
    const normalNext = getNextTrackToPlay(queue, currentTrack, false, 'off', null);
    expect(normalNext.nextTrack).toBeNull();

    // With Play Next on track C: next track is track C
    const { nextQueue } = applyPlayNext(queue, currentTrack, trackC);
    const nextWithPlayNext = getNextTrackToPlay(nextQueue, currentTrack, false, 'off', trackC.id);
    expect(nextWithPlayNext.nextTrack?.id).toBe('track-C');

    // Scenario B: repeatMode = 'all' loops back after Play Next finishes
    const loopNext = getNextTrackToPlay(nextQueue, trackC, false, 'all', null);
    expect(loopNext.nextTrack?.id).toBe('track-A'); // Loops to start of queue
  });

  // 9. Queue order and playback position preservation
  it('9. preserves currently playing track identity and index when rearranging queue', () => {
    const queue = [trackA, trackB, trackC, trackD, trackE];
    const currentTrack = trackC; // index 2
    const originalCurIdx = queue.findIndex((t) => isSameTrack(t, currentTrack));
    expect(originalCurIdx).toBe(2);

    // Action 1: Play Next on upcoming track E
    const step1 = applyPlayNext(queue, currentTrack, trackE);
    // Queue: [A, B, C, E, D]
    const step1CurIdx = step1.nextQueue.findIndex((t) => isSameTrack(t, currentTrack));
    expect(step1CurIdx).toBe(2); // Current track index is preserved!
    expect(step1.nextQueue[step1CurIdx].id).toBe('track-C');

    // Action 2: Add to Queue on track F
    const step2 = applyAddToQueue(step1.nextQueue, currentTrack, trackF);
    // Queue: [A, B, C, E, D, F]
    const step2CurIdx = step2.nextQueue.findIndex((t) => isSameTrack(t, currentTrack));
    expect(step2CurIdx).toBe(2); // Still unchanged!
    expect(step2.nextQueue[step2CurIdx].id).toBe('track-C');

    // Action 3: Play Next on track D
    const step3 = applyPlayNext(step2.nextQueue, currentTrack, trackD);
    // Queue: [A, B, C, D, E, F]
    const step3CurIdx = step3.nextQueue.findIndex((t) => isSameTrack(t, currentTrack));
    expect(step3CurIdx).toBe(2); // Still unchanged!
    expect(step3.nextQueue[step3CurIdx].id).toBe('track-C');
    expect(step3.nextQueue.map((t) => t.id)).toEqual([
      'track-A',
      'track-B',
      'track-C',
      'track-D',
      'track-E',
      'track-F',
    ]);
  });
});
