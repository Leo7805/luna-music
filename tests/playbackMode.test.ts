import { describe, it, expect } from 'vitest';
import { RepeatMode } from '../src/types/music';

function getNextRepeatMode(current: RepeatMode): RepeatMode {
  return current === 'off' ? 'all' : current === 'all' ? 'one' : 'off';
}

function getNextTrackIndex(
  currentIndex: number,
  totalTracks: number,
  repeatMode: RepeatMode
): number | null {
  if (totalTracks === 0) return null;
  if (currentIndex < totalTracks - 1) {
    return currentIndex + 1;
  }
  // At end of playlist
  if (repeatMode === 'all') {
    return 0; // loops back to start
  }
  return null; // stops in 'off' mode
}

describe('playbackMode transitions', () => {
  it('cycles repeat mode: off -> all -> one -> off', () => {
    let mode: RepeatMode = 'off';
    mode = getNextRepeatMode(mode);
    expect(mode).toBe('all');
    mode = getNextRepeatMode(mode);
    expect(mode).toBe('one');
    mode = getNextRepeatMode(mode);
    expect(mode).toBe('off');
  });

  it('determines next track index correctly based on repeat mode', () => {
    const total = 5;

    // Normal advance
    expect(getNextTrackIndex(1, total, 'off')).toBe(2);
    expect(getNextTrackIndex(1, total, 'all')).toBe(2);

    // End of playlist
    expect(getNextTrackIndex(4, total, 'off')).toBeNull(); // stops
    expect(getNextTrackIndex(4, total, 'all')).toBe(0); // loops to beginning
  });
});
