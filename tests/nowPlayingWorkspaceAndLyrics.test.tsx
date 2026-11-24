import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NowPlayingView } from '../src/components/NowPlayingView';
import { NowPlayingContextMenu } from '../src/components/NowPlayingContextMenu';
import { LyricsPanel } from '../src/components/NowPlayingPanel';
import { TrackInfoModal } from '../src/components/TrackInfoModal';
import { usePlaybackQueue } from '../src/hooks/usePlaybackQueue';
import { getStoredNavigation, storeNavigation } from '../src/utils/navigationStorage';
import {
  reconcileQueueWithLibrary,
  computeQueueRemovalTransition,
} from '../src/utils/queueMetadata';
import { TrackItem, LrcLine } from '../src/types/music';

function renderHookSync<T>(useHook: () => T): T {
  let result!: T;
  function Harness() {
    result = useHook();
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return result;
}

function makeTrack(id: string, title: string, artist = 'Artist', album = 'Album'): TrackItem {
  return {
    id,
    name: `${title}.mp3`,
    relativePath: `${title}.mp3`,
    size: 4096000,
    lastModified: 1700000000,
    status: 'normal',
    metadata: {
      title,
      artist,
      album,
      duration: 215,
      year: 2024,
      isMetadataLoaded: true,
    },
  };
}

const createSessionStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

describe('Now Playing Workspace & Dedicated Lyrics Panel', () => {
  const t1 = makeTrack('t-1', '青花瓷', '周杰伦', '我很忙');
  const t2 = makeTrack('t-2', '晴天', '周杰伦', '叶惠美');
  const t3 = makeTrack('t-3', '七里香', '周杰伦', '七里香');
  const t4 = makeTrack('t-4', '夜曲', '周杰伦', '十一月的萧邦');
  const sampleQueue = [t1, t2, t3, t4];

  beforeEach(() => {
    if (typeof globalThis.sessionStorage === 'undefined') {
      // @ts-expect-error Mocking sessionStorage in Node test runner
      globalThis.sessionStorage = createSessionStorageMock();
    }
    globalThis.sessionStorage.clear();
  });

  it('renders central Now Playing view with dynamic queue count, Search, Save as Playlist, Select, and no Clear Queue button', () => {
    const html = renderToStaticMarkup(
      <NowPlayingView
        queue={sampleQueue}
        currentTrack={t2}
        isPlaying={true}
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

    expect(html).toContain('data-testid="now-playing-view"');
    expect(html).toContain('Now Playing');
    expect(html).toContain('Queue · 4 tracks');
    expect(html).toContain('data-testid="queue-search-input"');
    expect(html).toContain('data-testid="save-queue-playlist-button"');
    expect(html).toContain('data-testid="queue-select-mode-button"');
    // Destructive Clear Queue / Clear Upcoming buttons must NOT be in the toolbar
    expect(html).not.toContain('Clear Queue');
    expect(html).not.toContain('Clear Upcoming');
    // Active track shows equalizer without filled active background
    expect(html).toContain('data-testid="queue-playing-indicator" data-playing="true"');
    expect(html).toContain('data-testid="queue-row-1" data-current="true"');
    expect(html).not.toContain('bg-[var(--bg-active)]');
  });

  it('bulk removes selected Queue indices while strictly protecting the currently playing track', () => {
    const controls = renderHookSync(() => usePlaybackQueue({ initialQueue: sampleQueue }));
    // Attempt to remove indices [0, 1, 3] while t2 (index 1) is currently playing
    const removedCount = controls.removeTracksFromQueue([0, 1, 3], t2);

    // Only indices 0 (t1) and 3 (t4) are removed; t2 (current) is protected; t3 remains
    expect(removedCount).toBe(2);
    expect(controls.queueRef.current.map((t) => t.id)).toEqual([t2.id, t3.id]);
  });

  it('renders dedicated right-side LyricsPanel without NOW PLAYING header, tabs, or disc spinning', () => {
    const lyrics: LrcLine[] = [
      { time: 0, text: '素胚勾勒出青花笔锋浓转淡' },
      { time: 10, text: '瓶身描绘的牡丹一如你初妆' },
      { time: 20, text: '冉冉檀香透过窗心事我了然' },
    ];

    const html = renderToStaticMarkup(
      <LyricsPanel
        currentTrack={t1}
        currentTime={12}
        lyrics={lyrics}
        ambientColors={{ primary: '#6366f1', glow: '#4f46e5' }}
        isOpen={true}
        onClose={() => {}}
        onSeekTo={() => {}}
      />
    );

    expect(html).toContain('data-testid="lyrics-panel"');
    expect(html).toContain('data-testid="close-lyrics-button"');
    // Removed NOW PLAYING heading and 3-tab switcher
    expect(html).not.toContain('Now Playing');
    expect(html).not.toContain('Queue(');
    expect(html).not.toContain('>Info<');
    // Static artwork (no spinning/rotation animation)
    expect(html).not.toContain('animate-spin');
    // Synchronized lyric active line highlighted at currentTime = 12s
    expect(html).toContain('data-active-lyric="true"');
    expect(html).toContain('瓶身描绘的牡丹一如你初妆');
  });

  it('returns empty markup when LyricsPanel is closed', () => {
    const html = renderToStaticMarkup(
      <LyricsPanel
        currentTrack={t1}
        currentTime={0}
        lyrics={[]}
        ambientColors={{ primary: '#6366f1', glow: '#4f46e5' }}
        isOpen={false}
        onClose={() => {}}
        onSeekTo={() => {}}
      />
    );
    expect(html).toBe('');
  });

  it('renders TrackInfoModal with complete track metadata from context menu', () => {
    const html = renderToStaticMarkup(<TrackInfoModal track={t1} onClose={() => {}} />);
    expect(html).toContain('data-testid="track-info-modal"');
    expect(html).toContain('Track Info');
    expect(html).toContain('青花瓷');
    expect(html).toContain('周杰伦');
    expect(html).toContain('我很忙');
    expect(html).toContain('青花瓷.mp3');
    expect(html).toContain('3:35');
    expect(html).toContain('2024');
  });

  it('persists and restores isNowPlayingView alongside previous library view across refresh', () => {
    storeNavigation({
      view: 'playlists',
      selectedPlaylistId: 'pl-roadtrip',
      isNowPlayingView: true,
    });
    const restored = getStoredNavigation();
    expect(restored?.view).toBe('playlists');
    expect(restored?.selectedPlaylistId).toBe('pl-roadtrip');
    expect(restored?.isNowPlayingView).toBe(true);

    // Toggling Now Playing off preserves the underlying playlist view
    storeNavigation({ isNowPlayingView: false });
    const afterClose = getStoredNavigation();
    expect(afterClose?.view).toBe('playlists');
    expect(afterClose?.selectedPlaylistId).toBe('pl-roadtrip');
    expect(afterClose?.isNowPlayingView).toBe(false);
  });

  it('reconciles Queue durations and delayed metadata from canonical library tracks and aliases without unnecessary copies', () => {
    const staleTrack: TrackItem = {
      ...t1,
      id: 'alias-t1',
      metadata: { ...t1.metadata, duration: undefined, isMetadataLoaded: false },
    };
    const canonicalTrack: TrackItem = {
      ...t1,
      aliases: ['alias-t1'],
      metadata: { ...t1.metadata, duration: 255, isMetadataLoaded: true },
    };
    const missingDurTrack: TrackItem = {
      ...t2,
      metadata: { ...t2.metadata, duration: undefined, isMetadataLoaded: true },
    };

    const queue = [staleTrack, missingDurTrack];
    const reconciled = reconcileQueueWithLibrary(queue, [canonicalTrack, missingDurTrack]);

    expect(reconciled).not.toBe(queue);
    expect(reconciled[0].metadata.duration).toBe(255);
    expect(reconciled[1].metadata.duration).toBeUndefined();

    // Calling again when already reconciled returns the exact same reference (no extra re-renders)
    const secondPass = reconcileQueueWithLibrary(reconciled, [canonicalTrack, missingDurTrack]);
    expect(secondPass).toBe(reconciled);
  });

  it('renders clean context menus: Play Now + Play Next for non-current; Add to Playlist + Track Info + Remove from Queue (no Playing) for current', () => {
    const htmlNonCurrent = renderToStaticMarkup(
      <NowPlayingContextMenu
        menu={{
          targetIndex: 2,
          targetTrack: t3,
          isCurrent: false,
          mode: 'single',
          anchorType: 'button',
          x: 100,
          y: 100,
        }}
        selectedCount={0}
        onClose={() => {}}
        onPlayQueueTrack={() => {}}
        onPlayNext={() => {}}
        onAddToPlaylist={() => {}}
        onBulkAddToPlaylist={() => {}}
        onOpenTrackInfo={() => {}}
        onRemoveFromQueue={() => {}}
        onRequestBulkRemove={() => {}}
      />
    );
    expect(htmlNonCurrent).toContain('Play Now');
    expect(htmlNonCurrent).toContain('Play Next');
    expect(htmlNonCurrent).toContain('Add to Playlist');
    expect(htmlNonCurrent).toContain('Track Info');
    expect(htmlNonCurrent).toContain('Remove from Queue');
    expect(htmlNonCurrent).not.toContain('Jump to Track');

    const htmlCurrent = renderToStaticMarkup(
      <NowPlayingContextMenu
        menu={{
          targetIndex: 1,
          targetTrack: t2,
          isCurrent: true,
          mode: 'single',
          anchorType: 'button',
          x: 100,
          y: 100,
        }}
        selectedCount={0}
        onClose={() => {}}
        onPlayQueueTrack={() => {}}
        onPlayNext={() => {}}
        onAddToPlaylist={() => {}}
        onBulkAddToPlaylist={() => {}}
        onOpenTrackInfo={() => {}}
        onRemoveFromQueue={() => {}}
        onRequestBulkRemove={() => {}}
      />
    );
    expect(htmlCurrent).not.toContain('>Playing<');
    expect(htmlCurrent).not.toContain('>Play Now<');
    expect(htmlCurrent).not.toContain('>Play Next<');
    expect(htmlCurrent).toContain('Add to Playlist');
    expect(htmlCurrent).toContain('Track Info');
    expect(htmlCurrent).toContain('Remove from Queue');
  });

  it('computes accurate Queue removal transitions for non-current, middle current, final current, and only track', () => {
    // 1. Removing non-current keeps playback uninterrupted
    const nonCur = computeQueueRemovalTransition(sampleQueue, 0, t2, 'off');
    expect(nonCur.wasCurrent).toBe(false);
    expect(nonCur.shouldStop).toBe(false);
    expect(nonCur.nextTrack?.id).toBe(t2.id);
    expect(nonCur.nextQueue.map((t) => t.id)).toEqual([t2.id, t3.id, t4.id]);

    // 2. Removing middle current track B in [A, B, C, D] advances to C
    const midCur = computeQueueRemovalTransition(sampleQueue, 1, t2, 'off');
    expect(midCur.wasCurrent).toBe(true);
    expect(midCur.shouldStop).toBe(false);
    expect(midCur.nextTrack?.id).toBe(t3.id);
    expect(midCur.nextQueue.map((t) => t.id)).toEqual([t1.id, t3.id, t4.id]);

    // 3. Removing final current track with repeat OFF stops cleanly
    const finalOff = computeQueueRemovalTransition(sampleQueue, 3, t4, 'off');
    expect(finalOff.wasCurrent).toBe(true);
    expect(finalOff.shouldStop).toBe(true);
    expect(finalOff.nextTrack).toBeNull();
    expect(finalOff.nextQueue.map((t) => t.id)).toEqual([t1.id, t2.id, t3.id]);

    // 4. Removing final current track with repeat ALL wraps to first track
    const finalAll = computeQueueRemovalTransition(sampleQueue, 3, t4, 'all');
    expect(finalAll.wasCurrent).toBe(true);
    expect(finalAll.shouldStop).toBe(false);
    expect(finalAll.nextTrack?.id).toBe(t1.id);

    // 5. Removing the only track empties Queue and stops cleanly
    const onlyTrack = computeQueueRemovalTransition([t1], 0, t1, 'all');
    expect(onlyTrack.wasCurrent).toBe(true);
    expect(onlyTrack.shouldStop).toBe(true);
    expect(onlyTrack.nextTrack).toBeNull();
    expect(onlyTrack.nextQueue).toEqual([]);
  });
});
