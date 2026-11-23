import { MoreHorizontal, Trash2 } from 'lucide-react';
import { ImportedFolder } from '../types/music';
import { ImportedFilesIcon } from './ImportedFilesIcon';

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
        tabIndex={0}
        role="button"
        data-active={isSelected ? 'true' : 'false'}
        aria-current={isSelected ? 'page' : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        className={`group flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer border transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50 dark:focus-visible:ring-white/30 focus-visible:border-transparent ${
          isSelected
            ? 'bg-[var(--bg-active)] dark:bg-white/[0.1] text-[var(--text-primary)] dark:text-white font-semibold border-[var(--accent-primary)]/20 dark:border-white/[0.12]'
            : 'border-transparent text-[var(--text-secondary)] dark:text-slate-300 hover:text-[var(--text-primary)] dark:hover:text-white hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.04]'
        }`}
        onClick={onSelect}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <ImportedFilesIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate text-xs font-medium" title="Imported Files">
            Imported Files
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1.5">
          <span className="text-[10px] text-[var(--text-secondary)] dark:text-slate-400 px-1.5 py-0.2 rounded bg-[var(--border-subtle)]/70 dark:bg-white/[0.04] shrink-0 font-medium">
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
