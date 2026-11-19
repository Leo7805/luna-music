import { useState, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { TrackList } from './components/TrackList';
import { FolderView } from './components/FolderView';
import { AlbumsView } from './components/AlbumsView';
import { ArtistsView } from './components/ArtistsView';
import { NowPlayingPanel } from './components/NowPlayingPanel';
import { BottomPlayer } from './components/BottomPlayer';
import { EmptyState } from './components/EmptyState';
import { RecoveryBanner } from './components/RecoveryBanner';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ErrorToast } from './components/ErrorToast';
import { useMusicLibrary } from './hooks/useMusicLibrary';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useShortcuts } from './hooks/useShortcuts';
import { useTheme } from './hooks/useTheme';
import { getBreadcrumbs } from './utils/musicTree';

export function App() {
  const { theme, toggleTheme } = useTheme();
  const [isNowPlayingOpen, setIsNowPlayingOpen] = useState<boolean>(true);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);

  // Music Library state and actions
  const {
    library,
    currentView,
    selectedFolderPath,
    selectedArtistName,
    selectedAlbumId,
    searchQuery,
    favourites,
    isLoading,
    scanProgress,
    needsPermission,
    currentFolderNode,
    displayedTracks,
    albums,
    artists,
    setCurrentView,
    selectFolder,
    selectArtist,
    selectAlbum,
    setSearchQuery,
    toggleFavourite,
    openFolderPicker,
    handleFallbackFolderSelect,
    handleOpenFilesSelect,
    requestPermissionAndLoad,
    updateTrackStatus,
  } = useMusicLibrary();

  // Audio Player state and actions
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    repeatMode,
    shuffle,
    playbackError,
    clearPlaybackError,
    lyrics,
    ambientColors,
    playTrack,
    togglePlay,
    nextTrack,
    prevTrack,
    seekTo,
    seekRelative,
    changeVolume,
    adjustVolume,
    toggleMute,
    cycleRepeatMode,
    toggleShuffle,
  } = useAudioPlayer({
    playlist: displayedTracks.length > 0 ? displayedTracks : library?.flatPlaylist || [],
    onTrackStatusChanged: updateTrackStatus,
  });

  // Keyboard shortcuts dispatcher
  const shortcutHandlers = useMemo(
    () => ({
      togglePlay,
      seekRelative,
      nextTrack,
      prevTrack,
      adjustVolume,
      toggleMute,
      toggleLyrics: () => setIsNowPlayingOpen((prev) => !prev),
    }),
    [
      togglePlay,
      seekRelative,
      nextTrack,
      prevTrack,
      adjustVolume,
      toggleMute,
    ]
  );

  useShortcuts(shortcutHandlers);

  const hasLibrary = Boolean(library && library.flatPlaylist.length > 0);

  // Compute breadcrumbs for folder view
  const breadcrumbs = useMemo(() => {
    if (!library) return [];
    return getBreadcrumbs(library.name, selectedFolderPath);
  }, [library, selectedFolderPath]);

  // Compute view title (Neutral "Music Library" when empty)
  const viewTitle = useMemo(() => {
    if (searchQuery) return `Search Results: "${searchQuery}"`;
    if (!hasLibrary) return 'Music Library';
    switch (currentView) {
      case 'all':
        return 'All Tracks';
      case 'folder':
        return currentFolderNode ? currentFolderNode.name : 'Folder Browser';
      case 'albums':
        return selectedAlbumId ? 'Album' : 'Albums';
      case 'artists':
        return selectedArtistName ? 'Artist' : 'Artists';
      case 'favourites':
        return 'Favourites';
      default:
        return 'Music';
    }
  }, [hasLibrary, currentView, currentFolderNode, selectedAlbumId, selectedArtistName, searchQuery]);

  const viewSubtitle = useMemo(() => {
    if (!hasLibrary) return '';
    return `${displayedTracks.length} ${displayedTracks.length === 1 ? 'track' : 'tracks'}`;
  }, [hasLibrary, displayedTracks.length]);

  return (
    <div
      className={`relative h-screen w-screen flex flex-col overflow-hidden font-sans transition-colors duration-200 select-none ${
        theme === 'dark' ? 'bg-[#071427] text-slate-100' : 'bg-[#CFDBE7] text-slate-900'
      }`}
    >
      {/* Background layer matching Luna Player */}
      <div
        className={`fixed inset-0 pointer-events-none z-0 transition-colors duration-500 ${
          theme === 'dark'
            ? 'bg-gradient-to-b from-[#102443] to-[#071427] ambient-glow-bg'
            : 'bg-[#CFDBE7]'
        }`}
        data-testid="app-background"
      />

      {/* Recovery Banner if handle needs permissions */}
      {needsPermission && (
        <div className="relative z-20">
          <RecoveryBanner onRestore={requestPermissionAndLoad} />
        </div>
      )}

      {/* Unobtrusive Dismissible Playback Error Toast (Replaces large red banner) */}
      <ErrorToast message={playbackError} onDismiss={clearPlaybackError} />

      {/* Main Workspace: Left Sidebar + Central Content + Right Now Playing */}
      <div className="flex-1 flex min-h-0 relative z-10 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          currentView={currentView}
          selectedFolderPath={selectedFolderPath}
          folderTree={library?.tree || null}
          favouritesCount={favourites.size}
          totalTracksCount={library?.flatPlaylist.length || 0}
          hasLibrary={hasLibrary}
          isScanning={isLoading}
          scanCount={scanProgress}
          onSelectView={setCurrentView}
          onSelectFolder={selectFolder}
          onOpenFolder={openFolderPicker}
          onFallbackFolderSelect={handleFallbackFolderSelect}
          onOpenFilesSelect={handleOpenFilesSelect}
        />

        {/* Central Content Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-transparent overflow-hidden">
          {/* Header */}
          <Header
            title={viewTitle}
            subtitle={viewSubtitle}
            searchQuery={searchQuery}
            breadcrumbs={hasLibrary && currentView === 'folder' ? breadcrumbs : undefined}
            theme={theme}
            onSearchChange={setSearchQuery}
            onBreadcrumbClick={selectFolder}
            onOpenShortcutsModal={() => setIsShortcutsOpen(true)}
            onToggleTheme={toggleTheme}
          />

          {/* View Container */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Scanning local library...
                </p>
              </div>
            ) : !hasLibrary ? (
              /* Requirement 3 & 4: Single prominent Open Music split button in center */
              <EmptyState
                isScanning={isLoading}
                scanCount={scanProgress}
                onOpenFolder={openFolderPicker}
                onFallbackFolderSelect={handleFallbackFolderSelect}
                onOpenFilesSelect={handleOpenFilesSelect}
              />
            ) : (
              <>
                {currentView === 'all' && (
                  <TrackList
                    tracks={displayedTracks}
                    currentTrackId={currentTrack?.id}
                    isPlaying={isPlaying}
                    favourites={favourites}
                    onPlayTrack={playTrack}
                    onTogglePlay={togglePlay}
                    onToggleFavourite={toggleFavourite}
                  />
                )}

                {currentView === 'favourites' && (
                  <TrackList
                    tracks={displayedTracks}
                    currentTrackId={currentTrack?.id}
                    isPlaying={isPlaying}
                    favourites={favourites}
                    onPlayTrack={playTrack}
                    onTogglePlay={togglePlay}
                    onToggleFavourite={toggleFavourite}
                  />
                )}

                {currentView === 'folder' && (
                  <FolderView
                    currentNode={currentFolderNode}
                    currentTrackId={currentTrack?.id}
                    isPlaying={isPlaying}
                    favourites={favourites}
                    onSelectFolder={selectFolder}
                    onPlayTrack={playTrack}
                    onTogglePlay={togglePlay}
                    onToggleFavourite={toggleFavourite}
                  />
                )}

                {currentView === 'albums' && (
                  <AlbumsView
                    albums={albums}
                    selectedAlbumId={selectedAlbumId}
                    currentTrackId={currentTrack?.id}
                    isPlaying={isPlaying}
                    favourites={favourites}
                    onSelectAlbum={selectAlbum}
                    onPlayTrack={playTrack}
                    onTogglePlay={togglePlay}
                    onToggleFavourite={toggleFavourite}
                  />
                )}

                {currentView === 'artists' && (
                  <ArtistsView
                    artists={artists}
                    selectedArtistName={selectedArtistName}
                    currentTrackId={currentTrack?.id}
                    isPlaying={isPlaying}
                    favourites={favourites}
                    onSelectArtist={selectArtist}
                    onPlayTrack={playTrack}
                    onTogglePlay={togglePlay}
                    onToggleFavourite={toggleFavourite}
                  />
                )}
              </>
            )}
          </div>
        </main>

        {/* Right Now Playing Panel */}
        <NowPlayingPanel
          currentTrack={currentTrack}
          currentTime={currentTime}
          lyrics={lyrics}
          ambientColors={ambientColors}
          isOpen={isNowPlayingOpen}
          onClose={() => setIsNowPlayingOpen(false)}
          onSeekTo={seekTo}
        />
      </div>

      {/* Persistent Bottom Audio Player */}
      <BottomPlayer
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        isMuted={isMuted}
        repeatMode={repeatMode}
        shuffle={shuffle}
        isFavourite={currentTrack ? favourites.has(currentTrack.id) : false}
        isNowPlayingOpen={isNowPlayingOpen}
        hasLyrics={lyrics.length > 0}
        onTogglePlay={togglePlay}
        onNextTrack={nextTrack}
        onPrevTrack={prevTrack}
        onSeek={seekTo}
        onVolumeChange={changeVolume}
        onToggleMute={toggleMute}
        onCycleRepeat={cycleRepeatMode}
        onToggleShuffle={toggleShuffle}
        onToggleFavourite={() => currentTrack && toggleFavourite(currentTrack.id)}
        onToggleNowPlaying={() => setIsNowPlayingOpen((prev) => !prev)}
      />

      {/* Keyboard Shortcuts Modal */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
}
