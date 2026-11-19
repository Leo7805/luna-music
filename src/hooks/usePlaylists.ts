import { useState, useEffect, useCallback, useMemo } from 'react';
import { Playlist, TrackItem, PlaylistTrackReference } from '../types/music';
import { getStoredPlaylists, storePlaylists } from '../services/idbStorage';

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  // Load playlists on mount
  useEffect(() => {
    let isMounted = true;
    getStoredPlaylists().then((stored) => {
      if (isMounted && stored) {
        setPlaylists(stored);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const selectedPlaylist = useMemo(() => {
    if (!selectedPlaylistId) return null;
    return playlists.find((p) => p.id === selectedPlaylistId) || null;
  }, [playlists, selectedPlaylistId]);

  // Create a new playlist
  const createPlaylist = useCallback((name: string, initialTracks: TrackItem[] = []): Playlist => {
    const trimmed = name.trim() || 'New Playlist';
    const now = Date.now();
    const id = `pl_${now}_${Math.random().toString(36).substring(2, 7)}`;

    // Map initial tracks preventing duplicates
    const seenIds = new Set<string>();
    const trackRefs: PlaylistTrackReference[] = [];

    for (const track of initialTracks) {
      if (!seenIds.has(track.id)) {
        seenIds.add(track.id);
        trackRefs.push({
          trackId: track.id,
          name: track.metadata.title || track.name,
          artist: track.metadata.artist,
          album: track.metadata.album,
          duration: track.metadata.duration,
          addedAt: now,
        });
      }
    }

    const newPlaylist: Playlist = {
      id,
      name: trimmed,
      tracks: trackRefs,
      createdAt: now,
      updatedAt: now,
    };

    setPlaylists((prev) => {
      const next = [...prev, newPlaylist];
      storePlaylists(next);
      return next;
    });

    return newPlaylist;
  }, []);

  // Rename an existing playlist
  const renamePlaylist = useCallback((playlistId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    setPlaylists((prev) => {
      const next = prev.map((p) =>
        p.id === playlistId ? { ...p, name: trimmed, updatedAt: Date.now() } : p
      );
      storePlaylists(next);
      return next;
    });
  }, []);

  // Delete a playlist
  const deletePlaylist = useCallback((playlistId: string) => {
    setPlaylists((prev) => {
      const next = prev.filter((p) => p.id !== playlistId);
      storePlaylists(next);
      return next;
    });

    setSelectedPlaylistId((prev) => (prev === playlistId ? null : prev));
  }, []);

  // Add track to playlist (prevents duplicates by default)
  const addTrackToPlaylist = useCallback((playlistId: string, track: TrackItem): boolean => {
    let wasAdded = false;

    setPlaylists((prev) => {
      const target = prev.find((p) => p.id === playlistId);
      if (!target) return prev;

      // Duplicate check: checks track.id and aliases
      const isDuplicate = target.tracks.some(
        (ref) =>
          ref.trackId === track.id ||
          (track.aliases && track.aliases.includes(ref.trackId))
      );

      if (isDuplicate) {
        return prev;
      }

      wasAdded = true;
      const newRef: PlaylistTrackReference = {
        trackId: track.id,
        name: track.metadata.title || track.name,
        artist: track.metadata.artist,
        album: track.metadata.album,
        duration: track.metadata.duration,
        addedAt: Date.now(),
      };

      const next = prev.map((p) =>
        p.id === playlistId
          ? { ...p, tracks: [...p.tracks, newRef], updatedAt: Date.now() }
          : p
      );

      storePlaylists(next);
      return next;
    });

    return wasAdded;
  }, []);

  // Remove track from playlist
  const removeTrackFromPlaylist = useCallback(
    (playlistId: string, trackId: string, index?: number) => {
      setPlaylists((prev) => {
        const next = prev.map((p) => {
          if (p.id !== playlistId) return p;

          let newTracks: PlaylistTrackReference[];
          if (index !== undefined && index >= 0 && index < p.tracks.length) {
            newTracks = p.tracks.filter((_, idx) => idx !== index);
          } else {
            newTracks = p.tracks.filter((ref) => ref.trackId !== trackId);
          }

          return { ...p, tracks: newTracks, updatedAt: Date.now() };
        });

        storePlaylists(next);
        return next;
      });
    },
    []
  );

  // Reorder playlist tracks
  const reorderPlaylistTracks = useCallback(
    (playlistId: string, fromIndex: number, toIndex: number) => {
      setPlaylists((prev) => {
        const target = prev.find((p) => p.id === playlistId);
        if (
          !target ||
          fromIndex < 0 ||
          fromIndex >= target.tracks.length ||
          toIndex < 0 ||
          toIndex >= target.tracks.length ||
          fromIndex === toIndex
        ) {
          return prev;
        }

        const nextTracks = [...target.tracks];
        const [moved] = nextTracks.splice(fromIndex, 1);
        nextTracks.splice(toIndex, 0, moved);

        const next = prev.map((p) =>
          p.id === playlistId ? { ...p, tracks: nextTracks, updatedAt: Date.now() } : p
        );

        storePlaylists(next);
        return next;
      });
    },
    []
  );

  // Save current queue as a new playlist
  const saveQueueAsPlaylist = useCallback(
    (name: string, queueTracks: TrackItem[]): Playlist => {
      const pl = createPlaylist(name, queueTracks);
      setSelectedPlaylistId(pl.id);
      return pl;
    },
    [createPlaylist]
  );

  return {
    playlists,
    selectedPlaylistId,
    selectedPlaylist,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    reorderPlaylistTracks,
    saveQueueAsPlaylist,
    selectPlaylist: setSelectedPlaylistId,
    setPlaylists,
  };
}
