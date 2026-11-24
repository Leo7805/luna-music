// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { NowPlayingView } from '../src/components/NowPlayingView';
import { LyricsPanel } from '../src/components/NowPlayingPanel';
import { getVinylSpinClass } from '../src/utils/vinylSpin';
import { TrackItem } from '../src/types/music';

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
});

function makeTrack(
  id: string,
  title: string,
  options?: { artworkUrl?: string; placeholderGradient?: string }
): TrackItem {
  return {
    id,
    name: `${title}.mp3`,
    relativePath: `${title}.mp3`,
    size: 4096,
    lastModified: 1700000000,
    status: 'normal',
    metadata: {
      title,
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 180,
      isMetadataLoaded: true,
      artworkUrl: options?.artworkUrl,
      placeholderGradient:
        options?.placeholderGradient ?? 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
    },
  };
}

const baseNowPlayingProps = {
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

describe('Animated Vinyl Discs for Now Playing', () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root!.unmount());
      root = null;
    }
    if (host) {
      host.remove();
      host = null;
    }
  });

  function mount(node: React.ReactElement) {
    if (!host) {
      host = document.createElement('div');
      document.body.appendChild(host);
      root = createRoot(host);
    }
    act(() => root!.render(node));
    return host;
  }

  it('resolves shared vinyl spin classes for playing, paused, and no-track states', () => {
    expect(getVinylSpinClass(true, true)).toBe('vinyl-disc-spin vinyl-disc-running');
    expect(getVinylSpinClass(true, false)).toBe('vinyl-disc-spin vinyl-disc-paused');
    expect(getVinylSpinClass(false, true)).toBe('');
    expect(getVinylSpinClass(false, false)).toBe('');
  });

  it('defines shared 12s linear vinyl-spin keyframes, play-state classes, and reduced-motion override in src/index.css', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).toContain('--vinyl-spin-duration: 12s;');
    expect(css).toMatch(/@keyframes\s+vinyl-spin\s*\{[\s\S]*rotate\(360deg\)/);
    expect(css).toMatch(/\.vinyl-disc-spin\s*\{[\s\S]*animation:\s*vinyl-spin\s+var\(--vinyl-spin-duration,\s*12s\)\s+linear\s+infinite;/);
    expect(css).toMatch(/\.vinyl-disc-running\s*\{[\s\S]*animation-play-state:\s*running;/);
    expect(css).toMatch(/\.vinyl-disc-paused\s*\{[\s\S]*animation-play-state:\s*paused;/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.vinyl-disc-spin\s*\{[\s\S]*animation:\s*none;/);
  });

  it('renders small fixed-theme vinyl disc beside Now Playing title, keeps same DOM node on pause/resume, and stops when no track', () => {
    const t1 = makeTrack('t-1', 'Track One', {
      artworkUrl: 'blob:track-1-art',
      placeholderGradient: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
    });
    const t2 = makeTrack('t-2', 'Track Two', {
      placeholderGradient: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
    });

    // 1. Playing
    const container = mount(
      <NowPlayingView {...baseNowPlayingProps} queue={[t1, t2]} currentTrack={t1} isPlaying={true} />
    );
    const headerDisc = container.querySelector('[data-testid="now-playing-header-vinyl"]');
    expect(headerDisc).not.toBeNull();
    expect(headerDisc?.getAttribute('aria-hidden')).toBe('true');
    expect(headerDisc?.getAttribute('data-spinning')).toBe('true');
    expect(headerDisc?.className).toContain('vinyl-disc-spin');
    expect(headerDisc?.className).toContain('vinyl-disc-running');
    expect(headerDisc?.className).toContain('text-[var(--track-current-accent)]');
    expect(headerDisc?.getAttribute('style')).toBeNull();

    // Existing header controls and row equalizer remain intact
    expect(container.querySelector('[data-testid="queue-search-input"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="save-queue-playlist-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="queue-select-mode-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="queue-playing-indicator"]')).not.toBeNull();

    // 2. Paused -> same DOM node preserved (no remount), switches to vinyl-disc-paused
    mount(
      <NowPlayingView {...baseNowPlayingProps} queue={[t1, t2]} currentTrack={t1} isPlaying={false} />
    );
    const headerDiscPaused = container.querySelector('[data-testid="now-playing-header-vinyl"]');
    expect(headerDiscPaused).toBe(headerDisc);
    expect(headerDiscPaused?.getAttribute('data-spinning')).toBe('false');
    expect(headerDiscPaused?.className).toContain('vinyl-disc-spin');
    expect(headerDiscPaused?.className).toContain('vinyl-disc-paused');

    // 3. Track changed -> header disc retains exact same universal styling
    mount(
      <NowPlayingView {...baseNowPlayingProps} queue={[t1, t2]} currentTrack={t2} isPlaying={true} />
    );
    const headerDiscTrack2 = container.querySelector('[data-testid="now-playing-header-vinyl"]');
    expect(headerDiscTrack2).toBe(headerDisc);
    expect(headerDiscTrack2?.className).toContain('text-[var(--track-current-accent)]');
    expect(headerDiscTrack2?.className).toContain('vinyl-disc-running');
    expect(headerDiscTrack2?.getAttribute('style')).toBeNull();

    // 4. No current track -> non-rotating state
    mount(
      <NowPlayingView {...baseNowPlayingProps} queue={[]} currentTrack={null} isPlaying={false} />
    );
    const headerDiscEmpty = container.querySelector('[data-testid="now-playing-header-vinyl"]');
    expect(headerDiscEmpty?.getAttribute('data-spinning')).toBe('false');
    expect(headerDiscEmpty?.className).not.toContain('vinyl-disc-spin');
  });

  it('rotates large artwork disc in LyricsPanel with song-specific artwork or fallback, freezes on pause without remounting, and keeps lyrics intact', () => {
    const withArt = makeTrack('t-art', 'Cover Song', {
      artworkUrl: 'blob:cover-art-1',
      placeholderGradient: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    });
    const fallbackOnly = makeTrack('t-fallback', 'Fallback Song', {
      placeholderGradient: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
    });
    const lyrics = [
      { time: 0, text: 'Line one' },
      { time: 5, text: 'Line two' },
    ];

    // 1. Playing with album artwork
    const container = mount(
      <LyricsPanel
        currentTrack={withArt}
        isPlaying={true}
        currentTime={6}
        lyrics={lyrics}
        ambientColors={{ primary: '#6366f1', glow: '#4f46e5' }}
        isOpen={true}
        onClose={() => {}}
        onSeekTo={() => {}}
      />
    );
    const discEl = container.querySelector('[data-testid="lyrics-vinyl-disc"]');
    expect(discEl).not.toBeNull();
    expect(discEl?.getAttribute('data-spinning')).toBe('true');
    expect(discEl?.className).toContain('vinyl-disc-spin');
    expect(discEl?.className).toContain('vinyl-disc-running');
    const img = discEl?.querySelector('img');
    expect(img?.getAttribute('src')).toBe('blob:cover-art-1');
    // Lyrics panel remains functional and non-rotating
    expect(container.querySelector('[data-testid="lyrics-panel"]')?.className).not.toContain('vinyl-disc-spin');
    expect(container.querySelector('[data-active-lyric="true"]')?.textContent).toBe('Line two');

    // 2. Paused -> same DOM node preserved (no remount), animation paused
    mount(
      <LyricsPanel
        currentTrack={withArt}
        isPlaying={false}
        currentTime={6}
        lyrics={lyrics}
        ambientColors={{ primary: '#6366f1', glow: '#4f46e5' }}
        isOpen={true}
        onClose={() => {}}
        onSeekTo={() => {}}
      />
    );
    const discPaused = container.querySelector('[data-testid="lyrics-vinyl-disc"]');
    expect(discPaused).toBe(discEl);
    expect(discPaused?.getAttribute('data-spinning')).toBe('false');
    expect(discPaused?.className).toContain('vinyl-disc-spin');
    expect(discPaused?.className).toContain('vinyl-disc-paused');

    // 3. Track changed to fallback-only song -> preserves fallback gradient & rotating disc SVG
    mount(
      <LyricsPanel
        currentTrack={fallbackOnly}
        isPlaying={true}
        currentTime={0}
        lyrics={[]}
        ambientColors={{ primary: '#059669', glow: '#0d9488' }}
        isOpen={true}
        onClose={() => {}}
        onSeekTo={() => {}}
      />
    );
    const discFallback = container.querySelector('[data-testid="lyrics-vinyl-disc"]');
    expect(discFallback?.className).toContain('vinyl-disc-running');
    expect(discFallback?.querySelector('img')).toBeNull();
    expect(discFallback?.querySelector('svg')).not.toBeNull();

    // 4. No current track -> no rotating disc rendered
    mount(
      <LyricsPanel
        currentTrack={null}
        isPlaying={false}
        currentTime={0}
        lyrics={[]}
        ambientColors={{ primary: '#6366f1', glow: '#4f46e5' }}
        isOpen={true}
        onClose={() => {}}
        onSeekTo={() => {}}
      />
    );
    expect(container.querySelector('[data-testid="lyrics-vinyl-disc"]')).toBeNull();
  });
});
