import React, { useEffect, useRef } from 'react';
import { X, Music2, Disc3 } from 'lucide-react';
import { TrackItem, LrcLine } from '../types/music';
import { findCurrentLyricIndex } from '../utils/lrcParser';
import { getTrackStatus } from '../utils/musicTree';
import { getVinylSpinClass } from '../utils/vinylSpin';
import { TrackStatusBadge } from './TrackStatusBadge';

export interface LyricsPanelProps {
  currentTrack: TrackItem | null;
  isPlaying?: boolean;
  currentTime: number;
  lyrics: LrcLine[];
  ambientColors: { primary: string; glow: string };
  isOpen: boolean;
  onClose: () => void;
  onSeekTo: (seconds: number) => void;
}

export const LyricsPanel: React.FC<LyricsPanelProps> = ({
  currentTrack,
  isPlaying = false,
  currentTime,
  lyrics,
  ambientColors,
  isOpen,
  onClose,
  onSeekTo,
}) => {
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const activeLyricRef = useRef<HTMLDivElement | null>(null);

  const currentLyricIndex = findCurrentLyricIndex(lyrics, currentTime);

  // Auto-scroll active lyric line into center view (respecting reduced motion)
  useEffect(() => {
    if (!isOpen) return;
    if (activeLyricRef.current && lyricsContainerRef.current) {
      const container = lyricsContainerRef.current;
      const activeEl = activeLyricRef.current;
      const targetScroll =
        activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2;
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }
  }, [currentLyricIndex, isOpen]);

  if (!isOpen) return null;

  const hasLyrics = lyrics.length > 0;

  return (
    <aside
      data-testid="lyrics-panel"
      aria-label="Synchronized Lyrics"
      className="w-80 lg:w-96 shrink-0 flex flex-col h-full bg-[var(--bg-panel)] dark:bg-[#071427]/95 backdrop-blur-2xl border-l border-[var(--border-subtle)] dark:border-white/[0.08] relative overflow-hidden select-none text-[var(--text-primary)] dark:text-slate-100 transition-colors duration-200"
    >
      {/* Dynamic Ambient Color Backdrop (Dark Mode) */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 dark:opacity-30 transition-all duration-1000"
        style={{
          background: `radial-gradient(circle at 50% 20%, ${ambientColors.primary} 0%, transparent 65%)`,
        }}
      />

      {/* Top-Right Close Button */}
      <div className="relative z-10 flex items-center justify-end px-3 pt-3 shrink-0">
        <button
          type="button"
          onClick={onClose}
          data-testid="close-lyrics-button"
          aria-label="Close Lyrics"
          title="Close Lyrics"
          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:text-slate-400 dark:hover:text-white hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.08] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50 dark:focus-visible:ring-white/30"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Album Artwork Vinyl Disc & Track Identity */}
        {currentTrack && (
          <div className="px-6 pt-1 pb-4 shrink-0 flex flex-col items-center text-center border-b border-[var(--border-subtle)]/70 dark:border-white/[0.06]">
            <div
              data-testid="lyrics-artwork-container"
              className="w-24 h-24 rounded-2xl shrink-0 shadow-md border border-[var(--border-subtle)] dark:border-white/[0.1] overflow-hidden flex items-center justify-center mb-3"
              style={{
                background:
                  currentTrack.metadata.placeholderGradient ||
                  'linear-gradient(135deg, #4338ca, #6d28d9)',
              }}
            >
              <div
                data-testid="lyrics-vinyl-disc"
                data-spinning={isPlaying ? 'true' : 'false'}
                className={`relative flex items-center justify-center rounded-full overflow-hidden ${
                  currentTrack.metadata.artworkUrl
                    ? 'w-20 h-20 ring-2 ring-black/20 dark:ring-white/15 shadow-sm'
                    : 'w-12 h-12'
                } ${getVinylSpinClass(true, isPlaying)}`}
              >
                {currentTrack.metadata.artworkUrl ? (
                  <>
                    <img
                      src={currentTrack.metadata.artworkUrl}
                      alt={currentTrack.metadata.title || currentTrack.name}
                      className="w-full h-full object-cover"
                    />
                    <span
                      aria-hidden="true"
                      className="absolute w-3.5 h-3.5 rounded-full bg-[var(--bg-panel)]/90 dark:bg-[#071427]/90 border-2 border-white/60 dark:border-white/40 shadow-inner"
                    />
                  </>
                ) : (
                  <Disc3 className="w-10 h-10 text-white/70" aria-hidden="true" />
                )}
              </div>
            </div>

            <div className="w-full min-w-0 flex items-center justify-center gap-1.5">
              <h3
                className="font-bold text-sm text-[var(--text-primary)] dark:text-white truncate"
                title={currentTrack.metadata.title || currentTrack.name}
              >
                {currentTrack.metadata.title || currentTrack.name}
              </h3>
              {getTrackStatus(currentTrack) !== 'normal' && (
                <TrackStatusBadge status={getTrackStatus(currentTrack)} />
              )}
            </div>
            <p className="w-full text-xs text-[var(--text-secondary)] dark:text-slate-400 truncate mt-0.5">
              {currentTrack.metadata.artist || 'Unknown Artist'}
            </p>
          </div>
        )}

        {/* Synchronized Lyrics List */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {currentTrack && hasLyrics ? (
            <div
              ref={lyricsContainerRef}
              data-testid="lyrics-lines-container"
              className="flex-1 overflow-y-auto px-5 py-6 space-y-4 custom-scrollbar text-center"
            >
              {lyrics.map((line, idx) => {
                const isActive = idx === currentLyricIndex;
                return (
                  <div
                    key={idx}
                    ref={isActive ? activeLyricRef : null}
                    data-active-lyric={isActive ? 'true' : undefined}
                    onClick={() => onSeekTo(line.time)}
                    className={`cursor-pointer transition-colors duration-200 py-1 px-3 rounded-xl ${
                      isActive
                        ? 'text-[var(--accent-primary)] dark:text-white font-semibold text-[15px]'
                        : 'text-[var(--text-secondary)] dark:text-slate-400 hover:text-[var(--text-primary)] dark:hover:text-slate-200 text-xs opacity-75 hover:opacity-100'
                    }`}
                  >
                    {line.text || '♪ ♪ ♪'}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[var(--text-secondary)] dark:text-slate-500">
              <div className="w-14 h-14 rounded-2xl bg-[var(--bg-active)]/80 dark:bg-white/[0.06] flex items-center justify-center mb-4 border border-[var(--accent-primary)]/15 dark:border-white/[0.08]">
                <Music2 className="w-6 h-6 text-[var(--accent-primary)] dark:text-indigo-400" />
              </div>
              <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-slate-200">
                {currentTrack ? 'No Local Lyrics' : 'No song currently playing'}
              </p>
              <p className="text-xs text-[var(--text-secondary)] dark:text-slate-400 mt-1 max-w-[220px]">
                {currentTrack
                  ? 'Place a matching .lrc file in the same folder to enable live lyrics.'
                  : 'Select a track to start playback'}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

// Backward-compatible named export
export const NowPlayingPanel = LyricsPanel;
