import { useState, useMemo, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { LibraryContent } from './components/LibraryContent';
import { TrackListLayoutSlots } from './components/TrackList';
import { NowPlayingView } from './components/NowPlayingView';
import { LyricsPanel } from './components/NowPlayingPanel';
import { BottomPlayer } from './components/BottomPlayer';
import { RecoveryBanner } from './components/RecoveryBanner';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ErrorToast } from './components/ErrorToast';
import { ArtworkRequestProvider } from './contexts/ArtworkRequestContext';
import { useMusicLibrary } from './hooks/useMusicLibrary';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import { usePlaylists } from './hooks/usePlaylists';
import { useShortcuts } from './hooks/useShortcuts';
import { useTheme } from './hooks/useTheme';
import { getBreadcrumbs } from './utils/musicTree';
import { deriveViewHeaderInfo } from './utils/libraryAggregation';
import { deriveFolderCollections } from './utils/folderCollections';
import { deriveSearchHeaderCounts, getSearchPlaceholder } from './utils/librarySearch';
import { getStoredNavigation, storeNavigation } from './utils/navigationStorage';
import { isFavouriteTrack } from './utils/favouriteResolvers';
import { LibraryView, TrackItem } from './types/music';

export function App() {
  const { theme, setTheme, lightStyle, setLightStyle } = useTheme();
  const [isLyricsOpen, setIsLyricsOpen] = useState<boolean>(true);
  const [isNowPlayingViewOpen, setIsNowPlayingViewOpen] = useState<boolean>(
    () => Boolean(getStoredNavigation()?.isNowPlayingView)
  );
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);

  const toggleNowPlayingView = useCallback(() => {
    setIsNowPlayingViewOpen((prev) => {
      const next = !prev;
      storeNavigation({ isNowPlayingView: next });
      return next;
    });
  }, []);

  const closeNowPlayingView = useCallback(() => {
    setIsNowPlayingViewOpen(false);
    storeNavigation({ isNowPlayingView: false });
  }, []);

  // Authoritative state hooks
  const playlists = usePlaylists();
  const library = useMusicLibrary();
  const libraryTracks = library.library?.flatPlaylist || [];
  const audioPlayer = useAudioPlayer({
    libraryTracks,
    onTrackStatusChanged: library.updateTrackStatus,
    onTrackMetadataUpdated: library.updateTrackMetadata,
    lastSourceRemoval: library.lastSourceRemoval,
    isLibraryInitialized: library.isInitialized,
    hasRegisteredSources: library.hasRegisteredSources,
    needsPermission: library.needsPermission,
  });

  useDocumentTitle(audioPlayer.currentTrack);
  // Priority 1: Restore embedded artwork on demand for the currently playing track
  useEffect(() => {
    const cur = audioPlayer.currentTrack;
    if (cur && cur.metadata.hasEmbeddedArtwork && !cur.metadata.artworkUrl) {
      library.requestTrackArtwork(cur, 'high');
    }
  }, [audioPlayer.currentTrack, library.requestTrackArtwork]);

  // Keyboard shortcuts dispatcher
  const shortcutHandlers = useMemo(
    () => ({
      togglePlay: audioPlayer.togglePlay,
      seekRelative: audioPlayer.seekRelative,
      nextTrack: audioPlayer.nextTrack,
      prevTrack: audioPlayer.prevTrack,
      adjustVolume: audioPlayer.adjustVolume,
      toggleMute: audioPlayer.toggleMute,
      toggleLyrics: () => setIsLyricsOpen((prev) => !prev),
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
      const wasInNowPlaying = isNowPlayingViewOpen;
      closeNowPlayingView();
      library.setCurrentView(view);
      if (!wasInNowPlaying && view === 'folder' && library.currentView === 'folder') {
        library.selectFolder('');
      }
      if (!wasInNowPlaying && view === 'playlists' && library.currentView === 'playlists') {
        playlists.selectPlaylist(null);
      }
    },
    [isNowPlayingViewOpen, closeNowPlayingView, library, playlists]
  );

  const handleSelectFolder = useCallback(
    (path: string) => {
      closeNowPlayingView();
      library.selectFolder(path);
    },
    [closeNowPlayingView, library]
  );

  const handleSelectPlaylist = useCallback(
    (playlistId: string | null) => {
      closeNowPlayingView();
      library.setSearchQuery('');
      playlists.selectPlaylist(playlistId);
    },
    [closeNowPlayingView, library, playlists]
  );

  const handleCreateAndAddToPlaylist = useCallback(
    (name: string, trackOrTracks: TrackItem | TrackItem[]) => {
      playlists.createPlaylist(name, Array.isArray(trackOrTracks) ? trackOrTracks : [trackOrTracks]);
    },
    [playlists]
  );

  // Compute breadcrumbs for folder view
  const breadcrumbs = useMemo(() => {
    if (!library.library) return [];
    return getBreadcrumbs(library.library.name, library.selectedFolderPath, library.library.folders);
  }, [library.library, library.selectedFolderPath]);

  const folderCollections = useMemo(
    () => deriveFolderCollections(library.folders),
    [library.folders]
  );

  const selectedPlaylist = useMemo(
    () =>
      library.currentView === 'playlists' && playlists.selectedPlaylistId
        ? playlists.playlists.find((p) => p.id === playlists.selectedPlaylistId) || null
        : null,
    [library.currentView, playlists.selectedPlaylistId, playlists.playlists]
  );

  const selectedAlbum = useMemo(
    () =>
      library.currentView === 'albums' && library.selectedAlbumId !== null
        ? library.albums.find((a) => a.id === library.selectedAlbumId) || null
        : null,
    [library.currentView, library.selectedAlbumId, library.albums]
  );

  const selectedArtist = useMemo(
    () =>
      library.currentView === 'artists' && library.selectedArtistName !== null
        ? library.artists.find(
            (a) => a.id === library.selectedArtistName || a.name === library.selectedArtistName
          ) || null
        : null,
    [library.currentView, library.selectedArtistName, library.artists]
  );

  const playlistsTotalTracks = useMemo(
    () => playlists.playlists.reduce((sum, pl) => sum + pl.tracks.length, 0),
    [playlists.playlists]
  );

  const searchHeaderCounts = useMemo(
    () =>
      deriveSearchHeaderCounts({
        currentView: library.currentView,
        searchQuery: library.searchQuery,
        isFolderOverview: library.currentView === 'folder' && !library.selectedFolderPath,
        currentFolderNode: library.currentFolderNode,
        overviewNodes: folderCollections.overviewNodes,
        albums: library.albums,
        selectedAlbum,
        artists: library.artists,
        selectedArtist,
        playlists: playlists.playlists,
        selectedPlaylist,
        libraryTracks,
      }),
    [
      library.currentView,
      library.searchQuery,
      library.selectedFolderPath,
      library.currentFolderNode,
      folderCollections.overviewNodes,
      library.albums,
      selectedAlbum,
      library.artists,
      selectedArtist,
      playlists.playlists,
      selectedPlaylist,
      libraryTracks,
    ]
  );

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
        folderOverviewFoldersCount: folderCollections.physicalFoldersCount,
        folderOverviewTracksCount: library.library?.flatPlaylist.length ?? 0,
        playlistsCount: playlists.playlists.length,
        playlistsTotalTracks,
        isPlaylistDetail: Boolean(selectedPlaylist),
        selectedPlaylistName: selectedPlaylist?.name ?? null,
        albumsCount: library.albums.length,
        artistsCount: library.artists.length,
        isAlbumDetail: Boolean(selectedAlbum),
        selectedAlbumName: selectedAlbum?.name ?? null,
        isArtistDetail: Boolean(selectedArtist),
        selectedArtistLabel: selectedArtist?.name ?? null,
        ...searchHeaderCounts,
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
      library.library?.flatPlaylist.length,
      folderCollections.physicalFoldersCount,
      playlists.playlists.length,
      playlistsTotalTracks,
      selectedPlaylist,
      library.albums.length,
      library.artists.length,
      selectedAlbum,
      selectedArtist,
      searchHeaderCounts,
    ]
  );

  const headerBreadcrumbs =
    hasLibrary && library.currentView === 'folder'
      ? breadcrumbs
      : selectedPlaylist
      ? [
          { name: 'Playlists', path: '' },
          { name: selectedPlaylist.name, path: selectedPlaylist.id },
        ]
      : selectedAlbum
      ? [
          { name: 'Albums', path: '' },
          { name: selectedAlbum.name, path: selectedAlbum.id },
        ]
      : selectedArtist
      ? [
          { name: 'Artists', path: '' },
          { name: selectedArtist.name, path: selectedArtist.id },
        ]
      : undefined;

  const handleHeaderBreadcrumbClick =
    library.currentView === 'playlists'
      ? (path: string) => {
          if (!path) handleSelectPlaylist(null);
        }
      : library.currentView === 'albums'
      ? (path: string) => {
          if (!path) library.selectAlbum(null);
        }
      : library.currentView === 'artists'
      ? (path: string) => {
          if (!path) library.selectArtist(null);
        }
      : handleSelectFolder;

  const searchPlaceholder = getSearchPlaceholder({
    currentView: library.currentView,
    isFolderOverview: library.currentView === 'folder' && !library.selectedFolderPath,
    hasSubfolders: Boolean(library.currentFolderNode?.subfolders.length),
    isPlaylistDetail: Boolean(selectedPlaylist),
    isAlbumDetail: Boolean(selectedAlbum),
    isArtistDetail: Boolean(selectedArtist),
  });

  // A render callback, not a component type: list state and DOM survive updates.
  const renderLibraryLayout = ({ actions, content }: Omit<TrackListLayoutSlots, 'actions'> & {
    actions?: React.ReactNode;
  }) => (
    <>
      <Header
        actions={actions}
        title={viewTitle}
        subtitle={viewSubtitle}
        searchQuery={library.searchQuery}
        searchPlaceholder={searchPlaceholder}
        breadcrumbs={headerBreadcrumbs}
        keepBreadcrumbsOnSearch={Boolean(
          selectedPlaylist ||
            selectedAlbum ||
            selectedArtist ||
            (library.currentView === 'folder' && library.selectedFolderPath !== '')
        )}
        theme={theme}
        lightStyle={lightStyle}
        onSearchChange={library.setSearchQuery}
        onBreadcrumbClick={handleHeaderBreadcrumbClick}
        onOpenShortcutsModal={() => setIsShortcutsOpen(true)}
        onSelectTheme={setTheme}
        onSelectLightStyle={setLightStyle}
      />
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-4 pb-6 custom-scrollbar">
        {content}
      </div>
    </>
  );

  return (
    <ArtworkRequestProvider value={library.requestTrackArtwork}>
    <div
      className={`relative h-screen w-screen flex flex-col overflow-hidden font-sans transition-colors duration-200 select-none ${
        theme === 'dark' ? 'bg-[#071427] text-slate-100' : 'bg-[var(--bg-app)] text-[var(--text-primary)]'
      }`}
    >
      {/* Background layer matching Luna Player */}
      <div
        className={`fixed inset-0 pointer-events-none z-0 transition-colors duration-200 ${
          theme === 'dark'
            ? 'bg-gradient-to-b from-[#102443] to-[#071427] ambient-glow-bg'
            : 'bg-[var(--bg-app)]'
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
          folderCollections={folderCollections}
          playlists={playlists.playlists}
          selectedPlaylistId={playlists.selectedPlaylistId}
          favouritesCount={library.favouritesCount}
          totalTracksCount={library.library?.flatPlaylist.length || 0}
          albumsCount={library.albums.length}
          artistsCount={library.artists.length}
          hasLibrary={hasLibrary}
          isScanning={library.isLoading}
          scanCount={library.scanProgress}
          onSelectView={handleSelectView}
          onSelectFolder={handleSelectFolder}
          onSelectPlaylist={handleSelectPlaylist}
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
        <main
          className={`flex-1 flex flex-col min-w-0 overflow-hidden ${
            theme === 'dark' ? 'bg-transparent' : 'bg-[var(--bg-main)]'
          }`}
        >
          {isNowPlayingViewOpen ? (
            <NowPlayingView
              queue={audioPlayer.queue}
              currentTrack={audioPlayer.currentTrack}
              isPlaying={audioPlayer.isPlaying}
              playlists={playlists.playlists}
              favourites={library.favourites}
              libraryTracks={libraryTracks}
              theme={theme}
              lightStyle={lightStyle}
              onPlayQueueTrack={audioPlayer.playQueueTrack}
              onToggleFavourite={library.toggleFavourite}
              onPlayNext={audioPlayer.playNext}
              onPlayNextBulk={audioPlayer.playNextBulk}
              onRemoveFromQueue={audioPlayer.removeFromQueue}
              onRemoveTracksFromQueue={audioPlayer.removeTracksFromQueue}
              onSaveQueueAsPlaylist={(name) => playlists.saveQueueAsPlaylist(name, audioPlayer.queue)}
              onAddToPlaylist={playlists.addTrackToPlaylist}
              onAddTracksToPlaylist={playlists.addTracksToPlaylist}
              onCreateAndAddToPlaylist={handleCreateAndAddToPlaylist}
              onSelectTheme={setTheme}
              onSelectLightStyle={setLightStyle}
              onOpenShortcutsModal={() => setIsShortcutsOpen(true)}
            />
          ) : library.currentView === 'all' ||
            library.currentView === 'favourites' ||
            library.currentView === 'imported-files' ||
            library.currentView === 'playlists' ||
            Boolean(selectedAlbum) ||
            Boolean(selectedArtist) ||
            (library.currentView === 'folder' && library.selectedFolderPath !== '') ? (
            <LibraryContent
              library={library}
              playlists={playlists}
              audioPlayer={audioPlayer}
              folderCollections={folderCollections}
              renderUnifiedLayout={renderLibraryLayout}
            />
          ) : renderLibraryLayout({ content: (
            <LibraryContent library={library} playlists={playlists} audioPlayer={audioPlayer} folderCollections={folderCollections} />
          ) })}
        </main>

        {/* Dedicated Right Lyrics Panel */}
        <LyricsPanel
          currentTrack={audioPlayer.currentTrack}
          isPlaying={audioPlayer.isPlaying}
          currentTime={audioPlayer.currentTime}
          lyrics={audioPlayer.lyrics}
          ambientColors={audioPlayer.ambientColors}
          isOpen={isLyricsOpen}
          onClose={() => setIsLyricsOpen(false)}
          onSeekTo={audioPlayer.seekTo}
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
            ? isFavouriteTrack(audioPlayer.currentTrack, library.favourites, libraryTracks)
            : false
        }
        isLyricsOpen={isLyricsOpen}
        isNowPlayingViewOpen={isNowPlayingViewOpen}
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
        onToggleLyrics={() => setIsLyricsOpen((prev) => !prev)}
        onToggleNowPlayingView={toggleNowPlayingView}
      />

      {/* Keyboard Shortcuts Modal */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
    </ArtworkRequestProvider>
  );
}
