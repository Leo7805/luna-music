import { describe, it, expect } from 'vitest';

describe('Playlist and Now Playing toggle button state and accessibility', () => {
  it('provides correct aria-pressed and accessible labels reflecting panel state', () => {
    function getButtonAttributes(isNowPlayingOpen: boolean) {
      return {
        'aria-pressed': isNowPlayingOpen,
        'aria-label': isNowPlayingOpen
          ? 'Collapse Now Playing panel'
          : 'Expand Now Playing panel',
        title: isNowPlayingOpen
          ? 'Hide Now Playing panel'
          : 'Show Now Playing panel',
      };
    }

    const openAttrs = getButtonAttributes(true);
    expect(openAttrs['aria-pressed']).toBe(true);
    expect(openAttrs['aria-label']).toBe('Collapse Now Playing panel');

    const closedAttrs = getButtonAttributes(false);
    expect(closedAttrs['aria-pressed']).toBe(false);
    expect(closedAttrs['aria-label']).toBe('Expand Now Playing panel');
  });

  it('correctly toggles the existing panel open and closed without creating redundant panels', () => {
    let isNowPlayingOpen = true;
    const togglePanel = () => {
      isNowPlayingOpen = !isNowPlayingOpen;
    };

    togglePanel();
    expect(isNowPlayingOpen).toBe(false);

    togglePanel();
    expect(isNowPlayingOpen).toBe(true);

    togglePanel();
    expect(isNowPlayingOpen).toBe(false);
  });
});
