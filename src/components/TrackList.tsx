import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TrackItem, Playlist } from '../types/music';
import { isFavouriteTrack } from '../utils/favouriteResolvers';
import { useTrackSelection } from '../hooks/useTrackSelection';
import { TrackRow } from './TrackRow';
import { TrackListHeader } from './TrackListHeader';
import { TrackListEmptyState } from './TrackListEmptyState';
import { BulkActionToolbar } from './BulkActionToolbar';
import { TrackPlaylistModals } from './TrackPlaylistModals';
import { PlayAllButton, SelectModeButton } from './TrackListActions';
import { isTrackPlayable } from '../utils/audioFileTypes';

export interface TrackListLayoutSlots {
  actions: React.ReactNode;
  content: React.ReactNode;
}

export interface TrackListProps {
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
  onPlayAll?: () => void;
  hideTrackCount?: boolean;
  beforeTable?: React.ReactNode;
  renderLayout?: (slots: TrackListLayoutSlots) => React.ReactNode;
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
  onPlayAll,
  hideTrackCount = false,
  beforeTable,
  renderLayout,
  emptyVariant = 'default',
  emptyMessage,
  isPlaylistView = false,
  isImportedFilesView = false,
}) => {
  const [activeMenuTrackId, setActiveMenuTrackId] = useState<string | null>(null);
  const [playlistModalTrack, setPlaylistModalTrack] = useState<TrackItem | null>(null);
  const [bulkPlaylistModalOpen, setBulkPlaylistModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const {
    selectedTrackIds, selectedTracks, isSelectMode, setIsSelectMode,
    handleRowClick, handleCheckboxClick, toggleSelectAll, clearSelection,
    handleTouchStart, handleTouchMove, handleTouchEnd, isTouchActionSuppressed,
  } = useTrackSelection({ tracks });

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

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  }, []);

  const areAllSelectedFavourites = useMemo(() => {
    if (selectedTracks.length === 0) return false;
    return selectedTracks.every((t) => isFavouriteTrack(t, favourites, libraryTracks || tracks));
  }, [selectedTracks, favourites, libraryTracks, tracks]);

  const handleToggleSelectMode = useCallback(() => {
    if (isSelectMode) {
      setIsSelectMode(false);
      clearSelection();
    } else {
      setIsSelectMode(true);
    }
  }, [isSelectMode, setIsSelectMode, clearSelection]);

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
    clearSelection();
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
    clearSelection();
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
    clearSelection();
  };

  const handleBulkRemoveFromPlaylist = () => {
    if (selectedTrackIds.size === 0) return;
    if (onRemoveTracksFromPlaylist) {
      onRemoveTracksFromPlaylist(Array.from(selectedTrackIds));
      showToast(`Removed ${selectedTrackIds.size} tracks from playlist`);
    }
    clearSelection();
  };

  const handleBulkRemoveFromImportedFiles = () => {
    if (selectedTrackIds.size === 0) return;
    if (onRemoveImportedFiles) {
      onRemoveImportedFiles(Array.from(selectedTrackIds));
      showToast(`Removed ${selectedTrackIds.size} files from library`);
    }
    clearSelection();
  };

  const actions = renderLayout ? (
    <>
      {onPlayAll && <PlayAllButton onClick={onPlayAll} disabled={!tracks.some(isTrackPlayable)} />}
      <SelectModeButton
        active={isSelectMode}
        onClick={handleToggleSelectMode}
        disabled={tracks.length === 0 && !isSelectMode}
      />
    </>
  ) : null;

  if (tracks.length === 0) {
    const content = <TrackListEmptyState emptyVariant={emptyVariant} emptyMessage={emptyMessage} />;
    return renderLayout ? renderLayout({ actions, content }) : content;
  }

  const isPlaylistMode = Boolean(onRemoveFromPlaylist || onMoveTrackUp);
  const showCheckboxes = isSelectMode || selectedTrackIds.size > 0;

  const content = (
    <div className="w-full relative">
      {/* Feedback Toast */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900 text-xs font-medium shadow-xl backdrop-blur-md animate-fade-in pointer-events-none">
          {toastMessage}
        </div>
      )}

      {/* Header and Select Mode Controls */}
      <TrackListHeader
        tracksCount={tracks.length}
        selectedCount={selectedTrackIds.size}
        isSelectMode={isSelectMode}
        showCheckboxes={showCheckboxes}
        hideTrackCount={hideTrackCount}
        showToolbar={!renderLayout}
        beforeTable={beforeTable}
        onToggleSelectMode={handleToggleSelectMode}
        onToggleSelectAll={toggleSelectAll}
        onPlayAll={onPlayAll}
        isPlayAllDisabled={!tracks.some(isTrackPlayable)}
      />

      {/* Track Rows */}
      <div className="divide-y divide-slate-200/60 dark:divide-white/[0.02]">
        {tracks.map((track, idx) => (
          <TrackRow
            key={`${track.id}-${idx}`}
            track={track}
            index={idx}
            isCurrent={currentTrackId === track.id}
            isPlaying={isPlaying}
            isSelected={selectedTrackIds.has(track.id)}
            showCheckboxes={showCheckboxes}
            favourites={favourites}
            libraryTracks={libraryTracks}
            allTracks={tracks}
            isPlaylistMode={isPlaylistMode}
            isPlaylistView={isPlaylistView}
            isImportedFilesView={isImportedFilesView}
            activeMenuTrackId={activeMenuTrackId}
            onToggleMenu={(id) => setActiveMenuTrackId((prev) => (prev === id ? null : id))}
            onRowClick={handleRowClick}
            onCheckboxClick={handleCheckboxClick}
            onPlayTrack={onPlayTrack}
            onTogglePlay={onTogglePlay}
            onToggleFavourite={onToggleFavourite}
            onPlayNext={onPlayNext}
            onAddToQueue={onAddToQueue}
            onOpenPlaylistModal={(t) => setPlaylistModalTrack(t)}
            onRemoveFromPlaylist={onRemoveFromPlaylist}
            onRemoveImportedFiles={onRemoveImportedFiles}
            onMoveTrackUp={onMoveTrackUp}
            onMoveTrackDown={onMoveTrackDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            isTouchActionSuppressed={isTouchActionSuppressed}
            showToast={showToast}
          />
        ))}
      </div>

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={selectedTrackIds.size}
        areAllSelectedFavourites={areAllSelectedFavourites}
        isPlaylistView={isPlaylistView}
        isImportedFilesView={isImportedFilesView}
        hasRemoveFromPlaylist={Boolean(onRemoveTracksFromPlaylist)}
        hasRemoveImportedFiles={Boolean(onRemoveImportedFiles)}
        onBulkPlayNext={handleBulkPlayNext}
        onBulkAddToQueue={handleBulkAddToQueue}
        onOpenBulkPlaylistModal={() => setBulkPlaylistModalOpen(true)}
        onBulkToggleFavourites={handleBulkToggleFavourites}
        onBulkRemoveFromPlaylist={handleBulkRemoveFromPlaylist}
        onBulkRemoveFromImportedFiles={handleBulkRemoveFromImportedFiles}
        onClearSelection={clearSelection}
      />

      {/* Playlist Modals */}
      <TrackPlaylistModals
        playlists={playlists}
        playlistModalTrack={playlistModalTrack}
        bulkPlaylistModalOpen={bulkPlaylistModalOpen}
        selectedTracks={selectedTracks}
        onCloseSingleModal={() => setPlaylistModalTrack(null)}
        onCloseBulkModal={() => setBulkPlaylistModalOpen(false)}
        onAddToPlaylist={onAddToPlaylist}
        onAddTracksToPlaylist={onAddTracksToPlaylist}
        onCreateAndAddToPlaylist={onCreateAndAddToPlaylist}
        onClearSelection={clearSelection}
        showToast={showToast}
      />
    </div>
  );
  return renderLayout ? renderLayout({ actions, content }) : content;
};
