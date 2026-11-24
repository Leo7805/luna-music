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
function Harness({ current }: { current: TrackItem | null; playing: boolean }) {
  useDocumentTitle(current);
  return null;
}
let root: Root;
let host: HTMLDivElement;
const advance = () => act(() => vi.advanceTimersByTime(60000));
function render(current: TrackItem | null, playing = true) {
  act(() => root.render(<StrictMode><Harness current={current} playing={playing} /></StrictMode>));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', vi.fn());
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
  expect(window.matchMedia).not.toHaveBeenCalled();
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('static browser document title', () => {
  it('uses the application title without a current track', () => {
    render(null);
    expect(document.title).toBe('Luna Music');
  });

  it.each(['晴天', 'Mr. Brightside', '《七年的爱》', '"Song" (Live) - Mix', LONG,
    '👨‍👩‍👧‍👦 🎵 e\u0301 한글 日本語'])('preserves the complete title %s without animation', title => {
    render(track(`  ${title}  `));
    expect(document.title).toBe(title);
    expect(vi.getTimerCount()).toBe(0);
    advance();
    expect(document.title).toBe(title);
  });

  it('prefers metadata and falls back to a filename with only its audio extension removed', () => {
    render({ ...track('Metadata'), name: 'Other.flac' });
    expect(document.title).toBe('Metadata');
    render({ ...track(''), name: '  Mr. Brightside.flac  ' });
    expect(document.title).toBe('Mr. Brightside');
    render({ ...track(''), name: 'Song.txt' });
    expect(document.title).toBe('Song.txt');
  });

  it('keeps the full title when pausing, resuming, or ending with the current track retained', () => {
    const current = track(LONG);
    for (const playing of [true, false, true, false]) {
      render(current, playing);
      expect(document.title).toBe(LONG);
      advance();
      expect(document.title).toBe(LONG);
    }
  });

  it('updates immediately on track changes and never restores the previous title', () => {
    render(track(LONG));
    render(track('New song'));
    expect(document.title).toBe('New song');
    advance();
    expect(document.title).toBe('New song');
  });

  it('updates when metadata changes on the same track ID', () => {
    render(track('Filename', 'same'));
    render(track('Metadata title', 'same'));
    expect(document.title).toBe('Metadata title');
  });

  it('uses the default when the current track is cleared', () => {
    render(track(LONG));
    render(null, false);
    expect(document.title).toBe('Luna Music');
    advance();
    expect(document.title).toBe('Luna Music');
  });

  it('uses the default for an empty resolved title', () => {
    render({ ...track(''), name: '   ' });
    expect(document.title).toBe('Luna Music');
  });

  it('creates no timers or motion listeners across StrictMode rerenders and unmount', () => {
    const listener = vi.spyOn(window, 'addEventListener');
    render(track(LONG));
    for (let i = 0; i < 5; i++) render(track(LONG, String(i)), i % 2 === 0);
    expect(document.title).toBe(LONG);
    expect(vi.getTimerCount()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    act(() => root.render(null));
    advance();
    expect(document.title).toBe(LONG);
    listener.mockRestore();
  });
});
