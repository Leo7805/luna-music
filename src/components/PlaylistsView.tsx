import React, { useState } from 'react';
import {
  ListMusic,
  Play,
  Shuffle,
  Plus,
  Trash2,
  Edit2,
  Clock,
  ListPlus,
  Music2,
  ArrowLeft,
} from 'lucide-react';
import { Playlist, TrackItem } from '../types/music';
import { resolvePlaylistTracks } from '../utils/musicTree';
import { formatDuration } from '../utils/formatters';
import { TrackList } from './TrackList';
import { ConfirmModal } from './ConfirmModal';
import { PlaylistModal } from './PlaylistModal';

interface PlaylistsViewProps {
  playlists: Playlist[];
  selectedPlaylistId: string | null;
  libraryTracks: TrackItem[];
  currentTrackId?: string | null;
  isPlaying: boolean;
  favourites: Set<string>;
  onSelectPlaylist: (id: string | null) => void;
  onCreatePlaylist: (name: string, initialTracks?: TrackItem[]) => Playlist;
  onRenamePlaylist: (id: string, newName: string) => void;
  onDeletePlaylist: (id: string) => void;
  onPlayPlaylist: (playlist: Playlist, startIndex?: number, shuffle?: boolean) => void;
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
  currentTrackId,
  isPlaying,
  favourites,
  onSelectPlaylist,
  onCreatePlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onPlayPlaylist,
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

  // Resolved tracks for selected playlist (includes unreadable placeholders for offline files)
  const resolvedTracks = selectedPlaylist
    ? resolvePlaylistTracks(selectedPlaylist.tracks, libraryTracks)
    : [];

  const totalDuration = resolvedTracks.reduce(
    (acc, t) => acc + (t.metadata.duration || 0),
    0
  );

  return (
    <div className="space-y-6" data-testid="playlists-view-container">
      {selectedPlaylist ? (
        /* Detailed Playlist View */
        <div className="space-y-6 animate-fade-in">
          {/* Back button & Header Banner */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSelectPlaylist(null)}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Back to all playlists"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              All Playlists / {selectedPlaylist.name}
            </span>
          </div>

          <div className="p-6 rounded-2xl glass-panel flex flex-col sm:flex-row items-center sm:items-end gap-6 relative overflow-hidden">
            {/* Playlist Artwork Box */}
            <div className="w-36 h-36 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-2xl flex items-center justify-center shrink-0 border border-white/20">
              <ListMusic className="w-16 h-16 text-white/90" />
            </div>

            {/* Playlist Meta Details */}
            <div className="flex-1 min-w-0 text-center sm:text-left space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)] dark:text-indigo-400">
                User Playlist
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] dark:text-white tracking-tight truncate">
                {selectedPlaylist.name}
              </h1>

              <div className="flex items-center justify-center sm:justify-start gap-3 text-xs text-[var(--text-secondary)] dark:text-slate-400 font-medium">
                <span>{resolvedTracks.length} {resolvedTracks.length === 1 ? 'track' : 'tracks'}</span>
                {totalDuration > 0 && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDuration(totalDuration)}
                    </span>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-center sm:justify-start gap-2.5 pt-2 flex-wrap">
                <button
                  type="button"
                  disabled={resolvedTracks.length === 0}
                  onClick={() => onPlayPlaylist(selectedPlaylist, 0, false)}
                  className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white font-semibold text-xs shadow-md shadow-[var(--accent-primary)]/20 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play All</span>
                </button>

                <button
                  type="button"
                  disabled={resolvedTracks.length < 2}
                  onClick={() => onPlayPlaylist(selectedPlaylist, 0, true)}
                  className="px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] dark:border-white/[0.1] text-[var(--text-primary)] dark:text-slate-300 hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.06] disabled:opacity-40 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>Shuffle</span>
                </button>

                {onAddToQueue && (
                  <button
                    type="button"
                    disabled={resolvedTracks.length === 0}
                    onClick={() => onAddToQueue(resolvedTracks)}
                    className="px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] dark:border-white/[0.1] text-[var(--text-primary)] dark:text-slate-300 hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.06] disabled:opacity-40 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <ListPlus className="w-3.5 h-3.5" />
                    <span>Add to Queue</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setPlaylistToRename(selectedPlaylist)}
                  className="p-2 rounded-xl border border-[var(--border-subtle)] dark:border-white/[0.1] text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-white hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                  title="Rename Playlist"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setPlaylistToDelete(selectedPlaylist)}
                  className="p-2 rounded-xl border border-[var(--border-subtle)] dark:border-white/[0.1] text-[var(--text-secondary)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer"
                  title="Delete Playlist"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Playlist Track List */}
          {resolvedTracks.length > 0 ? (
            <div className="space-y-2">
              <TrackList
                tracks={resolvedTracks}
                libraryTracks={libraryTracks}
                currentTrackId={currentTrackId}
                isPlaying={isPlaying}
                favourites={favourites}
                playlists={playlists}
                onPlayTrack={onPlayTrack}
                onTogglePlay={onTogglePlay}
                onToggleFavourite={onToggleFavourite}
                onPlayNext={onPlayNext}
                onPlayNextBulk={onPlayNextBulk}
                onAddToQueue={onAddToQueue}
                onAddToPlaylist={onAddToPlaylist}
                onAddTracksToPlaylist={onAddTracksToPlaylist}
                onCreateAndAddToPlaylist={onCreateAndAddToPlaylist}
                onRemoveFromPlaylist={(_, idx) =>
                  onRemoveTrackFromPlaylist(selectedPlaylist.id, '', idx)
                }
                onRemoveTracksFromPlaylist={(trackIds) =>
                  onRemoveTracksFromPlaylist?.(selectedPlaylist.id, trackIds)
                }
                onAddTracksToFavourites={onAddTracksToFavourites}
                onRemoveTracksFromFavourites={onRemoveTracksFromFavourites}
                onMoveTrackUp={(idx) =>
                  onReorderPlaylistTracks(selectedPlaylist.id, idx, idx - 1)
                }
                onMoveTrackDown={(idx) =>
                  onReorderPlaylistTracks(selectedPlaylist.id, idx, idx + 1)
                }
                isPlaylistView={true}
              />
            </div>
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
      ) : (
        /* Playlists Grid / Overview View */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Playlists
              </h2>
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

          {playlists.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {/* Create Playlist Action Card */}
              <div
                onClick={() => setIsCreateModalOpen(true)}
                className="group p-4 rounded-2xl border-2 border-dashed border-[var(--border-subtle)] dark:border-white/[0.1] hover:border-[var(--accent-primary)]/50 hover:bg-[var(--bg-active)]/40 dark:hover:bg-indigo-950/20 transition-colors duration-150 cursor-pointer flex flex-col items-center justify-center text-center min-h-[180px] select-none"
              >
                <div className="w-12 h-12 rounded-xl bg-[var(--accent-primary)]/10 dark:bg-indigo-500/20 text-[var(--accent-primary)] dark:text-indigo-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold text-[var(--text-primary)] dark:text-slate-200 group-hover:text-[var(--accent-primary)] dark:group-hover:text-indigo-400">
                  New Playlist
                </p>
                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Click to create</p>
              </div>

              {/* Playlist Cards */}
              {playlists.map((pl) => (
                <div
                  key={pl.id}
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
                        onPlayPlaylist(pl, 0, false);
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
          )}
        </div>
      )}

      {/* Create Playlist Modal */}
      <PlaylistModal
        isOpen={isCreateModalOpen}
        mode="create"
        onClose={() => setIsCreateModalOpen(false)}
        onSubmitName={(name) => {
          const pl = onCreatePlaylist(name);
          onSelectPlaylist(pl.id);
        }}
      />

      {/* Rename Playlist Modal */}
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

      {/* Delete Playlist Confirmation Modal */}
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
    </div>
  );
};
