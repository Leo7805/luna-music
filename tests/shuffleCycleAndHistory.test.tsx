// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackItem } from '../src/types/music';
import { createShuffleState, pickNextShuffledTrack } from '../src/utils/shufflePlayback';
import { usePlaybackQueue } from '../src/hooks/usePlaybackQueue';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';

function makeTrack(id: string, title = id, overrides: Partial<TrackItem> = {}): TrackItem {
  return {
    id,
    name: `${title}.mp3`,
    relativePath: `Music/${title}.mp3`,
    size: 4096,
    lastModified: 1000,
    status: 'normal',
    file: new Blob(['audio'], { type: 'audio/mpeg' }) as unknown as File,
    metadata: { title, artist: 'Artist', album: 'Album', duration: 180, isMetadataLoaded: true },
    ...overrides,
  };
}

class FakeAudioElement extends EventTarget {
  src = '';
  preload = 'metadata';
  volume = 1;
  currentTime = 0;
  duration = 180;
  paused = true;
  readyState = 2;
  error: MediaError | null = null;
  private hasSrc = false;

  load() {}
  removeAttribute(name: string) {
    if (name === 'src') {
      this.src = '';
      this.hasSrc = false;
    }
  }
  hasAttribute(name: string) {
    return name === 'src' ? this.hasSrc || Boolean(this.src) : false;
  }
  play() {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
}

describe('Shuffle Cycle & Queue History Bug Fixes (Deterministic)', () => {
  const t1 = makeTrack('t1', 'One');
  const t2 = makeTrack('t2', 'Two');
  const t3 = makeTrack('t3', 'Three');
  const t4 = makeTrack('t4', 'Four');
  const t5 = makeTrack('t5', 'Five');

  let host: HTMLDivElement;
  let root: Root;
  let fakeAudio: FakeAudioElement;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.clear();
    fakeAudio = new FakeAudioElement();
    vi.stubGlobal(
      'Audio',
      vi.fn(function () {
        return fakeAudio;
      })
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-audio');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mountQueueHook(initialQueue: TrackItem[]) {
    let api!: ReturnType<typeof usePlaybackQueue>;
    function Harness() {
      api = usePlaybackQueue({ initialQueue });
      return null;
    }
    act(() => root.render(<Harness />));
    return { get: () => api };
  }

  function mountPlayer(props: Parameters<typeof useAudioPlayer>[0]) {
    let api!: ReturnType<typeof useAudioPlayer>;
    function Harness() {
      api = useAudioPlayer(props);
      return null;
    }
    act(() => root.render(<Harness />));
    return { get: () => api };
  }

  it('visits every eligible track once in Shuffle + Repeat Off, allows non-final visible row to end cycle, and keeps Queue order fixed', () => {
    const queue = [t1, t2, t3, t4];
    // Deterministic picks: start at t1 -> pick index 2 (t4) -> pick index 1 (t3) -> pick index 0 (t2, middle row!)
    const picks = [0.99, 0.99, 0.0];
    let pickIdx = 0;
    const rng = () => picks[pickIdx++] ?? 0;

    let state = createShuffleState(t1.id);
    const visited = [t1.id];
    let current: TrackItem = t1;

    for (let i = 0; i < 3; i++) {
      const res = pickNextShuffledTrack(state, queue, current, 'off', rng);
      expect(res.nextTrack).not.toBeNull();
      visited.push(res.nextTrack!.id);
      current = res.nextTrack!;
      state = res.nextState;
    }

    expect(visited).toEqual(['t1', 't4', 't3', 't2']);
    expect(new Set(visited).size).toBe(4);
    expect(current.id).toBe('t2'); // middle row of [t1, t2, t3, t4]
    expect(queue.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4']);

    // Exhausted -> stops cleanly
    const exhausted = pickNextShuffledTrack(state, queue, current, 'off', rng);
    expect(exhausted.nextTrack).toBeNull();

    // Repeat All -> starts fresh cycle without immediately repeating t2
    const nextCycle = pickNextShuffledTrack(state, queue, current, 'all', () => 0);
    expect(nextCycle.nextTrack?.id).toBe('t1');
    expect(nextCycle.nextTrack?.id).not.toBe(current.id);
  });

  it('Fix 1: resetShuffleCycle clears stale forward history so Next does not jump to an old branch', () => {
    const q = mountQueueHook([t1, t2, t3, t4]);
    const rngSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    // Build history t1 -> t4 -> t3, then step back to t4 (t3 is in forward branch)
    q.get().resetShuffleCycle(t1);
    q.get().recordPlayedTrack(t4, true);
    q.get().recordPlayedTrack(t3, true);
    expect(q.get().getPrevTrack(t3, 'off', true).targetTrack?.id).toBe('t4');

    // Start a fresh cycle anchored at t2 -> stale forward branch (t3) MUST be discarded
    q.get().resetShuffleCycle(t2);
    const next = q.get().getNextTrack(t2, true, 'off');
    expect(next?.id).toBe('t1'); // rng=0 picks first unplayed eligible track (t1), NOT stale forward t3!
    expect(rngSpy).toHaveBeenCalled();
  });

  it('Fix 2: playTrack(track, newQueue) replaces Queue and resets Shuffle state without carrying stale playedIds', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const p = mountPlayer({ initialShuffle: true, initialRepeatMode: 'off' });
    act(() => p.get().playQueue([t1, t2], 0, false));

    // Exhaust old queue [t1, t2]
    act(() => p.get().nextTrack());
    expect(p.get().currentTrack?.id).toBe('t2');
    act(() => p.get().nextTrack());
    expect(p.get().currentTrack?.id).toBe('t2'); // exhausted

    // Replace queue with [t1, t2, t3] anchored at t3 -> t1 and t2 must be unplayed in the new cycle!
    act(() => p.get().playTrack(t3, [t1, t2, t3], true));
    expect(p.get().currentTrack?.id).toBe('t3');
    expect(p.get().queue.map((t) => t.id)).toEqual(['t1', 't2', 't3']);

    act(() => p.get().nextTrack());
    expect(p.get().currentTrack?.id).toBe('t1');
    act(() => p.get().nextTrack());
    expect(p.get().currentTrack?.id).toBe('t2');
    // Now exhausted after playing all 3 tracks
    act(() => p.get().nextTrack());
    expect(p.get().currentTrack?.id).toBe('t2');
  });

  it('Fix 3: Previous at the start of Shuffle history restarts current track without falling back to sequential neighbor or losing forward history', () => {
    const q = mountQueueHook([t1, t2, t3, t4]);
    // Anchor Shuffle cycle at t3 (index 2 in visible Queue, so t2 is the sequential neighbor)
    q.get().resetShuffleCycle(t3);
    q.get().recordPlayedTrack(t4, true);

    // Step back from t4 -> t3 (now at history start, t4 is in forward branch)
    const back1 = q.get().getPrevTrack(t4, 'off', true);
    expect(back1).toEqual({ targetTrack: t3, shouldRestartCurrent: false });

    // Press Previous again at history start -> MUST NOT jump to sequential t2!
    const backAtStart = q.get().getPrevTrack(t3, 'off', true);
    expect(backAtStart).toEqual({ targetTrack: null, shouldRestartCurrent: true });

    // Forward history (t4) must still be intact when pressing Next
    const forward = q.get().getNextTrack(t3, true, 'off');
    expect(forward?.id).toBe('t4');

    // Sequential Previous with Shuffle OFF remains unchanged (t3 -> t2)
    const seqPrev = q.get().getPrevTrack(t3, 'off', false);
    expect(seqPrev.targetTrack?.id).toBe('t2');
  });

  it('Fix 4: clearQueue removes stale Shuffle state and Play Next override; removeFromQueue records replacement track and preserves unrelated cycle', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const q = mountQueueHook([t1, t2, t3]);
    q.get().resetShuffleCycle(t1);
    q.get().recordPlayedTrack(t2, true);
    q.get().playNext(t3, t2, () => {});

    // clearQueue removes Play Next override & stale history
    act(() => q.get().clearQueue(t2));
    expect(q.get().queueRef.current.map((t) => t.id)).toEqual(['t2']);
    expect(q.get().getPrevTrack(t2, 'off', true)).toEqual({ targetTrack: null, shouldRestartCurrent: true });

    // Re-add t1 and t3 -> both must be eligible in the fresh cycle
    act(() => { q.get().addToQueue([t1, t3], t2, () => {}); });
    expect(q.get().getNextTrack(t2, true, 'off')?.id).toBe('t1');
    expect(q.get().getNextTrack(t1, true, 'off')?.id).toBe('t3');
    expect(q.get().getNextTrack(t3, true, 'off')).toBeNull();
  });

  it('Fix 4 (player): removing current track records replacement track; removing unrelated track preserves active cycle; adding track mid-cycle makes it playable', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const p = mountPlayer({ initialShuffle: true, initialRepeatMode: 'off' });
    act(() => p.get().playQueue([t1, t2, t3], 0, false));

    // Remove unrelated track t3 -> active cycle continues with t2
    act(() => p.get().removeFromQueue(2));
    expect(p.get().queue.map((t) => t.id)).toEqual(['t1', 't2']);

    // Add t4 mid-cycle -> t2 and t4 are both eligible
    act(() => { p.get().addToQueue(t4); });
    expect(p.get().queue.map((t) => t.id)).toEqual(['t1', 't2', 't4']);

    // Remove current track t1 -> auto-transitions to t2 and records t2 as played
    act(() => p.get().removeFromQueue(0));
    expect(p.get().currentTrack?.id).toBe('t2');

    // Next plays t4, then exhausts (does not repeat t2)
    act(() => p.get().nextTrack());
    expect(p.get().currentTrack?.id).toBe('t4');
    act(() => p.get().nextTrack());
    expect(p.get().currentTrack?.id).toBe('t4');
  });

  it('Repeat One repeats current track on audio ended even with Shuffle ON, and direct Queue selection & session restore stay consistent', () => {
    localStorage.setItem(
      'luna_music_playback_state',
      JSON.stringify({ queueTrackIds: ['t1', 't2', 't3'], lastTrackId: 't2', shuffle: true, repeatMode: 'one' })
    );
    const p = mountPlayer({
      libraryTracks: [t1, t2, t3],
    });
    expect(p.get().queue.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(p.get().currentTrack?.id).toBe('t2');

    // Audio ended with Repeat One -> stays on t2 and restarts at 0
    fakeAudio.currentTime = 180;
    act(() => fakeAudio.dispatchEvent(new Event('ended')));
    expect(p.get().currentTrack?.id).toBe('t2');
    expect(fakeAudio.currentTime).toBe(0);

    // Direct Queue row click jumps to t3 without reordering Queue
    act(() => p.get().playQueueTrack(t3));
    expect(p.get().currentTrack?.id).toBe('t3');
    expect(p.get().queue.map((t) => t.id)).toEqual(['t1', 't2', 't3']);

    // Previous returns to t2 in listening history
    fakeAudio.currentTime = 1;
    act(() => p.get().prevTrack());
    expect(p.get().currentTrack?.id).toBe('t2');
  });

  it('documents bulk Play Next + Shuffle: preserves Play Next priority for first item while keeping sequential mode unchanged', () => {
    const q = mountQueueHook([t1, t2, t3, t4, t5]);
    q.get().resetShuffleCycle(t1);
    act(() => { q.get().playNextBulk([t4, t5], t1, () => {}); });
    expect(q.get().getNextTrack(t1, true, 'off')?.id).toBe('t4');

    // Sequential mode (Shuffle OFF) plays strictly in visible order
    const seq = mountQueueHook([t1, t2, t3]);
    expect(seq.get().getNextTrack(t1, false, 'off')?.id).toBe('t2');
    expect(seq.get().getNextTrack(t2, false, 'off')?.id).toBe('t3');
    expect(seq.get().getNextTrack(t3, false, 'off')).toBeNull();
  });
});
