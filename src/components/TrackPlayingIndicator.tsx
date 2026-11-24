import { EqualizerIcon } from './EqualizerIcon';
import { TRACK_PLAYING_BADGE_CLASS } from '../utils/trackRowStyles';

export interface TrackPlayingIndicatorProps {
  isPlaying: boolean;
  testId?: string;
  className?: string;
}

export function TrackPlayingIndicator({
  isPlaying,
  testId,
  className = '',
}: TrackPlayingIndicatorProps) {
  return (
    <span
      data-testid={testId}
      data-playing={isPlaying ? 'true' : 'false'}
      aria-label={isPlaying ? 'Playing' : 'Paused'}
      className={`${TRACK_PLAYING_BADGE_CLASS} ${className}`.trim()}
    >
      <EqualizerIcon isPlaying={isPlaying} />
    </span>
  );
}
