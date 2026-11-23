import { CheckSquare, Play } from 'lucide-react';

export interface PlayAllButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export interface SelectModeButtonProps {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const buttonClass = 'h-8 shrink-0 px-3 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50';

export function PlayAllButton({ onClick, disabled }: PlayAllButtonProps) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid="play-all-button" className={`${buttonClass} glass-button`}>
      <Play aria-hidden="true" className="w-3.5 h-3.5 text-[var(--accent-primary)] dark:text-indigo-400" />
      Play All
    </button>
  );
}

export function SelectModeButton({ active, onClick, disabled }: SelectModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      data-testid="toggle-select-mode"
      className={`${buttonClass} ${active ? 'border border-transparent bg-[var(--accent-primary)] text-white shadow-sm' : 'glass-button'}`}
    >
      <CheckSquare aria-hidden="true" className="w-3.5 h-3.5" />
      {active ? 'Done' : 'Select'}
    </button>
  );
}
