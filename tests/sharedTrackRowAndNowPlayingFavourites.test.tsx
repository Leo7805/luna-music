import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrackItem, FileStatus } from '../src/types/music';
import { TRACK_ROW_GRID_CLASS } from '../src/components/TrackRowLayout';
import { TrackPlayingIndicator } from '../src/components/TrackPlayingIndicator';
import { TrackFavouriteButton } from '../src/components/TrackFavouriteButton';
import { TrackActionMenuTrigger } from '../src/components/TrackActionMenuTrigger';
import { TrackListHeader } from '../src/components/TrackListHeader';
import { TrackRow } from '../src/components/TrackRow';
import { NowPlayingQueueRow } from '../src/components/NowPlayingQueueRow';
import { NowPlayingView } from '../src/components/NowPlayingView';
import { isFavouriteTrack } from '../src/utils/favouriteResolvers';

function makeTrack(
  id: string,
  title: string,
  opts: {
    ext?: string;
    artist?: string;
    album?: string;
    duration?: number;
    status?: FileStatus;
    aliases?: string[];
    relativePath?: string;
    lrcContent?: string;
  } = {}
): TrackItem {
  const ext = opts.ext ?? 'mp3';
  const name = `${title}.${ext}`;
  return {
    id,
    name,
    relativePath: opts.relativePath ?? `Music/${name}`,
    size: 4096,
    lastModified: 1000,
    status: opts.status ?? 'normal',
    aliases: opts.aliases,
    lrcContent: opts.lrcContent,
    metadata: {
      title,
      artist: opts.artist ?? 'Test Artist',
      album: opts.album ?? 'Test Album',
      duration: opts.duration ?? 215,
      isMetadataLoaded: true,
    },
  };
}

function findReactElements(
  node: React.ReactNode,
  predicate: (el: React.ReactElement<any>) => boolean,
  results: React.ReactElement<any>[] = []
): React.ReactElement<any>[] {
  if (!node) return results;
  if (Array.isArray(node)) {
    for (const child of node) findReactElements(child, predicate, results);
    return results;
  }
  if (React.isValidElement<any>(node)) {
    const props = node.props as any;
    if (predicate(node)) results.push(node);
    if (props?.children) {
      findReactElements(props.children, predicate, results);
    }
  }
  return results;
}

function renderComponentTree<P>(
  Component: React.ComponentType<P>,
  props: P
): React.ReactElement<any> {
  let root: any = null;
  function Capture() {
    root = (Component as any)(props);
    return null;
  }
  renderToStaticMarkup(<Capture />);
  return root;
}

describe('Shared Track Row UI & Now Playing Favourites', () => {
  const trackA = makeTrack('fsa_1:Music/Alpha.mp3', 'Alpha', {
    ext: 'flac',
    artist: 'Artist A',
    album: 'Album A',
    duration: 245,
    lrcContent: '[00:01.00]Hello',
  });
  const trackB = makeTrack('fsa_1:Music/Beta.mp3', 'Beta', {
    artist: 'Artist B',
    album: 'Album B',
    duration: 180,
    aliases: ['fsa_old:Music/Beta.mp3'],
  });
  const unavailableTrack = makeTrack('fsa_old:Music/Missing.mp3', 'Missing Song', {
    artist: 'Ghost Artist',
    album: 'Ghost Album',
    duration: 199,
    status: 'unreadable',
  });

  const baseTrackRowProps = {
    track: trackA,
    index: 0,
    isCurrent: false,
    isPlaying: false,
    isSelected: false,
    showCheckboxes: false,
    favourites: new Set<string>(),
    allTracks: [trackA, trackB],
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

  const baseQueueRowProps = {
    track: trackA,
    originalIndex: 0,
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

  describe('1. Shared Grid, Headers, Thumbnail, Metadata & Badges', () => {
    it('uses the identical TRACK_ROW_GRID_CLASS across Library header, Library row, Queue header, and Queue row', () => {
      const libHeaderHtml = renderToStaticMarkup(
        <TrackListHeader
          tracksCount={2}
          selectedCount={0}
          isSelectMode={false}
          showCheckboxes={false}
          onToggleSelectMode={() => {}}
          onToggleSelectAll={() => {}}
        />
      );
      const libRowHtml = renderToStaticMarkup(<TrackRow {...baseTrackRowProps} />);
      const queueRowHtml = renderToStaticMarkup(<NowPlayingQueueRow {...baseQueueRowProps} />);
      const queueViewHtml = renderToStaticMarkup(
        <NowPlayingView
          queue={[trackA, trackB]}
          currentTrack={trackA}
          isPlaying={true}
          playlists={[]}
          favourites={new Set()}
          libraryTracks={[trackA, trackB]}
          theme="light"
          lightStyle="warm"
          onPlayQueueTrack={() => {}}
          onToggleFavourite={() => {}}
          onRemoveFromQueue={() => {}}
          onRemoveTracksFromQueue={() => 0}
          onSaveQueueAsPlaylist={() => {}}
          onSelectTheme={() => {}}
          onSelectLightStyle={() => {}}
          onOpenShortcutsModal={() => {}}
        />
      );

      expect(libHeaderHtml).toContain(TRACK_ROW_GRID_CLASS);
      expect(libRowHtml).toContain(TRACK_ROW_GRID_CLASS);
      expect(queueRowHtml).toContain(TRACK_ROW_GRID_CLASS);
      expect(queueViewHtml).toContain(TRACK_ROW_GRID_CLASS);
    });

    it('renders shared thumbnail, metadata, format badge, LRC badge, and unavailable status badge in both Library and Queue rows', () => {
      const libHtml = renderToStaticMarkup(<TrackRow {...baseTrackRowProps} track={trackA} />);
      const queueHtml = renderToStaticMarkup(
        <NowPlayingQueueRow {...baseQueueRowProps} track={trackA} />
      );

      for (const html of [libHtml, queueHtml]) {
        expect(html).toContain('w-10 h-10 rounded-lg');
        expect(html).toContain('Alpha');
        expect(html).toContain('Artist A');
        expect(html).toContain('Album A');
        expect(html).toContain('4:05');
        expect(html).toContain('>FLAC<');
        expect(html).toContain('>LRC<');
      }

      const libUnavailHtml = renderToStaticMarkup(
        <TrackRow {...baseTrackRowProps} track={unavailableTrack} />
      );
      const queueUnavailHtml = renderToStaticMarkup(
        <NowPlayingQueueRow {...baseQueueRowProps} track={unavailableTrack} />
      );

      expect(libUnavailHtml).toContain('Cannot access file');
      expect(queueUnavailHtml).toContain('Cannot access file');
    });

    it('preserves tinted current styling for Library rows and text-only current styling for Queue rows', () => {
      const libCurrentHtml = renderToStaticMarkup(
        <TrackRow {...baseTrackRowProps} isCurrent={true} isPlaying={true} />
      );
      const queueCurrentHtml = renderToStaticMarkup(
        <NowPlayingQueueRow {...baseQueueRowProps} isCurrent={true} isPlaying={true} />
      );

      expect(libCurrentHtml).toContain('bg-[var(--bg-active)]/70');
      expect(queueCurrentHtml).not.toContain('bg-[var(--bg-active)]');
      expect(queueCurrentHtml).toContain('font-semibold text-[var(--accent-primary)] dark:text-white');
    });
  });

  describe('2. Unified Playing & Paused Indicator + Reduced Motion', () => {
    it('renders animated 3-bar equalizer when playing and static 3-bar equalizer when paused in BOTH Library and Queue rows', () => {
      const libPlaying = renderToStaticMarkup(
        <TrackRow {...baseTrackRowProps} isCurrent={true} isPlaying={true} />
      );
      const libPaused = renderToStaticMarkup(
        <TrackRow {...baseTrackRowProps} isCurrent={true} isPlaying={false} />
      );
      const queuePlaying = renderToStaticMarkup(
        <NowPlayingQueueRow {...baseQueueRowProps} isCurrent={true} isPlaying={true} />
      );
      const queuePaused = renderToStaticMarkup(
        <NowPlayingQueueRow {...baseQueueRowProps} isCurrent={true} isPlaying={false} />
      );

      for (const html of [libPlaying, queuePlaying]) {
        expect(html).toContain('data-playing="true"');
        expect(html).toContain('animate-bar-1');
        expect(html).toContain('animate-bar-2');
        expect(html).toContain('animate-bar-3');
      }

      for (const html of [libPaused, queuePaused]) {
        expect(html).toContain('data-playing="false"');
        expect(html).not.toContain('animate-bar-1');
        expect(html).toContain('h-[45%]');
        expect(html).toContain('h-[85%]');
        expect(html).toContain('h-[60%]');
      }
    });

    it('matches aliased current tracks in NowPlayingView using isSameTrack', () => {
      const aliasedCurrent = makeTrack('fsa_old:Music/Beta.mp3', 'Beta');
      const html = renderToStaticMarkup(
        <NowPlayingView
          queue={[trackA, trackB]}
          currentTrack={aliasedCurrent}
          isPlaying={true}
          playlists={[]}
          favourites={new Set()}
          libraryTracks={[trackA, trackB]}
          theme="dark"
          lightStyle="warm"
          onPlayQueueTrack={() => {}}
          onToggleFavourite={() => {}}
          onRemoveFromQueue={() => {}}
          onRemoveTracksFromQueue={() => 0}
          onSaveQueueAsPlaylist={() => {}}
          onSelectTheme={() => {}}
          onSelectLightStyle={() => {}}
          onOpenShortcutsModal={() => {}}
        />
      );

      expect(html).toContain('data-testid="queue-row-1" data-current="true"');
      expect(html).toContain('data-testid="queue-playing-indicator" data-playing="true"');
    });

    it('preserves prefers-reduced-motion fallback CSS for equalizer bars', () => {
      const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8');
      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
      expect(css).toContain('.animate-bar-1');
      expect(css).toContain('animation: none');
    });

    it('renders TrackPlayingIndicator with exact testId and aria-label', () => {
      const playingHtml = renderToStaticMarkup(
        <TrackPlayingIndicator isPlaying={true} testId="queue-playing-indicator" />
      );
      const pausedHtml = renderToStaticMarkup(
        <TrackPlayingIndicator isPlaying={false} testId="queue-playing-indicator" />
      );
      expect(playingHtml).toContain('data-testid="queue-playing-indicator" data-playing="true"');
      expect(playingHtml).toContain('aria-label="Playing"');
      expect(pausedHtml).toContain('data-testid="queue-playing-indicator" data-playing="false"');
      expect(pausedHtml).toContain('aria-label="Paused"');
    });
  });

  describe('3. Now Playing Favourites & Cross-View Consistency', () => {
    it('renders Heart button in NowPlayingView reflecting canonical ID, alias, and relativePath favourites', () => {
      const favourites = new Set<string>(['fsa_old:Music/Beta.mp3']);
      const html = renderToStaticMarkup(
        <NowPlayingView
          queue={[trackA, trackB]}
          currentTrack={trackA}
          isPlaying={false}
          playlists={[]}
          favourites={favourites}
          libraryTracks={[trackA, trackB]}
          theme="light"
          lightStyle="warm"
          onPlayQueueTrack={() => {}}
          onToggleFavourite={() => {}}
          onRemoveFromQueue={() => {}}
          onRemoveTracksFromQueue={() => 0}
          onSaveQueueAsPlaylist={() => {}}
          onSelectTheme={() => {}}
          onSelectLightStyle={() => {}}
          onOpenShortcutsModal={() => {}}
        />
      );

      expect(html).toContain('data-testid="queue-favourite-button-0"');
      expect(html).toContain('data-testid="queue-favourite-button-1"');
      // Track B (index 1) is favourited via alias
      expect(html).toContain('aria-label="Remove from favourites" aria-pressed="true"');
      // Track A (index 0) is not favourited
      expect(html).toContain('aria-label="Add to favourites" aria-pressed="false"');

      // Same authoritative matcher used by BottomPlayer and Library
      expect(isFavouriteTrack(trackB, favourites, [trackA, trackB])).toBe(true);
      expect(isFavouriteTrack(trackA, favourites, [trackA, trackB])).toBe(false);
    });

    it('keeps Heart button enabled for unavailable Favourite rows so users can unfavourite them', () => {
      const libHtml = renderToStaticMarkup(
        <TrackRow
          {...baseTrackRowProps}
          track={unavailableTrack}
          favourites={new Set([unavailableTrack.id])}
          allTracks={[unavailableTrack]}
        />
      );
      const queueHtml = renderToStaticMarkup(
        <NowPlayingQueueRow
          {...baseQueueRowProps}
          track={unavailableTrack}
          isFavourite={true}
        />
      );

      expect(libHtml).toContain('aria-label="Remove from favourites" aria-pressed="true"');
      expect(libHtml).not.toContain('disabled="" aria-label="Remove from favourites"');
      expect(queueHtml).toContain('aria-label="Remove from favourites" aria-pressed="true"');
      expect(queueHtml).not.toContain('disabled="" aria-label="Remove from favourites"');
    });

    it('Heart click toggles favourite and stops propagation without triggering Queue playback or selection', () => {
      const onPlayQueueTrack = vi.fn();
      const onToggleSelect = vi.fn();
      const onToggleFavourite = vi.fn();

      const rowLayoutEl = renderComponentTree(NowPlayingQueueRow, {
        ...baseQueueRowProps,
        track: trackB,
        originalIndex: 1,
        onPlayQueueTrack,
        onToggleSelect,
        onToggleFavourite,
      });

      const favButtons = findReactElements(
        rowLayoutEl.props.actionsSlot,
        (el) => el.type === TrackFavouriteButton
      );
      expect(favButtons).toHaveLength(1);

      const favButtonEl = TrackFavouriteButton(favButtons[0].props);
      const stopPropagation = vi.fn();
      favButtonEl.props.onClick({ stopPropagation });

      expect(stopPropagation).toHaveBeenCalledTimes(1);
      expect(onToggleFavourite).toHaveBeenCalledWith(trackB.id);
      expect(onPlayQueueTrack).not.toHaveBeenCalled();
      expect(onToggleSelect).not.toHaveBeenCalled();
    });

    it('Keyboard Enter/Space on Heart or Menu Trigger does NOT trigger parent Queue row playback or selection', () => {
      const onPlayQueueTrack = vi.fn();
      const onToggleSelect = vi.fn();

      const rowLayoutEl = renderComponentTree(NowPlayingQueueRow, {
        ...baseQueueRowProps,
        track: trackB,
        originalIndex: 1,
        isSelectMode: false,
        onPlayQueueTrack,
        onToggleSelect,
      });

      const rowElement = {};
      const childButton = {
        closest: (selector: string) =>
          selector.includes('button') ? {} : null,
      };
      const preventDefault = vi.fn();

      // Enter / Space originating from child button (Heart or Menu trigger) is ignored by row onKeyDown
      rowLayoutEl.props.onKeyDown({
        key: 'Enter',
        target: childButton,
        currentTarget: rowElement,
        preventDefault,
      });
      rowLayoutEl.props.onKeyDown({
        key: ' ',
        target: childButton,
        currentTarget: rowElement,
        preventDefault,
      });
      expect(onPlayQueueTrack).not.toHaveBeenCalled();
      expect(preventDefault).not.toHaveBeenCalled();

      // Enter directly on the row itself still triggers playback
      rowLayoutEl.props.onKeyDown({
        key: 'Enter',
        target: rowElement,
        currentTarget: rowElement,
        preventDefault,
      });
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(onPlayQueueTrack).toHaveBeenCalledWith(trackB);

      // Shared button components also stop Enter/Space propagation
      const favBtn = TrackFavouriteButton({ isFavourite: false, onToggle: vi.fn() });
      const menuBtn = TrackActionMenuTrigger({ isOpen: false, onToggle: vi.fn() });
      const stopFav = vi.fn();
      const stopMenu = vi.fn();
      favBtn.props.onKeyDown({ key: 'Enter', stopPropagation: stopFav });
      menuBtn.props.onKeyDown({ key: ' ', stopPropagation: stopMenu });
      expect(stopFav).toHaveBeenCalledTimes(1);
      expect(stopMenu).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Shared Menu Trigger Consistency', () => {
    it('renders identical aria and open-state styling on TrackActionMenuTrigger', () => {
      const closedHtml = renderToStaticMarkup(
        <TrackActionMenuTrigger isOpen={false} onToggle={() => {}} testId="menu-trigger" />
      );
      const openHtml = renderToStaticMarkup(
        <TrackActionMenuTrigger isOpen={true} onToggle={() => {}} testId="menu-trigger" />
      );

      expect(closedHtml).toContain('aria-expanded="false"');
      expect(closedHtml).toContain('aria-haspopup="menu"');
      expect(closedHtml).toContain('opacity-0 group-hover:opacity-100');

      expect(openHtml).toContain('aria-expanded="true"');
      expect(openHtml).toContain('opacity-100 bg-slate-200/80 dark:bg-white/[0.1]');
    });
  });
});
