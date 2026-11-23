import { deriveFolderCollections } from '../src/utils/folderCollections';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar } from '../src/components/Sidebar';
import { SidebarNavigation } from '../src/components/SidebarNavigation';
import { SidebarFolderSection } from '../src/components/SidebarFolderSection';
import { SidebarPlaylists } from '../src/components/SidebarPlaylists';
import { SidebarImportedFiles } from '../src/components/SidebarImportedFiles';
import { RootFolderItem } from '../src/components/RootFolderItem';
import {
  ImportedFolder,
  Playlist,
  IMPORTED_FILES_ROOT_ID,
  FolderNode,
} from '../src/types/music';

describe('Sidebar Architecture & Component Decomposition (Stage 3)', () => {
  const mockFolder1: ImportedFolder = {
    id: 'folder-1',
    name: 'Rock Classics',
    sourceType: 'fs-access',
    tracks: [
      {
        id: 't-1',
        name: 'track1.mp3',
        relativePath: 'track1.mp3',
        size: 1000,
        lastModified: 1000,
        metadata: { title: 'T1', artist: 'Artist 1', album: 'Album 1', isMetadataLoaded: true },
      },
    ],
    trackCount: 1,
    addedAt: 1000,
    lastScannedAt: 1000,
    permissionStatus: 'granted',
    tree: {
      id: 'root-1',
      name: 'Rock Classics',
      relativePath: 'folder-1',
      tracks: [],
      subfolders: [
        {
          id: 'sub-1',
          name: '70s',
          relativePath: 'folder-1/70s',
          tracks: [],
          subfolders: [],
          totalTrackCount: 1,
        },
      ],
      totalTrackCount: 1,
    },
  };

  const mockFolder2: ImportedFolder = {
    id: 'folder-2',
    name: 'Jazz Collection',
    sourceType: 'fs-access',
    tracks: [],
    trackCount: 42,
    addedAt: 2000,
    lastScannedAt: 2000,
    permissionStatus: 'prompt',
    tree: {
      id: 'root-2',
      name: 'Jazz Collection',
      relativePath: 'folder-2',
      tracks: [],
      subfolders: [],
      totalTrackCount: 42,
    },
  };

  const mockImportedFiles: ImportedFolder = {
    id: IMPORTED_FILES_ROOT_ID,
    name: 'Imported Files',
    sourceType: 'files',
    tracks: [
      {
        id: 'imp-1',
        name: 'clip.wav',
        relativePath: 'clip.wav',
        size: 500,
        lastModified: 1000,
        metadata: { title: 'Clip', artist: 'Artist 2', album: 'Album 2', isMetadataLoaded: true },
      },
    ],
    trackCount: 1,
    addedAt: 3000,
    lastScannedAt: 3000,
    permissionStatus: 'granted',
    tree: {
      id: IMPORTED_FILES_ROOT_ID,
      name: 'Imported Files',
      relativePath: IMPORTED_FILES_ROOT_ID,
      tracks: [],
      subfolders: [],
      totalTrackCount: 1,
    },
  };

  const mockPlaylists: Playlist[] = [
    {
      id: 'pl-1',
      name: 'Road Trip',
      tracks: [{ trackId: 't-1', name: 'T1', addedAt: 100 }],
      createdAt: 100,
      updatedAt: 100,
    },
    {
      id: 'pl-2',
      name: 'Night Drive',
      tracks: [],
      createdAt: 200,
      updatedAt: 200,
    },
  ];

  it('1. renders Primary Navigation in the strict 6-item order with badges', () => {
    const html = renderToStaticMarkup(
      <SidebarNavigation
        currentView="all"
        totalTracksCount={120}
        playlistsCount={2}
        favouritesCount={5}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
      />
    );

    // Verify order of items
    const allTracksIdx = html.indexOf('All Tracks');
    const foldersIdx = html.indexOf('Folders');
    const playlistsIdx = html.indexOf('Playlists');
    const albumsIdx = html.indexOf('Albums');
    const artistsIdx = html.indexOf('Artists');
    const favouritesIdx = html.indexOf('Favourites');

    expect(allTracksIdx).toBeGreaterThan(-1);
    expect(foldersIdx).toBeGreaterThan(allTracksIdx);
    expect(playlistsIdx).toBeGreaterThan(foldersIdx);
    expect(albumsIdx).toBeGreaterThan(playlistsIdx);
    expect(artistsIdx).toBeGreaterThan(albumsIdx);
    expect(favouritesIdx).toBeGreaterThan(artistsIdx);

    // Verify badges
    expect(html).toContain('120');
    expect(html).toContain('2');
    expect(html).toContain('5');
  });

  it('2. highlights Folders navigation item when viewing folders or imported-files', () => {
    const htmlFolder = renderToStaticMarkup(
      <SidebarNavigation
        currentView="folder"
        totalTracksCount={10}
        playlistsCount={0}
        favouritesCount={0}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
      />
    );
    expect(htmlFolder).toContain('data-testid="nav-item-folders" data-active="true" aria-current="page"');

    const htmlImported = renderToStaticMarkup(
      <SidebarNavigation
        currentView="imported-files"
        totalTracksCount={10}
        playlistsCount={0}
        favouritesCount={0}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
      />
    );
    expect(htmlImported).toContain('data-testid="nav-item-folders" data-active="true" aria-current="page"');
  });

  it('3. renders contextual Music Folders section and Imported Files', () => {
    const html = renderToStaticMarkup(
      <SidebarFolderSection
        currentView="folder"
        selectedFolderPath=""
        folders={[mockFolder1, mockFolder2, mockImportedFiles]}
        activeMenuFolderId={null}
        onToggleMenu={() => {}}
        onOpenFolder={() => {}}
        onFallbackFolderSelect={() => {}}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
        onRemoveFolderPrompt={() => {}}
        onClearImportedFilesPrompt={() => {}}
      />
    );

    expect(html).toContain('Music Folders');
    expect(html).toContain('Rock Classics');
    expect(html).toContain('Jazz Collection');
    expect(html).toContain('Access needed'); // Permission badge
    expect(html).toContain('Imported Files');
  });

  it('4. renders RootFolderItem with permissions, track counts, and subfolders', () => {
    const html = renderToStaticMarkup(
      <RootFolderItem
        folder={mockFolder1}
        selectedPath="folder-1"
        isMenuOpen={false}
        onToggleMenu={() => {}}
        onSelectFolder={() => {}}
        onRefreshFolder={() => {}}
        onRemoveFolder={() => {}}
        onRequestPermission={() => {}}
      />
    );

    expect(html).toContain('Rock Classics');
    expect(html).toContain('70s'); // Subfolder rendered
    expect(html).toContain('data-testid="root-folder-folder-1"');
  });

  it('5. renders SidebarImportedFiles with correct track count and actions', () => {
    const html = renderToStaticMarkup(
      <SidebarImportedFiles
        importedFolder={mockImportedFiles}
        isSelected={true}
        isMenuOpen={false}
        onToggleMenu={() => {}}
        onSelect={() => {}}
        onClearAllPrompt={() => {}}
      />
    );

    expect(html).toContain('Imported Files');
    expect(html).toContain('1'); // Track count
    expect(html).toContain('data-testid="sidebar-imported-files"');
  });

  it('6. renders contextual My Playlists section with items and track counts', () => {
    const html = renderToStaticMarkup(
      <SidebarPlaylists
        playlists={mockPlaylists}
        selectedPlaylistId="pl-1"
        activeMenuPlaylistId={null}
        onToggleMenu={() => {}}
        onSelectView={() => {}}
        onCreatePrompt={() => {}}
        onRenamePrompt={() => {}}
        onDeletePrompt={() => {}}
      />
    );

    expect(html).toContain('My Playlists');
    expect(html).toContain('Road Trip');
    expect(html).toContain('Night Drive');
    expect(html).toContain('data-testid="sidebar-playlist-pl-1"');
  });

  it('7. renders complete Sidebar with correct contextual visibility across views', () => {
    // In 'all' view: contextual section is hidden
    const htmlAll = renderToStaticMarkup(
      <Sidebar
        folderCollections={deriveFolderCollections([mockFolder1])}
        currentView="all"
        selectedFolderPath=""
        folders={[mockFolder1]}
        playlists={mockPlaylists}
        favouritesCount={2}
        totalTracksCount={10}
        hasLibrary={true}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
        onOpenFolder={() => {}}
        onFallbackFolderSelect={() => {}}
        onOpenFilesSelect={() => {}}
      />
    );
    expect(htmlAll).not.toContain('Music Folders');
    expect(htmlAll).not.toContain('My Playlists');
    expect(htmlAll).toContain('data-testid="sidebar-open-music-container"');

    // In 'folder' view: Music Folders is visible
    const htmlFolder = renderToStaticMarkup(
      <Sidebar
        folderCollections={deriveFolderCollections([mockFolder1])}
        currentView="folder"
        selectedFolderPath=""
        folders={[mockFolder1]}
        playlists={mockPlaylists}
        favouritesCount={2}
        totalTracksCount={10}
        hasLibrary={true}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
        onOpenFolder={() => {}}
        onFallbackFolderSelect={() => {}}
        onOpenFilesSelect={() => {}}
      />
    );
    expect(htmlFolder).toContain('Music Folders');
    expect(htmlFolder).not.toContain('My Playlists');

    // In 'playlists' view: My Playlists is visible
    const htmlPlaylists = renderToStaticMarkup(
      <Sidebar
        folderCollections={deriveFolderCollections([mockFolder1])}
        currentView="playlists"
        selectedFolderPath=""
        folders={[mockFolder1]}
        playlists={mockPlaylists}
        favouritesCount={2}
        totalTracksCount={10}
        hasLibrary={true}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
        onOpenFolder={() => {}}
        onFallbackFolderSelect={() => {}}
        onOpenFilesSelect={() => {}}
      />
    );
    expect(htmlPlaylists).not.toContain('Music Folders');
    expect(htmlPlaylists).toContain('My Playlists');
  });

  it('8. renders legacy tree fallback when no multi-folders exist but folderTree is present', () => {
    const legacyTree: FolderNode = {
      id: 'legacy-root',
      name: 'Old Library',
      relativePath: 'legacy-root',
      tracks: [],
      subfolders: [],
      totalTrackCount: 3,
    };

    const html = renderToStaticMarkup(
      <Sidebar
        folderCollections={deriveFolderCollections([])}
        currentView="folder"
        selectedFolderPath=""
        folderTree={legacyTree}
        folders={[]}
        playlists={[]}
        favouritesCount={0}
        totalTracksCount={3}
        hasLibrary={true}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
        onOpenFolder={() => {}}
        onFallbackFolderSelect={() => {}}
        onOpenFilesSelect={() => {}}
      />
    );

    expect(html).toContain('Old Library');
  });
});
