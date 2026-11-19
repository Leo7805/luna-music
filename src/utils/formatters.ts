/**
 * Formats a duration in seconds into "m:ss" or "h:mm:ss".
 */
export function formatDuration(seconds?: number): string {
  if (seconds === undefined || isNaN(seconds) || seconds < 0) {
    return '--:--';
  }

  const totalSecs = Math.floor(seconds);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  const paddedSecs = secs.toString().padStart(2, '0');

  if (hrs > 0) {
    const paddedMins = mins.toString().padStart(2, '0');
    return `${hrs}:${paddedMins}:${paddedSecs}`;
  }

  return `${mins}:${paddedSecs}`;
}

/**
 * Formats file size in bytes to a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(1);
  return `${size} ${units[i]}`;
}

/**
 * Cleans a filename into a pleasant song title fallback.
 * Strips extension, leading track numbers (e.g. "01 - ", "02. ", "03 "),
 * and replaces underscores with spaces.
 */
export function cleanTrackTitle(filename: string): string {
  // Strip extension
  const lastDot = filename.lastIndexOf('.');
  let title = lastDot > 0 ? filename.substring(0, lastDot) : filename;

  // Replace underscores
  title = title.replace(/_/g, ' ');

  // Strip leading track numbering e.g. "01 - ", "01. ", "01 "
  title = title.replace(/^\s*\d{1,3}\s*[-–.]\s*/, '');
  title = title.replace(/^\s*\d{1,3}\s+/, '');

  return title.trim() || filename;
}
