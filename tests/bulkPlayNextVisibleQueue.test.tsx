// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackItem } from '../src/types/music';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';
import { TrackList } from '../src/components/TrackList';
import { NowPlayingView } from '../src/components/NowPlayingView';
import { applyBulkPlayNext } from '../src/utils/queueAlgorithms';

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

describe('Bulk Play Next — Visible Now Playing Queue & Playback Order Synchronization', () => {
  const tA = makeTrack('A', 'Track A');
  const tB = makeTrack('B', 'Track B');
  const tC = makeTrack('C', 'Track C');
  const tD = makeTrack('D', 'Track D');
  const tE = makeTrack('E', 'Track E');
  const tF = makeTrack('F', 'Track F');
  const tG = makeTrack('G', 'Track G');
  const tX = makeTrack('X', 'Track X');
  const tY = makeTrack('Y', 'Track Y');

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

  function mountIntegratedApp(options: {
    libraryTracks: TrackItem[];
    initialShuffle?: boolean;
    initialRepeatMode?: 'off' | 'all' | 'one';
    omitPlayNextBulkProp?: boolean;
  }) {
    let playerApi!: ReturnType<typeof useAudioPlayer>;
    let setShowNowPlaying!: (open: boolean) => void;
    let setVisibleTracks!: (tracks: TrackItem[]) => void;

    function IntegratedHarness() {
      const [showNowPlaying, _setShowNowPlaying] = useState(false);
      const [visibleTracks, _setVisibleTracks] = useState(options.libraryTracks);
      setShowNowPlaying = _setShowNowPlaying;
      setVisibleTracks = _setVisibleTracks;

      const audioPlayer = useAudioPlayer({
        libraryTracks: options.libraryTracks,
        initialShuffle: options.initialShuffle ?? false,
        initialRepeatMode: options.initialRepeatMode ?? 'off',
      });
      playerApi = audioPlayer;

      return (
        <div>
          {!showNowPlaying ? (
            <TrackList
              tracks={visibleTracks}
              libraryTracks={options.libraryTracks}
              currentTrackId={audioPlayer.currentTrack?.id}
              isPlaying={audioPlayer.isPlaying}
              favourites={new Set()}
              onPlayTrack={audioPlayer.playTrack}
              onTogglePlay={audioPlayer.togglePlay}
              onToggleFavourite={() => {}}
              onPlayNext={audioPlayer.playNext}
              onPlayNextBulk={options.omitPlayNextBulkProp ? undefined : audioPlayer.playNextBulk}
              onAddToQueue={audioPlayer.addToQueue}
            />
          ) : (
            <NowPlayingView
              queue={audioPlayer.queue}
              currentTrack={audioPlayer.currentTrack}
              isPlaying={audioPlayer.isPlaying}
              playlists={[]}
              theme="dark"
              lightStyle="neutral"
              onPlayQueueTrack={audioPlayer.playQueueTrack}
              onPlayNext={audioPlayer.playNext}
              onRemoveFromQueue={audioPlayer.removeFromQueue}
              onRemoveTracksFromQueue={audioPlayer.removeTracksFromQueue}
              onSaveQueueAsPlaylist={() => {}}
              onSelectTheme={() => {}}
              onSelectLightStyle={() => {}}
              onOpenShortcutsModal={() => {}}
            />
          )}
        </div>
      );
    }

    act(() => root.render(<IntegratedHarness />));
    return {
      getPlayer: () => playerApi,
      openNowPlaying: () => act(() => setShowNowPlaying(true)),
      closeNowPlaying: () => act(() => setShowNowPlaying(false)),
      setVisibleTracks: (tracks: TrackItem[]) => act(() => setVisibleTracks(tracks)),
    };
  }

  function clickEl(selector: string) {
    const el = host.querySelector<HTMLElement>(selector);
    expect(el, `Expected element matching ${selector}`).not.toBeNull();
    act(() => {
      el!.click();
    });
  }

  function selectTracksInUI(ids: string[]) {
    clickEl('[data-testid="toggle-select-mode"]');
    for (const id of ids) {
      clickEl(`[data-testid="track-checkbox-${id}"]`);
    }
  }

  function getRenderedQueueTitles(): string[] {
    const rows = Array.from(host.querySelectorAll<HTMLElement>('[data-testid^="queue-row-"]'));
    return rows.map((row) => {
      const titleEl = row.querySelector<HTMLElement>('span[title]');
      return (titleEl?.textContent || '').trim();
    });
  }

  const endCurrentTrack = () => {
    fakeAudio.currentTime = 180;
    act(() => fakeAudio.dispatchEvent(new Event('ended')));
  };

  it('Shuffle OFF: UI Bulk Play Next [B, C, D] places B, C, D immediately after A in visible Now Playing Queue AND plays A -> B -> C -> D -> E -> F -> G', () => {
    const app = mountIntegratedApp({
      libraryTracks: [tA, tB, tC, tD, tE, tF, tG],
      initialShuffle: false,
      initialRepeatMode: 'off',
    });

    act(() => app.getPlayer().playQueue([tA, tE, tF, tG], 0));
    expect(app.getPlayer().currentTrack?.id).toBe('A');
    expect(app.getPlayer().queue.map((t) => t.id)).toEqual(['A', 'E', 'F', 'G']);

    const loadSpy = vi.spyOn(fakeAudio, 'load');
    fakeAudio.currentTime = 42;
    const loadsBefore = loadSpy.mock.calls.length;

    // Select B, C, D in TrackList UI and click Play Next in BulkActionToolbar
    selectTracksInUI(['B', 'C', 'D']);
    clickEl('[data-testid="bulk-play-next"]');

    // Current playback is NOT interrupted
    expect(app.getPlayer().currentTrack?.id).toBe('A');
    expect(fakeAudio.currentTime).toBe(42);
    expect(loadSpy.mock.calls.length).toBe(loadsBefore);

    // Canonical React queue state immediately reflects [A, B, C, D, E, F, G]
    expect(app.getPlayer().queue.map((t) => t.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);

    // Open Now Playing view and verify exact rendered DOM order
    app.openNowPlaying();
    expect(getRenderedQueueTitles()).toEqual([
      'Track A',
      'Track B',
      'Track C',
      'Track D',
      'Track E',
      'Track F',
      'Track G',
    ]);

    // Playback progression matches visible Queue order
    for (const expected of ['B', 'C', 'D', 'E', 'F', 'G']) {
      endCurrentTrack();
      expect(app.getPlayer().currentTrack?.id).toBe(expected);
    }
  });

  it('Shuffle ON: UI Bulk Play Next [B, C, D] places B, C, D immediately after A in visible Now Playing Queue AND plays B -> C -> D before resuming Shuffle', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const app = mountIntegratedApp({
      libraryTracks: [tA, tB, tC, tD, tE, tF, tG],
      initialShuffle: true,
      initialRepeatMode: 'off',
    });

    act(() => app.getPlayer().playQueue([tA, tE, tF, tG], 0));
    selectTracksInUI(['B', 'C', 'D']);
    clickEl('[data-testid="bulk-play-next"]');

    expect(app.getPlayer().queue.map((t) => t.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);

    app.openNowPlaying();
    expect(getRenderedQueueTitles()).toEqual([
      'Track A',
      'Track B',
      'Track C',
      'Track D',
      'Track E',
      'Track F',
      'Track G',
    ]);

    for (const expected of ['B', 'C', 'D', 'G', 'F', 'E']) {
      endCurrentTrack();
      expect(app.getPlayer().currentTrack?.id).toBe(expected);
    }
  });

  it('Current track in middle of Queue: Bulk Play Next moves/inserts [B, C, D] immediately after A without duplicates', () => {
    const app = mountIntegratedApp({
      libraryTracks: [tX, tY, tA, tB, tC, tD, tE, tF],
      initialShuffle: false,
    });

    // Queue: [B, X, A, E, D, F, C] with A playing at index 2
    act(() => app.getPlayer().playQueue([tB, tX, tA, tE, tD, tF, tC], 2));
    expect(app.getPlayer().currentTrack?.id).toBe('A');

    selectTracksInUI(['B', 'C', 'D']);
    clickEl('[data-testid="bulk-play-next"]');

    // B, C, D moved from history & upcoming to immediately after A; no duplicates
    expect(app.getPlayer().queue.map((t) => t.id)).toEqual(['X', 'A', 'B', 'C', 'D', 'E', 'F']);
    expect(new Set(app.getPlayer().queue.map((t) => t.id)).size).toBe(7);

    app.openNowPlaying();
    expect(getRenderedQueueTitles()).toEqual([
      'Track X',
      'Track A',
      'Track B',
      'Track C',
      'Track D',
      'Track E',
      'Track F',
    ]);
  });

  it('Repeated Bulk Play Next prepends the newer batch ahead of the earlier batch in both visible Queue and playback order', () => {
    const app = mountIntegratedApp({
      libraryTracks: [tA, tB, tC, tD, tE, tF, tG],
      initialShuffle: false,
    });

    act(() => app.getPlayer().playQueue([tA, tF, tG], 0));

    selectTracksInUI(['B', 'C']);
    clickEl('[data-testid="bulk-play-next"]');
    expect(app.getPlayer().queue.map((t) => t.id)).toEqual(['A', 'B', 'C', 'F', 'G']);

    // Exit select mode is not automatic; checkboxes are still visible, so select D, E
    clickEl('[data-testid="track-checkbox-D"]');
    clickEl('[data-testid="track-checkbox-E"]');
    clickEl('[data-testid="bulk-play-next"]');

    expect(app.getPlayer().queue.map((t) => t.id)).toEqual(['A', 'D', 'E', 'B', 'C', 'F', 'G']);

    app.openNowPlaying();
    expect(getRenderedQueueTitles()).toEqual([
      'Track A',
      'Track D',
      'Track E',
      'Track B',
      'Track C',
      'Track F',
      'Track G',
    ]);

    for (const expected of ['D', 'E', 'B', 'C', 'F', 'G']) {
      endCurrentTrack();
      expect(app.getPlayer().currentTrack?.id).toBe(expected);
    }
  });

  it('Selection including currently playing track excludes current track from moving/duplicating and places remaining tracks immediately after it', () => {
    const app = mountIntegratedApp({
      libraryTracks: [tA, tB, tC, tE, tF],
      initialShuffle: false,
    });

    act(() => app.getPlayer().playQueue([tA, tE, tF], 0));
    selectTracksInUI(['A', 'B', 'C']);
    clickEl('[data-testid="bulk-play-next"]');

    expect(app.getPlayer().currentTrack?.id).toBe('A');
    expect(app.getPlayer().queue.map((t) => t.id)).toEqual(['A', 'B', 'C', 'E', 'F']);
  });

  it('Search-filtered TrackList Bulk Play Next inserts only the selected visible tracks in order', () => {
    const app = mountIntegratedApp({
      libraryTracks: [tA, tB, tC, tD, tE, tF],
      initialShuffle: false,
    });

    act(() => app.getPlayer().playQueue([tA, tE, tF], 0));
    app.setVisibleTracks([tB, tD]);

    selectTracksInUI(['B', 'D']);
    clickEl('[data-testid="bulk-play-next"]');

    expect(app.getPlayer().queue.map((t) => t.id)).toEqual(['A', 'B', 'D', 'E', 'F']);
  });

  it('TrackList fallback without onPlayNextBulk preserves exact selected order [B, C, D] instead of reversing to [D, C, B]', () => {
    const app = mountIntegratedApp({
      libraryTracks: [tA, tB, tC, tD, tE, tF],
      initialShuffle: false,
      omitPlayNextBulkProp: true,
    });

    act(() => app.getPlayer().playQueue([tA, tE, tF], 0));
    selectTracksInUI(['B', 'C', 'D']);
    clickEl('[data-testid="bulk-play-next"]');

    expect(app.getPlayer().queue.map((t) => t.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('Shuffle OFF: Next -> Previous -> Next after Bulk Play Next strictly follows visible Queue order without skipping B', () => {
    const app = mountIntegratedApp({
      libraryTracks: [tA, tB, tC, tD, tE, tF],
      initialShuffle: false,
      initialRepeatMode: 'off',
    });

    act(() => app.getPlayer().playQueue([tA, tE, tF], 0));
    selectTracksInUI(['B', 'C', 'D']);
    clickEl('[data-testid="bulk-play-next"]');

    expect(app.getPlayer().queue.map((t) => t.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);

    // Advance A -> B
    act(() => app.getPlayer().nextTrack());
    expect(app.getPlayer().currentTrack?.id).toBe('B');

    // Step back B -> A
    fakeAudio.currentTime = 1;
    act(() => app.getPlayer().prevTrack());
    expect(app.getPlayer().currentTrack?.id).toBe('A');

    // Advance from A again -> MUST play B (matching visible Queue), not skip to C
    act(() => app.getPlayer().nextTrack());
    expect(app.getPlayer().currentTrack?.id).toBe('B');
    act(() => app.getPlayer().nextTrack());
    expect(app.getPlayer().currentTrack?.id).toBe('C');
    act(() => app.getPlayer().nextTrack());
    expect(app.getPlayer().currentTrack?.id).toBe('D');
  });

  it('Interleaving Bulk Play Next and single Play Next keeps visible Now Playing Queue and playback order identical', () => {
    const app = mountIntegratedApp({
      libraryTracks: [tA, tB, tC, tD, tE, tF],
      initialShuffle: false,
    });

    act(() => app.getPlayer().playQueue([tA, tE, tF], 0));
    selectTracksInUI(['B', 'C']);
    clickEl('[data-testid="bulk-play-next"]');
    act(() => { app.getPlayer().playNext(tD); });

    expect(app.getPlayer().queue.map((t) => t.id)).toEqual(['A', 'D', 'B', 'C', 'E', 'F']);
    app.openNowPlaying();
    expect(getRenderedQueueTitles()).toEqual([
      'Track A',
      'Track D',
      'Track B',
      'Track C',
      'Track E',
      'Track F',
    ]);

    for (const expected of ['D', 'B', 'C', 'E', 'F']) {
      endCurrentTrack();
      expect(app.getPlayer().currentTrack?.id).toBe(expected);
    }
  });

  it('applyBulkPlayNext pure algorithm matches expected order when current track is in middle and tracks already exist before/after', () => {
    const res = applyBulkPlayNext([tX, tY, tA, tE, tF], tA, [tB, tC, tD]);
    expect(res.nextQueue.map((t) => t.id)).toEqual(['X', 'Y', 'A', 'B', 'C', 'D', 'E', 'F']);
  });
});
