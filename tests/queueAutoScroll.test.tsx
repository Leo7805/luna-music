import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  NowPlayingQueueTab,
  calculateQueueScrollOffset,
} from '../src/components/NowPlayingQueueTab';
import { TrackItem } from '../src/types/music';

function makeTrack(id: string, name: string): TrackItem {
  return {
    id,
    name: `${name}.mp3`,
    relativePath: `${name}.mp3`,
    size: 1024,
    lastModified: 1000,
    metadata: {
      title: name,
      artist: 'Artist',
      album: 'Album',
      duration: 180,
      isMetadataLoaded: true,
    },
    status: 'normal',
  };
}

describe('Queue Auto-Scroll & Visibility Management', () => {
  it('renders queue tracks and marks the playing track with active highlight', () => {
    const tracks = [
      makeTrack('t1', 'Track 1'),
      makeTrack('t2', 'Track 2'),
      makeTrack('t3', 'Track 3'),
    ];

    const html = renderToStaticMarkup(
      <NowPlayingQueueTab
        queue={tracks}
        currentTrack={tracks[1]}
        isOpen={true}
        isActiveTab={true}
      />
    );

    expect(html).toContain('Track 1');
    expect(html).toContain('Track 2');
    expect(html).toContain('Track 3');
    // Active track has theme accent/active background and play icon
    expect(html).toContain('bg-[var(--bg-active)]');
    expect(html).toContain('lucide-play');
  });

  it('renders empty queue state message when queue is empty', () => {
    const html = renderToStaticMarkup(
      <NowPlayingQueueTab
        queue={[]}
        currentTrack={null}
        isOpen={true}
        isActiveTab={true}
      />
    );

    expect(html).toContain('Queue is empty');
    expect(html).toContain('Add tracks to the queue using &quot;Play Next&quot; or &quot;Add to Queue&quot;');
  });

  describe('calculateQueueScrollOffset visibility calculations', () => {
    const containerHeight = 400;
    const rowHeight = 40;

    it('returns shouldScroll = false when row is completely inside container viewport', () => {
      // Container scrolled to 100, viewport spans 100 to 500
      const containerTop = 100;
      // Row at 200 (height 40 -> 200..240)
      const res = calculateQueueScrollOffset(containerTop, containerHeight, 200, rowHeight);
      expect(res.shouldScroll).toBe(false);
      expect(res.targetScrollTop).toBe(containerTop);
    });

    it('returns shouldScroll = true and centers row when row is above container viewport', () => {
      // Container scrolled to 300, viewport spans 300 to 700
      const containerTop = 300;
      // Row is at 100 (above 300)
      const res = calculateQueueScrollOffset(containerTop, containerHeight, 100, rowHeight);
      expect(res.shouldScroll).toBe(true);
      // Target centered: rowTop - (containerHeight - rowHeight) / 2
      // 100 - (400 - 40) / 2 = 100 - 180 = -80 -> clamped to 0
      expect(res.targetScrollTop).toBe(0);

      // Row at 200 (above 300)
      const res2 = calculateQueueScrollOffset(containerTop, containerHeight, 200, rowHeight);
      expect(res2.shouldScroll).toBe(true);
      // 200 - 180 = 20
      expect(res2.targetScrollTop).toBe(20);
    });

    it('returns shouldScroll = true and centers row when row is below container viewport', () => {
      // Container scrolled to 0, viewport spans 0 to 400
      const containerTop = 0;
      // Row is at 600 (below 400)
      const res = calculateQueueScrollOffset(containerTop, containerHeight, 600, rowHeight);
      expect(res.shouldScroll).toBe(true);
      // Target centered: 600 - (400 - 40) / 2 = 600 - 180 = 420
      expect(res.targetScrollTop).toBe(420);
    });

    it('detects boundary conditions: row partially clipped at bottom triggers scroll', () => {
      const containerTop = 0;
      // Viewport ends at 400. Row starts at 380, ends at 420 (clipped)
      const res = calculateQueueScrollOffset(containerTop, containerHeight, 380, rowHeight);
      expect(res.shouldScroll).toBe(true);
      expect(res.targetScrollTop).toBe(380 - 180); // 200
    });

    it('detects boundary conditions: row partially clipped at top triggers scroll', () => {
      const containerTop = 100;
      // Row starts at 80 (ends at 120, partially clipped above)
      const res = calculateQueueScrollOffset(containerTop, containerHeight, 80, rowHeight);
      expect(res.shouldScroll).toBe(true);
    });
  });
});
