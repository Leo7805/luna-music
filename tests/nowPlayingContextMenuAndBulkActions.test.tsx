// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Playlist, TrackItem } from '../src/types/music';
import { NowPlayingView } from '../src/components/NowPlayingView';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';
import { getTrackRowSurfaceClass } from '../src/utils/trackRowStyles';

function makeTrack(id: string, title = id): TrackItem {
  return {
    id,
    name: `${title}.mp3`,
    relativePath: `Music/${title}.mp3`,
    size: 4096,
    lastModified: 1000,
    status: 'normal',
    file: new Blob(['audio'], { type: 'audio/mpeg' }) as unknown as File,
    metadata: { title, artist: 'Artist', album: 'Album', duration: 200, isMetadataLoaded: true },
  };
}

class FakeAudioElement extends EventTarget {
  src = '';
  preload = 'metadata';
  volume = 1;
  currentTime = 0;
  duration = 200;
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

describe('Now Playing — Shared Context Menu, Selection Lifecycle & Bulk Actions', () => {
  const tMelbourne = makeTrack('t-melbourne', '墨尔本的秋天');
  const tPanama = makeTrack('t-panama', 'Panama');
  const tLikeYou = makeTrack('t-likeyou', '喜欢你');
  const tYoung = makeTrack('t-young', '多想还小');
  const tExtra = makeTrack('t-extra', 'Extra Song');

  const samplePlaylists: Playlist[] = [
    {
      id: 'pl-1',
      name: 'Chill Mix',
      tracks: [],
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  let host: HTMLDivElement;
  let root: Root;
  let fakeAudio: FakeAudioElement;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.clear();
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

  function clickEl(el: Element | null, msg?: string) {
    expect(el, msg).not.toBeNull();
    act(() => {
      (el as HTMLElement).click();
    });
  }

  function rightClickEl(el: Element | null, clientX = 120, clientY = 180) {
    expect(el).not.toBeNull();
    act(() => {
      el!.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY })
      );
    });
  }

  function pressEscape() {
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
  }

  function getRenderedTitles(): string[] {
    return Array.from(host.querySelectorAll<HTMLElement>('[data-testid^="queue-row-"]')).map(
      (row) => (row.querySelector<HTMLElement>('span[title]')?.textContent || '').trim()
    );
  }

  function mountStandalone(overrides: Partial<React.ComponentProps<typeof NowPlayingView>> = {}) {
    const spies = {
      onPlayQueueTrack: vi.fn(),
      onPlayNext: vi.fn(),
      onPlayNextBulk: vi.fn(),
      onRemoveFromQueue: vi.fn(),
      onRemoveTracksFromQueue: vi.fn((indices: number[]) => indices.length),
      onSaveQueueAsPlaylist: vi.fn(),
      onAddToPlaylist: vi.fn(() => true),
      onAddTracksToPlaylist: vi.fn((_plId: string, tracks: TrackItem[]) => ({
        addedCount: tracks.length,
      })),
      onCreateAndAddToPlaylist: vi.fn(),
    };

    const props: React.ComponentProps<typeof NowPlayingView> = {
      queue: [tMelbourne, tPanama, tLikeYou, tYoung],
      currentTrack: tMelbourne,
      isPlaying: true,
      playlists: samplePlaylists,
      favourites: new Set(),
      libraryTracks: [tMelbourne, tPanama, tLikeYou, tYoung],
      theme: 'dark',
      lightStyle: 'warm',
      onSelectTheme: () => {},
      onSelectLightStyle: () => {},
      onOpenShortcutsModal: () => {},
      ...spies,
      ...overrides,
    };

    act(() => root.render(<NowPlayingView {...props} />));
    return { spies, props };
  }

  function mountWithAudioPlayer(options: {
    initialQueue: TrackItem[];
    initialShuffle: boolean;
  }) {
    let api!: ReturnType<typeof useAudioPlayer>;
    const onAddTracksToPlaylist = vi.fn((_plId: string, tracks: TrackItem[]) => ({
      addedCount: tracks.length,
    }));

    function Harness() {
      const player = useAudioPlayer({
        libraryTracks: options.initialQueue,
        initialShuffle: options.initialShuffle,
        initialRepeatMode: 'off',
      });
      api = player;

      return (
        <NowPlayingView
          queue={player.queue}
          currentTrack={player.currentTrack}
          isPlaying={player.isPlaying}
          playlists={samplePlaylists}
          favourites={new Set()}
          libraryTracks={options.initialQueue}
          theme="light"
          lightStyle="warm"
          onPlayQueueTrack={player.playQueueTrack}
          onPlayNext={player.playNext}
          onPlayNextBulk={player.playNextBulk}
          onRemoveFromQueue={player.removeFromQueue}
          onRemoveTracksFromQueue={player.removeTracksFromQueue}
          onSaveQueueAsPlaylist={() => {}}
          onAddToPlaylist={() => true}
          onAddTracksToPlaylist={onAddTracksToPlaylist}
          onCreateAndAddToPlaylist={() => {}}
          onSelectTheme={() => {}}
          onSelectLightStyle={() => {}}
          onOpenShortcutsModal={() => {}}
        />
      );
    }

    act(() => root.render(<Harness />));
    act(() => api.playQueue(options.initialQueue, 0));
    return { getPlayer: () => api, onAddTracksToPlaylist };
  }

  it('1 & 2 & 19 & 20: Right-click and ··· open the same single-track menu without triggering playback, and Escape closes it', () => {
    const { spies } = mountStandalone();

    // Right-click row 2 (喜欢你)
    rightClickEl(host.querySelector('[data-testid="queue-row-2"]'));
    expect(spies.onPlayQueueTrack).not.toHaveBeenCalled();

    const menuByRightClick = document.body.querySelector('[data-testid="queue-menu-dropdown-2"]');
    expect(menuByRightClick).not.toBeNull();
    expect(menuByRightClick?.getAttribute('data-menu-mode')).toBe('single');
    expect(document.body.querySelector('[data-testid="queue-play-now-action-2"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="queue-play-next-action-2"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="queue-track-info-action-2"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="queue-remove-action-2"]')).not.toBeNull();

    // Escape closes menu
    pressEscape();
    expect(document.body.querySelector('[data-queue-context-menu]')).toBeNull();

    // Clicking ··· opens the exact same menu
    clickEl(host.querySelector('[data-testid="queue-menu-button-2"]'));
    expect(spies.onPlayQueueTrack).not.toHaveBeenCalled();
    const menuByButton = document.body.querySelector('[data-testid="queue-menu-dropdown-2"]');
    expect(menuByButton).not.toBeNull();
    expect(menuByButton?.getAttribute('data-menu-mode')).toBe('single');
    expect(document.body.querySelector('[data-testid="queue-play-next-action-2"]')).not.toBeNull();
  });

  it('Simplified selection toolbar shows selection count only (no red Remove Selected button) and Done clears selection (Case 18)', () => {
    mountStandalone();

    clickEl(host.querySelector('[data-testid="queue-select-mode-button"]'));
    expect(host.querySelector('[data-testid="queue-selection-count"]')?.textContent).toContain('0 selected');
    expect(host.querySelector('[data-testid="queue-remove-selected-button"]')).toBeNull();

    clickEl(host.querySelector('[data-testid="queue-checkbox-2"]'));
    clickEl(host.querySelector('[data-testid="queue-checkbox-3"]'));
    expect(host.querySelector('[data-testid="queue-selection-count"]')?.textContent).toContain('2 selected');

    // Click Done -> exits select mode and clears selection
    clickEl(host.querySelector('[data-testid="queue-select-mode-button"]'));
    expect(host.querySelector('[data-testid="queue-bulk-bar"]')).toBeNull();
    // Re-enter select mode -> selection was cleared
    clickEl(host.querySelector('[data-testid="queue-select-mode-button"]'));
    expect(host.querySelector('[data-testid="queue-selection-count"]')?.textContent).toContain('0 selected');
  });

  it('3, 4, 5, 15: Multi-selection opens multi-track menu on selected rows, preserves selection on unselected right-click, single selection uses single-track menu, and current track cannot be selected', () => {
    mountStandalone();
    clickEl(host.querySelector('[data-testid="queue-select-mode-button"]'));

    // Case 15: Current playing track checkbox is disabled and cannot be selected
    const currentCheckbox = host.querySelector<HTMLButtonElement>('[data-testid="queue-checkbox-0"]');
    expect(currentCheckbox?.disabled).toBe(true);
    clickEl(host.querySelector('[data-testid="queue-row-0"]'));
    expect(host.querySelector('[data-testid="queue-selection-count"]')?.textContent).toContain('0 selected');

    // Case 5: Single selected track -> single-track menu
    clickEl(host.querySelector('[data-testid="queue-checkbox-2"]'));
    rightClickEl(host.querySelector('[data-testid="queue-row-2"]'));
    expect(document.body.querySelector('[data-testid="queue-menu-dropdown-2"]')?.getAttribute('data-menu-mode')).toBe('single');
    pressEscape();

    // Case 3: Select second track -> multi-track menu via right-click AND via ···
    clickEl(host.querySelector('[data-testid="queue-checkbox-3"]'));
    rightClickEl(host.querySelector('[data-testid="queue-row-2"]'));
    expect(document.body.querySelector('[data-testid="queue-menu-selection-header"]')?.textContent).toBe('2 tracks selected');
    expect(document.body.querySelector('[data-testid="queue-menu-bulk-play-next"]')?.textContent).toContain('Play Next (2)');
    expect(document.body.querySelector('[data-testid="queue-menu-bulk-add-playlist"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="queue-menu-bulk-remove"]')?.textContent).toContain('Remove Selected (2)');
    expect(document.body.querySelector('[data-testid="queue-track-info-action-2"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="queue-play-next-action-2"]')).toBeNull();
    pressEscape();

    clickEl(host.querySelector('[data-testid="queue-menu-button-3"]'));
    expect(document.body.querySelector('[data-testid="queue-menu-dropdown-3"]')?.getAttribute('data-menu-mode')).toBe('multi');
    pressEscape();

    // Case 4: Right-clicking an unselected row (index 1: Panama) opens single-track menu and preserves existing 2-track selection
    rightClickEl(host.querySelector('[data-testid="queue-row-1"]'));
    expect(document.body.querySelector('[data-testid="queue-menu-dropdown-1"]')?.getAttribute('data-menu-mode')).toBe('single');
    expect(host.querySelector('[data-testid="queue-selection-count"]')?.textContent).toContain('2 selected');
  });

  it('6 & 10: Multi-track Play Next calls onPlayNextBulk() exactly once in canonical Queue order even when selected in reverse order', () => {
    const { spies } = mountStandalone();
    clickEl(host.querySelector('[data-testid="queue-select-mode-button"]'));

    // Select index 3 (多想还小) first, then index 2 (喜欢你)
    clickEl(host.querySelector('[data-testid="queue-checkbox-3"]'));
    clickEl(host.querySelector('[data-testid="queue-checkbox-2"]'));

    clickEl(host.querySelector('[data-testid="queue-menu-button-3"]'));
    clickEl(document.body.querySelector('[data-testid="queue-menu-bulk-play-next"]'));

    expect(spies.onPlayNextBulk).toHaveBeenCalledTimes(1);
    expect(spies.onPlayNext).not.toHaveBeenCalled();
    expect(spies.onPlayNextBulk).toHaveBeenCalledWith([tLikeYou, tYoung]);
    // Exits selection mode and closes menu
    expect(host.querySelector('[data-testid="queue-bulk-bar"]')).toBeNull();
    expect(document.body.querySelector('[data-queue-context-menu]')).toBeNull();
  });

  it('7 & 8: Screenshot scenario (Shuffle OFF) moves [喜欢你, 多想还小] immediately after 墨尔本的秋天 and Next follows visible Queue order', () => {
    const { getPlayer } = mountWithAudioPlayer({
      initialQueue: [tMelbourne, tPanama, tLikeYou, tYoung],
      initialShuffle: false,
    });

    expect(getRenderedTitles()).toEqual(['墨尔本的秋天', 'Panama', '喜欢你', '多想还小']);
    fakeAudio.currentTime = 45;

    // Select 喜欢你 and 多想还小, trigger Bulk Play Next via row ··· menu
    clickEl(host.querySelector('[data-testid="queue-select-mode-button"]'));
    clickEl(host.querySelector('[data-testid="queue-checkbox-2"]'));
    clickEl(host.querySelector('[data-testid="queue-checkbox-3"]'));
    clickEl(host.querySelector('[data-testid="queue-menu-button-2"]'));
    clickEl(document.body.querySelector('[data-testid="queue-menu-bulk-play-next"]'));

    // Current track & playback position untouched
    expect(getPlayer().currentTrack?.id).toBe(tMelbourne.id);
    expect(fakeAudio.currentTime).toBe(45);

    // Immediate visible Queue order matches exact requirement
    expect(getRenderedTitles()).toEqual(['墨尔本的秋天', '喜欢你', '多想还小', 'Panama']);

    // Actual Next navigation follows visible Queue order
    act(() => getPlayer().nextTrack());
    expect(getPlayer().currentTrack?.id).toBe(tLikeYou.id);
    act(() => getPlayer().nextTrack());
    expect(getPlayer().currentTrack?.id).toBe(tYoung.id);
    act(() => getPlayer().nextTrack());
    expect(getPlayer().currentTrack?.id).toBe(tPanama.id);
  });

  it('9: Shuffle ON plays the Bulk Play Next batch [喜欢你, 多想还小] consecutively before resuming Shuffle', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { getPlayer } = mountWithAudioPlayer({
      initialQueue: [tMelbourne, tPanama, tLikeYou, tYoung, tExtra],
      initialShuffle: true,
    });

    clickEl(host.querySelector('[data-testid="queue-select-mode-button"]'));
    clickEl(host.querySelector('[data-testid="queue-checkbox-2"]'));
    clickEl(host.querySelector('[data-testid="queue-checkbox-3"]'));
    rightClickEl(host.querySelector('[data-testid="queue-row-3"]'));
    clickEl(document.body.querySelector('[data-testid="queue-menu-bulk-play-next"]'));

    expect(getRenderedTitles()).toEqual(['墨尔本的秋天', '喜欢你', '多想还小', 'Panama', 'Extra Song']);

    act(() => getPlayer().nextTrack());
    expect(getPlayer().currentTrack?.id).toBe(tLikeYou.id);
    act(() => getPlayer().nextTrack());
    expect(getPlayer().currentTrack?.id).toBe(tYoung.id);
    // Resumes Shuffle on remaining {Panama, Extra Song}
    act(() => getPlayer().nextTrack());
    expect([tPanama.id, tExtra.id]).toContain(getPlayer().currentTrack?.id);
  });

  it('11: Filtering the Queue preserves canonical original indices for bulk operations', () => {
    const { spies } = mountStandalone({
      queue: [tMelbourne, tPanama, tLikeYou, tYoung],
      currentTrack: tMelbourne,
    });

    clickEl(host.querySelector('[data-testid="queue-select-mode-button"]'));
    const searchInput = host.querySelector<HTMLInputElement>('[data-testid="queue-search-input"]')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(searchInput, '喜欢');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // Row with originalIndex 2 is visible
    clickEl(host.querySelector('[data-testid="queue-checkbox-2"]'));

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(searchInput, '多想');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    clickEl(host.querySelector('[data-testid="queue-checkbox-3"]'));

    clickEl(host.querySelector('[data-testid="queue-menu-button-3"]'));
    clickEl(document.body.querySelector('[data-testid="queue-menu-bulk-play-next"]'));

    expect(spies.onPlayNextBulk).toHaveBeenCalledExactlyOnceWith([tLikeYou, tYoung]);
  });

  it('12 & 13: Bulk Remove opens confirmation modal; Cancel preserves selection; Confirm removes selected indices and exits select mode', () => {
    const { spies } = mountStandalone();
    clickEl(host.querySelector('[data-testid="queue-select-mode-button"]'));
    clickEl(host.querySelector('[data-testid="queue-checkbox-3"]'));
    clickEl(host.querySelector('[data-testid="queue-checkbox-1"]'));

    // Open multi-track menu and click Remove Selected
    rightClickEl(host.querySelector('[data-testid="queue-row-1"]'));
    clickEl(document.body.querySelector('[data-testid="queue-menu-bulk-remove"]'));

    // Cancel confirmation -> selection is preserved, queue untouched
    const cancelBtn = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === 'Cancel'
    );
    clickEl(cancelBtn ?? null, 'Cancel button in ConfirmModal');
    expect(spies.onRemoveTracksFromQueue).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="queue-selection-count"]')?.textContent).toContain('2 selected');

    // Open menu again and confirm removal -> canonical sorted indices [1, 3]
    rightClickEl(host.querySelector('[data-testid="queue-row-3"]'));
    clickEl(document.body.querySelector('[data-testid="queue-menu-bulk-remove"]'));
    const confirmBtn = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === 'Remove from Queue'
    );
    clickEl(confirmBtn ?? null, 'Confirm Remove button');

    expect(spies.onRemoveTracksFromQueue).toHaveBeenCalledExactlyOnceWith([1, 3]);
    expect(host.querySelector('[data-testid="queue-bulk-bar"]')).toBeNull();
  });

  it('14: Bulk Add to Playlist opens existing playlist modal with the canonical selected tracks collection', () => {
    const { spies } = mountStandalone();
    clickEl(host.querySelector('[data-testid="queue-select-mode-button"]'));
    clickEl(host.querySelector('[data-testid="queue-checkbox-3"]'));
    clickEl(host.querySelector('[data-testid="queue-checkbox-2"]'));

    clickEl(host.querySelector('[data-testid="queue-menu-button-2"]'));
    clickEl(document.body.querySelector('[data-testid="queue-menu-bulk-add-playlist"]'));

    // Click existing playlist "Chill Mix" in PlaylistModal
    const playlistBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Chill Mix')
    );
    clickEl(playlistBtn ?? null, 'Chill Mix playlist option');

    expect(spies.onAddTracksToPlaylist).toHaveBeenCalledExactlyOnceWith('pl-1', [tLikeYou, tYoung]);
    expect(host.querySelector('[data-testid="queue-bulk-bar"]')).toBeNull();
  });

  it('16 & 17: Playing and Selected rows use visually distinct classes and theme-aware CSS tokens for Light and Dark modes', () => {
    expect(getTrackRowSurfaceClass('current')).toBe('track-row-current');
    expect(getTrackRowSurfaceClass('selected')).toBe('track-row-selected');
    expect(getTrackRowSurfaceClass('current')).not.toBe(getTrackRowSurfaceClass('selected'));

    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).toContain('.track-row-current');
    expect(css).toContain('inset 3px 0 0 0 var(--track-current-accent)');
    expect(css).toContain('.track-row-selected');
    expect(css).toContain('--track-selected-bg:');
    expect(css).toContain('--track-selected-border:');
    expect(css).toContain('--track-selected-accent:');
    expect(css).toMatch(/\.dark\s*\{[\s\S]*--track-selected-bg:/);
  });
});
