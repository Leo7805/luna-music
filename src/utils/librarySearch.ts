import { AlbumGroup, ArtistGroup, FolderNode, LibraryView, Playlist, TrackItem } from '../types/music';
import { isSupportedAudioFile, stripExtension } from './audioFileTypes';
import { resolvePlaylistTracks } from './musicTree';

export interface IndexedTrackMatch {
  track: TrackItem;
  originalIndex: number;
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Removes only a recognized audio file extension (e.g. .mp3, .flac) from a filename.
 * Ordinary names containing periods (e.g. "3.14", "Mr. Brightside") are preserved intact.
 */
export function stripSupportedAudioExtension(filename: string): string {
  const trimmed = filename.trim();
  return isSupportedAudioFile(trimmed) ? stripExtension(trimmed) : trimmed;
}

/**
 * Single authoritative display & search title resolver for a track.
 * Priority:
 * 1. Explicit non-empty metadata.title (unless it is an unstripped verbatim copy of track.name
 *    with a recognized audio extension, such as an unavailable playlist placeholder).
 * 2. track.name with any recognized audio extension stripped.
 */
export function getTrackDisplayTitle(track: TrackItem): string {
  const metaTitle = track.metadata?.title?.trim() || '';
  const rawName = track.name?.trim() || '';
  if (metaTitle) {
    if (rawName && metaTitle === rawName && isSupportedAudioFile(metaTitle)) {
      return stripExtension(metaTitle);
    }
    return metaTitle;
  }
  return stripSupportedAudioExtension(rawName);
}

export function matchesTrackSearch(track: TrackItem, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return getTrackDisplayTitle(track).toLowerCase().includes(normalizedQuery);
}

export function filterTracksByQuery(tracks: readonly TrackItem[], query: string): TrackItem[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return [...tracks];
  return tracks.filter((track) => matchesTrackSearch(track, normalized));
}

export function filterIndexedTracksByQuery(
  tracks: readonly TrackItem[],
  query: string
): IndexedTrackMatch[] {
  const normalized = normalizeSearchQuery(query);
  const matches: IndexedTrackMatch[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (!normalized || matchesTrackSearch(track, normalized)) {
      matches.push({ track, originalIndex: i });
    }
  }
  return matches;
}

export function filterAlbumsByQuery(albums: readonly AlbumGroup[], query: string): AlbumGroup[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return [...albums];
  return albums.filter((album) => (album.name || '').toLowerCase().includes(normalized));
}

export function filterArtistsByQuery(artists: readonly ArtistGroup[], query: string): ArtistGroup[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return [...artists];
  return artists.filter((artist) => (artist.name || '').toLowerCase().includes(normalized));
}

export function filterPlaylistsByQuery(
  playlists: readonly Playlist[],
  query: string,
  _libraryTracks?: readonly TrackItem[]
): Playlist[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return [...playlists];
  return playlists.filter((pl) => (pl.name || '').toLowerCase().includes(normalized));
}

/**
 * Filters folder/collection cards by their display name only.
 * Used for both Music Folders Overview (including Imported Files) and Folder Detail child folders.
 */
export function filterFolderNodesByQuery(nodes: readonly FolderNode[], query: string): FolderNode[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return [...nodes];
  return nodes.filter((node) => (node.name || '').toLowerCase().includes(normalized));
}

/**
 * Returns an accurate contextual placeholder & accessible label for the active library view.
 */
export function getSearchPlaceholder(params: {
  currentView: LibraryView;
  isFolderOverview: boolean;
  hasSubfolders?: boolean;
  isPlaylistDetail?: boolean;
  isAlbumDetail?: boolean;
  isArtistDetail?: boolean;
}): string {
  if (params.currentView === 'playlists' && !params.isPlaylistDetail) {
    return 'Search playlists...';
  }
  if (params.currentView === 'albums' && !params.isAlbumDetail) {
    return 'Search albums...';
  }
  if (params.currentView === 'artists' && !params.isArtistDetail) {
    return 'Search artists...';
  }
  if (params.currentView === 'folder') {
    if (params.isFolderOverview) return 'Search folders...';
    return params.hasSubfolders ? 'Search folders and song titles...' : 'Search song titles...';
  }
  return 'Search song titles...';
}

export interface SearchHeaderCounts {
  filteredOverviewCount?: number;
  totalOverviewCollectionsCount?: number;
  filteredDetailTracksCount?: number;
  totalDetailTracksCount?: number;
  filteredSubfoldersCount?: number;
  totalSubfoldersCount?: number;
}

/**
 * Computes consistent Header search result counts for Overview grids and Detail views
 * using the exact same predicates consumed by the view components.
 */
export function deriveSearchHeaderCounts(params: {
  currentView: LibraryView;
  searchQuery: string;
  isFolderOverview: boolean;
  currentFolderNode: FolderNode | null;
  overviewNodes: readonly FolderNode[];
  albums: readonly AlbumGroup[];
  selectedAlbum: AlbumGroup | null;
  artists: readonly ArtistGroup[];
  selectedArtist: ArtistGroup | null;
  playlists: readonly Playlist[];
  selectedPlaylist: Playlist | null;
  libraryTracks: readonly TrackItem[];
}): SearchHeaderCounts {
  const normalized = normalizeSearchQuery(params.searchQuery);
  if (!normalized) return {};

  if (params.currentView === 'folder') {
    if (params.isFolderOverview) {
      return {
        filteredOverviewCount: filterFolderNodesByQuery(params.overviewNodes, normalized).length,
        totalOverviewCollectionsCount: params.overviewNodes.length,
      };
    }
    const directTracks = params.currentFolderNode?.tracks ?? [];
    const directSubfolders = params.currentFolderNode?.subfolders ?? [];
    return {
      filteredDetailTracksCount: filterTracksByQuery(directTracks, normalized).length,
      totalDetailTracksCount: directTracks.length,
      filteredSubfoldersCount: filterFolderNodesByQuery(directSubfolders, normalized).length,
      totalSubfoldersCount: directSubfolders.length,
    };
  }

  if (params.currentView === 'albums') {
    if (params.selectedAlbum) {
      return {
        filteredDetailTracksCount: filterTracksByQuery(params.selectedAlbum.tracks, normalized).length,
        totalDetailTracksCount: params.selectedAlbum.tracks.length,
      };
    }
    return { filteredOverviewCount: filterAlbumsByQuery(params.albums, normalized).length };
  }

  if (params.currentView === 'artists') {
    if (params.selectedArtist) {
      return {
        filteredDetailTracksCount: filterTracksByQuery(params.selectedArtist.tracks, normalized).length,
        totalDetailTracksCount: params.selectedArtist.tracks.length,
      };
    }
    return { filteredOverviewCount: filterArtistsByQuery(params.artists, normalized).length };
  }

  if (params.currentView === 'playlists') {
    if (params.selectedPlaylist) {
      const resolved = resolvePlaylistTracks(
        params.selectedPlaylist.tracks,
        params.libraryTracks as TrackItem[]
      );
      return {
        filteredDetailTracksCount: filterTracksByQuery(resolved, normalized).length,
        totalDetailTracksCount: resolved.length,
      };
    }
    return {
      filteredOverviewCount: filterPlaylistsByQuery(params.playlists, normalized).length,
    };
  }

  return {};
}
