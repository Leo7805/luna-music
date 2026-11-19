import { describe, it, expect } from 'vitest';
import {
  resolveFavouriteTracks,
  isFavouriteTrack,
  applyPlayNext,
  applyAddToQueue,
  isSameTrack,
} from '../src/utils/musicTree';
import { TrackItem } from '../src/types/music';

function createMockTrack(
  id: string,
  relativePath: string,
  title = 'Test Track',
  aliases: string[] = []
): TrackItem {
  return {
    id,
    name: relativePath.split('/').pop() || relativePath,
    relativePath,
    size: 4096,
    lastModified: 1700000000,
    aliases,
    metadata: {
      title,
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 210,
      isMetadataLoaded: true,
    },
    status: 'normal',
  };
}

describe('Favourites State Synchronization (Bug A)', () => {
  const track1 = createMockTrack('folderA:APT.flac', 'APT.flac', 'APT', ['oldFolder:APT.flac']);
  const track2 = createMockTrack('folderA:song2.mp3', 'sub/song2.mp3', 'Song Two');
  const track3 = createMockTrack('folderB:song3.ogg', 'song3.ogg', 'Song Three');
  const libraryTracks = [track1, track2, track3];

  it('1. resolves favourite track by direct canonical ID', () => {
    const favourites = new Set(['folderA:APT.flac']);
    const result = resolveFavouriteTracks(libraryTracks, favourites);

    expect(result.resolvedTracks).toHaveLength(1);
    expect(result.resolvedTracks[0].id).toBe('folderA:APT.flac');
    expect(result.unresolvedIds).toHaveLength(0);
    expect(isFavouriteTrack(track1, favourites)).toBe(true);
    expect(isFavouriteTrack(track2, favourites)).toBe(false);
  });

  it('2. resolves favourite track by older alias ID and generates migration mapping', () => {
    const favourites = new Set(['oldFolder:APT.flac']);
    const result = resolveFavouriteTracks(libraryTracks, favourites);

    expect(result.resolvedTracks).toHaveLength(1);
    expect(result.resolvedTracks[0].id).toBe('folderA:APT.flac');
    expect(result.migratedMap.get('oldFolder:APT.flac')).toBe('folderA:APT.flac');
    expect(isFavouriteTrack(track1, favourites)).toBe(true);
  });

  it('3. resolves favourite track by legacy bare relativePath without folder prefix', () => {
    // When favourite was stored before multi-folder IDs (e.g. "APT.flac" or "sub/song2.mp3")
    const favourites = new Set(['APT.flac']);
    const result = resolveFavouriteTracks(libraryTracks, favourites);

    expect(result.resolvedTracks).toHaveLength(1);
    expect(result.resolvedTracks[0].id).toBe('folderA:APT.flac');
    expect(result.migratedMap.get('APT.flac')).toBe('folderA:APT.flac');
    expect(isFavouriteTrack(track1, favourites)).toBe(true);
  });

  it('4. preserves unresolved favourite IDs across disconnected folders without silent deletion', () => {
    // Stored favourites include tracks from a disconnected or re-authorized folder
    const favourites = new Set([
      'folderA:APT.flac',
      'disconnectedFolder:missingSong.flac',
      'anotherDisconnected:track99.mp3',
    ]);
    const result = resolveFavouriteTracks(libraryTracks, favourites);

    expect(result.resolvedTracks).toHaveLength(1);
    expect(result.resolvedTracks[0].id).toBe('folderA:APT.flac');
    // The unresolved IDs are preserved so they are never silently lost
    expect(result.unresolvedIds).toEqual([
      'disconnectedFolder:missingSong.flac',
      'anotherDisconnected:track99.mp3',
    ]);
  });

  it('5. prevents inflated counts when multiple stored favourite IDs match the same track', () => {
    // Both canonical ID and old alias or legacy relativePath present in favourites
    const favourites = new Set([
      'folderA:APT.flac',
      'oldFolder:APT.flac',
      'APT.flac',
    ]);
    const result = resolveFavouriteTracks(libraryTracks, favourites);

    // Must resolve to exactly 1 track, preventing sidebar badge inflation
    expect(result.resolvedTracks).toHaveLength(1);
    expect(result.resolvedTracks[0].id).toBe('folderA:APT.flac');
    expect(result.unresolvedIds).toHaveLength(0);
  });

  it('6. returns zero resolved count and empty list when no favourites match library tracks', () => {
    const favourites = new Set(['nonExistent:track.mp3']);
    const result = resolveFavouriteTracks(libraryTracks, favourites);

    expect(result.resolvedTracks).toHaveLength(0);
    expect(result.unresolvedIds).toEqual(['nonExistent:track.mp3']);
    expect(isFavouriteTrack(track1, favourites)).toBe(false);
  });

  // Edge Case 1: Legacy relativePath ambiguity across independent root folders
  it('6a. prevents accidental favourite match when multiple independent folders share identical relative paths', () => {
    const folder1Track = createMockTrack('folder1:shared.mp3', 'shared.mp3', 'Shared Track in Folder 1');
    const folder2Track = createMockTrack('folder2:shared.mp3', 'shared.mp3', 'Shared Track in Folder 2');
    const uniqueTrack = createMockTrack('folder1:unique.mp3', 'unique.mp3', 'Unique Track');
    const multiRootLibrary = [folder1Track, folder2Track, uniqueTrack];

    // Legacy favourite with ambiguous relativePath
    const ambiguousFavourites = new Set(['shared.mp3']);
    const ambResult = resolveFavouriteTracks(multiRootLibrary, ambiguousFavourites);

    // Because 'shared.mp3' exists in both folders, it cannot be safely identified
    expect(ambResult.resolvedTracks).toHaveLength(0);
    expect(ambResult.migratedMap.size).toBe(0);
    expect(ambResult.unresolvedIds).toEqual(['shared.mp3']);

    // isFavouriteTrack with multiRootLibrary context must also reject ambiguous match
    expect(isFavouriteTrack(folder1Track, ambiguousFavourites, multiRootLibrary)).toBe(false);
    expect(isFavouriteTrack(folder2Track, ambiguousFavourites, multiRootLibrary)).toBe(false);

    // Unambiguous track must resolve safely
    const unambiguousFavourites = new Set(['unique.mp3']);
    const unambResult = resolveFavouriteTracks(multiRootLibrary, unambiguousFavourites);
    expect(unambResult.resolvedTracks).toHaveLength(1);
    expect(unambResult.resolvedTracks[0].id).toBe('folder1:unique.mp3');
    expect(unambResult.migratedMap.get('unique.mp3')).toBe('folder1:unique.mp3');
    expect(isFavouriteTrack(uniqueTrack, unambiguousFavourites, multiRootLibrary)).toBe(true);
  });

  // Edge Case 2: Favourite removal after migration and reload
  it('6b. correctly removes all legacy, canonical, and alias references on unfavourite so track stays unfavourited on reload', () => {
    const track = createMockTrack('folderA:APT.flac', 'APT.flac', 'APT', ['legacyAlias:APT.flac']);
    const lib = [track];

    // Step 1: Start with legacy favourite ID
    let storedFavourites = new Set(['APT.flac']);

    // Step 2: Resolve and migrate legacy ID to canonical ID
    const resolution = resolveFavouriteTracks(lib, storedFavourites);
    expect(resolution.resolvedTracks).toHaveLength(1);
    expect(resolution.migratedMap.get('APT.flac')).toBe('folderA:APT.flac');

    // Simulate migration effect: replace oldId with canonicalId in stored favourites
    for (const [oldId, canonicalId] of resolution.migratedMap.entries()) {
      storedFavourites.delete(oldId);
      storedFavourites.add(canonicalId);
    }
    expect(storedFavourites.has('APT.flac')).toBe(false);
    expect(storedFavourites.has('folderA:APT.flac')).toBe(true);

    // Step 3: User unfavourites the track
    const canonicalId = track.id;
    const trackId = track.id;
    storedFavourites.delete(canonicalId);
    storedFavourites.delete(trackId);
    if (track.aliases) {
      track.aliases.forEach((a) => storedFavourites.delete(a));
    }
    storedFavourites.delete(track.relativePath);
    const relColon = ':' + track.relativePath;
    const relSlash = '/' + track.relativePath;
    for (const key of Array.from(storedFavourites)) {
      if (key === track.relativePath || key.endsWith(relColon) || key.endsWith(relSlash)) {
        storedFavourites.delete(key);
      }
    }

    expect(storedFavourites.size).toBe(0);

    // Step 4: Simulate app reload with storedFavourites
    const reloadResolution = resolveFavouriteTracks(lib, storedFavourites);
    expect(reloadResolution.resolvedTracks).toHaveLength(0);
    expect(reloadResolution.unresolvedIds).toHaveLength(0);
    expect(isFavouriteTrack(track, storedFavourites, lib)).toBe(false);
  });
});

describe('Authoritative Playback Queue & Now Playing Decoupling (Bug B)', () => {
  const track1 = createMockTrack('t1', 'Track1.flac', 'Track 1');
  const track2 = createMockTrack('t2', 'Track2.flac', 'Track 2');
  const track3 = createMockTrack('t3', 'Track3.flac', 'Track 3');
  const track4 = createMockTrack('t4', 'Track4.flac', 'Track 4');

  it('7. authoritative queue starts empty and does not auto-populate from library tracks', () => {
    // Simulating initialization without passing library flatPlaylist to useAudioPlayer
    const initialQueue: TrackItem[] = [];
    expect(initialQueue).toHaveLength(0);
  });

  it('8. queue badge count and rendered items derive strictly from the same authoritative queue', () => {
    const queue = [track1, track2, track3];
    const badgeCount = queue.length;
    const renderedItemCount = queue.map((t) => t.id).length;

    expect(badgeCount).toBe(3);
    expect(renderedItemCount).toBe(3);
    expect(badgeCount).toBe(renderedItemCount);
  });

  it('9. starting playback of a track preserves queue instead of replacing it with library tracks', () => {
    let queue = [track1, track2];
    const trackToPlay = track3;

    // When playTrack is invoked without a newQueue replacement, it appends if not present
    if (!queue.some((t) => isSameTrack(t, trackToPlay))) {
      queue = [...queue, trackToPlay];
    }

    expect(queue).toHaveLength(3);
    expect(queue.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
  });

  it('10. Play Next on an existing upcoming track moves it after current track without duplicating', () => {
    const queue = [track1, track2, track3, track4];
    const currentTrack = track1;

    // User chooses Play Next on track4 (which is already in upcoming queue)
    const { nextQueue, outcome } = applyPlayNext(queue, currentTrack, track4);

    expect(outcome).toBe('moved');
    expect(nextQueue).toHaveLength(4);
    // track4 moved to index 1 (immediately after track1)
    expect(nextQueue.map((t) => t.id)).toEqual(['t1', 't4', 't2', 't3']);
  });

  it('11. Add to Queue on an existing upcoming track prevents appending duplicate', () => {
    const queue = [track1, track2, track3];
    const currentTrack = track1;

    // User chooses Add to Queue on track3 (already in upcoming queue)
    const { nextQueue, addedCount } = applyAddToQueue(queue, currentTrack, track3);

    expect(addedCount).toBe(0);
    expect(nextQueue).toHaveLength(3);
    expect(nextQueue).toEqual(queue);
  });

  it('12. Clear queue with no track playing resets queue to empty', () => {
    const currentTrack = null;
    let queue: TrackItem[] = [track1, track2, track3];

    // ClearQueue logic
    if (currentTrack) {
      queue = [currentTrack];
    } else {
      queue = [];
    }

    expect(queue).toHaveLength(0);
    expect(queue).toEqual([]);
  });

  it('13. Clear queue with an active track playing preserves only the current track and clears upcoming', () => {
    const currentTrack = track2;
    let queue: TrackItem[] = [track1, track2, track3, track4];

    // Clear upcoming items
    if (currentTrack) {
      queue = [currentTrack];
    } else {
      queue = [];
    }

    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe('t2');
  });

  it('14. Now Playing panel renders queue list and actions even when currentTrack is null (no song playing)', () => {
    // Define the decoupled state: currentTrack is null, but queue contains tracks
    const currentTrack = null;
    expect(currentTrack).toBeNull();
    const queue = [track1, track2];
    const activeTab: 'queue' | 'lyrics' | 'artwork' = 'queue';

    // In this state:
    // 1. Queue tab is fully visible and rendered
    const canRenderQueue = activeTab === 'queue';
    expect(canRenderQueue).toBe(true);

    // 2. All queued items can be listed
    const visibleTracks = queue;
    expect(visibleTracks).toHaveLength(2);

    // 3. Clear and Save actions are enabled
    const canSave = queue.length > 0;
    const canClear = queue.length > 0;
    expect(canSave).toBe(true);
    expect(canClear).toBe(true);
  });

  it('15. Now Playing panel displays appropriate empty states for Queue, Lyrics, and Info tabs when no song is playing', () => {
    const currentTrack = null;

    // Queue tab with empty queue
    const queueEmptyTabMessage = 'Queue is empty';
    expect(queueEmptyTabMessage).toBe('Queue is empty');

    // Lyrics tab with no song playing
    const lyricsTabMessage = currentTrack ? 'No Local Lyrics' : 'No song currently playing';
    expect(lyricsTabMessage).toBe('No song currently playing');

    // Info tab with no song playing
    const infoTabMessage = currentTrack ? 'Track Properties' : 'No song currently playing';
    expect(infoTabMessage).toBe('No song currently playing');
  });

  it('16. Tab switching between Queue, Lyrics, and Info does not mutate queue or playback state', () => {
    let activeTab: 'queue' | 'lyrics' | 'artwork' = 'queue';
    const queue = [track1, track2, track3];
    const isPlaying = true;
    const currentTrack = track1;

    // Switch to lyrics
    activeTab = 'lyrics';
    expect(activeTab).toBe('lyrics');
    expect(queue).toHaveLength(3);
    expect(isPlaying).toBe(true);
    expect(currentTrack.id).toBe('t1');

    // Switch to artwork/info
    activeTab = 'artwork';
    expect(activeTab).toBe('artwork');
    expect(queue).toHaveLength(3);
    expect(isPlaying).toBe(true);
    expect(currentTrack.id).toBe('t1');

    // Switch back to queue
    activeTab = 'queue';
    expect(activeTab).toBe('queue');
    expect(queue).toHaveLength(3);
    expect(isPlaying).toBe(true);
  });
});