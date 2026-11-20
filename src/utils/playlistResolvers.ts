import { TrackItem, PlaylistTrackReference } from '../types/music';
import { getStoredPlaylists, storePlaylists } from '../services/idbStorage';

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
 * using canonical track IDs and aliases.
 * If a track is not currently loaded in the library (e.g. source folder disconnected or offline),
 * creates a placeholder TrackItem with status 'unreadable' preserving its metadata.
 */
export function resolvePlaylistTracks(
  references: PlaylistTrackReference[],
  libraryTracks: TrackItem[]
): TrackItem[] {
  const idMap = new Map<string, TrackItem>();
  for (const track of libraryTracks) {
    idMap.set(track.id, track);
    if (track.aliases) {
      for (const alias of track.aliases) {
        idMap.set(alias, track);
      }
    }
  }

  return references.map((ref) => {
    const matched = idMap.get(ref.trackId);
    if (matched) {
      return matched;
    }

    // Source is offline / disconnected: preserve entry with 'unreadable' status
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
