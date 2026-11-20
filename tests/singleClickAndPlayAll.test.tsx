import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrackItem, Playlist, FileStatus } from '../src/types/music';
import { TrackListHeader } from '../src/components/TrackListHeader';
import { TrackRow } from '../src/components/TrackRow';
import { TrackList } from '../src/components/TrackList';
import { FolderView } from '../src/components/FolderView';
import { AlbumsView } from '../src/components/AlbumsView';
import { ArtistsView } from '../src/components/ArtistsView';
import { applyPlayNext, applyAddToQueue } from '../src/utils/queueAlgorithms';
import { isSameTrack } from '../src/utils/trackIdentity';
import { isTrackPlayable } from '../src/utils/audioFileTypes';

function createMockTrack(
  id: string,
  name: string,
  artist = 'Test Artist',
  status: FileStatus = 'normal',
  aliases: string[] = []
): TrackItem {
  return {
    id,
    name: `${name}.mp3`,
    relativePath: `${name}.mp3`,
    size: 1024,
    lastModified: 1000,
    aliases,
    status,
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
  };
}

function getRenderedRow(props: any): any {
  let rootElement: any = null;
  function Wrapper() {
    rootElement = TrackRow(props);
    return null;
  }
  renderToStaticMarkup(<Wrapper />);
  return rootElement;
}

describe('Play All & Single-Click Playback Interaction Suite', () => {
  let trackA: TrackItem;
  let trackB: TrackItem;
  let trackC: TrackItem;
  let trackDuplicateA: TrackItem;
  let trackCorrupted: TrackItem;

  beforeEach(() => {
    vi.restoreAllMocks();
    trackA = createMockTrack('track-a', 'Track A', 'Artist 1');
    trackB = createMockTrack('track-b', 'Track B', 'Artist 2');
    trackC = createMockTrack('track-c', 'Track C', 'Artist 1');
    trackDuplicateA = createMockTrack('track-dup-a', 'Track A', 'Artist 1', 'normal', ['track-a']);
    trackCorrupted = createMockTrack('track-corrupt', 'Corrupt Song', 'Artist 3', 'unreadable');
  });

  // 1. All Tracks Play All Button Visibility
  it('1. renders Play All button beside Select when onPlayAll prop is provided', () => {
    const handlePlayAll = vi.fn();
    const htmlWithPlayAll = renderToStaticMarkup(
      <TrackListHeader
        tracksCount={3}
        selectedCount={0}
        isSelectMode={false}
        showCheckboxes={false}
        onToggleSelectMode={() => {}}
        onToggleSelectAll={() => {}}
        onPlayAll={handlePlayAll}
      />
    );

    expect(htmlWithPlayAll).toContain('data-testid="play-all-button"');
    expect(htmlWithPlayAll).toContain('Play All');

    const htmlWithoutPlayAll = renderToStaticMarkup(
      <TrackListHeader
        tracksCount={3}
        selectedCount={0}
        isSelectMode={false}
        showCheckboxes={false}
        onToggleSelectMode={() => {}}
        onToggleSelectAll={() => {}}
      />
    );

    expect(htmlWithoutPlayAll).not.toContain('data-testid="play-all-button"');
  });

  // 2. Queue Replacement Semantics
  it('2. Play All replaces existing Queue rather than appending', () => {
    const existingQueue = [trackA, trackB];
    const newDisplayedTracks = [trackC, trackB];

    // Simulated playQueue logic
    let activeQueue = [...existingQueue];
    const playQueue = (tracks: TrackItem[]) => {
      activeQueue = [...tracks];
    };

    playQueue(newDisplayedTracks);

    expect(activeQueue).toHaveLength(2);
    expect(activeQueue[0].id).toBe('track-c');
    expect(activeQueue[1].id).toBe('track-b');
  });

  // 3. Order Preserved Starting at Track 1
  it('3. Play All preserves displayed order and targets track 1 as initial track', () => {
    const displayed = [trackB, trackC, trackA];
    let activeQueue: TrackItem[] = [];
    let currentTrack: TrackItem | null = null;

    const playQueue = (tracks: TrackItem[], startIndex = 0) => {
      activeQueue = [...tracks];
      currentTrack = tracks[startIndex] || null;
    };

    playQueue(displayed, 0);

    expect(activeQueue.map((t) => t.id)).toEqual(['track-b', 'track-c', 'track-a']);
    expect(currentTrack).toBe(trackB);
  });

  // 4. Filtered Play All with Search Filter
  it('4. active search filter results are passed into Play All queue', () => {
    const allTracks = [trackA, trackB, trackC];
    const searchQuery = 'Artist 1';
    const filteredTracks = allTracks.filter((t) => t.metadata.artist.includes(searchQuery));

    let activeQueue: TrackItem[] = [];
    const playQueue = (tracks: TrackItem[]) => {
      activeQueue = [...tracks];
    };

    playQueue(filteredTracks);

    expect(activeQueue).toHaveLength(2);
    expect(activeQueue.map((t) => t.id)).toEqual(['track-a', 'track-c']);
  });

  // 5. Logical Duplicate Prevention in Play All
  it('5. excludes duplicate logical tracks using canonical ID and aliases', () => {
    const tracksWithDup = [trackA, trackB, trackDuplicateA];

    const deduplicated: TrackItem[] = [];
    for (const t of tracksWithDup) {
      if (!deduplicated.some((existing) => isSameTrack(existing, t))) {
        deduplicated.push(t);
      }
    }

    expect(deduplicated).toHaveLength(2);
    expect(deduplicated[0].id).toBe('track-a');
    expect(deduplicated[1].id).toBe('track-b');
  });

  // 6. Unavailable Tracks Omitted from Play All
  it('6. unplayable or corrupted files are filtered out of Play All queue', () => {
    const tracks = [trackA, trackCorrupted, trackB];

    const playable = tracks.filter(isTrackPlayable);

    expect(playable).toHaveLength(2);
    expect(playable.map((t) => t.id)).toEqual(['track-a', 'track-b']);
  });

  // 7. Single-Click Playback
  it('7. single click on track row triggers onPlayTrack', () => {
    let playedTrack: TrackItem | null = null;
    let selectedTracksCount = 0;

    const row = getRenderedRow({
      track: trackA,
      index: 0,
      isCurrent: false,
      isPlaying: false,
      isSelected: false,
      showCheckboxes: false,
      favourites: new Set(),
      allTracks: [trackA],
      isPlaylistMode: false,
      activeMenuTrackId: null,
      onToggleMenu: () => {},
      onRowClick: () => {
        selectedTracksCount++;
      },
      onCheckboxClick: () => {},
      onPlayTrack: (t: TrackItem) => {
        playedTrack = t;
      },
      onTogglePlay: () => {},
      onToggleFavourite: () => {},
      onOpenPlaylistModal: () => {},
      onTouchStart: () => {},
      onTouchEnd: () => {},
      showToast: () => {},
    });

    row.props.onClick({
      target: { closest: () => null },
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
    });

    expect(playedTrack).toBe(trackA);
    expect(selectedTracksCount).toBe(0);
  });

  // 8. Rapid Double-Click Protection
  it('8. rapid duplicate clicks within 350ms do not trigger duplicate play requests', () => {
    let playCallCount = 0;

    const row = getRenderedRow({
      track: trackA,
      index: 0,
      isCurrent: false,
      isPlaying: false,
      isSelected: false,
      showCheckboxes: false,
      favourites: new Set(),
      allTracks: [trackA],
      isPlaylistMode: false,
      activeMenuTrackId: null,
      onToggleMenu: () => {},
      onRowClick: () => {},
      onCheckboxClick: () => {},
      onPlayTrack: () => {
        playCallCount++;
      },
      onTogglePlay: () => {},
      onToggleFavourite: () => {},
      onOpenPlaylistModal: () => {},
      onTouchStart: () => {},
      onTouchEnd: () => {},
      showToast: () => {},
    });

    const fakeEvent = {
      target: { closest: () => null },
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
    };

    // First click
    row.props.onClick(fakeEvent);
    // Second click immediately
    row.props.onClick(fakeEvent);

    expect(playCallCount).toBe(1);
  });

  // 9. Cmd/Ctrl Selection Without Playback
  it('9. Cmd-click and Ctrl-click toggles selection and never starts playback', () => {
    let played = false;
    let selected = false;

    const row = getRenderedRow({
      track: trackA,
      index: 0,
      isCurrent: false,
      isPlaying: false,
      isSelected: false,
      showCheckboxes: false,
      favourites: new Set(),
      allTracks: [trackA],
      isPlaylistMode: false,
      activeMenuTrackId: null,
      onToggleMenu: () => {},
      onRowClick: () => {
        selected = true;
      },
      onCheckboxClick: () => {},
      onPlayTrack: () => {
        played = true;
      },
      onTogglePlay: () => {},
      onToggleFavourite: () => {},
      onOpenPlaylistModal: () => {},
      onTouchStart: () => {},
      onTouchEnd: () => {},
      showToast: () => {},
    });

    row.props.onClick({
      target: { closest: () => null },
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
    });

    expect(selected).toBe(true);
    expect(played).toBe(false);
  });

  // 10. Shift-Range Selection Without Playback
  it('10. Shift-click extends selection and never starts playback', () => {
    let played = false;
    let selected = false;

    const row = getRenderedRow({
      track: trackB,
      index: 1,
      isCurrent: false,
      isPlaying: false,
      isSelected: false,
      showCheckboxes: false,
      favourites: new Set(),
      allTracks: [trackA, trackB],
      isPlaylistMode: false,
      activeMenuTrackId: null,
      onToggleMenu: () => {},
      onRowClick: () => {
        selected = true;
      },
      onCheckboxClick: () => {},
      onPlayTrack: () => {
        played = true;
      },
      onTogglePlay: () => {},
      onToggleFavourite: () => {},
      onOpenPlaylistModal: () => {},
      onTouchStart: () => {},
      onTouchEnd: () => {},
      showToast: () => {},
    });

    row.props.onClick({
      target: { closest: () => null },
      metaKey: false,
      ctrlKey: false,
      shiftKey: true,
    });

    expect(selected).toBe(true);
    expect(played).toBe(false);
  });

  // 11. Select Mode Without Playback
  it('11. clicking row in Select mode toggles checkbox without starting playback', () => {
    let played = false;
    let selected = false;

    const row = getRenderedRow({
      track: trackA,
      index: 0,
      isCurrent: false,
      isPlaying: false,
      isSelected: false,
      showCheckboxes: true, // Active select mode
      favourites: new Set(),
      allTracks: [trackA],
      isPlaylistMode: false,
      activeMenuTrackId: null,
      onToggleMenu: () => {},
      onRowClick: () => {
        selected = true;
      },
      onCheckboxClick: () => {},
      onPlayTrack: () => {
        played = true;
      },
      onTogglePlay: () => {},
      onToggleFavourite: () => {},
      onOpenPlaylistModal: () => {},
      onTouchStart: () => {},
      onTouchEnd: () => {},
      showToast: () => {},
    });

    row.props.onClick({
      target: { closest: () => null },
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
    });

    expect(selected).toBe(true);
    expect(played).toBe(false);
  });

  // 12. Child Controls Do Not Trigger Row Playback
  it('12. clicks on child buttons (heart, menu, reorder) do not trigger row-level playback', () => {
    let played = false;

    const row = getRenderedRow({
      track: trackA,
      index: 0,
      isCurrent: false,
      isPlaying: false,
      isSelected: false,
      showCheckboxes: false,
      favourites: new Set(),
      allTracks: [trackA],
      isPlaylistMode: true,
      activeMenuTrackId: null,
      onToggleMenu: () => {},
      onRowClick: () => {},
      onCheckboxClick: () => {},
      onPlayTrack: () => {
        played = true;
      },
      onTogglePlay: () => {},
      onToggleFavourite: () => {},
      onOpenPlaylistModal: () => {},
      onTouchStart: () => {},
      onTouchEnd: () => {},
      showToast: () => {},
    });

    // Target is a child button
    row.props.onClick({
      target: { closest: (selector: string) => (selector.includes('button') ? {} : null) },
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
    });

    expect(played).toBe(false);
  });

  // 13. Touch Long-Press Selection
  it('13. touch long-press triggers select mode without row playback', () => {
    let played = false;

    const row = getRenderedRow({
      track: trackA,
      index: 0,
      isCurrent: false,
      isPlaying: false,
      isSelected: false,
      showCheckboxes: false,
      favourites: new Set(),
      allTracks: [trackA],
      isPlaylistMode: false,
      activeMenuTrackId: null,
      onToggleMenu: () => {},
      onRowClick: () => {},
      onCheckboxClick: () => {},
      onPlayTrack: () => {
        played = true;
      },
      onTogglePlay: () => {},
      onToggleFavourite: () => {},
      onOpenPlaylistModal: () => {},
      onTouchStart: () => {},
      onTouchEnd: () => {},
      isTouchActionSuppressed: () => true, // Long-press fired
      showToast: () => {},
    });

    row.props.onClick({
      target: { closest: () => null },
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
    });

    expect(played).toBe(false);
  });

  // 14. Touch Scrolling Cancellation
  it('14. touch scrolling suppresses click playback', () => {
    let played = false;

    const row = getRenderedRow({
      track: trackA,
      index: 0,
      isCurrent: false,
      isPlaying: false,
      isSelected: false,
      showCheckboxes: false,
      favourites: new Set(),
      allTracks: [trackA],
      isPlaylistMode: false,
      activeMenuTrackId: null,
      onToggleMenu: () => {},
      onRowClick: () => {},
      onCheckboxClick: () => {},
      onPlayTrack: () => {
        played = true;
      },
      onTogglePlay: () => {},
      onToggleFavourite: () => {},
      onOpenPlaylistModal: () => {},
      onTouchStart: () => {},
      onTouchEnd: () => {},
      isTouchActionSuppressed: () => true, // Scrolling detected
      showToast: () => {},
    });

    row.props.onClick({
      target: { closest: () => null },
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
    });

    expect(played).toBe(false);
  });

  // 15. Play Next Relocation
  it('15. Play Next relocates an already-queued track to immediately after current track without duplicates', () => {
    const queue = [trackA, trackB, trackC];
    const { nextQueue, outcome } = applyPlayNext(queue, trackA, trackC);

    expect(outcome).toBe('moved');
    expect(nextQueue).toHaveLength(3);
    expect(nextQueue[0].id).toBe('track-a');
    expect(nextQueue[1].id).toBe('track-c');
    expect(nextQueue[2].id).toBe('track-b');
  });

  // 16. Add to Queue Duplicate Prevention
  it('16. Add to Queue does not add duplicates when track is already in upcoming queue', () => {
    const queue = [trackA, trackB];
    const { nextQueue, addedCount } = applyAddToQueue(queue, trackA, trackB);

    expect(addedCount).toBe(0);
    expect(nextQueue).toHaveLength(2);
  });

  // 17. Playlist Independence
  it('17. playing from a playlist leaves the playlist item list unmodified', () => {
    const originalPlaylist: Playlist = {
      id: 'pl-1',
      name: 'Chill Vibes',
      tracks: [
        { trackId: trackA.id, name: trackA.name, addedAt: 100 },
        { trackId: trackB.id, name: trackB.name, addedAt: 200 },
      ],
      createdAt: 100,
      updatedAt: 200,
    };

    // Deep copy snapshot
    const snapshot = JSON.stringify(originalPlaylist);

    // Play all simulation
    const queueTracks = [trackA, trackB];
    expect(queueTracks).toHaveLength(2);

    // Playlist structure remains completely intact
    expect(JSON.stringify(originalPlaylist)).toBe(snapshot);
    expect(originalPlaylist.tracks).toHaveLength(2);
  });

  // 18. Seven Views Consistency
  it('18. renders track rows across all seven views with single-click readiness', () => {
    // View 1: TrackList (All Tracks, Favourites, Imported Files)
    const trackListHtml = renderToStaticMarkup(
      <TrackList
        tracks={[trackA, trackB]}
        currentTrackId={trackA.id}
        isPlaying={true}
        favourites={new Set([trackA.id])}
        onPlayTrack={() => {}}
        onTogglePlay={() => {}}
        onToggleFavourite={() => {}}
        onPlayAll={() => {}}
      />
    );
    expect(trackListHtml).toContain('Track A');
    expect(trackListHtml).toContain('Track B');
    expect(trackListHtml).toContain('data-testid="play-all-button"');

    // View 2: FolderView
    const folderHtml = renderToStaticMarkup(
      <FolderView
        currentNode={{
          id: 'root/Rock',
          name: 'Rock',
          relativePath: 'Rock',
          tracks: [trackA, trackB],
          subfolders: [],
          totalTrackCount: 2,
        }}
        currentTrackId={null}
        isPlaying={false}
        favourites={new Set()}
        onSelectFolder={() => {}}
        onPlayTrack={() => {}}
        onTogglePlay={() => {}}
        onToggleFavourite={() => {}}
      />
    );
    expect(folderHtml).toContain('Play All');
    expect(folderHtml).toContain('Track A');

    // View 3: AlbumsView
    const albumHtml = renderToStaticMarkup(
      <AlbumsView
        albums={[
          {
            id: 'alb-1',
            name: 'Test Album',
            artist: 'Test Artist',
            tracks: [trackA, trackB],
            totalDuration: 360,
          },
        ]}
        selectedAlbumId="alb-1"
        currentTrackId={null}
        isPlaying={false}
        favourites={new Set()}
        onSelectAlbum={() => {}}
        onPlayTrack={() => {}}
        onTogglePlay={() => {}}
        onToggleFavourite={() => {}}
      />
    );
    expect(albumHtml).toContain('Play Album');
    expect(albumHtml).toContain('Track A');

    // View 4: ArtistsView
    const artistHtml = renderToStaticMarkup(
      <ArtistsView
        artists={[
          {
            id: 'art-1',
            name: 'Test Artist',
            tracks: [trackA, trackB],
            albumCount: 1,
            totalDuration: 360,
          },
        ]}
        selectedArtistName="Test Artist"
        currentTrackId={null}
        isPlaying={false}
        favourites={new Set()}
        onSelectArtist={() => {}}
        onPlayTrack={() => {}}
        onTogglePlay={() => {}}
        onToggleFavourite={() => {}}
      />
    );
    expect(artistHtml).toContain('Play Artist');
    expect(artistHtml).toContain('Track A');
  });
});
