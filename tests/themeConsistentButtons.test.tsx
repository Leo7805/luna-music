import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SidebarPlaylists } from '../src/components/SidebarPlaylists';
import { PlaylistsView } from '../src/components/PlaylistsView';
import { ConfirmModal } from '../src/components/ConfirmModal';
import { PlaylistModal } from '../src/components/PlaylistModal';
import { RecoveryBanner } from '../src/components/RecoveryBanner';

describe('Theme-Consistent Buttons & Option B Styling', () => {
  describe('1. SidebarPlaylists Empty State Create Playlist Button', () => {
    it('applies Option B subtle tinted styling with theme variables and no saturated indigo', () => {
      const html = renderToStaticMarkup(
        <SidebarPlaylists
          playlists={[]}
          selectedPlaylistId={null}
          activeMenuPlaylistId={null}
          onToggleMenu={vi.fn()}
          onSelectView={vi.fn()}
          onCreatePrompt={vi.fn()}
          onRenamePrompt={vi.fn()}
          onDeletePrompt={vi.fn()}
        />
      );

      // Verify empty state text and prompt
      expect(html).toContain('No playlists yet');
      expect(html).toContain('Create Playlist');

      // Option B styling checks
      expect(html).toContain('bg-[var(--accent-primary)]/10');
      expect(html).toContain('border-[var(--accent-primary)]/25');
      expect(html).toContain('text-[var(--accent-primary)]');
      expect(html).toContain('dark:bg-white/[0.08]');
      expect(html).toContain('dark:border-white/[0.12]');
      expect(html).toContain('dark:text-slate-100');

      // Crucial: no hardcoded saturated indigo fill
      expect(html).not.toContain('bg-indigo-600');
      expect(html).not.toContain('hover:bg-indigo-700');
    });
  });

  describe('2. PlaylistsView Header Create Playlist Button', () => {
    it('applies Option B secondary styling and avoids hardcoded saturated indigo button', () => {
      const html = renderToStaticMarkup(
        <PlaylistsView
          playlists={[]}
          selectedPlaylistId={null}
          libraryTracks={[]}
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
          onRemoveTrackFromPlaylist={vi.fn()}
          onReorderPlaylistTracks={vi.fn()}
        />
      );

      expect(html).toContain('Create Playlist');
      expect(html).toContain('bg-[var(--accent-primary)]/10');
      expect(html).toContain('border-[var(--accent-primary)]/25');
      expect(html).toContain('text-[var(--accent-primary)]');
      expect(html).not.toContain('bg-indigo-600');
    });
  });

  describe('3. ConfirmModal Primary Action Button', () => {
    it('uses theme-aware accent colors instead of hardcoded indigo for non-danger actions', () => {
      const html = renderToStaticMarkup(
        <ConfirmModal
          isOpen={true}
          title="Confirm Action"
          message="Are you sure?"
          confirmLabel="Proceed"
          isDanger={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(html).toContain('Proceed');
      expect(html).toContain('bg-[var(--accent-primary)]');
      expect(html).toContain('hover:bg-[var(--accent-hover)]');
      expect(html).not.toContain('bg-indigo-600');
    });

    it('preserves semantic danger color when isDanger is true', () => {
      const html = renderToStaticMarkup(
        <ConfirmModal
          isOpen={true}
          title="Delete Item"
          message="Delete forever?"
          confirmLabel="Delete"
          isDanger={true}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(html).toContain('bg-rose-600');
      expect(html).toContain('hover:bg-rose-700');
    });
  });

  describe('4. PlaylistModal Action Buttons and Inputs', () => {
    it('uses theme accent for submit buttons and focus border rings', () => {
      const html = renderToStaticMarkup(
        <PlaylistModal
          isOpen={true}
          mode="create"
          onClose={vi.fn()}
          onSubmitName={vi.fn()}
        />
      );

      expect(html).toContain('bg-[var(--accent-primary)]');
      expect(html).toContain('hover:bg-[var(--accent-hover)]');
      expect(html).toContain('focus:border-[var(--accent-primary)]');
      expect(html).not.toContain('bg-indigo-600');
    });
  });

  describe('5. RecoveryBanner Permissions Button', () => {
    it('uses theme accent instead of hardcoded indigo', () => {
      const html = renderToStaticMarkup(<RecoveryBanner onRestore={vi.fn()} />);

      expect(html).toContain('Grant Permission');
      expect(html).toContain('bg-[var(--accent-primary)]');
      expect(html).toContain('hover:bg-[var(--accent-hover)]');
      expect(html).not.toContain('bg-indigo-600');
    });
  });
});
