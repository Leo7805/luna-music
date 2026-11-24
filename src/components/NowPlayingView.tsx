import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  X,
  ListMusic,
  Clock,
  Save,
  CheckSquare,
  Square,
  SlidersHorizontal,
} from 'lucide-react';
import { TrackItem, Playlist } from '../types/music';
import { isSameTrack } from '../utils/musicTree';
import { Theme, LightStyle } from '../hooks/useTheme';
import { useNowPlayingSelection } from '../hooks/useNowPlayingSelection';
import { AppearancePopover } from './AppearancePopover';
import { ConfirmModal } from './ConfirmModal';
import { PlaylistModal } from './PlaylistModal';
import { TrackPlaylistModals } from './TrackPlaylistModals';
import { TrackInfoModal } from './TrackInfoModal';
import { NowPlayingQueueRow } from './NowPlayingQueueRow';
import { NowPlayingContextMenu } from './NowPlayingContextMenu';
import { TRACK_ROW_GRID_CLASS } from './TrackRowLayout';
import { calculateQueueScrollOffset } from '../utils/queueScroll';
import { isFavouriteTrack } from '../utils/favouriteResolvers';

const EMPTY_FAVOURITES = new Set<string>();
const EMPTY_TRACKS: TrackItem[] = [];

export interface NowPlayingViewProps {
  queue: TrackItem[];
  currentTrack: TrackItem | null;
  isPlaying: boolean;
  playlists: Playlist[];
  favourites?: Set<string>;
  libraryTracks?: TrackItem[];
  theme: Theme;
  lightStyle: LightStyle;
  onPlayQueueTrack: (track: TrackItem) => void;
  onToggleFavourite?: (trackId: string) => void;
  onPlayNext?: (track: TrackItem) => void;
  onPlayNextBulk?: (tracks: TrackItem[]) => { movedCount: number; addedCount: number } | void;
  onRemoveFromQueue: (index: number) => void;
  onRemoveTracksFromQueue: (indices: number[]) => number;
  onSaveQueueAsPlaylist: (name: string) => void;
  onAddToPlaylist?: (playlistId: string, track: TrackItem) => boolean;
  onAddTracksToPlaylist?: (playlistId: string, tracks: TrackItem[]) => { addedCount: number };
  onCreateAndAddToPlaylist?: (playlistName: string, trackOrTracks: TrackItem | TrackItem[]) => void;
  onSelectTheme: (theme: Theme) => void;
  onSelectLightStyle: (style: LightStyle) => void;
  onOpenShortcutsModal: () => void;
}

export const NowPlayingView: React.FC<NowPlayingViewProps> = ({
  queue,
  currentTrack,
  isPlaying,
  playlists,
  favourites = EMPTY_FAVOURITES,
  libraryTracks = EMPTY_TRACKS,
  theme,
  lightStyle,
  onPlayQueueTrack,
  onToggleFavourite,
  onPlayNext,
  onPlayNextBulk,
  onRemoveFromQueue,
  onRemoveTracksFromQueue,
  onSaveQueueAsPlaylist,
  onAddToPlaylist,
  onAddTracksToPlaylist,
  onCreateAndAddToPlaylist,
  onSelectTheme,
  onSelectLightStyle,
  onOpenShortcutsModal,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [isBulkRemoveConfirmOpen, setIsBulkRemoveConfirmOpen] = useState<boolean>(false);
  const [playlistModalTrack, setPlaylistModalTrack] = useState<TrackItem | null>(null);
  const [isBulkPlaylistModalOpen, setIsBulkPlaylistModalOpen] = useState<boolean>(false);
  const [infoModalTrack, setInfoModalTrack] = useState<TrackItem | null>(null);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  const lastScrolledTrackIdRef = useRef<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage((prev) => (prev === msg ? null : prev)), 2500);
  }, []);

  // Filter queue entries without mutating underlying Queue; retain originalIndex
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return queue
      .map((track, originalIndex) => ({ track, originalIndex }))
      .filter(({ track }) => {
        if (!q) return true;
        return (
          track.name.toLowerCase().includes(q) ||
          (track.metadata.title || '').toLowerCase().includes(q) ||
          (track.metadata.artist || '').toLowerCase().includes(q) ||
          (track.metadata.album || '').toLowerCase().includes(q)
        );
      });
  }, [queue, searchQuery]);

  const selectableVisibleIndices = useMemo(
    () =>
      filteredEntries
        .filter(({ track }) => !(currentTrack && isSameTrack(track, currentTrack)))
        .map(({ originalIndex }) => originalIndex),
    [filteredEntries, currentTrack]
  );

  const {
    isSelectMode,
    selectedIndices,
    sortedSelectedIndices,
    selectedQueueTracks,
    contextMenu,
    setContextMenu,
    exitSelectionMode,
    toggleSelectIndex,
    toggleSelectAllVisible,
    handleToggleSelectMode,
    handleCloseMenu,
    handleOpenRowMenu,
  } = useNowPlayingSelection({ queue, currentTrack, selectableVisibleIndices });

  // Auto-scroll to currently playing track when entering Now Playing or changing track
  useEffect(() => {
    if (!currentTrack || searchQuery.trim()) return;
    if (lastScrolledTrackIdRef.current === currentTrack.id) return;

    const frameId = requestAnimationFrame(() => {
      const container = listContainerRef.current;
      const activeRow = activeRowRef.current;
      if (!container || !activeRow) return;

      const calc = calculateQueueScrollOffset(
        container.scrollTop,
        container.clientHeight,
        activeRow.offsetTop,
        activeRow.offsetHeight
      );
      if (calc.shouldScroll) {
        const prefersReducedMotion =
          typeof window !== 'undefined' &&
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        container.scrollTo({
          top: calc.targetScrollTop,
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
        });
      }
      lastScrolledTrackIdRef.current = currentTrack.id;
    });

    return () => cancelAnimationFrame(frameId);
  }, [currentTrack, queue, searchQuery]);

  const handleBulkPlayNext = useCallback(() => {
    if (selectedQueueTracks.length === 0) return;
    if (onPlayNextBulk) {
      onPlayNextBulk(selectedQueueTracks);
    } else if (onPlayNext) {
      for (let i = selectedQueueTracks.length - 1; i >= 0; i--) {
        onPlayNext(selectedQueueTracks[i]);
      }
    }
    exitSelectionMode();
    showToast(
      `${selectedQueueTracks.length} ${selectedQueueTracks.length === 1 ? 'track' : 'tracks'} moved to play next`
    );
  }, [selectedQueueTracks, onPlayNextBulk, onPlayNext, exitSelectionMode, showToast]);

  const handleConfirmBulkRemove = () => {
    const removed = onRemoveTracksFromQueue(sortedSelectedIndices);
    exitSelectionMode();
    setIsBulkRemoveConfirmOpen(false);
    if (removed > 0) {
      showToast(`Removed ${removed} ${removed === 1 ? 'track' : 'tracks'} from Queue`);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0" data-testid="now-playing-view">
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900 text-xs font-medium shadow-xl backdrop-blur-md pointer-events-none">
          {toastMessage}
        </div>
      )}

      {/* Now Playing Header */}
      <header className="relative z-30 px-6 py-4 flex flex-col gap-3 border-b border-[var(--border-subtle)] dark:border-white/[0.08] bg-[var(--bg-main)]/80 dark:bg-[#071427]/60 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] dark:text-white truncate">
                Now Playing
              </h1>
              <span
                data-testid="now-playing-subtitle"
                className="text-xs text-[var(--text-secondary)] dark:text-slate-400 font-medium shrink-0"
              >
                Queue · {queue.length} {queue.length === 1 ? 'track' : 'tracks'}
              </span>
            </div>
          </div>

          {/* Controls: Search in Queue, Save as Playlist, Select, Settings */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-52 sm:w-60">
              <Search className="w-3.5 h-3.5 text-[var(--text-secondary)] dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search in queue..."
                data-testid="queue-search-input"
                className="w-full pl-8 pr-7 py-1.5 rounded-xl text-xs glass-input placeholder-[var(--text-secondary)] dark:placeholder-slate-500 text-[var(--text-primary)] dark:text-slate-100"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear queue search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsSaveModalOpen(true)}
              disabled={queue.length === 0}
              data-testid="save-queue-playlist-button"
              className="px-3 py-1.5 rounded-xl text-xs font-medium glass-button flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-[var(--accent-primary)] dark:text-indigo-400" />
              <span>Save as Playlist</span>
            </button>

            <button
              type="button"
              onClick={handleToggleSelectMode}
              disabled={queue.length === 0}
              data-testid="queue-select-mode-button"
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer disabled:opacity-40 ${
                isSelectMode
                  ? 'bg-[var(--accent-primary)] text-white border-transparent'
                  : 'glass-button'
              }`}
            >
              {isSelectMode ? 'Done' : 'Select'}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsAppearanceOpen((prev) => !prev)}
                className="p-2 rounded-xl glass-button text-[var(--text-secondary)] dark:text-slate-200 hover:text-[var(--text-primary)] dark:hover:text-white cursor-pointer"
                aria-label="Appearance & Settings"
                title="Appearance & Settings"
                data-testid="appearance-menu-button"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              <AppearancePopover
                isOpen={isAppearanceOpen}
                onClose={() => setIsAppearanceOpen(false)}
                theme={theme}
                lightStyle={lightStyle}
                onSelectTheme={onSelectTheme}
                onSelectLightStyle={onSelectLightStyle}
                onOpenShortcutsModal={onOpenShortcutsModal}
              />
            </div>
          </div>
        </div>

        {/* Simplified Selection Status Row (actions live in shared context menu) */}
        {isSelectMode && (
          <div
            data-testid="queue-bulk-bar"
            className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]/70 dark:border-white/[0.06] text-xs"
          >
            <span
              data-testid="queue-selection-count"
              className="text-[var(--text-secondary)] dark:text-slate-400 font-medium"
            >
              {sortedSelectedIndices.length} selected
            </span>
          </div>
        )}
      </header>

      {/* Queue Table Container */}
      <div
        ref={listContainerRef}
        onScroll={() => {
          if (contextMenu) setContextMenu(null);
        }}
        className="flex-1 overflow-y-auto px-6 pt-3 pb-6 custom-scrollbar"
        data-testid="now-playing-queue-list"
      >
        {queue.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center text-xs text-[var(--text-secondary)] dark:text-slate-500">
            <ListMusic className="w-12 h-12 mb-3 opacity-35 text-[var(--accent-primary)] dark:text-indigo-400" />
            <p className="text-sm font-medium text-[var(--text-primary)] dark:text-slate-300">
              Queue is empty
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Play any track or playlist to populate the playback queue.
            </p>
          </div>
        ) : (
          <>
            {/* Table Headings */}
            <div className={`${TRACK_ROW_GRID_CLASS} text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] dark:text-slate-400 border-b border-[var(--border-subtle)] dark:border-white/[0.06] select-none`}>
              <div className="flex items-center justify-center">
                {isSelectMode ? (
                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    aria-label="Select all removable queue tracks"
                    className="p-1 rounded text-slate-400 hover:text-[var(--track-selected-accent)] cursor-pointer"
                  >
                    {selectableVisibleIndices.length > 0 &&
                    selectableVisibleIndices.every((idx) => selectedIndices.has(idx)) ? (
                      <CheckSquare className="w-4 h-4 text-[var(--track-selected-accent)]" />
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
              <div className="text-right flex items-center justify-end">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div />
            </div>

            {filteredEntries.length === 0 ? (
              <div className="py-16 text-center text-xs text-[var(--text-secondary)] dark:text-slate-400">
                No tracks in the queue match &quot;{searchQuery}&quot;.
              </div>
            ) : (
              <div className="divide-y divide-slate-200/50 dark:divide-white/[0.03] mt-1">
                {filteredEntries.map(({ track, originalIndex }) => {
                  const isCurrent = currentTrack ? isSameTrack(track, currentTrack) : false;
                  const isFavourite = isFavouriteTrack(track, favourites, libraryTracks);
                  return (
                    <NowPlayingQueueRow
                      key={`${track.id}-${originalIndex}`}
                      track={track}
                      originalIndex={originalIndex}
                      isCurrent={isCurrent}
                      isPlaying={isPlaying}
                      isFavourite={isFavourite}
                      isSelectMode={isSelectMode}
                      isSelected={selectedIndices.has(originalIndex)}
                      isMenuOpen={contextMenu?.targetIndex === originalIndex}
                      rowRef={isCurrent ? activeRowRef : undefined}
                      onPlayQueueTrack={onPlayQueueTrack}
                      onToggleFavourite={onToggleFavourite}
                      onToggleSelect={toggleSelectIndex}
                      onOpenMenu={handleOpenRowMenu}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Shared Context Menu for Single-Track and Multi-Track Queue Actions */}
      <NowPlayingContextMenu
        menu={contextMenu}
        selectedCount={sortedSelectedIndices.length}
        onClose={handleCloseMenu}
        onPlayQueueTrack={onPlayQueueTrack}
        onPlayNext={
          onPlayNext
            ? (t) => {
                onPlayNext(t);
                showToast('Moved to play next');
              }
            : undefined
        }
        onBulkPlayNext={onPlayNextBulk || onPlayNext ? handleBulkPlayNext : undefined}
        onAddToPlaylist={(t) => setPlaylistModalTrack(t)}
        onBulkAddToPlaylist={() => setIsBulkPlaylistModalOpen(true)}
        onOpenTrackInfo={(t) => setInfoModalTrack(t)}
        onRemoveFromQueue={(idx) => {
          onRemoveFromQueue(idx);
          showToast('Removed from Queue');
        }}
        onRequestBulkRemove={() => setIsBulkRemoveConfirmOpen(true)}
      />

      {/* Save Queue as Playlist Modal */}
      <PlaylistModal
        isOpen={isSaveModalOpen}
        mode="create"
        initialName={`Queue - ${new Date().toLocaleDateString()}`}
        onClose={() => setIsSaveModalOpen(false)}
        onSubmitName={(name) => {
          onSaveQueueAsPlaylist(name);
          setIsSaveModalOpen(false);
          showToast(`Saved playlist "${name}"`);
        }}
      />

      {/* Bulk Remove Confirmation Modal */}
      <ConfirmModal
        isOpen={isBulkRemoveConfirmOpen}
        title="Remove Selected from Queue"
        message={`Remove ${sortedSelectedIndices.length} selected ${sortedSelectedIndices.length === 1 ? 'track' : 'tracks'} from the playback queue? Your library, playlists, and favourites will not be affected.`}
        confirmLabel="Remove from Queue"
        cancelLabel="Cancel"
        isDanger={true}
        onConfirm={handleConfirmBulkRemove}
        onCancel={() => setIsBulkRemoveConfirmOpen(false)}
      />

      {/* Single & Bulk Add to Playlist Modals */}
      <TrackPlaylistModals
        playlists={playlists}
        playlistModalTrack={playlistModalTrack}
        bulkPlaylistModalOpen={isBulkPlaylistModalOpen}
        selectedTracks={selectedQueueTracks}
        onCloseSingleModal={() => setPlaylistModalTrack(null)}
        onCloseBulkModal={() => setIsBulkPlaylistModalOpen(false)}
        onAddToPlaylist={onAddToPlaylist}
        onAddTracksToPlaylist={onAddTracksToPlaylist}
        onCreateAndAddToPlaylist={onCreateAndAddToPlaylist}
        onClearSelection={exitSelectionMode}
        showToast={showToast}
      />

      {/* Track Info Modal */}
      <TrackInfoModal track={infoModalTrack} onClose={() => setInfoModalTrack(null)} />
    </div>
  );
};
