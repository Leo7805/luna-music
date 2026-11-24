import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrackItem, Playlist } from '../src/types/music';
import { TrackThumbnail } from '../src/components/TrackThumbnail';
import { TrackListEmptyState } from '../src/components/TrackListEmptyState';
import { TrackListHeader } from '../src/components/TrackListHeader';
import { TrackRow } from '../src/components/TrackRow';
import { TrackActionMenu } from '../src/components/TrackActionMenu';
import { BulkActionToolbar } from '../src/components/BulkActionToolbar';
import { TrackPlaylistModals } from '../src/components/TrackPlaylistModals';
import { TrackList } from '../src/components/TrackList';

describe('TrackList Architecture & Component Decomposition (Stage 4)', () => {
  const mockTrack1: TrackItem = {
    id: 'f1:song1.mp3',
    name: 'song1.mp3',
    relativePath: 'song1.mp3',
    size: 4000000,
    lastModified: 1700000000,
    metadata: {
      title: 'Neon Nights',
      artist: 'SynthWave Artist',
      album: 'Cyber Dreams',
      duration: 215,
      artworkUrl: 'blob:http://localhost/cover1',
      isMetadataLoaded: true,
    },
  };

  const mockTrack2: TrackItem = {
    id: 'f1:song2.flac',
    name: 'song2.flac',
    relativePath: 'song2.flac',
    size: 25000000,
    lastModified: 1700001000,
    metadata: {
      title: 'Midnight Drive',
      artist: 'SynthWave Artist',
      album: 'Cyber Dreams',
      duration: 180,
      isMetadataLoaded: true,
    },
  };

  const mockTrack3: TrackItem = {
    id: 'imported-files-root:standalone.wav',
    name: 'standalone.wav',
    relativePath: 'standalone.wav',
    size: 15000000,
    lastModified: 1700002000,
    status: 'unreadable',
    metadata: {
      title: 'Unreadable Recording',
      artist: 'Independent',
      album: 'Recordings',
      duration: 90,
      isMetadataLoaded: true,
    },
  };

  const mockTracks = [mockTrack1, mockTrack2, mockTrack3];

  const mockPlaylists: Playlist[] = [
    {
      id: 'pl-1',
      name: 'Synthwave Hits',
      tracks: [{ trackId: 'f1:song1.mp3', name: 'song1.mp3', addedAt: 1000 }],
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  describe('1. TrackThumbnail Component', () => {
    it('renders image artwork when artwork URL is provided', () => {
      const html = renderToStaticMarkup(
        <TrackThumbnail
          metadata={{
            title: 'Neon Nights',
            artist: 'SynthWave Artist',
            album: 'Cyber Dreams',
            artworkUrl: 'blob:http://localhost/cover1',
            isMetadataLoaded: true,
          }}
        />
      );
      expect(html).toContain('<img');
      expect(html).toContain('blob:http://localhost/cover1');
      expect(html).toContain('alt="Neon Nights"');
    });

    it('renders placeholder avatar letters when artwork is missing', () => {
      const html = renderToStaticMarkup(
        <TrackThumbnail
          metadata={{
            title: 'Midnight Drive',
            artist: 'SynthWave Artist',
            album: 'Cyber Dreams',
            isMetadataLoaded: true,
          }}
        />
      );
      expect(html).not.toContain('<img');
      expect(html).toContain('Mi'); // First two letters of Midnight Drive
    });
  });

  describe('2. TrackListEmptyState Component', () => {
    it('renders default empty state', () => {
      const html = renderToStaticMarkup(
        <TrackListEmptyState emptyVariant="default" />
      );
      expect(html).toContain('No tracks found matching your selection.');
    });

    it('renders favourites empty state with heart icon and guidance', () => {
      const html = renderToStaticMarkup(
        <TrackListEmptyState emptyVariant="favourites" />
      );
      expect(html).toContain('No favourite tracks yet');
      expect(html).toContain('Click the heart icon on any track');
      expect(html).toContain('lucide-heart');
    });

    it('renders search empty state with custom message', () => {
      const html = renderToStaticMarkup(
        <TrackListEmptyState emptyVariant="search" emptyMessage="No matches for 'jazz'" />
      );
      expect(html).toContain("No matches for &#x27;jazz&#x27;");
    });
  });

  describe('3. TrackListHeader Component', () => {
    it('renders header columns and track counter in normal mode', () => {
      const html = renderToStaticMarkup(
        <TrackListHeader
          tracksCount={3}
          selectedCount={0}
          isSelectMode={false}
          showCheckboxes={false}
          onToggleSelectMode={() => {}}
          onToggleSelectAll={() => {}}
        />
      );
      expect(html).toContain('Title');
      expect(html).toContain('Album');
      expect(html).toContain('3 tracks');
      expect(html).toContain('Select');
      expect(html).not.toContain('Done');
    });

    it('renders select mode toolbar with Done button and selection count', () => {
      const html = renderToStaticMarkup(
        <TrackListHeader
          tracksCount={3}
          selectedCount={2}
          isSelectMode={true}
          showCheckboxes={true}
          onToggleSelectMode={() => {}}
          onToggleSelectAll={() => {}}
        />
      );
      expect(html).toContain('Done');
      expect(html).toContain('2 of 3 selected');
      expect(html).toContain('aria-label="Select all"');
    });
  });

  describe('4. TrackRow Component', () => {
    it('renders track info, album, formatted duration, and action buttons', () => {
      const html = renderToStaticMarkup(
        <TrackRow
          track={mockTrack1}
          index={0}
          isCurrent={false}
          isPlaying={false}
          isSelected={false}
          showCheckboxes={false}
          favourites={new Set()}
          libraryTracks={mockTracks}
          allTracks={mockTracks}
          isPlaylistMode={false}
          isPlaylistView={false}
          isImportedFilesView={false}
          activeMenuTrackId={null}
          onToggleMenu={() => {}}
          onRowClick={() => false}
          onCheckboxClick={() => {}}
          onPlayTrack={() => {}}
          onTogglePlay={() => {}}
          onToggleFavourite={() => {}}
          onOpenPlaylistModal={() => {}}
          onTouchStart={() => {}}
          onTouchEnd={() => {}}
          showToast={() => {}}
        />
      );

      expect(html).toContain('Neon Nights');
      expect(html).toContain('SynthWave Artist');
      expect(html).toContain('Cyber Dreams');
      expect(html).toContain('3:35'); // 215 seconds
      expect(html).toContain('title="Add to favourites"');
    });

    it('renders active playing state and filled heart for favourited tracks', () => {
      const html = renderToStaticMarkup(
        <TrackRow
          track={mockTrack1}
          index={0}
          isCurrent={true}
          isPlaying={true}
          isSelected={false}
          showCheckboxes={false}
          favourites={new Set(['f1:song1.mp3'])}
          libraryTracks={mockTracks}
          allTracks={mockTracks}
          isPlaylistMode={false}
          isPlaylistView={false}
          isImportedFilesView={false}
          activeMenuTrackId={null}
          onToggleMenu={() => {}}
          onRowClick={() => false}
          onCheckboxClick={() => {}}
          onPlayTrack={() => {}}
          onTogglePlay={() => {}}
          onToggleFavourite={() => {}}
          onOpenPlaylistModal={() => {}}
          onTouchStart={() => {}}
          onTouchEnd={() => {}}
          showToast={() => {}}
        />
      );

      expect(html).toContain('animate-bar-1'); // Equalizer animated bars
      expect(html).toContain('title="Remove from favourites"');
      expect(html).toContain('fill-rose-500');
    });

    it('renders checkbox and selection styling when selected', () => {
      const html = renderToStaticMarkup(
        <TrackRow
          track={mockTrack1}
          index={0}
          isCurrent={false}
          isPlaying={false}
          isSelected={true}
          showCheckboxes={true}
          favourites={new Set()}
          libraryTracks={mockTracks}
          allTracks={mockTracks}
          isPlaylistMode={false}
          isPlaylistView={false}
          isImportedFilesView={false}
          activeMenuTrackId={null}
          onToggleMenu={() => {}}
          onRowClick={() => false}
          onCheckboxClick={() => {}}
          onPlayTrack={() => {}}
          onTogglePlay={() => {}}
          onToggleFavourite={() => {}}
          onOpenPlaylistModal={() => {}}
          onTouchStart={() => {}}
          onTouchEnd={() => {}}
          showToast={() => {}}
        />
      );

      expect(html).toContain('track-row-selected');
      expect(html).toContain('lucide-check-square'); // Checked checkbox icon
    });

    it('renders unreadable status badge for inaccessible files', () => {
      const html = renderToStaticMarkup(
        <TrackRow
          track={mockTrack3}
          index={2}
          isCurrent={false}
          isPlaying={false}
          isSelected={false}
          showCheckboxes={false}
          favourites={new Set()}
          libraryTracks={mockTracks}
          allTracks={mockTracks}
          isPlaylistMode={false}
          isPlaylistView={false}
          isImportedFilesView={true}
          activeMenuTrackId={null}
          onToggleMenu={() => {}}
          onRowClick={() => false}
          onCheckboxClick={() => {}}
          onPlayTrack={() => {}}
          onTogglePlay={() => {}}
          onToggleFavourite={() => {}}
          onOpenPlaylistModal={() => {}}
          onTouchStart={() => {}}
          onTouchEnd={() => {}}
          showToast={() => {}}
        />
      );

      expect(html).toContain('Cannot access file');
    });
  });

  describe('5. TrackActionMenu Component', () => {
    it('renders standard menu actions: Play Next, Add to Queue, Add to Playlist, Favourite', () => {
      const html = renderToStaticMarkup(
        <TrackActionMenu
          track={mockTrack1}
          index={0}
          isFav={false}
          isPlaylistView={false}
          isImportedFilesView={false}
          onClose={() => {}}
          onPlayNext={() => {}}
          onAddToQueue={() => {}}
          onOpenPlaylistModal={() => {}}
          onToggleFavourite={() => {}}
          showToast={() => {}}
        />
      );

      expect(html).toContain('Play Next');
      expect(html).toContain('Add to Queue');
      expect(html).toContain('Add to Playlist...');
      expect(html).toContain('Add to Favourites');
    });

    it('renders Remove from Playlist in playlist view', () => {
      const html = renderToStaticMarkup(
        <TrackActionMenu
          track={mockTrack1}
          index={0}
          isFav={false}
          isPlaylistView={true}
          isImportedFilesView={false}
          onClose={() => {}}
          onOpenPlaylistModal={() => {}}
          onToggleFavourite={() => {}}
          onRemoveFromPlaylist={() => {}}
          showToast={() => {}}
        />
      );

      expect(html).toContain('Remove from Playlist');
    });

    it('renders Remove from Library in imported files view', () => {
      const html = renderToStaticMarkup(
        <TrackActionMenu
          track={mockTrack3}
          index={2}
          isFav={false}
          isPlaylistView={false}
          isImportedFilesView={true}
          onClose={() => {}}
          onOpenPlaylistModal={() => {}}
          onToggleFavourite={() => {}}
          onRemoveImportedFiles={() => {}}
          showToast={() => {}}
        />
      );

      expect(html).toContain('Remove from Library');
    });
  });

  describe('6. BulkActionToolbar Component', () => {
    it('renders nothing when selectedCount is 0', () => {
      const html = renderToStaticMarkup(
        <BulkActionToolbar
          selectedCount={0}
          areAllSelectedFavourites={false}
          isPlaylistView={false}
          isImportedFilesView={false}
          hasRemoveFromPlaylist={false}
          hasRemoveImportedFiles={false}
          onBulkPlayNext={() => {}}
          onBulkAddToQueue={() => {}}
          onOpenBulkPlaylistModal={() => {}}
          onBulkToggleFavourites={() => {}}
          onBulkRemoveFromPlaylist={() => {}}
          onBulkRemoveFromImportedFiles={() => {}}
          onClearSelection={() => {}}
        />
      );

      expect(html).toBe('');
    });

    it('renders floating toolbar with action buttons when items are selected', () => {
      const html = renderToStaticMarkup(
        <BulkActionToolbar
          selectedCount={2}
          areAllSelectedFavourites={false}
          isPlaylistView={false}
          isImportedFilesView={false}
          hasRemoveFromPlaylist={false}
          hasRemoveImportedFiles={false}
          onBulkPlayNext={() => {}}
          onBulkAddToQueue={() => {}}
          onOpenBulkPlaylistModal={() => {}}
          onBulkToggleFavourites={() => {}}
          onBulkRemoveFromPlaylist={() => {}}
          onBulkRemoveFromImportedFiles={() => {}}
          onClearSelection={() => {}}
        />
      );

      expect(html).toContain('2 selected');
      expect(html).toContain('Play Next');
      expect(html).toContain('Add to Queue');
      expect(html).toContain('Playlist');
      expect(html).toContain('Favourite');
      expect(html).toContain('Clear selection');
    });

    it('displays Unfavourite when all selected tracks are already favourited', () => {
      const html = renderToStaticMarkup(
        <BulkActionToolbar
          selectedCount={2}
          areAllSelectedFavourites={true}
          isPlaylistView={false}
          isImportedFilesView={false}
          hasRemoveFromPlaylist={false}
          hasRemoveImportedFiles={false}
          onBulkPlayNext={() => {}}
          onBulkAddToQueue={() => {}}
          onOpenBulkPlaylistModal={() => {}}
          onBulkToggleFavourites={() => {}}
          onBulkRemoveFromPlaylist={() => {}}
          onBulkRemoveFromImportedFiles={() => {}}
          onClearSelection={() => {}}
        />
      );

      expect(html).toContain('Unfavourite');
    });
  });

  describe('7. TrackPlaylistModals Component', () => {
    it('renders single track playlist modal when target track is set', () => {
      const html = renderToStaticMarkup(
        <TrackPlaylistModals
          playlists={mockPlaylists}
          playlistModalTrack={mockTrack1}
          bulkPlaylistModalOpen={false}
          selectedTracks={[]}
          onCloseSingleModal={() => {}}
          onCloseBulkModal={() => {}}
          onClearSelection={() => {}}
          showToast={() => {}}
        />
      );

      expect(html).toContain('Add to Playlist');
      expect(html).toContain('Synthwave Hits');
    });

    it('renders bulk playlist modal when bulk modal open flag is true', () => {
      const html = renderToStaticMarkup(
        <TrackPlaylistModals
          playlists={mockPlaylists}
          playlistModalTrack={null}
          bulkPlaylistModalOpen={true}
          selectedTracks={[mockTrack1, mockTrack2]}
          onCloseSingleModal={() => {}}
          onCloseBulkModal={() => {}}
          onClearSelection={() => {}}
          showToast={() => {}}
        />
      );

      expect(html).toContain('Add 2 Tracks to Playlist');
      expect(html).toContain('Synthwave Hits');
    });
  });

  describe('8. Integrated TrackList Component', () => {
    it('renders complete table with rows and header', () => {
      const onPlayTrack = vi.fn();
      const onTogglePlay = vi.fn();
      const onToggleFavourite = vi.fn();

      const html = renderToStaticMarkup(
        <TrackList
          tracks={mockTracks}
          currentTrackId={mockTrack1.id}
          isPlaying={true}
          favourites={new Set(['f1:song1.mp3'])}
          playlists={mockPlaylists}
          onPlayTrack={onPlayTrack}
          onTogglePlay={onTogglePlay}
          onToggleFavourite={onToggleFavourite}
        />
      );

      expect(html).toContain('Neon Nights');
      expect(html).toContain('Midnight Drive');
      expect(html).toContain('Unreadable Recording');
      expect(html).toContain('3 tracks');
    });

    it('renders empty state when tracks array is empty', () => {
      const html = renderToStaticMarkup(
        <TrackList
          tracks={[]}
          isPlaying={false}
          favourites={new Set()}
          onPlayTrack={() => {}}
          onTogglePlay={() => {}}
          onToggleFavourite={() => {}}
          emptyVariant="favourites"
        />
      );

      expect(html).toContain('No favourite tracks yet');
    });
  });
});
