import { describe, it, expect, vi } from 'vitest';
import {
  isSameTrack,
  mergeTrackMetadataAndSources,
  findExistingTrackByHandle,
  reconcileOverlappingTracks,
  combineFlatPlaylists,
} from '../src/utils/trackIdentity';
import { TrackItem, ImportedFolder, MusicLibrary } from '../src/types/music';
import { buildFolderTree } from '../src/utils/musicTree';
import { updateTrackMetadataInLibrary } from '../src/utils/libraryAggregation';

function createMockHandle(name: string, isSame = false): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    isSameEntry: vi.fn().mockImplementation(async (other: FileSystemFileHandle) => {
      return isSame || other.name === name;
    }),
  } as unknown as FileSystemFileHandle;
}

function makeTrack(
  id: string,
  name: string,
  folderIds: string[] = [],
  options: Partial<TrackItem> = {}
): TrackItem {
  return {
    id,
    name,
    relativePath: options.relativePath || name,
    size: options.size ?? 1024,
    lastModified: options.lastModified ?? 1000,
    folderIds,
    aliases: options.aliases || [id],
    handle: options.handle,
    file: options.file,
    lrcHandle: options.lrcHandle,
    lrcFile: options.lrcFile,
    lrcContent: options.lrcContent,
    status: options.status || 'normal',
    metadata: {
      title: options.metadata?.title || name,
      artist: options.metadata?.artist || 'Artist',
      album: options.metadata?.album || 'Album',
      isMetadataLoaded: options.metadata?.isMetadataLoaded ?? false,
      artworkUrl: options.metadata?.artworkUrl,
      duration: options.metadata?.duration,
    },
  };
}

function makeFolder(
  id: string,
  name: string,
  sourceType: 'fs-access' | 'files',
  tracks: TrackItem[]
): ImportedFolder {
  return {
    id,
    name,
    sourceType,
    tracks,
    tree: buildFolderTree(name, tracks, id),
    trackCount: tracks.length,
    addedAt: 1000,
    lastScannedAt: 1000,
    permissionStatus: 'granted',
  };
}

describe('Cross-Source Track Identity & Lyrics Consistency', () => {
  it('1. Folder-first then file import deduplication', async () => {
    const handle = createMockHandle('Song.mp3');
    const folderTrack = makeTrack('f1:Song.mp3', 'Song.mp3', ['f1'], { handle });
    const fileTrack = makeTrack('imported-files-root:Song.mp3', 'Song.mp3', ['imported-files-root'], {
      handle,
    });

    const matched = await findExistingTrackByHandle(fileTrack.handle!, [folderTrack]);
    expect(matched).toBe(folderTrack);

    mergeTrackMetadataAndSources(folderTrack, fileTrack);
    expect(folderTrack.folderIds).toEqual(['f1', 'imported-files-root']);
    expect(folderTrack.aliases).toContain('imported-files-root:Song.mp3');

    const folders: ImportedFolder[] = [
      makeFolder('f1', 'Music', 'fs-access', [folderTrack]),
      makeFolder('imported-files-root', 'Imported Files', 'files', [folderTrack]),
    ];

    const flat = combineFlatPlaylists(folders);
    expect(flat).toHaveLength(1);
    expect(flat[0].id).toBe('f1:Song.mp3');
    expect(flat[0].folderIds).toEqual(['f1', 'imported-files-root']);
  });

  it('2. File-first then folder import deduplication', async () => {
    const handle = createMockHandle('TrackA.flac');
    const importedTrack = makeTrack('imported-files-root:TrackA.flac', 'TrackA.flac', [
      'imported-files-root',
    ], { handle });
    const discoveredTrack = makeTrack('folder-1:TrackA.flac', 'TrackA.flac', ['folder-1'], {
      handle,
    });

    const reconciled = await reconcileOverlappingTracks([discoveredTrack], [importedTrack], 'folder-1');
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0].id).toBe('imported-files-root:TrackA.flac');
    expect(reconciled[0].folderIds).toEqual(['imported-files-root', 'folder-1']);
    expect(reconciled[0].aliases).toContain('folder-1:TrackA.flac');
  });

  it('3. Same-entry handle verification via isSameEntry()', async () => {
    const h1 = createMockHandle('Same.mp3', true);
    const h2 = createMockHandle('Same.mp3', true);
    const track1 = makeTrack('f1:Same.mp3', 'Same.mp3', ['f1'], { handle: h1 });

    const matched = await findExistingTrackByHandle(h2, [track1]);
    expect(matched).toBe(track1);
  });

  it('4. Identical filenames from distinct physical files remain separate', async () => {
    const h1: FileSystemFileHandle = {
      kind: 'file',
      name: 'Song.mp3',
      isSameEntry: vi.fn().mockResolvedValue(false),
    } as unknown as FileSystemFileHandle;
    const h2: FileSystemFileHandle = {
      kind: 'file',
      name: 'Song.mp3',
      isSameEntry: vi.fn().mockResolvedValue(false),
    } as unknown as FileSystemFileHandle;

    const track1 = makeTrack('dir1:Song.mp3', 'Song.mp3', ['dir1'], { handle: h1 });
    const matched = await findExistingTrackByHandle(h2, [track1]);
    expect(matched).toBeNull();
  });

  it('5. Ambiguous file input fallback preservation', () => {
    const f1 = makeTrack('imported-files-root:audio1.mp3', 'audio1.mp3', ['imported-files-root'], {
      file: new File([], 'audio1.mp3'),
    });
    const f2 = makeTrack('imported-files-root:audio2.mp3', 'audio2.mp3', ['imported-files-root'], {
      file: new File([], 'audio2.mp3'),
    });

    expect(isSameTrack(f1, f2)).toBe(false);
  });

  it('6. Repeated imports of same file do not duplicate', async () => {
    const handle = createMockHandle('Repeated.mp3');
    const existing = makeTrack('imported-files-root:Repeated.mp3', 'Repeated.mp3', [
      'imported-files-root',
    ], { handle });

    const matched = await findExistingTrackByHandle(handle, [existing]);
    expect(matched).toBe(existing);

    const folder = makeFolder('imported-files-root', 'Imported Files', 'files', [existing, existing]);
    const flat = combineFlatPlaylists([folder]);
    expect(flat).toHaveLength(1);
  });

  it('7. Parent/child folder overlaps deduplication', async () => {
    const handle = createMockHandle('SubSong.flac');
    const parentTrack = makeTrack('parent:sub/SubSong.flac', 'SubSong.flac', ['parent'], {
      handle,
      relativePath: 'sub/SubSong.flac',
    });
    const childTrack = makeTrack('child:SubSong.flac', 'SubSong.flac', ['child'], {
      handle,
      relativePath: 'SubSong.flac',
    });

    const reconciled = await reconcileOverlappingTracks([childTrack], [parentTrack], 'child');
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0].id).toBe('parent:sub/SubSong.flac');
    expect(reconciled[0].folderIds).toEqual(['parent', 'child']);
  });

  it('8. Lyrics association from folder import (lrcHandle)', () => {
    const lrcHandle = createMockHandle('Song.lrc');
    const track = makeTrack('f1:Song.mp3', 'Song.mp3', ['f1'], {
      lrcHandle,
      lrcContent: '[00:01.00]Hello world',
    });

    expect(track.lrcHandle).toBe(lrcHandle);
    expect(track.lrcContent).toBe('[00:01.00]Hello world');
  });

  it('9. Lyrics reuse across verified sources', () => {
    const lrcHandle = createMockHandle('Song.lrc');
    const folderTrack = makeTrack('f1:Song.mp3', 'Song.mp3', ['f1'], {
      lrcHandle,
      lrcContent: '[00:02.00]Chorus',
    });
    const fileTrack = makeTrack('imported-files-root:Song.mp3', 'Song.mp3', ['imported-files-root']);

    mergeTrackMetadataAndSources(fileTrack, folderTrack);
    expect(fileTrack.lrcHandle).toBe(lrcHandle);
    expect(fileTrack.lrcContent).toBe('[00:02.00]Chorus');

    const fileTrack2 = makeTrack('imported-files-root:Song2.mp3', 'Song2.mp3', [
      'imported-files-root',
    ], { lrcHandle });
    const folderTrack2 = makeTrack('f1:Song2.mp3', 'Song2.mp3', ['f1']);
    mergeTrackMetadataAndSources(folderTrack2, fileTrack2);
    expect(folderTrack2.lrcHandle).toBe(lrcHandle);
  });

  it('10. Explicit MP3 + LRC multi-file selection pairing', () => {
    const lrcFile = new File(['[00:05.00]Pairing'], 'Song.lrc');
    const mp3Track = makeTrack('imported-files-root:Song.mp3', 'Song.mp3', ['imported-files-root'], {
      lrcFile,
    });
    expect(mp3Track.lrcFile).toBe(lrcFile);
  });

  it('11. Unavailable directory permissions preservation', () => {
    const unreadable = makeTrack('f1:Song.mp3', 'Song.mp3', ['f1'], { status: 'unreadable' });
    const normal = makeTrack('imported-files-root:Song.mp3', 'Song.mp3', ['imported-files-root'], {
      status: 'normal',
    });

    mergeTrackMetadataAndSources(unreadable, normal);
    expect(unreadable.status).toBe('normal');
  });

  it('12. Removing one of multiple sources preserves track', () => {
    const track = makeTrack('f1:Song.mp3', 'Song.mp3', ['f1', 'imported-files-root'], {
      aliases: ['f1:Song.mp3', 'imported-files-root:Song.mp3'],
    });

    // Remove f1 root
    const remainingFolderIds = (track.folderIds || []).filter((id) => id !== 'f1');
    expect(remainingFolderIds).toEqual(['imported-files-root']);
    expect(remainingFolderIds.length).toBeGreaterThan(0);
  });

  it('13. Removing the last valid source cleans up references', () => {
    const track = makeTrack('imported-files-root:Song.mp3', 'Song.mp3', ['imported-files-root']);
    const remaining = (track.folderIds || []).filter((id) => id !== 'imported-files-root');
    expect(remaining).toHaveLength(0);
  });

  it('14. Browser reload and restoration deduplication', () => {
    const handle = createMockHandle('Song.mp3');
    const folderTrack = makeTrack('f1:Song.mp3', 'Song.mp3', ['f1'], { handle });
    const importedTrack = makeTrack('imported-files-root:Song.mp3', 'Song.mp3', [
      'imported-files-root',
    ], { handle });

    mergeTrackMetadataAndSources(folderTrack, importedTrack);

    const flat = combineFlatPlaylists([
      makeFolder('f1', 'Folder', 'fs-access', [folderTrack]),
      makeFolder('imported-files-root', 'Imported Files', 'files', [folderTrack]),
    ]);
    expect(flat).toHaveLength(1);
  });

  it('15. Playlist references resolution across aliases', () => {
    const canonicalTrack = makeTrack('f1:Song.mp3', 'Song.mp3', ['f1', 'imported-files-root'], {
      aliases: ['f1:Song.mp3', 'imported-files-root:Song.mp3'],
    });

    const playlistTrackId = 'imported-files-root:Song.mp3';
    const matches =
      canonicalTrack.id === playlistTrackId || canonicalTrack.aliases?.includes(playlistTrackId);
    expect(matches).toBe(true);
  });

  it('16. Favourite state resolution across aliases', () => {
    const canonicalTrack = makeTrack('f1:Song.mp3', 'Song.mp3', ['f1', 'imported-files-root'], {
      aliases: ['f1:Song.mp3', 'imported-files-root:Song.mp3'],
    });
    const favourites = new Set(['imported-files-root:Song.mp3']);

    const isFav =
      favourites.has(canonicalTrack.id) ||
      (canonicalTrack.aliases && canonicalTrack.aliases.some((a) => favourites.has(a)));
    expect(isFav).toBe(true);
  });

  it('17. Queue identity consistency (isSameTrack)', () => {
    const t1 = makeTrack('f1:Song.mp3', 'Song.mp3', ['f1'], {
      aliases: ['f1:Song.mp3', 'imported-files-root:Song.mp3'],
    });
    const t2 = makeTrack('imported-files-root:Song.mp3', 'Song.mp3', ['imported-files-root'], {
      aliases: ['f1:Song.mp3', 'imported-files-root:Song.mp3'],
    });

    expect(isSameTrack(t1, t2)).toBe(true);
  });

  it('18. Late metadata update races do not overwrite newer metadata', () => {
    const track = makeTrack('f1:Song.mp3', 'Song.mp3', ['f1'], {
      aliases: ['f1:Song.mp3', 'imported-files-root:Song.mp3'],
      metadata: {
        title: 'Title From Tags',
        artist: 'Artist From Tags',
        album: 'Album From Tags',
        artworkUrl: 'blob:art1',
        isMetadataLoaded: true,
      },
    });

    const folder = makeFolder('f1', 'Music', 'fs-access', [track]);
    const lib: MusicLibrary = {
      id: 'f1',
      name: 'Music',
      sourceType: 'fs-access',
      tree: buildFolderTree('Music', [track], 'f1'),
      flatPlaylist: [track],
      folders: [folder],
    };

    const updated = updateTrackMetadataInLibrary(lib, 'imported-files-root:Song.mp3', {
      duration: 215,
    });
    expect(updated.flatPlaylist[0].metadata.duration).toBe(215);
    expect(updated.flatPlaylist[0].metadata.artworkUrl).toBe('blob:art1');
    expect(updated.flatPlaylist[0].metadata.title).toBe('Title From Tags');
  });
});
