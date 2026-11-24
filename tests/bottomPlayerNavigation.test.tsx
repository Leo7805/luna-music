// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, ComponentProps } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BottomPlayer } from '../src/components/BottomPlayer';

let root: Root;
let host: HTMLDivElement;
let props: ComponentProps<typeof BottomPlayer>;
const song = { id: 'song', name: 'Song.mp3', relativePath: 'Song.mp3', size: 1, lastModified: 1,
  metadata: { title: 'Song', artist: 'Artist', album: 'Album', duration: 120, isMetadataLoaded: true } };
const render = (overrides: Partial<typeof props> = {}) => {
  props = { ...props, ...overrides };
  act(() => root.render(<BottomPlayer {...props} />));
};
const click = (element: Element) => act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const byTest = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  props = { currentTrack: song, isPlaying: false, currentTime: 30, duration: 120,
    volume: 0.5, isMuted: false, repeatMode: 'off', shuffle: false, isFavourite: false,
    onTogglePlay: vi.fn(), onNextTrack: vi.fn(), onPrevTrack: vi.fn(), onSeek: vi.fn(),
    onVolumeChange: vi.fn(), onToggleMute: vi.fn(), onCycleRepeat: vi.fn(), onToggleShuffle: vi.fn(),
    onToggleFavourite: vi.fn(), onToggleLyrics: vi.fn(), onToggleNowPlayingView: vi.fn() };
  render();
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('provides a visible native navigation button and reflects the current view', () => {
  const button = byTest('now-playing-toggle-button');
  expect(button.tagName).toBe('BUTTON');
  expect(button.textContent).toBe('Now Playing');
  expect(button.getAttribute('aria-label')).toBe('Open Now Playing');
  click(button.querySelector('span')!);
  expect(props.onToggleNowPlayingView).toHaveBeenCalledTimes(1);
  render({ isNowPlayingViewOpen: true });
  expect(button.getAttribute('aria-label')).toBe('Back to Library');
  expect(button.title).toBe('Back to Library');
  expect(button.getAttribute('aria-pressed')).toBe('true');
  click(button);
  expect(props.onToggleNowPlayingView).toHaveBeenCalledTimes(2);
});

it.each([false, true])('retains navigation while playing=%s with no current track', isPlaying => {
  render({ currentTrack: null, isPlaying });
  const button = byTest('now-playing-toggle-button');
  expect(button.querySelector('[data-playing]')?.getAttribute('data-playing')).toBe('false');
  click(button);
  expect(props.onToggleNowPlayingView).toHaveBeenCalledTimes(1);
});

it('uses three shared CSS animation bars only while a track is playing', () => {
  render({ isPlaying: true });
  const icon = byTest('now-playing-toggle-button').querySelector('[data-playing]')!;
  expect(icon.children).toHaveLength(3);
  expect([...icon.children].every(bar => /animate-bar-/.test(bar.className))).toBe(true);
  render({ isPlaying: false });
  expect([...icon.children].every(bar => !/animate-bar-/.test(bar.className))).toBe(true);
});

it('toggles only once from decorative content or footer background', () => {
  click(byTest('bottom-player'));
  expect(props.onToggleNowPlayingView).toHaveBeenCalledTimes(1);
  render({ currentTrack: null });
  click(host.querySelector('footer > div')!.firstElementChild!);
  expect(props.onToggleNowPlayingView).toHaveBeenCalledTimes(2);
});

it('keeps the track information entry point separate from the heart', () => {
  click(byTest('bottom-track-info-button').querySelector('h4')!);
  expect(props.onToggleNowPlayingView).toHaveBeenCalledTimes(1);
  click(byTest('bottom-favourite-button'));
  expect(props.onToggleFavourite).toHaveBeenCalledTimes(1);
  expect(props.onToggleNowPlayingView).toHaveBeenCalledTimes(1);
});

it.each([
  ['Play (Space)', 'onTogglePlay'], ['Previous track (Ctrl/Cmd + Left)', 'onPrevTrack'],
  ['Next track (Ctrl/Cmd + Right)', 'onNextTrack'], ['Shuffle Off', 'onToggleShuffle'],
  ['Repeat: off', 'onCycleRepeat'], ['Mute (M)', 'onToggleMute'], ['Show Lyrics', 'onToggleLyrics'],
] as const)('protects %s including clicks on its icon', (title, callback) => {
  const button = host.querySelector(`button[title="${title}"]`)!;
  click(button.querySelector('svg')!);
  expect(props[callback]).toHaveBeenCalledTimes(1);
  expect(props.onToggleNowPlayingView).not.toHaveBeenCalled();
});

it.each(['Seek', 'Volume'])('protects the %s slider and its containing control region', name => {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!;
  click(input);
  click(input.closest('[data-player-control]')!);
  expect(props.onToggleNowPlayingView).not.toHaveBeenCalled();
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, name === 'Seek' ? '60' : '0.3');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(name === 'Seek' ? props.onSeek : props.onVolumeChange).toHaveBeenCalledWith(name === 'Seek' ? 60 : 0.3);
});

it('does not navigate when a control drag ends on the player background', () => {
  const input = host.querySelector('input')!;
  act(() => input.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  click(byTest('bottom-player'));
  expect(props.onToggleNowPlayingView).not.toHaveBeenCalled();
  act(() => byTest('bottom-player').dispatchEvent(new Event('pointerdown', { bubbles: true })));
  click(byTest('bottom-player'));
  expect(props.onToggleNowPlayingView).toHaveBeenCalledTimes(1);
});

it('protects other nested interactive elements without adding a button role to the footer', () => {
  const footer = byTest('bottom-player');
  expect(footer.getAttribute('role')).toBeNull();
  for (const tag of ['a', 'select', 'textarea']) {
    const control = document.createElement(tag); footer.append(control); click(control); control.remove();
  }
  expect(props.onToggleNowPlayingView).not.toHaveBeenCalled();
});

it('disables equalizer animation under prefers-reduced-motion: reduce', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
  expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.animate-bar-1[\s\S]*animation:\s*none/);
  expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.animate-bar-2[\s\S]*animation:\s*none/);
  expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.animate-bar-3[\s\S]*animation:\s*none/);
});

it('keeps responsive icon-only mode accessible on narrow screens', () => {
  const button = byTest('now-playing-toggle-button');
  const label = Array.from(button.querySelectorAll('span')).find(s => s.textContent === 'Now Playing');
  expect(label?.className).toContain('hidden');
  expect(label?.className).toContain('lg:inline');
  expect(button.getAttribute('aria-label')).toBe('Open Now Playing');
  expect(button.title).toBe('Open Now Playing');
  expect(button.querySelector('[data-playing]')?.className).toContain('shrink-0');
});

it('separates Now Playing selected appearance from isPlaying and keeps left track-info and footer neutral', () => {
  const button = byTest('now-playing-toggle-button');
  const trackInfo = byTest('bottom-track-info-button');
  const footer = byTest('bottom-player');

  // 1. Library open + playing -> unselected button, animated equalizer, neutral track-info
  render({ isNowPlayingViewOpen: false, isPlaying: true });
  const closedButtonClass = button.className;
  const closedTrackInfoClass = trackInfo.className;
  const closedFooterClass = footer.className;
  expect(button.getAttribute('aria-pressed')).toBe('false');
  expect(button.getAttribute('data-selected')).toBe('false');
  expect(closedButtonClass).toContain('border-transparent');
  expect(closedButtonClass).toContain('hover:bg-');
  expect(closedButtonClass).toContain('focus-visible:ring-2');
  expect(closedButtonClass).not.toContain('bg-[var(--track-current-accent)]');
  expect(button.querySelector('[data-playing]')?.getAttribute('data-playing')).toBe('true');

  // 2. Now Playing open + playing -> selected button, animated equalizer
  render({ isNowPlayingViewOpen: true, isPlaying: true });
  const openButtonClass = button.className;
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(button.getAttribute('data-selected')).toBe('true');
  expect(openButtonClass).not.toBe(closedButtonClass);
  expect(openButtonClass).toContain('bg-[var(--track-current-accent)]');
  expect(openButtonClass).toContain('border-[var(--track-current-border)]');
  expect(button.querySelector('[data-playing]')?.getAttribute('data-playing')).toBe('true');

  // Left track-info & whole footer must NOT gain persistent selected styling
  expect(trackInfo.className).toBe(closedTrackInfoClass);
  expect(trackInfo.className).not.toContain('bg-[var(--bg-active)]');
  expect(footer.className).toBe(closedFooterClass);

  // 3. Now Playing open + paused -> still selected button, static equalizer
  render({ isNowPlayingViewOpen: true, isPlaying: false });
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(button.getAttribute('data-selected')).toBe('true');
  expect(button.className).toBe(openButtonClass);
  expect(button.querySelector('[data-playing]')?.getAttribute('data-playing')).toBe('false');
});
