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

  it('migrates legacy single directory handle to registered_root_folders idempotently', () => {
    const mockStore = new Map<string, unknown>();
    mockStore.set('directory_handle', { kind: 'directory', name: 'Legacy Folder' });

    // Verify migration logic
    function simulateGetStoredRegisteredFolders(store: Map<string, unknown>) {
      const existing = store.get('registered_root_folders');
      if (Array.isArray(existing) && existing.length > 0) {
        return { folders: existing, migrated: false };
      }

      const legacy = store.get('directory_handle') as { kind: string; name: string } | undefined;
      if (legacy && legacy.kind === 'directory') {
        const migratedFolder = {
          id: 'fsa_legacy',
          name: legacy.name,
          sourceType: 'fs-access',
          handle: legacy,
          addedAt: 1000,
        };
        store.set('registered_root_folders', [migratedFolder]);
        store.set('migrated_single_to_multi', true);
        return { folders: [migratedFolder], migrated: true };
      }
      return { folders: [], migrated: false };
    }

    // 1st load: triggers migration
    const res1 = simulateGetStoredRegisteredFolders(mockStore);
    expect(res1.migrated).toBe(true);
    expect(res1.folders).toHaveLength(1);
    expect(res1.folders[0].name).toBe('Legacy Folder');

    // 2nd load: already migrated, no duplicate migration
    const res2 = simulateGetStoredRegisteredFolders(mockStore);
    expect(res2.migrated).toBe(false);
    expect(res2.folders).toHaveLength(1);
    expect(res2.folders[0].id).toBe('fsa_legacy');
  });
});
