export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  duration?: number;
  trackNo?: number;
  diskNo?: number;
  year?: number | string;
  genre?: string;
  artworkUrl?: string; // Blob object URL created from embedded image
  placeholderGradient?: string; // CSS linear-gradient string
  codec?: string;
  bitrate?: number;
  isMetadataLoaded: boolean;
}

export type FileStatus = 'normal' | 'empty' | 'unreadable' | 'unsupported';

export interface TrackItem {
  id: string; // unique relative path or fallback identifier
  name: string; // file name e.g. "Song.mp3"
  relativePath: string; // "Rock/Queen/Bohemian Rhapsody.mp3"
  size: number;
  lastModified: number;
  handle?: FileSystemFileHandle;
  file?: File;
  metadata: TrackMetadata;
  lrcHandle?: FileSystemFileHandle;
  lrcFile?: File;
  lrcContent?: string;
  status?: FileStatus;
}

export interface FolderNode {
  id: string; // relativePath or 'root'
  name: string; // folder name
  relativePath: string;
  tracks: TrackItem[];
  subfolders: FolderNode[];
  totalTrackCount: number;
}

export type LibrarySourceType = 'fs-access' | 'input-fallback' | 'files';

export interface MusicLibrary {
  id: string;
  name: string;
  tree: FolderNode;
  flatPlaylist: TrackItem[];
  sourceType: LibrarySourceType;
  handle?: FileSystemDirectoryHandle;
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface LrcLine {
  time: number; // in seconds
  text: string;
}

export type LibraryView = 'all' | 'folder' | 'artists' | 'albums' | 'favourites';

export interface AlbumGroup {
  id: string;
  name: string;
  artist: string;
  year?: number | string;
  artworkUrl?: string;
  placeholderGradient?: string;
  tracks: TrackItem[];
  totalDuration: number;
}

export interface ArtistGroup {
  id: string;
  name: string;
  tracks: TrackItem[];
  albumCount: number;
  totalDuration: number;
}

export interface StoredPlaybackState {
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  shuffle: boolean;
  lastTrackId: string | null;
  lastPosition: number;
  favourites: string[];
}
