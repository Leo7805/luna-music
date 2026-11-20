import React from 'react';
import { Search, X, Command, Folder, ChevronRight, HelpCircle, Sun, Moon } from 'lucide-react';
import { BreadcrumbItem } from '../utils/musicTree';
import { Theme } from '../hooks/useTheme';

interface HeaderProps {
  title: string;
  subtitle?: string;
  searchQuery: string;
  breadcrumbs?: BreadcrumbItem[];
  theme: Theme;
  onSearchChange: (query: string) => void;
  onBreadcrumbClick?: (path: string) => void;
  onOpenShortcutsModal: () => void;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  searchQuery,
  breadcrumbs,
  theme,
  onSearchChange,
  onBreadcrumbClick,
  onOpenShortcutsModal,
  onToggleTheme,
}) => {
  return (
    <header className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#DDE4EF] dark:border-white/[0.08] bg-[#F5F7FB]/80 dark:bg-[#071427]/60 backdrop-blur-md transition-colors duration-200">
      {/* View Title & Breadcrumbs */}
      <div className="flex-1 min-w-0">
        {breadcrumbs && breadcrumbs.length > 1 ? (
          <nav className="flex items-center gap-1.5 text-xs text-[#687995] dark:text-slate-400 mb-1 flex-wrap">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <div key={crumb.path || 'root'} className="flex items-center gap-1.5">
                  {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-600" />}
                  {isLast ? (
                    <span className="text-[#182238] dark:text-white font-medium flex items-center gap-1">
                      <Folder className="w-3 h-3 text-[#565ECF] dark:text-indigo-400" />
                      {crumb.name}
                    </span>
                  ) : (
                    <button
                      onClick={() => onBreadcrumbClick?.(crumb.path)}
                      className="hover:text-[#565ECF] dark:hover:text-indigo-300 transition-colors cursor-pointer"
                    >
                      {crumb.name}
                    </button>
                  )}
                </div>
              );
            })}
          </nav>
        ) : null}

        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-[#182238] dark:text-white truncate">
            {title}
          </h1>
          {subtitle && (
            <span className="text-xs text-[#687995] dark:text-slate-400 font-medium">
              {subtitle}
            </span>
          )}
        </div>
      </div>

      {/* Right Controls: Search & Theme Toggle & Shortcuts */}
      <div className="flex items-center gap-3">
        {/* Search Bar */}
        <div className="relative w-64 md:w-72">
          <Search className="w-4 h-4 text-[#687995] dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search titles, artists, albums..."
            className="w-full pl-9 pr-8 py-2 rounded-xl text-xs glass-input placeholder-[#687995] dark:placeholder-slate-500 text-[#182238] dark:text-slate-100"
          />
          {searchQuery ? (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#687995] hover:text-[#182238] dark:hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 flex items-center">
              <Command className="w-3 h-3 text-[#687995]" />
            </div>
          )}
        </div>

        {/* Theme Toggle (Sun / Moon) */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="p-2 rounded-xl glass-button text-[#687995] dark:text-slate-200 hover:text-[#182238] dark:hover:text-white cursor-pointer"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          data-testid="theme-toggle-button"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-[#565ECF]" />
          )}
        </button>

        {/* Shortcuts Guide Button */}
        <button
          type="button"
          onClick={onOpenShortcutsModal}
          className="p-2 rounded-xl glass-button text-[#687995] dark:text-slate-300 hover:text-[#182238] dark:hover:text-white cursor-pointer"
          title="Keyboard Shortcuts"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
