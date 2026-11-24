// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useFolderScanning } from '../src/hooks/useFolderScanning';
import { MusicLibrary, StoredFolderRecord } from '../src/types/music';
import { restoreFolderHandle } from '../src/utils/folderAccess';

const stored = vi.hoisted(() => ({ records: [] as StoredFolderRecord[] }));
vi.mock('../src/services/idbStorage', async importOriginal => ({
  ...await importOriginal<typeof import('../src/services/idbStorage')>(),
  storeRegisteredFolders: vi.fn(async records => { stored.records = records; return true; }),
  getMetadataCache: async () => ({}),
}));
vi.mock('../src/hooks/useMetadataExtractionPipeline', () => ({ useMetadataExtractionPipeline: () => ({
  startIncrementalMetadataExtraction: vi.fn(), invalidateMetadataSource: vi.fn(), invalidateMetadataTracks: vi.fn(),
}) }));
let scanner: ReturnType<typeof useFolderScanning>;
let library: MusicLibrary | null;
let initial: MusicLibrary | null;
let root: Root;
const noop = () => {};
function Harness() {
  const [current, setCurrent] = useState(initial);
  const [, setPending] = useState<StoredFolderRecord[]>([]);
  const [, setPermission] = useState(false);
  library = current;
  scanner = useFolderScanning({ library: current, onLibraryUpdated: setCurrent,
    onMigrateFavourites: noop, onResetNavigationForFolder: noop, onRemoveAllImportedFiles: async () => {},
    setPendingFolders: setPending, setNeedsPermission: setPermission });
  return null;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  stored.records = [];
  initial = null;
  root = createRoot(document.createElement('div'));
});
afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals(); });

it('persists a fallback import and reconnects a reselected offline source using its saved namespace', async () => {
  act(() => root.render(<Harness />));
  const file = new File(['audio'], 'Song.mp3', { lastModified: 1 });
  Object.defineProperty(file, 'webkitRelativePath', { value: 'Root/Nested/Song.mp3' });
  await act(async () => scanner.handleFallbackFolderSelect([file]));
  expect(stored.records).toHaveLength(1);
  const originalId = library!.flatPlaylist[0].id;
  const registration = stored.records[0];
  expect(registration.sourceType).toBe('input-fallback');
  // File input grants are memory-only: reconstruct the persisted registration on reopening.
  initial = { ...library!, flatPlaylist: [], folders: [{ ...library!.folders[0],
    tracks: [], permissionStatus: 'prompt' }] };
  act(() => root.unmount()); root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
  await act(async () => scanner.handleFallbackFolderSelect([file]));
  expect(library!.folders).toHaveLength(1);
  expect(stored.records[0].id).toBe(registration.id);
  expect(library!.flatPlaylist[0].id).toBe(originalId);
  expect(library!.flatPlaylist[0].file).toBe(file);
  expect(library!.folders[0].permissionStatus).toBe('granted');
});

it('reselects a handleless folder through a user picker and checks access', async () => {
  const handle = { name: 'Root', queryPermission: vi.fn(async () => 'granted') };
  vi.stubGlobal('showDirectoryPicker', vi.fn(async () => handle));
  expect(await restoreFolderHandle({ name: 'Root' })).toBe(handle);
  expect(handle.queryPermission).toHaveBeenCalled();
});

it('does not attach a differently named folder to an existing source ID', async () => {
  vi.stubGlobal('showDirectoryPicker', vi.fn(async () => ({ name: 'Different' })));
  expect(await restoreFolderHandle({ name: 'Root' })).toBeNull();
});

it('retains a handleless registration when native folder access is unavailable', async () => {
  vi.stubGlobal('showDirectoryPicker', undefined);
  // The browser support predicate checks property existence; remove it for this case.
  delete (window as Partial<Window>).showDirectoryPicker;
  expect(await restoreFolderHandle({ name: 'Root' })).toBeNull();
});
