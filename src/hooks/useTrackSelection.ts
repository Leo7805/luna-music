import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TrackItem } from '../types/music';

export interface UseTrackSelectionOptions {
  tracks: TrackItem[];
}

export function useTrackSelection({ tracks }: UseTrackSelectionOptions) {
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [lastSelectedTrackId, setLastSelectedTrackId] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);

  // Touch long-press and scrolling suppression refs
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isTouchScrollingRef = useRef<boolean>(false);
  const isTouchLongPressTriggeredRef = useRef<boolean>(false);

  // Reconcile selection if displayed tracks change (prune deleted/promoted IDs)
  useEffect(() => {
    setSelectedTrackIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(tracks.map((t) => t.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) {
          next.add(id);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [tracks]);

  // Keyboard navigation for multi-selection (Cmd+A / Ctrl+A, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      // Cmd+A / Ctrl+A: Select all visible tracks
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setSelectedTrackIds(new Set(tracks.map((t) => t.id)));
        return;
      }

      // Escape: Clear selection or exit select mode
      if (e.key === 'Escape') {
        if (selectedTrackIds.size > 0) {
          e.preventDefault();
          setSelectedTrackIds(new Set());
          setLastSelectedTrackId(null);
        } else if (isSelectMode) {
          setIsSelectMode(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tracks, selectedTrackIds.size, isSelectMode]);

  const selectedTracks = useMemo(() => {
    return tracks.filter((t) => selectedTrackIds.has(t.id));
  }, [tracks, selectedTrackIds]);

  // Handle row click with modifiers (Cmd/Ctrl, Shift, or normal)
  const handleRowClick = useCallback(
    (e: React.MouseEvent, track: TrackItem, index: number) => {
      if ((e.target as HTMLElement).closest('button, [data-track-menu], input[type="checkbox"]')) {
        return;
      }

      if (e.metaKey || e.ctrlKey) {
        setSelectedTrackIds((prev) => {
          const next = new Set(prev);
          if (next.has(track.id)) {
            next.delete(track.id);
          } else {
            next.add(track.id);
          }
          return next;
        });
        setLastSelectedTrackId(track.id);
        return;
      }

      if (e.shiftKey) {
        if (!lastSelectedTrackId) {
          setSelectedTrackIds(new Set([track.id]));
          setLastSelectedTrackId(track.id);
          return;
        }

        const lastIdx = tracks.findIndex((t) => t.id === lastSelectedTrackId);
        if (lastIdx === -1) {
          setSelectedTrackIds(new Set([track.id]));
          setLastSelectedTrackId(track.id);
          return;
        }

        const start = Math.min(lastIdx, index);
        const end = Math.max(lastIdx, index);
        const rangeIds = tracks.slice(start, end + 1).map((t) => t.id);

        setSelectedTrackIds((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((id) => next.add(id));
          return next;
        });
        return;
      }

      if (isSelectMode) {
        setSelectedTrackIds((prev) => {
          const next = new Set(prev);
          if (next.has(track.id)) {
            next.delete(track.id);
          } else {
            next.add(track.id);
          }
          return next;
        });
        setLastSelectedTrackId(track.id);
        return;
      }

      if (selectedTrackIds.size > 0) {
        setSelectedTrackIds(new Set());
        setLastSelectedTrackId(null);
      }
    },
    [tracks, lastSelectedTrackId, isSelectMode, selectedTrackIds.size]
  );

  // Checkbox toggle
  const handleCheckboxClick = useCallback((e: React.MouseEvent, track: TrackItem) => {
    e.stopPropagation();
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(track.id)) {
        next.delete(track.id);
      } else {
        next.add(track.id);
      }
      return next;
    });
    setLastSelectedTrackId(track.id);
  }, []);

  // Select all / Deselect all
  const toggleSelectAll = useCallback(() => {
    if (selectedTrackIds.size === tracks.length && tracks.length > 0) {
      setSelectedTrackIds(new Set());
      setLastSelectedTrackId(null);
    } else {
      setSelectedTrackIds(new Set(tracks.map((t) => t.id)));
    }
  }, [tracks, selectedTrackIds.size]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedTrackIds(new Set());
    setLastSelectedTrackId(null);
  }, []);

  // Touch handlers (supports tap, scrolling cancellation, and long-press selection)
  const handleTouchStart = useCallback(
    (eOrTrack: React.TouchEvent | TrackItem, maybeTrack?: TrackItem) => {
      isTouchScrollingRef.current = false;
      isTouchLongPressTriggeredRef.current = false;

      let track: TrackItem | undefined;
      if ('touches' in eOrTrack) {
        if (eOrTrack.touches.length > 0) {
          touchStartPosRef.current = {
            x: eOrTrack.touches[0].clientX,
            y: eOrTrack.touches[0].clientY,
          };
        }
        track = maybeTrack;
      } else {
        track = eOrTrack;
      }

      if (!track) return;

      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
      }

      touchTimerRef.current = setTimeout(() => {
        isTouchLongPressTriggeredRef.current = true;
        setIsSelectMode(true);
        setSelectedTrackIds((prev) => {
          const next = new Set(prev);
          next.add(track!.id);
          return next;
        });
        setLastSelectedTrackId(track!.id);
      }, 500);
    },
    []
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartPosRef.current && e.touches.length > 0) {
      const dx = e.touches[0].clientX - touchStartPosRef.current.x;
      const dy = e.touches[0].clientY - touchStartPosRef.current.y;
      if (Math.hypot(dx, dy) > 8) {
        isTouchScrollingRef.current = true;
        if (touchTimerRef.current) {
          clearTimeout(touchTimerRef.current);
          touchTimerRef.current = null;
        }
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  }, []);

  const isTouchActionSuppressed = useCallback(() => {
    if (isTouchScrollingRef.current || isTouchLongPressTriggeredRef.current) {
      isTouchScrollingRef.current = false;
      isTouchLongPressTriggeredRef.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    selectedTrackIds,
    setSelectedTrackIds,
    selectedTracks,
    lastSelectedTrackId,
    isSelectMode,
    setIsSelectMode,
    handleRowClick,
    handleCheckboxClick,
    toggleSelectAll,
    clearSelection,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    isTouchActionSuppressed,
  };
}
