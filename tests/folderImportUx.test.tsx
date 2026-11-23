// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenMusicControl } from '../src/components/OpenMusicControl';
import { SidebarFolderSection } from '../src/components/SidebarFolderSection';
import { promptOpenDirectory } from '../src/services/directoryAccess';
import { parseFileList } from '../src/services/fallbackAccess';
import { useFolderScanning } from '../src/hooks/useFolderScanning';

// Keep the real picker/cancellation hook; metadata extraction is outside this UI test.
vi.mock('../src/hooks/useMetadataExtractionPipeline', () => ({
  useMetadataExtractionPipeline: () => ({
    startIncrementalMetadataExtraction: vi.fn(), invalidateMetadataSource: vi.fn(), invalidateMetadataTracks: vi.fn(),
  }),
}));
const noop = () => {};
let host: HTMLDivElement;
let root: Root;
let primary = vi.fn<() => void>();
let fallback = vi.fn<(files: FileList | null) => void>();
let openFiles = vi.fn<() => void>();
const byId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const click = (element: HTMLElement, detail = 1) => act(() => {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }));
});
const key = (element: HTMLElement, value: string) => act(() => {
  element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
});
const inputClick = () => vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(noop);

function NativeFolderSection() {
  const scanning = useFolderScanning({
    library: null, onLibraryUpdated: noop, onMigrateFavourites: noop, onResetNavigationForFolder: noop,
    onRemoveAllImportedFiles: async () => {}, setPendingFolders: noop, setNeedsPermission: noop,
  });
  return <SidebarFolderSection currentView="folder" selectedFolderPath="" folders={[]}
    activeMenuFolderId={null} onToggleMenu={noop} onOpenFolder={scanning.openFolderPicker}
    onFallbackFolderSelect={fallback} onSelectView={noop} onSelectFolder={noop}
    onRemoveFolderPrompt={noop} onClearImportedFilesPrompt={noop} />;
}

function mountMenu(variant: 'sidebar' | 'empty-state' = 'sidebar', onOpenFolder: () => void = primary) {
  act(() => root.render(<OpenMusicControl variant={variant} onOpenFolder={onOpenFolder}
    onOpenFiles={openFiles} onFallbackFolderSelect={fallback} onOpenFilesSelect={fallback} />));
  click(byId(variant === 'sidebar' ? 'sidebar-open-music-menu-button' : 'open-music-menu-button'), 0);
}
function mountSection() {
  act(() => root.render(<SidebarFolderSection currentView="folder" selectedFolderPath="" folders={[]}
    activeMenuFolderId={null} onToggleMenu={noop} onOpenFolder={primary} onFallbackFolderSelect={fallback}
    onSelectView={noop} onSelectFolder={noop} onRemoveFolderPrompt={noop} onClearImportedFilesPrompt={noop} />));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  primary = vi.fn(); fallback = vi.fn(); openFiles = vi.fn();
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('Folder import labels and two-item menu', () => {
  it.each(['sidebar', 'empty-state'] as const)('shows only Add Folder and Open Files in %s', (variant) => {
    mountMenu(variant);
    expect([...host.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent))
      .toEqual(['Add Folder', 'Open Files']);
    expect(host.textContent).not.toContain('Folder Input Fallback');
    expect(byId(`${variant}-menu-open-folder`)).not.toBeNull();
    expect(host.textContent).toContain('Open Music');
  });

  it('preserves two-item keyboard wraparound, Home/End, Escape focus and Tab dismissal', () => {
    mountMenu();
    const add = byId('sidebar-menu-open-folder'); const files = byId('sidebar-menu-open-files');
    expect(document.activeElement).toBe(add);
    key(add, 'ArrowDown'); expect(document.activeElement).toBe(files);
    key(files, 'ArrowDown'); expect(document.activeElement).toBe(add);
    key(add, 'ArrowUp'); expect(document.activeElement).toBe(files);
    key(files, 'Home'); expect(document.activeElement).toBe(add);
    key(add, 'End'); expect(document.activeElement).toBe(files);
    key(files, 'Escape');
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(byId('sidebar-open-music-menu-button'));
    click(byId('sidebar-open-music-menu-button'), 0);
    key(byId('sidebar-menu-open-folder'), 'Tab');
    expect(host.querySelector('[role="menu"]')).toBeNull();
  });

  it('keeps the native Open Files callback and unsupported file input working', () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn());
    mountMenu(); click(byId('sidebar-menu-open-files'));
    expect(openFiles).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
    const inputSpy = inputClick();
    click(byId('sidebar-open-music-menu-button'));
    click(byId('sidebar-menu-open-files'));
    expect(inputSpy.mock.instances[0]).toBe(byId('sidebar-files-input'));
    expect(openFiles).toHaveBeenCalledOnce();
  });
});

describe('Capability-based folder picker selection', () => {
  it.each(['menu', 'section'] as const)('uses only the preferred picker from %s when supported', (source) => {
    vi.stubGlobal('showDirectoryPicker', vi.fn());
    const inputSpy = inputClick();
    if (source === 'menu') { mountMenu(); click(byId('sidebar-menu-open-folder')); }
    else { mountSection(); click(host.querySelector('[aria-label="Add Folder"]')!); }
    expect(primary).toHaveBeenCalledOnce(); expect(inputSpy).not.toHaveBeenCalled();
  });

  it.each(['menu', 'section'] as const)('opens fallback synchronously with one click from %s', (source) => {
    const inputSpy = inputClick();
    if (source === 'menu') { mountMenu(); click(byId('sidebar-menu-open-folder')); }
    else { mountSection(); click(host.querySelector('[aria-label="Add Folder"]')!); }
    const input = byId(source === 'menu' ? 'sidebar-folder-fallback-input' : 'sidebar-add-folder-input');
    expect(inputSpy).toHaveBeenCalledOnce(); expect(inputSpy.mock.instances[0]).toBe(input);
    expect(input.hasAttribute('webkitdirectory')).toBe(true); expect(primary).not.toHaveBeenCalled();
  });

  it('labels the Sidebar button and permits repeated selection through either input', () => {
    mountSection();
    const add = host.querySelector('[aria-label="Add Folder"]')!;
    expect(add.getAttribute('title')).toBe('Add Folder');
    for (const source of ['section', 'menu']) {
      if (source === 'menu') mountMenu();
      const input = byId(source === 'menu' ? 'sidebar-folder-fallback-input' : 'sidebar-add-folder-input') as HTMLInputElement;
      const files = [new File(['audio'], 'same.mp3')];
      Object.defineProperty(input, 'files', { configurable: true, value: files });
      const reset = vi.spyOn(input, 'value', 'set');
      for (let i = 0; i < 2; i++) act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
      expect(reset.mock.calls).toEqual([[''], ['']]);
      expect(fallback).toHaveBeenLastCalledWith(files);
    }
    expect(fallback).toHaveBeenCalledTimes(4);
  });

  it.each(['AbortError', 'NotSupportedError', 'SecurityError'])('does not fall back after native %s', async (name) => {
    const error = new DOMException('Picker rejected', name);
    const native = vi.fn().mockRejectedValue(error); vi.stubGlobal('showDirectoryPicker', native);
    const inputSpy = inputClick(); const errorLog = vi.spyOn(console, 'error').mockImplementation(noop);
    act(() => root.render(<NativeFolderSection />));
    await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="Add Folder"]')!.click(); });
    expect(native).toHaveBeenCalledExactlyOnceWith({ mode: 'read' });
    expect(inputSpy).not.toHaveBeenCalled(); expect(fallback).not.toHaveBeenCalled();
    if (name === 'AbortError') expect(errorLog).not.toHaveBeenCalled();
    else expect(errorLog).toHaveBeenCalledWith('Folder picker error:', error);
    mountMenu('sidebar', async () => { await promptOpenDirectory().catch(noop); });
    await act(async () => { byId('sidebar-menu-open-folder').click(); });
    expect(native).toHaveBeenCalledTimes(2); expect(inputSpy).not.toHaveBeenCalled();
  });

  it('preserves fallback hierarchy, root identity, LRC association and audio filtering', () => {
    const file = (name: string, path: string, content: string) => {
      const result = new File([content], name);
      Object.defineProperty(result, 'webkitRelativePath', { value: path }); return result;
    };
    const parsed = parseFileList([
      file('Song.mp3', 'Music/Disc 1/Song.mp3', 'audio'),
      file('Song.lrc', 'Music/Disc 1/Song.lrc', '[00:00]Lyrics'),
      file('Empty.wav', 'Music/Empty.wav', ''), file('notes.txt', 'Music/notes.txt', 'notes'),
    ])!;
    expect(parsed.flatPlaylist).toHaveLength(2);
    const song = parsed.flatPlaylist.find((item) => item.name === 'Song.mp3')!;
    expect(song.relativePath).toBe('Disc 1/Song.mp3');
    expect(song.lrcFile?.name).toBe('Song.lrc'); expect(song.file?.name).toBe('Song.mp3');
    expect(song.id).toBe(`${parsed.folders[0].id}:Disc 1/Song.mp3`);
    expect(parsed.tree.subfolders[0].name).toBe('Disc 1');
    expect(parsed.flatPlaylist.find((item) => item.name === 'Empty.wav')?.status).toBe('empty');
  });
});
