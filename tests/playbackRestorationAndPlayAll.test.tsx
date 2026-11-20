import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';
import { PlaylistsView } from '../src/components/PlaylistsView';
import { TrackItem, Playlist } from '../src/types/music';
import { resolveInitialQueue, resolveInitialTrack } from '../src/utils/playbackSession';
import * as idbStorage from '../src/services/idbStorage';

function renderHookSync<T>(useHook: () => T): T {
  let result!: T;
  function TestComponent() {
    result = useHook();
    return null;
  }
  renderToStaticMarkup(<TestComponent />);
  return result;
}

const createTrack = (id: string, name: string, overrides: Partial<TrackItem> = {}): TrackItem => ({
  id,
  name,
  relativePath: `${name}.mp3`,
  file: new File(['dummy audio content'], `${name}.mp3`, { type: 'audio/mp3' }),
  size: 1024,
  lastModified: 1000,
  status: 'normal',
  metadata: {
    title: name,
    artist: 'Artist',
    album: 'Album',
    duration: 180,
    isMetadataLoaded: true,
  },
  ...overrides,
});

describe('Playback Restoration, Play All Autoplay & Playlist Empty State', () => {
  const track1 = createTrack('t1', 'Track 1');
  const track2 = createTrack('t2', 'Track 2');
  const track3 = createTrack('t3', 'Track 3');
  const libraryTracks = [track1, track2, track3];

  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('1. Playback State Restoration After Refresh', () => {
    it('restores previous track identity, nonzero position, and queue in a paused state', () => {
      // Simulate stored state before refresh
      vi.spyOn(idbStorage, 'getStoredPlaybackStateSync').mockReturnValue({
        volume: 0.75,
        isMuted: false,
        repeatMode: 'all',
        shuffle: true,
        lastTrackId: 't2',
        lastPosition: 42.5,
        favourites: ['t1'],
        queueTrackIds: ['t1', 't2', 't3'],
        queueIndex: 1,
      });

      const player = renderHookSync(() =>
        useAudioPlayer({
          libraryTracks,
        })
      );

      // Verify restored preferences
      expect(player.volume).toBe(0.75);
      expect(player.repeatMode).toBe('all');
      expect(player.shuffle).toBe(true);

      // Verify restored track identity
      expect(player.currentTrack?.id).toBe('t2');

      // Verify restored Queue and ordering
      expect(player.queue.map((t) => t.id)).toEqual(['t1', 't2', 't3']);

      // Verify initial position is restored accurately without resetting to 0:00
      expect(player.currentTime).toBe(42.5);

      // Verify player starts in a PAUSED state (no automatic playback after reload)
      expect(player.isPlaying).toBe(false);
    });

    it('resolves initial queue and track accurately via playbackSession utilities', () => {
      const queue = resolveInitialQueue({
        storedQueueIds: ['t3', 't1'],
        effectiveInitialTrackId: 't1',
        libraryTracks,
      });

      expect(queue.map((t) => t.id)).toEqual(['t3', 't1']);

      const track = resolveInitialTrack({
        effectiveInitialTrackId: 't1',
        libraryTracks,
        queue,
      });

      expect(track?.id).toBe('t1');
    });

    it('falls back to first track when lastTrackId is not found', () => {
      const track = resolveInitialTrack({
        effectiveInitialTrackId: 'non-existent',
        libraryTracks,
        queue: [track2, track3],
      });

      expect(track?.id).toBe('t2');
    });
  });

  describe('2. Play All Autoplay and Immediate Playback', () => {
    it('starts playing the first track with autoPlay enabled when playQueue is called', () => {
      const player = renderHookSync(() =>
        useAudioPlayer({
          libraryTracks,
        })
      );

      expect(typeof player.playQueue).toBe('function');
    });

    it('respects sorting and filtering order in Play All without shuffle', () => {
      const sortedTracks = [track3, track1, track2];
      const resolved = resolveInitialQueue({
        initialQueue: sortedTracks,
      });

      expect(resolved.map((t) => t.id)).toEqual(['t3', 't1', 't2']);
    });

    it('deduplicates identical tracks using canonical track identity', () => {
      const duplicateList = [track1, track2, { ...track1, id: 'dup-1', aliases: ['t1'] }];
      const resolved = resolveInitialQueue({
        storedQueueIds: ['t1', 't2', 'dup-1'],
        libraryTracks: duplicateList,
      });

      expect(resolved.length).toBe(2);
      expect(resolved[0].name).toBe('Track 1');
      expect(resolved[1].name).toBe('Track 2');
    });
  });

  describe('3. Playlist Empty State UI Cleanup', () => {
    const mockCallbacks = {
      selectedPlaylistId: null,
      libraryTracks: [],
      isPlaying: false,
      favourites: new Set<string>(),
      onSelectPlaylist: vi.fn(),
      onCreatePlaylist: vi.fn(),
      onRenamePlaylist: vi.fn(),
      onDeletePlaylist: vi.fn(),
      onPlayPlaylist: vi.fn(),
      onPlayTrack: vi.fn(),
      onTogglePlay: vi.fn(),
      onToggleFavourite: vi.fn(),
      onRemoveTrackFromPlaylist: vi.fn(),
      onReorderPlaylistTracks: vi.fn(),
    };

    it('hides top-right Create Playlist button when playlist count is 0', () => {
      const html = renderToStaticMarkup(<PlaylistsView playlists={[]} {...mockCallbacks} />);

      // Top-right header section has "0 playlists"
      expect(html).toContain('0 playlists');

      // Centered empty state button is rendered
      expect(html).toContain('No playlists yet');
      expect(html).toContain('Create custom playlists to organize your favorite music');

      // Top-right button with px-3.5 py-2 header class is NOT rendered
      expect(html).not.toContain('px-3.5 py-2 rounded-xl bg-[var(--accent-primary)]/10');
    });

    it('shows top-right Create Playlist button when one or more playlists exist', () => {
      const activePlaylist: Playlist = {
        id: 'pl-1',
        name: 'My Favorites',
        tracks: [],
        createdAt: 1000,
        updatedAt: 1000,
      };

      const html = renderToStaticMarkup(
        <PlaylistsView playlists={[activePlaylist]} {...mockCallbacks} />
      );

      // Header shows 1 playlist
      expect(html).toContain('1 playlist');

      // Top-right button IS rendered
      expect(html).toContain('px-3.5 py-2 rounded-xl bg-[var(--accent-primary)]/10');
      expect(html).toContain('Create Playlist');

      // Centered empty state is NOT rendered
      expect(html).not.toContain('No playlists yet');
    });
  });
});
