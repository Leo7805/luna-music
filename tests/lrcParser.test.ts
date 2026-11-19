import { describe, it, expect } from 'vitest';
import { parseLrc, findCurrentLyricIndex } from '../src/utils/lrcParser';

describe('lrcParser', () => {
  it('parses standard timestamped lines in chronological order', () => {
    const lrc = `
[ti:Bohemian Rhapsody]
[ar:Queen]
[00:02.50]Is this the real life?
[00:06.00]Is this just fantasy?
[00:10.20]Caught in a landslide
`;

    const lines = parseLrc(lrc);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ time: 2.5, text: 'Is this the real life?' });
    expect(lines[1]).toEqual({ time: 6.0, text: 'Is this just fantasy?' });
    expect(lines[2]).toEqual({ time: 10.2, text: 'Caught in a landslide' });
  });

  it('handles multiple timestamps on a single line and sorts them', () => {
    const lrc = `
[00:04.00][00:12.00]Chorus repeats here
[00:01.00]Intro line
`;

    const lines = parseLrc(lrc);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ time: 1.0, text: 'Intro line' });
    expect(lines[1]).toEqual({ time: 4.0, text: 'Chorus repeats here' });
    expect(lines[2]).toEqual({ time: 12.0, text: 'Chorus repeats here' });
  });

  it('applies offset milliseconds tag', () => {
    const lrc = `
[offset:500]
[00:02.00]Line with +500ms offset
`;

    const lines = parseLrc(lrc);
    expect(lines).toHaveLength(1);
    expect(lines[0].time).toBe(2.5);
  });

  it('finds active lyric index accurately', () => {
    const lines = [
      { time: 5.0, text: 'First line' },
      { time: 10.0, text: 'Second line' },
      { time: 15.0, text: 'Third line' },
    ];

    // Before any line starts
    expect(findCurrentLyricIndex(lines, 2.0)).toBe(-1);

    // Exact match
    expect(findCurrentLyricIndex(lines, 5.0)).toBe(0);

    // In between first and second line
    expect(findCurrentLyricIndex(lines, 8.5)).toBe(0);

    // After second line
    expect(findCurrentLyricIndex(lines, 12.0)).toBe(1);

    // On or after last line
    expect(findCurrentLyricIndex(lines, 15.0)).toBe(2);
    expect(findCurrentLyricIndex(lines, 30.0)).toBe(2);
  });

  it('returns empty array on empty or whitespace content', () => {
    expect(parseLrc('')).toEqual([]);
    expect(parseLrc('   \n  \n ')).toEqual([]);
  });
});
