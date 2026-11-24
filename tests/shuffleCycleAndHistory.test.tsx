// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackItem } from '../src/types/music';
import { createShuffleState, pickNextShuffledTrack, resolvePlayQueueStartIndex } from '../src/utils/shufflePlayback';
import { usePlaybackQueue } from '../src/hooks/usePlaybackQueue';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';
import { FolderView } from '../src/components/FolderView';
import { AlbumsView } from '../src/components/AlbumsView';
import { ArtistsView } from '../src/components/ArtistsView';
import { PlaylistsView } from '../src/components/PlaylistsView';

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
    act(() => p.get().playQueue([t1, t2], 0));

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
    act(() => p.get().playQueue([t1, t2, t3], 0));

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

  it('Play All follows authoritative Shuffle mode, explicit startIndex starts deterministically, and mode toggles never interrupt playback', () => {
    // Pure helper contract: ordinary Play All (startIndex omitted) follows currentShuffle; explicit startIndex always wins
    expect(resolvePlayQueueStartIndex({ trackCount: 4, currentShuffle: false })).toBe(0);
    expect(resolvePlayQueueStartIndex({ trackCount: 4, currentShuffle: true, randomFn: () => 0.75 })).toBe(3);
    expect(resolvePlayQueueStartIndex({ trackCount: 4, currentShuffle: true, randomFn: () => 0 })).toBe(0);
    expect(resolvePlayQueueStartIndex({ trackCount: 4, startIndex: 2, currentShuffle: true, randomFn: () => 0 })).toBe(2);
    expect(resolvePlayQueueStartIndex({ trackCount: 4, startIndex: 2, currentShuffle: false })).toBe(2);

    // 1. Shuffle OFF + ordinary Play All -> always starts at index 0 (no hidden random override)
    let nowMs = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
    const pOff = mountPlayer({ initialShuffle: false, initialRepeatMode: 'off' });
    vi.spyOn(Math, 'random').mockReturnValue(0.75);
    act(() => pOff.get().playQueue([t1, t2, t3, t4]));
    expect(pOff.get().currentTrack?.id).toBe('t1');
    expect(pOff.get().shuffle).toBe(false);

    // Explicit startIndex while Shuffle OFF -> plays requested track then continues sequentially
    nowMs += 1000;
    act(() => pOff.get().playQueue([t1, t2, t3, t4], 2));
    expect(pOff.get().currentTrack?.id).toBe('t3');
    act(() => pOff.get().nextTrack());
    expect(pOff.get().currentTrack?.id).toBe('t4');

    // 2. Shuffle ON + ordinary Play All -> picks random eligible track (t3), keeps Queue order, records in cycle
    const pOn = mountPlayer({ initialShuffle: true, initialRepeatMode: 'off' });
    const rngSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5); // index 2 -> t3
    nowMs += 1000;
    act(() => pOn.get().playQueue([t1, t2, t3, t4]));
    expect(pOn.get().currentTrack?.id).toBe('t3');
    expect(pOn.get().queue.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4']);
    expect(pOn.get().shuffle).toBe(true);

    // Subsequent Next visits remaining unplayed tracks (t1, t2, t4) without repeating t3, then stops (Repeat Off)
    rngSpy.mockReturnValue(0);
    act(() => pOn.get().nextTrack());
    expect(pOn.get().currentTrack?.id).toBe('t1');
    act(() => pOn.get().nextTrack());
    expect(pOn.get().currentTrack?.id).toBe('t2');
    act(() => pOn.get().nextTrack());
    expect(pOn.get().currentTrack?.id).toBe('t4');
    act(() => pOn.get().nextTrack());
    expect(pOn.get().currentTrack?.id).toBe('t4'); // cycle exhausted

    // Clicking Play All again (>350ms later) starts a fresh cycle with a new random start (including index 0 candidate)
    rngSpy.mockReturnValue(0); // index 0 -> t1
    nowMs += 1000;
    act(() => pOn.get().playQueue([t1, t2, t3, t4]));
    expect(pOn.get().currentTrack?.id).toBe('t1');
    expect(pOn.get().shuffle).toBe(true);
    // Previous at start of fresh cycle must NOT jump to stale t4 from previous cycle
    fakeAudio.currentTime = 1;
    act(() => pOn.get().prevTrack());
    expect(pOn.get().currentTrack?.id).toBe('t1');

    // Explicit startIndex while Shuffle ON -> starts at requested index (t2), then continues via Shuffle
    nowMs += 1000;
    rngSpy.mockReturnValue(0.99);
    act(() => pOn.get().playQueue([t1, t2, t3, t4], 1));
    expect(pOn.get().currentTrack?.id).toBe('t2');
    act(() => pOn.get().nextTrack());
    expect(pOn.get().currentTrack?.id).toBe('t4');
  });

  it('toggling Shuffle ON -> OFF and OFF -> ON during playback never interrupts or reloads current track and immediately switches navigation mode', () => {
    let nowMs = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
    const p = mountPlayer({ initialShuffle: true, initialRepeatMode: 'off' });
    const rngSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const loadSpy = vi.spyOn(fakeAudio, 'load');

    // Start Queue [t1, t2, t3, t4, t5] anchored at t3 (index 2)
    act(() => p.get().playQueue([t1, t2, t3, t4, t5], 2));
    // Play t4 and t5 in Shuffle cycle, then return to t3 so t4/t5 were previously played in Shuffle
    nowMs += 1000;
    act(() => p.get().playQueueTrack(t4));
    nowMs += 1000;
    act(() => p.get().playQueueTrack(t3));
    fakeAudio.currentTime = 42;
    const loadsBefore = loadSpy.mock.calls.length;

    // Shuffle ON -> OFF: t3 stays playing at 42s with zero reload; Next follows visible Queue (t4 -> t5)
    act(() => p.get().toggleShuffle());
    expect(p.get().shuffle).toBe(false);
    expect(p.get().repeatMode).toBe('off');
    expect(p.get().currentTrack?.id).toBe('t3');
    expect(fakeAudio.currentTime).toBe(42);
    expect(loadSpy.mock.calls.length).toBe(loadsBefore);

    act(() => p.get().nextTrack());
    expect(p.get().currentTrack?.id).toBe('t4');
    act(() => p.get().nextTrack());
    expect(p.get().currentTrack?.id).toBe('t5');

    // Move back to t3 and toggle Shuffle OFF -> ON: t3 stays at 55s with zero reload, fresh cycle anchored at t3
    nowMs += 1000;
    act(() => p.get().playQueueTrack(t3));
    fakeAudio.currentTime = 55;
    const loadsBeforeOn = loadSpy.mock.calls.length;

    act(() => p.get().toggleShuffle());
    expect(p.get().shuffle).toBe(true);
    expect(p.get().repeatMode).toBe('off');
    expect(p.get().currentTrack?.id).toBe('t3');
    expect(fakeAudio.currentTime).toBe(55);
    expect(loadSpy.mock.calls.length).toBe(loadsBeforeOn);

    // Next picks randomly from {t1, t2, t4, t5} (never t3) and visits all 4 remaining tracks without repeating
    rngSpy.mockReturnValue(0);
    const visited = new Set<string>(['t3']);
    for (let i = 0; i < 4; i++) {
      act(() => p.get().nextTrack());
      expect(visited.has(p.get().currentTrack!.id)).toBe(false);
      visited.add(p.get().currentTrack!.id);
    }
    expect(visited.size).toBe(5);
  });

  it('all Library view Play All entry points (Folder, Album, Artist, Playlist) omit startIndex so playQueue follows active Shuffle', () => {
    const onPlayQueue = vi.fn();
    const onPlayPlaylist = vi.fn();
    const noop = () => {};
    const layout = ({ actions, content }: { actions: React.ReactNode; content: React.ReactNode }) => (
      <div><header>{actions}</header><section>{content}</section></div>
    );

    // FolderView Play All
    act(() => root.render(
      <FolderView
        currentNode={{ id: 'f1', name: 'F1', relativePath: 'f1', tracks: [t1, t2], subfolders: [], totalTrackCount: 2 }}
        isFolderOverview={false} isPlaying={false} favourites={new Set()} renderLayout={layout}
        onSelectFolder={noop} onPlayTrack={noop} onPlayQueue={onPlayQueue} onTogglePlay={noop} onToggleFavourite={noop}
      />
    ));
    act(() => host.querySelector<HTMLElement>('[data-testid="play-all-button"]')!.click());
    expect(onPlayQueue).toHaveBeenLastCalledWith([t1, t2]);

    // AlbumsView Play All
    act(() => root.render(
      <AlbumsView
        albums={[{ id: 'a1', name: 'Alb', artist: 'Art', tracks: [t1, t2], totalDuration: 360 }]}
        selectedAlbumId="a1" isPlaying={false} favourites={new Set()} renderLayout={layout}
        onSelectAlbum={noop} onPlayTrack={noop} onPlayQueue={onPlayQueue} onTogglePlay={noop} onToggleFavourite={noop}
      />
    ));
    act(() => host.querySelector<HTMLElement>('[data-testid="play-all-button"]')!.click());
    expect(onPlayQueue).toHaveBeenLastCalledWith([t1, t2]);

    // ArtistsView Play All
    act(() => root.render(
      <ArtistsView
        artists={[{ id: 'ar1', name: 'Art', tracks: [t1, t2], albumCount: 1, totalDuration: 360 }]}
        selectedArtistName="ar1" isPlaying={false} favourites={new Set()} renderLayout={layout}
        onSelectArtist={noop} onPlayTrack={noop} onPlayQueue={onPlayQueue} onTogglePlay={noop} onToggleFavourite={noop}
      />
    ));
    act(() => host.querySelector<HTMLElement>('[data-testid="play-all-button"]')!.click());
    expect(onPlayQueue).toHaveBeenLastCalledWith([t1, t2]);

    // PlaylistsView Play All (unfiltered -> onPlayPlaylist without startIndex)
    const pl = { id: 'p1', name: 'PL', tracks: [{ trackId: 't1', name: 'One.mp3', addedAt: 1 }, { trackId: 't2', name: 'Two.mp3', addedAt: 2 }], createdAt: 1, updatedAt: 1 };
    act(() => root.render(
      <PlaylistsView
        playlists={[pl]} selectedPlaylistId="p1" libraryTracks={[t1, t2]} isPlaying={false} favourites={new Set()}
        renderLayout={layout} onSelectPlaylist={noop} onCreatePlaylist={() => pl} onRenamePlaylist={noop}
        onDeletePlaylist={noop} onPlayPlaylist={onPlayPlaylist} onPlayQueue={onPlayQueue} onPlayTrack={noop}
        onTogglePlay={noop} onToggleFavourite={noop} onRemoveTrackFromPlaylist={noop} onReorderPlaylistTracks={noop}
      />
    ));
    act(() => host.querySelector<HTMLElement>('[data-testid="play-all-button"]')!.click());
    expect(onPlayPlaylist).toHaveBeenLastCalledWith(pl);
  });
});
