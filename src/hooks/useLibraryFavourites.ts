import { useState, useEffect, useMemo, useCallback } from 'react';
import { TrackItem } from '../types/music';
import { storePlaybackState } from '../services/idbStorage';
import { resolveFavouriteTracks, isFavouriteTrack } from '../utils/musicTree';

export interface UseLibraryFavouritesProps {
  initialFavourites?: Set<string>;
  flatPlaylist: TrackItem[];
}

export interface UseLibraryFavouritesReturn {
  favourites: Set<string>;
  setFavourites: React.Dispatch<React.SetStateAction<Set<string>>>;
  favouriteTracks: TrackItem[];
  favouritesCount: number;
  toggleFavourite: (trackId: string) => void;
  addTracksToFavourites: (tracks: TrackItem[]) => void;
  removeTracksFromFavourites: (tracks: TrackItem[]) => void;
  removeFavouritesForTrackIds: (trackIds: string[]) => void;
  migrateFavouritesOnRootRemoval: (idMigrations: Map<string, string>) => void;
}

/**
 * Hook to manage favourite tracks, legacy ID resolution, auto-healing, and persistence.
 */
export function useLibraryFavourites({
  initialFavourites,
  flatPlaylist,
}: UseLibraryFavouritesProps): UseLibraryFavouritesReturn {
  const [favourites, setFavourites] = useState<Set<string>>(
    () => initialFavourites || new Set()
  );

  // Resolve favourites against current flat library tracks
  const favouriteResolution = useMemo(() => {
    if (flatPlaylist.length === 0) {
      return {
        resolvedTracks: [],
        unresolvedIds: Array.from(favourites),
        migratedMap: new Map<string, string>(),
      };
    }
    return resolveFavouriteTracks(flatPlaylist, favourites);
  }, [flatPlaylist, favourites]);

  const favouriteTracks = favouriteResolution.resolvedTracks;
  const favouritesCount = favouriteTracks.length;

  // Auto-heal legacy or alias favourite IDs to canonical IDs without dropping unresolved IDs
  useEffect(() => {
    if (favouriteResolution.migratedMap.size > 0) {
      setFavourites((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const [oldId, canonicalId] of favouriteResolution.migratedMap.entries()) {
          if (next.has(oldId)) {
            next.delete(oldId);
            changed = true;
          }
          if (!next.has(canonicalId)) {
            next.add(canonicalId);
            changed = true;
          }
        }
        if (changed) {
          storePlaybackState({ favourites: Array.from(next) });
          return next;
        }
        return prev;
      });
    }
  }, [favouriteResolution.migratedMap]);

  // Toggle single favourite track
  const toggleFavourite = useCallback(
    (trackId: string) => {
      let track = flatPlaylist.find(
        (t) => t.id === trackId || (t.aliases && t.aliases.includes(trackId))
      );
      if (!track && flatPlaylist.length > 0) {
        // Fallback for legacy bare relative path (without folder prefix) only if unambiguous
        const candidates = flatPlaylist.filter((t) => t.relativePath === trackId);
        if (candidates.length === 1) {
          track = candidates[0];
        }
      }
      const canonicalId = track ? track.id : trackId;

      setFavourites((prev) => {
        const next = new Set(prev);
        const isFav = track
          ? isFavouriteTrack(track, next, flatPlaylist)
          : next.has(trackId);

        if (isFav) {
          // 1. Remove canonical ID and trackId
          next.delete(canonicalId);
          next.delete(trackId);

          // 2. Remove verified aliases of this logical track
          if (track?.aliases) {
            track.aliases.forEach((alias) => next.delete(alias));
          }

          // 3. Remove legacy relative-path key ONLY if it unambiguously belongs to this track
          if (track && flatPlaylist.length > 0) {
            const sameRelPathTracks = flatPlaylist.filter(
              (t) => t.relativePath === track.relativePath
            );
            if (sameRelPathTracks.length === 1) {
              next.delete(track.relativePath);
            }
          }

          // 4. Remove any legacy ID that was unambiguously migrated to this canonical track
          for (const [oldId, mappedCanonicalId] of favouriteResolution.migratedMap.entries()) {
            if (mappedCanonicalId === canonicalId) {
              next.delete(oldId);
            }
          }
        } else {
          next.add(canonicalId);
        }
        storePlaybackState({ favourites: Array.from(next) });
        return next;
      });
    },
    [flatPlaylist, favouriteResolution.migratedMap]
  );

  // Bulk add tracks to favourites
  const addTracksToFavourites = useCallback((tracks: TrackItem[]) => {
    setFavourites((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const track of tracks) {
        const canonicalId = track.id;
        if (!next.has(canonicalId)) {
          next.add(canonicalId);
          changed = true;
        }
      }
      if (changed) {
        storePlaybackState({ favourites: Array.from(next) });
        return next;
      }
      return prev;
    });
  }, []);

  // Bulk remove tracks from favourites
  const removeTracksFromFavourites = useCallback((tracks: TrackItem[]) => {
    setFavourites((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const track of tracks) {
        const canonicalId = track.id;
        if (next.has(canonicalId)) {
          next.delete(canonicalId);
          changed = true;
        }
        if (track.aliases) {
          for (const a of track.aliases) {
            if (next.has(a)) {
              next.delete(a);
              changed = true;
            }
          }
        }
      }
      if (changed) {
        storePlaybackState({ favourites: Array.from(next) });
        return next;
      }
      return prev;
    });
  }, []);

  // Remove favourites for specific track IDs (e.g., when imported files are removed)
  const removeFavouritesForTrackIds = useCallback((trackIds: string[]) => {
    setFavourites((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const trackId of trackIds) {
        if (next.has(trackId)) {
          next.delete(trackId);
          changed = true;
        }
      }
      if (changed) {
        storePlaybackState({ favourites: Array.from(next) });
        return next;
      }
      return prev;
    });
  }, []);

  // Migrate favourites when root removal promotes aliases
  const migrateFavouritesOnRootRemoval = useCallback(
    (idMigrations: Map<string, string>) => {
      if (idMigrations.size === 0) return;
      setFavourites((prev) => {
        const next = new Set(prev);
        for (const [oldId, newId] of idMigrations.entries()) {
          if (next.has(oldId)) {
            next.delete(oldId);
            next.add(newId);
          }
        }
        storePlaybackState({ favourites: Array.from(next) });
        return next;
      });
    },
    []
  );

  return {
    favourites,
    setFavourites,
    favouriteTracks,
    favouritesCount,
    toggleFavourite,
    addTracksToFavourites,
    removeTracksFromFavourites,
    removeFavouritesForTrackIds,
    migrateFavouritesOnRootRemoval,
  };
}
