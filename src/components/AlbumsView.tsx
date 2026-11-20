import React from 'react';
import { Play, ArrowLeft, Disc } from 'lucide-react';
import { AlbumGroup, Playlist, TrackItem } from '../types/music';
import { TrackList } from './TrackList';
import { formatDuration } from '../utils/formatters';

interface AlbumsViewProps {
  albums: AlbumGroup[];
  selectedAlbumId: string | null;
  currentTrackId?: string | null;
  isPlaying: boolean;
  favourites: Set<string>;
  playlists?: Playlist[];
  onSelectAlbum: (albumId: string | null) => void;
  onPlayTrack: (track: TrackItem) => void;
  onTogglePlay: () => void;
  onToggleFavourite: (trackId: string) => void;
  onPlayNext?: (track: TrackItem) => 'added' | 'moved' | void;
  onAddToQueue?: (trackOrTracks: TrackItem | TrackItem[]) => boolean | void;
  onAddToPlaylist?: (playlistId: string, track: TrackItem) => boolean;
}

export const AlbumsView: React.FC<AlbumsViewProps> = ({
  albums,
  selectedAlbumId,
  currentTrackId,
  isPlaying,
  favourites,
  playlists,
  onSelectAlbum,
  onPlayTrack,
  onTogglePlay,
  onToggleFavourite,
  onPlayNext,
  onAddToQueue,
  onAddToPlaylist,
}) => {
  const selectedAlbum = selectedAlbumId ? albums.find((a) => a.id === selectedAlbumId) : null;

  if (selectedAlbum) {
    return (
      <div className="space-y-6">
        {/* Back Button */}
        <button
          onClick={() => onSelectAlbum(null)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>All Albums</span>
        </button>

        {/* Album Header Banner */}
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 p-6 rounded-2xl glass-panel relative overflow-hidden">
          <div
            className="w-44 h-44 rounded-xl shadow-2xl shrink-0 flex items-center justify-center overflow-hidden border border-[#DDE4EF] dark:border-white/[0.1]"
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
              <Disc className="w-16 h-16 text-white/50" />
            )}
          </div>

          <div className="flex-1 text-center sm:text-left min-w-0">
            <span className="text-[11px] uppercase tracking-widest font-bold text-[#565ECF] dark:text-indigo-400">
              Album
            </span>
            <h2 className="text-3xl font-extrabold text-[#182238] dark:text-white tracking-tight truncate mt-1">
              {selectedAlbum.name}
            </h2>
            <div className="flex items-center justify-center sm:justify-start gap-2 mt-2 text-xs text-[#687995] dark:text-slate-300">
              <span className="font-semibold text-[#182238] dark:text-white">{selectedAlbum.artist}</span>
              {selectedAlbum.year && <span>• {selectedAlbum.year}</span>}
              <span>• {selectedAlbum.tracks.length} tracks</span>
              <span>• {formatDuration(selectedAlbum.totalDuration)}</span>
            </div>

            <div className="mt-4 flex items-center justify-center sm:justify-start gap-3">
              <button
                onClick={() => {
                  if (selectedAlbum.tracks.length > 0) {
                    onPlayTrack(selectedAlbum.tracks[0]);
                  }
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#565ECF] hover:bg-[#4B52BA] text-white text-xs font-bold shadow-lg shadow-[#565ECF]/30 transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Play Album</span>
              </button>
            </div>
          </div>
        </div>

        {/* Track List */}
        <TrackList
          tracks={selectedAlbum.tracks}
          currentTrackId={currentTrackId}
          isPlaying={isPlaying}
          favourites={favourites}
          playlists={playlists}
          onPlayTrack={onPlayTrack}
          onTogglePlay={onTogglePlay}
          onToggleFavourite={onToggleFavourite}
          onPlayNext={onPlayNext}
          onAddToQueue={onAddToQueue}
          onAddToPlaylist={onAddToPlaylist}
        />
      </div>
    );
  }

  if (albums.length === 0) {
    return (
      <div className="py-16 text-center text-slate-500 dark:text-slate-400">
        <Disc className="w-12 h-12 mx-auto mb-3 opacity-30 text-indigo-500 dark:text-indigo-400" />
        <p className="text-sm">No albums discovered in library yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {albums.map((album) => (
        <div
          key={album.id}
          onClick={() => onSelectAlbum(album.id)}
          className="group p-3.5 rounded-2xl glass-panel hover:bg-[#E9EDF7] dark:hover:bg-white/[0.08] hover:border-[#565ECF]/40 transition-colors duration-150 cursor-pointer select-none flex flex-col"
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
              <Disc className="w-12 h-12 text-white/50" />
            )}

            {/* Play Button Overlay */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (album.tracks.length > 0) {
                  onPlayTrack(album.tracks[0]);
                }
              }}
              className="absolute right-2.5 bottom-2.5 w-10 h-10 rounded-full bg-[#565ECF] hover:bg-[#4B52BA] text-white shadow-xl flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all hover:scale-110 active:scale-95 cursor-pointer"
              title="Play album"
            >
              <Play className="w-4 h-4 fill-white ml-0.5" />
            </button>
          </div>

          {/* Info */}
          <div className="min-w-0">
            <h3 className="font-semibold text-xs text-[#182238] dark:text-white truncate group-hover:text-[#565ECF] dark:group-hover:text-indigo-300 transition-colors">
              {album.name}
            </h3>
            <p className="text-[11px] text-[#687995] dark:text-slate-400 truncate mt-0.5">
              {album.artist}
            </p>
            <p className="text-[10px] text-[#687995] dark:text-slate-500 mt-1">
              {album.year ? `${album.year} • ` : ''}
              {album.tracks.length} {album.tracks.length === 1 ? 'track' : 'tracks'}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};
