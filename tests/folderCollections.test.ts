import { describe, expect, it } from 'vitest';
import { deriveFolderCollections, isImportedFilesCollection } from '../src/utils/folderCollections';
import { ImportedFolder, IMPORTED_FILES_ROOT_ID } from '../src/types/music';

const folder = (id: string, name: string): ImportedFolder => ({
  id, name, sourceType: 'fs-access', tracks: [], trackCount: 0, addedAt: 1, lastScannedAt: 1,
  permissionStatus: 'granted', tree: { id, name, relativePath: id, tracks: [], subfolders: [], totalTrackCount: 0 },
});
const imported = () => ({ ...folder(IMPORTED_FILES_ROOT_ID, 'Imported Files'),
  tracks: [{ id: 'file:1' }] } as ImportedFolder);

describe('Folder collections display projection', () => {
  it.each([0, 1, 3])('retains source order and existing node references with Imported Files at position %s', (position) => {
    const physical = [folder('a', '周杰伦'), folder('b', 'hot-2026.11.19'), folder('c', 'mp3')];
    const files = imported(); const sources = [...physical]; sources.splice(position, 0, files);
    sources.forEach((source) => { Object.freeze(source.tree.subfolders); Object.freeze(source.tree); Object.freeze(source); });
    Object.freeze(sources);
    const result = deriveFolderCollections(sources);
    expect(result.physicalFoldersCount).toBe(3);
    expect(result.physicalFolders).toEqual(physical);
    expect(result.importedFilesFolder).toBe(files);
    result.overviewNodes.forEach((node, i) => expect(node).toBe([...physical, files][i].tree));
    expect(sources[position]).toBe(files);
    expect(deriveFolderCollections(sources).overviewNodes).toEqual(result.overviewNodes);
  });

  it('keeps same-name roots distinct and does not classify a folder by its display name', () => {
    const first = folder('a', 'Imported Files'); const second = folder('b', 'Imported Files');
    const result = deriveFolderCollections([first, second]);
    expect(result.physicalFoldersCount).toBe(2); expect(result.overviewNodes).toEqual([first.tree, second.tree]);
    expect(isImportedFilesCollection(first.id)).toBe(false);
    expect(isImportedFilesCollection(IMPORTED_FILES_ROOT_ID)).toBe(true);
  });

  it('hides an empty virtual collection and includes empty physical roots in the folder count', () => {
    const physical = folder('a', 'Empty');
    const result = deriveFolderCollections([folder(IMPORTED_FILES_ROOT_ID, 'Imported Files'), physical]);
    expect(result.physicalFoldersCount).toBe(1); expect(result.importedFilesFolder).toBeUndefined();
    expect(result.overviewNodes).toEqual([physical.tree]);
    expect(deriveFolderCollections([])).toEqual({ physicalFolders: [], physicalFoldersCount: 0, overviewNodes: [] });
  });

  it('projects additions and removals without changing nested folder order or contents', () => {
    const a = folder('a', 'A'); const b = folder('b', 'B'); const files = imported();
    a.tree.subfolders = [folder('z', 'Z').tree, folder('c', 'C').tree];
    const before = JSON.stringify([a, b, files]);
    expect(deriveFolderCollections([a, files, b]).overviewNodes).toEqual([a.tree, b.tree, files.tree]);
    expect(deriveFolderCollections([files, b]).overviewNodes).toEqual([b.tree, files.tree]);
    expect(JSON.stringify([a, b, files])).toBe(before);
    expect(a.tree.subfolders.map((node) => node.id)).toEqual(['z', 'c']);
  });
});
