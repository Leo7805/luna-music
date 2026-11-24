import React, { useMemo, useState } from 'react';
import {
  ListMusic,
  Play,
  Plus,
  Trash2,
  Edit2,
  Clock,
  Music2,
  Search,
} from 'lucide-react';
import { Playlist, TrackItem } from '../types/music';
import { resolvePlaylistTracks } from '../utils/musicTree';
import { isTrackPlayable } from '../utils/audioFileTypes';
import {
  filterIndexedTracksByQuery,
  filterPlaylistsByQuery,
  normalizeSearchQuery,
} from '../utils/librarySearch';
import { formatDuration } from '../utils/formatters';
import { TrackList, TrackListProps } from './TrackList';
import { TrackListEmptyState } from './TrackListEmptyState';
import { PlayAllButton, SelectModeButton } from './TrackListActions';
import { ConfirmModal } from './ConfirmModal';
import { PlaylistModal } from './PlaylistModal';

interface PlaylistsViewProps {
  playlists: Playlist[];
  selectedPlaylistId: string | null;
  libraryTracks: TrackItem[];
  searchQuery?: string;
  currentTrackId?: string | null;
  isPlaying: boolean;
  favourites: Set<string>;
  renderLayout?: TrackListProps['renderLayout'];
  onSelectPlaylist: (id: string | null) => void;
  onCreatePlaylist: (name: string, initialTracks?: TrackItem[]) => Playlist;
  onRenamePlaylist: (id: string, newName: string) => void;
  onDeletePlaylist: (id: string) => void;
  onPlayPlaylist: (playlist: Playlist, startIndex?: number, shuffle?: boolean) => void;
  onPlayQueue?: (tracks: TrackItem[], startIndex?: number, shuffle?: boolean) => void;
  onPlayTrack: (track: TrackItem) => void;
  onTogglePlay: () => void;
  onToggleFavourite: (trackId: string) => void;
  onPlayNext?: (track: TrackItem) => 'added' | 'moved' | void;
  onPlayNextBulk?: (tracks: TrackItem[]) => { movedCount: number; addedCount: number } | void;
  onAddToQueue?: (trackOrTracks: TrackItem | TrackItem[]) => boolean | void;
  onAddToPlaylist?: (playlistId: string, track: TrackItem) => boolean;
  onAddTracksToPlaylist?: (playlistId: string, tracks: TrackItem[]) => { addedCount: number };
  onCreateAndAddToPlaylist?: (playlistName: string, trackOrTracks: TrackItem | TrackItem[]) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackId: string, index?: number) => void;
  onRemoveTracksFromPlaylist?: (playlistId: string, trackIds: string[]) => void;
  onAddTracksToFavourites?: (tracks: TrackItem[]) => void;
  onRemoveTracksFromFavourites?: (tracks: TrackItem[]) => void;
  onReorderPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number) => void;
}

export const PlaylistsView: React.FC<PlaylistsViewProps> = ({
  playlists,
  selectedPlaylistId,
  libraryTracks,
  searchQuery = '',
  currentTrackId,
  isPlaying,
  favourites,
  renderLayout,
  onSelectPlaylist,
  onCreatePlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onPlayPlaylist,
  onPlayQueue,
  onPlayTrack,
  onTogglePlay,
  onToggleFavourite,
  onPlayNext,
  onPlayNextBulk,
  onAddToQueue,
  onAddToPlaylist,
  onAddTracksToPlaylist,
  onCreateAndAddToPlaylist,
  onRemoveTrackFromPlaylist,
  onRemoveTracksFromPlaylist,
  onAddTracksToFavourites,
  onRemoveTracksFromFavourites,
  onReorderPlaylistTracks,
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [playlistToRename, setPlaylistToRename] = useState<Playlist | null>(null);
  const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null);

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId) || null;
  const normalizedQuery = normalizeSearchQuery(searchQuery);
  const hasQuery = normalizedQuery.length > 0;

  // Resolved tracks for selected playlist (includes unreadable placeholders for offline files)
  const resolvedTracks = useMemo(
    () => (selectedPlaylist ? resolvePlaylistTracks(selectedPlaylist.tracks, libraryTracks) : []),
    [selectedPlaylist, libraryTracks]
  );

  const filteredEntries = useMemo(
    () => filterIndexedTracksByQuery(resolvedTracks, normalizedQuery),
    [resolvedTracks, normalizedQuery]
  );

  const visibleTracks = useMemo(
    () => filteredEntries.map((entry) => entry.track),
    [filteredEntries]
  );

  const visiblePlaylists = useMemo(
    () => filterPlaylistsByQuery(playlists, normalizedQuery, libraryTracks),
    [playlists, normalizedQuery, libraryTracks]
  );

  const totalDuration = resolvedTracks.reduce(
    (acc, t) => acc + (t.metadata.duration || 0),
    0
  );

  const renderMainContent = (): React.ReactNode => {
    if (selectedPlaylist) {
      const playlistManagementButtons = (
        <>
          <button
            type="button"
            onClick={() => setPlaylistToRename(selectedPlaylist)}
            aria-label="Rename Playlist"
            title="Rename Playlist"
            data-testid="playlist-rename-button"
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl glass-button text-[var(--text-secondary)] dark:text-slate-200 hover:text-[var(--text-primary)] dark:hover:text-white transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setPlaylistToDelete(selectedPlaylist)}
            aria-label="Delete Playlist"
            title="Delete Playlist"
            data-testid="playlist-delete-button"
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl glass-button text-[var(--text-secondary)] dark:text-slate-200 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      );

      const heroPanel = (
        <div
          data-testid="playlist-hero"
          className="p-5 mb-5 rounded-2xl glass-panel flex flex-col sm:flex-row items-center sm:items-end gap-5 relative overflow-hidden"
        >
          <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-xl flex items-center justify-center shrink-0 border border-white/20">
            <ListMusic className="w-12 h-12 text-white/90" />
          </div>

          <div className="flex-1 min-w-0 text-center sm:text-left space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)] dark:text-indigo-400">
              User Playlist
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] dark:text-white tracking-tight truncate">
              {selectedPlaylist.name}
            </h2>

            <div className="flex items-center justify-center sm:justify-start gap-2.5 text-xs text-[var(--text-secondary)] dark:text-slate-400 font-medium">
              <span>
                {resolvedTracks.length} {resolvedTracks.length === 1 ? 'track' : 'tracks'}
              </span>
              {totalDuration > 0 && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(totalDuration)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      );

      const handlePlayAll = () => {
        if (!hasQuery) {
          onPlayPlaylist(selectedPlaylist, 0);
          return;
        }
        const playable = visibleTracks.filter(isTrackPlayable);
        if (playable.length === 0) return;
        if (onPlayQueue) {
          onPlayQueue(playable, 0);
        } else {
          onPlayTrack(playable[0]);
        }
      };

      if (resolvedTracks.length > 0 && visibleTracks.length > 0) {
        const trackList = (
          <TrackList
            key={selectedPlaylist.id}
            tracks={visibleTracks}
            libraryTracks={libraryTracks}
            currentTrackId={currentTrackId}
            isPlaying={isPlaying}
            favourites={favourites}
            playlists={playlists}
            hideTrackCount={Boolean(renderLayout)}
            beforeTable={heroPanel}
            onPlayAll={handlePlayAll}
            renderLayout={
              renderLayout
                ? ({ actions, content }) =>
                    renderLayout({
                      actions: (
                        <>
                          {actions}
                          {playlistManagementButtons}
                        </>
                      ),
                      content: (
                        <div className="animate-fade-in" data-testid="playlists-view-container">
                          {content}
                        </div>
                      ),
                    })
                : undefined
            }
            onPlayTrack={onPlayTrack}
            onTogglePlay={onTogglePlay}
            onToggleFavourite={onToggleFavourite}
            onPlayNext={onPlayNext}
            onPlayNextBulk={onPlayNextBulk}
            onAddToQueue={onAddToQueue}
            onAddToPlaylist={onAddToPlaylist}
            onAddTracksToPlaylist={onAddTracksToPlaylist}
            onCreateAndAddToPlaylist={onCreateAndAddToPlaylist}
            onRemoveFromPlaylist={(_, filteredIdx) => {
              const entry = filteredEntries[filteredIdx];
              if (entry) {
                onRemoveTrackFromPlaylist(selectedPlaylist.id, '', entry.originalIndex);
              }
            }}
            onRemoveTracksFromPlaylist={(trackIds) =>
              onRemoveTracksFromPlaylist?.(selectedPlaylist.id,
                selectedPlaylist.tracks.filter((_, index) => trackIds.includes(resolvedTracks[index].id))
                  .map(reference => reference.trackId))
            }
            onAddTracksToFavourites={onAddTracksToFavourites}
            onRemoveTracksFromFavourites={onRemoveTracksFromFavourites}
            onMoveTrackUp={
              hasQuery
                ? undefined
                : (idx) => onReorderPlaylistTracks(selectedPlaylist.id, idx, idx - 1)
            }
            onMoveTrackDown={
              hasQuery
                ? undefined
                : (idx) => onReorderPlaylistTracks(selectedPlaylist.id, idx, idx + 1)
            }
            isPlaylistView={true}
          />
        );
        return renderLayout ? trackList : (
          <div className="animate-fade-in" data-testid="playlists-view-container">
            {trackList}
          </div>
        );
      }

      const emptyDetailContent = (
        <div className="animate-fade-in" data-testid="playlists-view-container">
          {heroPanel}
          {resolvedTracks.length > 0 && hasQuery ? (
            <TrackListEmptyState emptyVariant="search" />
          ) : (
            <div className="py-16 text-center text-slate-400 dark:text-slate-500">
              <Music2 className="w-10 h-10 mx-auto mb-2 opacity-30 text-indigo-500" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                This playlist is empty
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Add songs to this playlist from All Tracks, Albums, or Folders using the track action menu.
              </p>
            </div>
          )}
        </div>
      );

      if (renderLayout) {
        return renderLayout({
          actions: (
            <>
              <PlayAllButton onClick={() => {}} disabled />
              <SelectModeButton active={false} onClick={() => {}} disabled />
              {playlistManagementButtons}
            </>
          ),
          content: emptyDetailContent,
        });
      }

      return emptyDetailContent;
    }

    // Playlists Overview
    const createHeaderButton = (
      <button
        type="button"
        onClick={() => setIsCreateModalOpen(true)}
        data-testid="create-playlist-header-button"
        className="h-8 shrink-0 px-3 rounded-xl text-xs font-medium glass-button flex items-center gap-1.5 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50"
      >
        <Plus className="w-3.5 h-3.5 text-[var(--accent-primary)] dark:text-indigo-400" />
        <span>Create Playlist</span>
      </button>
    );

    const overviewBody =
      playlists.length > 0 && hasQuery && visiblePlaylists.length === 0 ? (
        <div
          data-testid="playlists-search-empty"
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <Search className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            No playlists match &ldquo;{searchQuery.trim()}&rdquo;
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Try a different search term or clear the search.
          </p>
        </div>
      ) : visiblePlaylists.length > 0 ? (
        <div
          data-testid="playlists-overview-grid"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
        >
          {visiblePlaylists.map((pl) => (
            <div
              key={pl.id}
              data-testid={`playlist-card-${pl.id}`}
              onClick={() => onSelectPlaylist(pl.id)}
              className="group p-4 rounded-2xl glass-panel hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.08] hover:border-[var(--accent-primary)]/40 transition-colors duration-150 cursor-pointer flex flex-col justify-between select-none relative min-h-[180px]"
            >
              <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-indigo-500/80 to-purple-600/80 flex items-center justify-center shadow-md mb-3 group-hover:scale-[1.02] transition-transform relative overflow-hidden">
                <ListMusic className="w-10 h-10 text-white/90" />
                <button
                  type="button"
                  disabled={pl.tracks.length === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlayPlaylist(pl, 0);
                  }}
                  className="absolute right-2.5 bottom-2.5 w-9 h-9 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-105 active:scale-95 disabled:hidden cursor-pointer"
                  title="Play playlist"
                >
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                </button>
              </div>

              <div className="min-w-0">
                <h3 className="font-semibold text-xs text-[var(--text-primary)] dark:text-white truncate">
                  {pl.name}
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)] dark:text-slate-400 mt-0.5">
                  {pl.tracks.length} {pl.tracks.length === 1 ? 'track' : 'tracks'}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center select-none">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 flex items-center justify-center mb-4 mx-auto text-amber-600 dark:text-amber-400">
            <ListMusic className="w-8 h-8" />
          </div>
          <h3 className="text-base font-semibold text-[var(--text-primary)] dark:text-slate-100 mb-1.5">
            No playlists yet
          </h3>
          <p className="text-xs text-[var(--text-secondary)] dark:text-slate-400 max-w-sm mx-auto leading-relaxed mb-5">
            Create custom playlists to organize your favorite music into curated collections.
          </p>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold shadow-sm inline-flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Playlist</span>
          </button>
        </div>
      );

    if (renderLayout) {
      return renderLayout({
        actions: createHeaderButton,
        content: <div data-testid="playlists-view-container">{overviewBody}</div>,
      });
    }

    // Standalone fallback when rendered directly without unified layout
    return (
      <div className="space-y-6" data-testid="playlists-view-container">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Playlists</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'}
            </p>
          </div>

          {playlists.length > 0 && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-[var(--accent-primary)]/10 dark:bg-white/[0.08] hover:bg-[var(--accent-primary)]/15 dark:hover:bg-white/[0.12] text-[var(--accent-primary)] dark:text-slate-100 border border-[var(--accent-primary)]/25 dark:border-white/[0.12] text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50"
            >
              <Plus className="w-4 h-4" />
              <span>Create Playlist</span>
            </button>
          )}
        </div>
        {overviewBody}
      </div>
    );
  };

  return (
    <>
      {renderMainContent()}

      {/* Modals stay mounted outside renderLayout slots so Header/list updates never reset them */}
      <PlaylistModal
        isOpen={isCreateModalOpen}
        mode="create"
        onClose={() => setIsCreateModalOpen(false)}
        onSubmitName={(name) => {
          const pl = onCreatePlaylist(name);
          onSelectPlaylist(pl.id);
        }}
      />

      <PlaylistModal
        isOpen={Boolean(playlistToRename)}
        mode="rename"
        initialName={playlistToRename?.name || ''}
        onClose={() => setPlaylistToRename(null)}
        onSubmitName={(newName) => {
          if (playlistToRename) {
            onRenamePlaylist(playlistToRename.id, newName);
          }
          setPlaylistToRename(null);
        }}
      />

      <ConfirmModal
        isOpen={Boolean(playlistToDelete)}
        title="Delete Playlist"
        message={
          playlistToDelete
            ? `Are you sure you want to delete playlist "${playlistToDelete.name}"? Your physical audio files will not be deleted.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDanger={true}
        onConfirm={() => {
          if (playlistToDelete) {
            onDeletePlaylist(playlistToDelete.id);
          }
          setPlaylistToDelete(null);
        }}
        onCancel={() => setPlaylistToDelete(null)}
      />
    </>
  );
};
