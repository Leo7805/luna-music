import React from 'react';
import { FolderOpen, ArrowRight } from 'lucide-react';

interface RecoveryBannerProps {
  onRestore: () => void;
}

export const RecoveryBanner: React.FC<RecoveryBannerProps> = ({ onRestore }) => {
  return (
    <div className="bg-indigo-100/90 dark:bg-indigo-950/80 border-b border-indigo-300 dark:border-indigo-500/30 px-6 py-2.5 flex items-center justify-between text-xs backdrop-blur-md text-indigo-900 dark:text-indigo-200">
      <div className="flex items-center gap-2">
        <FolderOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        <span>A previous music library was found. Browser permission is needed to access it.</span>
      </div>

      <button
        onClick={onRestore}
        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all hover:scale-105 active:scale-95 shadow-sm cursor-pointer"
      >
        <span>Grant Permission</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
