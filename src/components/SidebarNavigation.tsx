import { Music, FolderOpen, ListMusic, Disc, Mic2, Heart } from 'lucide-react';
import { LibraryView } from '../types/music';

export interface SidebarNavigationProps {
  currentView: LibraryView;
  totalTracksCount: number;
  playlistsCount: number;
  favouritesCount: number;
  onSelectView: (view: LibraryView) => void;
  onSelectFolder: (path: string) => void;
}

export function SidebarNavigation({
  currentView,
  totalTracksCount,
  playlistsCount,
  favouritesCount,
  onSelectView,
  onSelectFolder,
}: SidebarNavigationProps) {
  return (
    <div className="p-3 space-y-1">
      {/* 1. All Tracks */}
      <button
        onClick={() => onSelectView('all')}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
          currentView === 'all'
            ? 'bg-indigo-600/15 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shadow-sm'
            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
        }`}
      >
        <div className="flex items-center gap-3">
          <Music className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
          <span>All Tracks</span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400">
          {totalTracksCount}
        </span>
      </button>

      {/* 2. Folders */}
      <button
        onClick={() => {
          onSelectView('folder');
          onSelectFolder('');
        }}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
          currentView === 'folder' || currentView === 'imported-files'
            ? 'bg-indigo-600/15 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shadow-sm'
            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
        }`}
      >
        <div className="flex items-center gap-3">
          <FolderOpen className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          <span>Folders</span>
        </div>
      </button>

      {/* 3. Playlists */}
      <button
        onClick={() => onSelectView('playlists')}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
          currentView === 'playlists'
            ? 'bg-indigo-600/15 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shadow-sm'
            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
        }`}
      >
        <div className="flex items-center gap-3">
          <ListMusic className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          <span>Playlists</span>
        </div>
        {playlistsCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400">
            {playlistsCount}
          </span>
        )}
      </button>

      {/* 4. Albums */}
      <button
        onClick={() => onSelectView('albums')}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
          currentView === 'albums'
            ? 'bg-indigo-600/15 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shadow-sm'
            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
        }`}
      >
        <div className="flex items-center gap-3">
          <Disc className="w-4 h-4 text-sky-500 dark:text-sky-400" />
          <span>Albums</span>
        </div>
      </button>

      {/* 5. Artists */}
      <button
        onClick={() => onSelectView('artists')}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
          currentView === 'artists'
            ? 'bg-indigo-600/15 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shadow-sm'
            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
        }`}
      >
        <div className="flex items-center gap-3">
          <Mic2 className="w-4 h-4 text-purple-500 dark:text-purple-400" />
          <span>Artists</span>
        </div>
      </button>

      {/* 6. Favourites */}
      <button
        onClick={() => onSelectView('favourites')}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
          currentView === 'favourites'
            ? 'bg-indigo-600/15 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shadow-sm'
            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
        }`}
      >
        <div className="flex items-center gap-3">
          <Heart className="w-4 h-4 text-rose-500 dark:text-rose-400 fill-rose-500/20 dark:fill-rose-400/20" />
          <span>Favourites</span>
        </div>
        {favouritesCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-300 font-semibold">
            {favouritesCount}
          </span>
        )}
      </button>
    </div>
  );
}
