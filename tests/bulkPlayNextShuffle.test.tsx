// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackItem } from '../src/types/music';
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
  load() {}
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  hasAttribute(name: string) {
    return name === 'src' ? Boolean(this.src) : false;
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

describe('Bulk Play Next Ordering with Shuffle & Queue Operations (Deterministic)', () => {
  const tA = makeTrack('A', 'Track A');
  const tB = makeTrack('B', 'Track B');
  const tC = makeTrack('C', 'Track C');
  const tD = makeTrack('D', 'Track D');
  const tE = makeTrack('E', 'Track E');
  const tF = makeTrack('F', 'Track F');
  const tG = makeTrack('G', 'Track G');

  let host: HTMLDivElement;
  let root: Root;
  let fakeAudio: FakeAudioElement;
  let nowMs: number;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.clear();
    nowMs = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
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

  function mountPlayer(props: Parameters<typeof useAudioPlayer>[0]) {
    let api!: ReturnType<typeof useAudioPlayer>;
    function Harness() {
      api = useAudioPlayer(props);
      return null;
    }
    act(() => root.render(<Harness />));
    return { get: () => api };
  }

  const endCurrentTrack = () => {
    fakeAudio.currentTime = 180;
    act(() => fakeAudio.dispatchEvent(new Event('ended')));
  };

  it('Shuffle ON: Bulk Play Next [B, C, D] plays A -> B -> C -> D consecutively via ended events, records history/playedIds, then resumes Shuffle without repeating B/C/D', () => {
    const rngSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const loadSpy = vi.spyOn(fakeAudio, 'load');
    const p = mountPlayer({ initialShuffle: true, initialRepeatMode: 'off' });

    act(() => p.get().playQueue([tA, tE, tF, tG], 0));
    expect(p.get().currentTrack?.id).toBe('A');
    fakeAudio.currentTime = 35;
    const loadsBefore = loadSpy.mock.calls.length;

    // Schedule [B, C, D] via Bulk Play Next -> A is NOT interrupted or reloaded
    act(() => { p.get().playNextBulk([tB, tC, tD]); });
    expect(p.get().currentTrack?.id).toBe('A');
    expect(fakeAudio.currentTime).toBe(35);
    expect(loadSpy.mock.calls.length).toBe(loadsBefore);
    expect(p.get().shuffle).toBe(true);
    expect(p.get().queue.map((t) => t.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);

    // Automatic transitions via native audio ended event play B -> C -> D consecutively
    endCurrentTrack();
    expect(p.get().currentTrack?.id).toBe('B');
    endCurrentTrack();
    expect(p.get().currentTrack?.id).toBe('C');
    endCurrentTrack();
    expect(p.get().currentTrack?.id).toBe('D');

    // After D finishes, Shuffle resumes on remaining unplayed tracks {E, F, G} (rng=0.99 picks G -> F -> E)
    endCurrentTrack();
    expect(p.get().currentTrack?.id).toBe('G');
    endCurrentTrack();
    expect(p.get().currentTrack?.id).toBe('F');
    endCurrentTrack();
    expect(p.get().currentTrack?.id).toBe('E');

    // Cycle exhausted with Repeat Off -> stops cleanly without repeating A/B/C/D
    endCurrentTrack();
    expect(p.get().currentTrack?.id).toBe('E');
    expect(p.get().isPlaying).toBe(false);

    // Previous follows actual listening history: E -> F -> G -> D -> C -> B -> A
    fakeAudio.currentTime = 1;
    for (const expectedId of ['F', 'G', 'D', 'C', 'B', 'A']) {
      act(() => p.get().prevTrack());
      expect(p.get().currentTrack?.id).toBe(expectedId);
    }
    expect(rngSpy).toHaveBeenCalled();
  });

  it('Shuffle OFF: Bulk Play Next [B, C, D] plays A -> B -> C -> D -> sequential E, F', () => {
    const p = mountPlayer({ initialShuffle: false, initialRepeatMode: 'off' });
    act(() => p.get().playQueue([tA, tE, tF], 0));
    act(() => { p.get().playNextBulk([tB, tC, tD]); });

    for (const expectedId of ['B', 'C', 'D', 'E', 'F']) {
      endCurrentTrack();
      expect(p.get().currentTrack?.id).toBe(expectedId);
    }
    endCurrentTrack();
    expect(p.get().isPlaying).toBe(false);
  });

  it('Repeated single & bulk Play Next requests preserve exact visible Queue order without discarding earlier scheduled items', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const p = mountPlayer({ initialShuffle: true, initialRepeatMode: 'off' });
    act(() => p.get().playQueue([tA, tF, tG], 0));

    // First bulk: [B, C] -> Queue [A, B, C, F, G]
    act(() => { p.get().playNextBulk([tB, tC]); });
    // Second bulk: [D, E] -> Queue [A, D, E, B, C, F, G]
    act(() => { p.get().playNextBulk([tD, tE]); });
    expect(p.get().queue.map((t) => t.id)).toEqual(['A', 'D', 'E', 'B', 'C', 'F', 'G']);

    for (const expectedId of ['D', 'E', 'B', 'C']) {
      endCurrentTrack();
      expect(p.get().currentTrack?.id).toBe(expectedId);
    }
  });

  it('Removing a pending item skips it safely; removing current track preserves remaining pending batch', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const p = mountPlayer({ initialShuffle: true, initialRepeatMode: 'off' });
    act(() => p.get().playQueue([tA, tE, tF], 0));
    act(() => { p.get().playNextBulk([tB, tC, tD]); });
    // Queue: [A, B, C, D, E, F]

    // Remove pending C (index 2)
    act(() => p.get().removeFromQueue(2));
    expect(p.get().queue.map((t) => t.id)).toEqual(['A', 'B', 'D', 'E', 'F']);

    // Remove currently playing A (index 0) -> auto-selects B and preserves pending D!
    act(() => p.get().removeFromQueue(0));
    expect(p.get().currentTrack?.id).toBe('B');

    // Next MUST play D (skipping removed C) before resuming Shuffle on {E, F}
    endCurrentTrack();
    expect(p.get().currentTrack?.id).toBe('D');
    endCurrentTrack();
    expect(p.get().currentTrack?.id).toBe('F');
  });

  it('Play All, Queue replacement, Clear Queue, and manual Queue-row selection clear obsolete pending priorities', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const p = mountPlayer({ initialShuffle: true, initialRepeatMode: 'off' });
    act(() => p.get().playQueue([tA, tE, tF], 0));
    act(() => { p.get().playNextBulk([tB, tC]); });

    // 1. Manual Queue-row click clears obsolete pending [B, C]
    nowMs += 1000;
    act(() => p.get().playQueueTrack(tE));
    expect(p.get().currentTrack?.id).toBe('E');
    // Next uses normal Shuffle (rng=0 picks B only because B is index 1, so set rng=0.99 -> F!)
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    endCurrentTrack();
    expect(p.get().currentTrack?.id).toBe('F');

    // 2. Play All clears pending batch
    act(() => { p.get().playNextBulk([tB, tC]); });
    nowMs += 1000;
    act(() => p.get().playQueue([tD, tE, tG], 0));
    expect(p.get().currentTrack?.id).toBe('D');
    endCurrentTrack();
    expect(p.get().currentTrack?.id).toBe('G');

    // 3. clearQueue clears pending batch
    act(() => { p.get().playNextBulk([tB, tC]); });
    act(() => p.get().clearQueue());
    expect(p.get().queue.map((t) => t.id)).toEqual(['G']);
    endCurrentTrack();
    expect(p.get().currentTrack?.id).toBe('G');
    expect(p.get().isPlaying).toBe(false);
  });

  it('Toggling Shuffle ON -> OFF and OFF -> ON mid-batch preserves priority order; Repeat One & Repeat All stay compatible', () => {
    const p = mountPlayer({ initialShuffle: true, initialRepeatMode: 'off' });
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    act(() => p.get().playQueue([tA, tE, tF], 0));
    act(() => { p.get().playNextBulk([tB, tC, tD]); });

    // Advance to B, then toggle Shuffle ON -> OFF mid-batch -> C, D still play in order, then sequential E
    endCurrentTrack();
    expect(p.get().currentTrack?.id).toBe('B');
    act(() => p.get().toggleShuffle());
    expect(p.get().shuffle).toBe(false);
    endCurrentTrack();
    expect(p.get().currentTrack?.id).toBe('C');

    // Toggle Shuffle OFF -> ON mid-batch -> D still plays next, then Shuffle resumes!
    act(() => p.get().toggleShuffle());
    expect(p.get().shuffle).toBe(true);
    endCurrentTrack();
    expect(p.get().currentTrack?.id).toBe('D');

    // Repeat One repeats D on ended, while manual Next still advances cleanly
    act(() => p.get().cycleRepeatMode()); // off -> all
    act(() => p.get().cycleRepeatMode()); // all -> one
    expect(p.get().repeatMode).toBe('one');
    endCurrentTrack();
    expect(p.get().currentTrack?.id).toBe('D');
    expect(fakeAudio.currentTime).toBe(0);
  });
});
