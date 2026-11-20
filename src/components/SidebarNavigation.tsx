import { Music, FolderOpen, ListMusic, Disc, Mic2, Heart } from 'lucide-react';
import { LibraryView } from '../types/music';

export interface SidebarNavigationProps {
  currentView: LibraryView;
  totalTracksCount: number;
  foldersCount?: number;
  playlistsCount: number;
  albumsCount?: number;
  artistsCount?: number;
  favouritesCount: number;
  onSelectView: (view: LibraryView) => void;
  onSelectFolder: (path: string) => void;
}

export function SidebarNavigation({
  currentView,
  totalTracksCount,
  foldersCount = 0,
  playlistsCount,
  albumsCount = 0,
  artistsCount = 0,
  favouritesCount,
  onSelectView,
  onSelectFolder,
}: SidebarNavigationProps) {
  const baseButtonClass =
    'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50 dark:focus-visible:ring-white/30 focus-visible:border-transparent';

  const activeClass =
    'bg-[var(--bg-active)]/75 dark:bg-white/[0.06] text-[var(--text-primary)] dark:text-white border-transparent font-semibold';
  const inactiveClass =
    'border-transparent text-[var(--text-secondary)] dark:text-slate-300 hover:text-[var(--text-primary)] dark:hover:text-white hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.04]';

  const baseBadgeClass =
    'ml-auto shrink-0 whitespace-nowrap tabular-nums text-xs px-2 py-0.5 rounded-full font-medium transition-colors duration-150';
  const activeBadgeClass =
    'bg-[var(--accent-primary)]/15 dark:bg-indigo-400/20 text-[var(--accent-primary)] dark:text-indigo-200';
  const inactiveBadgeClass =
    'bg-[var(--border-subtle)]/70 dark:bg-white/[0.06] text-[var(--text-secondary)] dark:text-slate-400';

  const navItems = [
    {
      id: 'all',
      label: 'All Tracks',
      count: totalTracksCount,
      isActive: currentView === 'all',
      icon: <Music className="w-4 h-4 shrink-0 text-[var(--accent-primary)] dark:text-indigo-400" />,
      onClick: () => onSelectView('all'),
    },
    {
      id: 'folders',
      label: 'Folders',
      count: foldersCount,
      isActive: currentView === 'folder' || currentView === 'imported-files',
      icon: <FolderOpen className="w-4 h-4 shrink-0 text-emerald-500 dark:text-emerald-400" />,
      onClick: () => {
        onSelectView('folder');
        onSelectFolder('');
      },
    },
    {
      id: 'playlists',
      label: 'Playlists',
      count: playlistsCount,
      isActive: currentView === 'playlists',
      icon: <ListMusic className="w-4 h-4 shrink-0 text-amber-500 dark:text-amber-400" />,
      onClick: () => onSelectView('playlists'),
    },
    {
      id: 'albums',
      label: 'Albums',
      count: albumsCount,
      isActive: currentView === 'albums',
      icon: <Disc className="w-4 h-4 shrink-0 text-sky-500 dark:text-sky-400" />,
      onClick: () => onSelectView('albums'),
    },
    {
      id: 'artists',
      label: 'Artists',
      count: artistsCount,
      isActive: currentView === 'artists',
      icon: <Mic2 className="w-4 h-4 shrink-0 text-purple-500 dark:text-purple-400" />,
      onClick: () => onSelectView('artists'),
    },
    {
      id: 'favourites',
      label: 'Favourites',
      count: favouritesCount,
      isActive: currentView === 'favourites',
      icon: (
        <Heart className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400 fill-rose-500/20 dark:fill-rose-400/20" />
      ),
      onClick: () => onSelectView('favourites'),
    },
  ];

  return (
    <div className="p-3 space-y-1">
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          data-testid={`nav-item-${item.id}`}
          data-active={item.isActive ? 'true' : 'false'}
          aria-current={item.isActive ? 'page' : undefined}
          onClick={item.onClick}
          className={`${baseButtonClass} ${item.isActive ? activeClass : inactiveClass}`}
        >
          <span className="flex items-center gap-3 min-w-0 flex-1">
            {item.icon}
            <span className="truncate">{item.label}</span>
          </span>
          <span
            data-testid={`nav-badge-${item.id}`}
            className={`${baseBadgeClass} ${item.isActive ? activeBadgeClass : inactiveBadgeClass}`}
          >
            {item.count}
          </span>
        </button>
      ))}
    </div>
  );
}
