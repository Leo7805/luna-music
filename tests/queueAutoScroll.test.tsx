import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  NowPlayingQueueTab,
  calculateQueueScrollOffset,
} from '../src/components/NowPlayingQueueTab';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';
import { getNextTrackToPlay, getPrevTrackToPlay } from '../src/utils/queueAlgorithms';
import { resolveInitialQueue, resolveInitialTrack } from '../src/utils/playbackSession';
import { TrackItem } from '../src/types/music';

function renderHookSync<T>(useHook: () => T): T {
  let result!: T;
  function Harness() {
    result = useHook();
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return result;
}

function makeTrack(id: string, name: string): TrackItem {
  return {
    id,
    name: `${name}.mp3`,
    relativePath: `${name}.mp3`,
    file: new File(['audio'], `${name}.mp3`, { type: 'audio/mpeg' }),
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

describe('Queue Auto-Scroll, Text-Emphasis Styling & Direct Queue Navigation', () => {
  it('renders queue active row with animated equalizer when playing, static equalizer when paused, and no active fill/border/shadow', () => {
    const tracks = [
      makeTrack('t1', 'Track 1'),
      makeTrack('t2', 'Track 2'),
      makeTrack('t3', 'Track 3'),
    ];

    const htmlPlaying = renderToStaticMarkup(
      <NowPlayingQueueTab
        queue={tracks}
        currentTrack={tracks[1]}
        isPlaying={true}
        isOpen={true}
        isActiveTab={true}
      />
    );

    expect(htmlPlaying).toContain('Track 1');
    expect(htmlPlaying).toContain('Track 2');
    expect(htmlPlaying).toContain('Track 3');
    // Active track uses data-current, animated equalizer bars, and semibold title text
    expect(htmlPlaying).toContain('data-current="true"');
    expect(htmlPlaying).toContain('data-testid="queue-playing-indicator" data-playing="true"');
    expect(htmlPlaying).toContain('animate-bar-1');
    expect(htmlPlaying).toContain('animate-bar-2');
    expect(htmlPlaying).toContain('animate-bar-3');
    expect(htmlPlaying).toContain('font-semibold text-[var(--accent-primary)] dark:text-white');
    // Inactive rows retain track numbers (1 and 3)
    expect(htmlPlaying).toContain('>1</span>');
    expect(htmlPlaying).toContain('>3</span>');
    // No persistent filled background, colored border, or drop shadow on active row
    expect(htmlPlaying).not.toContain('bg-[var(--bg-active)]');
    expect(htmlPlaying).not.toContain('dark:bg-indigo-600/25');
    expect(htmlPlaying).not.toContain('border-[var(--accent-primary)]/30');
    expect(htmlPlaying).not.toContain('shadow-sm');
    // Accessible focus-visible indicator preserved
    expect(htmlPlaying).toContain('focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50');

    // Paused state: indicator stays visible but stops animating
    const htmlPaused = renderToStaticMarkup(
      <NowPlayingQueueTab
        queue={tracks}
        currentTrack={tracks[1]}
        isPlaying={false}
        isOpen={true}
        isActiveTab={true}
      />
    );
    expect(htmlPaused).toContain('data-testid="queue-playing-indicator" data-playing="false"');
    expect(htmlPaused).not.toContain('animate-bar-1');
    expect(htmlPaused).not.toContain('animate-bar-2');
    expect(htmlPaused).not.toContain('animate-bar-3');
  });

  it('direct Queue click (playQueueTrack) navigates without reordering and preserves Prev/Next and session restoration', () => {
    const [tA, tB, tC, tD, tE] = ['A', 'B', 'C', 'D', 'E'].map((k) =>
      makeTrack(`track-${k}`, `Track ${k}`)
    );
    const initialQueue = [tA, tB, tC, tD, tE];

    const player = renderHookSync(() =>
      useAudioPlayer({
        initialQueue,
        initialTrackId: tB.id,
        libraryTracks: initialQueue,
      })
    );

    expect(typeof player.playQueueTrack).toBe('function');
    expect(player.queue.map((t) => t.id)).toEqual([tA.id, tB.id, tC.id, tD.id, tE.id]);
    expect(player.currentTrack?.id).toBe(tB.id);

    // Clicking D directly in Queue does not reorder the queue
    player.playQueueTrack(tD);
    expect(player.queue.map((t) => t.id)).toEqual([tA.id, tB.id, tC.id, tD.id, tE.id]);

    // Prev/Next from D operate on its original index (3 -> C and E)
    expect(getNextTrackToPlay(initialQueue, tD, false, 'off', null).nextTrack?.id).toBe(tE.id);
    expect(getPrevTrackToPlay(initialQueue, tD, 'off').targetTrack?.id).toBe(tC.id);

    // Persisted queue order and current track restore cleanly after refresh
    const restoredQ = resolveInitialQueue({
      storedQueueIds: initialQueue.map((t) => t.id),
      effectiveInitialTrackId: tD.id,
      libraryTracks: initialQueue,
    });
    const restoredTrack = resolveInitialTrack({
      effectiveInitialTrackId: tD.id,
      libraryTracks: initialQueue,
      queue: restoredQ,
    });
    expect(restoredQ.map((t) => t.id)).toEqual([tA.id, tB.id, tC.id, tD.id, tE.id]);
    expect(restoredTrack?.id).toBe(tD.id);
  });

  it('renders empty queue state message when queue is empty', () => {
    const html = renderToStaticMarkup(
      <NowPlayingQueueTab
        queue={[]}
        currentTrack={null}
        isOpen={true}
        isActiveTab={true}
      />
    );

    expect(html).toContain('Queue is empty');
    expect(html).toContain('Add tracks to the queue using &quot;Play Next&quot; or &quot;Add to Queue&quot;');
  });

  describe('calculateQueueScrollOffset visibility calculations', () => {
    const containerHeight = 400;
    const rowHeight = 40;

    it('returns shouldScroll = false when row is completely inside container viewport', () => {
      // Container scrolled to 100, viewport spans 100 to 500
      const containerTop = 100;
      // Row at 200 (height 40 -> 200..240)
      const res = calculateQueueScrollOffset(containerTop, containerHeight, 200, rowHeight);
      expect(res.shouldScroll).toBe(false);
      expect(res.targetScrollTop).toBe(containerTop);
    });

    it('returns shouldScroll = true and centers row when row is above container viewport', () => {
      // Container scrolled to 300, viewport spans 300 to 700
      const containerTop = 300;
      // Row is at 100 (above 300)
      const res = calculateQueueScrollOffset(containerTop, containerHeight, 100, rowHeight);
      expect(res.shouldScroll).toBe(true);
      // Target centered: rowTop - (containerHeight - rowHeight) / 2
      // 100 - (400 - 40) / 2 = 100 - 180 = -80 -> clamped to 0
      expect(res.targetScrollTop).toBe(0);

      // Row at 200 (above 300)
      const res2 = calculateQueueScrollOffset(containerTop, containerHeight, 200, rowHeight);
      expect(res2.shouldScroll).toBe(true);
      // 200 - 180 = 20
      expect(res2.targetScrollTop).toBe(20);
    });

    it('returns shouldScroll = true and centers row when row is below container viewport', () => {
      // Container scrolled to 0, viewport spans 0 to 400
      const containerTop = 0;
      // Row is at 600 (below 400)
      const res = calculateQueueScrollOffset(containerTop, containerHeight, 600, rowHeight);
      expect(res.shouldScroll).toBe(true);
      // Target centered: 600 - (400 - 40) / 2 = 600 - 180 = 420
      expect(res.targetScrollTop).toBe(420);
    });

    it('detects boundary conditions: row partially clipped at bottom triggers scroll', () => {
      const containerTop = 0;
      // Viewport ends at 400. Row starts at 380, ends at 420 (clipped)
      const res = calculateQueueScrollOffset(containerTop, containerHeight, 380, rowHeight);
      expect(res.shouldScroll).toBe(true);
      expect(res.targetScrollTop).toBe(380 - 180); // 200
    });

    it('detects boundary conditions: row partially clipped at top triggers scroll', () => {
      const containerTop = 100;
      // Row starts at 80 (ends at 120, partially clipped above)
      const res = calculateQueueScrollOffset(containerTop, containerHeight, 80, rowHeight);
      expect(res.shouldScroll).toBe(true);
    });
  });
});
