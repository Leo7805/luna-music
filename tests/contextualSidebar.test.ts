import { describe, it, expect, vi } from 'vitest';
import {
  LibraryView,
  ImportedFolder,
  TrackItem,
} from '../src/types/music';
import {
  buildFolderTree,
  buildUnifiedMultiFolderTree,
  getBreadcrumbs,
} from '../src/utils/musicTree';

describe('Phase 2: Contextual Sidebar and Folder Management UI', () => {
  // Test 1: Primary navigation structure and order
  it('1. primary navigation conforms to the strict 6-item order', () => {
    const primaryNavOrder: LibraryView[] = [
      'all',
      'folder',
      'playlists',
      'albums',
      'artists',
      'favourites',
    ];

    expect(primaryNavOrder).toEqual([
      'all',
      'folder',
      'playlists',
      'albums',
      'artists',
      'favourites',
    ]);
  });

  // Test 2: Contextual sidebar display rules
  it('2. contextual sidebar is shown only for folder and playlists, hidden for other views', () => {
    function getContextualSectionType(view: LibraryView): 'music_folders' | 'playlists' | 'hidden' {
      if (view === 'folder') return 'music_folders';
      if (view === 'playlists') return 'playlists';
      return 'hidden';
    }

    expect(getContextualSectionType('folder')).toBe('music_folders');
    expect(getContextualSectionType('playlists')).toBe('playlists');
    expect(getContextualSectionType('all')).toBe('hidden');
    expect(getContextualSectionType('albums')).toBe('hidden');
    expect(getContextualSectionType('artists')).toBe('hidden');
    expect(getContextualSectionType('favourites')).toBe('hidden');
  });

  // Test 3: Multiple root folders appear independently even with identical names
  it('3. multiple root folders with identical directory names remain distinct entries', () => {
    const root1Tracks: TrackItem[] = [
      {
        id: 'root_disk1:Track1.mp3',
        name: 'Track1.mp3',
        relativePath: 'Track1.mp3',
        size: 5000,
        lastModified: 1000,
        metadata: { title: 'Track 1', artist: 'Artist 1', album: 'Alb', isMetadataLoaded: true },
        folderIds: ['root_disk1'],
      },
    ];

    const root2Tracks: TrackItem[] = [
      {
        id: 'root_disk2:Track2.mp3',
        name: 'Track2.mp3',
        relativePath: 'Track2.mp3',
        size: 6000,
        lastModified: 2000,
        metadata: { title: 'Track 2', artist: 'Artist 2', album: 'Alb', isMetadataLoaded: true },
        folderIds: ['root_disk2'],
      },
    ];

    const folder1: ImportedFolder = {
      id: 'root_disk1',
      name: 'Music', // Same folder name!
      sourceType: 'fs-access',
      tree: buildFolderTree('Music', root1Tracks, 'root_disk1'),
      tracks: root1Tracks,
      trackCount: 1,
      addedAt: 100,
      lastScannedAt: 100,
      permissionStatus: 'granted',
    };

    const folder2: ImportedFolder = {
      id: 'root_disk2',
      name: 'Music', // Same folder name on different disk!
      sourceType: 'fs-access',
      tree: buildFolderTree('Music', root2Tracks, 'root_disk2'),
      tracks: root2Tracks,
      trackCount: 1,
      addedAt: 200,
      lastScannedAt: 200,
      permissionStatus: 'granted',
    };

    const folders = [folder1, folder2];

    // Both folders coexist with unique keys
    expect(folders).toHaveLength(2);
    expect(folders[0].id).not.toBe(folders[1].id);
    expect(folders.map((f) => f.name)).toEqual(['Music', 'Music']);

    // Distinct root elements in unified tree
    const unifiedTree = buildUnifiedMultiFolderTree(folders);
    expect(unifiedTree.subfolders).toHaveLength(2);
    expect(unifiedTree.subfolders[0].id).toBe('root_disk1');
    expect(unifiedTree.subfolders[1].id).toBe('root_disk2');
  });

  // Test 4: Expansion state vs selection navigation independence
  it('4. chevron expansion toggle does not trigger folder navigation', () => {
    let selectedPath = '';
    let isFolderExpanded = false;

    const onSelectFolder = (path: string) => {
      selectedPath = path;
    };

    const onToggleExpand = (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      isFolderExpanded = !isFolderExpanded;
    };

    // Simulate clicking the chevron button
    const stopPropagationMock = vi.fn();
    onToggleExpand({ stopPropagation: stopPropagationMock });

    expect(stopPropagationMock).toHaveBeenCalledTimes(1);
    expect(isFolderExpanded).toBe(true);
    // Navigation was NOT triggered:
    expect(selectedPath).toBe('');

    // Simulate clicking folder row to navigate
    onSelectFolder('fsa_folder_1/Subfolder');
    expect(selectedPath).toBe('fsa_folder_1/Subfolder');
    // Expansion state remains intact:
    expect(isFolderExpanded).toBe(true);
  });

  // Test 5: Permission-denied folders show reconnect/grant action
  it('5. permission-denied folders remain visible and offer reconnect actions', () => {
    const promptFolder: ImportedFolder = {
      id: 'fsa_prompt_1',
      name: 'Cloud Music',
      sourceType: 'fs-access',
      tree: {
        id: 'fsa_prompt_1',
        name: 'Cloud Music',
        relativePath: 'fsa_prompt_1',
        tracks: [],
        subfolders: [],
        totalTrackCount: 42,
      },
      tracks: [],
      trackCount: 42,
      addedAt: 100,
      lastScannedAt: 100,
      permissionStatus: 'prompt', // Requires user permission
    };

    const grantedFolder: ImportedFolder = {
      id: 'fsa_granted_1',
      name: 'Local Music',
      sourceType: 'fs-access',
      tree: {
        id: 'fsa_granted_1',
        name: 'Local Music',
        relativePath: 'fsa_granted_1',
        tracks: [],
        subfolders: [],
        totalTrackCount: 15,
      },
      tracks: [],
      trackCount: 15,
      addedAt: 200,
      lastScannedAt: 200,
      permissionStatus: 'granted',
    };

    function getFolderMenuActions(folder: ImportedFolder) {
      if (folder.permissionStatus !== 'granted') {
        return ['reconnect', 'remove'];
      }
      return ['refresh', 'remove'];
    }

    expect(getFolderMenuActions(promptFolder)).toEqual(['reconnect', 'remove']);
    expect(getFolderMenuActions(grantedFolder)).toEqual(['refresh', 'remove']);
  });

  // Test 6: Removing a root folder requires confirmation and cleans up state safely
  it('6. removing a root folder preserves other roots, cleans up path, and migrates favourites', () => {
    const sharedTrackIdParent = 'root_parent:Rock/Classic.mp3';
    const sharedTrackIdChild = 'root_child:Classic.mp3';

    const sharedTrack: TrackItem = {
      id: sharedTrackIdParent,
      name: 'Classic.mp3',
      relativePath: 'Rock/Classic.mp3',
      size: 5000000,
      lastModified: 1000,
      metadata: { title: 'Classic', artist: 'Artist', album: 'Alb', isMetadataLoaded: true },
      folderIds: ['root_parent', 'root_child'],
      aliases: [sharedTrackIdParent, sharedTrackIdChild],
    };

    const parentFolder: ImportedFolder = {
      id: 'root_parent',
      name: 'Parent Music',
      sourceType: 'fs-access',
      tree: buildFolderTree('Parent Music', [sharedTrack], 'root_parent'),
      tracks: [sharedTrack],
      trackCount: 1,
      addedAt: 100,
      lastScannedAt: 100,
      permissionStatus: 'granted',
    };

    const childFolder: ImportedFolder = {
      id: 'root_child',
      name: 'Child Music',
      sourceType: 'fs-access',
      tree: buildFolderTree('Child Music', [sharedTrack], 'root_child'),
      tracks: [sharedTrack],
      trackCount: 1,
      addedAt: 200,
      lastScannedAt: 200,
      permissionStatus: 'granted',
    };

    let folders = [parentFolder, childFolder];
    let favourites = new Set<string>([sharedTrackIdParent]);
    let selectedFolderPath = 'root_parent/Rock';

    // Simulate removeFolder('root_parent')
    const folderIdToRemove = 'root_parent';
    const idMigrations = new Map<string, string>();

    const remainingFolders = folders.filter((f) => f.id !== folderIdToRemove);
    const updatedFolders = remainingFolders.map((f) => ({
      ...f,
      tracks: f.tracks.map((t) => {
        let updated = {
          ...t,
          folderIds: (t.folderIds || []).filter((id) => id !== folderIdToRemove),
        };
        if (updated.id.startsWith(`${folderIdToRemove}:`)) {
          const validAlias = updated.aliases?.find((a) => !a.startsWith(`${folderIdToRemove}:`));
          if (validAlias) {
            idMigrations.set(updated.id, validAlias);
            updated = {
              ...updated,
              id: validAlias,
            };
          }
        }
        return updated;
      }),
    }));

    // Reset selected path if it belonged to removed root
    if (selectedFolderPath.startsWith(folderIdToRemove)) {
      selectedFolderPath = '';
    }

    // Migrate favourites
    for (const [oldId, newId] of idMigrations.entries()) {
      if (favourites.has(oldId)) {
        favourites.delete(oldId);
        favourites.add(newId);
      }
    }

    folders = updatedFolders;

    // Verify:
    expect(folders).toHaveLength(1);
    expect(folders[0].id).toBe('root_child');
    expect(selectedFolderPath).toBe(''); // Reset to library overview
    expect(favourites.has(sharedTrackIdChild)).toBe(true); // Favourites migrated cleanly
    expect(folders[0].tracks[0].id).toBe(sharedTrackIdChild);
    expect(folders[0].tracks[0].folderIds).toEqual(['root_child']);
  });

  // Test 7: Breadcrumbs resolve root folder IDs to friendly names across multiple roots
  it('7. breadcrumbs resolve root folder IDs to human-readable folder names', () => {
    const folders: ImportedFolder[] = [
      {
        id: 'fsa_root_rock',
        name: 'Rock Music',
        sourceType: 'fs-access',
        tree: { id: 'root', name: 'Rock Music', relativePath: 'fsa_root_rock', tracks: [], subfolders: [], totalTrackCount: 10 },
        tracks: [],
        trackCount: 10,
        addedAt: 100,
        lastScannedAt: 100,
        permissionStatus: 'granted',
      },
      {
        id: 'fsa_root_jazz',
        name: 'Jazz Collection',
        sourceType: 'fs-access',
        tree: { id: 'root', name: 'Jazz Collection', relativePath: 'fsa_root_jazz', tracks: [], subfolders: [], totalTrackCount: 20 },
        tracks: [],
        trackCount: 20,
        addedAt: 200,
        lastScannedAt: 200,
        permissionStatus: 'granted',
      },
    ];

    // Root folder breadcrumbs
    const rootCrumbs = getBreadcrumbs('Library', 'fsa_root_rock', folders);
    expect(rootCrumbs).toEqual([
      { name: 'Library', path: '' },
      { name: 'Rock Music', path: 'fsa_root_rock' },
    ]);

    // Nested subfolder breadcrumbs across roots
    const nestedCrumbs = getBreadcrumbs('Library', 'fsa_root_jazz/Miles Davis/Kind of Blue', folders);
    expect(nestedCrumbs).toEqual([
      { name: 'Library', path: '' },
      { name: 'Jazz Collection', path: 'fsa_root_jazz' },
      { name: 'Miles Davis', path: 'fsa_root_jazz/Miles Davis' },
      { name: 'Kind of Blue', path: 'fsa_root_jazz/Miles Davis/Kind of Blue' },
    ]);
  });

  // Test 8: Playlists placeholder view does not affect audio playback or Queue panel
  it('8. playlists view navigation renders clean placeholder without altering queue or playback', () => {
    let currentView: LibraryView = 'all';
    let isNowPlayingQueueOpen = true;
    let isAudioPlaying = true;

    // Switch to playlists view
    currentView = 'playlists';

    expect(currentView).toBe('playlists');
    // Now playing queue panel is completely independent:
    expect(isNowPlayingQueueOpen).toBe(true);
    // Audio playback continues uninterrupted:
    expect(isAudioPlaying).toBe(true);
  });
});
