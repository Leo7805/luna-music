import React from 'react';
import { Play, Mic2, User } from 'lucide-react';
import { ArtistGroup, Playlist, TrackItem } from '../types/music';
import { isTrackPlayable } from '../utils/audioFileTypes';
import { TrackList, TrackListProps } from './TrackList';
import { PlayAllButton, SelectModeButton } from './TrackListActions';
import { TrackListEmptyState } from './TrackListEmptyState';
import { formatDuration } from '../utils/formatters';
import { useLazyArtwork } from '../hooks/useLazyArtwork';

function ArtistArtworkProbe({ track }: { track?: TrackItem }) {
  const ref = useLazyArtwork<HTMLSpanElement>(track);
  return <span ref={ref} className="sr-only" aria-hidden="true" />;
}

interface ArtistsViewProps {
  artists: ArtistGroup[];
  selectedArtistName: string | null;
  libraryTracks?: TrackItem[];
  currentTrackId?: string | null;
  isPlaying: boolean;
  favourites: Set<string>;
  playlists?: Playlist[];
  renderLayout?: TrackListProps['renderLayout'];
  onSelectArtist: (artistName: string | null) => void;
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

export const ArtistsView: React.FC<ArtistsViewProps> = ({
  artists,
  selectedArtistName,
  libraryTracks,
  currentTrackId,
  isPlaying,
  favourites,
  playlists,
  renderLayout,
  onSelectArtist,
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
  const selectedArtist =
    selectedArtistName !== null
      ? artists.find((a) => a.id === selectedArtistName || a.name === selectedArtistName) || null
      : null;

  if (selectedArtist) {
    const firstCover = selectedArtist.tracks.find((t) => t.metadata.artworkUrl)?.metadata.artworkUrl;

    const handlePlayArtist = () => {
      const playable = selectedArtist.tracks.filter(isTrackPlayable);
      if (playable.length === 0) return;
      if (onPlayQueue) {
        onPlayQueue(playable, 0, false);
      } else {
        onPlayTrack(playable[0]);
      }
    };

    const heroPanel = (
      <div
        data-testid="artist-hero"
        className="flex flex-col sm:flex-row items-center sm:items-end gap-5 p-5 mb-5 rounded-2xl glass-panel relative overflow-hidden"
      >
        <div className="w-32 h-32 rounded-full shadow-xl shrink-0 flex items-center justify-center overflow-hidden border-2 border-[var(--border-subtle)] dark:border-white/[0.1] bg-gradient-to-tr from-purple-600 to-indigo-500">
          {firstCover ? (
            <img
              src={firstCover}
              alt={selectedArtist.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Mic2 className="w-12 h-12 text-white/50" />
          )}
        </div>

        <div className="flex-1 text-center sm:text-left min-w-0">
          <span className="text-[11px] uppercase tracking-widest font-bold text-[var(--accent-primary)] dark:text-purple-400">
            Artist
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] dark:text-white tracking-tight truncate mt-1">
            {selectedArtist.name}
          </h2>
          <div className="flex items-center justify-center sm:justify-start gap-2 mt-2 text-xs text-[var(--text-secondary)] dark:text-slate-300 flex-wrap">
            <span>
              {selectedArtist.tracks.length}{' '}
              {selectedArtist.tracks.length === 1 ? 'track' : 'tracks'}
            </span>
            <span>
              · {selectedArtist.albumCount}{' '}
              {selectedArtist.albumCount === 1 ? 'album' : 'albums'}
            </span>
            <span>· {formatDuration(selectedArtist.totalDuration)}</span>
          </div>
        </div>
      </div>
    );

    if (selectedArtist.tracks.length === 0) {
      const emptyContent = (
        <div>
          {heroPanel}
          <TrackListEmptyState emptyVariant="default" />
        </div>
      );
      if (renderLayout) {
        return renderLayout({
          actions: (
            <>
              <PlayAllButton onClick={handlePlayArtist} disabled />
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
        key={selectedArtist.id}
        tracks={selectedArtist.tracks}
        libraryTracks={libraryTracks}
        currentTrackId={currentTrackId}
        isPlaying={isPlaying}
        favourites={favourites}
        playlists={playlists}
        hideTrackCount={Boolean(renderLayout)}
        beforeTable={heroPanel}
        renderLayout={renderLayout}
        onPlayAll={handlePlayArtist}
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

  if (artists.length === 0) {
    return (
      <div className="py-16 text-center text-slate-500 dark:text-slate-400">
        <Mic2 className="w-12 h-12 mx-auto mb-3 opacity-30 text-purple-500 dark:text-purple-400" />
        <p className="text-sm">No artists discovered in library yet.</p>
      </div>
    );
  }

  return (
    <div
      data-testid="artists-overview-grid"
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
    >
      {artists.map((artist) => {
        const cover = artist.tracks.find((t) => t.metadata.artworkUrl)?.metadata.artworkUrl;

        return (
          <div
            key={artist.id}
            data-testid={`artist-card-${artist.id}`}
            onClick={() => onSelectArtist(artist.name)}
            className="group p-4 rounded-2xl glass-panel hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.08] hover:border-[var(--accent-primary)]/40 transition-colors duration-150 cursor-pointer select-none flex flex-col items-center text-center"
          >
            {/* Avatar */}
            <div className="w-28 h-28 rounded-full shadow-lg overflow-hidden relative mb-3 flex items-center justify-center bg-gradient-to-tr from-purple-600 via-indigo-600 to-sky-400 p-[2px]">
              <div className="w-full h-full rounded-full overflow-hidden bg-slate-100 dark:bg-[#0a0e1a] flex items-center justify-center">
                {cover ? (
                  <img
                    src={cover}
                    alt={artist.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <>
                    <ArtistArtworkProbe track={artist.tracks.find((t) => t.metadata.hasEmbeddedArtwork)} />
                    <User className="w-10 h-10 text-slate-400 dark:text-white/50" />
                  </>
                )}
              </div>

              {/* Play Button Overlay */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (artist.tracks.length > 0) {
                    onPlayTrack(artist.tracks[0]);
                  }
                }}
                className="absolute right-1 bottom-1 w-9 h-9 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white shadow-xl flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all hover:scale-110 active:scale-95 cursor-pointer"
                title="Play artist"
              >
                <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
              </button>
            </div>

            {/* Info */}
            <div className="w-full min-w-0">
              <h3 className="font-semibold text-xs text-[var(--text-primary)] dark:text-white truncate group-hover:text-[var(--accent-primary)] dark:group-hover:text-purple-300 transition-colors">
                {artist.name}
              </h3>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                {artist.tracks.length} {artist.tracks.length === 1 ? 'track' : 'tracks'}
                {artist.albumCount > 1 && ` • ${artist.albumCount} albums`}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
