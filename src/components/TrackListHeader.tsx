import { Clock, CheckSquare, Square } from 'lucide-react';

export interface TrackListHeaderProps {
  tracksCount: number;
  selectedCount: number;
  isSelectMode: boolean;
  showCheckboxes: boolean;
  onToggleSelectMode: () => void;
  onToggleSelectAll: () => void;
}

export function TrackListHeader({
  tracksCount,
  selectedCount,
  isSelectMode,
  showCheckboxes,
  onToggleSelectMode,
  onToggleSelectAll,
}: TrackListHeaderProps) {
  return (
    <>
      {/* Select Mode Toolbar Controls */}
      <div className="flex items-center justify-between pb-2 px-1">
        <div className="text-[11px] text-slate-400 dark:text-slate-500">
          {selectedCount > 0
            ? `${selectedCount} of ${tracksCount} selected`
            : `${tracksCount} tracks`}
        </div>
        <button
          type="button"
          onClick={onToggleSelectMode}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
            isSelectMode
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
          }`}
          data-testid="toggle-select-mode"
        >
          {isSelectMode ? 'Done' : 'Select'}
        </button>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[48px_minmax(200px,2fr)_minmax(120px,1.5fr)_72px_88px] gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-300/80 dark:border-white/[0.06] select-none">
        <div className="text-center flex items-center justify-center">
          {showCheckboxes ? (
            <button
              type="button"
              onClick={onToggleSelectAll}
              aria-label="Select all"
              className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
            >
              {selectedCount === tracksCount && tracksCount > 0 ? (
                <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
          ) : (
            '#'
          )}
        </div>
        <div>Title</div>
        <div>Album</div>
        <div className="text-right flex items-center justify-end gap-1">
          <Clock className="w-3.5 h-3.5" />
        </div>
        <div className="text-center"></div>
      </div>
    </>
  );
}
