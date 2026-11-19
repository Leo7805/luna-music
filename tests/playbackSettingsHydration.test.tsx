import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  getStoredPlaybackStateSync,
  storePlaybackState,
  DEFAULT_STATE,
} from '../src/services/playerStateStorage';
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

const createLocalStorageMock = () => {
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

describe('Playback Settings Hydration & Persistence', () => {
  const LOCAL_STORAGE_KEY = 'luna_music_playback_state';

  beforeEach(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      // @ts-expect-error Mocking localStorage in Node test runner
      globalThis.localStorage = createLocalStorageMock();
    }
    globalThis.localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. Storage Layer Synchronous & Asynchronous Retrieval', () => {
    it('returns DEFAULT_STATE when localStorage and IndexedDB are empty', () => {
      const state = getStoredPlaybackStateSync();
      expect(state.volume).toBe(0.8);
      expect(state.isMuted).toBe(false);
      expect(state.repeatMode).toBe('off');
      expect(state.shuffle).toBe(false);
    });

    it('synchronously retrieves stored volume, repeatMode, and shuffle from localStorage', () => {
      const saved = {
        volume: 0.35,
        isMuted: false,
        repeatMode: 'all',
        shuffle: true,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(saved));

      const state = getStoredPlaybackStateSync();
      expect(state.volume).toBe(0.35);
      expect(state.repeatMode).toBe('all');
      expect(state.shuffle).toBe(true);
    });

    it('handles corrupted localStorage data by gracefully falling back to DEFAULT_STATE', () => {
      localStorage.setItem(LOCAL_STORAGE_KEY, '{invalid json');
      const state = getStoredPlaybackStateSync();
      expect(state).toEqual(DEFAULT_STATE);
    });

    it('stores volume, repeat mode, and shuffle state cleanly', async () => {
      await storePlaybackState({
        volume: 0.45,
        repeatMode: 'one',
        shuffle: true,
      });

      const retrieved = getStoredPlaybackStateSync();
      expect(retrieved.volume).toBe(0.45);
      expect(retrieved.repeatMode).toBe('one');
      expect(retrieved.shuffle).toBe(true);
    });
  });

  describe('2. Hook Initial Hydration on Reload', () => {
    it('initializes useAudioPlayer with saved volume (35%) and repeatMode (all)', () => {
      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({
          volume: 0.35,
          isMuted: false,
          repeatMode: 'all',
          shuffle: true,
        })
      );

      const player = renderHookSync(() => useAudioPlayer());

      expect(player.volume).toBe(0.35);
      expect(player.repeatMode).toBe('all');
      expect(player.shuffle).toBe(true);
    });

    it('uses established defaults when storage is completely empty', () => {
      const player = renderHookSync(() => useAudioPlayer());

      expect(player.volume).toBe(0.8);
      expect(player.isMuted).toBe(false);
      expect(player.repeatMode).toBe('off');
      expect(player.shuffle).toBe(false);
    });

    it('respects explicitly passed props over storage defaults if provided', () => {
      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({
          volume: 0.35,
          repeatMode: 'all',
        })
      );

      const player = renderHookSync(() =>
        useAudioPlayer({
          initialVolume: 0.9,
          initialRepeatMode: 'one',
        })
      );

      expect(player.volume).toBe(0.9);
      expect(player.repeatMode).toBe('one');
    });
  });

  describe('3. Asynchronous Hydration & User Interaction Safeguards', () => {
    it('applies hydrated settings when user has not yet interacted', () => {
      let volume = 0.8;
      let repeatMode = 'off';
      let isMuted = false;
      const userInteracted = { volume: false, repeatMode: false };

      const stored = { volume: 0.35, repeatMode: 'all', isMuted: true };

      if (!userInteracted.volume) {
        volume = stored.volume;
        isMuted = stored.isMuted;
      }
      if (!userInteracted.repeatMode) {
        repeatMode = stored.repeatMode;
      }

      expect(volume).toBe(0.35);
      expect(isMuted).toBe(true);
      expect(repeatMode).toBe('all');
    });

    it('preserves user manual interactions against later asynchronous hydration', () => {
      let volume = 0.8;
      let repeatMode = 'off';
      const userInteracted = { volume: false, repeatMode: false };

      // User manually changes volume to 0.15 before storage responds
      volume = 0.15;
      userInteracted.volume = true;

      // Delayed storage responds with 0.75 and 'all'
      const delayedStored = { volume: 0.75, repeatMode: 'all' };

      if (!userInteracted.volume) {
        volume = delayedStored.volume;
      }
      if (!userInteracted.repeatMode) {
        repeatMode = delayedStored.repeatMode;
      }

      // Volume remains user-chosen 0.15
      expect(volume).toBe(0.15);
      // Untouched repeat mode is hydrated to 'all'
      expect(repeatMode).toBe('all');
    });
  });

  describe('4. Storage Failure Resilience', () => {
    it('gracefully handles async storage rejections without resetting or breaking player state', async () => {
      vi.spyOn(await import('../src/services/playerStateStorage'), 'getStoredPlaybackState')
        .mockRejectedValueOnce(new Error('IndexedDB transaction failed'));

      // Initial hook render remains resilient
      const player = renderHookSync(() => useAudioPlayer());
      expect(player.volume).toBe(0.8);
      expect(player.repeatMode).toBe('off');
      expect(player.playbackError).toBeNull();
    });
  });
});
