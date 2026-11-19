import { LrcLine } from '../types/music';

/**
 * Parses raw LRC string content into sorted, timed lyric lines.
 * Handles single/multiple timestamps per line and [offset: +/-ms] tags.
 */
export function parseLrc(content: string): LrcLine[] {
  if (!content || !content.trim()) return [];

  const lines = content.split(/\r?\n/);
  const result: LrcLine[] = [];
  let offsetSeconds = 0;

  // Regex to match timestamps like [01:23.45] or [01:23.456]
  const timeRegex = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  const offsetRegex = /\[offset:\s*([+-]?\d+)\s*\]/i;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Check for offset tag
    const offsetMatch = trimmed.match(offsetRegex);
    if (offsetMatch) {
      const ms = parseInt(offsetMatch[1], 10);
      if (!isNaN(ms)) {
        offsetSeconds = ms / 1000;
      }
      continue;
    }

    // Check for ID tags like [ar:Artist], [ti:Title]
    if (/^\[[a-z]{2,}:.*\]$/i.test(trimmed) && !timeRegex.test(trimmed)) {
      continue;
    }

    // Extract all timestamps on this line
    const matches = Array.from(trimmed.matchAll(timeRegex));
    if (matches.length === 0) continue;

    // Clean text by stripping all [mm:ss.xx] tags
    const text = trimmed.replace(timeRegex, '').trim();

    for (const match of matches) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const fractionStr = match[3] || '0';
      // Normalize fraction to seconds
      const fraction = parseFloat(`0.${fractionStr}`);
      const rawTime = minutes * 60 + seconds + fraction;
      const finalTime = Math.max(0, rawTime + offsetSeconds);

      result.push({
        time: finalTime,
        text,
      });
    }
  }

  // Sort chronologically
  result.sort((a, b) => a.time - b.time);

  return result;
}

/**
 * Finds the index of the currently active lyric line for a given playback time in seconds.
 * Returns -1 if playback time is before the first lyric line.
 */
export function findCurrentLyricIndex(lyrics: LrcLine[], currentTime: number): number {
  if (!lyrics || lyrics.length === 0) return -1;
  if (currentTime < lyrics[0].time) return -1;

  // Linear scan or binary search
  let low = 0;
  let high = lyrics.length - 1;
  let activeIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lyrics[mid].time <= currentTime) {
      activeIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return activeIndex;
}
