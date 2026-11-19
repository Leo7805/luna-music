import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Music2,
  FileText,
  Disc,
  Info,
  Sparkles,
  CloudOff,
} from 'lucide-react';
import { TrackItem, LrcLine } from '../types/music';
import { findCurrentLyricIndex } from '../utils/lrcParser';
import { formatDuration, formatFileSize } from '../utils/formatters';

interface NowPlayingPanelProps {
  currentTrack: TrackItem | null;
  currentTime: number;
  lyrics: LrcLine[];
  ambientColors: { primary: string; glow: string };
  isOpen: boolean;
  onClose: () => void;
  onSeekTo: (seconds: number) => void;
}

export const NowPlayingPanel: React.FC<NowPlayingPanelProps> = ({
  currentTrack,
  currentTime,
  lyrics,
  ambientColors,
  isOpen,
  onClose,
  onSeekTo,
}) => {
  const [activeTab, setActiveTab] = useState<'lyrics' | 'artwork'>('lyrics');
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const activeLyricRef = useRef<HTMLDivElement | null>(null);

  const currentLyricIndex = findCurrentLyricIndex(lyrics, currentTime);
  const hasLyrics = lyrics.length > 0;

  // Auto-scroll lyrics smoothly to active line
  useEffect(() => {
    if (activeLyricRef.current && lyricsContainerRef.current) {
      activeLyricRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentLyricIndex]);

  if (!isOpen) return null;

  return (
    <aside className="w-80 lg:w-96 shrink-0 flex flex-col h-full bg-slate-100/95 dark:bg-[#080c16]/95 backdrop-blur-2xl border-l border-slate-300/80 dark:border-white/[0.06] select-none relative overflow-hidden transition-colors duration-200">
      {/* Dynamic Ambient Background Glow in Dark Mode */}
      <div
        className="absolute -top-20 -right-20 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-40 dark:opacity-40 transition-colors duration-700 hidden dark:block"
        style={{
          background: ambientColors.primary || 'rgba(99, 102, 241, 0.2)',
        }}
      />

      {/* Header */}
      <div className="p-4 border-b border-slate-300/80 dark:border-white/[0.06] flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Now Playing
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Tab Switcher */}
          {hasLyrics && (
            <div className="flex items-center bg-slate-200/80 dark:bg-white/[0.06] rounded-lg p-0.5 border border-slate-300/80 dark:border-white/[0.06]">
              <button
                onClick={() => setActiveTab('lyrics')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                  activeTab === 'lyrics'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Lyrics
              </button>
              <button
                onClick={() => setActiveTab('artwork')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                  activeTab === 'artwork'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Art
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.08] transition-colors ml-1 cursor-pointer"
            title="Close Panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {currentTrack ? (
        <div className="flex-1 flex flex-col min-h-0 relative z-10 overflow-hidden">
          {/* Top Artwork + Track Meta Banner */}
          <div className="p-5 flex flex-col items-center text-center border-b border-slate-300/80 dark:border-white/[0.04]">
            {/* Artwork Card with Ambient Glow */}
            <div className="relative mb-4 group">
              <div
                className="w-52 h-52 lg:w-56 lg:h-56 rounded-2xl shadow-2xl overflow-hidden flex items-center justify-center border border-slate-300/80 dark:border-white/[0.1] relative z-10 transition-transform duration-300 group-hover:scale-[1.02]"
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
                  <Disc className="w-20 h-20 text-white/40" />
                )}
              </div>

              {/* Ambient Glow halo */}
              <div
                className="absolute inset-0 rounded-2xl blur-xl opacity-60 -z-0 scale-95 transition-colors duration-700 hidden dark:block"
                style={{
                  background: ambientColors.glow || 'rgba(99, 102, 241, 0.4)',
                }}
              />
            </div>

            {/* Song Details */}
            <h3 className="font-bold text-base text-slate-900 dark:text-white truncate max-w-full px-2">
              {currentTrack.metadata.title}
            </h3>
            <p className="text-xs text-indigo-600 dark:text-indigo-300 font-medium truncate max-w-full mt-0.5">
              {currentTrack.metadata.artist || 'Unknown Artist'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full mt-0.5">
              {currentTrack.metadata.album || 'Unknown Album'}
            </p>

            {/* Technical Badges */}
            <div className="flex items-center gap-2 mt-3 flex-wrap justify-center sm:justify-start">
              {(currentTrack.availability === 'unavailable' || currentTrack.size === 0) && (
                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <CloudOff className="w-2.5 h-2.5" />
                  <span>Not available locally</span>
                </span>
              )}
              {currentTrack.metadata.codec && (
                <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-white/[0.08]">
                  {currentTrack.metadata.codec}
                </span>
              )}
              {currentTrack.metadata.bitrate && (
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-white/[0.08]">
                  {Math.round(currentTrack.metadata.bitrate / 1000)} kbps
                </span>
              )}
              {hasLyrics && (
                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <FileText className="w-2.5 h-2.5" />
                  <span>Synced LRC</span>
                </span>
              )}
            </div>
          </div>

          {/* Lower Content: Lyrics or Artwork Info */}
          <div className="flex-1 flex flex-col min-h-0">
            {hasLyrics && activeTab === 'lyrics' ? (
              <div
                ref={lyricsContainerRef}
                className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar text-center"
              >
                {lyrics.map((line, idx) => {
                  const isActive = idx === currentLyricIndex;

                  return (
                    <div
                      key={idx}
                      ref={isActive ? activeLyricRef : null}
                      onClick={() => onSeekTo(line.time)}
                      className={`cursor-pointer transition-all duration-300 py-1.5 px-3 rounded-xl ${
                        isActive
                          ? 'text-indigo-600 dark:text-white font-bold text-base scale-105 bg-indigo-500/15 dark:bg-indigo-500/20 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-xs opacity-70 hover:opacity-100'
                      }`}
                    >
                      {line.text || '♪ ♪ ♪'}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Artwork Focus / Metadata Details */
              <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-4">
                <div className="p-4 rounded-xl glass-panel space-y-2.5 text-xs">
                  <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold mb-1">
                    <Info className="w-3.5 h-3.5" />
                    <span>Track Properties</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-200 dark:border-white/[0.04]">
                    <span className="text-slate-500 dark:text-slate-400">File Name</span>
                    <span className="text-slate-800 dark:text-slate-200 truncate ml-2 max-w-[160px]" title={currentTrack.name}>
                      {currentTrack.name}
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-200 dark:border-white/[0.04]">
                    <span className="text-slate-500 dark:text-slate-400">File Size</span>
                    <span className="text-slate-800 dark:text-slate-200">{formatFileSize(currentTrack.size)}</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-200 dark:border-white/[0.04]">
                    <span className="text-slate-500 dark:text-slate-400">Duration</span>
                    <span className="text-slate-800 dark:text-slate-200">
                      {formatDuration(currentTrack.metadata.duration)}
                    </span>
                  </div>

                  {currentTrack.metadata.year && (
                    <div className="flex justify-between py-1 border-b border-slate-200 dark:border-white/[0.04]">
                      <span className="text-slate-500 dark:text-slate-400">Year</span>
                      <span className="text-slate-800 dark:text-slate-200">{currentTrack.metadata.year}</span>
                    </div>
                  )}

                  {currentTrack.metadata.genre && (
                    <div className="flex justify-between py-1 border-b border-slate-200 dark:border-white/[0.04]">
                      <span className="text-slate-500 dark:text-slate-400">Genre</span>
                      <span className="text-slate-800 dark:text-slate-200">{currentTrack.metadata.genre}</span>
                    </div>
                  )}
                </div>

                {!hasLyrics && (
                  <div className="p-4 rounded-xl glass-panel text-center text-xs space-y-1.5">
                    <FileText className="w-5 h-5 text-slate-400 dark:text-slate-500 mx-auto" />
                    <p className="font-medium text-slate-700 dark:text-slate-300">No Local Lyrics</p>
                    <p className="text-[11px] text-slate-500">
                      Place a matching <code className="text-indigo-600 dark:text-indigo-300 font-semibold">.lrc</code> file in the same folder to enable live lyrics.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 dark:text-slate-500">
          <Music2 className="w-12 h-12 mb-3 opacity-30 text-indigo-500 dark:text-indigo-400" />
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">No song currently playing</p>
          <p className="text-[11px] text-slate-500 mt-1">Select a track to start playback</p>
        </div>
      )}
    </aside>
  );
};
