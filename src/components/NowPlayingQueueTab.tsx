import React, { useState, useRef, useEffect } from 'react';
import { ListMusic, Trash2, Play, Save, X } from 'lucide-react';
import { TrackItem } from '../types/music';
import { formatDuration } from '../utils/formatters';
import { isSameTrack } from '../utils/musicTree';

interface NowPlayingQueueTabProps {
  queue: TrackItem[];
  currentTrack: TrackItem | null;
  isOpen: boolean;
  isActiveTab: boolean;
  onPlayTrack?: (track: TrackItem) => void;
  onRemoveFromQueue?: (index: number) => void;
  onClearQueue?: () => void;
  onSaveQueueAsPlaylist?: (name: string) => void;
}

/**
 * Calculates whether the active queue row is outside the visible container boundaries,
 * and if so, computes the centered target scrollTop.
 */
export function calculateQueueScrollOffset(
  containerTop: number,
  containerHeight: number,
  rowTop: number,
  rowHeight: number
): { shouldScroll: boolean; targetScrollTop: number } {
  const isAbove = rowTop < containerTop;
  const isBelow = rowTop + rowHeight > containerTop + containerHeight;

  if (isAbove || isBelow) {
    const targetScrollTop = Math.max(0, rowTop - (containerHeight - rowHeight) / 2);
    return { shouldScroll: true, targetScrollTop };
  }
  return { shouldScroll: false, targetScrollTop: containerTop };
}

export const NowPlayingQueueTab: React.FC<NowPlayingQueueTabProps> = ({
  queue,
  currentTrack,
  isOpen,
  isActiveTab,
  onPlayTrack,
  onRemoveFromQueue,
  onClearQueue,
  onSaveQueueAsPlaylist,
}) => {
  const [isSavingQueue, setIsSavingQueue] = useState<boolean>(false);
  const [queuePlaylistName, setQueuePlaylistName] = useState<string>('');
  const queueContainerRef = useRef<HTMLDivElement | null>(null);
  const activeTrackRowRef = useRef<HTMLDivElement | null>(null);
  const lastScrolledTrackIdRef = useRef<string | null>(null);
  const lastIsActiveRef = useRef<boolean>(isActiveTab);
  const lastIsOpenRef = useRef<boolean>(isOpen);

  // Auto-scroll Queue container to reveal currently playing track
  useEffect(() => {
    const isTabOrPanelOpenChange =
      (!lastIsActiveRef.current && isActiveTab) ||
      (!lastIsOpenRef.current && isOpen);

    lastIsActiveRef.current = isActiveTab;
    lastIsOpenRef.current = isOpen;

    if (!isOpen || !isActiveTab || !currentTrack) return;

    const trackChanged = lastScrolledTrackIdRef.current !== currentTrack.id;
    if (!trackChanged && !isTabOrPanelOpenChange) return;

    const frameId = requestAnimationFrame(() => {
      const container = queueContainerRef.current;
      const activeRow = activeTrackRowRef.current;
      if (!container || !activeRow) return;

      const scrollCalc = calculateQueueScrollOffset(
        container.scrollTop,
        container.clientHeight,
        activeRow.offsetTop,
        activeRow.offsetHeight
      );

      if (scrollCalc.shouldScroll) {
        const prefersReducedMotion =
          typeof window !== 'undefined' &&
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

        container.scrollTo({
          top: scrollCalc.targetScrollTop,
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
        });
      }

      lastScrolledTrackIdRef.current = currentTrack.id;
    });

    return () => cancelAnimationFrame(frameId);
  }, [currentTrack, isActiveTab, isOpen, queue]);

  const handleSaveQueue = (e: React.FormEvent) => {
    e.preventDefault();
    const name = queuePlaylistName.trim() || `Queue - ${new Date().toLocaleDateString()}`;
    if (onSaveQueueAsPlaylist) {
      onSaveQueueAsPlaylist(name);
    }
    setIsSavingQueue(false);
    setQueuePlaylistName('');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Queue Header Actions */}
      <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] dark:border-white/[0.04] flex items-center justify-between text-xs shrink-0">
        <span className="font-semibold text-[var(--text-primary)] dark:text-slate-300 uppercase tracking-wider text-[11px]">
          Playback Queue ({queue.length})
        </span>
        <div className="flex items-center gap-1.5">
          {queue.length > 0 && onSaveQueueAsPlaylist && (
            <button
              type="button"
              onClick={() => setIsSavingQueue(true)}
              title="Save current queue as a playlist"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-[var(--accent-primary)] dark:text-indigo-400 hover:bg-[var(--bg-active)] dark:hover:bg-indigo-950/40 transition-colors font-medium cursor-pointer"
            >
              <Save className="w-3 h-3" />
              <span>Save as Playlist</span>
            </button>
          )}
          {queue.length > 0 && onClearQueue && (
            <button
              type="button"
              onClick={onClearQueue}
              title={currentTrack ? 'Clear upcoming songs' : 'Clear queue'}
              className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-rose-500 hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Save Queue Modal / Form inline */}
      {isSavingQueue && (
        <form
          onSubmit={handleSaveQueue}
          className="p-3 bg-[var(--bg-active)]/50 dark:bg-indigo-950/40 border-b border-[var(--accent-primary)]/20 dark:border-indigo-900/50 flex items-center gap-2"
        >
          <input
            type="text"
            autoFocus
            value={queuePlaylistName}
            onChange={(e) => setQueuePlaylistName(e.target.value)}
            placeholder="Playlist name..."
            className="flex-1 px-2.5 py-1 text-xs rounded-lg bg-[var(--bg-main)] dark:bg-slate-900 border border-[var(--border-subtle)] dark:border-slate-700 text-[var(--text-primary)] dark:text-white focus:outline-none focus:border-[var(--accent-primary)]"
          />
          <button
            type="submit"
            className="px-2.5 py-1 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium rounded-lg cursor-pointer"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setIsSavingQueue(false)}
            className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      )}

      {/* Queue List */}
      <div
        ref={queueContainerRef}
        className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1"
      >
        {queue.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center text-xs text-[var(--text-secondary)] dark:text-slate-500">
            <ListMusic className="w-10 h-10 mb-2 opacity-40 text-[var(--accent-primary)] dark:text-indigo-400" />
            <p className="font-medium text-[var(--text-primary)] dark:text-slate-400">Queue is empty</p>
            <p className="text-[11px] text-[var(--text-secondary)] mt-1">
              Add tracks to the queue using &quot;Play Next&quot; or &quot;Add to Queue&quot;
            </p>
          </div>
        ) : (
          queue.map((track, idx) => {
            const isCurrent = currentTrack ? isSameTrack(track, currentTrack) : false;
            return (
              <div
                key={`${track.id}-${idx}`}
                ref={isCurrent ? activeTrackRowRef : undefined}
                data-current={isCurrent ? 'true' : undefined}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPlayTrack?.(track);
                  }
                }}
                onClick={() => onPlayTrack?.(track)}
                className={`group flex items-center justify-between p-2 rounded-xl text-xs border transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 focus-visible:border-transparent ${
                  isCurrent
                    ? 'bg-[var(--bg-active)] dark:bg-indigo-600/25 border-[var(--accent-primary)]/30 text-[var(--accent-primary)] dark:text-indigo-300 font-medium shadow-sm'
                    : 'border-transparent hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.04] text-[var(--text-primary)] dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-4 text-center text-[10px] text-[var(--text-secondary)]">
                    {isCurrent ? (
                      <Play className="w-3 h-3 text-[var(--accent-primary)] fill-[var(--accent-primary)]" />
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-[var(--text-primary)] dark:text-white">
                      {track.metadata.title || track.name}
                    </p>
                    <p className="truncate text-[10px] text-[var(--text-secondary)] dark:text-slate-400">
                      {track.metadata.artist || 'Unknown Artist'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                    {formatDuration(track.metadata.duration)}
                  </span>
                  {onRemoveFromQueue && !isCurrent && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFromQueue(idx);
                      }}
                      title="Remove from queue"
                      className="p-1 rounded text-[var(--text-secondary)] hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
