import React from 'react';
import { Folder } from 'lucide-react';
import { FolderNode, Playlist, TrackItem } from '../types/music';
import { isSameTrack } from '../utils/trackIdentity';
import { isTrackPlayable } from '../utils/audioFileTypes';
import { TrackList } from './TrackList';
import { isImportedFilesCollection } from '../utils/folderCollections';
import { ImportedFilesIcon, IMPORTED_FILES_ICON_SURFACE_CLASS } from './ImportedFilesIcon';

interface FolderViewProps {
  currentNode: FolderNode | null;
  isFolderOverview?: boolean;
  overviewNodes?: FolderNode[];
  libraryTracks?: TrackItem[];
  currentTrackId?: string | null;
  isPlaying: boolean;
  favourites: Set<string>;
  playlists?: Playlist[];
  onSelectFolder: (path: string) => void;
  onPlayTrack: (track: TrackItem) => void;
  onPlayAll?: (tracks: TrackItem[]) => void;
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

export const FolderView: React.FC<FolderViewProps> = ({
  currentNode,
  isFolderOverview = false,
  overviewNodes,
  libraryTracks,
  currentTrackId,
  isPlaying,
  favourites,
  playlists,
  onSelectFolder,
  onPlayTrack,
  onPlayAll,
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
  if (!currentNode) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
        <Folder className="w-12 h-12 mx-auto mb-3 opacity-30 text-indigo-500 dark:text-indigo-400" />
        <p>No folder selected. Pick a folder from the sidebar.</p>
      </div>
    );
  }

  const handlePlayAll = () => {
    if (!currentNode) return;
    const playable = currentNode.tracks.filter(isTrackPlayable);
    if (playable.length === 0) return;

    const uniqueTracks: TrackItem[] = [];
    for (const track of playable) {
      if (!uniqueTracks.some((existing) => isSameTrack(existing, track))) {
        uniqueTracks.push(track);
      }
    }
    if (uniqueTracks.length === 0) return;

    if (onPlayQueue) {
      onPlayQueue(uniqueTracks, 0, false);
    } else if (onPlayAll) {
      onPlayAll(uniqueTracks);
    } else {
      onPlayTrack(uniqueTracks[0]);
    }
  };

  const subfolders = isFolderOverview && overviewNodes ? overviewNodes : currentNode.subfolders;
  const subfoldersSection =
    subfolders.length > 0 ? (
      <div data-testid="folder-subfolders-section" className="pb-4 pt-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {subfolders.map((sub) => (
            <button
              type="button"
              key={sub.id}
              data-testid={`folder-card-${sub.id}`}
              onClick={() => onSelectFolder(sub.relativePath)}
              className="group w-full text-left p-3 rounded-xl glass-panel hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.08] hover:border-[var(--accent-primary)]/30 transition-colors duration-150 cursor-pointer flex items-center gap-3 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50 dark:focus-visible:ring-white/30"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform ${
                isImportedFilesCollection(sub.id) ? IMPORTED_FILES_ICON_SURFACE_CLASS : 'bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20'
              }`}>
                {isImportedFilesCollection(sub.id)
                  ? <ImportedFilesIcon className="w-4 h-4" />
                  : <Folder className="w-4 h-4 text-[var(--accent-primary)] dark:text-indigo-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[var(--text-primary)] dark:text-slate-200 group-hover:text-black dark:group-hover:text-white truncate">
                  {sub.name}
                </p>
                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                  {sub.totalTrackCount} {sub.totalTrackCount === 1 ? 'track' : 'tracks'}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    ) : null;

  if (currentNode.tracks.length === 0 && subfolders.length > 0) {
    if (isFolderOverview) return subfoldersSection;
    return (
      <div className="space-y-3">
        <div
          data-testid="tracklist-toolbar"
          className="flex items-center justify-between pb-1 px-1"
        >
          <span
            data-testid="tracklist-count"
            className="text-xs text-[var(--text-secondary)] dark:text-slate-400 font-medium"
          >
            0 tracks
          </span>
        </div>
        {subfoldersSection}
      </div>
    );
  }

  return (
    <TrackList
      tracks={currentNode.tracks}
      libraryTracks={libraryTracks}
      currentTrackId={currentTrackId}
      isPlaying={isPlaying}
      favourites={favourites}
      playlists={playlists}
      beforeTable={subfoldersSection}
      onPlayAll={handlePlayAll}
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
};
