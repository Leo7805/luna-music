import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_AUDIO_EXTENSIONS,
  isSupportedAudioFile,
  isLrcFile,
  getMimeTypeForFilename,
  isFormatSupportedByBrowser,
  getTrackStatus,
  isTrackPlayable,
  stripExtension,
} from '../src/utils/audioFileTypes';
import {
  isSameTrack,
  reconcileOverlappingTracks,
  combineFlatPlaylists,
} from '../src/utils/trackIdentity';
import {
  isFavouriteTrack,
  resolveFavouriteTracks,
} from '../src/utils/favouriteResolvers';
import { resolvePlaylistTracks } from '../src/utils/playlistResolvers';
import {
  isInUpcomingQueue,
  applyPlayNext,
  applyBulkPlayNext,
  applyAddToQueue,
  getNextTrackToPlay,
} from '../src/utils/queueAlgorithms';
import {
  buildFolderTree,
  buildUnifiedMultiFolderTree,
  flattenTreeToDfsPlaylist,
  findFolderNodeByPath,
  getBreadcrumbs,
} from '../src/utils/musicTree';
import { TrackItem, ImportedFolder } from '../src/types/music';

describe('Decomposed Music Tree Modules', () => {
  const track1: TrackItem = {
    id: 'folder1:track1.mp3',
    name: 'track1.mp3',
    relativePath: 'track1.mp3',
    size: 1024,
    lastModified: 1000,
    aliases: ['legacy1.mp3'],
    metadata: {
      title: 'Track 1',
      artist: 'Artist 1',
      album: 'Album 1',
      duration: 180,
      isMetadataLoaded: true,
    },
    status: 'normal',
  };

  const track2: TrackItem = {
    id: 'folder2:track2.flac',
    name: 'track2.flac',
    relativePath: 'sub/track2.flac',
    size: 2048,
    lastModified: 2000,
    metadata: {
      title: 'Track 2',
      artist: 'Artist 2',
      album: 'Album 2',
      duration: 200,
      isMetadataLoaded: true,
    },
    status: 'normal',
  };

  it('audioFileTypes exports behave correctly', () => {
    expect(SUPPORTED_AUDIO_EXTENSIONS.has('mp3')).toBe(true);
    expect(isSupportedAudioFile('test.mp3')).toBe(true);
    expect(isLrcFile('test.lrc')).toBe(true);
    expect(getMimeTypeForFilename('test.flac')).toBe('audio/flac');
    expect(isFormatSupportedByBrowser('test.mp3')).toBe(true);
    expect(getTrackStatus(track1)).toBe('normal');
    expect(isTrackPlayable(track1)).toBe(true);
    expect(stripExtension('test.mp3')).toBe('test');
  });

  it('trackIdentity exports behave correctly', async () => {
    expect(isSameTrack(track1, track1)).toBe(true);
    const aliasTrack: TrackItem = { ...track1, id: 'legacy1.mp3', aliases: [] };
    expect(isSameTrack(track1, aliasTrack)).toBe(true);
    expect(isSameTrack(track1, track2)).toBe(false);

    const folder1: ImportedFolder = {
      id: 'f1',
      name: 'Folder 1',
      sourceType: 'fs-access',
      tracks: [track1],
      trackCount: 1,
      addedAt: 1000,
      lastScannedAt: 1000,
      permissionStatus: 'granted',
      tree: { id: 'root', name: 'f1', relativePath: '', tracks: [track1], subfolders: [], totalTrackCount: 1 },
    };
    const folder2: ImportedFolder = {
      id: 'f2',
      name: 'Folder 2',
      sourceType: 'fs-access',
      tracks: [track1, track2],
      trackCount: 2,
      addedAt: 2000,
      lastScannedAt: 2000,
      permissionStatus: 'granted',
      tree: { id: 'root', name: 'f2', relativePath: '', tracks: [track1, track2], subfolders: [], totalTrackCount: 2 },
    };

    const combined = combineFlatPlaylists([folder1, folder2]);
    expect(combined).toHaveLength(2);

    const reconciled = await reconcileOverlappingTracks([track2], [track1], 'f2');
    expect(reconciled).toHaveLength(1);
  });

  it('favouriteResolvers exports behave correctly', () => {
    const favs = new Set(['folder1:track1.mp3']);
    expect(isFavouriteTrack(track1, favs)).toBe(true);
    expect(isFavouriteTrack(track2, favs)).toBe(false);

    const res = resolveFavouriteTracks([track1, track2], favs);
    expect(res.resolvedTracks).toHaveLength(1);
    expect(res.resolvedTracks[0].id).toBe('folder1:track1.mp3');
  });

  it('playlistResolvers exports behave correctly', () => {
    const refs = [
      { trackId: 'folder1:track1.mp3', name: 'track1.mp3', addedAt: 1000 },
      { trackId: 'missing-id', name: 'missing.mp3', addedAt: 1000 },
    ];
    const resolved = resolvePlaylistTracks(refs, [track1]);
    expect(resolved).toHaveLength(2);
    expect(resolved[0].id).toBe('folder1:track1.mp3');
    expect(resolved[1].status).toBe('unreadable');
  });

  it('queueAlgorithms exports behave correctly', () => {
    expect(isInUpcomingQueue(track2, [track1, track2], track1)).toBe(true);
    const { nextQueue, outcome } = applyPlayNext([track1], track1, track2);
    expect(outcome).toBe('added');
    expect(nextQueue).toHaveLength(2);

    const bulk = applyBulkPlayNext([track1], track1, [track2]);
    expect(bulk.addedCount).toBe(1);

    const added = applyAddToQueue([track1, track2], track1, track2);
    expect(added.addedCount).toBe(0); // track2 already in upcoming queue

    const next = getNextTrackToPlay(nextQueue, track1, false, 'off', null);
    expect(next.nextTrack?.id).toBe('folder2:track2.flac');
  });

  it('musicTree exports tree building and navigation functions', () => {
    const tree = buildFolderTree('Library', [track1, track2]);
    expect(tree.totalTrackCount).toBe(2);

    const unified = buildUnifiedMultiFolderTree([
      {
        id: 'f1',
        name: 'F1',
        sourceType: 'fs-access',
        tracks: [track1],
        trackCount: 1,
        addedAt: 1000,
        lastScannedAt: 1000,
        permissionStatus: 'granted',
        tree,
      },
    ]);
    expect(unified.totalTrackCount).toBe(2);

    const dfs = flattenTreeToDfsPlaylist(tree);
    expect(dfs).toHaveLength(2);

    const found = findFolderNodeByPath(tree, 'sub');
    expect(found?.name).toBe('sub');

    const crumbs = getBreadcrumbs('Library', 'sub');
    expect(crumbs).toHaveLength(2);
  });
});
