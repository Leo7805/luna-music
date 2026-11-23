import React from 'react';

export interface ViewHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  search?: React.ReactNode;
  actions?: React.ReactNode;
  settings?: React.ReactNode;
}

/** Shared visual shell; the caller supplies all view behaviour through slots. */
export function ViewHeader({ title, subtitle, breadcrumbs, search, actions, settings }: ViewHeaderProps) {
  return (
    <header className="@container relative z-30 shrink-0 px-6 py-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-[var(--border-subtle)] dark:border-white/[0.08] bg-[var(--bg-main)]/80 dark:bg-[#071427]/60 backdrop-blur-md transition-colors duration-200">
      <div className="flex-1 min-w-0 basis-48">
        {breadcrumbs ? (
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 min-w-0">
            {breadcrumbs}
            {subtitle && (
              <span data-testid="header-subtitle" className="text-xs text-[var(--text-secondary)] dark:text-slate-400 font-medium shrink-0">
                {subtitle}
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] dark:text-white truncate">
              {title}
            </h1>
            {subtitle && (
              <span data-testid="header-subtitle" className="text-xs text-[var(--text-secondary)] dark:text-slate-400 font-medium shrink-0">
                {subtitle}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 min-w-0 max-w-full">
        {search && <div className="flex-1 basis-48 min-w-[min(12rem,100%)] max-w-72">{search}</div>}
        {actions}
        {settings}
      </div>
    </header>
  );
}
