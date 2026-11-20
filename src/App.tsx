import { useState, useMemo, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { LibraryContent } from './components/LibraryContent';
import { NowPlayingPanel } from './components/NowPlayingPanel';
import { BottomPlayer } from './components/BottomPlayer';
import { RecoveryBanner } from './components/RecoveryBanner';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ErrorToast } from './components/ErrorToast';
import { useMusicLibrary } from './hooks/useMusicLibrary';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { usePlaylists } from './hooks/usePlaylists';
import { useShortcuts } from './hooks/useShortcuts';
import { useTheme } from './hooks/useTheme';
import { getBreadcrumbs } from './utils/musicTree';
import { deriveViewHeaderInfo } from './utils/libraryAggregation';
import { LibraryView, TrackItem } from './types/music';

export function App() {
  const { theme, toggleTheme } = useTheme();
  const [isNowPlayingOpen, setIsNowPlayingOpen] = useState<boolean>(true);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);

  // Authoritative state hooks
  const playlists = usePlaylists();
  const library = useMusicLibrary();
  const audioPlayer = useAudioPlayer({
    onTrackStatusChanged: library.updateTrackStatus,
  });

  // Keyboard shortcuts dispatcher
  const shortcutHandlers = useMemo(
    () => ({
      togglePlay: audioPlayer.togglePlay,
      seekRelative: audioPlayer.seekRelative,
      nextTrack: audioPlayer.nextTrack,
      prevTrack: audioPlayer.prevTrack,
      adjustVolume: audioPlayer.adjustVolume,
      toggleMute: audioPlayer.toggleMute,
      toggleLyrics: () => setIsNowPlayingOpen((prev) => !prev),
      toggleHelp: () => setIsShortcutsOpen((prev) => !prev),
      closeHelp: () => setIsShortcutsOpen(false),
    }),
    [audioPlayer]
  );

  useShortcuts(shortcutHandlers);

  const hasLibrary = Boolean(
    library.library &&
      (library.library.flatPlaylist.length > 0 ||
        (library.library.folders && library.library.folders.length > 0))
  );

  const handleSelectView = useCallback(
    (view: LibraryView) => {
      library.setCurrentView(view);
      if (view === 'folder' && library.currentView === 'folder') {
        library.selectFolder('');
      }
      if (view === 'playlists' && library.currentView === 'playlists') {
        playlists.selectPlaylist(null);
      }
    },
    [library, playlists]
  );

  // Compute breadcrumbs for folder view
  const breadcrumbs = useMemo(() => {
    if (!library.library) return [];
    return getBreadcrumbs(library.library.name, library.selectedFolderPath, library.library.folders);
  }, [library.library, library.selectedFolderPath]);

  // Compute view title & subtitle
  const { title: viewTitle, subtitle: viewSubtitle } = useMemo(
    () =>
      deriveViewHeaderInfo({
        hasLibrary,
        currentView: library.currentView,
        searchQuery: library.searchQuery,
        selectedFolderPath: library.selectedFolderPath,
        currentFolderNode: library.currentFolderNode,
        selectedAlbumId: library.selectedAlbumId,
        selectedArtistName: library.selectedArtistName,
        displayedTracksCount: library.displayedTracks.length,
        playlistsCount: playlists.playlists.length,
      }),
    [
      hasLibrary,
      library.currentView,
      library.searchQuery,
      library.selectedFolderPath,
      library.currentFolderNode,
      library.selectedAlbumId,
      library.selectedArtistName,
      library.displayedTracks.length,
      playlists.playlists.length,
    ]
  );

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
      {library.needsPermission && (
        <div className="relative z-20">
          <RecoveryBanner onRestore={library.requestPermissionAndLoad} />
        </div>
      )}

      {/* Unobtrusive Dismissible Playback Error Toast */}
      <ErrorToast
        message={audioPlayer.playbackError}
        onDismiss={audioPlayer.clearPlaybackError}
      />

      {/* Main Workspace: Left Sidebar + Central Content + Right Now Playing */}
      <div className="flex-1 flex min-h-0 relative z-10 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          currentView={library.currentView}
          selectedFolderPath={library.selectedFolderPath}
          folderTree={library.library?.tree || null}
          folders={library.folders}
          playlists={playlists.playlists}
          selectedPlaylistId={playlists.selectedPlaylistId}
          favouritesCount={library.favouritesCount}
          totalTracksCount={library.library?.flatPlaylist.length || 0}
          hasLibrary={hasLibrary}
          isScanning={library.isLoading}
          scanCount={library.scanProgress}
          onSelectView={handleSelectView}
          onSelectFolder={library.selectFolder}
          onSelectPlaylist={playlists.selectPlaylist}
          onCreatePlaylist={playlists.createPlaylist}
          onRenamePlaylist={playlists.renamePlaylist}
          onDeletePlaylist={playlists.deletePlaylist}
          onOpenFolder={library.openFolderPicker}
          onOpenFiles={library.openFilesPicker}
          onRefreshFolder={library.refreshFolder}
          onRemoveFolder={library.removeFolder}
          onRemoveAllImportedFiles={library.removeAllImportedFiles}
          onRequestFolderPermission={library.requestPermissionForFolder}
          onFallbackFolderSelect={library.handleFallbackFolderSelect}
          onOpenFilesSelect={library.handleOpenFilesSelect}
        />

        {/* Central Content Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-transparent overflow-hidden">
          {/* Header */}
          <Header
            title={viewTitle}
            subtitle={viewSubtitle}
            searchQuery={library.searchQuery}
            breadcrumbs={hasLibrary && library.currentView === 'folder' ? breadcrumbs : undefined}
            theme={theme}
            onSearchChange={library.setSearchQuery}
            onBreadcrumbClick={library.selectFolder}
            onOpenShortcutsModal={() => setIsShortcutsOpen(true)}
            onToggleTheme={toggleTheme}
          />

          {/* Central View Container */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <LibraryContent
              library={library}
              playlists={playlists}
              audioPlayer={audioPlayer}
            />
          </div>
        </main>

        {/* Right Now Playing Panel */}
        <NowPlayingPanel
          currentTrack={audioPlayer.currentTrack}
          currentTime={audioPlayer.currentTime}
          lyrics={audioPlayer.lyrics}
          ambientColors={audioPlayer.ambientColors}
          isOpen={isNowPlayingOpen}
          queue={audioPlayer.queue}
          onClose={() => setIsNowPlayingOpen(false)}
          onSeekTo={audioPlayer.seekTo}
          onPlayTrack={(track: TrackItem) => audioPlayer.playTrack(track, audioPlayer.queue)}
          onRemoveFromQueue={audioPlayer.removeFromQueue}
          onClearQueue={audioPlayer.clearQueue}
          onSaveQueueAsPlaylist={(name) => playlists.saveQueueAsPlaylist(name, audioPlayer.queue)}
        />
      </div>

      {/* Persistent Bottom Audio Player */}
      <BottomPlayer
        currentTrack={audioPlayer.currentTrack}
        isPlaying={audioPlayer.isPlaying}
        currentTime={audioPlayer.currentTime}
        duration={audioPlayer.duration}
        volume={audioPlayer.volume}
        isMuted={audioPlayer.isMuted}
        repeatMode={audioPlayer.repeatMode}
        shuffle={audioPlayer.shuffle}
        isFavourite={
          audioPlayer.currentTrack
            ? library.favourites.has(audioPlayer.currentTrack.id) ||
              Boolean(audioPlayer.currentTrack.aliases?.some((a) => library.favourites.has(a)))
            : false
        }
        isNowPlayingOpen={isNowPlayingOpen}
        onTogglePlay={audioPlayer.togglePlay}
        onNextTrack={audioPlayer.nextTrack}
        onPrevTrack={audioPlayer.prevTrack}
        onSeek={audioPlayer.seekTo}
        onVolumeChange={audioPlayer.changeVolume}
        onToggleMute={audioPlayer.toggleMute}
        onCycleRepeat={audioPlayer.cycleRepeatMode}
        onToggleShuffle={audioPlayer.toggleShuffle}
        onToggleFavourite={() =>
          audioPlayer.currentTrack && library.toggleFavourite(audioPlayer.currentTrack.id)
        }
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
