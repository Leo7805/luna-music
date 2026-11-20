/**
 * Calculates whether the active queue row is outside the visible container boundaries,
 * and if so, computes the centered target scrollTop.
 */
export function calculateQueueScrollOffset(
  containerTop: number,
  containerHeight: number,
  rowTop: number,
  rowHeight: number
): { shouldScroll: boolean; targetScrollTop: number } {
  const isAbove = rowTop < containerTop;
  const isBelow = rowTop + rowHeight > containerTop + containerHeight;

  if (isAbove || isBelow) {
    const targetScrollTop = Math.max(0, rowTop - (containerHeight - rowHeight) / 2);
    return { shouldScroll: true, targetScrollTop };
  }
  return { shouldScroll: false, targetScrollTop: containerTop };
}
