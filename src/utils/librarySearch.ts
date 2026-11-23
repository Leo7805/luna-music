import { AlbumGroup, ArtistGroup, FolderNode, LibraryView, Playlist, TrackItem } from '../types/music';
import { resolvePlaylistTracks } from './musicTree';

export interface IndexedTrackMatch {
  track: TrackItem;
  originalIndex: number;
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesTrackSearch(track: TrackItem, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const title = track.metadata?.title || '';
  const artist = track.metadata?.artist || '';
  const album = track.metadata?.album || '';
  const name = track.name || '';
  const path = track.relativePath || '';
  return (
    name.toLowerCase().includes(normalizedQuery) ||
    title.toLowerCase().includes(normalizedQuery) ||
    artist.toLowerCase().includes(normalizedQuery) ||
    album.toLowerCase().includes(normalizedQuery) ||
    path.toLowerCase().includes(normalizedQuery)
  );
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
  return albums.filter(
    (album) =>
      album.name.toLowerCase().includes(normalized) ||
      album.artist.toLowerCase().includes(normalized) ||
      album.tracks.some((track) => matchesTrackSearch(track, normalized))
  );
}

export function filterArtistsByQuery(artists: readonly ArtistGroup[], query: string): ArtistGroup[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return [...artists];
  return artists.filter(
    (artist) =>
      artist.name.toLowerCase().includes(normalized) ||
      artist.tracks.some((track) => matchesTrackSearch(track, normalized))
  );
}

export function filterPlaylistsByQuery(
  playlists: readonly Playlist[],
  query: string,
  libraryTracks: readonly TrackItem[] = []
): Playlist[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return [...playlists];
  return playlists.filter((pl) => {
    if (pl.name.toLowerCase().includes(normalized)) return true;
    const matchesRef = pl.tracks.some(
      (ref) =>
        (ref.name || '').toLowerCase().includes(normalized) ||
        (ref.artist || '').toLowerCase().includes(normalized) ||
        (ref.album || '').toLowerCase().includes(normalized)
    );
    if (matchesRef) return true;
    if (libraryTracks.length > 0 && pl.tracks.length > 0) {
      const resolved = resolvePlaylistTracks(pl.tracks, libraryTracks as TrackItem[]);
      return resolved.some((track) => matchesTrackSearch(track, normalized));
    }
    return false;
  });
}

/**
 * Filters top-level Music Folders overview collection cards by display name only
 * (physical root folder names + the Imported Files virtual collection label).
 */
export function filterFolderNodesByQuery(nodes: readonly FolderNode[], query: string): FolderNode[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return [...nodes];
  return nodes.filter((node) => (node.name || '').toLowerCase().includes(normalized));
}

export interface SearchHeaderCounts {
  filteredOverviewCount?: number;
  totalOverviewCollectionsCount?: number;
  filteredDetailTracksCount?: number;
  totalDetailTracksCount?: number;
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
    return {
      filteredDetailTracksCount: filterTracksByQuery(directTracks, normalized).length,
      totalDetailTracksCount: directTracks.length,
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
      filteredOverviewCount: filterPlaylistsByQuery(
        params.playlists,
        normalized,
        params.libraryTracks
      ).length,
    };
  }

  return {};
}
