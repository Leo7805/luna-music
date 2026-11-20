import React, { useState } from 'react';
import { Search, X, Command, Folder, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { BreadcrumbItem } from '../utils/musicTree';
import { Theme, LightStyle } from '../hooks/useTheme';
import { AppearancePopover } from './AppearancePopover';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  searchQuery: string;
  breadcrumbs?: BreadcrumbItem[];
  theme: Theme;
  lightStyle: LightStyle;
  onSearchChange: (query: string) => void;
  onBreadcrumbClick?: (path: string) => void;
  onOpenShortcutsModal: () => void;
  onSelectTheme: (theme: Theme) => void;
  onSelectLightStyle: (style: LightStyle) => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  searchQuery,
  breadcrumbs,
  theme,
  lightStyle,
  onSearchChange,
  onBreadcrumbClick,
  onOpenShortcutsModal,
  onSelectTheme,
  onSelectLightStyle,
}) => {
  const [isAppearanceOpen, setIsAppearanceOpen] = useState<boolean>(false);

  return (
    <header className="relative z-30 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-subtle)] dark:border-white/[0.08] bg-[var(--bg-main)]/80 dark:bg-[#071427]/60 backdrop-blur-md transition-colors duration-200">
      {/* View Title & Breadcrumbs */}
      <div className="flex-1 min-w-0">
        {breadcrumbs && breadcrumbs.length > 1 ? (
          <nav className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] dark:text-slate-400 mb-1 flex-wrap">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <div key={crumb.path || 'root'} className="flex items-center gap-1.5">
                  {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-600" />}
                  {isLast ? (
                    <span className="text-[var(--text-primary)] dark:text-white font-medium flex items-center gap-1">
                      <Folder className="w-3 h-3 text-[var(--accent-primary)] dark:text-indigo-400" />
                      {crumb.name}
                    </span>
                  ) : (
                    <button
                      onClick={() => onBreadcrumbClick?.(crumb.path)}
                      className="hover:text-[var(--accent-primary)] dark:hover:text-indigo-300 transition-colors cursor-pointer"
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
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] dark:text-white truncate">
            {title}
          </h1>
          {subtitle && (
            <span className="text-xs text-[var(--text-secondary)] dark:text-slate-400 font-medium">
              {subtitle}
            </span>
          )}
        </div>
      </div>

      {/* Right Controls: Search & Appearance Menu */}
      <div className="flex items-center gap-3">
        {/* Search Bar */}
        <div className="relative w-64 md:w-72">
          <Search className="w-4 h-4 text-[var(--text-secondary)] dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search titles, artists, albums..."
            className="w-full pl-9 pr-8 py-2 rounded-xl text-xs glass-input placeholder-[var(--text-secondary)] dark:placeholder-slate-500 text-[var(--text-primary)] dark:text-slate-100"
          />
          {searchQuery ? (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 flex items-center">
              <Command className="w-3 h-3 text-[var(--text-secondary)]" />
            </div>
          )}
        </div>

        {/* Unified Appearance & Settings Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsAppearanceOpen((prev) => !prev)}
            className="p-2 rounded-xl glass-button text-[var(--text-secondary)] dark:text-slate-200 hover:text-[var(--text-primary)] dark:hover:text-white cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Appearance & Settings"
            title="Appearance & Settings"
            aria-expanded={isAppearanceOpen}
            aria-haspopup="dialog"
            data-testid="appearance-menu-button"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* Anchored Appearance Popover */}
          <AppearancePopover
            isOpen={isAppearanceOpen}
            onClose={() => setIsAppearanceOpen(false)}
            theme={theme}
            lightStyle={lightStyle}
            onSelectTheme={onSelectTheme}
            onSelectLightStyle={onSelectLightStyle}
            onOpenShortcutsModal={onOpenShortcutsModal}
          />
        </div>
      </div>
    </header>
  );
};
