import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrackItem, FileStatus } from '../src/types/music';
import {
  isPageReloadNavigation,
  shouldAutoResumeOnRestore,
  clampSeekPosition,
  classifyPlayRejection,
  resolveInitialQueue,
  resolveInitialTrack,
} from '../src/utils/playbackSession';
import {
  storePlaybackState,
  storePlaybackStateSync,
  getStoredPlaybackStateSync,
} from '../src/services/playerStateStorage';
import { LOCAL_STORAGE_STATE_KEY } from '../src/services/idbCore';
import { useAudioEngine, UseAudioEngineReturn } from '../src/hooks/useAudioEngine';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';

function renderHookSync<T>(useHook: () => T): T {
  let result!: T;
  function TestComponent() {
    result = useHook();
    return null;
  }
  renderToStaticMarkup(<TestComponent />);
  return result;
}

function createLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
}

function createTrack(id: string, name: string, status: FileStatus = 'normal'): TrackItem {
  return {
    id,
    name: `${name}.mp3`,
    relativePath: `Music/${name}.mp3`,
    file: new File(['dummy-audio-bytes'], `${name}.mp3`, { type: 'audio/mpeg' }),
    size: 17,
    lastModified: 1000,
    status,
    metadata: {
      title: name,
      artist: 'Artist',
      album: 'Album',
      duration: 240,
      isMetadataLoaded: true,
    },
  };
}

class MockAudioElement {
  src = '';
  preload = '';
  volume = 1;
  currentTime = 0;
  duration = 240;
  paused = true;
  ended = false;
  readyState = 0;
  error: MediaError | null = null;
  playCalls: Array<{ timeAtPlay: number }> = [];
  playImpl: () => Promise<void> = async () => {
    this.paused = false;
  };
  addEventListener() {}
  removeEventListener() {}
  load() {}
  removeAttribute(attr: string) {
    if (attr === 'src') this.src = '';
  }
  hasAttribute(attr: string) {
    return attr === 'src' ? Boolean(this.src) : false;
  }
  pause() {
    this.paused = true;
  }
  play(): Promise<void> {
    this.playCalls.push({ timeAtPlay: this.currentTime });
    return this.playImpl();
  }
}

describe('Resume Playback After Page Refresh', () => {
  const track1 = createTrack('t1', 'Song One');
  const track2 = createTrack('t2', 'Song Two');
  const track3 = createTrack('t3', 'Song Three');
  const unreadableTrack = createTrack('t4', 'Missing Song', 'unreadable');

  const originalAudio = globalThis.Audio;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof globalThis.localStorage === 'undefined') {
      // @ts-expect-error Node test environment mock
      globalThis.localStorage = createLocalStorageMock();
    }
    globalThis.localStorage.clear();
    URL.createObjectURL = vi.fn(() => 'blob:mock-audio-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    globalThis.Audio = originalAudio;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  describe('1. Navigation Detection & Auto-Resume Decision Logic', () => {
    it('detects genuine page reload vs new navigation, back_forward, or missing API', () => {
      expect(
        isPageReloadNavigation({ getEntriesByType: () => [{ type: 'reload' } as any] })
      ).toBe(true);
      expect(
        isPageReloadNavigation({ getEntriesByType: () => [{ type: 'navigate' } as any] })
      ).toBe(false);
      expect(
        isPageReloadNavigation({ getEntriesByType: () => [{ type: 'back_forward' } as any] })
      ).toBe(false);
      expect(isPageReloadNavigation({ getEntriesByType: () => [] })).toBe(false);
      expect(isPageReloadNavigation(null)).toBe(false);
    });

    it('allows auto-resume ONLY for genuine reload + wasPlaying=true + matching playable track + no source removal', () => {
      // 1. Playing before refresh -> eligible
      expect(
        shouldAutoResumeOnRestore({
          isReload: true,
          wasPlaying: true,
          targetTrack: track2,
          storedLastTrackId: 't2',
          hasExplicitSourceRemoval: false,
        })
      ).toBe(true);

      // 2. Paused before refresh -> remains paused
      expect(
        shouldAutoResumeOnRestore({
          isReload: true,
          wasPlaying: false,
          targetTrack: track2,
          storedLastTrackId: 't2',
        })
      ).toBe(false);

      // 3. New navigation with wasPlaying=true -> no autoplay
      expect(
        shouldAutoResumeOnRestore({
          isReload: false,
          wasPlaying: true,
          targetTrack: track2,
          storedLastTrackId: 't2',
        })
      ).toBe(false);

      // 4. Legacy stored data missing wasPlaying -> safe paused restoration
      expect(
        shouldAutoResumeOnRestore({
          isReload: true,
          wasPlaying: undefined,
          targetTrack: track2,
          storedLastTrackId: 't2',
        })
      ).toBe(false);

      // 8. Unavailable track -> never autoplays
      expect(
        shouldAutoResumeOnRestore({
          isReload: true,
          wasPlaying: true,
          targetTrack: unreadableTrack,
          storedLastTrackId: 't4',
        })
      ).toBe(false);

      // 9. Explicit source removal -> never autoplays
      expect(
        shouldAutoResumeOnRestore({
          isReload: true,
          wasPlaying: true,
          targetTrack: track2,
          storedLastTrackId: 't2',
          hasExplicitSourceRemoval: true,
        })
      ).toBe(false);

      // 10. Empty queue / null track -> never autoplays
      expect(
        shouldAutoResumeOnRestore({
          isReload: true,
          wasPlaying: true,
          targetTrack: null,
          storedLastTrackId: 't2',
        })
      ).toBe(false);

      // Fallback track when saved track is missing -> never autoplays fallback song
      expect(
        shouldAutoResumeOnRestore({
          isReload: true,
          wasPlaying: true,
          targetTrack: track1,
          storedLastTrackId: 't2',
        })
      ).toBe(false);
    });

    it('clamps seek position safely within media duration and classifies play() rejections', () => {
      expect(clampSeekPosition(155, 240)).toBe(155);
      expect(clampSeekPosition(300, 240)).toBeCloseTo(239.9, 2);
      expect(clampSeekPosition(-5, 240)).toBe(0);
      expect(clampSeekPosition(NaN, 240)).toBe(0);

      const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
      expect(classifyPlayRejection(abortErr, true).ignore).toBe(true);

      const notAllowedErr = Object.assign(new Error('not allowed'), { name: 'NotAllowedError' });
      const blocked = classifyPlayRejection(notAllowedErr, true);
      expect(blocked.ignore).toBe(false);
      expect(blocked.isAutoplayBlocked).toBe(true);
      expect(blocked.message).toContain('Click Play to continue');
    });
  });

  describe('2. Synchronous Persistence, Backward Compatibility & Snapshot Preservation', () => {
    it('preserves favouriteSnapshots, queue, shuffle, and preferences across sync & async writes and handles legacy missing wasPlaying', async () => {
      localStorage.setItem(
        LOCAL_STORAGE_STATE_KEY,
        JSON.stringify({
          volume: 0.65,
          isMuted: false,
          repeatMode: 'all',
          shuffle: true,
          lastTrackId: 't2',
          lastPosition: 155,
          favourites: ['t1'],
          favouriteSnapshots: {
            t1: { trackId: 't1', name: 'Song One.mp3', artist: 'Artist', duration: 240 },
          },
          queueTrackIds: ['t1', 't2', 't3'],
          queueIndex: 1,
        })
      );

      const legacy = getStoredPlaybackStateSync();
      expect(legacy.wasPlaying).toBe(false);
      expect(legacy.favouriteSnapshots?.t1?.name).toBe('Song One.mp3');

      // Synchronous unload write updates wasPlaying & lastPosition while preserving all other fields
      const merged = storePlaybackStateSync({
        lastTrackId: 't2',
        lastPosition: 162.4,
        wasPlaying: true,
      });
      expect(merged.wasPlaying).toBe(true);
      expect(merged.lastPosition).toBe(162.4);
      expect(merged.shuffle).toBe(true);
      expect(merged.queueTrackIds).toEqual(['t1', 't2', 't3']);
      expect(merged.favouriteSnapshots?.t1?.name).toBe('Song One.mp3');

      // Subsequent async storePlaybackState merges cleanly against latest localStorage state
      await storePlaybackState({ volume: 0.7 });
      const afterAsync = getStoredPlaybackStateSync();
      expect(afterAsync.volume).toBe(0.7);
      expect(afterAsync.wasPlaying).toBe(true);
      expect(afterAsync.lastPosition).toBe(162.4);
      expect(afterAsync.favouriteSnapshots?.t1?.name).toBe('Song One.mp3');
    });

    it('restores Queue order, Shuffle state, and position in useAudioPlayer without mutating stored wasPlaying during initial render', () => {
      storePlaybackStateSync({
        volume: 0.8,
        repeatMode: 'all',
        shuffle: true,
        lastTrackId: 't2',
        lastPosition: 155,
        wasPlaying: true,
        queueTrackIds: ['t3', 't2', 't1'],
        queueIndex: 1,
      });

      const player = renderHookSync(() =>
        useAudioPlayer({
          libraryTracks: [track1, track2, track3],
        })
      );

      expect(player.queue.map((t) => t.id)).toEqual(['t3', 't2', 't1']);
      expect(player.currentTrack?.id).toBe('t2');
      expect(player.currentTime).toBe(155);
      expect(player.shuffle).toBe(true);
      expect(player.repeatMode).toBe('all');
      // Initial render must NOT have overwritten stored wasPlaying=true with false
      expect(getStoredPlaybackStateSync().wasPlaying).toBe(true);
    });
  });

  describe('3. Audio Engine Seek-Before-Play, Autoplay Block Handling & Manual Resume', () => {
    it('defers play() when readyState=0 (waiting for metadata seek) and seeks BEFORE play() when readyState>=1', async () => {
      const mockAudio = new MockAudioElement();
      mockAudio.readyState = 0;
      globalThis.Audio = vi.fn(function () {
        return mockAudio;
      }) as unknown as typeof Audio;

      const engine: UseAudioEngineReturn = renderHookSync(() =>
        useAudioEngine({
          initialPosition: 155,
          currentTrack: track2,
          onEnded: () => {},
        })
      );

      // With readyState=0 and pending seek 155, loadAudioSource must NOT call play() at 0:00
      await engine.loadAudioSource(track2, true, {
        preservePendingSeek: true,
        initialSeekPosition: 155,
        isAutoResume: true,
      });
      expect(mockAudio.playCalls).toHaveLength(0);

      // With readyState>=1, loadAudioSource seeks to 155 FIRST and then calls play() once
      mockAudio.readyState = 1;
      await engine.loadAudioSource(track2, true, {
        preservePendingSeek: true,
        initialSeekPosition: 155,
        isAutoResume: true,
      });
      expect(mockAudio.currentTime).toBe(155);
      expect(mockAudio.playCalls).toHaveLength(1);
      expect(mockAudio.playCalls[0].timeAtPlay).toBe(155);
    });

    it('catches NotAllowedError cleanly without marking track unreadable and supports manual resume at preserved position', async () => {
      const mockAudio = new MockAudioElement();
      mockAudio.readyState = 1;
      const notAllowedErr = Object.assign(new Error('Autoplay not allowed'), {
        name: 'NotAllowedError',
      });
      mockAudio.playImpl = () => Promise.reject(notAllowedErr);
      globalThis.Audio = vi.fn(function () {
        return mockAudio;
      }) as unknown as typeof Audio;

      const onTrackStatusChanged = vi.fn();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const engine: UseAudioEngineReturn = renderHookSync(() =>
        useAudioEngine({
          initialPosition: 155,
          currentTrack: track2,
          onTrackStatusChanged,
          onEnded: () => {},
        })
      );

      await engine.loadAudioSource(track2, true, {
        preservePendingSeek: true,
        initialSeekPosition: 155,
        isAutoResume: true,
      });
      await Promise.resolve();

      // Autoplay rejected: caught without unhandled rejection, single attempt (no loop), track stays normal, position preserved
      expect(mockAudio.playCalls).toHaveLength(1);
      expect(mockAudio.currentTime).toBe(155);
      expect(track2.status).toBe('normal');
      expect(onTrackStatusChanged).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();

      // User manually clicks Play -> resumes at 155
      mockAudio.playImpl = async () => {
        mockAudio.paused = false;
      };
      engine.togglePlay(() => {});
      await Promise.resolve();

      expect(mockAudio.playCalls).toHaveLength(2);
      expect(mockAudio.playCalls[1].timeAtPlay).toBe(155);
      expect(mockAudio.paused).toBe(false);
    });

    it('resolves delayed library tracks into the exact stored queue and target track', () => {
      // Empty library -> empty queue (delayed hydration waits)
      expect(
        resolveInitialQueue({
          storedQueueIds: ['t3', 't2', 't1'],
          effectiveInitialTrackId: 't2',
          libraryTracks: [],
        })
      ).toEqual([]);

      // Library hydrated -> exact queue order and target track restored
      const restoredQueue = resolveInitialQueue({
        storedQueueIds: ['t3', 't2', 't1'],
        effectiveInitialTrackId: 't2',
        libraryTracks: [track1, track2, track3],
      });
      expect(restoredQueue.map((t) => t.id)).toEqual(['t3', 't2', 't1']);

      const target = resolveInitialTrack({
        effectiveInitialTrackId: 't2',
        libraryTracks: [track1, track2, track3],
        queue: restoredQueue,
      });
      expect(target?.id).toBe('t2');
    });
  });
});
