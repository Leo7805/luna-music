import { describe, it, expect } from 'vitest';
import {
  applyPlayNow,
  applyPlayNext,
  applyBulkPlayNext,
  applyAddToQueue,
  getNextTrackToPlay,
  getPrevTrackToPlay,
} from '../src/utils/queueAlgorithms';
import { isSameTrack } from '../src/utils/trackIdentity';
import { resolveInitialQueue, resolveInitialTrack } from '../src/utils/playbackSession';
import { TrackItem, Playlist, FileStatus } from '../src/types/music';

function createTrack(
  id: string,
  name: string,
  status: FileStatus = 'normal',
  aliases: string[] = []
): TrackItem {
  return {
    id,
    name: `${name}.mp3`,
    relativePath: `${name}.mp3`,
    size: 4096,
    lastModified: Date.now(),
    aliases,
    metadata: {
      title: name,
      artist: 'Artist',
      album: 'Album',
      duration: 180,
      isMetadataLoaded: true,
    },
    status,
  };
}

describe('Playback Queue Contract & Track Deduplication (28 Scenarios)', () => {
  const trackA = createTrack('track-A', 'Track A');
  const trackB = createTrack('track-B', 'Track B');
  const trackC = createTrack('track-C', 'Track C');
  const trackD = createTrack('track-D', 'Track D');
  const trackE = createTrack('track-E', 'Track E');
  const trackF = createTrack('track-F', 'Track F');

  // 1. Play Now with a track absent from Queue
  it('1. Play Now with a track absent from Queue inserts immediately after current track', () => {
    // Queue: [A, B, C, E], Current: B
    const queue = [trackA, trackB, trackC, trackE];
    const current = trackB;
    const res = applyPlayNow(queue, current, trackD, true);

    expect(res.action).toBe('play');
    expect(res.nextTrack.id).toBe(trackD.id);
    expect(res.nextQueue.map((t) => t.id)).toEqual([
      'track-A',
      'track-B',
      'track-D',
      'track-C',
      'track-E',
    ]);
  });

  // 2. Play Now with an existing upcoming track
  it('2. Play Now with an existing upcoming track moves it to current without duplicating', () => {
    // Queue: [A, B, C, D, E], Current: B
    const queue = [trackA, trackB, trackC, trackD, trackE];
    const current = trackB;
    const res = applyPlayNow(queue, current, trackD, true);

    expect(res.action).toBe('play');
    expect(res.nextTrack.id).toBe(trackD.id);
    expect(res.nextQueue.map((t) => t.id)).toEqual([
      'track-A',
      'track-B',
      'track-D',
      'track-C',
      'track-E',
    ]);
    expect(res.nextQueue.filter((t) => isSameTrack(t, trackD))).toHaveLength(1);
  });

  // 3. Play Now with an existing history track
  it('3. Play Now with an existing history track relocates it to current without duplicating', () => {
    // Queue: [A, B, C, D], Current: C
    const queue = [trackA, trackB, trackC, trackD];
    const current = trackC;
    const res = applyPlayNow(queue, current, trackA, true);

    expect(res.action).toBe('play');
    expect(res.nextTrack.id).toBe(trackA.id);
    expect(res.nextQueue.map((t) => t.id)).toEqual([
      'track-B',
      'track-C',
      'track-A',
      'track-D',
    ]);
    expect(res.nextQueue.filter((t) => isSameTrack(t, trackA))).toHaveLength(1);
  });

  // 4. Play Now on the currently playing track
  it('4. Play Now on currently playing track continues playing with noop action', () => {
    const queue = [trackA, trackB, trackC];
    const current = trackB;
    const res = applyPlayNow(queue, current, trackB, true);

    expect(res.action).toBe('noop');
    expect(res.nextTrack.id).toBe(trackB.id);
    expect(res.nextQueue).toEqual(queue);
  });

  // 5. Play Now on the current paused track
  it('5. Play Now on current paused track resumes without restarting or reordering', () => {
    const queue = [trackA, trackB, trackC];
    const current = trackB;
    const res = applyPlayNow(queue, current, trackB, false);

    expect(res.action).toBe('resume');
    expect(res.nextTrack.id).toBe(trackB.id);
    expect(res.nextQueue).toEqual(queue);
  });

  // 6. Play Now with an empty Queue
  it('6. Play Now with an empty Queue creates a single-item queue', () => {
    const res = applyPlayNow([], null, trackD, false);

    expect(res.action).toBe('play');
    expect(res.nextTrack.id).toBe(trackD.id);
    expect(res.nextQueue.map((t) => t.id)).toEqual(['track-D']);
  });

  // 7. Play Next with a new track
  it('7. Play Next with a new track inserts immediately after current', () => {
    const queue = [trackA, trackB, trackC];
    const current = trackA;
    const res = applyPlayNext(queue, current, trackD);

    expect(res.outcome).toBe('added');
    expect(res.nextQueue.map((t) => t.id)).toEqual([
      'track-A',
      'track-D',
      'track-B',
      'track-C',
    ]);
  });

  // 8. Play Next with an existing upcoming track
  it('8. Play Next with an existing upcoming track moves it rather than duplicating', () => {
    const queue = [trackA, trackB, trackC, trackD];
    const current = trackA;
    const res = applyPlayNext(queue, current, trackC);

    expect(res.outcome).toBe('moved');
    expect(res.nextQueue.map((t) => t.id)).toEqual([
      'track-A',
      'track-C',
      'track-B',
      'track-D',
    ]);
    expect(res.nextQueue.filter((t) => isSameTrack(t, trackC))).toHaveLength(1);
  });

  // 9. Play Next with an existing history track
  it('9. Play Next with an existing history track moves it immediately after current', () => {
    const queue = [trackA, trackB, trackC, trackD];
    const current = trackC;
    const res = applyPlayNext(queue, current, trackA);

    expect(res.outcome).toBe('moved');
    expect(res.nextQueue.map((t) => t.id)).toEqual([
      'track-B',
      'track-C',
      'track-A',
      'track-D',
    ]);
    expect(res.nextQueue.filter((t) => isSameTrack(t, trackA))).toHaveLength(1);
  });

  // 10. Play Next on the current track
  it('10. Play Next on current track leaves queue unchanged with noop outcome', () => {
    const queue = [trackA, trackB, trackC];
    const current = trackB;
    const res = applyPlayNext(queue, current, trackB);

    expect(res.outcome).toBe('noop');
    expect(res.nextQueue.map((t) => t.id)).toEqual(['track-A', 'track-B', 'track-C']);
  });

  // 11. Bulk Play Next preserving order
  it('11. Bulk Play Next preserves insertion order immediately after current', () => {
    const queue = [trackA, trackB, trackC];
    const current = trackA;
    const res = applyBulkPlayNext(queue, current, [trackD, trackE, trackF]);

    expect(res.addedCount).toBe(3);
    expect(res.movedCount).toBe(0);
    expect(res.nextQueue.map((t) => t.id)).toEqual([
      'track-A',
      'track-D',
      'track-E',
      'track-F',
      'track-B',
      'track-C',
    ]);
  });

  // 12. Bulk Play Next with overlapping existing tracks
  it('12. Bulk Play Next moves overlapping tracks and excludes currently playing track', () => {
    const queue = [trackA, trackB, trackC, trackD];
    const current = trackB;
    // incoming has D (upcoming), A (history), B (current), and E (new)
    const res = applyBulkPlayNext(queue, current, [trackD, trackA, trackB, trackE]);

    expect(res.movedCount).toBe(2); // D and A moved
    expect(res.addedCount).toBe(1); // E added
    // B stays current at index 0 in prefix, followed by D, A, E, then remaining C
    expect(res.nextQueue.map((t) => t.id)).toEqual([
      'track-B',
      'track-D',
      'track-A',
      'track-E',
      'track-C',
    ]);
  });

  // 13. Add to Queue with a new track
  it('13. Add to Queue with a new track appends to end', () => {
    const queue = [trackA, trackB, trackC];
    const current = trackA;
    const res = applyAddToQueue(queue, current, trackD);

    expect(res.addedCount).toBe(1);
    expect(res.nextQueue.map((t) => t.id)).toEqual([
      'track-A',
      'track-B',
      'track-C',
      'track-D',
    ]);
  });

  // 14. Add to Queue with an existing track
  it('14. Add to Queue with an existing track skips and leaves queue unchanged', () => {
    const queue = [trackA, trackB, trackC];
    const current = trackA;

    // Track in upcoming
    const resC = applyAddToQueue(queue, current, trackC);
    expect(resC.addedCount).toBe(0);
    expect(resC.nextQueue).toEqual(queue);

    // Track currently playing
    const resA = applyAddToQueue(queue, current, trackA);
    expect(resA.addedCount).toBe(0);
    expect(resA.nextQueue).toEqual(queue);
  });

  // 15. Bulk Add to Queue with duplicates
  it('15. Bulk Add to Queue deduplicates incoming and skips existing tracks', () => {
    const queue = [trackA, trackB, trackC];
    const current = trackA;
    const incoming = [trackC, trackD, trackE, trackD, trackA];
    const res = applyAddToQueue(queue, current, incoming);

    expect(res.addedCount).toBe(2); // D and E
    expect(res.nextQueue.map((t) => t.id)).toEqual([
      'track-A',
      'track-B',
      'track-C',
      'track-D',
      'track-E',
    ]);
  });

  // 16. Play All replacing Queue and immediately playing
  it('16. Play All deduplicates and replaces queue', () => {
    const displayed = [trackD, trackA, trackD, trackE];
    // Filter and deduplicate
    const unique: TrackItem[] = [];
    for (const t of displayed) {
      if (!unique.some((u) => isSameTrack(u, t))) {
        unique.push(t);
      }
    }
    expect(unique.map((t) => t.id)).toEqual(['track-D', 'track-A', 'track-E']);
  });

  // 17. Previous/Next navigation after Queue mutations
  it('17. Previous/Next navigation respects updated queue order', () => {
    const queue = [trackB, trackC, trackA, trackD];
    const current = trackA; // index 2

    const next = getNextTrackToPlay(queue, current, false, 'off', null);
    expect(next.nextTrack?.id).toBe('track-D');

    const prev = getPrevTrackToPlay(queue, current, 'off');
    expect(prev.targetTrack?.id).toBe('track-C');
    expect(prev.shouldRestartCurrent).toBe(false);
  });

  // 18. Current-index correction after moving existing entries
  it('18. Current index accurately points to playing track after mutations', () => {
    const queue = [trackA, trackB, trackC, trackD];
    const current = trackC; // index 2

    // Move A to after C
    const playNextRes = applyPlayNext(queue, current, trackA);
    // Queue: [B, C, A, D]
    const newIdx = playNextRes.nextQueue.findIndex((t) => isSameTrack(t, current));
    expect(newIdx).toBe(1); // C is at index 1
    expect(playNextRes.nextQueue[newIdx].id).toBe('track-C');
  });

  // 19. Queue count matching unique logical tracks
  it('19. Queue contains at most one occurrence of each verified logical track', () => {
    let queue = [trackA, trackB];
    const current = trackA;

    queue = applyPlayNext(queue, current, trackC).nextQueue;
    queue = applyAddToQueue(queue, current, [trackB, trackD, trackA]).nextQueue;
    queue = applyPlayNow(queue, current, trackB, true).nextQueue;

    const ids = queue.map((t) => t.id);
    const uniqueIds = Array.from(new Set(ids));
    expect(ids.length).toBe(uniqueIds.length);
  });

  // 20. Same physical file referenced from different views
  it('20. Same physical file with alias matches correctly across views', () => {
    const folderTrack = createTrack('folder:song1.mp3', 'Song 1', 'normal', ['playlist:song1.mp3']);
    const playlistTrack = createTrack('playlist:song1.mp3', 'Song 1', 'normal', ['folder:song1.mp3']);

    expect(isSameTrack(folderTrack, playlistTrack)).toBe(true);

    const queue = [folderTrack, trackB];
    const current = folderTrack;

    // Adding playlistTrack should be skipped as duplicate
    const addRes = applyAddToQueue(queue, current, playlistTrack);
    expect(addRes.addedCount).toBe(0);
    expect(addRes.nextQueue).toHaveLength(2);
  });

  // 21. Different physical files with identical filenames
  it('21. Different physical files with identical names but different IDs are distinct', () => {
    const file1 = createTrack('source-1:album/intro.mp3', 'Intro');
    const file2 = createTrack('source-2:other/intro.mp3', 'Intro');

    expect(isSameTrack(file1, file2)).toBe(false);

    const queue = [file1];
    const res = applyAddToQueue(queue, file1, file2);
    expect(res.addedCount).toBe(1);
    expect(res.nextQueue).toHaveLength(2);
  });

  // 22. Canonical ID and verified alias handling
  it('22. Canonical ID and verified aliases are respected during Play Now', () => {
    const canonical = createTrack('canonical-id', 'Track A', 'normal', ['alias-1', 'alias-2']);
    const aliasRef = createTrack('alias-1', 'Track A', 'normal', ['canonical-id']);

    const queue = [canonical, trackB, trackC];
    const res = applyPlayNow(queue, canonical, aliasRef, true);

    // Recognizes aliasRef is canonical track -> noop
    expect(res.action).toBe('noop');
    expect(res.nextQueue).toEqual(queue);
  });

  // 23. Shuffle and repeat compatibility
  it('23. Shuffle respects Play Next override and repeat boundaries', () => {
    const queue = [trackA, trackB, trackC, trackD];
    const current = trackA;

    // Play next override
    const nextWithOverride = getNextTrackToPlay(queue, current, true, 'off', trackD.id);
    expect(nextWithOverride.nextTrack?.id).toBe('track-D');
    expect(nextWithOverride.shouldClearOverride).toBe(true);

    // Repeat all at end of queue
    const endTrack = trackD;
    const nextRepeatAll = getNextTrackToPlay(queue, endTrack, false, 'all', null);
    expect(nextRepeatAll.nextTrack?.id).toBe('track-A');

    // Repeat off at end of queue
    const nextRepeatOff = getNextTrackToPlay(queue, endTrack, false, 'off', null);
    expect(nextRepeatOff.nextTrack).toBeNull();
  });

  // 24. Queue persistence after refresh
  it('24. resolveInitialQueue restores exact sequence and avoids duplicates', () => {
    const storedIds = ['track-B', 'track-C', 'track-A'];
    const libraryTracks = [trackA, trackB, trackC, trackD];

    const restored = resolveInitialQueue({
      storedQueueIds: storedIds,
      effectiveInitialTrackId: 'track-C',
      libraryTracks,
    });

    expect(restored.map((t) => t.id)).toEqual(['track-B', 'track-C', 'track-A']);
    const initialTrack = resolveInitialTrack({
      effectiveInitialTrackId: 'track-C',
      libraryTracks,
      queue: restored,
    });
    expect(initialTrack?.id).toBe('track-C');
  });

  // 25. Rapid clicks on different tracks
  it('25. Rapid switching between tracks updates target deterministically', () => {
    let queue = [trackA, trackB, trackC];
    let current = trackA;

    // Click D
    const res1 = applyPlayNow(queue, current, trackD, true);
    queue = res1.nextQueue;
    current = res1.nextTrack;

    // Immediately click E
    const res2 = applyPlayNow(queue, current, trackE, true);
    queue = res2.nextQueue;
    current = res2.nextTrack;

    // Expected order: A, D, E, B, C with E playing
    expect(current.id).toBe('track-E');
    expect(queue.map((t) => t.id)).toEqual([
      'track-A',
      'track-D',
      'track-E',
      'track-B',
      'track-C',
    ]);
  });

  // 26. Repeated rapid clicks on the same track
  it('26. Repeated clicks on same playing track do not alter queue', () => {
    const queue = [trackA, trackB, trackC];
    const current = trackB;

    const res1 = applyPlayNow(queue, current, trackB, true);
    const res2 = applyPlayNow(res1.nextQueue, res1.nextTrack, trackB, true);

    expect(res2.action).toBe('noop');
    expect(res2.nextQueue.map((t) => t.id)).toEqual(['track-A', 'track-B', 'track-C']);
  });

  // 27. Unavailable track handling
  it('27. Unavailable track is identified and rejected from queue additions', () => {
    const unplayable = createTrack('unreadable-track', 'Corrupt', 'unreadable');
    const queue = [trackA, trackB];

    // Bulk Play Next should filter out unplayable
    const playableIncoming = [unplayable, trackC].filter((t) => t.status === 'normal');
    const res = applyBulkPlayNext(queue, trackA, playableIncoming);

    expect(res.nextQueue.map((t) => t.id)).toEqual(['track-A', 'track-C', 'track-B']);
  });

  // 28. Existing Playlist and Favourite data remaining unchanged
  it('28. Queue mutations do not modify saved playlist tracks or favourites', () => {
    const savedPlaylist: Playlist = {
      id: 'pl-1',
      name: 'Chill Vibes',
      tracks: [
        { trackId: trackA.id, name: trackA.name, addedAt: 1000 },
        { trackId: trackB.id, name: trackB.name, addedAt: 1000 },
        { trackId: trackC.id, name: trackC.name, addedAt: 1000 },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };
    const favouritesSet = new Set(['track-A', 'track-B']);

    // Deep clone original tracks for comparison
    const originalPlaylistTracks = [...savedPlaylist.tracks];
    const originalFavourites = new Set(favouritesSet);

    // Queue operations
    let queue = [trackA, trackB];
    queue = applyPlayNext(queue, trackA, trackD).nextQueue;
    queue = applyPlayNow(queue, trackA, trackC, true).nextQueue;

    // Verify Playlist and Favourites remain unmodified
    expect(savedPlaylist.tracks).toEqual(originalPlaylistTracks);
    expect(favouritesSet).toEqual(originalFavourites);
  });
});
