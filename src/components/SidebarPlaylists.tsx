import { ListMusic, Plus, MoreHorizontal, Edit2, Trash2 } from 'lucide-react';
import { Playlist, LibraryView } from '../types/music';

export interface SidebarPlaylistsProps {
  playlists: Playlist[];
  selectedPlaylistId?: string | null;
  activeMenuPlaylistId: string | null;
  onToggleMenu: (id: string) => void;
  onSelectPlaylist?: (playlistId: string | null) => void;
  onSelectView: (view: LibraryView) => void;
  onCreatePrompt: () => void;
  onRenamePrompt: (playlist: Playlist) => void;
  onDeletePrompt: (playlist: Playlist) => void;
}

export function SidebarPlaylists({
  playlists,
  selectedPlaylistId,
  activeMenuPlaylistId,
  onToggleMenu,
  onSelectPlaylist,
  onSelectView,
  onCreatePrompt,
  onRenamePrompt,
  onDeletePrompt,
}: SidebarPlaylistsProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 border-t border-[var(--border-subtle)] dark:border-white/[0.08] mt-2">
      {/* Section Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] dark:text-slate-400">
          My Playlists
        </span>
        <button
          type="button"
          onClick={onCreatePrompt}
          title="Create Playlist"
          aria-label="Create Playlist"
          className="p-1 rounded-lg hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.08] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] dark:text-slate-400 dark:hover:text-indigo-400 transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Playlist List or Clean Empty State */}
      <div className="flex-1 overflow-y-auto px-2 py-1 custom-scrollbar text-sm space-y-0.5">
        {playlists.length > 0 ? (
          playlists.map((pl) => (
            <div
              key={pl.id}
              className="select-none relative"
              data-testid={`sidebar-playlist-${pl.id}`}
            >
              <div
                tabIndex={0}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectView('playlists');
                    onSelectPlaylist?.(pl.id);
                  }
                }}
                className={`group flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer border transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 focus-visible:border-transparent ${
                  selectedPlaylistId === pl.id
                    ? 'bg-indigo-600/20 bg-[var(--bg-active)] dark:bg-indigo-600/25 text-[var(--accent-primary)] dark:text-white font-medium border-indigo-500/30 border-[var(--accent-primary)]/30 shadow-sm'
                    : 'border-transparent text-[var(--text-secondary)] dark:text-slate-300 hover:text-[var(--text-primary)] dark:hover:text-white hover:bg-[var(--bg-hover)] dark:hover:bg-white/[0.04]'
                }`}
                onClick={() => {
                  onSelectView('playlists');
                  onSelectPlaylist?.(pl.id);
                }}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <ListMusic className="w-3.5 h-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
                  <span className="truncate text-xs font-medium" title={pl.name}>
                    {pl.name}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-1.5">
                  <span className="text-[10px] text-[var(--text-secondary)] dark:text-slate-400 px-1.5 py-0.2 rounded bg-[var(--border-subtle)]/70 dark:bg-white/[0.04] shrink-0 font-medium">
                    {pl.tracks.length}
                  </span>

                  <div className="relative" data-playlist-menu>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleMenu(pl.id);
                      }}
                      aria-label={`Options for ${pl.name}`}
                      title="Playlist options"
                      className={`p-1 rounded hover:bg-slate-300/60 dark:hover:bg-white/[0.1] text-slate-400 hover:text-slate-700 dark:hover:text-white transition-opacity cursor-pointer ${
                        activeMenuPlaylistId === pl.id
                          ? 'opacity-100 bg-slate-300/60 dark:bg-white/[0.1]'
                          : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                      }`}
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>

                    {activeMenuPlaylistId === pl.id && (
                      <div
                        className="absolute right-0 top-full mt-1 w-36 py-1 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-white/[0.08] z-50 text-xs animate-fade-in"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onRenamePrompt(pl)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>Rename</span>
                        </button>
                        <div className="my-1 border-t border-slate-100 dark:border-white/[0.06]" />
                        <button
                          type="button"
                          onClick={() => onDeletePrompt(pl)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 text-center text-slate-400 dark:text-slate-500">
            <ListMusic className="w-8 h-8 mx-auto mb-2 opacity-40 text-amber-500" />
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">No playlists yet</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 max-w-[180px] leading-relaxed">
              Create a playlist to organize your favorite tracks
            </p>
            {onCreatePrompt && (
              <button
                type="button"
                onClick={onCreatePrompt}
                className="mt-3 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Playlist</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
