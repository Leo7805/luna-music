import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  MusicLibrary,
  TrackItem,
  LibraryView,
  AlbumGroup,
  ArtistGroup,
  FolderNode,
  FileStatus,
} from '../types/music';
import {
  scanDirectoryHandle,
  promptOpenDirectory,
  verifyHandlePermission,
  isFileSystemAccessSupported,
} from '../services/directoryAccess';
import { parseFileList, parseSelectedFiles } from '../services/fallbackAccess';
import {
  storeDirectoryHandle,
  getStoredDirectoryHandle,
  storePlaybackState,
  getStoredPlaybackState,
} from '../services/idbStorage';
import { findFolderNodeByPath } from '../utils/musicTree';
import { extractAudioMetadata } from '../utils/metadata';
import { naturalSort } from '../utils/naturalSort';

export function useMusicLibrary() {
  const [library, setLibrary] = useState<MusicLibrary | null>(null);
  const [currentView, setCurrentView] = useState<LibraryView>('all');
  const [selectedFolderPath, setSelectedFolderPath] = useState<string>('');
  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [needsPermission, setNeedsPermission] = useState<boolean>(false);
  const [pendingHandle, setPendingHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const metadataQueueRef = useRef<{ isRunning: boolean; cancel: boolean }>({
    isRunning: false,
    cancel: false,
  });

  // Load stored state and directory handle on mount
  useEffect(() => {
    async function init() {
      const storedState = await getStoredPlaybackState();
      if (storedState.favourites) {
        setFavourites(new Set(storedState.favourites));
      }

      if (isFileSystemAccessSupported()) {
        const storedHandle = await getStoredDirectoryHandle();
        if (storedHandle) {
          const hasPerm = await verifyHandlePermission(storedHandle, false);
          if (hasPerm) {
            loadFromDirectoryHandle(storedHandle);
          } else {
            // Need user gesture to request permission
            setPendingHandle(storedHandle);
            setNeedsPermission(true);
          }
        }
      }
    }

    init();
  }, []);

  // Request permission for previously stored handle
  const requestPermissionAndLoad = useCallback(async () => {
    if (!pendingHandle) return;
    try {
      const granted = await verifyHandlePermission(pendingHandle, true);
      if (granted) {
        setNeedsPermission(false);
        await loadFromDirectoryHandle(pendingHandle);
      }
    } catch {
      setNeedsPermission(false);
    }
  }, [pendingHandle]);

  // Queue to incrementally extract metadata in background
  const startIncrementalMetadataExtraction = useCallback((tracks: TrackItem[]) => {
    // Cancel previous runner if any
    metadataQueueRef.current.cancel = true;

    const currentRunner = { isRunning: true, cancel: false };
    metadataQueueRef.current = currentRunner;

    const unparsed = [...tracks];

    async function processQueue() {
      const concurrency = 3;
      let idx = 0;

      async function worker() {
        while (idx < unparsed.length && !currentRunner.cancel) {
          const track = unparsed[idx++];
          if (!track || track.metadata.isMetadataLoaded || track.size === 0) continue;

          try {
            let blob: Blob | null = null;
            if (track.handle) {
              blob = await track.handle.getFile();
            } else if (track.file) {
              blob = track.file;
            }

            if (blob && !currentRunner.cancel) {
              const meta = await extractAudioMetadata(blob, track.metadata.title);
              if (!currentRunner.cancel && meta) {
                setLibrary((prevLib) => {
                  if (!prevLib) return null;
                  const updatedFlat = prevLib.flatPlaylist.map((t) => {
                    if (t.id === track.id) {
                      return {
                        ...t,
                        metadata: {
                          ...t.metadata,
                          ...meta,
                          isMetadataLoaded: true,
                        },
                      };
                    }
                    return t;
                  });

                  // Update tracks in folder tree
                  function updateNode(node: FolderNode): FolderNode {
                    return {
                      ...node,
                      tracks: node.tracks.map((t) => {
                        if (t.id === track.id) {
                          return {
                            ...t,
                            metadata: {
                              ...t.metadata,
                              ...meta,
                              isMetadataLoaded: true,
                            },
                          };
                        }
                        return t;
                      }),
                      subfolders: node.subfolders.map(updateNode),
                    };
                  }

                  return {
                    ...prevLib,
                    flatPlaylist: updatedFlat,
                    tree: updateNode(prevLib.tree),
                  };
                });
              }
            }
          } catch {
            // Ignore parse errors on individual track
          }
        }
      }

      await Promise.all(
        Array.from({ length: concurrency }).map(() => worker())
      );

      currentRunner.isRunning = false;
    }

    processQueue();
  }, []);

  // Load from FileSystemDirectoryHandle
  const loadFromDirectoryHandle = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      setIsLoading(true);
      setScanProgress(0);
      try {
        const lib = await scanDirectoryHandle(handle, (count) => {
          setScanProgress(count);
        });

        await storeDirectoryHandle(handle);
        setLibrary(lib);
        setSelectedFolderPath('');
        startIncrementalMetadataExtraction(lib.flatPlaylist);
      } catch (err) {
        console.error('Failed to scan directory:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [startIncrementalMetadataExtraction]
  );

  // Pick folder via native API
  const openFolderPicker = useCallback(async () => {
    try {
      const handle = await promptOpenDirectory();
      if (handle) {
        setNeedsPermission(false);
        setPendingHandle(null);
        await loadFromDirectoryHandle(handle);
      }
    } catch (err) {
      console.error('Folder picker error:', err);
    }
  }, [loadFromDirectoryHandle]);

  // Handle fallback directory input
  const handleFallbackFolderSelect = useCallback(
    (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;

      setIsLoading(true);
      const lib = parseFileList(files);
      if (lib) {
        setLibrary(lib);
        setSelectedFolderPath('');
        startIncrementalMetadataExtraction(lib.flatPlaylist);
      }
      setIsLoading(false);
    },
    [startIncrementalMetadataExtraction]
  );

  // Handle fallback file selection input
  const handleOpenFilesSelect = useCallback(
    (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;

      setIsLoading(true);
      const lib = parseSelectedFiles(files);
      if (lib) {
        setLibrary(lib);
        setSelectedFolderPath('');
        startIncrementalMetadataExtraction(lib.flatPlaylist);
      }
      setIsLoading(false);
    },
    [startIncrementalMetadataExtraction]
  );

  // Toggle favorite track
  const toggleFavourite = useCallback((trackId: string) => {
    setFavourites((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      storePlaybackState({ favourites: Array.from(next) });
      return next;
    });
  }, []);

  // Aggregate albums from library
  const albums = useMemo((): AlbumGroup[] => {
    if (!library) return [];

    const map = new Map<string, TrackItem[]>();
    for (const track of library.flatPlaylist) {
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
  }, [library]);

  // Aggregate artists from library
  const artists = useMemo((): ArtistGroup[] => {
    if (!library) return [];

    const map = new Map<string, TrackItem[]>();
    for (const track of library.flatPlaylist) {
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
  }, [library]);

  // Current folder node for folder view
  const currentFolderNode = useMemo((): FolderNode | null => {
    if (!library) return null;
    return findFolderNodeByPath(library.tree, selectedFolderPath);
  }, [library, selectedFolderPath]);

  // Displayed tracks based on view, selections, and search
  const displayedTracks = useMemo((): TrackItem[] => {
    if (!library) return [];

    let baseList: TrackItem[] = [];

    if (currentView === 'all') {
      baseList = library.flatPlaylist;
    } else if (currentView === 'favourites') {
      baseList = library.flatPlaylist.filter((t) => favourites.has(t.id));
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
  }, [
    library,
    currentView,
    currentFolderNode,
    selectedArtistName,
    selectedAlbumId,
    albums,
    favourites,
    searchQuery,
  ]);

  const selectFolder = useCallback((path: string) => {
    setSelectedFolderPath(path);
    setCurrentView('folder');
  }, []);

  const selectArtist = useCallback((artistName: string | null) => {
    setSelectedArtistName(artistName);
    setCurrentView('artists');
  }, []);

  const selectAlbum = useCallback((albumId: string | null) => {
    setSelectedAlbumId(albumId);
    setCurrentView('albums');
  }, []);

  const updateTrackStatus = useCallback(
    (
      trackId: string,
      status: FileStatus,
      size?: number,
      metadata?: Partial<TrackItem['metadata']>
    ) => {
      setLibrary((prevLib) => {
        if (!prevLib) return null;

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

        return {
          ...prevLib,
          tree: updateNode(prevLib.tree),
          flatPlaylist: updatedFlat,
        };
      });
    },
    []
  );

  return {
    library,
    currentView,
    selectedFolderPath,
    selectedArtistName,
    selectedAlbumId,
    searchQuery,
    favourites,
    isLoading,
    scanProgress,
    needsPermission,
    currentFolderNode,
    displayedTracks,
    albums,
    artists,
    setCurrentView,
    selectFolder,
    selectArtist,
    selectAlbum,
    setSearchQuery,
    toggleFavourite,
    openFolderPicker,
    handleFallbackFolderSelect,
    handleOpenFilesSelect,
    handleFolderInput: handleFallbackFolderSelect,
    handleFilesInput: handleOpenFilesSelect,
    requestPermissionAndLoad,
    updateTrackStatus,
  };
}
