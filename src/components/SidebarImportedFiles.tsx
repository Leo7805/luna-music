import { Files, MoreHorizontal, Trash2 } from 'lucide-react';
import { ImportedFolder } from '../types/music';

export interface SidebarImportedFilesProps {
  importedFolder: ImportedFolder;
  isSelected: boolean;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onSelect: () => void;
  onClearAllPrompt: () => void;
}

export function SidebarImportedFiles({
  importedFolder,
  isSelected,
  isMenuOpen,
  onToggleMenu,
  onSelect,
  onClearAllPrompt,
}: SidebarImportedFilesProps) {
  return (
    <div className="select-none relative" data-testid="sidebar-imported-files">
      <div
        className={`group flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer transition-all ${
          isSelected
            ? 'bg-indigo-600/20 dark:bg-indigo-600/25 text-indigo-700 dark:text-white font-medium border border-indigo-500/30 shadow-sm'
            : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
        }`}
        onClick={onSelect}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Files className="w-3.5 h-3.5 shrink-0 text-sky-500 dark:text-sky-400" />
          <span className="truncate text-xs font-medium" title="Imported Files">
            Imported Files
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1.5">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-white/[0.04] shrink-0">
            {importedFolder.tracks.length}
          </span>

          <div className="relative" data-folder-menu>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMenu();
              }}
              aria-label="Options for Imported Files"
              title="Imported Files options"
              className={`p-1 rounded hover:bg-slate-300/60 dark:hover:bg-white/[0.1] text-slate-400 hover:text-slate-700 dark:hover:text-white transition-opacity cursor-pointer ${
                isMenuOpen
                  ? 'opacity-100 bg-slate-300/60 dark:bg-white/[0.1]'
                  : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
              }`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {isMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-44 py-1 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-white/[0.08] z-50 text-xs animate-fade-in"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    onToggleMenu();
                    onClearAllPrompt();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove All Files</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
