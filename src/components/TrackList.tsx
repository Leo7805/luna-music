import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Heart,
  Clock,
  MoreHorizontal,
  ListPlus,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  FolderPlus,
} from 'lucide-react';
import { TrackItem, Playlist } from '../types/music';
import { formatDuration } from '../utils/formatters';
import { getTrackStatus, isFavouriteTrack } from '../utils/musicTree';
import { TrackStatusBadge } from './TrackStatusBadge';
import { PlaylistModal } from './PlaylistModal';

interface TrackListProps {
  tracks: TrackItem[];
  currentTrackId?: string | null;
  isPlaying: boolean;
  favourites: Set<string>;
  playlists?: Playlist[];
  onPlayTrack: (track: TrackItem) => void;
  onTogglePlay: () => void;
  onToggleFavourite: (trackId: string) => void;
  onPlayNext?: (track: TrackItem) => 'added' | 'moved' | void;
  onAddToQueue?: (track: TrackItem) => boolean | void;
  onAddToPlaylist?: (playlistId: string, track: TrackItem) => boolean;
  onCreateAndAddToPlaylist?: (playlistName: string, track: TrackItem) => void;
  onRemoveFromPlaylist?: (trackId: string, index: number) => void;
  onMoveTrackUp?: (index: number) => void;
  onMoveTrackDown?: (index: number) => void;
  emptyVariant?: 'default' | 'favourites' | 'search';
  emptyMessage?: string;
}

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  currentTrackId,
  isPlaying,
  favourites,
  playlists = [],
  onPlayTrack,
  onTogglePlay,
  onToggleFavourite,
  onPlayNext,
  onAddToQueue,
  onAddToPlaylist,
  onCreateAndAddToPlaylist,
  onRemoveFromPlaylist,
  onMoveTrackUp,
  onMoveTrackDown,
  emptyVariant = 'default',
  emptyMessage,
}) => {
  const [activeMenuTrackId, setActiveMenuTrackId] = useState<string | null>(null);
  const [playlistModalTrack, setPlaylistModalTrack] = useState<TrackItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Close context menu on outside click or escape
  useEffect(() => {
    if (!activeMenuTrackId) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-track-menu]')) {
        setActiveMenuTrackId(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenuTrackId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMenuTrackId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  if (tracks.length === 0) {
    if (emptyVariant === 'favourites') {
      return (
        <div className="py-20 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 dark:bg-rose-500/20 flex items-center justify-center mb-3 text-rose-500 dark:text-rose-400">
            <Heart className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            No favourite tracks yet
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
            Click the heart icon on any track to add it to your favourites.
          </p>
        </div>
      );
    }

    if (emptyVariant === 'search') {
      return (
        <div className="py-16 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {emptyMessage || 'No tracks found matching your search.'}
          </p>
        </div>
      );
    }

    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {emptyMessage || 'No tracks found matching your selection.'}
        </p>
      </div>
    );
  }

  const isPlaylistMode = Boolean(onRemoveFromPlaylist || onMoveTrackUp);

  return (
    <div className="w-full relative">
      {/* Subtle floating feedback toast */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900 text-xs font-medium shadow-xl backdrop-blur-md animate-fade-in pointer-events-none">
          {toastMessage}
        </div>
      )}

      {/* Table Header */}
      <div className="grid grid-cols-[48px_minmax(200px,2fr)_minmax(120px,1.5fr)_72px_88px] gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-300/80 dark:border-white/[0.06] select-none">
        <div className="text-center">#</div>
        <div>Title</div>
        <div>Album</div>
        <div className="text-right flex items-center justify-end gap-1">
          <Clock className="w-3.5 h-3.5" />
        </div>
        <div className="text-center"></div>
      </div>

      {/* Track Rows */}
      <div className="divide-y divide-slate-200/60 dark:divide-white/[0.02]">
        {tracks.map((track, idx) => {
          const isCurrent = currentTrackId === track.id;
          const isFav = isFavouriteTrack(track, favourites);
          const extension = track.name.split('.').pop()?.toUpperCase() || '';
          const status = getTrackStatus(track);
          const isAbnormal = status !== 'normal';
          const isMenuOpen = activeMenuTrackId === track.id;

          return (
            <div
              key={`${track.id}-${idx}`}
              onDoubleClick={() => onPlayTrack(track)}
              className={`group grid grid-cols-[48px_minmax(200px,2fr)_minmax(120px,1.5fr)_72px_88px] gap-3 px-4 py-2.5 items-center rounded-xl transition-all cursor-pointer select-none text-xs relative ${
                isCurrent
                  ? 'bg-indigo-600/15 border border-indigo-500/25 shadow-sm'
                  : 'hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
              } ${isAbnormal ? 'opacity-85' : ''}`}
            >
              {/* Col 1: Number or Animated Equalizer or Play Button */}
              <div className="flex items-center justify-center">
                {isCurrent && isPlaying ? (
                  <div className="w-4 h-4 flex items-end justify-center gap-[2px]">
                    <span className="w-[3px] bg-indigo-500 dark:bg-indigo-400 rounded-full animate-bar-1" />
                    <span className="w-[3px] bg-indigo-500 dark:bg-indigo-400 rounded-full animate-bar-2" />
                    <span className="w-[3px] bg-indigo-500 dark:bg-indigo-400 rounded-full animate-bar-3" />
                  </div>
                ) : (
                  <>
                    <span
                      className={`group-hover:hidden ${
                        isCurrent
                          ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCurrent) {
                          onTogglePlay();
                        } else {
                          onPlayTrack(track);
                        }
                      }}
                      className="hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 text-white dark:bg-white dark:text-black hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer"
                    >
                      {isCurrent && isPlaying ? (
                        <Pause className="w-3 h-3 fill-current" />
                      ) : (
                        <Play className="w-3 h-3 fill-current ml-0.5" />
                      )}
                    </button>
                  </>
                )}
              </div>

              {/* Col 2: Thumbnail Artwork + Title + Artist + Format Badge */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center overflow-hidden shadow-sm"
                  style={{
                    background:
                      track.metadata.placeholderGradient ||
                      'linear-gradient(135deg, #3730a3, #1e1b4b)',
                  }}
                >
                  {track.metadata.artworkUrl ? (
                    <img
                      src={track.metadata.artworkUrl}
                      alt={track.metadata.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-white/70 uppercase">
                      {track.metadata.title ? track.metadata.title.substring(0, 2) : 'TR'}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-medium truncate ${
                        isCurrent
                          ? 'text-indigo-700 dark:text-indigo-300 font-semibold'
                          : 'text-slate-900 dark:text-slate-100 group-hover:text-black dark:group-hover:text-white'
                      }`}
                    >
                      {track.metadata.title || track.name}
                    </span>
                    {extension && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-white/[0.08] text-slate-600 dark:text-slate-400 uppercase tracking-wider font-mono shrink-0">
                        {extension}
                      </span>
                    )}
                    <TrackStatusBadge status={status} />
                    {track.lrcHandle || track.lrcFile || track.lrcContent ? (
                      <span
                        className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold shrink-0"
                        title="Synchronized LRC Lyrics Available"
                      >
                        LRC
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {track.metadata.artist || 'Unknown Artist'}
                  </p>
                </div>
              </div>

              {/* Col 3: Album */}
              <div className="text-slate-600 dark:text-slate-400 truncate text-[11px]">
                {track.metadata.album || 'Unknown Album'}
              </div>

              {/* Col 4: Duration */}
              <div className="text-right text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {formatDuration(track.metadata.duration)}
              </div>

              {/* Col 5: Reorder controls (playlist mode) + Heart Favourite + ... Context Menu */}
              <div className="flex items-center justify-end gap-1 shrink-0">
                {isPlaylistMode && onMoveTrackUp && onMoveTrackDown && (
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveTrackUp(idx);
                      }}
                      title="Move up"
                      className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20 cursor-pointer"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === tracks.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveTrackDown(idx);
                      }}
                      title="Move down"
                      className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20 cursor-pointer"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavourite(track.id);
                  }}
                  className={`p-1.5 rounded-full transition-all cursor-pointer ${
                    isFav
                      ? 'text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white opacity-0 group-hover:opacity-100'
                  }`}
                  title={isFav ? 'Remove from favourites' : 'Add to favourites'}
                >
                  <Heart
                    className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 dark:fill-rose-400' : ''}`}
                  />
                </button>

                {/* Track Row ... Menu */}
                <div className="relative" data-track-menu>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuTrackId((prev) => (prev === track.id ? null : track.id));
                    }}
                    title="Track actions"
                    className={`p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.08] transition-opacity cursor-pointer ${
                      isMenuOpen ? 'opacity-100 bg-slate-200/80 dark:bg-white/[0.1]' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>

                  {/* Dropdown Menu */}
                  {isMenuOpen && (
                    <div
                      className="absolute right-0 top-full mt-1 z-30 min-w-[170px] bg-white dark:bg-[#0c192c] border border-slate-200 dark:border-white/[0.1] rounded-xl shadow-xl py-1 text-xs select-none animate-scale-up"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {onPlayNext && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuTrackId(null);
                            const res = onPlayNext(track);
                            if (res === 'moved') {
                              showToast('Moved to play next');
                            } else {
                              showToast('Added to play next');
                            }
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                        >
                          <ListPlus className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Play Next</span>
                        </button>
                      )}

                      {onAddToQueue && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuTrackId(null);
                            const added = onAddToQueue(track);
                            if (added === false) {
                              showToast('Already in queue');
                            } else {
                              showToast('Added to queue');
                            }
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Add to Queue</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setActiveMenuTrackId(null);
                          setPlaylistModalTrack(track);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        <FolderPlus className="w-3.5 h-3.5 text-amber-500" />
                        <span>Add to Playlist...</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveMenuTrackId(null);
                          onToggleFavourite(track.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        <Heart className={`w-3.5 h-3.5 ${isFav ? 'text-rose-500 fill-rose-500' : 'text-slate-400'}`} />
                        <span>{isFav ? 'Remove Favourite' : 'Add to Favourites'}</span>
                      </button>

                      {onRemoveFromPlaylist && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuTrackId(null);
                            onRemoveFromPlaylist(track.id, idx);
                            showToast('Removed from playlist');
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove from Playlist</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add to Playlist Modal */}
      <PlaylistModal
        isOpen={Boolean(playlistModalTrack)}
        mode="addToPlaylist"
        playlists={playlists}
        targetTrack={playlistModalTrack}
        onClose={() => setPlaylistModalTrack(null)}
        onSelectPlaylist={(plId) => {
          if (playlistModalTrack && onAddToPlaylist) {
            const added = onAddToPlaylist(plId, playlistModalTrack);
            if (added) {
              const pl = playlists.find((p) => p.id === plId);
              showToast(`Added to "${pl?.name || 'Playlist'}"`);
            } else {
              showToast('Track already in playlist');
            }
          }
          setPlaylistModalTrack(null);
        }}
        onCreateAndAdd={(newName) => {
          if (playlistModalTrack && onCreateAndAddToPlaylist) {
            onCreateAndAddToPlaylist(newName, playlistModalTrack);
            showToast(`Created & added to "${newName}"`);
          }
          setPlaylistModalTrack(null);
        }}
      />
    </div>
  );
};
