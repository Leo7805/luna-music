import React, { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { Theme, LightStyle } from '../hooks/useTheme';

export interface AppearancePopoverProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  lightStyle: LightStyle;
  onSelectTheme: (theme: Theme) => void;
  onSelectLightStyle: (style: LightStyle) => void;
  onOpenShortcutsModal: () => void;
}

interface StyleConfig {
  id: LightStyle;
  name: string;
  sidebarBg: string;
  contentBg: string;
  accentColor: string;
  subtleBorder: string;
}

const LIGHT_STYLES: StyleConfig[] = [
  {
    id: 'neutral',
    name: 'Neutral',
    sidebarBg: '#EBECEC',
    contentBg: '#F5F5F3',
    accentColor: '#666B80',
    subtleBorder: '#DADCDA',
  },
  {
    id: 'warm',
    name: 'Warm',
    sidebarBg: '#ECE9E5',
    contentBg: '#F5F3F0',
    accentColor: '#756878',
    subtleBorder: '#DDD7CE',
  },
  {
    id: 'mist',
    name: 'Mist',
    sidebarBg: '#EDEBF0',
    contentBg: '#F5F3F5',
    accentColor: '#716B82',
    subtleBorder: '#DDD9E1',
  },
];

export const AppearancePopover: React.FC<AppearancePopoverProps> = ({
  isOpen,
  onClose,
  theme,
  lightStyle,
  onSelectTheme,
  onSelectLightStyle,
  onOpenShortcutsModal,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Appearance & Settings"
      data-testid="appearance-popover"
      className="absolute right-0 top-full mt-2 w-80 rounded-2xl bg-[var(--bg-panel)] dark:bg-[#0c1a30] shadow-2xl p-4 border border-[var(--border-subtle)] dark:border-white/10 z-50 select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Header: Title & Segmented Light/Dark control */}
      <div className="flex items-center justify-between gap-2 pb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] dark:text-white">
          Appearance
        </span>

        {/* Segmented Control */}
        <div className="flex items-center bg-[var(--border-subtle)]/60 dark:bg-white/[0.08] p-0.5 rounded-lg border border-[var(--border-subtle)] dark:border-white/[0.06]">
          <button
            type="button"
            onClick={() => onSelectTheme('light')}
            data-testid="theme-light-button"
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              theme === 'light'
                ? 'bg-white text-[var(--text-primary)] shadow-xs font-semibold'
                : 'text-[var(--text-secondary)] dark:text-slate-400 hover:text-[var(--text-primary)] dark:hover:text-white'
            }`}
          >
            Light
          </button>
          <button
            type="button"
            onClick={() => onSelectTheme('dark')}
            data-testid="theme-dark-button"
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              theme === 'dark'
                ? 'bg-slate-700/80 text-white shadow-xs font-semibold'
                : 'text-[var(--text-secondary)] dark:text-slate-400 hover:text-[var(--text-primary)] dark:hover:text-white'
            }`}
          >
            Dark
          </button>
        </div>
      </div>

      {/* Light Style Section: Only visible in Light Mode */}
      {theme === 'light' && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">
            Light Theme Style
          </div>

          <div className="grid grid-cols-3 gap-2">
            {LIGHT_STYLES.map((style) => {
              const isSelected = lightStyle === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  data-testid={`light-style-${style.id}`}
                  onClick={() => onSelectLightStyle(style.id)}
                  className={`flex flex-col items-center gap-1.5 p-1.5 rounded-xl border transition-all cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    isSelected
                      ? 'border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/25 shadow-xs'
                      : 'border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/40 hover:bg-[var(--bg-hover)]/40'
                  }`}
                >
                  {/* Miniature App Preview */}
                  <div
                    className="w-full h-13 rounded-lg overflow-hidden flex border border-[var(--border-subtle)]/70 shadow-xs"
                    style={{ backgroundColor: style.contentBg }}
                  >
                    {/* Mini Sidebar */}
                    <div
                      className="w-[30%] h-full shrink-0 border-r border-[var(--border-subtle)]/60 p-1 flex flex-col gap-1"
                      style={{ backgroundColor: style.sidebarBg }}
                    >
                      <div
                        className="w-full h-1.5 rounded-full"
                        style={{ backgroundColor: style.accentColor, opacity: 0.6 }}
                      />
                      <div
                        className="w-3/4 h-1 rounded-full"
                        style={{ backgroundColor: style.subtleBorder }}
                      />
                    </div>

                    {/* Mini Content Area */}
                    <div className="flex-1 p-1.5 flex flex-col justify-between">
                      <div
                        className="w-4/5 h-1.5 rounded-full"
                        style={{ backgroundColor: style.accentColor }}
                      />
                      <div className="space-y-1">
                        <div
                          className="w-full h-1 rounded-full"
                          style={{ backgroundColor: style.subtleBorder }}
                        />
                        <div
                          className="w-3/5 h-1 rounded-full"
                          style={{ backgroundColor: style.subtleBorder }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Style Label with Checkmark */}
                  <div className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-primary)]">
                    {isSelected && (
                      <Check className="w-3 h-3 text-[var(--accent-primary)] stroke-[2.5]" />
                    )}
                    <span className={isSelected ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>
                      {style.name}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Separator */}
      <div className="my-3 border-t border-[var(--border-subtle)] dark:border-white/[0.08]" />

      {/* Keyboard Shortcuts Entry */}
      <button
        type="button"
        onClick={() => {
          onOpenShortcutsModal();
          onClose();
        }}
        data-testid="keyboard-shortcuts-menu-button"
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium text-[var(--text-secondary)] dark:text-slate-300 hover:text-[var(--text-primary)] dark:hover:text-white hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.06] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <span>Keyboard Shortcuts</span>
        <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--border-subtle)]/80 dark:bg-white/10 text-[var(--text-secondary)] dark:text-slate-300 font-semibold border border-[var(--border-subtle)] dark:border-white/10 shadow-xs">
          ?
        </kbd>
      </button>
    </div>
  );
};
