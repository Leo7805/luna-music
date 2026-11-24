import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SidebarNavigation } from '../src/components/SidebarNavigation';
import { SidebarPlaylists } from '../src/components/SidebarPlaylists';
import { SubfolderTreeNode } from '../src/components/SidebarFolderTree';
import { RootFolderItem } from '../src/components/RootFolderItem';
import { SidebarImportedFiles } from '../src/components/SidebarImportedFiles';
import { TrackRow } from '../src/components/TrackRow';
import { TrackItem, Playlist, ImportedFolder, FolderNode } from '../src/types/music';

describe('Visual Selection and Focus States Consistency', () => {
  const mockTrack1: TrackItem = {
    id: 'f1:track1.mp3',
    name: 'track1.mp3',
    relativePath: 'track1.mp3',
    size: 3000,
    lastModified: 1000,
    metadata: {
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      album: 'A Night at the Opera',
      duration: 354,
      isMetadataLoaded: true,
    },
  };

  const mockTrack2: TrackItem = {
    id: 'f1:track2.mp3',
    name: 'track2.mp3',
    relativePath: 'track2.mp3',
    size: 2000,
    lastModified: 1000,
    metadata: {
      title: 'Love of My Life',
      artist: 'Queen',
      album: 'A Night at the Opera',
      duration: 219,
      isMetadataLoaded: true,
    },
  };

  const mockPlaylist: Playlist = {
    id: 'pl-1',
    name: 'Best of Queen',
    tracks: [{ trackId: 'f1:track1.mp3', name: 'Bohemian Rhapsody', addedAt: 1000 }],
    createdAt: 1000,
    updatedAt: 1000,
  };

  const mockFolderNode: FolderNode = {
    id: 'f1/Rock',
    name: 'Rock',
    relativePath: 'f1/Rock',
    tracks: [mockTrack1],
    subfolders: [],
    totalTrackCount: 1,
  };

  const mockFolder: ImportedFolder = {
    id: 'folder-1',
    name: 'Music Root',
    sourceType: 'fs-access',
    tracks: [mockTrack1, mockTrack2],
    trackCount: 2,
    addedAt: 1000,
    lastScannedAt: 1000,
    permissionStatus: 'granted',
    tree: {
      id: 'root-1',
      name: 'Music Root',
      relativePath: 'folder-1',
      tracks: [],
      subfolders: [mockFolderNode],
      totalTrackCount: 2,
    },
  };

  describe('1. Sidebar Navigation Active and Inactive Border Consistency', () => {
    it('applies constant 1px border and transparent border on inactive buttons without layout shift', () => {
      const html = renderToStaticMarkup(
        <SidebarNavigation
          currentView="all"
          totalTracksCount={10}
          playlistsCount={1}
          favouritesCount={2}
          onSelectView={() => {}}
          onSelectFolder={() => {}}
        />
      );

      // Active item ('All Tracks') has soft theme-aware active background without heavy shadow or hardcoded indigo
      expect(html).toContain('data-testid="nav-item-all" data-active="true" aria-current="page"');
      expect(html).toContain('bg-[var(--bg-active)]/75');
      expect(html).not.toContain('bg-indigo-600/15');
      expect(html).not.toContain('border-indigo-500/30');
      expect(html).not.toContain('shadow-sm');

      // Inactive items have border-transparent (prevents border flash & 1px jitter)
      expect(html).toContain('border-transparent');
      // Uses targeted transition-colors rather than transition-all
      expect(html).toContain('transition-colors');
      expect(html).not.toContain('transition-all');
    });

    it('correctly shifts active border and background when navigating from Folders to Playlists to Albums', () => {
      const htmlFolders = renderToStaticMarkup(
        <SidebarNavigation
          currentView="folder"
          totalTracksCount={10}
          playlistsCount={1}
          favouritesCount={2}
          onSelectView={() => {}}
          onSelectFolder={() => {}}
        />
      );
      expect(htmlFolders).toContain('data-testid="nav-item-folders" data-active="true" aria-current="page"');

      const htmlPlaylists = renderToStaticMarkup(
        <SidebarNavigation
          currentView="playlists"
          totalTracksCount={10}
          playlistsCount={1}
          favouritesCount={2}
          onSelectView={() => {}}
          onSelectFolder={() => {}}
        />
      );
      expect(htmlPlaylists).toContain('data-testid="nav-item-playlists" data-active="true" aria-current="page"');

      const htmlAlbums = renderToStaticMarkup(
        <SidebarNavigation
          currentView="albums"
          totalTracksCount={10}
          playlistsCount={1}
          favouritesCount={2}
          onSelectView={() => {}}
          onSelectFolder={() => {}}
        />
      );
      expect(htmlAlbums).toContain('data-testid="nav-item-albums" data-active="true" aria-current="page"');
    });
  });

  describe('2. Sidebar Playlists & Folders Consistent Selection Borders', () => {
    it('renders playlist item with unified soft active styling matching folder sources and no shadow', () => {
      const htmlSelected = renderToStaticMarkup(
        <SidebarPlaylists
          playlists={[mockPlaylist]}
          selectedPlaylistId="pl-1"
          activeMenuPlaylistId={null}
          onToggleMenu={() => {}}
          onSelectView={() => {}}
          onCreatePrompt={() => {}}
          onRenamePrompt={() => {}}
          onDeletePrompt={() => {}}
        />
      );
      expect(htmlSelected).toContain('data-active="true" aria-current="page"');
      expect(htmlSelected).toContain('bg-[var(--bg-active)] dark:bg-white/[0.1] text-[var(--text-primary)] dark:text-white font-semibold border-[var(--accent-primary)]/20 dark:border-white/[0.12]');
      expect(htmlSelected).not.toContain('bg-indigo-600/20');
      expect(htmlSelected).not.toContain('border-indigo-500/30');
      expect(htmlSelected).not.toContain('shadow-sm');
      expect(htmlSelected).toContain('transition-colors');

      const htmlUnselected = renderToStaticMarkup(
        <SidebarPlaylists
          playlists={[mockPlaylist]}
          selectedPlaylistId={null}
          activeMenuPlaylistId={null}
          onToggleMenu={() => {}}
          onSelectView={() => {}}
          onCreatePrompt={() => {}}
          onRenamePrompt={() => {}}
          onDeletePrompt={() => {}}
        />
      );
      expect(htmlUnselected).toContain('border-transparent');
      expect(htmlUnselected).toContain('transition-colors');
    });

    it('renders subfolder tree nodes with constant border to prevent border flash', () => {
      const html = renderToStaticMarkup(
        <SubfolderTreeNode
          node={mockFolderNode}
          selectedPath="f1/Rock"
          onSelect={() => {}}
          depth={1}
        />
      );
      expect(html).toContain('data-active="true"');
      expect(html).toContain('border-[var(--accent-primary)]/20');
      expect(html).toContain('transition-colors');
      expect(html).not.toContain('shadow-sm');

      const htmlUnselected = renderToStaticMarkup(
        <SubfolderTreeNode
          node={mockFolderNode}
          selectedPath=""
          onSelect={() => {}}
          depth={1}
        />
      );
      expect(htmlUnselected).toContain('border-transparent');
    });

    it('renders RootFolderItem and SidebarImportedFiles with constant border', () => {
      const htmlRoot = renderToStaticMarkup(
        <RootFolderItem
          folder={mockFolder}
          selectedPath="folder-1"
          isMenuOpen={false}
          onToggleMenu={() => {}}
          onSelectFolder={() => {}}
          onRefreshFolder={() => {}}
          onRemoveFolder={() => {}}
          onRequestPermission={() => {}}
        />
      );
      expect(htmlRoot).toContain('data-active="true"');
      expect(htmlRoot).toContain('border-[var(--accent-primary)]/20');
      expect(htmlRoot).toContain('transition-colors');
      expect(htmlRoot).not.toContain('shadow-sm');

      const htmlImp = renderToStaticMarkup(
        <SidebarImportedFiles
          importedFolder={mockFolder}
          isSelected={false}
          isMenuOpen={false}
          onToggleMenu={() => {}}
          onSelect={() => {}}
          onClearAllPrompt={() => {}}
        />
      );
      expect(htmlImp).toContain('border-transparent');
      expect(htmlImp).toContain('transition-colors');
    });
  });

  describe('3. TrackRow Selection vs Playing vs Hover States', () => {
    it('distinguishes isSelected from isCurrent with distinct borders and no layout shift', () => {
      // Selected track state (bulk selection)
      const htmlSelected = renderToStaticMarkup(
        <TrackRow
          track={mockTrack1}
          index={0}
          isCurrent={false}
          isPlaying={false}
          isSelected={true}
          showCheckboxes={true}
          favourites={new Set()}
          allTracks={[mockTrack1, mockTrack2]}
          isPlaylistMode={false}
          activeMenuTrackId={null}
          onToggleMenu={() => {}}
          onRowClick={() => {}}
          onCheckboxClick={() => {}}
          onPlayTrack={() => {}}
          onTogglePlay={() => {}}
          onToggleFavourite={() => {}}
          onOpenPlaylistModal={() => {}}
          onTouchStart={() => {}}
          onTouchEnd={() => {}}
          showToast={() => {}}
        />
      );
      expect(htmlSelected).toContain('data-row-state="selected"');
      expect(htmlSelected).toContain('track-row-selected');
      expect(htmlSelected).toContain('transition-colors');

      // Currently playing track state
      const htmlPlaying = renderToStaticMarkup(
        <TrackRow
          track={mockTrack1}
          index={0}
          isCurrent={true}
          isPlaying={true}
          isSelected={false}
          showCheckboxes={false}
          favourites={new Set()}
          allTracks={[mockTrack1, mockTrack2]}
          isPlaylistMode={false}
          activeMenuTrackId={null}
          onToggleMenu={() => {}}
          onRowClick={() => {}}
          onCheckboxClick={() => {}}
          onPlayTrack={() => {}}
          onTogglePlay={() => {}}
          onToggleFavourite={() => {}}
          onOpenPlaylistModal={() => {}}
          onTouchStart={() => {}}
          onTouchEnd={() => {}}
          showToast={() => {}}
        />
      );
      expect(htmlPlaying).toContain('data-row-state="current"');
      expect(htmlPlaying).toContain('track-row-current');
      expect(htmlPlaying).toContain('transition-colors');

      // Inactive track row has border-transparent
      const htmlInactive = renderToStaticMarkup(
        <TrackRow
          track={mockTrack2}
          index={1}
          isCurrent={false}
          isPlaying={false}
          isSelected={false}
          showCheckboxes={false}
          favourites={new Set()}
          allTracks={[mockTrack1, mockTrack2]}
          isPlaylistMode={false}
          activeMenuTrackId={null}
          onToggleMenu={() => {}}
          onRowClick={() => {}}
          onCheckboxClick={() => {}}
          onPlayTrack={() => {}}
          onTogglePlay={() => {}}
          onToggleFavourite={() => {}}
          onOpenPlaylistModal={() => {}}
          onTouchStart={() => {}}
          onTouchEnd={() => {}}
          showToast={() => {}}
        />
      );
      expect(htmlInactive).toContain('border-transparent');
      expect(htmlInactive).toContain('transition-colors');
    });
  });

  describe('4. Keyboard Focus and Accessibility Attributes', () => {
    it('provides accessible focus-visible ring styles on sidebar buttons without global outline resets', () => {
      const html = renderToStaticMarkup(
        <SidebarNavigation
          currentView="all"
          totalTracksCount={5}
          playlistsCount={1}
          favouritesCount={1}
          onSelectView={() => {}}
          onSelectFolder={() => {}}
        />
      );

      expect(html).toContain('focus-visible:ring-2');
      expect(html).toContain('focus-visible:ring-[var(--accent-primary)]/50');
      expect(html).toContain('focus:outline-none');
    });

    it('provides accessible focus-visible rings on playlist items and folder tree nodes', () => {
      const html = renderToStaticMarkup(
        <SidebarPlaylists
          playlists={[mockPlaylist]}
          selectedPlaylistId="pl-1"
          activeMenuPlaylistId={null}
          onToggleMenu={() => {}}
          onSelectView={() => {}}
          onCreatePrompt={() => {}}
          onRenamePrompt={() => {}}
          onDeletePrompt={() => {}}
        />
      );

      expect(html).toContain('focus-visible:ring-2');
      expect(html).toContain('focus-visible:ring-indigo-500');
    });
  });
});
