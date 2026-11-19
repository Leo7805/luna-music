import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  CheckSquare,
  Square,
  X,
} from 'lucide-react';
import { TrackItem, Playlist } from '../types/music';
import { formatDuration } from '../utils/formatters';
import { getTrackStatus, isFavouriteTrack } from '../utils/musicTree';
import { TrackStatusBadge } from './TrackStatusBadge';
import { PlaylistModal } from './PlaylistModal';

interface TrackListProps {
  tracks: TrackItem[];
  libraryTracks?: TrackItem[];
  currentTrackId?: string | null;
  isPlaying: boolean;
  favourites: Set<string>;
  playlists?: Playlist[];
  onPlayTrack: (track: TrackItem) => void;
  onTogglePlay: () => void;
  onToggleFavourite: (trackId: string) => void;
  onPlayNext?: (track: TrackItem) => 'added' | 'moved' | void;
  onPlayNextBulk?: (tracks: TrackItem[]) => { movedCount: number; addedCount: number } | void;
  onAddToQueue?: (trackOrTracks: TrackItem | TrackItem[]) => boolean | void;
  onAddToPlaylist?: (playlistId: string, track: TrackItem) => boolean;
  onAddTracksToPlaylist?: (playlistId: string, tracks: TrackItem[]) => { addedCount: number };
  onCreateAndAddToPlaylist?: (playlistName: string, trackOrTracks: TrackItem | TrackItem[]) => void;
  onRemoveFromPlaylist?: (trackId: string, index: number) => void;
  onRemoveTracksFromPlaylist?: (trackIds: string[]) => void;
  onRemoveImportedFiles?: (trackIds: string[]) => void;
  onAddTracksToFavourites?: (tracks: TrackItem[]) => void;
  onRemoveTracksFromFavourites?: (tracks: TrackItem[]) => void;
  onMoveTrackUp?: (index: number) => void;
  onMoveTrackDown?: (index: number) => void;
  emptyVariant?: 'default' | 'favourites' | 'search';
  emptyMessage?: string;
  isPlaylistView?: boolean;
  isImportedFilesView?: boolean;
}

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  libraryTracks,
  currentTrackId,
  isPlaying,
  favourites,
  playlists = [],
  onPlayTrack,
  onTogglePlay,
  onToggleFavourite,
  onPlayNext,
  onPlayNextBulk,
  onAddToQueue,
  onAddToPlaylist,
  onAddTracksToPlaylist,
  onCreateAndAddToPlaylist,
  onRemoveFromPlaylist,
  onRemoveTracksFromPlaylist,
  onRemoveImportedFiles,
  onAddTracksToFavourites,
  onRemoveTracksFromFavourites,
  onMoveTrackUp,
  onMoveTrackDown,
  emptyVariant = 'default',
  emptyMessage,
  isPlaylistView = false,
  isImportedFilesView = false,
}) => {
  const [activeMenuTrackId, setActiveMenuTrackId] = useState<string | null>(null);
  const [playlistModalTrack, setPlaylistModalTrack] = useState<TrackItem | null>(null);
  const [bulkPlaylistModalOpen, setBulkPlaylistModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Multi-selection state
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [lastSelectedTrackId, setLastSelectedTrackId] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);

  // Touch long-press timer ref
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTouchLongPressTriggeredRef = useRef<boolean>(false);

  // Reconcile selection if displayed tracks change (prune deleted/promoted IDs)
  useEffect(() => {
    setSelectedTrackIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(tracks.map((t) => t.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) {
          next.add(id);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [tracks]);

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

  // Keyboard navigation for multi-selection (Cmd+A / Ctrl+A, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      // Cmd+A / Ctrl+A: Select all tracks
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setSelectedTrackIds(new Set(tracks.map((t) => t.id)));
        return;
      }

      // Escape: Clear selection
      if (e.key === 'Escape') {
        if (selectedTrackIds.size > 0) {
          e.preventDefault();
          setSelectedTrackIds(new Set());
          setLastSelectedTrackId(null);
        } else if (isSelectMode) {
          setIsSelectMode(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tracks, selectedTrackIds.size, isSelectMode]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  const selectedTracks = useMemo(() => {
    return tracks.filter((t) => selectedTrackIds.has(t.id));
  }, [tracks, selectedTrackIds]);

  const areAllSelectedFavourites = useMemo(() => {
    if (selectedTracks.length === 0) return false;
    return selectedTracks.every((t) => isFavouriteTrack(t, favourites, libraryTracks || tracks));
  }, [selectedTracks, favourites, libraryTracks, tracks]);

  // Handle row click with modifiers
  const handleRowClick = (e: React.MouseEvent, track: TrackItem, index: number) => {
    if ((e.target as HTMLElement).closest('button, [data-track-menu], input[type="checkbox"]')) {
      return;
    }

    if (e.metaKey || e.ctrlKey) {
      setSelectedTrackIds((prev) => {
        const next = new Set(prev);
        if (next.has(track.id)) {
          next.delete(track.id);
        } else {
          next.add(track.id);
        }
        return next;
      });
      setLastSelectedTrackId(track.id);
      return;
    }

    if (e.shiftKey) {
      if (!lastSelectedTrackId) {
        setSelectedTrackIds(new Set([track.id]));
        setLastSelectedTrackId(track.id);
        return;
      }

      const lastIdx = tracks.findIndex((t) => t.id === lastSelectedTrackId);
      if (lastIdx === -1) {
        setSelectedTrackIds(new Set([track.id]));
        setLastSelectedTrackId(track.id);
        return;
      }

      const start = Math.min(lastIdx, index);
      const end = Math.max(lastIdx, index);
      const rangeIds = tracks.slice(start, end + 1).map((t) => t.id);

      setSelectedTrackIds((prev) => {
        const next = new Set(prev);
        rangeIds.forEach((id) => next.add(id));
        return next;
      });
      return;
    }

    if (isSelectMode) {
      setSelectedTrackIds((prev) => {
        const next = new Set(prev);
        if (next.has(track.id)) {
          next.delete(track.id);
        } else {
          next.add(track.id);
        }
        return next;
      });
      setLastSelectedTrackId(track.id);
      return;
    }

    if (selectedTrackIds.size > 0) {
      setSelectedTrackIds(new Set());
      setLastSelectedTrackId(null);
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent, track: TrackItem) => {
    e.stopPropagation();
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(track.id)) {
        next.delete(track.id);
      } else {
        next.add(track.id);
      }
      return next;
    });
    setLastSelectedTrackId(track.id);
  };

  const toggleSelectAll = () => {
    if (selectedTrackIds.size === tracks.length && tracks.length > 0) {
      setSelectedTrackIds(new Set());
      setLastSelectedTrackId(null);
    } else {
      setSelectedTrackIds(new Set(tracks.map((t) => t.id)));
    }
  };

  // Touch long press handlers
  const handleTouchStart = (track: TrackItem) => {
    isTouchLongPressTriggeredRef.current = false;
    touchTimerRef.current = setTimeout(() => {
      isTouchLongPressTriggeredRef.current = true;
      setIsSelectMode(true);
      setSelectedTrackIds((prev) => {
        const next = new Set(prev);
        next.add(track.id);
        return next;
      });
      setLastSelectedTrackId(track.id);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  // Bulk actions handlers
  const handleBulkPlayNext = () => {
    if (selectedTracks.length === 0) return;
    if (onPlayNextBulk) {
      const res = onPlayNextBulk(selectedTracks);
      if (res && res.movedCount > 0 && res.addedCount === 0) {
        showToast(`${res.movedCount} tracks moved to play next`);
      } else {
        showToast(`${selectedTracks.length} tracks set to play next`);
      }
    } else if (onPlayNext) {
      for (const t of selectedTracks) {
        onPlayNext(t);
      }
      showToast(`${selectedTracks.length} tracks added to play next`);
    }
    setSelectedTrackIds(new Set());
  };

  const handleBulkAddToQueue = () => {
    if (selectedTracks.length === 0) return;
    if (onAddToQueue) {
      const added = onAddToQueue(selectedTracks);
      if (added === false) {
        showToast('Selected tracks already in queue');
      } else {
        showToast(`Added ${selectedTracks.length} tracks to queue`);
      }
    }
    setSelectedTrackIds(new Set());
  };

  const handleBulkToggleFavourites = () => {
    if (selectedTracks.length === 0) return;
    if (areAllSelectedFavourites) {
      if (onRemoveTracksFromFavourites) {
        onRemoveTracksFromFavourites(selectedTracks);
      } else {
        selectedTracks.forEach((t) => onToggleFavourite(t.id));
      }
      showToast(`Removed ${selectedTracks.length} favourites`);
    } else {
      if (onAddTracksToFavourites) {
        onAddTracksToFavourites(selectedTracks);
      } else {
        selectedTracks.forEach((t) => {
          if (!isFavouriteTrack(t, favourites, libraryTracks || tracks)) {
            onToggleFavourite(t.id);
          }
        });
      }
      showToast(`Added ${selectedTracks.length} favourites`);
    }
    setSelectedTrackIds(new Set());
  };

  const handleBulkRemoveFromPlaylist = () => {
    if (selectedTrackIds.size === 0) return;
    if (onRemoveTracksFromPlaylist) {
      onRemoveTracksFromPlaylist(Array.from(selectedTrackIds));
      showToast(`Removed ${selectedTrackIds.size} tracks from playlist`);
    }
    setSelectedTrackIds(new Set());
  };

  const handleBulkRemoveFromImportedFiles = () => {
    if (selectedTrackIds.size === 0) return;
    if (onRemoveImportedFiles) {
      onRemoveImportedFiles(Array.from(selectedTrackIds));
      showToast(`Removed ${selectedTrackIds.size} files from library`);
    }
    setSelectedTrackIds(new Set());
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
  const showCheckboxes = isSelectMode || selectedTrackIds.size > 0;

  return (
    <div className="w-full relative">
      {/* Feedback Toast */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900 text-xs font-medium shadow-xl backdrop-blur-md animate-fade-in pointer-events-none">
          {toastMessage}
        </div>
      )}

      {/* Select Mode Toolbar Controls */}
      <div className="flex items-center justify-between pb-2 px-1">
        <div className="text-[11px] text-slate-400 dark:text-slate-500">
          {selectedTrackIds.size > 0
            ? `${selectedTrackIds.size} of ${tracks.length} selected`
            : `${tracks.length} tracks`}
        </div>
        <button
          type="button"
          onClick={() => {
            if (isSelectMode) {
              setIsSelectMode(false);
              setSelectedTrackIds(new Set());
              setLastSelectedTrackId(null);
            } else {
              setIsSelectMode(true);
            }
          }}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
            isSelectMode
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
          }`}
          data-testid="toggle-select-mode"
        >
          {isSelectMode ? 'Done' : 'Select'}
        </button>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[48px_minmax(200px,2fr)_minmax(120px,1.5fr)_72px_88px] gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-300/80 dark:border-white/[0.06] select-none">
        <div className="text-center flex items-center justify-center">
          {showCheckboxes ? (
            <button
              type="button"
              onClick={toggleSelectAll}
              aria-label="Select all"
              className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
            >
              {selectedTrackIds.size === tracks.length && tracks.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
          ) : (
            '#'
          )}
        </div>
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
          const isSelected = selectedTrackIds.has(track.id);
          const isFav = isFavouriteTrack(track, favourites, libraryTracks || tracks);
          const extension = track.name.split('.').pop()?.toUpperCase() || '';
          const status = getTrackStatus(track);
          const isAbnormal = status !== 'normal';
          const isMenuOpen = activeMenuTrackId === track.id;

          return (
            <div
              key={`${track.id}-${idx}`}
              onClick={(e) => handleRowClick(e, track, idx)}
              onDoubleClick={() => onPlayTrack(track)}
              onTouchStart={() => handleTouchStart(track)}
              onTouchEnd={handleTouchEnd}
              onTouchMove={handleTouchEnd}
              data-testid={`track-row-${track.id}`}
              className={`group grid grid-cols-[48px_minmax(200px,2fr)_minmax(120px,1.5fr)_72px_88px] gap-3 px-4 py-2.5 items-center rounded-xl transition-all cursor-pointer select-none text-xs relative ${
                isSelected
                  ? 'bg-indigo-600/20 dark:bg-indigo-600/25 border border-indigo-500/40 shadow-sm'
                  : isCurrent
                  ? 'bg-indigo-600/15 border border-indigo-500/25 shadow-sm'
                  : 'hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
              } ${isAbnormal ? 'opacity-85' : ''}`}
            >
              {/* Col 1: Number, Checkbox, Equalizer, or Play Button */}
              <div className="flex items-center justify-center">
                {showCheckboxes ? (
                  <button
                    type="button"
                    onClick={(e) => handleCheckboxClick(e, track)}
                    className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                    data-testid={`track-checkbox-${track.id}`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                ) : isCurrent && isPlaying ? (
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

              {/* Col 2: Thumbnail Artwork + Title + Artist + Badges */}
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

              {/* Col 5: Reorder controls + Heart Favourite + ... Context Menu */}
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

                      {isImportedFilesView && onRemoveImportedFiles && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuTrackId(null);
                            onRemoveImportedFiles([track.id]);
                            showToast('Removed file from library');
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove from Library</span>
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

      {/* Bulk Action Toolbar */}
      {selectedTrackIds.size > 0 && (
        <div
          data-testid="bulk-action-toolbar"
          className="sticky bottom-6 z-40 mt-4 mx-auto max-w-xl px-4 py-2.5 rounded-2xl bg-slate-900/95 dark:bg-[#0c192c]/95 text-white shadow-2xl backdrop-blur-md border border-slate-700 dark:border-white/10 flex items-center justify-between gap-2 animate-fade-in"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 shrink-0">
              {selectedTrackIds.size} selected
            </span>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar py-0.5">
            {/* Play Next */}
            <button
              type="button"
              onClick={handleBulkPlayNext}
              data-testid="bulk-play-next"
              className="px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title="Play Next"
            >
              <ListPlus className="w-3.5 h-3.5 text-indigo-400" />
              <span>Play Next</span>
            </button>

            {/* Add to Queue */}
            <button
              type="button"
              onClick={handleBulkAddToQueue}
              data-testid="bulk-add-queue"
              className="px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title="Add to Queue"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Add to Queue</span>
            </button>

            {/* Add to Playlist */}
            <button
              type="button"
              onClick={() => setBulkPlaylistModalOpen(true)}
              data-testid="bulk-add-playlist"
              className="px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title="Add to Playlist"
            >
              <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
              <span>Playlist</span>
            </button>

            {/* Favourites */}
            <button
              type="button"
              onClick={handleBulkToggleFavourites}
              data-testid="bulk-toggle-favourites"
              className="px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title={areAllSelectedFavourites ? 'Remove from Favourites' : 'Add to Favourites'}
            >
              <Heart
                className={`w-3.5 h-3.5 ${
                  areAllSelectedFavourites ? 'text-rose-400 fill-rose-400' : 'text-rose-400'
                }`}
              />
              <span>{areAllSelectedFavourites ? 'Unfavourite' : 'Favourite'}</span>
            </button>

            {/* Context-Specific Removal: Only playlist view or imported files view */}
            {isPlaylistView && onRemoveTracksFromPlaylist && (
              <button
                type="button"
                onClick={handleBulkRemoveFromPlaylist}
                data-testid="bulk-remove-playlist"
                className="px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                title="Remove from Playlist"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            )}

            {isImportedFilesView && onRemoveImportedFiles && (
              <button
                type="button"
                onClick={handleBulkRemoveFromImportedFiles}
                data-testid="bulk-remove-imported"
                className="px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                title="Remove from Imported Files"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            )}

            <div className="w-px h-4 bg-white/20 mx-1 shrink-0" />

            {/* Clear Selection */}
            <button
              type="button"
              onClick={() => {
                setSelectedTrackIds(new Set());
                setLastSelectedTrackId(null);
              }}
              data-testid="bulk-clear-selection"
              className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Clear selection (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add Single Track to Playlist Modal */}
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

      {/* Bulk Add Tracks to Playlist Modal */}
      <PlaylistModal
        isOpen={bulkPlaylistModalOpen}
        mode="addToPlaylist"
        playlists={playlists}
        targetTracks={selectedTracks}
        onClose={() => setBulkPlaylistModalOpen(false)}
        onSelectPlaylist={(plId) => {
          if (selectedTracks.length > 0 && onAddTracksToPlaylist) {
            const { addedCount } = onAddTracksToPlaylist(plId, selectedTracks);
            const pl = playlists.find((p) => p.id === plId);
            if (addedCount > 0) {
              showToast(`Added ${addedCount} tracks to "${pl?.name || 'Playlist'}"`);
            } else {
              showToast('Selected tracks already in playlist');
            }
          } else if (selectedTracks.length > 0 && onAddToPlaylist) {
            for (const t of selectedTracks) {
              onAddToPlaylist(plId, t);
            }
            const pl = playlists.find((p) => p.id === plId);
            showToast(`Added tracks to "${pl?.name || 'Playlist'}"`);
          }
          setBulkPlaylistModalOpen(false);
          setSelectedTrackIds(new Set());
        }}
        onCreateAndAdd={(newName) => {
          if (selectedTracks.length > 0 && onCreateAndAddToPlaylist) {
            onCreateAndAddToPlaylist(newName, selectedTracks);
            showToast(`Created & added ${selectedTracks.length} tracks to "${newName}"`);
          }
          setBulkPlaylistModalOpen(false);
          setSelectedTrackIds(new Set());
        }}
      />
    </div>
  );
};
