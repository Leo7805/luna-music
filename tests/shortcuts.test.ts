import { describe, it, expect, vi } from 'vitest';
import { handlePlayerKeydown, isEditableElement, ShortcutKeyEvent } from '../src/utils/shortcuts';

function makeEvent(overrides: Partial<ShortcutKeyEvent>): ShortcutKeyEvent {
  return {
    key: '',
    code: '',
    repeat: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

describe('shortcuts', () => {
  it('detects editable input elements and skips shortcuts', () => {
    expect(isEditableElement({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableElement({ tagName: 'textarea' })).toBe(true);
    expect(isEditableElement({ tagName: 'SELECT' })).toBe(true);
    expect(isEditableElement({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isEditableElement({ tagName: 'DIV', isContentEditable: false })).toBe(false);
    expect(isEditableElement(null)).toBe(false);
  });

  it('triggers play/pause on Space', () => {
    const handlers = {
      togglePlay: vi.fn(),
      seekRelative: vi.fn(),
      nextTrack: vi.fn(),
      prevTrack: vi.fn(),
      adjustVolume: vi.fn(),
      toggleMute: vi.fn(),
      toggleLyrics: vi.fn(),
    };

    const event = makeEvent({ code: 'Space' });
    const handled = handlePlayerKeydown(event, handlers);

    expect(handled).toBe(true);
    expect(handlers.togglePlay).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('triggers seeking on Left and Right arrow keys', () => {
    const handlers = {
      togglePlay: vi.fn(),
      seekRelative: vi.fn(),
      nextTrack: vi.fn(),
      prevTrack: vi.fn(),
      adjustVolume: vi.fn(),
      toggleMute: vi.fn(),
      toggleLyrics: vi.fn(),
    };

    handlePlayerKeydown(makeEvent({ code: 'ArrowLeft' }), handlers);
    expect(handlers.seekRelative).toHaveBeenCalledWith(-5);

    handlePlayerKeydown(makeEvent({ code: 'ArrowRight' }), handlers);
    expect(handlers.seekRelative).toHaveBeenCalledWith(5);
  });

  it('triggers track skipping on Ctrl/Cmd + Left/Right', () => {
    const handlers = {
      togglePlay: vi.fn(),
      seekRelative: vi.fn(),
      nextTrack: vi.fn(),
      prevTrack: vi.fn(),
      adjustVolume: vi.fn(),
      toggleMute: vi.fn(),
      toggleLyrics: vi.fn(),
    };

    handlePlayerKeydown(makeEvent({ code: 'ArrowLeft', metaKey: true }), handlers);
    expect(handlers.prevTrack).toHaveBeenCalledOnce();

    handlePlayerKeydown(makeEvent({ code: 'ArrowRight', ctrlKey: true }), handlers);
    expect(handlers.nextTrack).toHaveBeenCalledOnce();
  });

  it('triggers volume adjustment on Up and Down arrow keys', () => {
    const handlers = {
      togglePlay: vi.fn(),
      seekRelative: vi.fn(),
      nextTrack: vi.fn(),
      prevTrack: vi.fn(),
      adjustVolume: vi.fn(),
      toggleMute: vi.fn(),
      toggleLyrics: vi.fn(),
    };

    handlePlayerKeydown(makeEvent({ code: 'ArrowUp' }), handlers);
    expect(handlers.adjustVolume).toHaveBeenCalledWith(0.05);

    handlePlayerKeydown(makeEvent({ code: 'ArrowDown' }), handlers);
    expect(handlers.adjustVolume).toHaveBeenCalledWith(-0.05);
  });

  it('triggers mute toggle on M and lyrics toggle on L', () => {
    const handlers = {
      togglePlay: vi.fn(),
      seekRelative: vi.fn(),
      nextTrack: vi.fn(),
      prevTrack: vi.fn(),
      adjustVolume: vi.fn(),
      toggleMute: vi.fn(),
      toggleLyrics: vi.fn(),
    };

    handlePlayerKeydown(makeEvent({ key: 'm' }), handlers);
    expect(handlers.toggleMute).toHaveBeenCalledOnce();

    handlePlayerKeydown(makeEvent({ key: 'l' }), handlers);
    expect(handlers.toggleLyrics).toHaveBeenCalledOnce();
  });

  it('triggers help toggle on ? or Shift+/', () => {
    const handlers = {
      togglePlay: vi.fn(),
      seekRelative: vi.fn(),
      nextTrack: vi.fn(),
      prevTrack: vi.fn(),
      adjustVolume: vi.fn(),
      toggleMute: vi.fn(),
      toggleLyrics: vi.fn(),
      toggleHelp: vi.fn(),
    };

    const e1 = makeEvent({ key: '?' });
    const handled1 = handlePlayerKeydown(e1, handlers);
    expect(handled1).toBe(true);
    expect(handlers.toggleHelp).toHaveBeenCalledTimes(1);
    expect(e1.preventDefault).toHaveBeenCalled();

    const e2 = makeEvent({ key: '/', shiftKey: true } as any);
    const handled2 = handlePlayerKeydown(e2, handlers);
    expect(handled2).toBe(true);
    expect(handlers.toggleHelp).toHaveBeenCalledTimes(2);

    // Should not trigger if meta, ctrl, or alt is pressed
    const eCmd = makeEvent({ key: '?', metaKey: true });
    expect(handlePlayerKeydown(eCmd, handlers)).toBe(false);
    expect(handlers.toggleHelp).toHaveBeenCalledTimes(2);
  });

  it('triggers closeHelp on Escape', () => {
    const handlers = {
      togglePlay: vi.fn(),
      seekRelative: vi.fn(),
      nextTrack: vi.fn(),
      prevTrack: vi.fn(),
      adjustVolume: vi.fn(),
      toggleMute: vi.fn(),
      toggleLyrics: vi.fn(),
      closeHelp: vi.fn(),
    };

    const e = makeEvent({ key: 'Escape' });
    const handled = handlePlayerKeydown(e, handlers);
    expect(handled).toBe(true);
    expect(handlers.closeHelp).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('ignores shortcuts if focused on an input element', () => {
    const handlers = {
      togglePlay: vi.fn(),
      seekRelative: vi.fn(),
      nextTrack: vi.fn(),
      prevTrack: vi.fn(),
      adjustVolume: vi.fn(),
      toggleMute: vi.fn(),
      toggleLyrics: vi.fn(),
      toggleHelp: vi.fn(),
      closeHelp: vi.fn(),
    };

    const event = makeEvent({ code: 'Space', target: { tagName: 'INPUT' } });
    const handled = handlePlayerKeydown(event, handlers);

    expect(handled).toBe(false);
    expect(handlers.togglePlay).not.toHaveBeenCalled();

    // Verify typing ? into search input does not open help
    const questionEvent = makeEvent({ key: '?', target: { tagName: 'INPUT' } });
    expect(handlePlayerKeydown(questionEvent, handlers)).toBe(false);
    expect(handlers.toggleHelp).not.toHaveBeenCalled();
    expect(questionEvent.preventDefault).not.toHaveBeenCalled();
  });
});
