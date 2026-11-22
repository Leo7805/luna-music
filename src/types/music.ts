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
  hasEmbeddedArtwork?: boolean; // Persisted flag indicating embedded cover art exists
  placeholderGradient?: string; // CSS linear-gradient string
  codec?: string;
  bitrate?: number;
  isMetadataLoaded: boolean;
}

export type FileStatus = 'normal' | 'empty' | 'unreadable' | 'unsupported';

export interface TrackItem {
  id: string; // unique stable track identifier
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
  folderIds?: string[]; // IDs of imported root folders that reference this track
  aliases?: string[]; // Alternative stable IDs from overlapping imported roots
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

export const IMPORTED_FILES_ROOT_ID = 'imported_files_root';
export const IMPORTED_FILES_COLLECTION_NAME = 'Imported Files';

/**
 * Lightweight serializable record of individually imported files in the virtual collection.
 */
export interface StoredImportedFileRecord {
  id: string; // unique stable track identifier e.g. "imported_files_root:song.mp3"
  name: string;
  relativePath: string;
  size: number;
  lastModified: number;
  handle?: FileSystemFileHandle;
  status?: FileStatus;
  metadata?: TrackMetadata;
  addedAt: number;
  aliases?: string[];
}

/**
 * Lightweight serializable record of a registered folder for persistence in IndexedDB.
 * Contains no runtime-only state (no File objects, no Blob URLs, no extracted metadata).
 */
export interface StoredFolderRecord {
  id: string; // Unique stable identifier e.g. "fsa_<timestamp>_<rand>"
  name: string; // Root directory name
  sourceType: LibrarySourceType;
  handle?: FileSystemDirectoryHandle;
  addedAt: number;
  lastScannedAt?: number;
  trackCount?: number;
}

/**
 * Runtime state of an imported folder in the library.
 */
export interface ImportedFolder {
  id: string; // Matches StoredFolderRecord.id
  name: string;
  sourceType: LibrarySourceType;
  handle?: FileSystemDirectoryHandle;
  tree: FolderNode;
  tracks: TrackItem[];
  trackCount: number;
  addedAt: number;
  lastScannedAt: number;
  permissionStatus: 'granted' | 'prompt' | 'denied';
  isScanning?: boolean;
  error?: string | null;
}

export interface MusicLibrary {
  id: string;
  name: string;
  folders: ImportedFolder[]; // Multi-folder list
  tree: FolderNode; // Unified virtual root
  flatPlaylist: TrackItem[]; // Global deduplicated track list
  sourceType: LibrarySourceType;
  handle?: FileSystemDirectoryHandle;
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface LrcLine {
  time: number; // in seconds
  text: string;
}

export type LibraryView = 'all' | 'folder' | 'playlists' | 'artists' | 'albums' | 'favourites' | 'imported-files';

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

export interface FavouriteTrackSnapshot {
  trackId: string;
  name: string;
  artist?: string;
  album?: string;
  duration?: number;
}

export interface StoredPlaybackState {
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  shuffle: boolean;
  lastTrackId: string | null;
  lastPosition: number;
  wasPlaying?: boolean;
  favourites: string[];
  favouriteSnapshots?: Record<string, FavouriteTrackSnapshot>;
  queueTrackIds?: string[];
  queueIndex?: number;
}

export interface PlaylistTrackReference {
  trackId: string;
  name: string;
  artist?: string;
  album?: string;
  duration?: number;
  addedAt: number;
}

export interface Playlist {
  id: string; // e.g. "pl_<timestamp>_<random>"
  name: string;
  tracks: PlaylistTrackReference[];
  createdAt: number;
  updatedAt: number;
}
