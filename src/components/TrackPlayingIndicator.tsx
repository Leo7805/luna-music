import { TRACK_PLAYING_BADGE_CLASS, TRACK_PLAYING_BAR_CLASS } from '../utils/trackRowStyles';

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
      <span className="w-3.5 h-3.5 inline-flex items-end justify-center gap-[2px]">
        <span
          className={`${TRACK_PLAYING_BAR_CLASS} ${
            isPlaying ? 'animate-bar-1' : 'h-[45%]'
          }`}
        />
        <span
          className={`${TRACK_PLAYING_BAR_CLASS} ${
            isPlaying ? 'animate-bar-2' : 'h-[85%]'
          }`}
        />
        <span
          className={`${TRACK_PLAYING_BAR_CLASS} ${
            isPlaying ? 'animate-bar-3' : 'h-[60%]'
          }`}
        />
      </span>
    </span>
  );
}
