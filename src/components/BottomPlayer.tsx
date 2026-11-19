import React from 'react';
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
  List,
  FileText,
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
  isNowPlayingOpen: boolean;
  hasLyrics: boolean;
  onTogglePlay: () => void;
  onNextTrack: () => void;
  onPrevTrack: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onCycleRepeat: () => void;
  onToggleShuffle: () => void;
  onToggleFavourite: () => void;
  onToggleNowPlaying: () => void;
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
  isNowPlayingOpen,
  hasLyrics,
  onTogglePlay,
  onNextTrack,
  onPrevTrack,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onCycleRepeat,
  onToggleShuffle,
  onToggleFavourite,
  onToggleNowPlaying,
}: BottomPlayerProps) {
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
    <footer className="h-24 bg-slate-100/95 dark:bg-[#071427]/95 backdrop-blur-xl border-t border-slate-300/80 dark:border-white/[0.08] px-4 md:px-6 flex items-center justify-between gap-4 z-40 select-none text-slate-800 dark:text-slate-100 transition-colors duration-200">
      {/* Left: Track Details */}
      <div className="w-1/4 min-w-[180px] max-w-[280px] flex items-center gap-3">
        {currentTrack ? (
          <>
            {/* Thumbnail */}
            <div
              className="w-13 h-13 rounded-xl shrink-0 flex items-center justify-center overflow-hidden shadow-md border border-slate-300/60 dark:border-white/[0.08]"
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
                className="text-xs font-semibold text-slate-900 dark:text-white truncate hover:underline cursor-pointer"
                onClick={onToggleNowPlaying}
                title={currentTrack.metadata.title}
              >
                {currentTrack.metadata.title}
              </h4>
              <p
                className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 flex items-center gap-1.5"
                title={currentTrack.metadata.artist || 'Unknown Artist'}
              >
                <span>{currentTrack.metadata.artist || 'Unknown Artist'}</span>
                <TrackStatusBadge status={getTrackStatus(currentTrack)} />
              </p>
            </div>

            {/* Heart Button */}
            <button
              onClick={onToggleFavourite}
              className={`p-2 rounded-full transition-all cursor-pointer ${
                isFavourite
                  ? 'text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white'
              }`}
              title={isFavourite ? 'Remove from favourites' : 'Save to favourites'}
            >
              <Heart
                className={`w-4 h-4 ${isFavourite ? 'fill-rose-500 dark:fill-rose-400' : ''}`}
              />
            </button>
          </>
        ) : (
          <div className="text-xs text-slate-400 dark:text-slate-500 italic">No track selected</div>
        )}
      </div>

      {/* Center: Playback Controls & Progress Slider */}
      <div className="flex-1 max-w-2xl flex flex-col items-center gap-1.5">
        {/* Buttons Row */}
        <div className="flex items-center gap-4">
          {/* Shuffle */}
          <button
            onClick={onToggleShuffle}
            className={`p-1.5 rounded-full transition-all relative cursor-pointer ${
              shuffle
                ? 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title={shuffle ? 'Shuffle On' : 'Shuffle Off'}
          >
            <Shuffle className="w-4 h-4" />
            {shuffle && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-500 dark:bg-indigo-400" />
            )}
          </button>

          {/* Previous Track */}
          <button
            onClick={onPrevTrack}
            disabled={!currentTrack}
            className="p-1.5 rounded-full text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white disabled:opacity-40 disabled:hover:text-slate-300 transition-all active:scale-95 cursor-pointer"
            title="Previous track (Ctrl/Cmd + Left)"
          >
            <SkipBack className="w-5 h-5 fill-current" />
          </button>

          {/* Play / Pause Circular Button */}
          <button
            onClick={onTogglePlay}
            disabled={!currentTrack}
            className="w-10 h-10 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-950 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 flex items-center justify-center shadow-lg shadow-black/10 dark:shadow-white/10 transition-all cursor-pointer"
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
            className="p-1.5 rounded-full text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white disabled:opacity-40 disabled:hover:text-slate-300 transition-all active:scale-95 cursor-pointer"
            title="Next track (Ctrl/Cmd + Right)"
          >
            <SkipForward className="w-5 h-5 fill-current" />
          </button>

          {/* Repeat Mode */}
          <button
            onClick={onCycleRepeat}
            className={`p-1.5 rounded-full transition-all relative cursor-pointer ${
              repeatMode !== 'off'
                ? 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title={`Repeat: ${repeatMode}`}
          >
            {repeatMode === 'one' ? (
              <Repeat1 className="w-4 h-4" />
            ) : (
              <Repeat className="w-4 h-4" />
            )}
            {repeatMode !== 'off' && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-500 dark:bg-indigo-400" />
            )}
          </button>
        </div>

        {/* Seek Bar & Timers */}
        <div className="w-full flex items-center gap-3 text-[11px] font-mono text-slate-500 dark:text-slate-400">
          <span className="w-10 text-right">{formatDuration(currentTime)}</span>

          <div className="relative flex-1 flex items-center group py-1 cursor-pointer">
            <input
              type="range"
              min={0}
              max={currentDuration || 100}
              step={0.5}
              value={currentTime}
              onChange={handleSeekChange}
              disabled={!currentTrack}
              className="w-full h-1 bg-slate-300 dark:bg-white/[0.12] rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none"
              style={{
                background: `linear-gradient(to right, #6366f1 ${progressPercent}%, rgba(148, 163, 184, 0.4) ${progressPercent}%)`,
              }}
            />
          </div>

          <span className="w-10 text-left">{formatDuration(currentDuration)}</span>
        </div>
      </div>

      {/* Right: Volume & Side Panels */}
      <div className="w-1/4 min-w-[180px] max-w-[280px] flex items-center justify-end gap-3">
        {/* Lyrics Button */}
        {hasLyrics && (
          <button
            onClick={onToggleNowPlaying}
            className={`p-2 rounded-xl transition-all cursor-pointer ${
              isNowPlayingOpen
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.06]'
            }`}
            title="Toggle Synchronized Lyrics (L)"
          >
            <FileText className="w-4 h-4" />
          </button>
        )}

        {/* Volume Mute/Unmute */}
        <button
          onClick={onToggleMute}
          className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
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
        <div className="w-20 md:w-24 flex items-center">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-full h-1 bg-slate-300 dark:bg-white/[0.15] rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none"
            style={{
              background: `linear-gradient(to right, #6366f1 ${(isMuted ? 0 : volume) * 100}%, rgba(148, 163, 184, 0.4) ${(isMuted ? 0 : volume) * 100}%)`,
            }}
          />
        </div>

        {/* Requirement 5: Simplified Playlist/Queue Toggle with aria-pressed */}
        <button
          type="button"
          onClick={onToggleNowPlaying}
          aria-pressed={isNowPlayingOpen}
          aria-label={isNowPlayingOpen ? 'Collapse Now Playing panel' : 'Expand Now Playing panel'}
          data-testid="now-playing-toggle-button"
          className={`p-2 rounded-xl transition-all cursor-pointer ${
            isNowPlayingOpen
              ? 'bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/40 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.06]'
          }`}
          title={isNowPlayingOpen ? 'Hide Now Playing panel' : 'Show Now Playing panel'}
        >
          <List className="w-4 h-4" />
        </button>
      </div>
    </footer>
  );
}
