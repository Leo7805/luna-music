import { LibraryView } from '../types/music';

export interface StoredNavigationState {
  view: LibraryView;
  selectedFolderPath?: string;
  selectedArtistName?: string | null;
  selectedAlbumId?: string | null;
  selectedPlaylistId?: string | null;
}

export const SESSION_STORAGE_NAV_KEY = 'luna_music_nav_state';

const VALID_VIEWS: Set<LibraryView> = new Set([
  'all',
  'folder',
  'playlists',
  'artists',
  'albums',
  'favourites',
  'imported-files',
]);

/**
 * Safely loads the stored navigation state from sessionStorage (tab-scoped).
 * Returns null if storage is unavailable, empty, or corrupted.
 */
export function getStoredNavigation(): StoredNavigationState | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(SESSION_STORAGE_NAV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.view === 'string' && VALID_VIEWS.has(parsed.view as LibraryView)) {
      return {
        view: parsed.view as LibraryView,
        selectedFolderPath: typeof parsed.selectedFolderPath === 'string' ? parsed.selectedFolderPath : '',
        selectedArtistName: typeof parsed.selectedArtistName === 'string' ? parsed.selectedArtistName : null,
        selectedAlbumId: typeof parsed.selectedAlbumId === 'string' ? parsed.selectedAlbumId : null,
        selectedPlaylistId: typeof parsed.selectedPlaylistId === 'string' ? parsed.selectedPlaylistId : null,
      };
    }
  } catch {
    // Gracefully handle storage errors / private mode
  }
  return null;
}

/**
 * Persists navigation changes to sessionStorage (tab-scoped).
 */
export function storeNavigation(state: Partial<StoredNavigationState>): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const current = getStoredNavigation() || { view: 'all', selectedFolderPath: '' };
    const merged: StoredNavigationState = {
      ...current,
      ...state,
    };
    sessionStorage.setItem(SESSION_STORAGE_NAV_KEY, JSON.stringify(merged));
  } catch {
    // Gracefully handle storage errors
  }
}

/**
 * Clears stored navigation state.
 */
export function clearStoredNavigation(): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(SESSION_STORAGE_NAV_KEY);
  } catch {
    // Ignore
  }
}
