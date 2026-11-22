import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createTrackReferenceResolver,
  extractRelativePathFromTrackId,
} from '../src/utils/trackReferenceResolver';
import { resolveFavouriteTracks, isFavouriteTrack } from '../src/utils/favouriteResolvers';
import { resolvePlaylistTracks } from '../src/utils/playlistResolvers';
import { reconcileQueueAfterSourceRemoval } from '../src/utils/queueSourceRemoval';
import { PlaylistsView } from '../src/components/PlaylistsView';
import { Playlist, PlaylistTrackReference, TrackItem } from '../src/types/music';

function makeTrack(
  id: string,
  relativePath: string,
  overrides: Partial<TrackItem> = {}
): TrackItem {
  const name = relativePath.split('/').pop() || relativePath;
  return {
    id,
    name,
    relativePath,
    size: 4096000,
    lastModified: 1700000000,
    status: 'normal',
    metadata: {
      title: name.replace(/\.[^/.]+$/, ''),
      artist: 'Known Artist',
      album: 'Known Album',
      duration: 210,
      isMetadataLoaded: true,
    },
    ...overrides,
  };
}

describe('Shared Track Reference Resolver', () => {
  it('resolves exact canonical ID, alias, nested/bare relativePath, and respects opt-in fallback', () => {
    const t1 = makeTrack('fsa_new:Pop/Hello.mp3', 'Pop/Hello.mp3', {
      aliases: ['fsa_new:Pop/Hello.mp3', 'imported_files_root:Hello.mp3'],
    });
    const t2 = makeTrack('fsa_new:Rock/Numb.mp3', 'Rock/Numb.mp3');
    const resolver = createTrackReferenceResolver([t1, t2]);

    // 1. Exact canonical ID
    expect(resolver.resolve('fsa_new:Pop/Hello.mp3')).toEqual({
      track: t1,
      matchedBy: 'id',
      ambiguous: false,
    });

    // 2. Verified alias
    expect(resolver.resolve('imported_files_root:Hello.mp3')).toEqual({
      track: t1,
      matchedBy: 'alias',
      ambiguous: false,
    });

    // 3. RelativePath fallback disabled by default
    expect(resolver.resolve('fsa_old:Pop/Hello.mp3')).toEqual({
      track: null,
      matchedBy: null,
      ambiguous: false,
    });

    // 4. RelativePath fallback enabled -> matches old Folder ID & legacy bare path
    expect(resolver.resolve('fsa_old:Pop/Hello.mp3', { allowRelativePathFallback: true })).toEqual({
      track: t1,
      matchedBy: 'relativePath',
      ambiguous: false,
    });
    expect(resolver.resolve('Rock/Numb.mp3', { allowRelativePathFallback: true })).toEqual({
      track: t2,
      matchedBy: 'relativePath',
      ambiguous: false,
    });

    // 5. Missing track returns unresolved
    expect(resolver.resolve('fsa_old:Missing.mp3', { allowRelativePathFallback: true })).toEqual({
      track: null,
      matchedBy: null,
      ambiguous: false,
    });

    expect(extractRelativePathFromTrackId('fsa_old:Pop/Hello.mp3')).toBe('Pop/Hello.mp3');
    expect(extractRelativePathFromTrackId('Pop/Hello.mp3')).toBe('Pop/Hello.mp3');
  });

  it('flags ambiguous relativePath across two independent folders and deduplicates identical canonical tracks', () => {
    const folderA = makeTrack('fsa_A:Pop/Hello.mp3', 'Pop/Hello.mp3');
    const folderB = makeTrack('fsa_B:Pop/Hello.mp3', 'Pop/Hello.mp3');
    const resolver = createTrackReferenceResolver([folderA, folderB]);

    // Ambiguous relativePath -> MUST NOT pick an arbitrary candidate
    expect(resolver.resolve('fsa_old:Pop/Hello.mp3', { allowRelativePathFallback: true })).toEqual({
      track: null,
      matchedBy: null,
      ambiguous: true,
    });

    // Exact canonical ID still resolves unambiguously even when relativePath collides
    expect(resolver.resolve('fsa_B:Pop/Hello.mp3', { allowRelativePathFallback: true })).toEqual({
      track: folderB,
      matchedBy: 'id',
      ambiguous: false,
    });

    // Duplicate references to the SAME canonical track in libraryTracks do not trigger false ambiguity
    const dedupResolver = createTrackReferenceResolver([folderA, folderA]);
    expect(
      dedupResolver.resolve('fsa_old:Pop/Hello.mp3', { allowRelativePathFallback: true })
    ).toEqual({
      track: folderA,
      matchedBy: 'relativePath',
      ambiguous: false,
    });
  });
});

describe('Favourites Integration with Shared Resolver', () => {
  it('preserves unresolved favourites on removal, restores with new Folder ID, migrates IDs, and blocks ambiguity', () => {
    const favs = new Set(['fsa_old:Pop/Hello.mp3', 'fsa_old:Missing.mp3']);

    // 1. All sources removed -> preserved in unresolvedIds
    const emptyRes = resolveFavouriteTracks([], favs);
    expect(emptyRes.resolvedTracks).toEqual([]);
    expect(emptyRes.unresolvedIds).toEqual(['fsa_old:Pop/Hello.mp3', 'fsa_old:Missing.mp3']);

    // 2. Re-imported with new Folder ID -> restores & schedules canonical migration
    const reimported = makeTrack('fsa_new:Pop/Hello.mp3', 'Pop/Hello.mp3');
    const restored = resolveFavouriteTracks([reimported], favs);
    expect(restored.resolvedTracks.map((t) => t.id)).toEqual(['fsa_new:Pop/Hello.mp3']);
    expect(restored.migratedMap.get('fsa_old:Pop/Hello.mp3')).toBe('fsa_new:Pop/Hello.mp3');
    expect(restored.unresolvedIds).toEqual(['fsa_old:Missing.mp3']);

    // 3. Ambiguous second folder with identical relativePath -> stays unresolved
    const conflict = makeTrack('fsa_other:Pop/Hello.mp3', 'Pop/Hello.mp3');
    const ambiguous = resolveFavouriteTracks([reimported, conflict], new Set(['fsa_old:Pop/Hello.mp3']));
    expect(ambiguous.resolvedTracks).toEqual([]);
    expect(ambiguous.unresolvedIds).toEqual(['fsa_old:Pop/Hello.mp3']);
    expect(isFavouriteTrack(reimported, new Set(['Pop/Hello.mp3']), [reimported, conflict])).toBe(false);
    expect(isFavouriteTrack(reimported, new Set(['Pop/Hello.mp3']), [reimported])).toBe(true);
  });
});

describe('Playlist 222 Recovery, Dynamic Ambiguity Safety & Queue Isolation', () => {
  const refs: PlaylistTrackReference[] = [
    { trackId: 'fsa_old:墨尔本的秋天.mp3', name: '墨尔本的秋天', artist: '七元', album: '墨尔本的秋天', duration: 166, addedAt: 1 },
    { trackId: 'fsa_old:晴天.mp3', name: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, addedAt: 2 },
    { trackId: 'fsa_old:青花瓷.mp3', name: '青花瓷', artist: '周杰伦', album: '我很忙', duration: 239, addedAt: 3 },
  ];
  const playlist222: Playlist = {
    id: 'pl-222',
    name: '222',
    tracks: refs,
    createdAt: 1700000000,
    updatedAt: 1700000000,
  };

  it('recovers all 3 Playlist 222 entries automatically after re-importing with a new Folder ID without mutating stored IDs', () => {
    // 1. After removing all sources -> 3 unavailable placeholders in original order
    const offline = resolvePlaylistTracks(refs, []);
    expect(offline.map((t) => t.status)).toEqual(['unreadable', 'unreadable', 'unreadable']);
    expect(offline.map((t) => t.metadata.title)).toEqual(['墨尔本的秋天', '晴天', '青花瓷']);

    // 2. Re-import matching folder with brand-new Folder ID (even in different order)
    const r3 = makeTrack('fsa_reimported:青花瓷.mp3', '青花瓷.mp3');
    const r1 = makeTrack('fsa_reimported:墨尔本的秋天.mp3', '墨尔本的秋天.mp3');
    const r2 = makeTrack('fsa_reimported:晴天.mp3', '晴天.mp3');
    const recovered = resolvePlaylistTracks(refs, [r3, r1, r2]);

    // Order preserved; real canonical playable tracks returned; stored refs NOT prematurely mutated
    expect(recovered.map((t) => t.id)).toEqual([
      'fsa_reimported:墨尔本的秋天.mp3',
      'fsa_reimported:晴天.mp3',
      'fsa_reimported:青花瓷.mp3',
    ]);
    expect(recovered.every((t) => t.status === 'normal')).toBe(true);
    expect(refs[0].trackId).toBe('fsa_old:墨尔本的秋天.mp3');

    // PlaylistsView renders enabled Play All, Shuffle, and Add to Queue (not disabled!)
    const html = renderToStaticMarkup(
      <PlaylistsView
        playlists={[playlist222]}
        selectedPlaylistId="pl-222"
        libraryTracks={[r3, r1, r2]}
        currentTrackId={null}
        isPlaying={false}
        favourites={new Set()}
        onSelectPlaylist={vi.fn()}
        onCreatePlaylist={vi.fn()}
        onRenamePlaylist={vi.fn()}
        onDeletePlaylist={vi.fn()}
        onPlayPlaylist={vi.fn()}
        onPlayTrack={vi.fn()}
        onTogglePlay={vi.fn()}
        onToggleFavourite={vi.fn()}
        onAddToQueue={vi.fn()}
        onRemoveTrackFromPlaylist={vi.fn()}
        onReorderPlaylistTracks={vi.fn()}
      />
    );
    expect(html).not.toMatch(/disabled=""[^>]*>.*?Play All/s);
    expect(html).not.toMatch(/disabled=""[^>]*>.*?Shuffle/s);
    expect(html).not.toMatch(/disabled=""[^>]*>.*?Add to Queue/s);

    // 3. Importing a second independent folder with identical relativePath makes that entry ambiguous -> reverts safely to unreadable
    const dupR1 = makeTrack('fsa_folderB:墨尔本的秋天.mp3', '墨尔本的秋天.mp3');
    const withConflict = resolvePlaylistTracks(refs, [r1, r2, r3, dupR1]);
    expect(withConflict[0].status).toBe('unreadable');
    expect(withConflict[1].status).toBe('normal');
    expect(withConflict[2].status).toBe('normal');

    // 4. Explicitly cleared Queue remains empty (Queue does NOT auto-restore on re-import)
    const clearedQueue = reconcileQueueAfterSourceRemoval([r1, r2], r1, [], new Map(), 'off');
    expect(clearedQueue.nextQueue).toEqual([]);
    expect(clearedQueue.shouldStop).toBe(true);
  });
});
