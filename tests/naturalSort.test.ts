import { describe, it, expect } from 'vitest';
import { naturalCompare, naturalSort } from '../src/utils/naturalSort';

describe('naturalSort', () => {
  it('correctly handles numeric ascending ordering', () => {
    const list = [
      'Track 10',
      'Track 2',
      'Track 1',
      'Track 20',
      'Track 3',
    ];

    const sorted = naturalSort(list, (x) => x);
    expect(sorted).toEqual([
      'Track 1',
      'Track 2',
      'Track 3',
      'Track 10',
      'Track 20',
    ]);
  });

  it('handles strings with mixed numbers and letters', () => {
    const filenames = ['track_1b.flac', 'track_1a.flac', 'track_10.flac', 'track_2.flac'];
    const sorted = filenames.sort(naturalCompare);
    expect(sorted).toEqual(['track_1a.flac', 'track_1b.flac', 'track_2.flac', 'track_10.flac']);
  });

  it('handles identical strings', () => {
    expect(naturalCompare('song.mp3', 'song.mp3')).toBe(0);
  });
});
