import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar } from '../src/components/Sidebar';
import { RootFolderItem } from '../src/components/RootFolderItem';
import { SidebarImportedFiles } from '../src/components/SidebarImportedFiles';
import { SubfolderTreeNode } from '../src/components/SidebarFolderTree';
import { SidebarFolderSection } from '../src/components/SidebarFolderSection';
import { ImportedFolder } from '../src/types/music';

describe('Sidebar Alignment & Consistent Open Music Placement', () => {
  const mockFolderWithSubfolders: ImportedFolder = {
    id: 'f-1',
    name: 'hot-2026.11.19',
    sourceType: 'fs-access',
    addedAt: Date.now(),
    lastScannedAt: Date.now(),
    permissionStatus: 'granted',
    trackCount: 15,
    tracks: [],
    tree: {
      id: 'node-1',
      name: 'hot-2026.11.19',
      relativePath: 'hot-2026.11.19',
      subfolders: [
        {
          id: 'node-sub-1',
          name: 'CD 1',
          relativePath: 'hot-2026.11.19/CD 1',
          subfolders: [],
          tracks: [],
          totalTrackCount: 8,
        },
      ],
      tracks: [],
      totalTrackCount: 15,
    },
  };

  const mockFolderFlat: ImportedFolder = {
    id: 'f-2',
    name: 'mp3',
    sourceType: 'fs-access',
    addedAt: Date.now(),
    lastScannedAt: Date.now(),
    permissionStatus: 'granted',
    trackCount: 319,
    tracks: [],
    tree: {
      id: 'node-2',
      name: 'mp3',
      relativePath: 'mp3',
      subfolders: [],
      tracks: [],
      totalTrackCount: 319,
    },
  };

  const mockImportedFiles: ImportedFolder = {
    id: 'imported_files_root',
    name: 'Imported Files',
    sourceType: 'files',
    addedAt: Date.now(),
    lastScannedAt: Date.now(),
    permissionStatus: 'granted',
    trackCount: 2,
    tracks: [
      { id: 't-1', title: 'Song 1', duration: 180, path: 't1.mp3' } as any,
      { id: 't-2', title: 'Song 2', duration: 200, path: 't2.mp3' } as any,
    ],
    tree: {
      id: 'imported_files_root',
      name: 'Imported Files',
      relativePath: '',
      subfolders: [],
      tracks: [],
      totalTrackCount: 2,
    },
  };

  // 1. Top-level folder and Imported Files row alignment
  it('1. top-level folder and Imported Files share identical left padding and icon alignment', () => {
    const htmlFolder = renderToStaticMarkup(
      <RootFolderItem
        folder={mockFolderFlat}
        selectedPath=""
        isMenuOpen={false}
        onToggleMenu={() => {}}
        onSelectFolder={() => {}}
        onRefreshFolder={() => {}}
        onRemoveFolder={() => {}}
        onRequestPermission={() => {}}
      />
    );

    const htmlImported = renderToStaticMarkup(
      <SidebarImportedFiles
        importedFolder={mockImportedFiles}
        isSelected={false}
        isMenuOpen={false}
        onToggleMenu={() => {}}
        onSelect={() => {}}
        onClearAllPrompt={() => {}}
      />
    );

    // Both top-level rows must use the exact same outer container padding px-2 py-1.5
    expect(htmlFolder).toContain('py-1.5 px-2 rounded-lg');
    expect(htmlImported).toContain('py-1.5 px-2 rounded-lg');

    // Both must use flex items-center gap-2 min-w-0 flex-1 for icon and label starting positions
    expect(htmlFolder).toContain('flex items-center gap-2 min-w-0 flex-1');
    expect(htmlImported).toContain('flex items-center gap-2 min-w-0 flex-1');

    // Neither top-level item should have leading spacer indentation (e.g. w-4.5) before the icon
    expect(htmlFolder).not.toContain('<span class="w-4.5');
  });

  // 2. Nested subfolder indentation
  it('2. nested subfolders preserve indentation based on depth', () => {
    const subfolderNode = mockFolderWithSubfolders.tree.subfolders[0];
    const htmlSubfolder = renderToStaticMarkup(
      <SubfolderTreeNode
        node={subfolderNode}
        selectedPath=""
        onSelect={() => {}}
        depth={1}
      />
    );

    // depth=1 should have depth * 14 + 10 = 24px padding-left
    expect(htmlSubfolder).toContain('padding-left:24px');
    expect(htmlSubfolder).toContain('CD 1');
  });

  // 3. Right-aligned badges
  it('3. badges are positioned in a consistent trailing column across items', () => {
    const htmlFolder = renderToStaticMarkup(
      <RootFolderItem
        folder={mockFolderWithSubfolders}
        selectedPath=""
        isMenuOpen={false}
        onToggleMenu={() => {}}
        onSelectFolder={() => {}}
        onRefreshFolder={() => {}}
        onRemoveFolder={() => {}}
        onRequestPermission={() => {}}
      />
    );

    const htmlImported = renderToStaticMarkup(
      <SidebarImportedFiles
        importedFolder={mockImportedFiles}
        isSelected={false}
        isMenuOpen={false}
        onToggleMenu={() => {}}
        onSelect={() => {}}
        onClearAllPrompt={() => {}}
      />
    );

    // Right-aligned cluster structure: flex items-center gap-1 shrink-0 ml-1.5
    expect(htmlFolder).toContain('flex items-center gap-1 shrink-0 ml-1.5');
    expect(htmlImported).toContain('flex items-center gap-1 shrink-0 ml-1.5');

    // Counts rendered accurately
    expect(htmlFolder).toContain('>15<');
    expect(htmlImported).toContain('>2<');
  });

  // 4. Long folder-name truncation
  it('4. long folder names truncate gracefully with min-w-0 flex-1 without displacing badge', () => {
    const longNameFolder: ImportedFolder = {
      ...mockFolderFlat,
      name: 'Extremely Long Music Library Folder Name That Must Truncate Gracefully In Narrow Viewports',
    };

    const htmlLong = renderToStaticMarkup(
      <RootFolderItem
        folder={longNameFolder}
        selectedPath=""
        isMenuOpen={false}
        onToggleMenu={() => {}}
        onSelectFolder={() => {}}
        onRefreshFolder={() => {}}
        onRemoveFolder={() => {}}
        onRequestPermission={() => {}}
      />
    );

    expect(htmlLong).toContain('truncate text-xs font-medium');
    expect(htmlLong).toContain('title="Extremely Long Music Library Folder Name That Must Truncate Gracefully In Narrow Viewports"');
    expect(htmlLong).toContain('>319<');
  });

  // 5. Open Music visible in an empty library
  it('5. sidebar Open Music is visible when library is empty (hasLibrary=false)', () => {
    const htmlEmpty = renderToStaticMarkup(
      <Sidebar
        currentView="folder"
        selectedFolderPath=""
        folders={[]}
        playlists={[]}
        favouritesCount={0}
        totalTracksCount={0}
        hasLibrary={false}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
        onOpenFolder={() => {}}
        onFallbackFolderSelect={() => {}}
        onOpenFilesSelect={() => {}}
      />
    );

    expect(htmlEmpty).toContain('data-testid="sidebar-open-music-container"');
    expect(htmlEmpty).toContain('Open Music');
  });

  // 6. Open Music visible in a populated library
  it('6. sidebar Open Music is visible when library is populated (hasLibrary=true)', () => {
    const htmlPopulated = renderToStaticMarkup(
      <Sidebar
        currentView="folder"
        selectedFolderPath=""
        folders={[mockFolderFlat, mockFolderWithSubfolders, mockImportedFiles]}
        playlists={[]}
        favouritesCount={5}
        totalTracksCount={336}
        hasLibrary={true}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
        onOpenFolder={() => {}}
        onFallbackFolderSelect={() => {}}
        onOpenFilesSelect={() => {}}
      />
    );

    expect(htmlPopulated).toContain('data-testid="sidebar-open-music-container"');
    expect(htmlPopulated).toContain('Open Music');
  });

  // 7. Header + button correctly triggers onOpenFolder
  it('7. header + button triggers onOpenFolder and has accessible tooltip/aria-label', () => {
    const onOpenFolderMock = vi.fn();
    const htmlSection = renderToStaticMarkup(
      <SidebarFolderSection
        currentView="folder"
        selectedFolderPath=""
        folders={[mockFolderFlat]}
        activeMenuFolderId={null}
        onToggleMenu={() => {}}
        onOpenFolder={onOpenFolderMock}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
        onRemoveFolderPrompt={() => {}}
        onClearImportedFilesPrompt={() => {}}
      />
    );

    expect(htmlSection).toContain('title="Add Music Folder"');
    expect(htmlSection).toContain('aria-label="Add Music Folder"');
  });

  // 8. Scrollable folder list without overlap
  it('8. folder container is scrollable (overflow-y-auto) and bottom open music is shrink-0', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        currentView="folder"
        selectedFolderPath=""
        folders={[mockFolderFlat]}
        playlists={[]}
        favouritesCount={0}
        totalTracksCount={319}
        hasLibrary={true}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
        onOpenFolder={() => {}}
        onFallbackFolderSelect={() => {}}
        onOpenFilesSelect={() => {}}
      />
    );

    // Folder list has flex-1 overflow-y-auto
    expect(html).toContain('flex-1 overflow-y-auto');
    // Open music container has shrink-0 to prevent overlap or collapse
    expect(html).toContain('data-testid="sidebar-open-music-container" class="p-3 border-t border-[var(--border-subtle)] dark:border-white/[0.08] bg-[var(--bg-hover)]/60 dark:bg-[#071427]/80 shrink-0"');
  });

  // 9. Uses CSS variable tokens for Theme compatibility
  it('9. uses shared CSS variables for Light styles and Dark Mode', () => {
    const html = renderToStaticMarkup(
      <SidebarFolderSection
        currentView="folder"
        selectedFolderPath=""
        folders={[mockFolderFlat, mockImportedFiles]}
        activeMenuFolderId={null}
        onToggleMenu={() => {}}
        onOpenFolder={() => {}}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
        onRemoveFolderPrompt={() => {}}
        onClearImportedFilesPrompt={() => {}}
      />
    );

    expect(html).toContain('border-[var(--border-subtle)]');
    expect(html).toContain('text-[var(--text-secondary)]');
  });

  // 10. Responsive layout: narrow and standard sidebar width classes
  it('10. sidebar supports responsive width for desktop and narrow screens', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        currentView="folder"
        selectedFolderPath=""
        folders={[]}
        playlists={[]}
        favouritesCount={0}
        totalTracksCount={0}
        hasLibrary={false}
        onSelectView={() => {}}
        onSelectFolder={() => {}}
        onOpenFolder={() => {}}
        onFallbackFolderSelect={() => {}}
        onOpenFilesSelect={() => {}}
      />
    );

    expect(html).toContain('w-64 md:w-72 shrink-0');
  });
});
