// @vitest-environment jsdom
import { act, StrictMode, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLibraryInitialization } from '../src/hooks/useLibraryInitialization';
import { useLibraryFavourites } from '../src/hooks/useLibraryFavourites';
import { usePlaylists } from '../src/hooks/usePlaylists';
import { MusicLibrary, StoredFolderRecord, TrackItem } from '../src/types/music';
import { buildFolderTree } from '../src/utils/musicTree';
import { resolvePlaylistTracks } from '../src/utils/playlistResolvers';
import { resolvePlayableAudioFile } from '../src/utils/audioSourceLoader';
import { storePlaylists, storePlaybackState } from '../src/services/idbStorage';

const mocks = vi.hoisted(() => ({ records: [] as StoredFolderRecord[], scan: vi.fn(), supported: true }));
vi.mock('../src/services/idbStorage', async importOriginal => ({
  ...await importOriginal<typeof import('../src/services/idbStorage')>(),
  getStoredRegisteredFolders: async () => mocks.records,
  storeRegisteredFolders: vi.fn(async records => { mocks.records = records; return true; }),
  getStoredImportedFiles: async () => [],
  getMetadataCache: async () => ({}),
}));
vi.mock('../src/services/directoryAccess', async importOriginal => ({
  ...await importOriginal<typeof import('../src/services/directoryAccess')>(),
  isFileSystemAccessSupported: () => mocks.supported,
  scanRootFolderHandle: mocks.scan,
}));
const song: TrackItem = { id: 'root:Nested/Song.mp3', name: 'Song.mp3', relativePath: 'Nested/Song.mp3',
  size: 10, lastModified: 1, status: 'normal', metadata: {
    title: 'Saved Song', artist: 'Artist', album: 'Album', duration: 123, isMetadataLoaded: true,
  } };
let library: MusicLibrary | null;
let initialization: ReturnType<typeof useLibraryInitialization>;
let favourites: ReturnType<typeof useLibraryFavourites>;
let playlists: ReturnType<typeof usePlaylists>;
const extract = vi.fn();
const loading = vi.fn();
function Harness() {
  const [current, setCurrent] = useState<MusicLibrary | null>(null);
  library = current;
  favourites = useLibraryFavourites({ flatPlaylist: current?.flatPlaylist ?? [] });
  playlists = usePlaylists();
  initialization = useLibraryInitialization({ library: current, onLibraryInitialized: setCurrent,
    onSetInitialFavourites: favourites.setInitialFavourites, startIncrementalMetadataExtraction: extract, setIsLoading: loading });
  return null;
}
let root: Root;
let host: HTMLDivElement;
let granted: boolean;
const mount = async () => { await act(async () => root.render(<StrictMode><Harness /></StrictMode>)); };
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  granted = false;
  const audioFile = new File(['test audio'], 'Song.mp3', { lastModified: 1 });
  song.handle = { getFile: vi.fn(async () => audioFile) } as unknown as FileSystemFileHandle;
  mocks.supported = true;
  mocks.records = [{ id: 'root', name: 'Root', sourceType: 'fs-access', trackCount: 1, addedAt: 1,
    handle: { queryPermission: async () => granted ? 'granted' : 'prompt',
      requestPermission: async () => { granted = true; return 'granted'; } } as unknown as FileSystemDirectoryHandle }];
  mocks.scan.mockReset().mockImplementation(async (handle, id) => ({
    ...mocks.records[0], id, handle, tracks: [{ ...song }], trackCount: 1,
    tree: buildFolderTree('Root', [song], id), permissionStatus: 'granted',
  }));
  host = document.createElement('div'); root = createRoot(host);
  await storePlaylists([{ id: 'pl', name: 'Saved', createdAt: 1, updatedAt: 1,
    tracks: [1, 2].map(addedAt => ({ trackId: song.id, name: 'Saved Song', artist: 'Artist', album: 'Album', duration: 123, addedAt })) }]);
  await storePlaybackState({ favourites: [song.id], favouriteSnapshots: {
    [song.id]: { trackId: song.id, name: 'Saved Song', artist: 'Artist', album: 'Album', duration: 123 },
  } });
});
afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals(); });

it('keeps registrations and saved metadata while permission is pending, then replaces the placeholder on restore', async () => {
  await mount();
  expect(initialization.needsPermission).toBe(true);
  expect(library?.folders).toHaveLength(1);
  expect(favourites.favouriteTracks[0].metadata.title).toBe('Saved Song');
  expect(resolvePlaylistTracks(playlists.playlists[0].tracks, []).map(t => t.metadata.title)).toEqual(['Saved Song', 'Saved Song']);
  await act(async () => initialization.requestPermissionAndLoad());
  expect(library?.folders).toHaveLength(1);
  expect(library?.folders[0].permissionStatus).toBe('granted');
  expect(initialization.needsPermission).toBe(false);
  expect(resolvePlaylistTracks(playlists.playlists[0].tracks, library!.flatPlaylist).map(t => t.status)).toEqual(['normal', 'normal']);
  expect(favourites.favouriteTracks[0].status).toBe('normal');
  const playable = await resolvePlayableAudioFile(favourites.favouriteTracks[0], () => true, {});
  expect(playable.file?.size).toBe(10);
  expect(song.handle!.getFile).toHaveBeenCalled();
  expect(mocks.records).toHaveLength(1);
});

it('restores persisted collections and stable track IDs on a fresh application mount', async () => {
  granted = true;
  await mount();
  expect(library?.flatPlaylist[0].id).toBe(song.id);
  act(() => root.unmount()); root = createRoot(host);
  await mount();
  expect(playlists.playlists[0].tracks.map(t => t.trackId)).toEqual([song.id, song.id]);
  expect(favourites.favourites.has(song.id)).toBe(true);
  expect(resolvePlaylistTracks(playlists.playlists[0].tracks, library!.flatPlaylist)[0].handle).toBe(song.handle);
});

it('preserves a registration after a startup scan failure and allows retry', async () => {
  granted = true;
  mocks.scan.mockRejectedValueOnce(new Error('Temporary read failure'));
  await mount();
  expect(library?.folders).toHaveLength(1);
  expect(initialization.needsPermission).toBe(true);
  await act(async () => initialization.requestPermissionAndLoad());
  expect(library?.flatPlaylist[0].id).toBe(song.id);
  expect(mocks.records).toHaveLength(1);
});

it.each([true, false])('preserves handleless registrations with FSA support %s', async supported => {
  mocks.supported = supported;
  mocks.records[0].handle = undefined;
  mocks.records[0].sourceType = 'input-fallback';
  await mount();
  expect(library?.folders[0].id).toBe('root');
  expect(initialization.pendingFolders).toHaveLength(1);
});

it('retains denied registrations and memberships after an unsuccessful recovery', async () => {
  mocks.records[0].handle = { queryPermission: async () => 'denied' } as unknown as FileSystemDirectoryHandle;
  await mount();
  await act(async () => initialization.requestPermissionAndLoad());
  expect(initialization.pendingFolders).toHaveLength(1);
  expect(playlists.playlists[0].tracks).toHaveLength(2);
  expect(favourites.favourites.has(song.id)).toBe(true);
});

it('handles no registered folders without clearing saved memberships', async () => {
  mocks.records = [];
  await mount();
  expect(initialization.isInitialized).toBe(true);
  expect(initialization.needsPermission).toBe(false);
  expect(library).toBeNull();
  expect(playlists.playlists[0].tracks).toHaveLength(2);
});

it('keeps pending sources and their order when only one of multiple folders is recovered', async () => {
  mocks.records.push({ ...mocks.records[0], id: 'other', name: 'Other', handle: {
    queryPermission: async () => 'denied',
  } as unknown as FileSystemDirectoryHandle });
  await mount();
  await act(async () => initialization.requestPermissionAndLoad());
  expect(library?.folders.map(folder => folder.id)).toEqual(['root', 'other']);
  expect(initialization.pendingFolders.map(folder => folder.id)).toEqual(['other']);
  expect(mocks.records.map(folder => folder.id)).toEqual(['root', 'other']);
});

it('keeps missing files in saved collections after a successful empty source scan', async () => {
  granted = true;
  mocks.scan.mockImplementation(async (handle, id) => ({ ...mocks.records[0], id, handle,
    tracks: [], trackCount: 0, tree: buildFolderTree('Root', [], id), permissionStatus: 'granted' }));
  await mount();
  expect(library?.folders).toHaveLength(1);
  expect(library?.flatPlaylist).toHaveLength(0);
  expect(playlists.playlists[0].tracks).toHaveLength(2);
  expect(favourites.favouriteTracks[0].metadata.title).toBe('Saved Song');
  expect(favourites.favouriteTracks[0].status).toBe('unreadable');
});

it('retains nested-source favourite IDs during recovery and removes the original record when toggled off', async () => {
  granted = true;
  await storePlaybackState({ favourites: ['old:Song.mp3'], favouriteSnapshots: {
    'old:Song.mp3': { trackId: 'old:Song.mp3', name: 'Saved Song' },
  } });
  await mount();
  expect(favourites.favouriteTracks[0].id).toBe(song.id);
  expect(favourites.favourites.has('old:Song.mp3')).toBe(true);
  act(() => favourites.toggleFavourite(song.id));
  expect(favourites.favouriteTracks).toHaveLength(0);
  act(() => root.unmount()); root = createRoot(host);
  await mount();
  expect(favourites.favourites.size).toBe(0);
});

it('bulk add avoids duplicate recovered favourites and bulk remove deletes the original saved IDs', async () => {
  granted = true;
  await storePlaybackState({ favourites: ['old:Song.mp3'] });
  await mount();
  act(() => favourites.addTracksToFavourites([song]));
  expect(favourites.favourites.size).toBe(1);
  act(() => favourites.removeTracksFromFavourites([song]));
  expect(favourites.favourites.size).toBe(0);
});
