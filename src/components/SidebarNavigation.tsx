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
  const baseButtonClass =
    'w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 focus-visible:border-transparent';

  const activeClass =
    'bg-indigo-600/15 bg-[var(--bg-active)] dark:bg-indigo-600/20 text-[var(--accent-primary)] dark:text-indigo-300 border-indigo-500/30 border-[var(--accent-primary)]/30 shadow-sm font-semibold';
  const inactiveClass =
    'border-transparent text-[var(--text-secondary)] dark:text-slate-300 hover:text-[var(--text-primary)] dark:hover:text-white hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.04]';

  return (
    <div className="p-3 space-y-1">
      {/* 1. All Tracks */}
      <button
        type="button"
        onClick={() => onSelectView('all')}
        className={`${baseButtonClass} ${currentView === 'all' ? activeClass : inactiveClass}`}
      >
        <div className="flex items-center gap-3">
          <Music className="w-4 h-4 text-[var(--accent-primary)] dark:text-indigo-400" />
          <span>All Tracks</span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--border-subtle)]/70 dark:bg-white/[0.06] text-[var(--text-secondary)] dark:text-slate-400 font-medium">
          {totalTracksCount}
        </span>
      </button>

      {/* 2. Folders */}
      <button
        type="button"
        onClick={() => {
          onSelectView('folder');
          onSelectFolder('');
        }}
        className={`${baseButtonClass} ${
          currentView === 'folder' || currentView === 'imported-files' ? activeClass : inactiveClass
        }`}
      >
        <div className="flex items-center gap-3">
          <FolderOpen className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          <span>Folders</span>
        </div>
      </button>

      {/* 3. Playlists */}
      <button
        type="button"
        onClick={() => onSelectView('playlists')}
        className={`${baseButtonClass} ${currentView === 'playlists' ? activeClass : inactiveClass}`}
      >
        <div className="flex items-center gap-3">
          <ListMusic className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          <span>Playlists</span>
        </div>
        {playlistsCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--border-subtle)]/70 dark:bg-white/[0.06] text-[var(--text-secondary)] dark:text-slate-400 font-medium">
            {playlistsCount}
          </span>
        )}
      </button>

      {/* 4. Albums */}
      <button
        type="button"
        onClick={() => onSelectView('albums')}
        className={`${baseButtonClass} ${currentView === 'albums' ? activeClass : inactiveClass}`}
      >
        <div className="flex items-center gap-3">
          <Disc className="w-4 h-4 text-sky-500 dark:text-sky-400" />
          <span>Albums</span>
        </div>
      </button>

      {/* 5. Artists */}
      <button
        type="button"
        onClick={() => onSelectView('artists')}
        className={`${baseButtonClass} ${currentView === 'artists' ? activeClass : inactiveClass}`}
      >
        <div className="flex items-center gap-3">
          <Mic2 className="w-4 h-4 text-purple-500 dark:text-purple-400" />
          <span>Artists</span>
        </div>
      </button>

      {/* 6. Favourites */}
      <button
        type="button"
        onClick={() => onSelectView('favourites')}
        className={`${baseButtonClass} ${currentView === 'favourites' ? activeClass : inactiveClass}`}
      >
        <div className="flex items-center gap-3">
          <Heart className="w-4 h-4 text-rose-500 dark:text-rose-400 fill-rose-500/20 dark:fill-rose-400/20" />
          <span>Favourites</span>
        </div>
        {favouritesCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100/70 dark:bg-rose-950/40 text-rose-500 dark:text-rose-400 font-medium">
            {favouritesCount}
          </span>
        )}
      </button>
    </div>
  );
}
