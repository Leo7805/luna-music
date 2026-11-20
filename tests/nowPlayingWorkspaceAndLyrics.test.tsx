import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NowPlayingView } from '../src/components/NowPlayingView';
import { LyricsPanel } from '../src/components/NowPlayingPanel';
import { TrackInfoModal } from '../src/components/TrackInfoModal';
import { usePlaybackQueue } from '../src/hooks/usePlaybackQueue';
import { getStoredNavigation, storeNavigation } from '../src/utils/navigationStorage';
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
});
