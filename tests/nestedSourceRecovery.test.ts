import { expect, it } from 'vitest';
import { TrackItem, PlaylistTrackReference } from '../src/types/music';
import { createTrackReferenceResolver } from '../src/utils/trackReferenceResolver';
import { resolvePlaylistTracks } from '../src/utils/playlistResolvers';
import { resolveFavouriteTracks, isFavouriteTrack } from '../src/utils/favouriteResolvers';

const track = (path: string, root = 'parent'): TrackItem => ({
  id: `${root}:${path}`, name: path.split('/').at(-1)!, relativePath: path, size: 10, lastModified: 1,
  status: 'normal', metadata: { title: 'Saved Song', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
});
const ref = (trackId: string): PlaylistTrackReference => ({ trackId, name: 'Saved Song', addedAt: 1 });

it('recovers saved references after importing a parent folder, preserving playlist duplicates and saved IDs', () => {
  const current = track('周杰伦/东风破.flac');
  const savedId = 'old:东风破.flac';
  const refs = [ref(savedId), ref(savedId)];
  expect(resolvePlaylistTracks(refs, [current])).toEqual([current, current]);
  expect(refs.map(r => r.trackId)).toEqual([savedId, savedId]);
  const result = resolveFavouriteTracks([current], new Set([savedId]));
  expect(result.displayTracks).toEqual([current]);
  expect(result.migratedMap.size).toBe(0);
  expect(isFavouriteTrack(current, new Set([savedId]), [current])).toBe(true);
});

it('recovers references after reopening a nested child as its own source', () => {
  const current = track('Album/Song.mp3', 'child');
  expect(resolvePlaylistTracks([ref('old:Music/Album/Song.mp3')], [current])).toEqual([current]);
});

it('retains unavailable entries when more than one source matches the saved path', () => {
  const first = track('A/Song.mp3');
  const second = track('B/Song.mp3');
  const refs = [ref('old:Song.mp3'), ref('old:Song.mp3')];
  expect(resolvePlaylistTracks(refs, [first, second]).map(t => t.status)).toEqual(['unreadable', 'unreadable']);
  expect(resolveFavouriteTracks([first, second], new Set(['old:Song.mp3'])).unresolvedIds).toEqual(['old:Song.mp3']);
});

it('keeps exact IDs and verified aliases ahead of nested path recovery', () => {
  const canonical = { ...track('A/Song.mp3'), aliases: ['old:Song.mp3'] };
  const other = track('B/Song.mp3');
  expect(resolvePlaylistTracks([ref('old:Song.mp3')], [canonical, other])).toEqual([canonical]);
});

it('does not match unrelated directory paths or partial filenames', () => {
  const current = track('A/Song.mp3');
  expect(resolvePlaylistTracks([ref('old:B/Song.mp3')], [current])[0].status).toBe('unreadable');
  expect(resolvePlaylistTracks([ref('old:ong.mp3')], [current])[0].status).toBe('unreadable');
});

it('does not enable nested path recovery for playback session resolution by default', () => {
  expect(createTrackReferenceResolver([track('A/Song.mp3')]).resolve('old:Song.mp3', {
    allowRelativePathFallback: true,
  }).track).toBeNull();
});

it('does not substitute a nested-path candidate for a missing file in a still-present source', () => {
  const sameSource = track('Other.mp3', 'old');
  const candidate = track('Nested/Song.mp3', 'new');
  expect(resolvePlaylistTracks([ref('old:Song.mp3')], [sameSource, candidate])[0].status).toBe('unreadable');
});
