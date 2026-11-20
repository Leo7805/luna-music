import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Music2,
  FileText,
  Disc,
  Info,
  Sparkles,
} from 'lucide-react';
import { TrackItem, LrcLine } from '../types/music';
import { findCurrentLyricIndex } from '../utils/lrcParser';
import { formatDuration, formatFileSize } from '../utils/formatters';
import { getTrackStatus } from '../utils/musicTree';
import { TrackStatusBadge } from './TrackStatusBadge';
import { NowPlayingQueueTab } from './NowPlayingQueueTab';

interface NowPlayingPanelProps {
  currentTrack: TrackItem | null;
  isPlaying?: boolean;
  currentTime: number;
  lyrics: LrcLine[];
  ambientColors: { primary: string; glow: string };
  isOpen: boolean;
  queue?: TrackItem[];
  onClose: () => void;
  onSeekTo: (seconds: number) => void;
  onPlayTrack?: (track: TrackItem) => void;
  onRemoveFromQueue?: (index: number) => void;
  onClearQueue?: () => void;
  onSaveQueueAsPlaylist?: (name: string) => void;
}

export const NowPlayingPanel: React.FC<NowPlayingPanelProps> = ({
  currentTrack,
  isPlaying = false,
  currentTime,
  lyrics,
  ambientColors,
  isOpen,
  queue = [],
  onClose,
  onSeekTo,
  onPlayTrack,
  onRemoveFromQueue,
  onClearQueue,
  onSaveQueueAsPlaylist,
}) => {
  const [activeTab, setActiveTab] = useState<'lyrics' | 'queue' | 'artwork'>('queue');
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
    <aside className="w-80 lg:w-96 shrink-0 flex flex-col h-full bg-[var(--bg-panel)]/95 dark:bg-[#080c16]/95 backdrop-blur-2xl border-l border-[var(--border-subtle)] dark:border-white/[0.06] select-none relative overflow-hidden transition-colors duration-200">
      {/* Dynamic Ambient Background Glow in Dark Mode */}
      <div
        className="absolute -top-20 -right-20 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-40 dark:opacity-40 transition-colors duration-700 hidden dark:block"
        style={{
          background: ambientColors.primary || 'rgba(99, 102, 241, 0.2)',
        }}
      />

      {/* Header */}
      <div className="p-4 border-b border-[var(--border-subtle)] dark:border-white/[0.06] flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent-primary)] dark:text-indigo-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] dark:text-slate-200">
            Now Playing
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Tab Selector Buttons */}
          <div className="flex items-center bg-[var(--bg-active)]/80 dark:bg-white/[0.06] rounded-lg p-0.5 border border-[var(--border-subtle)] dark:border-white/[0.06] mr-2">
            <button
              type="button"
              onClick={() => setActiveTab('lyrics')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 ${
                activeTab === 'lyrics'
                  ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] dark:text-slate-400 hover:text-[var(--text-primary)] dark:hover:text-white'
              }`}
            >
              Lyrics
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 ${
                activeTab === 'queue'
                  ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] dark:text-slate-400 hover:text-[var(--text-primary)] dark:hover:text-white'
              }`}
            >
              Queue ({queue.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('artwork')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 ${
                activeTab === 'artwork'
                  ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] dark:text-slate-400 hover:text-[var(--text-primary)] dark:hover:text-white'
              }`}
            >
              Info
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
            title="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="flex-1 flex flex-col min-h-0 relative z-10">
        {/* Upper Track Summary Card */}
        {currentTrack && (
          <div className="p-4 border-b border-[var(--border-subtle)] dark:border-white/[0.04] bg-[var(--bg-main)]/40 dark:bg-white/[0.01] shrink-0">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-md relative overflow-hidden group border border-[var(--border-subtle)] dark:border-white/[0.08]"
                style={{
                  background: currentTrack.metadata.artworkUrl
                    ? 'transparent'
                    : currentTrack.metadata.placeholderGradient || 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                }}
              >
                {currentTrack.metadata.artworkUrl ? (
                  <img
                    src={currentTrack.metadata.artworkUrl}
                    alt={currentTrack.metadata.album || currentTrack.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <Disc className="w-6 h-6 text-white/90 drop-shadow animate-spin-slow" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
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
                <p className="text-xs text-[var(--text-secondary)] dark:text-slate-400 truncate mt-0.5">
                  {currentTrack.metadata.artist || 'Unknown Artist'}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] text-[var(--text-secondary)] dark:text-slate-500 truncate max-w-[140px]">
                    {currentTrack.metadata.album || 'Unknown Album'}
                  </span>
                  {currentTrack.metadata.year && (
                    <>
                      <span className="text-[10px] text-[var(--text-secondary)] dark:text-slate-600">•</span>
                      <span className="text-[10px] text-[var(--text-secondary)] dark:text-slate-500 font-mono">
                        {currentTrack.metadata.year}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lower Content: Queue, Lyrics, or Info */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {activeTab === 'queue' ? (
            <NowPlayingQueueTab
              queue={queue}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              isOpen={isOpen}
              isActiveTab={activeTab === 'queue'}
              onPlayTrack={onPlayTrack}
              onRemoveFromQueue={onRemoveFromQueue}
              onClearQueue={onClearQueue}
              onSaveQueueAsPlaylist={onSaveQueueAsPlaylist}
            />
          ) : activeTab === 'lyrics' ? (
            currentTrack && hasLyrics ? (
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
                          ? 'text-[var(--accent-primary)] dark:text-white font-bold text-base scale-105 bg-[var(--bg-active)]/80 dark:bg-indigo-500/20 shadow-sm'
                          : 'text-[var(--text-secondary)] dark:text-slate-400 hover:text-[var(--text-primary)] dark:hover:text-slate-200 text-xs opacity-70 hover:opacity-100'
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
            )
          ) : (
            /* activeTab === 'artwork' / Info */
            currentTrack ? (
              <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-4">
                <div className="p-4 rounded-xl glass-panel space-y-2.5 text-xs">
                  <div className="flex items-center gap-2 text-[var(--accent-primary)] dark:text-indigo-400 font-semibold mb-1">
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
                      Place a matching <code className="text-[var(--accent-primary)] dark:text-indigo-300 font-semibold">.lrc</code> file in the same folder to enable live lyrics.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 dark:text-slate-500">
                <Info className="w-12 h-12 mb-3 opacity-30 text-[var(--accent-primary)] dark:text-indigo-400" />
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">No song currently playing</p>
                <p className="text-[11px] text-slate-500 mt-1">Select a track to inspect its properties</p>
              </div>
            )
          )}
        </div>
      </div>
    </aside>
  );
};
