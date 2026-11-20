import { useCallback } from 'react';
import { TrackList } from './TrackList';
import { PlaylistsView } from './PlaylistsView';
import { FolderView } from './FolderView';
import { AlbumsView } from './AlbumsView';
import { ArtistsView } from './ArtistsView';
import { EmptyState } from './EmptyState';
import { resolvePlaylistTracks } from '../utils/musicTree';
import { isSameTrack } from '../utils/trackIdentity';
import { isTrackPlayable } from '../utils/audioFileTypes';
import { useMusicLibrary } from '../hooks/useMusicLibrary';
import { usePlaylists } from '../hooks/usePlaylists';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { TrackItem } from '../types/music';

export interface LibraryContentProps {
  library: ReturnType<typeof useMusicLibrary>;
  playlists: ReturnType<typeof usePlaylists>;
  audioPlayer: ReturnType<typeof useAudioPlayer>;
}

export function LibraryContent({ library, playlists, audioPlayer }: LibraryContentProps) {
  const {
    currentView,
    isLoading,
    scanProgress,
    searchQuery,
    displayedTracks,
    currentFolderNode,
    albums,
    artists,
    selectedAlbumId,
    selectedArtistName,
    favourites,
    selectFolder,
    selectAlbum,
    selectArtist,
    toggleFavourite,
    addTracksToFavourites,
    removeTracksFromFavourites,
    removeImportedFiles,
    openFolderPicker,
    openFilesPicker,
    handleFallbackFolderSelect,
    handleOpenFilesSelect,
  } = library;

  const {
    playlists: playlistList,
    selectedPlaylistId,
    selectPlaylist,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    reorderPlaylistTracks,
    removeTrackFromPlaylist,
    removeTracksFromPlaylist,
    addTrackToPlaylist,
    addTracksToPlaylist,
  } = playlists;

  const {
    currentTrack,
    isPlaying,
    playTrack,
    playQueue,
    togglePlay,
    playNext,
    playNextBulk,
    addToQueue,
  } = audioPlayer;

  const hasLibrary = Boolean(
    library.library &&
      (library.library.flatPlaylist.length > 0 ||
        (library.library.folders && library.library.folders.length > 0))
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Scanning local library...
        </p>
      </div>
    );
  }

  if (!hasLibrary) {
    return (
      <EmptyState
        isScanning={isLoading}
        scanCount={scanProgress}
        onOpenFolder={openFolderPicker}
        onOpenFiles={openFilesPicker}
        onFallbackFolderSelect={handleFallbackFolderSelect}
        onOpenFilesSelect={handleOpenFilesSelect}
      />
    );
  }

  const handleCreateAndAddToPlaylist = (name: string, t: TrackItem | TrackItem[]) => {
    createPlaylist(name, Array.isArray(t) ? t : [t]);
  };

  const libraryTracks = library.library?.flatPlaylist || [];

  const handlePlayAllDisplayed = useCallback(() => {
    const playable = displayedTracks.filter(isTrackPlayable);
    if (playable.length === 0) return;

    // Deduplicate logical tracks while preserving active search & sort order
    const uniqueTracks: TrackItem[] = [];
    for (const track of playable) {
      if (!uniqueTracks.some((existing) => isSameTrack(existing, track))) {
        uniqueTracks.push(track);
      }
    }
    if (uniqueTracks.length === 0) return;

    audioPlayer.playQueue(uniqueTracks, 0, true);
  }, [displayedTracks, audioPlayer]);

  const commonTrackListProps = {
    tracks: displayedTracks,
    libraryTracks,
    currentTrackId: currentTrack?.id,
    isPlaying,
    favourites,
    playlists: playlistList,
    onPlayAll: handlePlayAllDisplayed,
    onPlayTrack: playTrack,
    onTogglePlay: togglePlay,
    onToggleFavourite: toggleFavourite,
    onPlayNext: playNext,
    onPlayNextBulk: playNextBulk,
    onAddToQueue: addToQueue,
    onAddToPlaylist: addTrackToPlaylist,
    onAddTracksToPlaylist: addTracksToPlaylist,
    onCreateAndAddToPlaylist: handleCreateAndAddToPlaylist,
    onAddTracksToFavourites: addTracksToFavourites,
    onRemoveTracksFromFavourites: removeTracksFromFavourites,
  };

  switch (currentView) {
    case 'all':
      return (
        <TrackList
          {...commonTrackListProps}
          emptyVariant={searchQuery ? 'search' : 'default'}
        />
      );

    case 'favourites':
      return (
        <TrackList
          {...commonTrackListProps}
          emptyVariant="favourites"
        />
      );

    case 'imported-files':
      return (
        <TrackList
          {...commonTrackListProps}
          onRemoveImportedFiles={removeImportedFiles}
          isImportedFilesView={true}
          emptyVariant={searchQuery ? 'search' : 'default'}
          emptyMessage="No imported files found."
        />
      );

    case 'playlists':
      return (
        <PlaylistsView
          playlists={playlistList}
          selectedPlaylistId={selectedPlaylistId}
          libraryTracks={libraryTracks}
          currentTrackId={currentTrack?.id}
          isPlaying={isPlaying}
          favourites={favourites}
          onSelectPlaylist={selectPlaylist}
          onCreatePlaylist={createPlaylist}
          onRenamePlaylist={renamePlaylist}
          onDeletePlaylist={deletePlaylist}
          onPlayPlaylist={(pl, startIndex, shuffle) => {
            const resolved = resolvePlaylistTracks(pl.tracks, libraryTracks);
            if (resolved.length === 0) return;
            playQueue(resolved, startIndex, shuffle);
          }}
          onPlayTrack={playTrack}
          onTogglePlay={togglePlay}
          onToggleFavourite={toggleFavourite}
          onPlayNext={playNext}
          onPlayNextBulk={playNextBulk}
          onAddToQueue={addToQueue}
          onAddToPlaylist={addTrackToPlaylist}
          onAddTracksToPlaylist={addTracksToPlaylist}
          onCreateAndAddToPlaylist={handleCreateAndAddToPlaylist}
          onRemoveTrackFromPlaylist={removeTrackFromPlaylist}
          onRemoveTracksFromPlaylist={removeTracksFromPlaylist}
          onAddTracksToFavourites={addTracksToFavourites}
          onRemoveTracksFromFavourites={removeTracksFromFavourites}
          onReorderPlaylistTracks={reorderPlaylistTracks}
        />
      );

    case 'folder':
      return (
        <FolderView
          currentNode={currentFolderNode}
          libraryTracks={libraryTracks}
          currentTrackId={currentTrack?.id}
          isPlaying={isPlaying}
          favourites={favourites}
          playlists={playlistList}
          onSelectFolder={selectFolder}
          onPlayTrack={playTrack}
          onPlayQueue={playQueue}
          onTogglePlay={togglePlay}
          onToggleFavourite={toggleFavourite}
          onPlayNext={playNext}
          onPlayNextBulk={playNextBulk}
          onAddToQueue={addToQueue}
          onAddToPlaylist={addTrackToPlaylist}
          onAddTracksToPlaylist={addTracksToPlaylist}
          onCreateAndAddToPlaylist={handleCreateAndAddToPlaylist}
          onAddTracksToFavourites={addTracksToFavourites}
          onRemoveTracksFromFavourites={removeTracksFromFavourites}
        />
      );

    case 'albums':
      return (
        <AlbumsView
          albums={albums}
          selectedAlbumId={selectedAlbumId}
          currentTrackId={currentTrack?.id}
          isPlaying={isPlaying}
          favourites={favourites}
          playlists={playlistList}
          onSelectAlbum={selectAlbum}
          onPlayTrack={playTrack}
          onPlayQueue={playQueue}
          onTogglePlay={togglePlay}
          onToggleFavourite={toggleFavourite}
          onPlayNext={playNext}
          onAddToQueue={addToQueue}
          onAddToPlaylist={addTrackToPlaylist}
        />
      );

    case 'artists':
      return (
        <ArtistsView
          artists={artists}
          selectedArtistName={selectedArtistName}
          currentTrackId={currentTrack?.id}
          isPlaying={isPlaying}
          favourites={favourites}
          playlists={playlistList}
          onSelectArtist={selectArtist}
          onPlayTrack={playTrack}
          onPlayQueue={playQueue}
          onTogglePlay={togglePlay}
          onToggleFavourite={toggleFavourite}
          onPlayNext={playNext}
          onAddToQueue={addToQueue}
          onAddToPlaylist={addTrackToPlaylist}
        />
      );

    default:
      return null;
  }
}
