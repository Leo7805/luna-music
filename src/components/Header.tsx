import React, { useState } from 'react';
import { Search, X, Command, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { BreadcrumbItem } from '../utils/musicTree';
import { Theme, LightStyle } from '../hooks/useTheme';
import { AppearancePopover } from './AppearancePopover';
import { ViewHeader } from './ViewHeader';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  searchQuery: string;
  searchPlaceholder?: string;
  breadcrumbs?: BreadcrumbItem[];
  keepBreadcrumbsOnSearch?: boolean;
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
  actions,
  searchQuery,
  searchPlaceholder = 'Search song titles...',
  breadcrumbs,
  keepBreadcrumbsOnSearch = false,
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
    <ViewHeader
      title={title}
      subtitle={subtitle}
      actions={actions}
      breadcrumbs={(keepBreadcrumbsOnSearch || !searchQuery) && breadcrumbs && breadcrumbs.length > 1 ? (
        <nav
          aria-label="Folder breadcrumb"
          data-testid="folder-breadcrumb"
          className="flex items-center gap-1.5 min-w-0 flex-wrap"
        >
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <div key={crumb.path || 'root'} className="flex items-center gap-1.5 min-w-0">
                {idx > 0 && (
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--text-secondary)]/60 dark:text-slate-600 shrink-0" />
                )}
                {isLast ? (
                  <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)] dark:text-white truncate">
                    {crumb.name}
                  </h1>
                ) : (
                  <button
                    type="button"
                    onClick={() => onBreadcrumbClick?.(crumb.path)}
                    className="text-sm font-medium text-[var(--text-secondary)] dark:text-slate-400 hover:text-[var(--text-primary)] dark:hover:text-white transition-colors cursor-pointer truncate"
                  >
                    {crumb.name}
                  </button>
                )}
              </div>
            );
          })}
        </nav>
      ) : undefined}
      search={(
        <div className="relative w-full">
          <Search className="w-4 h-4 text-[var(--text-secondary)] dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            aria-label={searchPlaceholder.replace(/\.+$/, '')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-8 pl-9 pr-8 rounded-xl text-xs glass-input placeholder-[var(--text-secondary)] dark:placeholder-slate-500 text-[var(--text-primary)] dark:text-slate-100"
          />
          {searchQuery ? (
            <button
              type="button"
              aria-label="Clear search"
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
      )}
      settings={(
        <div className="relative shrink-0 [&_[role=dialog]]:max-w-[calc(100cqw-3rem)]">
          <button
            type="button"
            onClick={() => setIsAppearanceOpen((prev) => !prev)}
            className="h-8 w-8 flex items-center justify-center rounded-xl glass-button text-[var(--text-secondary)] dark:text-slate-200 hover:text-[var(--text-primary)] dark:hover:text-white cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
      )}
    />
  );
};
