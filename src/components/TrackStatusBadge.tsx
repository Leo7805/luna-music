import React from 'react';
import { FileX, AlertTriangle, AlertCircle } from 'lucide-react';
import { FileStatus } from '../types/music';

interface TrackStatusBadgeProps {
  status: FileStatus;
  variant?: 'inline' | 'pill';
  className?: string;
}

export const TrackStatusBadge: React.FC<TrackStatusBadgeProps> = ({
  status,
  variant = 'inline',
  className = '',
}) => {
  if (status === 'normal') return null;

  if (status === 'empty') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-medium shrink-0 ${
          variant === 'pill'
            ? 'text-[9px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
            : 'text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400'
        } ${className}`}
        title="Empty file (0 bytes)"
      >
        <FileX className="w-2.5 h-2.5" />
        <span>Empty file</span>
      </span>
    );
  }

  if (status === 'unreadable') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-medium shrink-0 ${
          variant === 'pill'
            ? 'text-[9px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30'
            : 'text-[9px] px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-700 dark:text-rose-400'
        } ${className}`}
        title="Cannot access file"
      >
        <AlertTriangle className="w-2.5 h-2.5" />
        <span>Cannot access file</span>
      </span>
    );
  }

  if (status === 'unsupported') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-medium shrink-0 ${
          variant === 'pill'
            ? 'text-[9px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30'
            : 'text-[9px] px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300'
        } ${className}`}
        title="Unsupported audio format"
      >
        <AlertCircle className="w-2.5 h-2.5" />
        <span>Unsupported audio</span>
      </span>
    );
  }

  return null;
};
