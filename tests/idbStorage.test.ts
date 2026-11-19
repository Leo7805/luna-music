import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { getStoredPlaybackState, storePlaybackState } from '../src/services/idbStorage';

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

describe('idbStorage preferences', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      // @ts-expect-error Mocking localStorage in Node test runner
      globalThis.localStorage = createLocalStorageMock();
    }
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('returns default playback state when nothing is stored', async () => {
    const state = await getStoredPlaybackState();
    expect(state.volume).toBe(0.8);
    expect(state.isMuted).toBe(false);
    expect(state.repeatMode).toBe('off');
    expect(state.shuffle).toBe(false);
    expect(state.favourites).toEqual([]);
  });

  it('stores and retrieves updated playback preferences', async () => {
    await storePlaybackState({
      volume: 0.5,
      repeatMode: 'all',
      shuffle: true,
      favourites: ['track-1', 'track-2'],
    });

    const state = await getStoredPlaybackState();
    expect(state.volume).toBe(0.5);
    expect(state.repeatMode).toBe('all');
    expect(state.shuffle).toBe(true);
    expect(state.favourites).toEqual(['track-1', 'track-2']);
  });
});
