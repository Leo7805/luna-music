import { TRACK_PLAYING_BAR_CLASS } from '../utils/trackRowStyles';

interface EqualizerIconProps {
  isPlaying: boolean;
  barClassName?: string;
}

/** Shared CSS-only equalizer; existing animation rules respect reduced motion. */
export function EqualizerIcon({ isPlaying, barClassName = TRACK_PLAYING_BAR_CLASS }: EqualizerIconProps) {
  return (
    <span aria-hidden="true" data-playing={isPlaying} className="w-3.5 h-3.5 inline-flex items-end justify-center gap-[2px] shrink-0">
      <span className={`${barClassName} ${isPlaying ? 'animate-bar-1' : 'h-[45%]'}`} />
      <span className={`${barClassName} ${isPlaying ? 'animate-bar-2' : 'h-[85%]'}`} />
      <span className={`${barClassName} ${isPlaying ? 'animate-bar-3' : 'h-[60%]'}`} />
    </span>
  );
}
