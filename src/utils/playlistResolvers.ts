import { TrackItem, PlaylistTrackReference } from '../types/music';
import { getStoredPlaylists, storePlaylists } from '../services/idbStorage';
import { createTrackReferenceResolver } from './trackReferenceResolver';

/**
 * Updates stored playlists when tracks migrate to canonical IDs upon source removal.
 */
export async function migratePlaylistsTrackIds(idMigrations: Map<string, string>): Promise<void> {
  if (idMigrations.size === 0) return;
  try {
    const storedPlaylists = await getStoredPlaylists();
    let playlistsChanged = false;
    const updated = storedPlaylists.map((pl) => {
      let changed = false;
      const newTracks = pl.tracks.map((ref) => {
        if (idMigrations.has(ref.trackId)) {
          changed = true;
          return { ...ref, trackId: idMigrations.get(ref.trackId)! };
        }
        return ref;
      });
      if (changed) {
        playlistsChanged = true;
        return { ...pl, tracks: newTracks, updatedAt: Date.now() };
      }
      return pl;
    });
    if (playlistsChanged) {
      await storePlaylists(updated);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Resolves an ordered list of PlaylistTrackReferences against library tracks,
 * using the shared track reference resolver (canonical ID, verified aliases,
 * and unambiguous relativePath fallback).
 * Does not prematurely mutate persisted Playlist Track IDs on relativePath fallback.
 * If a track is unresolved or ambiguous, creates a placeholder TrackItem with
 * status 'unreadable' preserving its saved metadata and Playlist order.
 */
export function resolvePlaylistTracks(
  references: PlaylistTrackReference[],
  libraryTracks: TrackItem[]
): TrackItem[] {
  const resolver = createTrackReferenceResolver(libraryTracks);

  return references.map((ref) => {
    const { track } = resolver.resolve(ref.trackId, { allowRelativePathFallback: true });
    if (track) {
      return track;
    }

    // Source is offline, disconnected, or ambiguous: preserve entry with 'unreadable' status
    const placeholder: TrackItem = {
      id: ref.trackId,
      name: ref.name,
      relativePath: ref.name,
      size: 0,
      lastModified: ref.addedAt,
      status: 'unreadable',
      metadata: {
        title: ref.name,
        artist: ref.artist || 'Unknown Artist',
        album: ref.album || 'Unknown Album',
        duration: ref.duration || 0,
        isMetadataLoaded: true,
      },
    };
    return placeholder;
  });
}
