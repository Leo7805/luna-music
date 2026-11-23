import React from 'react';
import { Play, Disc } from 'lucide-react';
import { AlbumGroup, Playlist, TrackItem } from '../types/music';
import { isTrackPlayable } from '../utils/audioFileTypes';
import {
  filterAlbumsByQuery,
  filterTracksByQuery,
  normalizeSearchQuery,
} from '../utils/librarySearch';
import { TrackList, TrackListProps } from './TrackList';
import { PlayAllButton, SelectModeButton } from './TrackListActions';
import { TrackListEmptyState } from './TrackListEmptyState';
import { formatDuration } from '../utils/formatters';
import { useLazyArtwork } from '../hooks/useLazyArtwork';

function AlbumArtworkProbe({ track }: { track?: TrackItem }) {
  const ref = useLazyArtwork<HTMLSpanElement>(track);
  return <span ref={ref} className="sr-only" aria-hidden="true" />;
}

interface AlbumsViewProps {
  albums: AlbumGroup[];
  selectedAlbumId: string | null;
  searchQuery?: string;
  libraryTracks?: TrackItem[];
  currentTrackId?: string | null;
  isPlaying: boolean;
  favourites: Set<string>;
  playlists?: Playlist[];
  renderLayout?: TrackListProps['renderLayout'];
  onSelectAlbum: (albumId: string | null) => void;
  onPlayTrack: (track: TrackItem) => void;
  onPlayQueue?: (tracks: TrackItem[], startIndex?: number, shuffle?: boolean) => void;
  onTogglePlay: () => void;
  onToggleFavourite: (trackId: string) => void;
  onPlayNext?: (track: TrackItem) => 'added' | 'moved' | void;
  onPlayNextBulk?: (tracks: TrackItem[]) => { movedCount: number; addedCount: number } | void;
  onAddToQueue?: (trackOrTracks: TrackItem | TrackItem[]) => boolean | void;
  onAddToPlaylist?: (playlistId: string, track: TrackItem) => boolean;
  onAddTracksToPlaylist?: (playlistId: string, tracks: TrackItem[]) => { addedCount: number };
  onCreateAndAddToPlaylist?: (playlistName: string, trackOrTracks: TrackItem | TrackItem[]) => void;
  onAddTracksToFavourites?: (tracks: TrackItem[]) => void;
  onRemoveTracksFromFavourites?: (tracks: TrackItem[]) => void;
}

export const AlbumsView: React.FC<AlbumsViewProps> = ({
  albums,
  selectedAlbumId,
  searchQuery = '',
  libraryTracks,
  currentTrackId,
  isPlaying,
  favourites,
  playlists,
  renderLayout,
  onSelectAlbum,
  onPlayTrack,
  onPlayQueue,
  onTogglePlay,
  onToggleFavourite,
  onPlayNext,
  onPlayNextBulk,
  onAddToQueue,
  onAddToPlaylist,
  onAddTracksToPlaylist,
  onCreateAndAddToPlaylist,
  onAddTracksToFavourites,
  onRemoveTracksFromFavourites,
}) => {
  const hasQuery = Boolean(normalizeSearchQuery(searchQuery));
  const selectedAlbum =
    selectedAlbumId !== null ? albums.find((a) => a.id === selectedAlbumId) || null : null;

  if (selectedAlbum) {
    const visibleTracks = hasQuery
      ? filterTracksByQuery(selectedAlbum.tracks, searchQuery)
      : selectedAlbum.tracks;

    const handlePlayAlbum = () => {
      const playable = visibleTracks.filter(isTrackPlayable);
      if (playable.length === 0) return;
      if (onPlayQueue) {
        onPlayQueue(playable, 0, false);
      } else {
        onPlayTrack(playable[0]);
      }
    };

    const heroPanel = (
      <div
        data-testid="album-hero"
        className="flex flex-col sm:flex-row items-center sm:items-end gap-5 p-5 mb-5 rounded-2xl glass-panel relative overflow-hidden"
      >
        <div
          className="w-32 h-32 rounded-xl shadow-xl shrink-0 flex items-center justify-center overflow-hidden border border-[var(--border-subtle)] dark:border-white/[0.1]"
          style={{
            background: selectedAlbum.placeholderGradient || 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          }}
        >
          {selectedAlbum.artworkUrl ? (
            <img
              src={selectedAlbum.artworkUrl}
              alt={selectedAlbum.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Disc className="w-12 h-12 text-white/50" />
          )}
        </div>

        <div className="flex-1 text-center sm:text-left min-w-0">
          <span className="text-[11px] uppercase tracking-widest font-bold text-[var(--accent-primary)] dark:text-indigo-400">
            Album
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] dark:text-white tracking-tight truncate mt-1">
            {selectedAlbum.name}
          </h2>
          <div className="flex items-center justify-center sm:justify-start gap-2 mt-2 text-xs text-[var(--text-secondary)] dark:text-slate-300 flex-wrap">
            <span className="font-semibold text-[var(--text-primary)] dark:text-white">
              {selectedAlbum.artist}
            </span>
            {selectedAlbum.year && <span>· {selectedAlbum.year}</span>}
            <span>
              · {selectedAlbum.tracks.length}{' '}
              {selectedAlbum.tracks.length === 1 ? 'track' : 'tracks'}
            </span>
            <span>· {formatDuration(selectedAlbum.totalDuration)}</span>
          </div>
        </div>
      </div>
    );

    if (visibleTracks.length === 0) {
      const emptyContent = (
        <div>
          {heroPanel}
          <TrackListEmptyState emptyVariant={hasQuery ? 'search' : 'default'} />
        </div>
      );
      if (renderLayout) {
        return renderLayout({
          actions: (
            <>
              <PlayAllButton onClick={handlePlayAlbum} disabled />
              <SelectModeButton active={false} onClick={() => {}} disabled />
            </>
          ),
          content: emptyContent,
        });
      }
      return emptyContent;
    }

    return (
      <TrackList
        key={selectedAlbum.id}
        tracks={visibleTracks}
        libraryTracks={libraryTracks}
        currentTrackId={currentTrackId}
        isPlaying={isPlaying}
        favourites={favourites}
        playlists={playlists}
        hideTrackCount={Boolean(renderLayout)}
        beforeTable={heroPanel}
        renderLayout={renderLayout}
        emptyVariant={hasQuery ? 'search' : 'default'}
        onPlayAll={handlePlayAlbum}
        onPlayTrack={onPlayTrack}
        onTogglePlay={onTogglePlay}
        onToggleFavourite={onToggleFavourite}
        onPlayNext={onPlayNext}
        onPlayNextBulk={onPlayNextBulk}
        onAddToQueue={onAddToQueue}
        onAddToPlaylist={onAddToPlaylist}
        onAddTracksToPlaylist={onAddTracksToPlaylist}
        onCreateAndAddToPlaylist={onCreateAndAddToPlaylist}
        onAddTracksToFavourites={onAddTracksToFavourites}
        onRemoveTracksFromFavourites={onRemoveTracksFromFavourites}
      />
    );
  }

  if (albums.length === 0) {
    return (
      <div className="py-16 text-center text-slate-500 dark:text-slate-400">
        <Disc className="w-12 h-12 mx-auto mb-3 opacity-30 text-[var(--accent-primary)] dark:text-indigo-400" />
        <p className="text-sm">No albums discovered in library yet.</p>
      </div>
    );
  }

  const visibleAlbums = hasQuery ? filterAlbumsByQuery(albums, searchQuery) : albums;

  if (hasQuery && visibleAlbums.length === 0) {
    return (
      <div data-testid="albums-search-empty" className="py-16 text-center text-slate-500 dark:text-slate-400">
        <Disc className="w-10 h-10 mx-auto mb-2.5 opacity-30 text-[var(--accent-primary)] dark:text-indigo-400" />
        <p className="text-sm font-medium text-[var(--text-primary)] dark:text-slate-300">
          No albums match &ldquo;{searchQuery.trim()}&rdquo;
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="albums-overview-grid"
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
    >
      {visibleAlbums.map((album) => (
        <div
          key={album.id}
          data-testid={`album-card-${album.id}`}
          onClick={() => onSelectAlbum(album.id)}
          className="group p-3.5 rounded-2xl glass-panel hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.08] hover:border-[var(--accent-primary)]/40 transition-colors duration-150 cursor-pointer select-none flex flex-col"
        >
          {/* Cover Art */}
          <div
            className="w-full aspect-square rounded-xl shadow-md overflow-hidden relative mb-3 flex items-center justify-center"
            style={{
              background: album.placeholderGradient || 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            }}
          >
            {album.artworkUrl ? (
              <img
                src={album.artworkUrl}
                alt={album.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            ) : (
              <>
                <AlbumArtworkProbe track={album.tracks.find((t) => t.metadata.hasEmbeddedArtwork)} />
                <Disc className="w-12 h-12 text-white/50" />
              </>
            )}

            {/* Play Button Overlay */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (album.tracks.length > 0) {
                  onPlayTrack(album.tracks[0]);
                }
              }}
              className="absolute right-2.5 bottom-2.5 w-10 h-10 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white shadow-xl flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all hover:scale-110 active:scale-95 cursor-pointer"
              title="Play album"
            >
              <Play className="w-4 h-4 fill-white ml-0.5" />
            </button>
          </div>

          {/* Info */}
          <div className="min-w-0">
            <h3 className="font-semibold text-xs text-[var(--text-primary)] dark:text-white truncate group-hover:text-[var(--accent-primary)] dark:group-hover:text-indigo-300 transition-colors">
              {album.name}
            </h3>
            <p className="text-[11px] text-[var(--text-secondary)] dark:text-slate-400 truncate mt-0.5">
              {album.artist}
            </p>
            <p className="text-[10px] text-[var(--text-secondary)] dark:text-slate-500 mt-1">
              {album.year ? `${album.year} • ` : ''}
              {album.tracks.length} {album.tracks.length === 1 ? 'track' : 'tracks'}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};
