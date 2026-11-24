import { useState, useMemo, useEffect, useCallback } from 'react';
import { TrackItem } from '../types/music';
import { isSameTrack } from '../utils/musicTree';
import { QueueRowMenuAnchor } from '../components/NowPlayingQueueRow';
import { QueueContextMenuState } from '../components/NowPlayingContextMenu';

export interface UseNowPlayingSelectionOptions {
  queue: TrackItem[];
  currentTrack: TrackItem | null;
  selectableVisibleIndices: number[];
}

/**
 * Manages Now Playing Queue selection mode, canonical-order selected indices/tracks,
 * and shared single/multi-track context menu state with stale-reference protection.
 */
export function useNowPlayingSelection({
  queue,
  currentTrack,
  selectableVisibleIndices,
}: UseNowPlayingSelectionOptions) {
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<QueueContextMenuState | null>(null);

  // Close stale menu and prune out-of-bounds or currently-playing selections on Queue updates
  useEffect(() => {
    setContextMenu(null);
    setSelectedIndices((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<number>();
      for (const idx of prev) {
        if (
          idx >= 0 &&
          idx < queue.length &&
          !(currentTrack && isSameTrack(queue[idx], currentTrack))
        ) {
          next.add(idx);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [queue, currentTrack]);

  // Canonical Queue order (not checkbox-click order), excluding currently playing track
  const sortedSelectedIndices = useMemo(
    () =>
      Array.from(selectedIndices)
        .filter(
          (idx) =>
            idx >= 0 &&
            idx < queue.length &&
            !(currentTrack && isSameTrack(queue[idx], currentTrack))
        )
        .sort((a, b) => a - b),
    [selectedIndices, queue, currentTrack]
  );

  const selectedQueueTracks = useMemo(
    () => sortedSelectedIndices.map((idx) => queue[idx]),
    [sortedSelectedIndices, queue]
  );

  const exitSelectionMode = useCallback(() => {
    setSelectedIndices(new Set());
    setIsSelectMode(false);
  }, []);

  const toggleSelectIndex = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= queue.length) return;
      if (currentTrack && isSameTrack(queue[idx], currentTrack)) return;
      setSelectedIndices((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        return next;
      });
    },
    [queue, currentTrack]
  );

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIndices((prev) => {
      if (
        selectableVisibleIndices.length > 0 &&
        selectableVisibleIndices.every((idx) => prev.has(idx))
      ) {
        return new Set();
      }
      return new Set(selectableVisibleIndices);
    });
  }, [selectableVisibleIndices]);

  const handleToggleSelectMode = useCallback(() => {
    setContextMenu(null);
    setIsSelectMode((prev) => {
      if (prev) setSelectedIndices(new Set());
      return !prev;
    });
  }, []);

  const handleCloseMenu = useCallback((options?: { restoreFocus?: boolean }) => {
    setContextMenu((prev) => {
      if (options?.restoreFocus && prev?.triggerElement) {
        prev.triggerElement.focus({ preventScroll: true });
      }
      return null;
    });
  }, []);

  const handleOpenRowMenu = useCallback(
    (index: number, anchor: QueueRowMenuAnchor) => {
      const targetTrack = queue[index];
      if (!targetTrack) return;

      setContextMenu((prev) => {
        if (
          prev &&
          prev.targetIndex === index &&
          prev.anchorType === 'button' &&
          anchor.type === 'button'
        ) {
          return null;
        }
        const isCurrent = Boolean(currentTrack && isSameTrack(targetTrack, currentTrack));
        const isMulti =
          sortedSelectedIndices.length >= 2 && selectedIndices.has(index) && !isCurrent;

        return {
          targetIndex: index,
          targetTrack,
          isCurrent,
          mode: isMulti ? 'multi' : 'single',
          anchorType: anchor.type,
          x: anchor.x,
          y: anchor.y,
          anchorRect: anchor.rect,
          triggerElement: anchor.triggerElement,
        };
      });
    },
    [queue, currentTrack, sortedSelectedIndices.length, selectedIndices]
  );

  return {
    isSelectMode,
    selectedIndices,
    sortedSelectedIndices,
    selectedQueueTracks,
    contextMenu,
    setContextMenu,
    exitSelectionMode,
    toggleSelectIndex,
    toggleSelectAllVisible,
    handleToggleSelectMode,
    handleCloseMenu,
    handleOpenRowMenu,
  };
}
