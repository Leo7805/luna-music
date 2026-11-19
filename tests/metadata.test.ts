import { describe, it, expect } from 'vitest';
import { cleanTrackTitle, formatDuration, formatFileSize } from '../src/utils/formatters';
import { createFallbackMetadata, getPlaceholderGradient } from '../src/utils/metadata';

describe('metadata and formatters', () => {
  it('cleans track titles by stripping leading track numbering and extension', () => {
    expect(cleanTrackTitle('01 - Bohemian Rhapsody.flac')).toBe('Bohemian Rhapsody');
    expect(cleanTrackTitle('02. Stairway to Heaven.mp3')).toBe('Stairway to Heaven');
    expect(cleanTrackTitle('03 Hotel California.m4a')).toBe('Hotel California');
    expect(cleanTrackTitle('Thunderstruck.wav')).toBe('Thunderstruck');
    expect(cleanTrackTitle('song_with_underscores.ogg')).toBe('song with underscores');
  });

  it('generates consistent deterministic gradient for identical seed', () => {
    const grad1 = getPlaceholderGradient('Queen - A Night at the Opera');
    const grad2 = getPlaceholderGradient('Queen - A Night at the Opera');
    expect(grad1).toBe(grad2);
    expect(grad1).toContain('linear-gradient');
  });

  it('creates complete fallback metadata with title, artist, album, and gradient', () => {
    const meta = createFallbackMetadata('05 - Comfortably Numb.flac', 'Pink Floyd/The Wall/05 - Comfortably Numb.flac');
    expect(meta.title).toBe('Comfortably Numb');
    expect(meta.artist).toBe('Unknown Artist');
    expect(meta.album).toBe('Unknown Album');
    expect(meta.placeholderGradient).toBeDefined();
    expect(meta.isMetadataLoaded).toBe(false);
  });

  it('formats durations properly into mm:ss and hh:mm:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3599)).toBe('59:59');
    expect(formatDuration(3665)).toBe('1:01:05');
    expect(formatDuration(undefined)).toBe('--:--');
  });

  it('formats file sizes into human readable units', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1024 * 1024 * 5.5)).toBe('5.5 MB');
  });
});
