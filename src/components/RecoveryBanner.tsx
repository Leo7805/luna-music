import React from 'react';
import { FolderOpen, ArrowRight } from 'lucide-react';

interface RecoveryBannerProps {
  onRestore: () => void;
}

export const RecoveryBanner: React.FC<RecoveryBannerProps> = ({ onRestore }) => {
  return (
    <div className="bg-[var(--bg-active)]/90 dark:bg-indigo-950/80 border-b border-[var(--border-subtle)] dark:border-indigo-500/30 px-6 py-2.5 flex items-center justify-between text-xs backdrop-blur-md text-[var(--text-primary)] dark:text-indigo-200">
      <div className="flex items-center gap-2">
        <FolderOpen className="w-4 h-4 text-[var(--accent-primary)] dark:text-indigo-400" />
        <span>Saved music folders need access. Restore access, or reselect folders imported through Open Music.</span>
      </div>

      <button
        onClick={onRestore}
        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-all hover:scale-105 active:scale-95 shadow-sm cursor-pointer"
      >
        <span>Restore Access</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
