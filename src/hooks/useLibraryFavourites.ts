import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FavouriteTrackSnapshot, TrackItem } from '../types/music';
import { storePlaybackState } from '../services/idbStorage';
import { resolveFavouriteTracks, isFavouriteTrack } from '../utils/musicTree';
import { createTrackReferenceResolver } from '../utils/trackReferenceResolver';
import { mergeFavouriteSnapshot } from '../utils/favouriteResolvers';

export interface UseLibraryFavouritesProps {
  initialFavourites?: Set<string>;
  initialSnapshots?: Record<string, FavouriteTrackSnapshot>;
  flatPlaylist: TrackItem[];
}

export interface UseLibraryFavouritesReturn {
  favourites: Set<string>;
  favouriteSnapshots: Record<string, FavouriteTrackSnapshot>;
  setFavourites: React.Dispatch<React.SetStateAction<Set<string>>>;
  setInitialFavourites: (
    favs: Set<string>,
    snapshots?: Record<string, FavouriteTrackSnapshot>
  ) => void;
  favouriteTracks: TrackItem[];
  favouritesCount: number;
  toggleFavourite: (trackId: string) => void;
  addTracksToFavourites: (tracks: TrackItem[]) => void;
  removeTracksFromFavourites: (tracks: TrackItem[]) => void;
  removeFavouritesForTrackIds: (trackIds: string[]) => void;
  migrateFavouritesOnRootRemoval: (idMigrations: Map<string, string>) => void;
}

/**
 * Hook to manage favourite tracks, lightweight display snapshots,
 * unavailable placeholder display, legacy ID resolution, and persistence.
 */
export function useLibraryFavourites({
  initialFavourites,
  initialSnapshots,
  flatPlaylist,
}: UseLibraryFavouritesProps): UseLibraryFavouritesReturn {
  const [favourites, setFavourites] = useState<Set<string>>(
    () => initialFavourites || new Set()
  );
  const [favouriteSnapshots, setFavouriteSnapshots] = useState<
    Record<string, FavouriteTrackSnapshot>
  >(() => initialSnapshots || {});
  const snapshotsRef = useRef<Record<string, FavouriteTrackSnapshot>>(favouriteSnapshots);
  snapshotsRef.current = favouriteSnapshots;

  const setInitialFavourites = useCallback(
    (favs: Set<string>, snapshots?: Record<string, FavouriteTrackSnapshot>) => {
      setFavourites(favs);
      if (snapshots && typeof snapshots === 'object') {
        snapshotsRef.current = snapshots;
        setFavouriteSnapshots(snapshots);
      }
    },
    []
  );

  // Resolve favourites against current flat library tracks (includes unavailable placeholders)
  const favouriteResolution = useMemo(
    () => resolveFavouriteTracks(flatPlaylist, favourites, favouriteSnapshots),
    [flatPlaylist, favourites, favouriteSnapshots]
  );

  const favouriteTracks = favouriteResolution.displayTracks;
  const favouritesCount = favouriteResolution.displayTracks.length;

  // Refresh lightweight display snapshots whenever resolved favourite tracks gain better metadata
  useEffect(() => {
    if (favouriteResolution.resolvedTracks.length === 0) return;
    const prevSnaps = snapshotsRef.current;
    let changed = false;
    const nextSnaps: Record<string, FavouriteTrackSnapshot> = { ...prevSnaps };

    for (const track of favouriteResolution.resolvedTracks) {
      const merged = mergeFavouriteSnapshot(prevSnaps[track.id], track);
      if (merged) {
        nextSnaps[track.id] = merged;
        changed = true;
      }
    }

    if (changed) {
      snapshotsRef.current = nextSnaps;
      setFavouriteSnapshots(nextSnaps);
      storePlaybackState({ favouriteSnapshots: nextSnaps });
    }
  }, [favouriteResolution.resolvedTracks]);

  // Auto-heal legacy or alias favourite IDs to canonical IDs without dropping unresolved IDs
  useEffect(() => {
    if (favouriteResolution.migratedMap.size > 0) {
      const nextSnaps: Record<string, FavouriteTrackSnapshot> = { ...snapshotsRef.current };
      let snapsChanged = false;

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
          if (nextSnaps[oldId]) {
            if (!nextSnaps[canonicalId]) {
              nextSnaps[canonicalId] = { ...nextSnaps[oldId], trackId: canonicalId };
            }
            delete nextSnaps[oldId];
            snapsChanged = true;
          }
        }
        if (changed) {
          if (snapsChanged) {
            snapshotsRef.current = nextSnaps;
            setFavouriteSnapshots(nextSnaps);
          }
          storePlaybackState({
            favourites: Array.from(next),
            ...(snapsChanged ? { favouriteSnapshots: nextSnaps } : {}),
          });
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

        const nextSnaps: Record<string, FavouriteTrackSnapshot> = { ...snapshotsRef.current };
        if (isFav) {
          // 1. Remove canonical ID and trackId
          next.delete(canonicalId);
          next.delete(trackId);
          delete nextSnaps[canonicalId];
          delete nextSnaps[trackId];

          // 2. Remove verified aliases of this logical track
          if (track?.aliases) {
            track.aliases.forEach((alias) => {
              next.delete(alias);
              delete nextSnaps[alias];
            });
          }

          // 3. Remove legacy relative-path key ONLY if it unambiguously belongs to this track
          if (track && flatPlaylist.length > 0) {
            const sameRelPathTracks = flatPlaylist.filter(
              (t) => t.relativePath === track.relativePath
            );
            if (sameRelPathTracks.length === 1) {
              next.delete(track.relativePath);
              delete nextSnaps[track.relativePath];
            }
          }

          // Remove recovered nested-source references without persisting heuristic aliases.
          if (track) {
            const resolver = createTrackReferenceResolver(flatPlaylist);
            for (const id of prev) {
              if (resolver.resolve(id, { allowRelativePathFallback: true,
                allowNestedPathFallback: true }).track?.id === track.id) {
                next.delete(id);
                delete nextSnaps[id];
              }
            }
          }

          // 4. Remove any legacy ID that was unambiguously migrated to this canonical track
          for (const [oldId, mappedCanonicalId] of favouriteResolution.migratedMap.entries()) {
            if (mappedCanonicalId === canonicalId) {
              next.delete(oldId);
              delete nextSnaps[oldId];
            }
          }
        } else {
          next.add(canonicalId);
          if (track) {
            const snap = mergeFavouriteSnapshot(nextSnaps[canonicalId], track);
            if (snap) nextSnaps[canonicalId] = snap;
          }
        }
        snapshotsRef.current = nextSnaps;
        setFavouriteSnapshots(nextSnaps);
        storePlaybackState({ favourites: Array.from(next), favouriteSnapshots: nextSnaps });
        return next;
      });
    },
    [flatPlaylist, favouriteResolution.migratedMap]
  );

  // Bulk add tracks to favourites
  const addTracksToFavourites = useCallback((tracks: TrackItem[]) => {
    setFavourites((prev) => {
      const next = new Set(prev);
      const nextSnaps: Record<string, FavouriteTrackSnapshot> = { ...snapshotsRef.current };
      let changed = false;
      for (const track of tracks) {
        const canonicalId = track.id;
        if (!isFavouriteTrack(track, next, flatPlaylist)) {
          next.add(canonicalId);
          changed = true;
        }
        const snap = mergeFavouriteSnapshot(nextSnaps[canonicalId], track);
        if (snap) {
          nextSnaps[canonicalId] = snap;
          changed = true;
        }
      }
      if (changed) {
        snapshotsRef.current = nextSnaps;
        setFavouriteSnapshots(nextSnaps);
        storePlaybackState({ favourites: Array.from(next), favouriteSnapshots: nextSnaps });
        return next;
      }
      return prev;
    });
  }, [flatPlaylist]);

  // Bulk remove tracks from favourites (works for both available tracks and unavailable placeholders)
  const removeTracksFromFavourites = useCallback((tracks: TrackItem[]) => {
    setFavourites((prev) => {
      const next = new Set(prev);
      const nextSnaps: Record<string, FavouriteTrackSnapshot> = { ...snapshotsRef.current };
      let changed = false;
      const selectedIds = new Set(tracks.map(track => track.id));
      const resolver = createTrackReferenceResolver(flatPlaylist);
      for (const id of prev) {
        const resolved = resolver.resolve(id, { allowRelativePathFallback: true, allowNestedPathFallback: true });
        if (resolved.track && selectedIds.has(resolved.track.id)) {
          next.delete(id);
          delete nextSnaps[id];
          changed = true;
        }
      }
      for (const track of tracks) {
        const canonicalId = track.id;
        if (next.has(canonicalId)) {
          next.delete(canonicalId);
          changed = true;
        }
        if (nextSnaps[canonicalId]) {
          delete nextSnaps[canonicalId];
          changed = true;
        }
        if (track.aliases) {
          for (const a of track.aliases) {
            if (next.has(a)) {
              next.delete(a);
              changed = true;
            }
            if (nextSnaps[a]) {
              delete nextSnaps[a];
              changed = true;
            }
          }
        }
      }
      if (changed) {
        snapshotsRef.current = nextSnaps;
        setFavouriteSnapshots(nextSnaps);
        storePlaybackState({ favourites: Array.from(next), favouriteSnapshots: nextSnaps });
        return next;
      }
      return prev;
    });
  }, [flatPlaylist]);

  // Remove favourites for specific track IDs
  const removeFavouritesForTrackIds = useCallback((trackIds: string[]) => {
    setFavourites((prev) => {
      let changed = false;
      const next = new Set(prev);
      const nextSnaps: Record<string, FavouriteTrackSnapshot> = { ...snapshotsRef.current };
      for (const trackId of trackIds) {
        if (next.has(trackId)) {
          next.delete(trackId);
          changed = true;
        }
        if (nextSnaps[trackId]) {
          delete nextSnaps[trackId];
          changed = true;
        }
      }
      if (changed) {
        snapshotsRef.current = nextSnaps;
        setFavouriteSnapshots(nextSnaps);
        storePlaybackState({ favourites: Array.from(next), favouriteSnapshots: nextSnaps });
        return next;
      }
      return prev;
    });
  }, []);

  // Migrate favourites and their snapshots when root removal promotes aliases
  const migrateFavouritesOnRootRemoval = useCallback(
    (idMigrations: Map<string, string>) => {
      if (idMigrations.size === 0) return;
      setFavourites((prev) => {
        const next = new Set(prev);
        const nextSnaps: Record<string, FavouriteTrackSnapshot> = { ...snapshotsRef.current };
        let snapsChanged = false;
        for (const [oldId, newId] of idMigrations.entries()) {
          if (next.has(oldId)) {
            next.delete(oldId);
            next.add(newId);
          }
          if (nextSnaps[oldId]) {
            if (!nextSnaps[newId]) {
              nextSnaps[newId] = { ...nextSnaps[oldId], trackId: newId };
            }
            delete nextSnaps[oldId];
            snapsChanged = true;
          }
        }
        if (snapsChanged) {
          snapshotsRef.current = nextSnaps;
          setFavouriteSnapshots(nextSnaps);
        }
        storePlaybackState({
          favourites: Array.from(next),
          ...(snapsChanged ? { favouriteSnapshots: nextSnaps } : {}),
        });
        return next;
      });
    },
    []
  );

  return {
    favourites,
    favouriteSnapshots,
    setFavourites,
    setInitialFavourites,
    favouriteTracks,
    favouritesCount,
    toggleFavourite,
    addTracksToFavourites,
    removeTracksFromFavourites,
    removeFavouritesForTrackIds,
    migrateFavouritesOnRootRemoval,
  };
}
