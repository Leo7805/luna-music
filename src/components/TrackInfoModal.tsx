import React, { useEffect } from 'react';
import { X, Disc, Info, FileText } from 'lucide-react';
import { TrackItem } from '../types/music';
import { formatDuration, formatFileSize } from '../utils/formatters';
import { getTrackStatus } from '../utils/musicTree';
import { TrackStatusBadge } from './TrackStatusBadge';

export interface TrackInfoModalProps {
  track: TrackItem | null;
  onClose: () => void;
}

export const TrackInfoModal: React.FC<TrackInfoModalProps> = ({ track, onClose }) => {
  useEffect(() => {
    if (!track) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [track, onClose]);

  if (!track) return null;

  const hasLocalLyrics = Boolean(track.lrcHandle || track.lrcFile || track.lrcContent);
  const status = getTrackStatus(track);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="track-info-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Track Info"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[var(--bg-panel)] dark:bg-[#0c192c] border border-[var(--border-subtle)] dark:border-white/[0.1] shadow-2xl overflow-hidden text-[var(--text-primary)] dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] dark:text-slate-400">
            <Info className="w-4 h-4 text-[var(--accent-primary)] dark:text-indigo-400" />
            <span>Track Info</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close track info"
            className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:text-slate-400 dark:hover:text-white hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Artwork & Title */}
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-xl shrink-0 overflow-hidden shadow-md border border-[var(--border-subtle)] dark:border-white/[0.1] flex items-center justify-center"
              style={{
                background:
                  track.metadata.placeholderGradient ||
                  'linear-gradient(135deg, #4338ca, #6d28d9)',
              }}
            >
              {track.metadata.artworkUrl ? (
                <img
                  src={track.metadata.artworkUrl}
                  alt={track.metadata.title || track.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Disc className="w-7 h-7 text-white/60" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[var(--text-primary)] dark:text-white truncate">
                  {track.metadata.title || track.name}
                </h3>
                {status !== 'normal' && <TrackStatusBadge status={status} />}
              </div>
              <p className="text-xs text-[var(--text-secondary)] dark:text-slate-400 truncate mt-0.5">
                {track.metadata.artist || 'Unknown Artist'}
              </p>
              <p className="text-[11px] text-[var(--text-secondary)] dark:text-slate-500 truncate mt-0.5">
                {track.metadata.album || 'Unknown Album'}
              </p>
            </div>
          </div>

          {/* Properties Table */}
          <div className="rounded-xl p-3.5 bg-[var(--bg-main)]/70 dark:bg-white/[0.03] border border-[var(--border-subtle)] dark:border-white/[0.06] space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]/60 dark:border-white/[0.04]">
              <span className="text-[var(--text-secondary)] dark:text-slate-400">File Name</span>
              <span
                className="text-[var(--text-primary)] dark:text-slate-200 truncate ml-4 max-w-[220px]"
                title={track.name}
              >
                {track.name}
              </span>
            </div>

            <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]/60 dark:border-white/[0.04]">
              <span className="text-[var(--text-secondary)] dark:text-slate-400">File Size</span>
              <span className="text-[var(--text-primary)] dark:text-slate-200">
                {formatFileSize(track.size)}
              </span>
            </div>

            <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]/60 dark:border-white/[0.04]">
              <span className="text-[var(--text-secondary)] dark:text-slate-400">Duration</span>
              <span className="text-[var(--text-primary)] dark:text-slate-200 font-mono">
                {formatDuration(track.metadata.duration)}
              </span>
            </div>

            {track.metadata.year && (
              <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]/60 dark:border-white/[0.04]">
                <span className="text-[var(--text-secondary)] dark:text-slate-400">Year</span>
                <span className="text-[var(--text-primary)] dark:text-slate-200">
                  {track.metadata.year}
                </span>
              </div>
            )}

            {track.metadata.genre && (
              <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]/60 dark:border-white/[0.04]">
                <span className="text-[var(--text-secondary)] dark:text-slate-400">Genre</span>
                <span className="text-[var(--text-primary)] dark:text-slate-200">
                  {track.metadata.genre}
                </span>
              </div>
            )}

            <div className="flex justify-between py-1">
              <span className="text-[var(--text-secondary)] dark:text-slate-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>Local Lyrics</span>
              </span>
              <span className="text-[var(--text-primary)] dark:text-slate-200">
                {hasLocalLyrics ? 'Available (.lrc)' : 'Not available'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
