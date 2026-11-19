import React from 'react';
import { Folder, ArrowUpLeft } from 'lucide-react';
import { FolderNode, Playlist, TrackItem } from '../types/music';
import { TrackList } from './TrackList';

interface FolderViewProps {
  currentNode: FolderNode | null;
  libraryTracks?: TrackItem[];
  currentTrackId?: string | null;
  isPlaying: boolean;
  favourites: Set<string>;
  playlists?: Playlist[];
  onSelectFolder: (path: string) => void;
  onPlayTrack: (track: TrackItem) => void;
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

export const FolderView: React.FC<FolderViewProps> = ({
  currentNode,
  libraryTracks,
  currentTrackId,
  isPlaying,
  favourites,
  playlists,
  onSelectFolder,
  onPlayTrack,
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
  if (!currentNode) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
        <Folder className="w-12 h-12 mx-auto mb-3 opacity-30 text-indigo-500 dark:text-indigo-400" />
        <p>No folder selected. Pick a folder from the sidebar.</p>
      </div>
    );
  }

  const currentPath = currentNode.relativePath;
  const parentPath = currentPath.includes('/')
    ? currentPath.substring(0, currentPath.lastIndexOf('/'))
    : '';

  return (
    <div className="space-y-6">
      {/* Subfolder Cards Grid */}
      {currentNode.subfolders.length > 0 || currentPath ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
            <span>Subfolders ({currentNode.subfolders.length})</span>
            {currentPath && (
              <button
                onClick={() => onSelectFolder(parentPath)}
                className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium normal-case cursor-pointer"
              >
                <ArrowUpLeft className="w-3.5 h-3.5" />
                <span>Go Up</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {currentNode.subfolders.map((sub) => (
              <div
                key={sub.id}
                onClick={() => onSelectFolder(sub.relativePath)}
                className="group p-3 rounded-xl glass-panel hover:bg-slate-200/60 dark:hover:bg-white/[0.08] hover:border-indigo-500/40 transition-all cursor-pointer flex items-center gap-3 select-none"
              >
                <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Folder className="w-4 h-4 text-indigo-500 dark:text-indigo-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200 group-hover:text-slate-950 dark:group-hover:text-white truncate">
                    {sub.name}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {sub.totalTrackCount} {sub.totalTrackCount === 1 ? 'track' : 'tracks'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Direct Tracks in this Folder */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1 flex items-center justify-between">
          <span>Folder Tracks ({currentNode.tracks.length})</span>
          {currentNode.tracks.length > 0 && (
            <button
              onClick={() => onPlayTrack(currentNode.tracks[0])}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold normal-case cursor-pointer"
            >
              Play All
            </button>
          )}
        </div>

        <TrackList
          tracks={currentNode.tracks}
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
          onAddTracksToFavourites={onAddTracksToFavourites}
          onRemoveTracksFromFavourites={onRemoveTracksFromFavourites}
        />
      </div>
    </div>
  );
};
