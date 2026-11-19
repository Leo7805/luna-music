import React, { useState, useEffect } from 'react';
import { X, ListMusic, Plus, Check } from 'lucide-react';
import { Playlist, TrackItem } from '../types/music';

interface PlaylistModalProps {
  isOpen: boolean;
  mode: 'create' | 'rename' | 'addToPlaylist';
  initialName?: string;
  playlists?: Playlist[];
  targetTrack?: TrackItem | null;
  targetTracks?: TrackItem[];
  onClose: () => void;
  onSubmitName?: (name: string) => void;
  onSelectPlaylist?: (playlistId: string) => void;
  onCreateAndAdd?: (name: string) => void;
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({
  isOpen,
  mode,
  initialName = '',
  playlists = [],
  targetTrack,
  targetTracks,
  onClose,
  onSubmitName,
  onSelectPlaylist,
  onCreateAndAdd,
}) => {
  const [name, setName] = useState<string>(initialName);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setFeedback(null);
    }
  }, [isOpen, initialName]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    if (mode === 'create' || mode === 'rename') {
      onSubmitName?.(trimmed);
      onClose();
    } else if (mode === 'addToPlaylist') {
      onCreateAndAdd?.(trimmed);
      onClose();
    }
  };

  const handlePickPlaylist = (pl: Playlist) => {
    if (targetTrack) {
      const isAlreadyIn = pl.tracks.some(
        (ref) =>
          ref.trackId === targetTrack.id ||
          (targetTrack.aliases && targetTrack.aliases.includes(ref.trackId))
      );
      if (isAlreadyIn) {
        setFeedback(`Already in "${pl.name}"`);
        setTimeout(() => setFeedback(null), 2500);
        return;
      }
    }

    onSelectPlaylist?.(pl.id);
    onClose();
  };

  const isBulk = Boolean(targetTracks && targetTracks.length > 0);
  const trackCount = targetTracks?.length || (targetTrack ? 1 : 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-[#0c192c] border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <ListMusic className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {mode === 'create'
                ? 'Create New Playlist'
                : mode === 'rename'
                ? 'Rename Playlist'
                : isBulk
                ? `Add ${trackCount} Tracks to Playlist`
                : 'Add to Playlist'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {feedback && (
          <div className="mt-3 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs">
            {feedback}
          </div>
        )}

        {mode === 'addToPlaylist' ? (
          <div className="mt-4 space-y-3">
            {isBulk ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Adding <span className="font-semibold text-slate-800 dark:text-slate-200">{trackCount} tracks</span> to playlist:
              </p>
            ) : targetTrack ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Adding: <span className="font-semibold text-slate-800 dark:text-slate-200">{targetTrack.metadata.title || targetTrack.name}</span>
              </p>
            ) : null}

            {playlists.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                {playlists.map((pl) => {
                  const isAlreadyIn =
                    targetTrack &&
                    pl.tracks.some(
                      (ref) =>
                        ref.trackId === targetTrack.id ||
                        (targetTrack.aliases && targetTrack.aliases.includes(ref.trackId))
                    );

                  return (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => handlePickPlaylist(pl)}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-xs text-left transition-all cursor-pointer ${
                        isAlreadyIn
                          ? 'opacity-60 bg-slate-100 dark:bg-white/[0.02]'
                          : 'hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <span className="font-medium truncate flex-1">{pl.name}</span>
                      <span className="text-[10px] text-slate-400 ml-2">
                        {isAlreadyIn ? (
                          <span className="flex items-center gap-0.5 text-emerald-500">
                            <Check className="w-3 h-3" /> Added
                          </span>
                        ) : (
                          `${pl.tracks.length} tracks`
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Quick Create & Add Form */}
            <form onSubmit={handleSubmit} className="pt-2 border-t border-slate-200 dark:border-white/[0.06] flex items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Or create new playlist..."
                className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-300 dark:border-white/[0.1] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!name.trim()}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white shadow-sm flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create</span>
              </button>
            </form>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Playlist Name
              </label>
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome Playlist"
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-300 dark:border-white/[0.1] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-300 dark:border-white/[0.1] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white shadow-sm transition-colors cursor-pointer"
              >
                {mode === 'create' ? 'Create Playlist' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
