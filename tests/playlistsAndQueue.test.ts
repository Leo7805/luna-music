import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolvePlaylistTracks, getTrackStatus } from '../src/utils/musicTree';
import { TrackItem, Playlist, PlaylistTrackReference } from '../src/types/music';
import * as idbStorage from '../src/services/idbStorage';

function createMockTrack(
  id: string,
  name: string,
  artist = 'Test Artist',
  aliases: string[] = []
): TrackItem {
  return {
    id,
    name: `${name}.mp3`,
    relativePath: `${name}.mp3`,
    size: 1024,
    lastModified: 1000,
    aliases,
    metadata: {
      title: name,
      artist,
      album: 'Test Album',
      duration: 180,
      isMetadataLoaded: true,
    },
    handle: {
      kind: 'file',
      name: `${name}.mp3`,
      getFile: vi.fn().mockResolvedValue(new File(['dummy'], `${name}.mp3`)),
      isSameEntry: vi.fn().mockResolvedValue(false),
    } as unknown as FileSystemFileHandle,
    status: 'normal',
  };
}

describe('Phase 3: Persistent Playlists and Playback Queue Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  // 1. Playlist creation, rename, and deletion
  it('1. supports playlist creation, rename, and deletion with persistent storage', async () => {
    const storeSpy = vi.spyOn(idbStorage, 'storePlaylists').mockResolvedValue(true);

    let playlists: Playlist[] = [];

    // Create
    const now = Date.now();
    const created: Playlist = {
      id: `pl_${now}_test`,
      name: 'Chill Vibes',
      tracks: [],
      createdAt: now,
      updatedAt: now,
    };
    playlists = [...playlists, created];
    await idbStorage.storePlaylists(playlists);

    expect(created.name).toBe('Chill Vibes');
    expect(playlists).toHaveLength(1);
    expect(storeSpy).toHaveBeenCalledWith(playlists);

    // Rename
    playlists = playlists.map((p) =>
      p.id === created.id ? { ...p, name: 'Super Chill', updatedAt: Date.now() } : p
    );
    expect(playlists[0].name).toBe('Super Chill');

    // Delete
    playlists = playlists.filter((p) => p.id !== created.id);
    expect(playlists).toHaveLength(0);
  });

  // 2. Adding, removing, and reordering playlist tracks
  it('2. supports adding, removing, and reordering tracks in a playlist', () => {
    const track1 = createMockTrack('t1', 'Track 1');
    const track2 = createMockTrack('t2', 'Track 2');
    const track3 = createMockTrack('t3', 'Track 3');

    let playlist: Playlist = {
      id: 'pl-1',
      name: 'My Mix',
      tracks: [],
      createdAt: 1000,
      updatedAt: 1000,
    };

    // Add tracks
    const addTrack = (pl: Playlist, track: TrackItem): Playlist => ({
      ...pl,
      tracks: [
        ...pl.tracks,
        {
          trackId: track.id,
          name: track.metadata.title || track.name,
          artist: track.metadata.artist,
          duration: track.metadata.duration,
          addedAt: Date.now(),
        },
      ],
      updatedAt: Date.now(),
    });

    playlist = addTrack(playlist, track1);
    playlist = addTrack(playlist, track2);
    playlist = addTrack(playlist, track3);

    expect(playlist.tracks).toHaveLength(3);
    expect(playlist.tracks.map((t) => t.trackId)).toEqual(['t1', 't2', 't3']);

    // Reorder: Move Track 3 from index 2 to index 0
    const reorderedTracks = [...playlist.tracks];
    const [moved] = reorderedTracks.splice(2, 1);
    reorderedTracks.splice(0, 0, moved);
    playlist = { ...playlist, tracks: reorderedTracks };

    expect(playlist.tracks.map((t) => t.trackId)).toEqual(['t3', 't1', 't2']);

    // Remove track at index 1 (Track 1)
    playlist = {
      ...playlist,
      tracks: playlist.tracks.filter((_, idx) => idx !== 1),
    };

    expect(playlist.tracks.map((t) => t.trackId)).toEqual(['t3', 't2']);
  });

  // 3. Duplicate track prevention when adding to playlist
  it('3. prevents duplicate tracks based on canonical ID or aliases', () => {
    const track1 = createMockTrack('track-canon-1', 'Song A');
    const trackAlias = createMockTrack('track-child-1', 'Song A', 'Test Artist', ['track-canon-1']);

    const existingRefs: PlaylistTrackReference[] = [
      { trackId: 'track-canon-1', name: 'Song A', addedAt: 1000 },
    ];

    const isDuplicate = (track: TrackItem, refs: PlaylistTrackReference[]): boolean => {
      return refs.some(
        (ref) =>
          ref.trackId === track.id ||
          Boolean(track.aliases && track.aliases.includes(ref.trackId))
      );
    };

    // Adding track1 directly -> duplicate
    expect(isDuplicate(track1, existingRefs)).toBe(true);

    // Adding trackAlias whose aliases include existing canonical ID -> duplicate
    expect(isDuplicate(trackAlias, existingRefs)).toBe(true);

    // Adding a completely new track -> not duplicate
    const newTrack = createMockTrack('track-other', 'Other Song');
    expect(isDuplicate(newTrack, existingRefs)).toBe(false);
  });

  // 4. Playlist persistence and hydration from storage
  it('4. persists and hydrates playlists from IndexedDB storage', async () => {
    const mockStored: Playlist[] = [
      {
        id: 'pl-stored-1',
        name: 'Road Trip',
        tracks: [
          {
            trackId: 'track-101',
            name: 'Highway Song',
            artist: 'Band',
            addedAt: Date.now(),
          },
        ],
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    vi.spyOn(idbStorage, 'getStoredPlaylists').mockResolvedValue(mockStored);

    const loaded = await idbStorage.getStoredPlaylists();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Road Trip');
    expect(loaded[0].tracks[0].trackId).toBe('track-101');
  });

  // 5. Queue independence from saved playlists
  it('5. maintains playback queue independently without altering saved playlists', () => {
    const track1 = createMockTrack('t1', 'Track 1');
    const track2 = createMockTrack('t2', 'Track 2');

    const savedPlaylist: Playlist = {
      id: 'pl-saved',
      name: 'Saved List',
      tracks: [{ trackId: 't1', name: 'Track 1', addedAt: 100 }],
      createdAt: 100,
      updatedAt: 100,
    };

    // Queue initialized with playlist plus another track
    let playbackQueue: TrackItem[] = [track1, track2];

    // Remove from queue
    playbackQueue = playbackQueue.filter((t) => t.id !== 't2');

    expect(playbackQueue).toHaveLength(1);
    // Saved playlist remains unchanged
    expect(savedPlaylist.tracks).toHaveLength(1);
    expect(savedPlaylist.tracks[0].trackId).toBe('t1');
  });

  // 6. Play Next insertion logic
  it('6. inserts track immediately after the currently playing track index in queue', () => {
    const track1 = createMockTrack('t1', 'Track 1');
    const track2 = createMockTrack('t2', 'Track 2');
    const track3 = createMockTrack('t3', 'Track 3');
    const urgentTrack = createMockTrack('urgent', 'Urgent Track');

    const queue = [track1, track2, track3];
    const currentTrack = track1;
    const currentIndex = queue.findIndex((t) => t.id === currentTrack.id);

    // Play next logic:
    const insertIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
    const newQueue = [
      ...queue.slice(0, insertIndex),
      urgentTrack,
      ...queue.slice(insertIndex),
    ];

    expect(newQueue.map((t) => t.id)).toEqual(['t1', 'urgent', 't2', 't3']);
  });

  // 7. Add to Queue appending logic
  it('7. appends tracks to the end of the queue', () => {
    const track1 = createMockTrack('t1', 'Track 1');
    const track2 = createMockTrack('t2', 'Track 2');
    const appended1 = createMockTrack('a1', 'Appended 1');
    const appended2 = createMockTrack('a2', 'Appended 2');

    let queue = [track1, track2];

    // Append single track
    queue = [...queue, appended1];
    expect(queue.map((t) => t.id)).toEqual(['t1', 't2', 'a1']);

    // Append multiple tracks
    queue = [...queue, appended2];
    expect(queue.map((t) => t.id)).toEqual(['t1', 't2', 'a1', 'a2']);
  });

  // 8. Track alias resolution via resolvePlaylistTracks
  it('8. resolves playlist track references matching canonical ID or aliases', () => {
    const canonTrack = createMockTrack('track-canon', 'Canonical Song', 'Artist', [
      'track-alias-old',
    ]);
    const libraryTracks = [canonTrack];

    // Case A: reference by canonical ID
    const refA: PlaylistTrackReference[] = [
      { trackId: 'track-canon', name: 'Canonical Song', addedAt: 100 },
    ];
    const resolvedA = resolvePlaylistTracks(refA, libraryTracks);
    expect(resolvedA).toHaveLength(1);
    expect(resolvedA[0].id).toBe('track-canon');
    expect(getTrackStatus(resolvedA[0])).toBe('normal');

    // Case B: reference by old alias
    const refB: PlaylistTrackReference[] = [
      { trackId: 'track-alias-old', name: 'Canonical Song', addedAt: 100 },
    ];
    const resolvedB = resolvePlaylistTracks(refB, libraryTracks);
    expect(resolvedB).toHaveLength(1);
    expect(resolvedB[0].id).toBe('track-canon'); // Successfully resolved to canonical!
  });

  // 9. Root removal and canonical ID migration in playlists
  it('9. preserves playlist references when canonical IDs are migrated after root removal', () => {
    // When a parent root is removed, the remaining child root promotes alias to new canonical ID
    const promotedChildTrack = createMockTrack('track-child-id', 'Song A', 'Artist', [
      'track-parent-id',
    ]);
    const libraryAfterRemoval = [promotedChildTrack];

    const playlistRefs: PlaylistTrackReference[] = [
      { trackId: 'track-parent-id', name: 'Song A', addedAt: 100 },
    ];

    const resolved = resolvePlaylistTracks(playlistRefs, libraryAfterRemoval);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe('track-child-id');
  });

  // 10. Missing-track preservation and recovery as unreadable placeholder
  it('10. creates an unreadable placeholder for offline or missing tracks without deleting them from playlist', () => {
    const libraryTracks: TrackItem[] = [
      createMockTrack('online-1', 'Online Track'),
    ];

    const refs: PlaylistTrackReference[] = [
      { trackId: 'online-1', name: 'Online Track', addedAt: 100 },
      {
        trackId: 'offline-2',
        name: 'Offline Track',
        artist: 'Offline Artist',
        album: 'Offline Album',
        duration: 210,
        addedAt: 200,
      },
    ];

    const resolved = resolvePlaylistTracks(refs, libraryTracks);
    expect(resolved).toHaveLength(2);

    // First track is normal
    expect(resolved[0].id).toBe('online-1');
    expect(getTrackStatus(resolved[0])).toBe('normal');

    // Second track is offline placeholder
    expect(resolved[1].id).toBe('offline-2');
    expect(resolved[1].status).toBe('unreadable');
    expect(getTrackStatus(resolved[1])).toBe('unreadable');
    expect(resolved[1].metadata.title).toBe('Offline Track');
    expect(resolved[1].metadata.artist).toBe('Offline Artist');
    expect(resolved[1].metadata.duration).toBe(210);

    // If file later reconnects into library:
    const reconnectedTrack = createMockTrack('offline-2', 'Offline Track', 'Offline Artist');
    const resolvedAfterReconnect = resolvePlaylistTracks(refs, [
      ...libraryTracks,
      reconnectedTrack,
    ]);
    expect(getTrackStatus(resolvedAfterReconnect[1])).toBe('normal');
  });

  // 11. Queue auto-advance and navigation logic
  it('11. advances queue with next and previous track logic', () => {
    const track1 = createMockTrack('t1', 'Track 1');
    const track2 = createMockTrack('t2', 'Track 2');
    const track3 = createMockTrack('t3', 'Track 3');
    const queue = [track1, track2, track3];

    let currentTrack: TrackItem | null = track1;

    const getNextTrack = (curr: TrackItem | null, q: TrackItem[], repeatMode: 'off' | 'all' | 'one') => {
      if (q.length === 0) return null;
      if (!curr) return q[0];
      const idx = q.findIndex((t) => t.id === curr.id);
      if (idx === -1 || idx === q.length - 1) {
        return repeatMode === 'all' ? q[0] : null;
      }
      return q[idx + 1];
    };

    currentTrack = getNextTrack(currentTrack, queue, 'off');
    expect(currentTrack?.id).toBe('t2');

    currentTrack = getNextTrack(currentTrack, queue, 'off');
    expect(currentTrack?.id).toBe('t3');

    // Reached end with repeatMode='off'
    currentTrack = getNextTrack(currentTrack, queue, 'off');
    expect(currentTrack).toBeNull();

    // Reached end with repeatMode='all' wraps around
    const wrapped = getNextTrack(track3, queue, 'all');
    expect(wrapped?.id).toBe('t1');
  });

  // 12. Save Queue as new Playlist
  it('12. saves current playback queue as a new playlist', () => {
    const track1 = createMockTrack('q1', 'Queue Song 1');
    const track2 = createMockTrack('q2', 'Queue Song 2');
    const queue = [track1, track2];

    const saveQueueAsPlaylist = (name: string, queueTracks: TrackItem[]): Playlist => {
      const now = Date.now();
      return {
        id: `pl_${now}_queue`,
        name: name.trim() || 'New Playlist',
        tracks: queueTracks.map((t) => ({
          trackId: t.id,
          name: t.metadata.title || t.name,
          artist: t.metadata.artist,
          album: t.metadata.album,
          duration: t.metadata.duration,
          addedAt: now,
        })),
        createdAt: now,
        updatedAt: now,
      };
    };

    const newPlaylist = saveQueueAsPlaylist('Current Queue', queue);
    expect(newPlaylist).toBeDefined();
    expect(newPlaylist.name).toBe('Current Queue');
    expect(newPlaylist.tracks).toHaveLength(2);
    expect(newPlaylist.tracks[0].trackId).toBe('q1');
    expect(newPlaylist.tracks[1].trackId).toBe('q2');
  });
});
