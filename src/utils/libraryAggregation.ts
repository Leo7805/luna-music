import {
  MusicLibrary,
  TrackItem,
  LibraryView,
  AlbumGroup,
  ArtistGroup,
  FolderNode,
  FileStatus,
  IMPORTED_FILES_ROOT_ID,
} from '../types/music';
import { naturalSort } from './naturalSort';

/**
 * Derives album groups from the library's flat playlist.
 */
export function deriveAlbums(flatPlaylist: TrackItem[]): AlbumGroup[] {
  if (flatPlaylist.length === 0) return [];

  const map = new Map<string, TrackItem[]>();
  for (const track of flatPlaylist) {
    const albumKey = `${track.metadata.album || 'Unknown Album'}___${track.metadata.artist || 'Unknown Artist'}`;
    let list = map.get(albumKey);
    if (!list) {
      list = [];
      map.set(albumKey, list);
    }
    list.push(track);
  }

  const groups: AlbumGroup[] = [];
  for (const [key, tracks] of map.entries()) {
    const [name, artist] = key.split('___');
    const firstWithCover = tracks.find((t) => t.metadata.artworkUrl);
    const firstWithYear = tracks.find((t) => t.metadata.year);
    const totalDur = tracks.reduce((sum, t) => sum + (t.metadata.duration || 0), 0);

    groups.push({
      id: key,
      name,
      artist,
      year: firstWithYear?.metadata.year,
      artworkUrl: firstWithCover?.metadata.artworkUrl,
      placeholderGradient: tracks[0]?.metadata.placeholderGradient,
      tracks,
      totalDuration: totalDur,
    });
  }

  return naturalSort(groups, (g) => g.name);
}

/**
 * Derives artist groups from the library's flat playlist.
 */
export function deriveArtists(flatPlaylist: TrackItem[]): ArtistGroup[] {
  if (flatPlaylist.length === 0) return [];

  const map = new Map<string, TrackItem[]>();
  for (const track of flatPlaylist) {
    const artist = track.metadata.artist || 'Unknown Artist';
    let list = map.get(artist);
    if (!list) {
      list = [];
      map.set(artist, list);
    }
    list.push(track);
  }

  const groups: ArtistGroup[] = [];
  for (const [name, tracks] of map.entries()) {
    const uniqueAlbums = new Set(tracks.map((t) => t.metadata.album));
    const totalDur = tracks.reduce((sum, t) => sum + (t.metadata.duration || 0), 0);

    groups.push({
      id: name,
      name,
      tracks,
      albumCount: uniqueAlbums.size,
      totalDuration: totalDur,
    });
  }

  return naturalSort(groups, (g) => g.name);
}

export interface DisplayedTracksOptions {
  library: MusicLibrary | null;
  currentView: LibraryView;
  currentFolderNode: FolderNode | null;
  selectedArtistName: string | null;
  selectedAlbumId: string | null;
  albums: AlbumGroup[];
  favouriteTracks: TrackItem[];
  searchQuery: string;
}

/**
 * Computes displayed tracks based on active view, selections, and search filter.
 */
export function deriveDisplayedTracks({
  library,
  currentView,
  currentFolderNode,
  selectedArtistName,
  selectedAlbumId,
  albums,
  favouriteTracks,
  searchQuery,
}: DisplayedTracksOptions): TrackItem[] {
  if (!library) return [];

  let baseList: TrackItem[] = [];

  if (currentView === 'all') {
    baseList = library.flatPlaylist;
  } else if (currentView === 'favourites') {
    baseList = favouriteTracks;
  } else if (currentView === 'folder') {
    if (currentFolderNode) {
      baseList = currentFolderNode.tracks;
    } else {
      baseList = library.flatPlaylist;
    }
  } else if (currentView === 'artists') {
    if (selectedArtistName) {
      baseList = library.flatPlaylist.filter(
        (t) => (t.metadata.artist || 'Unknown Artist') === selectedArtistName
      );
    } else {
      baseList = library.flatPlaylist;
    }
  } else if (currentView === 'albums') {
    if (selectedAlbumId) {
      const album = albums.find((a) => a.id === selectedAlbumId);
      baseList = album ? album.tracks : library.flatPlaylist;
    } else {
      baseList = library.flatPlaylist;
    }
  } else if (currentView === 'imported-files') {
    const importedFolder = library.folders.find((f) => f.id === IMPORTED_FILES_ROOT_ID);
    baseList = importedFolder ? importedFolder.tracks : [];
  }

  // Apply search query filter
  const query = searchQuery.trim().toLowerCase();
  if (!query) return baseList;

  return baseList.filter((t) => {
    return (
      t.name.toLowerCase().includes(query) ||
      t.metadata.title.toLowerCase().includes(query) ||
      t.metadata.artist.toLowerCase().includes(query) ||
      t.metadata.album.toLowerCase().includes(query) ||
      t.relativePath.toLowerCase().includes(query)
    );
  });
}

/**
 * Immutably updates a track's status, size, or metadata throughout the library structure.
 */
export function updateTrackInLibrary(
  prevLib: MusicLibrary,
  trackId: string,
  status: FileStatus,
  size?: number,
  metadata?: Partial<TrackItem['metadata']>
): MusicLibrary {
  const updateItem = (t: TrackItem): TrackItem => {
    if (t.id !== trackId) return t;
    return {
      ...t,
      status,
      size: size !== undefined ? size : t.size,
      metadata: metadata
        ? {
            ...t.metadata,
            ...metadata,
            isMetadataLoaded: true,
          }
        : t.metadata,
    };
  };

  const updatedFlat = prevLib.flatPlaylist.map(updateItem);

  function updateNode(node: FolderNode): FolderNode {
    return {
      ...node,
      tracks: node.tracks.map(updateItem),
      subfolders: node.subfolders.map(updateNode),
    };
  }

  const updatedFolders = (prevLib.folders || []).map((f) => ({
    ...f,
    tracks: f.tracks.map(updateItem),
    tree: updateNode(f.tree),
  }));

  return {
    ...prevLib,
    folders: updatedFolders,
    tree: updateNode(prevLib.tree),
    flatPlaylist: updatedFlat,
  };
}

/**
 * Immutably updates metadata for an individual track (used during background extraction).
 */
export function updateTrackMetadataInLibrary(
  prevLib: MusicLibrary,
  trackId: string,
  meta: Partial<TrackItem['metadata']>
): MusicLibrary {
  const updateItem = (t: TrackItem): TrackItem => {
    if (t.id !== trackId) return t;
    return {
      ...t,
      metadata: {
        ...t.metadata,
        ...meta,
        isMetadataLoaded: true,
      },
    };
  };

  const updatedFlat = prevLib.flatPlaylist.map(updateItem);

  function updateNode(node: FolderNode): FolderNode {
    return {
      ...node,
      tracks: node.tracks.map(updateItem),
      subfolders: node.subfolders.map(updateNode),
    };
  }

  const updatedFolders = (prevLib.folders || []).map((f) => ({
    ...f,
    tracks: f.tracks.map(updateItem),
    tree: updateNode(f.tree),
  }));

  return {
    ...prevLib,
    folders: updatedFolders,
    tree: updateNode(prevLib.tree),
    flatPlaylist: updatedFlat,
  };
}
