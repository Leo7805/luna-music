import React from 'react';
import { ListMusic } from 'lucide-react';

export const PlaylistsView: React.FC = () => {
  return (
    <div
      data-testid="playlists-view"
      className="flex flex-col items-center justify-center min-h-[380px] py-16 text-center select-none"
    >
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 flex items-center justify-center mb-4 text-amber-600 dark:text-amber-400">
        <ListMusic className="w-8 h-8" />
      </div>
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1.5">
        No playlists yet
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
        Custom playlists, import/export, and smart playlist management will be available in an upcoming update.
      </p>
    </div>
  );
};
