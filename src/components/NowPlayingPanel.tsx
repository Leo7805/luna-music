import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Music2,
  FileText,
  Disc,
  Info,
  Sparkles,
  ListMusic,
  Trash2,
  Play,
  Save,
} from 'lucide-react';
import { TrackItem, LrcLine } from '../types/music';
import { findCurrentLyricIndex } from '../utils/lrcParser';
import { formatDuration, formatFileSize } from '../utils/formatters';
import { getTrackStatus, isSameTrack } from '../utils/musicTree';
import { TrackStatusBadge } from './TrackStatusBadge';

interface NowPlayingPanelProps {
  currentTrack: TrackItem | null;
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
  const [isSavingQueue, setIsSavingQueue] = useState<boolean>(false);
  const [queuePlaylistName, setQueuePlaylistName] = useState<string>('');
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

  const handleSaveQueue = (e: React.FormEvent) => {
    e.preventDefault();
    const name = queuePlaylistName.trim() || `Queue - ${new Date().toLocaleDateString()}`;
    if (onSaveQueueAsPlaylist) {
      onSaveQueueAsPlaylist(name);
    }
    setIsSavingQueue(false);
    setQueuePlaylistName('');
  };

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
          {/* Tab Switcher */}
          <div className="flex items-center bg-[var(--border-subtle)]/70 dark:bg-white/[0.06] rounded-lg p-0.5 border border-[var(--border-subtle)] dark:border-white/[0.06]">
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
            className="p-1.5 rounded-lg text-[var(--text-secondary)] dark:text-slate-400 hover:text-[var(--text-primary)] dark:hover:text-white hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.08] transition-colors ml-1 cursor-pointer"
            title="Close Panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 relative z-10 overflow-hidden">
        {/* Top Artwork + Track Meta Banner: shown when currentTrack is present */}
        {currentTrack && (
          <div className="p-4 flex flex-col items-center text-center border-b border-[var(--border-subtle)] dark:border-white/[0.04] shrink-0">
            {/* Artwork Card with Ambient Glow */}
            <div className="relative mb-3 group">
              <div
                className="w-40 h-40 lg:w-44 lg:h-44 rounded-2xl shadow-xl overflow-hidden flex items-center justify-center border border-[var(--border-subtle)] dark:border-white/[0.1] relative z-10 transition-transform duration-300 group-hover:scale-[1.02]"
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
                  <Disc className="w-16 h-16 text-white/40" />
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
            <h3 className="font-bold text-sm text-[var(--text-primary)] dark:text-white truncate max-w-full px-2">
              {currentTrack.metadata.title}
            </h3>
            <p className="text-xs text-[var(--accent-primary)] dark:text-indigo-300 font-medium truncate max-w-full mt-0.5">
              {currentTrack.metadata.artist || 'Unknown Artist'}
            </p>
            <p className="text-[11px] text-[var(--text-secondary)] dark:text-slate-400 truncate max-w-full mt-0.5">
              {currentTrack.metadata.album || 'Unknown Album'}
            </p>

            {/* Technical Badges */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap justify-center">
              <TrackStatusBadge status={getTrackStatus(currentTrack)} variant="pill" />
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
            </div>
          </div>
        )}

        {/* Lower Content: Queue, Lyrics, or Info */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {activeTab === 'queue' ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Queue Header Actions */}
              <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] dark:border-white/[0.04] flex items-center justify-between text-xs shrink-0">
                <span className="font-semibold text-[var(--text-primary)] dark:text-slate-300 uppercase tracking-wider text-[11px]">
                  Playback Queue ({queue.length})
                </span>
                <div className="flex items-center gap-1.5">
                  {queue.length > 0 && onSaveQueueAsPlaylist && (
                    <button
                      type="button"
                      onClick={() => setIsSavingQueue(true)}
                      title="Save current queue as a playlist"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-[var(--accent-primary)] dark:text-indigo-400 hover:bg-[var(--bg-active)] dark:hover:bg-indigo-950/40 transition-colors font-medium cursor-pointer"
                    >
                      <Save className="w-3 h-3" />
                      <span>Save as Playlist</span>
                    </button>
                  )}
                  {queue.length > 0 && onClearQueue && (
                    <button
                      type="button"
                      onClick={onClearQueue}
                      title={currentTrack ? 'Clear upcoming songs' : 'Clear queue'}
                      className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-rose-500 hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Save Queue Modal Prompt */}
              {isSavingQueue && (
                <form
                  onSubmit={handleSaveQueue}
                  className="p-3 bg-[var(--bg-active)]/50 dark:bg-indigo-950/40 border-b border-[var(--accent-primary)]/20 dark:border-indigo-900/50 flex items-center gap-2"
                >
                  <input
                    type="text"
                    autoFocus
                    value={queuePlaylistName}
                    onChange={(e) => setQueuePlaylistName(e.target.value)}
                    placeholder="Playlist name..."
                    className="flex-1 px-2.5 py-1 text-xs rounded-lg bg-[var(--bg-main)] dark:bg-slate-900 border border-[var(--border-subtle)] dark:border-slate-700 text-[var(--text-primary)] dark:text-white focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-xs rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white font-medium cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSavingQueue(false)}
                    className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}

              {/* Queue List */}
              <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1">
                {queue.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center text-xs text-[var(--text-secondary)] dark:text-slate-500">
                    <ListMusic className="w-10 h-10 mb-2 opacity-40 text-[var(--accent-primary)] dark:text-indigo-400" />
                    <p className="font-medium text-[var(--text-primary)] dark:text-slate-400">Queue is empty</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                      Add tracks to the queue using &quot;Play Next&quot; or &quot;Add to Queue&quot;
                    </p>
                  </div>
                ) : (
                  queue.map((track, idx) => {
                    const isCurrent = currentTrack ? isSameTrack(track, currentTrack) : false;
                    return (
                      <div
                        key={`${track.id}-${idx}`}
                        tabIndex={0}
                        role="button"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onPlayTrack?.(track);
                          }
                        }}
                        onClick={() => onPlayTrack?.(track)}
                        className={`group flex items-center justify-between p-2 rounded-xl text-xs border transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 focus-visible:border-transparent ${
                          isCurrent
                            ? 'bg-[var(--bg-active)] dark:bg-indigo-600/25 border-[var(--accent-primary)]/30 text-[var(--accent-primary)] dark:text-indigo-300 font-medium shadow-sm'
                            : 'border-transparent hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.04] text-[var(--text-primary)] dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="w-4 text-center text-[10px] text-[var(--text-secondary)]">
                            {isCurrent ? (
                              <Play className="w-3 h-3 text-[var(--accent-primary)] fill-[var(--accent-primary)]" />
                            ) : (
                              idx + 1
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs text-[var(--text-primary)] dark:text-white">
                              {track.metadata.title || track.name}
                            </p>
                            <p className="truncate text-[10px] text-[var(--text-secondary)] dark:text-slate-400">
                              {track.metadata.artist || 'Unknown Artist'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                            {formatDuration(track.metadata.duration)}
                          </span>
                          {onRemoveFromQueue && !isCurrent && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveFromQueue(idx);
                              }}
                              title="Remove from queue"
                              className="p-1 rounded text-[var(--text-secondary)] hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
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
