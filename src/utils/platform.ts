export type OpenMusicMode = 'folder' | 'files';

export interface NavigatorLike {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
}

/**
 * Detects iPad devices, including iPadOS browsers that report as Macintosh with touch points.
 */
export function isIPadDevice(
  nav: NavigatorLike | undefined = typeof navigator !== 'undefined' ? navigator : undefined
): boolean {
  if (!nav) return false;
  const ua = nav.userAgent || '';
  if (/iPad/i.test(ua)) return true;
  const touchPoints = nav.maxTouchPoints ?? 0;
  if (touchPoints > 1 && (nav.platform === 'MacIntel' || /Macintosh/i.test(ua))) {
    return true;
  }
  return false;
}

/**
 * Returns the default audio-opening method for the current platform:
 * - Windows & macOS desktop: 'folder'
 * - iPad / mobile: 'files'
 */
export function getDefaultOpenMode(
  nav: NavigatorLike | undefined = typeof navigator !== 'undefined' ? navigator : undefined
): OpenMusicMode {
  return isIPadDevice(nav) ? 'files' : 'folder';
}
