import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrackItem } from '../src/types/music';
import {
  getTrackRowSurfaceClass,
  resolveTrackRowVisualState,
  TRACK_PLAYING_BADGE_CLASS,
} from '../src/utils/trackRowStyles';
import { TrackRow } from '../src/components/TrackRow';
import { NowPlayingQueueRow } from '../src/components/NowPlayingQueueRow';

const sampleTrack: TrackItem = {
  id: 'fsa_1:Music/Song.mp3',
  name: 'Song.mp3',
  relativePath: 'Music/Song.mp3',
  size: 2048,
  lastModified: 1000,
  status: 'normal',
  metadata: {
    title: '不谓侠',
    artist: '傲寒同学',
    album: '不谓侠(江南版)',
    duration: 265,
    isMetadataLoaded: true,
  },
};

const baseLibraryProps = {
  track: sampleTrack,
  index: 4,
  isCurrent: false,
  isPlaying: false,
  isSelected: false,
  showCheckboxes: false,
  favourites: new Set<string>(),
  allTracks: [sampleTrack],
  isPlaylistMode: false,
  activeMenuTrackId: null,
  onToggleMenu: vi.fn(),
  onRowClick: vi.fn(),
  onCheckboxClick: vi.fn(),
  onPlayTrack: vi.fn(),
  onTogglePlay: vi.fn(),
  onToggleFavourite: vi.fn(),
  onOpenPlaylistModal: vi.fn(),
  onTouchStart: vi.fn(),
  onTouchEnd: vi.fn(),
  showToast: vi.fn(),
};

const baseQueueProps = {
  track: sampleTrack,
  originalIndex: 4,
  isCurrent: false,
  isPlaying: false,
  isFavourite: false,
  isSelectMode: false,
  isSelected: false,
  isMenuOpen: false,
  onPlayQueueTrack: vi.fn(),
  onToggleFavourite: vi.fn(),
  onToggleSelect: vi.fn(),
  onToggleMenu: vi.fn(),
  onPlayNext: vi.fn(),
  onAddToPlaylist: vi.fn(),
  onOpenTrackInfo: vi.fn(),
  onRemoveFromQueue: vi.fn(),
};

describe('Unified Currently-Playing Highlight (Option 3)', () => {
  it('enforces explicit row visual-state priority: current-selected > current > selected > default', () => {
    expect(resolveTrackRowVisualState({ isCurrent: true, isSelected: true })).toBe('current-selected');
    expect(resolveTrackRowVisualState({ isCurrent: true, isSelected: false })).toBe('current');
    expect(resolveTrackRowVisualState({ isCurrent: false, isSelected: true })).toBe('selected');
    expect(resolveTrackRowVisualState({ isCurrent: false, isSelected: false })).toBe('default');

    expect(getTrackRowSurfaceClass('current')).toBe('track-row-current');
    expect(getTrackRowSurfaceClass('current-selected')).toContain('track-row-current');
    expect(getTrackRowSurfaceClass('current-selected')).toContain('ring-1');
    expect(getTrackRowSurfaceClass('selected')).toBe('track-row-selected');
    expect(getTrackRowSurfaceClass('selected')).not.toBe(getTrackRowSurfaceClass('current'));
    expect(getTrackRowSurfaceClass('default')).toContain('hover:bg-[var(--bg-hover)]/75');
    expect(TRACK_PLAYING_BADGE_CLASS).toContain('track-playing-badge');
    expect(TRACK_PLAYING_BADGE_CLASS).toContain('w-7 h-7');
    expect(TRACK_PLAYING_BADGE_CLASS).not.toContain('rounded-lg');
  });

  it('renders identical Option 3 highlight surface, badge, and actions in Library TrackRow and NowPlayingQueueRow', () => {
    const libHtml = renderToStaticMarkup(
      <TrackRow {...baseLibraryProps} isCurrent={true} isPlaying={true} />
    );
    const queueHtml = renderToStaticMarkup(
      <NowPlayingQueueRow {...baseQueueProps} isCurrent={true} isPlaying={true} />
    );

    for (const html of [libHtml, queueHtml]) {
      expect(html).toContain('data-current="true"');
      expect(html).toContain('data-row-state="current"');
      expect(html).toContain('track-row-current');
      expect(html).toContain('track-playing-badge');
      expect(html).toContain('focus-visible:ring-2');
      expect(html).toContain('rounded-xl border');
    }

    // Favourite button & three-dot menu trigger remain intact in both views
    expect(libHtml).toContain(`data-testid="track-favourite-${sampleTrack.id}"`);
    expect(libHtml).toContain(`data-testid="track-menu-button-${sampleTrack.id}"`);
    expect(queueHtml).toContain('data-testid="queue-favourite-button-4"');
    expect(queueHtml).toContain('data-testid="queue-menu-button-4"');
  });

  it('renders current-selected state cleanly when currently playing row is also selected', () => {
    const html = renderToStaticMarkup(
      <TrackRow {...baseLibraryProps} isCurrent={true} isPlaying={true} isSelected={true} showCheckboxes={true} />
    );
    expect(html).toContain('data-row-state="current-selected"');
    expect(html).toContain('track-row-current');
    expect(html).toContain('ring-1');
    expect(html).toContain(`data-testid="track-checkbox-${sampleTrack.id}"`);
  });

  it('defines theme-aware Option 3 CSS tokens for warm, neutral, mist, and dark modes in src/index.css', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).toContain('--track-current-bg:');
    expect(css).toContain('--track-current-border:');
    expect(css).toContain('--track-current-glow:');
    expect(css).toContain('.track-row-current');
    expect(css).toContain('.track-row-current:hover');
    expect(css).toMatch(/\.track-playing-badge\s*\{[\s\S]*background:\s*transparent;[\s\S]*border:\s*none;[\s\S]*box-shadow:\s*none;/);
    expect(css).not.toContain('--track-playing-badge-bg:');
    expect(css).not.toContain('--track-playing-badge-border:');
    expect(css).not.toContain('--track-playing-badge-shadow:');
    // Verify overrides exist for neutral, mist, and dark themes
    expect(css).toMatch(/\[data-light-style="neutral"\][\s\S]*--track-current-bg:/);
    expect(css).toMatch(/\[data-light-style="mist"\][\s\S]*--track-current-bg:/);
    expect(css).toMatch(/\.dark\s*\{[\s\S]*--track-current-bg:/);
  });

  it('renders transparent playing indicator with animated equalizer bars when playing and static bars when paused', () => {
    const playingHtml = renderToStaticMarkup(
      <TrackRow {...baseLibraryProps} isCurrent={true} isPlaying={true} />
    );
    const pausedHtml = renderToStaticMarkup(
      <TrackRow {...baseLibraryProps} isCurrent={true} isPlaying={false} />
    );

    expect(playingHtml).toContain('track-playing-badge');
    expect(playingHtml).toContain('animate-bar-1');
    expect(playingHtml).toContain('animate-bar-2');
    expect(playingHtml).toContain('animate-bar-3');

    expect(pausedHtml).toContain('track-playing-badge');
    expect(pausedHtml).not.toContain('animate-bar-1');
    expect(pausedHtml).toContain('h-[45%]');
  });
});
