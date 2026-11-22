import { MoreHorizontal } from 'lucide-react';

export interface TrackActionMenuTriggerProps {
  isOpen: boolean;
  onToggle: () => void;
  ariaLabel?: string;
  testId?: string;
}

export function TrackActionMenuTrigger({
  isOpen,
  onToggle,
  ariaLabel = 'Track actions',
  testId,
}: TrackActionMenuTriggerProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
        }
      }}
      aria-label={ariaLabel}
      aria-expanded={isOpen}
      aria-haspopup="menu"
      title="Track actions"
      data-testid={testId}
      className={`p-1.5 rounded-lg text-[var(--text-secondary)] dark:text-slate-400 hover:text-[var(--text-primary)] dark:hover:text-white hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.08] transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50 ${
        isOpen
          ? 'opacity-100 bg-slate-200/80 dark:bg-white/[0.1]'
          : 'opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100'
      }`}
    >
      <MoreHorizontal className="w-3.5 h-3.5" />
    </button>
  );
}
