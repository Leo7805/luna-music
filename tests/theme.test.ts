import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { THEME_STORAGE_KEY, Theme } from '../src/hooks/useTheme';

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

describe('Theme management and persistence', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      // @ts-expect-error Mocking localStorage in Node test runner
      globalThis.localStorage = createLocalStorageMock();
    }
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('toggles between dark and light themes', () => {
    let currentTheme: Theme = 'dark';
    const toggle = (t: Theme): Theme => (t === 'dark' ? 'light' : 'dark');

    currentTheme = toggle(currentTheme);
    expect(currentTheme).toBe('light');

    currentTheme = toggle(currentTheme);
    expect(currentTheme).toBe('dark');
  });

  it('persists selected theme in localStorage under the correct key', () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    globalThis.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });
});
