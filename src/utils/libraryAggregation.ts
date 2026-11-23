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
  let baseList: TrackItem[] = [];

  if (currentView === 'favourites') {
    baseList = favouriteTracks;
  } else if (!library) {
    return [];
  } else if (currentView === 'all') {
    baseList = library.flatPlaylist;
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
 * Safely merges incoming partial metadata into existing TrackMetadata without
 * overwriting valid values with undefined, empty strings, invalid durations, or placeholders.
 */
export function mergeTrackMetadataSafely(
  existing: TrackItem['metadata'],
  incoming: Partial<TrackItem['metadata']>
): TrackItem['metadata'] {
  const next = { ...existing };

  const incomingTitle = incoming.title?.trim();
  if (incomingTitle) {
    next.title = incomingTitle;
  }

  const incomingArtist = incoming.artist?.trim();
  if (
    incomingArtist &&
    (incomingArtist !== 'Unknown Artist' || !existing.artist || existing.artist === 'Unknown Artist')
  ) {
    next.artist = incomingArtist;
  }

  const incomingAlbum = incoming.album?.trim();
  if (
    incomingAlbum &&
    (incomingAlbum !== 'Unknown Album' || !existing.album || existing.album === 'Unknown Album')
  ) {
    next.album = incomingAlbum;
  }

  const hasExistingDuration =
    typeof existing.duration === 'number' && Number.isFinite(existing.duration) && existing.duration > 0;
  if (
    typeof incoming.duration === 'number' &&
    Number.isFinite(incoming.duration) &&
    incoming.duration > 0 &&
    (!hasExistingDuration || !incoming.isMetadataLoaded)
  ) {
    next.duration = incoming.duration;
  }

  if (incoming.trackNo !== undefined) next.trackNo = incoming.trackNo;
  if (incoming.diskNo !== undefined) next.diskNo = incoming.diskNo;
  if (incoming.year !== undefined && String(incoming.year).trim() !== '') {
    next.year = incoming.year;
  }
  if (incoming.genre?.trim()) next.genre = incoming.genre.trim();
  if (incoming.artworkUrl) next.artworkUrl = incoming.artworkUrl;
  if (typeof incoming.hasEmbeddedArtwork === 'boolean') {
    next.hasEmbeddedArtwork = incoming.hasEmbeddedArtwork || Boolean(existing.hasEmbeddedArtwork);
  }
  if (incoming.placeholderGradient && !existing.placeholderGradient) {
    next.placeholderGradient = incoming.placeholderGradient;
  }
  if (incoming.codec?.trim()) next.codec = incoming.codec.trim();
  if (typeof incoming.bitrate === 'number' && incoming.bitrate > 0) {
    next.bitrate = incoming.bitrate;
  }
  next.isMetadataLoaded = existing.isMetadataLoaded || Boolean(incoming.isMetadataLoaded);

  return next;
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
    if (t.id !== trackId && (!t.aliases || !t.aliases.includes(trackId))) return t;
    return {
      ...t,
      status,
      size: size !== undefined ? size : t.size,
      metadata: metadata ? mergeTrackMetadataSafely(t.metadata, metadata) : t.metadata,
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
 * Immutably applies a batch of track metadata updates across flatPlaylist, folders,
 * and folder trees in a single pass. Returns prevLib unchanged if nothing matched.
 */
export function updateTracksMetadataInLibrary(
  prevLib: MusicLibrary,
  updatesByTrackId: Map<string, Partial<TrackItem['metadata']>>
): MusicLibrary {
  if (updatesByTrackId.size === 0) return prevLib;

  let anyChanged = false;
  const updateItem = (t: TrackItem): TrackItem => {
    let meta = updatesByTrackId.get(t.id);
    if (!meta && t.aliases) {
      for (const alias of t.aliases) {
        meta = updatesByTrackId.get(alias);
        if (meta) break;
      }
    }
    if (!meta) return t;
    anyChanged = true;
    return {
      ...t,
      metadata: mergeTrackMetadataSafely(t.metadata, meta),
    };
  };

  const updatedFlat = prevLib.flatPlaylist.map(updateItem);
  if (!anyChanged) return prevLib;

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
 * Immutably updates metadata for an individual track (used during background extraction or playback duration discovery).
 * Never mutates track status, file size, or permissions.
 */
export function updateTrackMetadataInLibrary(
  prevLib: MusicLibrary,
  trackId: string,
  meta: Partial<TrackItem['metadata']>
): MusicLibrary {
  return updateTracksMetadataInLibrary(prevLib, new Map([[trackId, meta]]));
}

/**
 * Computes display title and subtitle for the central header based on current view and state.
 */
export function deriveViewHeaderInfo(params: {
  hasLibrary: boolean;
  currentView: LibraryView;
  searchQuery: string;
  selectedFolderPath: string;
  currentFolderNode: FolderNode | null;
  selectedAlbumId: string | null;
  selectedArtistName: string | null;
  displayedTracksCount: number;
  playlistsCount: number;
  folderOverviewTracksCount?: number;
  folderOverviewFoldersCount?: number;
}): { title: string; subtitle: string } {
  const {
    hasLibrary,
    currentView,
    searchQuery,
    selectedFolderPath,
    currentFolderNode,
    selectedAlbumId,
    selectedArtistName,
    displayedTracksCount,
    playlistsCount,
    folderOverviewTracksCount = 0,
    folderOverviewFoldersCount = 0,
  } = params;
  const isFolderOverview = currentView === 'folder' && !selectedFolderPath;

  let title = 'Music';
  if (searchQuery) {
    title = `Search Results: "${searchQuery}"`;
  } else if (currentView === 'playlists') {
    title = 'Playlists';
  } else if (currentView === 'favourites') {
    title = 'Favourites';
  } else if (isFolderOverview) {
    title = 'Music Folders';
  } else if (!hasLibrary) {
    title = 'Music Library';
  } else {
    switch (currentView) {
      case 'all':
        title = 'All Tracks';
        break;
      case 'folder':
        title = !selectedFolderPath
          ? 'Music Folders'
          : currentFolderNode
          ? currentFolderNode.name
          : 'Folder Browser';
        break;
      case 'albums':
        title = selectedAlbumId ? 'Album' : 'Albums';
        break;
      case 'artists':
        title = selectedArtistName ? 'Artist' : 'Artists';
        break;
      case 'imported-files':
        title = 'Imported Files';
        break;
      default:
        title = 'Music';
    }
  }

  let subtitle = '';
  if (currentView === 'playlists') {
    subtitle = `${playlistsCount} ${playlistsCount === 1 ? 'playlist' : 'playlists'}`;
  } else if (isFolderOverview) {
    subtitle = `${folderOverviewFoldersCount} ${folderOverviewFoldersCount === 1 ? 'folder' : 'folders'} · ${folderOverviewTracksCount} ${folderOverviewTracksCount === 1 ? 'track' : 'tracks'}${searchQuery ? ' total' : ''}`;
  } else if (currentView === 'favourites' || hasLibrary) {
    subtitle = `${displayedTracksCount} ${displayedTracksCount === 1 ? 'track' : 'tracks'}`;
  }

  return { title, subtitle };
}
