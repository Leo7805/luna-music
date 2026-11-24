import { TrackItem, PlaylistTrackReference } from '../types/music';
import { getStoredPlaylists, storePlaylists } from '../services/idbStorage';
import { createTrackReferenceResolver } from './trackReferenceResolver';
import { createUnavailableTrack } from './trackPlaceholders';

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
 * and unambiguous relativePath/nested-source recovery).
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
    const { track } = resolver.resolve(ref.trackId, { allowRelativePathFallback: true, allowNestedPathFallback: true });
    if (track) {
      return track;
    }

    // Source is offline, disconnected, or ambiguous: preserve entry with shared unavailable placeholder
    return createUnavailableTrack(ref);
  });
}
