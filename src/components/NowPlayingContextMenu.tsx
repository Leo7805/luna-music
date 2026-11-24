import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, ListEnd, ListPlus, Info, Trash2 } from 'lucide-react';
import { TrackItem } from '../types/music';

export interface QueueContextMenuState {
  targetIndex: number;
  targetTrack: TrackItem;
  isCurrent: boolean;
  mode: 'single' | 'multi';
  anchorType: 'cursor' | 'button';
  x: number;
  y: number;
  anchorRect?: { left: number; right: number; top: number; bottom: number };
  triggerElement?: HTMLElement | null;
}

export interface NowPlayingContextMenuProps {
  menu: QueueContextMenuState | null;
  selectedCount: number;
  onClose: (options?: { restoreFocus?: boolean }) => void;
  onPlayQueueTrack: (track: TrackItem) => void;
  onPlayNext?: (track: TrackItem) => void;
  onBulkPlayNext?: () => void;
  onAddToPlaylist: (track: TrackItem) => void;
  onBulkAddToPlaylist: () => void;
  onOpenTrackInfo: (track: TrackItem) => void;
  onRemoveFromQueue: (index: number) => void;
  onRequestBulkRemove: () => void;
}

const VIEWPORT_PADDING = 8;
const MENU_FALLBACK_WIDTH = 208;
const MENU_FALLBACK_HEIGHT = 220;

function computeClampedPosition(
  menu: QueueContextMenuState,
  menuWidth: number,
  menuHeight: number
): { left: number; top: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  let left: number;
  let top: number;

  if (menu.anchorType === 'button' && menu.anchorRect) {
    // Align right edge with trigger button, opening below by default
    left = menu.anchorRect.right - menuWidth;
    top = menu.anchorRect.bottom + 4;
    if (top + menuHeight > vh - VIEWPORT_PADDING && menu.anchorRect.top - menuHeight - 4 >= VIEWPORT_PADDING) {
      top = menu.anchorRect.top - menuHeight - 4;
    }
  } else {
    left = menu.x;
    top = menu.y;
    if (left + menuWidth > vw - VIEWPORT_PADDING) {
      left = menu.x - menuWidth;
    }
    if (top + menuHeight > vh - VIEWPORT_PADDING) {
      top = menu.y - menuHeight;
    }
  }

  left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - menuWidth - VIEWPORT_PADDING));
  top = Math.max(VIEWPORT_PADDING, Math.min(top, vh - menuHeight - VIEWPORT_PADDING));

  return { left, top };
}

export const NowPlayingContextMenu: React.FC<NowPlayingContextMenuProps> = ({
  menu,
  selectedCount,
  onClose,
  onPlayQueueTrack,
  onPlayNext,
  onBulkPlayNext,
  onAddToPlaylist,
  onBulkAddToPlaylist,
  onOpenTrackInfo,
  onRemoveFromQueue,
  onRequestBulkRemove,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!menu) return;
    const rect = menuRef.current?.getBoundingClientRect();
    const width = rect && rect.width > 0 ? rect.width : MENU_FALLBACK_WIDTH;
    const height = rect && rect.height > 0 ? rect.height : MENU_FALLBACK_HEIGHT;
    setPosition(computeClampedPosition(menu, width, height));
  }, [menu]);

  // Focus first enabled menuitem when opened; support Arrow/Home/End/Escape navigation
  useEffect(() => {
    if (!menu) return;
    const container = menuRef.current;
    if (!container) return;

    const getItems = () =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));

    const items = getItems();
    if (items.length > 0) {
      items[0].focus({ preventScroll: true });
    }

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (container.contains(target) || target.closest('[data-queue-row-menu]'))) {
        return;
      }
      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose({ restoreFocus: true });
        return;
      }

      const focusable = getItems();
      if (focusable.length === 0) return;
      const currentIdx = focusable.indexOf(document.activeElement as HTMLButtonElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusable[(currentIdx + 1) % focusable.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusable[(currentIdx - 1 + focusable.length) % focusable.length].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        focusable[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        focusable[focusable.length - 1].focus();
      }
    };

    const handleViewportChange = () => onClose();

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const isMulti = menu.mode === 'multi';
  const trackLabel = menu.targetTrack.metadata.title || menu.targetTrack.name;
  const menuItemClass =
    'w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[var(--text-primary)] dark:text-slate-200 hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.06] focus:outline-none focus-visible:bg-[var(--bg-hover)] dark:focus-visible:bg-white/[0.08] cursor-pointer';
  const dangerItemClass =
    'w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 focus:outline-none focus-visible:bg-rose-50 dark:focus-visible:bg-rose-950/25 cursor-pointer';

  const content = (
    <div
      ref={menuRef}
      role="menu"
      aria-label={isMulti ? `Actions for ${selectedCount} selected tracks` : `Queue actions for ${trackLabel}`}
      data-queue-context-menu
      data-menu-mode={menu.mode}
      data-testid={`queue-menu-dropdown-${menu.targetIndex}`}
      style={{ position: 'fixed', left: `${position.left}px`, top: `${position.top}px` }}
      className="w-52 py-1.5 rounded-xl bg-[var(--bg-panel)] dark:bg-[#0c192c] border border-[var(--border-subtle)] dark:border-white/[0.1] shadow-xl z-50 text-xs"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {isMulti ? (
        <>
          <div
            data-testid="queue-menu-selection-header"
            className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] dark:text-slate-400 border-b border-[var(--border-subtle)] dark:border-white/[0.06] mb-1 select-none"
          >
            {selectedCount} tracks selected
          </div>

          {onBulkPlayNext && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onClose();
                onBulkPlayNext();
              }}
              data-testid="queue-menu-bulk-play-next"
              className={menuItemClass}
            >
              <ListEnd className="w-3.5 h-3.5 text-[var(--text-secondary)] dark:text-slate-400" />
              <span>Play Next ({selectedCount})</span>
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onBulkAddToPlaylist();
            }}
            data-testid="queue-menu-bulk-add-playlist"
            className={menuItemClass}
          >
            <ListPlus className="w-3.5 h-3.5 text-[var(--text-secondary)] dark:text-slate-400" />
            <span>Add to Playlist</span>
          </button>

          <div className="my-1 border-t border-[var(--border-subtle)] dark:border-white/[0.06]" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onRequestBulkRemove();
            }}
            data-testid="queue-menu-bulk-remove"
            className={dangerItemClass}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove Selected ({selectedCount})</span>
          </button>
        </>
      ) : (
        <>
          {!menu.isCurrent && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onClose();
                onPlayQueueTrack(menu.targetTrack);
              }}
              data-testid={`queue-play-now-action-${menu.targetIndex}`}
              className={menuItemClass}
            >
              <Play className="w-3.5 h-3.5 text-[var(--accent-primary)] dark:text-indigo-400" />
              <span>Play Now</span>
            </button>
          )}

          {!menu.isCurrent && onPlayNext && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onClose();
                onPlayNext(menu.targetTrack);
              }}
              data-testid={`queue-play-next-action-${menu.targetIndex}`}
              className={menuItemClass}
            >
              <ListEnd className="w-3.5 h-3.5 text-[var(--text-secondary)] dark:text-slate-400" />
              <span>Play Next</span>
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onAddToPlaylist(menu.targetTrack);
            }}
            data-testid={`queue-add-playlist-action-${menu.targetIndex}`}
            className={menuItemClass}
          >
            <ListPlus className="w-3.5 h-3.5 text-[var(--text-secondary)] dark:text-slate-400" />
            <span>Add to Playlist</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onOpenTrackInfo(menu.targetTrack);
            }}
            data-testid={`queue-track-info-action-${menu.targetIndex}`}
            className={menuItemClass}
          >
            <Info className="w-3.5 h-3.5 text-[var(--text-secondary)] dark:text-slate-400" />
            <span>Track Info</span>
          </button>

          <div className="my-1 border-t border-[var(--border-subtle)] dark:border-white/[0.06]" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onRemoveFromQueue(menu.targetIndex);
            }}
            data-testid={`queue-remove-action-${menu.targetIndex}`}
            className={dangerItemClass}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove from Queue</span>
          </button>
        </>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
