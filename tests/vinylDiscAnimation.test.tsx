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

describe('Now Playing Header Note & Lyrics Disc Animation', () => {
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

  it('resolves vinyl spin classes for playing, paused, and no-track states', () => {
    expect(getVinylSpinClass(true, true)).toBe('vinyl-disc-spin vinyl-disc-running');
    expect(getVinylSpinClass(true, false)).toBe('vinyl-disc-spin vinyl-disc-paused');
    expect(getVinylSpinClass(false, true)).toBe('');
    expect(getVinylSpinClass(false, false)).toBe('');
  });

  it('defines 16s linear vinyl-spin keyframes, play-state classes, and reduced-motion override in src/index.css', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).toContain('--vinyl-spin-duration: 16s;');
    expect(css).toMatch(/@keyframes\s+vinyl-spin\s*\{[\s\S]*rotate\(360deg\)/);
    expect(css).toMatch(/\.vinyl-disc-spin\s*\{[\s\S]*animation:\s*vinyl-spin\s+var\(--vinyl-spin-duration,\s*16s\)\s+linear\s+infinite;/);
    expect(css).toMatch(/\.vinyl-disc-running\s*\{[\s\S]*animation-play-state:\s*running;/);
    expect(css).toMatch(/\.vinyl-disc-paused\s*\{[\s\S]*animation-play-state:\s*paused;/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.vinyl-disc-spin\s*\{[\s\S]*animation:\s*none;/);
  });

  it('renders a static, background-free music note icon beside Now Playing title and preserves existing controls and equalizer', () => {
    const t1 = makeTrack('t-1', 'Track One', {
      artworkUrl: 'blob:track-1-art',
      placeholderGradient: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
    });
    const t2 = makeTrack('t-2', 'Track Two', {
      placeholderGradient: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
    });

    // Playing state -> header icon remains completely static (no rotation, no Disc3, no background tile)
    const container = mount(
      <NowPlayingView {...baseNowPlayingProps} queue={[t1, t2]} currentTrack={t1} isPlaying={true} />
    );
    const headerIcon = container.querySelector('[data-testid="now-playing-header-icon"]');
    expect(headerIcon).not.toBeNull();
    expect(container.querySelector('[data-testid="now-playing-header-vinyl"]')).toBeNull();
    expect(headerIcon?.getAttribute('aria-hidden')).toBe('true');
    expect(headerIcon?.className).not.toContain('vinyl-disc-spin');
    expect(headerIcon?.className).not.toContain('vinyl-disc-running');
    expect(headerIcon?.className).not.toContain('animate-spin');
    expect(headerIcon?.className).not.toContain('bg-');
    expect(headerIcon?.className).not.toContain('border');
    expect(headerIcon?.className).not.toContain('shadow');
    expect(headerIcon?.className).toContain('text-[var(--accent-primary)]');
    expect(headerIcon?.getAttribute('style')).toBeNull();

    // Music2 (eighth-note) SVG has no outer disc circle (r="10")
    const svg = headerIcon?.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.querySelector('circle[r="10"]')).toBeNull();

    // Existing header controls and row playing indicator remain intact
    expect(container.querySelector('[data-testid="queue-search-input"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="save-queue-playlist-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="queue-select-mode-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="queue-playing-indicator"]')).not.toBeNull();

    // Track change & paused -> header icon remains identical and static
    mount(
      <NowPlayingView {...baseNowPlayingProps} queue={[t1, t2]} currentTrack={t2} isPlaying={false} />
    );
    const headerIconAfter = container.querySelector('[data-testid="now-playing-header-icon"]');
    expect(headerIconAfter).toBe(headerIcon);
    expect(headerIconAfter?.className).not.toContain('vinyl-disc-spin');
    expect(headerIconAfter?.getAttribute('style')).toBeNull();
  });

  it('rotates only the lyrics disc with original square container, simple fallback disc + subtle marker, and freezes/resumes without remounting', () => {
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

    // 1. Playing with fallback disc -> square rounded-2xl container preserved; simple 2-circle disc + 1 subtle marker inside rotating SVG
    const container = mount(
      <LyricsPanel
        currentTrack={fallbackOnly}
        isPlaying={true}
        currentTime={6}
        lyrics={lyrics}
        ambientColors={{ primary: '#059669', glow: '#0d9488' }}
        isOpen={true}
        onClose={() => {}}
        onSeekTo={() => {}}
      />
    );
    const artworkContainer = container.querySelector('[data-testid="lyrics-artwork-container"]');
    expect(artworkContainer?.className).toContain('w-24 h-24 rounded-2xl');
    expect(artworkContainer?.className).not.toContain('vinyl-disc-spin');

    const discEl = container.querySelector('[data-testid="lyrics-vinyl-disc"]');
    expect(discEl).not.toBeNull();
    expect(discEl?.getAttribute('data-spinning')).toBe('true');
    expect(discEl?.className).toContain('vinyl-disc-spin');
    expect(discEl?.className).toContain('vinyl-disc-running');

    const fallbackSvg = discEl?.querySelector('svg');
    expect(fallbackSvg).not.toBeNull();
    expect(fallbackSvg?.querySelector('circle[r="10"]')).not.toBeNull();
    expect(fallbackSvg?.querySelector('circle[r="2"]')).not.toBeNull();
    expect(fallbackSvg?.querySelector('[data-testid="lyrics-vinyl-marker"]')).not.toBeNull();
    // No heavy groove paths (Disc3 removed)
    expect(fallbackSvg?.querySelectorAll('path').length).toBe(0);

    // Lyrics synchronization unaffected
    expect(container.querySelector('[data-testid="lyrics-panel"]')?.className).not.toContain('vinyl-disc-spin');
    expect(container.querySelector('[data-active-lyric="true"]')?.textContent).toBe('Line two');

    // 2. Paused -> same DOM node preserved (no remount), switches to vinyl-disc-paused
    mount(
      <LyricsPanel
        currentTrack={fallbackOnly}
        isPlaying={false}
        currentTime={6}
        lyrics={lyrics}
        ambientColors={{ primary: '#059669', glow: '#0d9488' }}
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

    // 3. Resumed -> same DOM node preserved, resumes vinyl-disc-running
    mount(
      <LyricsPanel
        currentTrack={fallbackOnly}
        isPlaying={true}
        currentTime={7}
        lyrics={lyrics}
        ambientColors={{ primary: '#059669', glow: '#0d9488' }}
        isOpen={true}
        onClose={() => {}}
        onSeekTo={() => {}}
      />
    );
    const discResumed = container.querySelector('[data-testid="lyrics-vinyl-disc"]');
    expect(discResumed).toBe(discEl);
    expect(discResumed?.className).toContain('vinyl-disc-running');

    // 4. Track with real album artwork -> renders actual artwork inside rotating circular element
    mount(
      <LyricsPanel
        currentTrack={withArt}
        isPlaying={true}
        currentTime={0}
        lyrics={[]}
        ambientColors={{ primary: '#4f46e5', glow: '#7c3aed' }}
        isOpen={true}
        onClose={() => {}}
        onSeekTo={() => {}}
      />
    );
    const discArt = container.querySelector('[data-testid="lyrics-vinyl-disc"]');
    expect(discArt?.querySelector('img')?.getAttribute('src')).toBe('blob:cover-art-1');

    // 5. No current track -> no rotating disc rendered
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
