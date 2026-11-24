import React, { useRef } from 'react';
import { EqualizerIcon } from './EqualizerIcon';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  Volume1,
  VolumeX,
  Heart,
  ScrollText,
} from 'lucide-react';
import { TrackItem, RepeatMode } from '../types/music';
import { formatDuration } from '../utils/formatters';
import { getTrackStatus } from '../utils/musicTree';
import { TrackStatusBadge } from './TrackStatusBadge';

interface BottomPlayerProps {
  currentTrack: TrackItem | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  shuffle: boolean;
  isFavourite: boolean;
  isLyricsOpen?: boolean;
  isNowPlayingOpen?: boolean;
  isNowPlayingViewOpen?: boolean;
  onTogglePlay: () => void;
  onNextTrack: () => void;
  onPrevTrack: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onCycleRepeat: () => void;
  onToggleShuffle: () => void;
  onToggleFavourite: () => void;
  onToggleLyrics?: () => void;
  onToggleNowPlaying?: () => void;
  onToggleNowPlayingView?: () => void;
}

export function BottomPlayer({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  repeatMode,
  shuffle,
  isFavourite,
  isLyricsOpen,
  isNowPlayingOpen,
  isNowPlayingViewOpen = false,
  onTogglePlay,
  onNextTrack,
  onPrevTrack,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onCycleRepeat,
  onToggleShuffle,
  onToggleFavourite,
  onToggleLyrics,
  onToggleNowPlaying,
  onToggleNowPlayingView,
}: BottomPlayerProps) {
  const lyricsOpen = isLyricsOpen !== undefined ? isLyricsOpen : Boolean(isNowPlayingOpen);
  const handleToggleLyrics = onToggleLyrics || onToggleNowPlaying || (() => {});
  const handleToggleNowPlayingView = onToggleNowPlayingView || (() => {});
  const nowPlayingAction = isNowPlayingViewOpen ? 'Back to Library' : 'Open Now Playing';
  const startedOnControl = useRef(false);
  const isControl = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(
    'button, a, input, select, textarea, label, [role="button"], [role="slider"], [role="menu"], [tabindex], [contenteditable="true"], [data-player-control]'
  ));
  const handleBackgroundClick = (event: React.MouseEvent<HTMLElement>) => {
    const blocked = startedOnControl.current || isControl(event.target);
    startedOnControl.current = false;
    if (!blocked) handleToggleNowPlayingView();
  };
  const currentDuration = duration || currentTrack?.metadata.duration || 0;
  const progressPercent = currentDuration > 0 ? (currentTime / currentDuration) * 100 : 0;

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onSeek(val);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onVolumeChange(val);
  };

  return (
    <footer
      data-testid="bottom-player"
      onPointerDownCapture={event => { startedOnControl.current = isControl(event.target); }}
      onPointerCancel={() => { startedOnControl.current = false; }}
      onClick={handleBackgroundClick}
      className="cursor-pointer h-24 bg-[var(--bg-player)]/95 dark:bg-[#071427]/95 backdrop-blur-xl border-t border-[var(--border-subtle)] dark:border-white/[0.08] px-2 sm:px-4 md:px-6 flex items-center justify-between gap-2 md:gap-4 z-40 select-none text-[var(--text-primary)] dark:text-slate-100 transition-colors duration-200">
      {/* Left: Track Details */}
      <div className="w-[22%] min-w-0 max-w-[280px] flex items-center gap-1 md:gap-2">
        {currentTrack ? (
          <>
            {/* Clickable Track Info Area -> Opens/Toggles Central Now Playing */}
            <button
              type="button"
              onClick={handleToggleNowPlayingView}
              data-testid="bottom-track-info-button"
              aria-label={nowPlayingAction}
              aria-pressed={isNowPlayingViewOpen}
              title={nowPlayingAction}
              className="flex items-center gap-3 min-w-0 flex-1 text-left p-1.5 -ml-1.5 rounded-xl transition-colors duration-150 cursor-pointer hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50 dark:focus-visible:ring-white/30"
            >
              {/* Thumbnail */}
              <div
                className="hidden sm:flex w-9 h-9 md:w-13 md:h-13 rounded-xl shrink-0 flex items-center justify-center overflow-hidden shadow-md border border-[var(--border-subtle)] dark:border-white/[0.08]"
                style={{
                  background:
                    currentTrack.metadata.placeholderGradient ||
                    'linear-gradient(135deg, #4338ca, #6d28d9)',
                }}
              >
                {currentTrack.metadata.artworkUrl ? (
                  <img
                    src={currentTrack.metadata.artworkUrl}
                    alt={currentTrack.metadata.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] font-bold text-white/60 uppercase">
                    {currentTrack.metadata.title.substring(0, 2)}
                  </span>
                )}
              </div>

              {/* Title & Artist */}
              <div className="min-w-0 flex-1">
                <h4
                  className="text-xs font-semibold text-[var(--text-primary)] dark:text-white truncate"
                  title={currentTrack.metadata.title}
                >
                  {currentTrack.metadata.title}
                </h4>
                <p
                  className="text-[11px] text-[var(--text-secondary)] dark:text-slate-400 truncate mt-0.5 flex items-center gap-1.5"
                  title={currentTrack.metadata.artist || 'Unknown Artist'}
                >
                  <span className="truncate">{currentTrack.metadata.artist || 'Unknown Artist'}</span>
                  <TrackStatusBadge status={getTrackStatus(currentTrack)} />
                </p>
              </div>
            </button>

            {/* Independent Heart Button */}
            <button
              type="button"
              onClick={onToggleFavourite}
              data-testid="bottom-favourite-button"
              className={`p-2 rounded-full shrink-0 transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
                isFavourite
                  ? 'text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300'
                  : 'text-[var(--text-secondary)] dark:text-slate-500 hover:text-[var(--text-primary)] dark:hover:text-white'
              }`}
              title={isFavourite ? 'Remove from favourites' : 'Save to favourites'}
            >
              <Heart
                className={`w-4 h-4 ${isFavourite ? 'fill-rose-500 dark:fill-rose-400' : ''}`}
              />
            </button>
          </>
        ) : (
          <div className="text-xs text-[var(--text-secondary)] dark:text-slate-500 italic">No track selected</div>
        )}
      </div>

      {/* Center: Playback Controls & Progress Slider */}
      <div className="min-w-[176px] sm:min-w-0 flex-1 max-w-2xl flex flex-col items-center gap-1.5">
        {/* Buttons Row */}
        <div className="flex items-center gap-1 sm:gap-4">
          {/* Shuffle */}
          <button
            onClick={onToggleShuffle}
            className={`p-1.5 rounded-full transition-colors duration-150 relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 ${
              shuffle
                ? 'text-[var(--accent-primary)] dark:text-indigo-400 hover:text-[var(--accent-hover)] dark:hover:text-indigo-300'
                : 'text-[var(--text-secondary)] dark:text-slate-400 hover:text-[var(--text-primary)] dark:hover:text-white'
            }`}
            title={shuffle ? 'Shuffle On' : 'Shuffle Off'}
          >
            <Shuffle className="w-4 h-4" />
            {shuffle && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent-primary)] dark:bg-indigo-400" />
            )}
          </button>

          {/* Previous Track */}
          <button
            onClick={onPrevTrack}
            disabled={!currentTrack}
            className="p-1.5 rounded-full text-[var(--text-secondary)] dark:text-slate-300 hover:text-[var(--text-primary)] dark:hover:text-white disabled:opacity-40 disabled:hover:text-[var(--text-secondary)] transition-colors duration-150 active:scale-95 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70"
            title="Previous track (Ctrl/Cmd + Left)"
          >
            <SkipBack className="w-5 h-5 fill-current" />
          </button>

          {/* Play / Pause Circular Button */}
          <button
            onClick={onTogglePlay}
            disabled={!currentTrack}
            className="w-10 h-10 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white dark:bg-white dark:text-slate-950 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 flex items-center justify-center shadow-lg shadow-[var(--accent-primary)]/25 dark:shadow-white/10 transition-transform duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          {/* Next Track */}
          <button
            onClick={onNextTrack}
            disabled={!currentTrack}
            className="p-1.5 rounded-full text-[var(--text-secondary)] dark:text-slate-300 hover:text-[var(--text-primary)] dark:hover:text-white disabled:opacity-40 disabled:hover:text-[var(--text-secondary)] transition-colors duration-150 active:scale-95 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70"
            title="Next track (Ctrl/Cmd + Right)"
          >
            <SkipForward className="w-5 h-5 fill-current" />
          </button>

          {/* Repeat Mode */}
          <button
            onClick={onCycleRepeat}
            className={`p-1.5 rounded-full transition-colors duration-150 relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 ${
              repeatMode !== 'off'
                ? 'text-[var(--accent-primary)] dark:text-indigo-400 hover:text-[var(--accent-hover)] dark:hover:text-indigo-300'
                : 'text-[var(--text-secondary)] dark:text-slate-400 hover:text-[var(--text-primary)] dark:hover:text-white'
            }`}
            title={`Repeat: ${repeatMode}`}
          >
            {repeatMode === 'one' ? (
              <Repeat1 className="w-4 h-4" />
            ) : (
              <Repeat className="w-4 h-4" />
            )}
            {repeatMode !== 'off' && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent-primary)] dark:bg-indigo-400" />
            )}
          </button>
        </div>

        {/* Seek Bar & Timers */}
        <div data-player-control className="cursor-default w-full flex items-center gap-1 sm:gap-3 text-[11px] font-mono text-[var(--text-secondary)] dark:text-slate-400">
          <span className="w-10 text-right">{formatDuration(currentTime)}</span>

          <div className="relative flex-1 flex items-center group py-1 cursor-pointer">
            <input
              aria-label="Seek"
              type="range"
              min={0}
              max={currentDuration || 100}
              step={0.5}
              value={currentTime}
              onChange={handleSeekChange}
              disabled={!currentTrack}
              className="w-full h-1 bg-[var(--border-subtle)] dark:bg-white/[0.12] rounded-lg appearance-none cursor-pointer accent-[var(--accent-primary)] focus:outline-none"
              style={{
                background: `linear-gradient(to right, var(--accent-primary) ${progressPercent}%, var(--border-subtle) ${progressPercent}%)`,
              }}
            />
          </div>

          <span className="w-10 text-left">{formatDuration(currentDuration)}</span>
        </div>
      </div>

      {/* Right: Volume & Side Panels */}
      <div className="shrink-0 flex items-center justify-end gap-1 md:gap-2">
        {/* Volume Mute/Unmute */}
        <button
          type="button"
          onClick={onToggleMute}
          className="p-1.5 rounded-lg text-[var(--text-secondary)] dark:text-slate-400 hover:text-[var(--text-primary)] dark:hover:text-white transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70"
          title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="w-4 h-4 text-rose-500 dark:text-rose-400" />
          ) : volume < 0.5 ? (
            <Volume1 className="w-4 h-4" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>

        {/* Volume Slider */}
        <div data-player-control className="cursor-default w-10 md:w-16 lg:w-20 flex items-center">
          <input
            aria-label="Volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-full h-1 bg-[var(--border-subtle)] dark:bg-white/[0.15] rounded-lg appearance-none cursor-pointer accent-[var(--accent-primary)] focus:outline-none"
            style={{
              background: `linear-gradient(to right, var(--accent-primary) ${(isMuted ? 0 : volume) * 100}%, var(--border-subtle) ${(isMuted ? 0 : volume) * 100}%)`,
            }}
          />
        </div>

        <button
          type="button"
          onClick={handleToggleNowPlayingView}
          data-testid="now-playing-toggle-button"
          data-selected={isNowPlayingViewOpen ? 'true' : 'false'}
          aria-label={nowPlayingAction}
          aria-pressed={isNowPlayingViewOpen}
          title={nowPlayingAction}
          className={`shrink-0 inline-flex items-center justify-center gap-2 p-2 lg:px-3 rounded-xl border text-xs font-semibold transition-colors duration-150 cursor-pointer active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50 dark:focus-visible:ring-white/30 ${
            isNowPlayingViewOpen
              ? 'bg-[var(--track-current-accent)]/12 dark:bg-indigo-500/20 text-[var(--track-current-accent)] dark:text-indigo-300 border-[var(--track-current-border)] dark:border-indigo-400/35 hover:bg-[var(--track-current-accent)]/16 dark:hover:bg-indigo-500/25'
              : 'border-transparent text-[var(--text-secondary)] dark:text-slate-300 hover:text-[var(--text-primary)] dark:hover:text-white hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.06]'
          }`}
        >
          <EqualizerIcon
            isPlaying={Boolean(currentTrack) && isPlaying}
            barClassName="w-[2.5px] rounded-full bg-current"
          />
          <span className="hidden lg:inline whitespace-nowrap">Now Playing</span>
        </button>

        {/* Dedicated Right-Side Lyrics Panel Toggle */}
        <button
          type="button"
          onClick={handleToggleLyrics}
          aria-expanded={lyricsOpen}
          aria-pressed={lyricsOpen}
          aria-label={lyricsOpen ? 'Hide Lyrics' : 'Show Lyrics'}
          data-testid="lyrics-toggle-button"
          className={`p-2 rounded-xl border transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50 dark:focus-visible:ring-white/30 ${
            lyricsOpen
              ? 'bg-[var(--bg-active)] dark:bg-white/[0.1] text-[var(--accent-primary)] dark:text-indigo-300 border-[var(--accent-primary)]/25 dark:border-white/[0.12]'
              : 'border-transparent text-[var(--text-secondary)] dark:text-slate-400 hover:text-[var(--text-primary)] dark:hover:text-white hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.06]'
          }`}
          title={lyricsOpen ? 'Hide Lyrics' : 'Show Lyrics'}
        >
          <ScrollText className="w-4 h-4" />
        </button>
      </div>
    </footer>
  );
}
