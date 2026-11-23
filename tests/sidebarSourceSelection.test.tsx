import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar } from '../src/components/Sidebar';
import { SidebarFolderSection } from '../src/components/SidebarFolderSection';
import { useLibraryNavigation } from '../src/hooks/useLibraryNavigation';
import { getStoredNavigation, storeNavigation } from '../src/utils/navigationStorage';
import {
  ImportedFolder,
  IMPORTED_FILES_ROOT_ID,
  LibraryView,
  TrackItem,
} from '../src/types/music';

const createSessionStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

function renderHookSync<T>(useHook: () => T): T {
  let result!: T;
  function Harness() {
    result = useHook();
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return result;
}

function makeTrack(id: string, name: string): TrackItem {
  return {
    id,
    name: `${name}.mp3`,
    relativePath: `${name}.mp3`,
    size: 2048,
    lastModified: 1700000000,
    metadata: {
      title: name,
      artist: 'Artist',
      album: 'Album',
      duration: 180,
      isMetadataLoaded: true,
    },
  };
}

const folderA: ImportedFolder = {
  id: 'hot-2026.11.19',
  name: 'hot-2026.11.19',
  sourceType: 'fs-access',
  tracks: [makeTrack('t1', 'Song 1')],
  trackCount: 1,
  addedAt: 1000,
  lastScannedAt: 1000,
  permissionStatus: 'granted',
  tree: {
    id: 'hot-2026.11.19',
    name: 'hot-2026.11.19',
    relativePath: 'hot-2026.11.19',
    tracks: [],
    subfolders: [
      {
        id: 'hot-2026.11.19/CD1',
        name: 'CD1',
        relativePath: 'hot-2026.11.19/CD1',
        tracks: [makeTrack('t1', 'Song 1')],
        subfolders: [],
        totalTrackCount: 1,
      },
    ],
    totalTrackCount: 1,
  },
};

const folderB: ImportedFolder = {
  id: 'mp3',
  name: 'mp3',
  sourceType: 'fs-access',
  tracks: [makeTrack('t2', 'Song 2')],
  trackCount: 1,
  addedAt: 2000,
  lastScannedAt: 2000,
  permissionStatus: 'granted',
  tree: {
    id: 'mp3',
    name: 'mp3',
    relativePath: 'mp3',
    tracks: [makeTrack('t2', 'Song 2')],
    subfolders: [],
    totalTrackCount: 1,
  },
};

const importedFiles: ImportedFolder = {
  id: IMPORTED_FILES_ROOT_ID,
  name: 'Imported Files',
  sourceType: 'files',
  tracks: [makeTrack('t3', 'Loose Song')],
  trackCount: 1,
  addedAt: 3000,
  lastScannedAt: 3000,
  permissionStatus: 'granted',
  tree: {
    id: IMPORTED_FILES_ROOT_ID,
    name: 'Imported Files',
    relativePath: IMPORTED_FILES_ROOT_ID,
    tracks: [makeTrack('t3', 'Loose Song')],
    subfolders: [],
    totalTrackCount: 1,
  },
};

function countActiveSources(html: string): number {
  return (html.match(/role="button" data-active="true"/g) || []).length;
}

function renderFolderSection(currentView: LibraryView, selectedFolderPath: string): string {
  return renderToStaticMarkup(
    <SidebarFolderSection
      currentView={currentView}
      selectedFolderPath={selectedFolderPath}
      folders={[folderA, folderB, importedFiles]}
      activeMenuFolderId={null}
      onToggleMenu={() => {}}
      onOpenFolder={() => {}}
      onFallbackFolderSelect={() => {}}
      onSelectView={() => {}}
      onSelectFolder={() => {}}
      onRemoveFolderPrompt={() => {}}
      onClearImportedFilesPrompt={() => {}}
    />
  );
}

describe('Sidebar Source Selection & Softened Active States', () => {
  beforeEach(() => {
    if (typeof globalThis.sessionStorage === 'undefined') {
      // @ts-expect-error Mocking sessionStorage in Node test runner
      globalThis.sessionStorage = createSessionStorageMock();
    }
    globalThis.sessionStorage.clear();
  });

  it('1 & 2. highlights only the selected physical folder (Folder A -> Folder B)', () => {
    const htmlA = renderFolderSection('folder', 'hot-2026.11.19');
    expect(countActiveSources(htmlA)).toBe(1);
    expect(htmlA).toContain('data-testid="root-folder-hot-2026.11.19"><div tabindex="0" role="button" data-active="true" aria-current="page"');
    expect(htmlA).toContain('data-testid="root-folder-mp3"><div tabindex="0" role="button" data-active="false"');
    expect(htmlA).toContain('data-testid="sidebar-imported-files"><div tabindex="0" role="button" data-active="false"');

    const htmlB = renderFolderSection('folder', 'mp3');
    expect(countActiveSources(htmlB)).toBe(1);
    expect(htmlB).toContain('data-testid="root-folder-hot-2026.11.19"><div tabindex="0" role="button" data-active="false"');
    expect(htmlB).toContain('data-testid="root-folder-mp3"><div tabindex="0" role="button" data-active="true" aria-current="page"');
    expect(htmlB).toContain('data-testid="sidebar-imported-files"><div tabindex="0" role="button" data-active="false"');
  });

  it('3 & 4. switching Folder -> Imported Files and Imported Files -> Folder never leaves two sources active', () => {
    // Even if a stale selectedFolderPath were somehow passed when view is imported-files,
    // SidebarFolderSection derives activePhysicalFolderPath = '' so ONLY Imported Files is active.
    const htmlImported = renderFolderSection('imported-files', 'hot-2026.11.19');
    expect(countActiveSources(htmlImported)).toBe(1);
    expect(htmlImported).toContain('data-testid="root-folder-hot-2026.11.19"><div tabindex="0" role="button" data-active="false"');
    expect(htmlImported).toContain('data-testid="root-folder-mp3"><div tabindex="0" role="button" data-active="false"');
    expect(htmlImported).toContain('data-testid="sidebar-imported-files"><div tabindex="0" role="button" data-active="true" aria-current="page"');

    // Navigation hook itself clears selectedFolderPath when switching to imported-files
    const nav = renderHookSync(() => useLibraryNavigation(null));
    nav.selectFolder('hot-2026.11.19');
    expect(getStoredNavigation()).toMatchObject({ view: 'folder', selectedFolderPath: 'hot-2026.11.19' });

    nav.setCurrentView('imported-files');
    expect(getStoredNavigation()).toMatchObject({ view: 'imported-files', selectedFolderPath: '' });

    // Switching back to Folder A activates only Folder A
    nav.selectFolder('hot-2026.11.19');
    expect(getStoredNavigation()).toMatchObject({ view: 'folder', selectedFolderPath: 'hot-2026.11.19' });
  });

  it('5. switching to other main navigation views clears stored folder selection', () => {
    const nav = renderHookSync(() => useLibraryNavigation(null));
    nav.selectFolder('hot-2026.11.19');

    for (const view of ['all', 'playlists', 'albums', 'artists', 'favourites'] as LibraryView[]) {
      nav.setCurrentView(view);
      expect(getStoredNavigation()?.view).toBe(view);
      expect(getStoredNavigation()?.selectedFolderPath).toBe('');
    }
  });

  it('6. Folders overview has Folders active in primary nav and zero active sources', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        currentView="folder"
        selectedFolderPath=""
        folders={[folderA, folderB, importedFiles]}
        playlists={[]}
        favouritesCount={0}
        totalTracksCount={3}
        albumsCount={1}
        artistsCount={1}
        hasLibrary={true}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
        onOpenFolder={() => {}}
        onFallbackFolderSelect={() => {}}
        onOpenFilesSelect={() => {}}
      />
    );

    expect(html).toContain('data-testid="nav-item-folders" data-active="true" aria-current="page"');
    expect(countActiveSources(html)).toBe(0);
  });

  it('7. navigation restoration ignores stale selectedFolderPath when restoring imported-files', () => {
    // Simulate stale sessionStorage from before the fix
    storeNavigation({ view: 'imported-files', selectedFolderPath: 'hot-2026.11.19' });
    const nav = renderHookSync(() => useLibraryNavigation(null));
    expect(nav.currentView).toBe('imported-files');
    expect(nav.selectedFolderPath).toBe('');

    // Restoring a physical folder preserves its path
    storeNavigation({ view: 'folder', selectedFolderPath: 'hot-2026.11.19/CD1' });
    const navFolder = renderHookSync(() => useLibraryNavigation(null));
    expect(navFolder.currentView).toBe('folder');
    expect(navFolder.selectedFolderPath).toBe('hot-2026.11.19/CD1');
  });

  it('8. removing an active folder clears selectedFolderPath via resetFolderSelectionIfMatching', () => {
    storeNavigation({ view: 'folder', selectedFolderPath: 'hot-2026.11.19/CD1' });
    const nav = renderHookSync(() => useLibraryNavigation(null));
    nav.resetFolderSelectionIfMatching('hot-2026.11.19');
    expect(getStoredNavigation()?.selectedFolderPath).toBe('');
  });

  it('9. nested folder selection highlights only the nested subfolder, not its root folder or Imported Files', () => {
    const html = renderFolderSection('folder', 'hot-2026.11.19/CD1');
    expect(countActiveSources(html)).toBe(1);
    expect(html).toContain('data-testid="root-folder-hot-2026.11.19"><div tabindex="0" role="button" data-active="false"');
    expect(html).toContain('data-testid="sidebar-imported-files"><div tabindex="0" role="button" data-active="false"');
    // Subfolder CD1 is expanded and active
    expect(html).toContain('title="CD1"');
  });

  it('10, 11, 12 & 13. enforces soft theme-token styling, accessible focus, two-level hierarchy, and preserved nav badges', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        currentView="imported-files"
        selectedFolderPath=""
        folders={[folderA, folderB, importedFiles]}
        playlists={[{ id: 'p1', name: 'Mix', tracks: [], createdAt: 1, updatedAt: 1 }]}
        favouritesCount={2}
        totalTracksCount={3}
        albumsCount={1}
        artistsCount={1}
        hasLibrary={true}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
        onOpenFolder={() => {}}
        onFallbackFolderSelect={() => {}}
        onOpenFilesSelect={() => {}}
      />
    );

    // Primary nav Folders is active (Level 1: softer bg-[var(--bg-active)]/75, border-transparent, no shadow)
    expect(html).toContain('data-testid="nav-item-folders" data-active="true" aria-current="page"');
    expect(html).toContain('bg-[var(--bg-active)]/75 dark:bg-white/[0.06]');

    // Imported Files is active source (Level 2: bg-[var(--bg-active)] dark:bg-white/[0.1], subtle border, no shadow)
    expect(html).toContain('bg-[var(--bg-active)] dark:bg-white/[0.1] text-[var(--text-primary)] dark:text-white font-semibold border-[var(--accent-primary)]/20 dark:border-white/[0.12]');

    // No heavy purple/indigo backgrounds or drop shadows on selected sidebar rows
    expect(html).not.toContain('bg-indigo-600/15');
    expect(html).not.toContain('bg-indigo-600/20');
    expect(html).not.toContain('dark:bg-indigo-600/25');
    expect(html).not.toContain('border-indigo-500/30');

    // Hover state distinct from active state & accessible focus-visible ring present
    expect(html).toContain('hover:bg-[var(--bg-hover)]');
    expect(html).toContain('focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50');

    // All 6 navigation badges preserved with exact counts
    expect(html).toContain('data-testid="nav-badge-all"');
    expect(html).toContain('data-testid="nav-badge-folders"');
    expect(html).toContain('data-testid="nav-badge-playlists"');
    expect(html).toContain('data-testid="nav-badge-albums"');
    expect(html).toContain('data-testid="nav-badge-artists"');
    expect(html).toContain('data-testid="nav-badge-favourites"');
  });
});
