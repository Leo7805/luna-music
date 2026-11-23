import { deriveFolderCollections } from '../src/utils/folderCollections';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar } from '../src/components/Sidebar';
import { SidebarNavigation } from '../src/components/SidebarNavigation';
import {
  ImportedFolder,
  IMPORTED_FILES_ROOT_ID,
  Playlist,
  TrackItem,
} from '../src/types/music';
import { deriveAlbums, deriveArtists } from '../src/utils/libraryAggregation';
import { resolveFavouriteTracks } from '../src/utils/musicTree';
import { combineFlatPlaylists } from '../src/utils/trackIdentity';

function makeTrack(
  id: string,
  title: string,
  artist: string,
  album: string,
  relativePath = `${title}.mp3`,
  size = 4096
): TrackItem {
  return {
    id,
    name: `${title}.mp3`,
    relativePath,
    size,
    lastModified: 1700000000,
    metadata: {
      title,
      artist,
      album,
      duration: 180,
      isMetadataLoaded: true,
    },
  };
}

function makeFolder(
  id: string,
  name: string,
  tracks: TrackItem[],
  nestedSubfoldersCount = 0
): ImportedFolder {
  const subfolders = Array.from({ length: nestedSubfoldersCount }, (_, i) => ({
    id: `${id}-sub-${i}`,
    name: `Subfolder ${i + 1}`,
    relativePath: `${name}/Subfolder ${i + 1}`,
    tracks: [],
    subfolders: [],
    totalTrackCount: 0,
  }));

  return {
    id,
    name,
    sourceType: id === IMPORTED_FILES_ROOT_ID ? 'files' : 'fs-access',
    tracks,
    trackCount: tracks.length,
    addedAt: 1000,
    lastScannedAt: 1000,
    permissionStatus: 'granted',
    tree: {
      id: `tree-${id}`,
      name,
      relativePath: name,
      tracks,
      subfolders,
      totalTrackCount: tracks.length,
    },
  };
}

function extractBadgeMarkup(html: string, id: string): string {
  const regex = new RegExp(`<span[^>]*data-testid="nav-badge-${id}"[^>]*>([^<]*)</span>`);
  const match = html.match(regex);
  return match ? match[0] : '';
}

function extractBadgeValue(html: string, id: string): string {
  const regex = new RegExp(`<span[^>]*data-testid="nav-badge-${id}"[^>]*>([^<]*)</span>`);
  const match = html.match(regex);
  return match ? match[1] : '';
}

describe('Sidebar Navigation Unified Count Badges', () => {
  const navIds = ['all', 'folders', 'playlists', 'albums', 'artists', 'favourites'] as const;

  it('1. renders all six navigation count badges', () => {
    const html = renderToStaticMarkup(
      <SidebarNavigation
        currentView="all"
        totalTracksCount={335}
        foldersCount={3}
        playlistsCount={1}
        albumsCount={120}
        artistsCount={85}
        favouritesCount={1}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
      />
    );

    expect(extractBadgeValue(html, 'all')).toBe('335');
    expect(extractBadgeValue(html, 'folders')).toBe('3');
    expect(extractBadgeValue(html, 'playlists')).toBe('1');
    expect(extractBadgeValue(html, 'albums')).toBe('120');
    expect(extractBadgeValue(html, 'artists')).toBe('85');
    expect(extractBadgeValue(html, 'favourites')).toBe('1');
  });

  it('2. displays zero counts for all six navigation items when library is empty', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        folderCollections={deriveFolderCollections([])}
        currentView="all"
        selectedFolderPath=""
        folders={[]}
        playlists={[]}
        favouritesCount={0}
        totalTracksCount={0}
        albumsCount={0}
        artistsCount={0}
        hasLibrary={false}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
        onOpenFolder={() => {}}
        onFallbackFolderSelect={() => {}}
        onOpenFilesSelect={() => {}}
      />
    );

    for (const id of navIds) {
      expect(extractBadgeValue(html, id)).toBe('0');
    }
  });

  it('3 & 4. counts only registered physical root folders, excluding nested subfolders and Imported Files', () => {
    const folder1 = makeFolder('root-1', 'Rock', [makeTrack('t1', 'Song 1', 'A1', 'Alb1')], 3);
    const folder2 = makeFolder('root-2', 'Jazz', [makeTrack('t2', 'Song 2', 'A2', 'Alb2')], 2);
    const importedFiles = makeFolder(IMPORTED_FILES_ROOT_ID, 'Imported Files', [
      makeTrack('t3', 'Song 3', 'A3', 'Alb3'),
    ]);

    const html = renderToStaticMarkup(
      <Sidebar
        folderCollections={deriveFolderCollections([folder1, folder2, importedFiles])}
        currentView="folder"
        selectedFolderPath=""
        folders={[folder1, folder2, importedFiles]}
        playlists={[]}
        favouritesCount={0}
        totalTracksCount={3}
        albumsCount={3}
        artistsCount={3}
        hasLibrary={true}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
        onOpenFolder={() => {}}
        onFallbackFolderSelect={() => {}}
        onOpenFilesSelect={() => {}}
      />
    );

    // 2 physical folders (nested subfolders and Imported Files excluded)
    expect(extractBadgeValue(html, 'folders')).toBe('2');
  });

  it('5, 6 & 7. deduplicated logical tracks prevent inflated counts and match Albums & Artists views', () => {
    const track1 = makeTrack('canon-1', 'Blue', 'Artist A', 'Album X', 'dir1/Blue.mp3', 5000);
    const track1Dup: TrackItem = {
      ...makeTrack('alias-1', 'Blue', 'Artist A', 'Album X', 'Blue.mp3', 5000),
      aliases: ['canon-1'],
    };
    const track2 = makeTrack('canon-2', 'Red', 'Artist A', 'Album Y', 'dir1/Red.mp3', 6000);
    const track3 = makeTrack('canon-3', 'Green', 'Artist B', 'Album Z', 'dir2/Green.mp3', 7000);

    const f1 = makeFolder('f1', 'Folder 1', [track1, track2]);
    const f2 = makeFolder('f2', 'Folder 2', [track3]);
    const imported = makeFolder(IMPORTED_FILES_ROOT_ID, 'Imported Files', [track1Dup]);

    const folders = [f1, f2, imported];
    const flatPlaylist = combineFlatPlaylists(folders);
    const albums = deriveAlbums(flatPlaylist);
    const artists = deriveArtists(flatPlaylist);
    const favs = resolveFavouriteTracks(flatPlaylist, new Set(['canon-1', 'alias-1']));

    // Logical dedupe: 3 unique tracks, 3 albums, 2 artists, 1 unique favourite
    expect(flatPlaylist).toHaveLength(3);
    expect(albums).toHaveLength(3);
    expect(artists).toHaveLength(2);
    expect(favs.resolvedTracks).toHaveLength(1);

    const html = renderToStaticMarkup(
      <Sidebar
        folderCollections={deriveFolderCollections(folders)}
        currentView="all"
        selectedFolderPath=""
        folders={folders}
        playlists={[]}
        favouritesCount={favs.resolvedTracks.length}
        totalTracksCount={flatPlaylist.length}
        albumsCount={albums.length}
        artistsCount={artists.length}
        hasLibrary={true}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
        onOpenFolder={() => {}}
        onFallbackFolderSelect={() => {}}
        onOpenFilesSelect={() => {}}
      />
    );

    expect(extractBadgeValue(html, 'all')).toBe('3');
    expect(extractBadgeValue(html, 'folders')).toBe('2');
    expect(extractBadgeValue(html, 'albums')).toBe(String(albums.length));
    expect(extractBadgeValue(html, 'artists')).toBe(String(artists.length));
    expect(extractBadgeValue(html, 'favourites')).toBe('1');
  });

  it('8. updates Playlist and Favourite counts reactively as props change', () => {
    const playlists: Playlist[] = [
      { id: 'p1', name: 'Chill', tracks: [], createdAt: 1, updatedAt: 1 },
      { id: 'p2', name: 'Focus', tracks: [], createdAt: 2, updatedAt: 2 },
    ];

    const htmlBefore = renderToStaticMarkup(
      <SidebarNavigation
        currentView="playlists"
        totalTracksCount={10}
        foldersCount={1}
        playlistsCount={playlists.length}
        albumsCount={2}
        artistsCount={2}
        favouritesCount={3}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
      />
    );
    expect(extractBadgeValue(htmlBefore, 'playlists')).toBe('2');
    expect(extractBadgeValue(htmlBefore, 'favourites')).toBe('3');

    const htmlAfter = renderToStaticMarkup(
      <SidebarNavigation
        currentView="playlists"
        totalTracksCount={10}
        foldersCount={1}
        playlistsCount={1}
        albumsCount={2}
        artistsCount={2}
        favouritesCount={4}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
      />
    );
    expect(extractBadgeValue(htmlAfter, 'playlists')).toBe('1');
    expect(extractBadgeValue(htmlAfter, 'favourites')).toBe('4');
  });

  it('9, 10, 11 & 12. enforces unified styling, active vs inactive states, theme tokens, and right alignment with narrow-sidebar truncation', () => {
    const html = renderToStaticMarkup(
      <SidebarNavigation
        currentView="favourites"
        totalTracksCount={335}
        foldersCount={3}
        playlistsCount={1}
        albumsCount={120}
        artistsCount={85}
        favouritesCount={12}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
      />
    );

    // No category-specific badge colors (e.g. no rose badge on Favourites, no amber badge on Playlists)
    for (const id of navIds) {
      const badge = extractBadgeMarkup(html, id);
      expect(badge).not.toContain('bg-rose-');
      expect(badge).not.toContain('text-rose-');
      expect(badge).not.toContain('bg-amber-');
      expect(badge).not.toContain('text-amber-');
      // Strict right-alignment & no-wrap utilities on every badge
      expect(badge).toContain('ml-auto');
      expect(badge).toContain('shrink-0');
      expect(badge).toContain('whitespace-nowrap');
      expect(badge).toContain('tabular-nums');
    }

    // Active badge (favourites) uses theme-aware accent tint & accent text across Warm/Neutral/Mist & Dark
    const activeBadge = extractBadgeMarkup(html, 'favourites');
    expect(activeBadge).toContain('bg-[var(--accent-primary)]/15');
    expect(activeBadge).toContain('text-[var(--accent-primary)]');
    expect(activeBadge).toContain('dark:bg-indigo-400/20');
    expect(activeBadge).toContain('dark:text-indigo-200');

    // Inactive badges all share identical neutral muted styling
    const inactiveIds = ['all', 'folders', 'playlists', 'albums', 'artists'] as const;
    for (const id of inactiveIds) {
      const badge = extractBadgeMarkup(html, id);
      expect(badge).toContain('bg-[var(--border-subtle)]/70');
      expect(badge).toContain('text-[var(--text-secondary)]');
      expect(badge).toContain('dark:bg-white/[0.06]');
      expect(badge).toContain('dark:text-slate-400');
    }

    // Narrow sidebar resilience: all 6 rows have consistent px-3.5, flexible middle container with min-w-0 flex-1 and truncate
    const buttonMatches = html.match(/data-testid="nav-item-[a-z]+"/g) || [];
    expect(buttonMatches).toHaveLength(6);
    const flexContainers = html.match(/class="flex items-center gap-3 min-w-0 flex-1"/g) || [];
    expect(flexContainers).toHaveLength(6);
    const truncatedLabels = html.match(/class="truncate"/g) || [];
    expect(truncatedLabels).toHaveLength(6);
  });
});
