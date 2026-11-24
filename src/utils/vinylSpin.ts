/**
 * Shared CSS animation class resolver for the two rotating vinyl discs
 * (Now Playing header disc and Lyrics panel artwork disc).
 *
 * Keeping `.vinyl-disc-spin` mounted while toggling between `.vinyl-disc-running`
 * and `.vinyl-disc-paused` freezes the disc at its current angle on pause and
 * resumes smoothly without snapping back to 0deg.
 */
export function getVinylSpinClass(hasTrack: boolean, isPlaying: boolean): string {
  if (!hasTrack) return '';
  return isPlaying
    ? 'vinyl-disc-spin vinyl-disc-running'
    : 'vinyl-disc-spin vinyl-disc-paused';
}
