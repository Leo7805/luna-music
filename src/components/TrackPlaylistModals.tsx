import { TrackItem, Playlist } from '../types/music';
import { PlaylistModal } from './PlaylistModal';

export interface TrackPlaylistModalsProps {
  playlists: Playlist[];
  playlistModalTrack: TrackItem | null;
  bulkPlaylistModalOpen: boolean;
  selectedTracks: TrackItem[];
  onCloseSingleModal: () => void;
  onCloseBulkModal: () => void;
  onAddToPlaylist?: (playlistId: string, track: TrackItem) => boolean;
  onAddTracksToPlaylist?: (playlistId: string, tracks: TrackItem[]) => { addedCount: number };
  onCreateAndAddToPlaylist?: (playlistName: string, trackOrTracks: TrackItem | TrackItem[]) => void;
  onClearSelection: () => void;
  showToast: (msg: string) => void;
}

export function TrackPlaylistModals({
  playlists,
  playlistModalTrack,
  bulkPlaylistModalOpen,
  selectedTracks,
  onCloseSingleModal,
  onCloseBulkModal,
  onAddToPlaylist,
  onAddTracksToPlaylist,
  onCreateAndAddToPlaylist,
  onClearSelection,
  showToast,
}: TrackPlaylistModalsProps) {
  return (
    <>
      {/* Add Single Track to Playlist Modal */}
      <PlaylistModal
        isOpen={Boolean(playlistModalTrack)}
        mode="addToPlaylist"
        playlists={playlists}
        targetTrack={playlistModalTrack}
        onClose={onCloseSingleModal}
        onSelectPlaylist={(plId) => {
          if (playlistModalTrack && onAddToPlaylist) {
            const added = onAddToPlaylist(plId, playlistModalTrack);
            if (added) {
              const pl = playlists.find((p) => p.id === plId);
              showToast(`Added to "${pl?.name || 'Playlist'}"`);
            } else {
              showToast('Track already in playlist');
            }
          }
          onCloseSingleModal();
        }}
        onCreateAndAdd={(newName) => {
          if (playlistModalTrack && onCreateAndAddToPlaylist) {
            onCreateAndAddToPlaylist(newName, playlistModalTrack);
            showToast(`Created & added to "${newName}"`);
          }
          onCloseSingleModal();
        }}
      />

      {/* Bulk Add Tracks to Playlist Modal */}
      <PlaylistModal
        isOpen={bulkPlaylistModalOpen}
        mode="addToPlaylist"
        playlists={playlists}
        targetTracks={selectedTracks}
        onClose={onCloseBulkModal}
        onSelectPlaylist={(plId) => {
          if (selectedTracks.length > 0 && onAddTracksToPlaylist) {
            const { addedCount } = onAddTracksToPlaylist(plId, selectedTracks);
            const pl = playlists.find((p) => p.id === plId);
            if (addedCount > 0) {
              showToast(`Added ${addedCount} tracks to "${pl?.name || 'Playlist'}"`);
            } else {
              showToast('Selected tracks already in playlist');
            }
          } else if (selectedTracks.length > 0 && onAddToPlaylist) {
            for (const t of selectedTracks) {
              onAddToPlaylist(plId, t);
            }
            const pl = playlists.find((p) => p.id === plId);
            showToast(`Added tracks to "${pl?.name || 'Playlist'}"`);
          }
          onCloseBulkModal();
          onClearSelection();
        }}
        onCreateAndAdd={(newName) => {
          if (selectedTracks.length > 0 && onCreateAndAddToPlaylist) {
            onCreateAndAddToPlaylist(newName, selectedTracks);
            showToast(`Created & added ${selectedTracks.length} tracks to "${newName}"`);
          }
          onCloseBulkModal();
          onClearSelection();
        }}
      />
    </>
  );
}
