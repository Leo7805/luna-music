// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentTitle } from '../src/hooks/useDocumentTitle';
import { TrackItem } from '../src/types/music';

const LONG = '那些年，我们一起追的女孩《七年的爱》现场演唱版本';
const track = (title: string, id = title): TrackItem => ({
  id, name: `${title}.mp3`, relativePath: `${title}.mp3`, size: 1, lastModified: 1,
  metadata: { title, artist: '', album: '', isMetadataLoaded: true },
});
function Harness({ current, playing }: { current: TrackItem | null; playing: boolean }) {
  useDocumentTitle(current, playing);
  return null;
}
let root: Root;
let host: HTMLDivElement;
let media: MediaQueryList;
let listeners: Set<() => void>;
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
function render(current: TrackItem | null, playing = true) {
  act(() => root.render(<StrictMode><Harness current={current} playing={playing} /></StrictMode>));
}
function reduce(matches: boolean) {
  Object.defineProperty(media, 'matches', { value: matches, configurable: true });
  act(() => listeners.forEach(listener => listener()));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  listeners = new Set();
  media = {
    matches: false,
    addEventListener: vi.fn((_type, listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type, listener) => listeners.delete(listener)),
  } as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
  expect(listeners.size).toBe(0);
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('browser document title', () => {
  it('uses the application title without a track, even if playing', () => {
    render(null);
    expect(document.title).toBe('Luna Music');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['晴天', 'Mr. Brightside', '《七年的爱》', '"Song" (Live) - Mix'])('keeps short title %s static and preserves punctuation', title => {
    render(track(`  ${title}  `));
    expect(document.title).toBe(title);
    advance(10000);
    expect(document.title).toBe(title);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resolves metadata first and falls back to a filename with only its audio extension removed', () => {
    render({ ...track('Metadata'), name: 'Other.flac' });
    expect(document.title).toBe('Metadata');
    render({ ...track(''), name: '  Mr. Brightside.flac  ' });
    expect(document.title).toBe('Mr. Brightside');
  });

  it('scrolls left after the initial delay, at 600ms steps, and repeats with a gap', () => {
    render(track(LONG));
    expect(document.title).toBe(LONG);
    advance(1199);
    expect(document.title).toBe(LONG);
    advance(1);
    expect(document.title).toBe(`${LONG.slice(1)}\u00a0\u00a0\u00a0${LONG[0]}`);
    advance(600);
    expect(document.title).toBe(`${LONG.slice(2)}\u00a0\u00a0\u00a0${LONG.slice(0, 2)}`);
    advance((Array.from(LONG).length + 1) * 600);
    expect(document.title).toBe(LONG);
    advance(1199);
    expect(document.title).toBe(LONG);
    advance(1);
    expect(document.title).not.toBe(LONG);
  });

  it('pauses to the full title, stays static after ending, and resumes from the beginning', () => {
    const current = track(LONG);
    render(current);
    advance(2400);
    render(current, false);
    expect(document.title).toBe(LONG);
    expect(vi.getTimerCount()).toBe(0);
    advance(10000);
    expect(document.title).toBe(LONG);
    render(current);
    expect(document.title).toBe(LONG);
    advance(1200);
    expect(document.title).toBe(`${LONG.slice(1)}\u00a0\u00a0\u00a0${LONG[0]}`);
  });

  it('cancels old timers on track changes and clearing', () => {
    render(track(LONG));
    advance(1200);
    render(track('New song'));
    expect(document.title).toBe('New song');
    advance(10000);
    expect(document.title).toBe('New song');
    render(track(LONG));
    advance(1200);
    render(null, false);
    expect(document.title).toBe('Luna Music');    advance(10000);
    expect(document.title).toBe('Luna Music');
  });

  it('restarts the delay when a different track has the same title', () => {
    render(track(LONG, 'one'));
    advance(1200);
    render(track(LONG, 'two'));
    expect(document.title).toBe(LONG);
    advance(1199);
    expect(document.title).toBe(LONG);
  });

  it('disables animation for reduced motion and responds to preference changes', () => {
    reduce(true);
    render(track(LONG));
    expect(document.title).toBe(LONG);
    expect(vi.getTimerCount()).toBe(0);
    render(track(`${LONG}!`));
    expect(document.title).toBe(`${LONG}!`);
    reduce(false);
    advance(1200);
    expect(document.title).not.toBe(`${LONG}!`);
    reduce(true);
    expect(document.title).toBe(`${LONG}!`);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['👨‍👩‍👧‍👦', 'e\u0301', '🎵', '한', 'あ'])('scrolls whole graphemes including %s', first => {
    const title = first + LONG;
    render(track(title));
    advance(1200);
    expect(document.title).toBe(`${LONG}\u00a0\u00a0\u00a0${first}`);
  });

  it('counts visible graphemes rather than UTF-16 units for the threshold', () => {
    render(track('👨‍👩‍👧‍👦'.repeat(20)));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back to Unicode code points without Intl.Segmenter', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')!;
    Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true });
    try {
      render(track('🎵' + LONG));
      advance(1200);
      expect(document.title).toBe(`${LONG}\u00a0\u00a0\u00a0🎵`);
    } finally {
      Object.defineProperty(Intl, 'Segmenter', descriptor);
    }
  });

  it('uses the default for an empty resolved title', () => {
    render({ ...track(''), name: '   ' });
    expect(document.title).toBe('Luna Music');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not restart or duplicate timers on repeated equivalent rerenders in StrictMode', () => {
    render(track(LONG));
    advance(600);
    for (let i = 0; i < 5; i++) render(track(LONG));
    expect(vi.getTimerCount()).toBe(1);
    expect(listeners.size).toBe(1);
    advance(600);
    expect(document.title).toBe(`${LONG.slice(1)}\u00a0\u00a0\u00a0${LONG[0]}`);
  });

  it('cleans up active timers and listeners on unmount', () => {
    render(track(LONG));
    advance(1200);
    act(() => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
    expect(listeners.size).toBe(0);
    const title = document.title;
    advance(10000);
    expect(document.title).toBe(title);
  });

  it('works without matchMedia or preference listeners', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(track(LONG));
    advance(1200);
    expect(document.title).not.toBe(LONG);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render(track(`${LONG}!`));
    expect(document.title).toBe(`${LONG}!`);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('supports legacy preference listeners and removes them', () => {
    Object.assign(media, { addEventListener: undefined, removeEventListener: undefined,
      addListener: (listener: () => void) => listeners.add(listener),
      removeListener: (listener: () => void) => listeners.delete(listener) });
    render(track(LONG));
    reduce(true);
    expect(document.title).toBe(LONG);
    expect(vi.getTimerCount()).toBe(0);
  });
});
