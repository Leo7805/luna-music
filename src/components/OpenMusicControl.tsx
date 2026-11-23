import React, { useRef, useState, useEffect } from 'react';
import { FolderOpen, Disc, ChevronDown } from 'lucide-react';
import { getDefaultOpenMode, OpenMusicMode } from '../utils/platform';
import { isFileSystemAccessSupported } from '../services/directoryAccess';

interface OpenMusicControlProps {
  variant: 'empty-state' | 'sidebar';
  isScanning?: boolean;
  scanCount?: number;
  onOpenFolder: () => void;
  onOpenFiles?: () => void;
  onFallbackFolderSelect: (files: FileList | null) => void;
  onOpenFilesSelect: (files: FileList | null) => void;
  isFsaSupported?: boolean;
}

export const OpenMusicControl: React.FC<OpenMusicControlProps> = ({
  variant,
  isScanning = false,
  scanCount = 0,
  onOpenFolder,
  onOpenFiles,
  onFallbackFolderSelect,
  onOpenFilesSelect,
  isFsaSupported = isFileSystemAccessSupported(),
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement | null>(null);
  const secondMenuItemRef = useRef<HTMLButtonElement | null>(null);
  const openedMenuByKeyboardRef = useRef(false);

  const folderFallbackInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);

  const defaultMode: OpenMusicMode = getDefaultOpenMode();

  useEffect(() => {
    if (!menuOpen) return;

    if (openedMenuByKeyboardRef.current) {
      firstMenuItemRef.current?.focus();
    }

    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        openedMenuByKeyboardRef.current = false;
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        const shouldRestoreFocus =
          openedMenuByKeyboardRef.current ||
          Boolean(containerRef.current?.contains(document.activeElement));
        openedMenuByKeyboardRef.current = false;
        setMenuOpen(false);
        if (shouldRestoreFocus) {
          menuButtonRef.current?.focus();
        }
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const handleMenuToggleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const isPointerClick = e.detail > 0;
    if (isPointerClick) {
      openedMenuByKeyboardRef.current = false;
    } else {
      openedMenuByKeyboardRef.current = !menuOpen;
    }
    setMenuOpen((prev) => !prev);
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [
      firstMenuItemRef.current,
      secondMenuItemRef.current,
    ].filter((el): el is HTMLButtonElement => el !== null);

    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = items[(currentIndex + 1) % items.length];
      next.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = items[(currentIndex - 1 + items.length) % items.length];
      prev.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if (e.key === 'Tab') {
      openedMenuByKeyboardRef.current = false;
      setMenuOpen(false);
    }
  };

  const triggerOpenFolder = () => {
    setMenuOpen(false);
    if (isFsaSupported) {
      onOpenFolder();
    } else {
      folderFallbackInputRef.current?.click();
    }
  };

  const triggerOpenFiles = () => {
    setMenuOpen(false);
    if (isFsaSupported && onOpenFiles) {
      onOpenFiles();
    } else {
      filesInputRef.current?.click();
    }
  };

  const triggerDefaultOpen = () => {
    if (defaultMode === 'files') {
      triggerOpenFiles();
    } else {
      triggerOpenFolder();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center min-w-0 ${
        variant === 'empty-state' ? 'gap-0 shadow-xl shadow-[var(--accent-primary)]/25' : 'w-full'
      }`}
    >
      {/* Hidden Folder Fallback Input */}
      <input
        ref={folderFallbackInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is standard for folder inputs
        webkitdirectory="true"
        directory=""
        multiple
        className="hidden"
        data-testid={`${variant}-folder-fallback-input`}
        onChange={(e) => {
          onFallbackFolderSelect(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Hidden Multi-File Audio Input */}
      <input
        ref={filesInputRef}
        type="file"
        multiple
        accept="audio/*,.lrc"
        className="hidden"
        data-testid={`${variant}-files-input`}
        onChange={(e) => {
          onOpenFilesSelect(e.target.files);
          e.target.value = '';
        }}
      />

      {variant === 'empty-state' ? (
        /* Empty State Large Split Button */
        <div
          data-testid="empty-state-split-button"
          className="inline-flex items-stretch rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white font-bold text-sm transition transform hover:scale-[1.02] active:scale-[0.98] select-none"
        >
          {/* Main Action Button */}
          <button
            type="button"
            onClick={triggerDefaultOpen}
            disabled={isScanning}
            data-testid="open-music-main-button"
            className="flex items-center gap-2.5 pl-6 pr-4 py-3.5 rounded-l-2xl hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
          >
            {defaultMode === 'files' ? (
              <Disc className="w-5 h-5 text-white/80" />
            ) : (
              <FolderOpen className="w-5 h-5 text-white/80" />
            )}
            <span>
              {isScanning ? `Scanning (${scanCount} found)...` : 'Open Music'}
            </span>
          </button>

          {/* Vertical Separator */}
          <div className="w-px my-2.5 bg-white/20" aria-hidden="true" />

          {/* Chevron Dropdown Toggle */}
          <button
            ref={menuButtonRef}
            type="button"
            onClick={handleMenuToggleClick}
            disabled={isScanning}
            aria-label="More opening options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-testid="open-music-menu-button"
            className="flex items-center justify-center px-3.5 py-3.5 rounded-r-2xl hover:bg-white/10 transition-colors cursor-pointer text-white disabled:opacity-50"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                menuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
      ) : (
        /* Sidebar Compact Full-Width Split Button */
        <div
          data-testid="sidebar-split-button"
          className="w-full flex items-stretch rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold shadow-md shadow-[var(--accent-primary)]/20 transition active:scale-[0.99] select-none"
        >
          {/* Main Action Button */}
          <button
            type="button"
            onClick={triggerDefaultOpen}
            disabled={isScanning}
            data-testid="sidebar-open-music-main-button"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 pl-3 pr-2 rounded-l-xl hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
          >
            {defaultMode === 'files' ? (
              <Disc className="w-4 h-4" />
            ) : (
              <FolderOpen className="w-4 h-4" />
            )}
            <span>
              {isScanning ? 'Scanning...' : 'Open Music'}
            </span>
          </button>

          {/* Vertical Separator */}
          <div className="w-px my-1.5 bg-white/20" aria-hidden="true" />

          {/* Chevron Dropdown Toggle */}
          <button
            ref={menuButtonRef}
            type="button"
            onClick={handleMenuToggleClick}
            disabled={isScanning}
            aria-label="More opening options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-testid="sidebar-open-music-menu-button"
            className="flex items-center justify-center px-2.5 py-2.5 rounded-r-xl hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                menuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
      )}

      {/* Reusable Dropdown Menu */}
      {menuOpen && (
        <div
          role="menu"
          data-testid={`${variant}-open-menu`}
          onKeyDown={handleMenuKeyDown}
          className={`absolute z-50 w-52 rounded-xl glass-panel shadow-2xl py-1.5 backdrop-blur-xl border border-[var(--border-subtle)] dark:border-white/15 select-none ${
            variant === 'empty-state'
              ? 'left-1/2 -translate-x-1/2 top-full mt-2'
              : 'left-0 right-0 bottom-full mb-2'
          }`}
        >
          <button
            ref={firstMenuItemRef}
            type="button"
            role="menuitem"
            data-testid={`${variant}-menu-open-folder`}
            onClick={triggerOpenFolder}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] dark:text-slate-100 hover:bg-[var(--bg-active)] hover:text-[var(--accent-primary)] dark:hover:text-indigo-300 focus:outline-none focus-visible:bg-[var(--bg-active)] transition cursor-pointer text-left"
          >
            <FolderOpen className="w-4 h-4 text-[var(--accent-primary)] dark:text-indigo-400 shrink-0" />
            <span>Add Folder</span>
          </button>

          <button
            ref={secondMenuItemRef}
            type="button"
            role="menuitem"
            data-testid={`${variant}-menu-open-files`}
            onClick={triggerOpenFiles}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] dark:text-slate-100 hover:bg-[var(--bg-active)] hover:text-[var(--accent-primary)] dark:hover:text-indigo-300 focus:outline-none focus-visible:bg-[var(--bg-active)] transition cursor-pointer text-left"
          >
            <Disc className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />
            <span>Open Files</span>
          </button>
        </div>
      )}
    </div>
  );
};
