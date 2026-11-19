import { describe, it, expect } from 'vitest';
import { isIPadDevice, getDefaultOpenMode } from '../src/utils/platform';
import { parseFileList, parseSelectedFiles } from '../src/services/fallbackAccess';

describe('OpenMusicControl platform detection & default opening mode', () => {
  it('selects folder mode for Windows and macOS desktop browsers', () => {
    expect(
      getDefaultOpenMode({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
        maxTouchPoints: 0,
      })
    ).toBe('folder');

    expect(
      getDefaultOpenMode({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      })
    ).toBe('folder');
  });

  it('selects files mode for iPad and iPadOS devices', () => {
    // Standard iPad UA
    expect(
      isIPadDevice({
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
        platform: 'iPad',
        maxTouchPoints: 5,
      })
    ).toBe(true);

    // iPadOS reporting as Macintosh with multi-touch points
    expect(
      isIPadDevice({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      })
    ).toBe(true);

    expect(
      getDefaultOpenMode({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      })
    ).toBe('files');
  });
});

describe('Single opening control visibility logic', () => {
  function getVisibleControls(hasLibrary: boolean) {
    return {
      emptyStateControlVisible: !hasLibrary,
      sidebarControlVisible: hasLibrary,
    };
  }

  it('shows only the empty state control when no music library is loaded', () => {
    const controls = getVisibleControls(false);
    expect(controls.emptyStateControlVisible).toBe(true);
    expect(controls.sidebarControlVisible).toBe(false);
  });

  it('shows only the sidebar compact control when a library is loaded', () => {
    const controls = getVisibleControls(true);
    expect(controls.emptyStateControlVisible).toBe(false);
    expect(controls.sidebarControlVisible).toBe(true);
  });
});

describe('Picker cancellation safety', () => {
  it('returns null on empty or cancelled file input without corrupting library', () => {
    expect(parseFileList([])).toBeNull();
    expect(parseSelectedFiles([])).toBeNull();
    // @ts-expect-error Testing null inputs
    expect(parseFileList(null)).toBeNull();
    // @ts-expect-error Testing null inputs
    expect(parseSelectedFiles(null)).toBeNull();
  });
});
