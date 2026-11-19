export interface ShortcutHandlers {
  togglePlay: () => void;
  seekRelative: (deltaSeconds: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  adjustVolume: (deltaPercent: number) => void;
  toggleMute: () => void;
  toggleLyrics: () => void;
}

export interface ShortcutTarget {
  tagName?: string;
  isContentEditable?: boolean;
}

export interface ShortcutKeyEvent {
  key: string;
  code: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  target?: EventTarget | ShortcutTarget | null;
  preventDefault?: () => void;
}

/**
 * Checks if the keyboard event was triggered inside an active text input or editable element.
 */
export function isEditableElement(target: EventTarget | ShortcutTarget | null | undefined): boolean {
  if (!target) return false;

  const candidate = target as ShortcutTarget;
  const tagName = candidate.tagName ? candidate.tagName.toUpperCase() : '';
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) {
    return true;
  }

  return Boolean(candidate.isContentEditable);
}

/**
 * Handles keyboard events and dispatches to appropriate music player handlers.
 * Returns true if a shortcut was handled and default was prevented.
 */
export function handlePlayerKeydown(
  event: ShortcutKeyEvent,
  handlers: ShortcutHandlers
): boolean {
  if (isEditableElement(event.target)) {
    return false;
  }

  const isMetaOrCtrl = Boolean(event.metaKey || event.ctrlKey);

  // Space: play / pause
  if (event.code === 'Space') {
    event.preventDefault?.();
    handlers.togglePlay();
    return true;
  }

  // Ctrl/Cmd + Left: Previous track
  if (isMetaOrCtrl && event.code === 'ArrowLeft') {
    event.preventDefault?.();
    handlers.prevTrack();
    return true;
  }

  // Ctrl/Cmd + Right: Next track
  if (isMetaOrCtrl && event.code === 'ArrowRight') {
    event.preventDefault?.();
    handlers.nextTrack();
    return true;
  }

  // Left: Seek back 5s
  if (!isMetaOrCtrl && event.code === 'ArrowLeft') {
    event.preventDefault?.();
    handlers.seekRelative(-5);
    return true;
  }

  // Right: Seek forward 5s
  if (!isMetaOrCtrl && event.code === 'ArrowRight') {
    event.preventDefault?.();
    handlers.seekRelative(5);
    return true;
  }

  // Up: Volume up 5%
  if (event.code === 'ArrowUp') {
    event.preventDefault?.();
    handlers.adjustVolume(0.05);
    return true;
  }

  // Down: Volume down 5%
  if (event.code === 'ArrowDown') {
    event.preventDefault?.();
    handlers.adjustVolume(-0.05);
    return true;
  }

  // M: Toggle mute
  if (event.key.toLowerCase() === 'm' && !isMetaOrCtrl && !event.altKey) {
    event.preventDefault?.();
    handlers.toggleMute();
    return true;
  }

  // L: Toggle lyrics
  if (event.key.toLowerCase() === 'l' && !isMetaOrCtrl && !event.altKey) {
    event.preventDefault?.();
    handlers.toggleLyrics();
    return true;
  }

  return false;
}
