import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BottomPlayer } from '../src/components/BottomPlayer';
import { TrackItem } from '../src/types/music';

describe('BottomPlayer Right-Sidebar Toggle Consolidation', () => {
  const mockTrackWithLyrics: TrackItem = {
    id: 'f1:song.mp3',
    name: 'song.mp3',
    relativePath: 'song.mp3',
    size: 5000000,
    lastModified: 1700000000,
    metadata: {
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      album: 'A Night at the Opera',
      duration: 354,
      isMetadataLoaded: true,
    },
  };

  const createProps = (overrides: Partial<React.ComponentProps<typeof BottomPlayer>> = {}) => ({
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    isMuted: false,
    repeatMode: 'off' as const,
    shuffle: false,
    isFavourite: false,
    isNowPlayingOpen: false,
    onTogglePlay: vi.fn(),
    onNextTrack: vi.fn(),
    onPrevTrack: vi.fn(),
    onSeek: vi.fn(),
    onVolumeChange: vi.fn(),
    onToggleMute: vi.fn(),
    onCycleRepeat: vi.fn(),
    onToggleShuffle: vi.fn(),
    onToggleFavourite: vi.fn(),
    onToggleNowPlaying: vi.fn(),
    ...overrides,
  });

  describe('1. Exactly One Authoritative Right-Sidebar Toggle Button', () => {
    it('renders exactly one toggle button when no track is loaded', () => {
      const html = renderToStaticMarkup(<BottomPlayer {...createProps({ currentTrack: null })} />);

      // Exactly one authoritative toggle
      const matches = html.match(/data-testid="now-playing-toggle-button"/g) || [];
      expect(matches.length).toBe(1);

      // No redundant lyrics / document button
      expect(html).not.toContain('Toggle Synchronized Lyrics');
      expect(html).not.toContain('lucide-file-text');
    });

    it('renders exactly one toggle button when a track with lyrics is active', () => {
      const html = renderToStaticMarkup(
        <BottomPlayer {...createProps({ currentTrack: mockTrackWithLyrics })} />
      );

      const matches = html.match(/data-testid="now-playing-toggle-button"/g) || [];
      expect(matches.length).toBe(1);

      // No duplicate button appears regardless of lyrics availability
      expect(html).not.toContain('Toggle Synchronized Lyrics');
      expect(html).not.toContain('lucide-file-text');
    });

    it('renders exactly one toggle button during active playback', () => {
      const html = renderToStaticMarkup(
        <BottomPlayer
          {...createProps({
            currentTrack: mockTrackWithLyrics,
            isPlaying: true,
            currentTime: 45,
          })}
        />
      );

      const matches = html.match(/data-testid="now-playing-toggle-button"/g) || [];
      expect(matches.length).toBe(1);
    });
  });

  describe('2. State Reflection & Accessibility Attributes', () => {
    it('reflects collapsed state with aria-expanded="false" and appropriate label when closed', () => {
      const html = renderToStaticMarkup(
        <BottomPlayer {...createProps({ isNowPlayingOpen: false })} />
      );

      expect(html).toContain('data-testid="now-playing-toggle-button"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain('aria-label="Show Now Playing panel"');
      expect(html).toContain('title="Show Now Playing panel"');
      // Inactive styling
      expect(html).toContain('border-transparent');
    });

    it('reflects expanded state with aria-expanded="true" and active purple styling when open', () => {
      const html = renderToStaticMarkup(
        <BottomPlayer {...createProps({ isNowPlayingOpen: true })} />
      );

      expect(html).toContain('data-testid="now-playing-toggle-button"');
      expect(html).toContain('aria-expanded="true"');
      expect(html).toContain('aria-label="Hide Now Playing panel"');
      expect(html).toContain('title="Hide Now Playing panel"');
      // Active styling
      expect(html).toContain('bg-indigo-600/20');
      expect(html).toContain('border-indigo-500/40');
    });

    it('provides keyboard focus-visible ring styles for accessible navigation', () => {
      const html = renderToStaticMarkup(
        <BottomPlayer {...createProps({ isNowPlayingOpen: false })} />
      );

      expect(html).toContain('focus-visible:ring-2');
      expect(html).toContain('focus-visible:ring-indigo-500/70');
      expect(html).toContain('focus:outline-none');
    });
  });

  describe('3. Invariant Right Section Structure Across Track Changes', () => {
    it('maintains identical element count in right section whether track is active or not', () => {
      const htmlNoTrack = renderToStaticMarkup(
        <BottomPlayer {...createProps({ currentTrack: null })} />
      );
      const htmlWithTrack = renderToStaticMarkup(
        <BottomPlayer {...createProps({ currentTrack: mockTrackWithLyrics })} />
      );

      // Extract right section
      const getRightSectionButtons = (html: string) => {
        const rightSectionStart = html.indexOf('justify-end');
        const rightSection = html.slice(rightSectionStart);
        return (rightSection.match(/<button/g) || []).length;
      };

      // Both must have exactly 2 buttons: Mute/Unmute and NowPlaying toggle
      expect(getRightSectionButtons(htmlNoTrack)).toBe(2);
      expect(getRightSectionButtons(htmlWithTrack)).toBe(2);
    });
  });
});
