import { Heart } from 'lucide-react';

export interface TrackListEmptyStateProps {
  emptyVariant?: 'default' | 'favourites' | 'search';
  emptyMessage?: string;
}

export function TrackListEmptyState({
  emptyVariant = 'default',
  emptyMessage,
}: TrackListEmptyStateProps) {
  if (emptyVariant === 'favourites') {
    return (
      <div className="py-20 text-center flex flex-col items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 dark:bg-rose-500/20 flex items-center justify-center mb-3 text-rose-500 dark:text-rose-400">
          <Heart className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          No favourite tracks yet
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
          Click the heart icon on any track to add it to your favourites.
        </p>
      </div>
    );
  }

  if (emptyVariant === 'search') {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {emptyMessage || 'No tracks found matching your search.'}
        </p>
      </div>
    );
  }

  return (
    <div className="py-16 text-center">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {emptyMessage || 'No tracks found matching your selection.'}
      </p>
    </div>
  );
}
