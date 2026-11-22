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
      className={`w-3.5 h-3.5 inline-flex items-end justify-center gap-[2px] ${className}`.trim()}
    >
      <span
        className={`w-[2.5px] rounded-full bg-[var(--accent-primary)] dark:bg-indigo-300 ${
          isPlaying ? 'animate-bar-1' : 'h-[45%]'
        }`}
      />
      <span
        className={`w-[2.5px] rounded-full bg-[var(--accent-primary)] dark:bg-indigo-300 ${
          isPlaying ? 'animate-bar-2' : 'h-[85%]'
        }`}
      />
      <span
        className={`w-[2.5px] rounded-full bg-[var(--accent-primary)] dark:bg-indigo-300 ${
          isPlaying ? 'animate-bar-3' : 'h-[60%]'
        }`}
      />
    </span>
  );
}
