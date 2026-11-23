import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NowPlayingView } from '../src/components/NowPlayingView';
import { calculateQueueScrollOffset } from '../src/utils/queueScroll';
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

    const commonProps = {
      queue: tracks,
      currentTrack: tracks[1],
      playlists: [],
      theme: 'light' as const,
      lightStyle: 'warm' as const,
      onPlayQueueTrack: () => {},
      onRemoveFromQueue: () => {},
      onRemoveTracksFromQueue: () => 0,
      onSaveQueueAsPlaylist: () => {},
      onSelectTheme: () => {},
      onSelectLightStyle: () => {},
      onOpenShortcutsModal: () => {},
    };

    const htmlPlaying = renderToStaticMarkup(
      <NowPlayingView {...commonProps} isPlaying={true} />
    );

    expect(htmlPlaying).toContain('Track 1');
    expect(htmlPlaying).toContain('Track 2');
    expect(htmlPlaying).toContain('Track 3');
    expect(htmlPlaying).toContain('data-current="true"');
    expect(htmlPlaying).toContain('data-row-state="current"');
    expect(htmlPlaying).toContain('track-row-current');
    expect(htmlPlaying).toContain('track-playing-badge');
    expect(htmlPlaying).toContain('data-testid="queue-playing-indicator" data-playing="true"');
    expect(htmlPlaying).toContain('animate-bar-1');
    expect(htmlPlaying).toContain('animate-bar-2');
    expect(htmlPlaying).toContain('animate-bar-3');
    expect(htmlPlaying).toContain('font-semibold text-[var(--text-primary)] dark:text-white');
    expect(htmlPlaying).toContain('>1</span>');
    expect(htmlPlaying).toContain('>3</span>');
    expect(htmlPlaying).toContain('focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50');

    const htmlPaused = renderToStaticMarkup(
      <NowPlayingView {...commonProps} isPlaying={false} />
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

    player.playQueueTrack(tD);
    expect(player.queue.map((t) => t.id)).toEqual([tA.id, tB.id, tC.id, tD.id, tE.id]);

    expect(getNextTrackToPlay(initialQueue, tD, false, 'off', null).nextTrack?.id).toBe(tE.id);
    expect(getPrevTrackToPlay(initialQueue, tD, 'off').targetTrack?.id).toBe(tC.id);

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
      <NowPlayingView
        queue={[]}
        currentTrack={null}
        isPlaying={false}
        playlists={[]}
        theme="light"
        lightStyle="warm"
        onPlayQueueTrack={() => {}}
        onRemoveFromQueue={() => {}}
        onRemoveTracksFromQueue={() => 0}
        onSaveQueueAsPlaylist={() => {}}
        onSelectTheme={() => {}}
        onSelectLightStyle={() => {}}
        onOpenShortcutsModal={() => {}}
      />
    );
    expect(html).toContain('Queue is empty');
  });

  describe('calculateQueueScrollOffset visibility calculations', () => {
    const containerHeight = 400;
    const rowHeight = 40;

    it('returns shouldScroll = false when row is completely inside container viewport', () => {
      const res = calculateQueueScrollOffset(100, containerHeight, 200, rowHeight);
      expect(res.shouldScroll).toBe(false);
      expect(res.targetScrollTop).toBe(100);
    });

    it('returns shouldScroll = true and centers row when row is above container viewport', () => {
      expect(calculateQueueScrollOffset(300, containerHeight, 100, rowHeight)).toEqual({
        shouldScroll: true,
        targetScrollTop: 0,
      });
      expect(calculateQueueScrollOffset(300, containerHeight, 200, rowHeight)).toEqual({
        shouldScroll: true,
        targetScrollTop: 20,
      });
    });

    it('returns shouldScroll = true and centers row when row is below container viewport', () => {
      expect(calculateQueueScrollOffset(0, containerHeight, 600, rowHeight)).toEqual({
        shouldScroll: true,
        targetScrollTop: 420,
      });
    });

    it('detects boundary conditions: row partially clipped at bottom or top triggers scroll', () => {
      expect(calculateQueueScrollOffset(0, containerHeight, 380, rowHeight)).toEqual({
        shouldScroll: true,
        targetScrollTop: 200,
      });
      expect(calculateQueueScrollOffset(100, containerHeight, 80, rowHeight).shouldScroll).toBe(true);
    });
  });
});
