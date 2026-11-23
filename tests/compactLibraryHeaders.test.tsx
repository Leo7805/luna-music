import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Header } from '../src/components/Header';
import { TrackListHeader } from '../src/components/TrackListHeader';
import { FolderView } from '../src/components/FolderView';
import { FolderNode, TrackItem } from '../src/types/music';

function makeTrack(id: string, name: string): TrackItem {
  return {
    id,
    name: `${name}.mp3`,
    relativePath: `mp3/${name}.mp3`,
    size: 4096,
    lastModified: 1700000000,
    status: 'normal',
    metadata: {
      title: name,
      artist: 'Artist',
      album: 'Album',
      duration: 200,
      isMetadataLoaded: true,
    },
  };
}

describe('Compact Library Headers (All Tracks & Folder View)', () => {
  const tracks = [makeTrack('t1', 'Song 1'), makeTrack('t2', 'Song 2')];

  it('All Tracks hides duplicate count in TrackListHeader while keeping Play All, Select, and selection count', () => {
    const htmlHeader = renderToStaticMarkup(
      <Header
        title="All Tracks"
        subtitle="339 tracks"
        searchQuery=""
        theme="light"
        lightStyle="warm"
        onSearchChange={() => {}}
        onOpenShortcutsModal={() => {}}
        onSelectTheme={() => {}}
        onSelectLightStyle={() => {}}
      />
    );
    expect(htmlHeader).toContain('All Tracks');
    expect(htmlHeader).toContain('339 tracks');

    const htmlListHeader = renderToStaticMarkup(
      <TrackListHeader
        tracksCount={339}
        selectedCount={0}
        isSelectMode={false}
        showCheckboxes={false}
        hideTrackCount={true}
        onToggleSelectMode={() => {}}
        onToggleSelectAll={() => {}}
        onPlayAll={() => {}}
      />
    );
    expect(htmlListHeader).not.toContain('339 tracks');
    expect(htmlListHeader).toContain('data-testid="play-all-button"');
    expect(htmlListHeader).toContain('data-testid="toggle-select-mode"');

    // Selection count still appears when tracks are selected
    const htmlSelected = renderToStaticMarkup(
      <TrackListHeader
        tracksCount={339}
        selectedCount={4}
        isSelectMode={true}
        showCheckboxes={true}
        hideTrackCount={true}
        onToggleSelectMode={() => {}}
        onToggleSelectAll={() => {}}
        onPlayAll={() => {}}
      />
    );
    expect(htmlSelected).toContain('4 of 339 selected');
  });

  it('hides only the toolbar when a layout supplies actions, preserving table columns and beforeTable', () => {
    const html = renderToStaticMarkup(
      <TrackListHeader tracksCount={2} selectedCount={1} isSelectMode showCheckboxes
        showToolbar={false} beforeTable={<div data-testid="before-table">Folders</div>}
        onToggleSelectMode={() => {}} onToggleSelectAll={() => {}} onPlayAll={() => {}} />
    );
    expect(html).not.toContain('data-testid="tracklist-toolbar"');
    expect(html).not.toContain('data-testid="play-all-button"');
    expect(html).not.toContain('data-testid="toggle-select-mode"');
    expect(html).toContain('Title');
    expect(html).toContain('Album');
    expect(html).toContain('aria-label="Select all"');
    expect(html.indexOf('data-testid="before-table"')).toBeLessThan(html.indexOf('Title'));
  });

  it('Folder Header renders inline breadcrumb Row 1 without duplicating folder title or subtitle', () => {
    const html = renderToStaticMarkup(
      <Header
        title="mp3"
        subtitle="319 tracks"
        searchQuery=""
        breadcrumbs={[
          { name: 'Music Library', path: '' },
          { name: 'mp3', path: 'mp3' },
        ]}
        theme="light"
        lightStyle="warm"
        onSearchChange={() => {}}
        onBreadcrumbClick={() => {}}
        onOpenShortcutsModal={() => {}}
        onSelectTheme={() => {}}
        onSelectLightStyle={() => {}}
      />
    );

    expect(html).toContain('data-testid="folder-breadcrumb"');
    expect(html).toContain('Music Library');
    // Folder name appears exactly once as the inline h1
    expect((html.match(/>mp3</g) || []).length).toBe(1);
    // Subtitle count renders inline alongside the breadcrumb in Row 1
    expect(html).toContain('data-testid="header-subtitle"');
    expect(html).toContain('319 tracks');
  });

  it('FolderView with no subfolders hides Subfolders(0)/Go Up/Folder Tracks and renders count + Play All only once', () => {
    const folderNoSubs: FolderNode = {
      id: 'mp3',
      name: 'mp3',
      relativePath: 'mp3',
      tracks,
      subfolders: [],
      totalTrackCount: 2,
    };

    const html = renderToStaticMarkup(
      <FolderView
        currentNode={folderNoSubs}
        libraryTracks={tracks}
        isPlaying={false}
        favourites={new Set()}
        onSelectFolder={() => {}}
        onPlayTrack={() => {}}
        onTogglePlay={() => {}}
        onToggleFavourite={() => {}}
      />
    );

    expect(html).not.toContain('Subfolders');
    expect(html).not.toContain('Go Up');
    expect(html).not.toContain('Folder Tracks');
    expect(html).not.toContain('data-testid="folder-subfolders-section"');
    expect((html.match(/Play All/g) || []).length).toBe(1);
    expect((html.match(/2 tracks/g) || []).length).toBe(1);
    expect(html).toContain('data-testid="toggle-select-mode"');
  });

  it('FolderView with subfolders renders subfolders below Row 2 toolbar and before the track table without duplicate Play All', () => {
    const folderWithSubs: FolderNode = {
      id: 'root-music',
      name: 'Music',
      relativePath: 'root-music',
      tracks,
      subfolders: [
        {
          id: 'root-music/CD1',
          name: 'CD1',
          relativePath: 'root-music/CD1',
          tracks: [],
          subfolders: [],
          totalTrackCount: 5,
        },
      ],
      totalTrackCount: 7,
    };

    const html = renderToStaticMarkup(
      <FolderView
        currentNode={folderWithSubs}
        libraryTracks={tracks}
        isPlaying={false}
        favourites={new Set()}
        onSelectFolder={() => {}}
        onPlayTrack={() => {}}
        onTogglePlay={() => {}}
        onToggleFavourite={() => {}}
      />
    );

    const toolbarIdx = html.indexOf('data-testid="tracklist-toolbar"');
    const subsIdx = html.indexOf('data-testid="folder-subfolders-section"');
    const titleColIdx = html.indexOf('<div>Title</div>');

    expect(toolbarIdx).toBeGreaterThan(-1);
    expect(subsIdx).toBeGreaterThan(toolbarIdx);
    expect(titleColIdx).toBeGreaterThan(subsIdx);
    expect(html).toContain('CD1');
    expect((html.match(/Play All/g) || []).length).toBe(1);
  });
});
