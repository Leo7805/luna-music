import React from 'react';
import { Play, Pause, Heart, Clock, CloudOff } from 'lucide-react';
import { TrackItem } from '../types/music';
import { formatDuration } from '../utils/formatters';

interface TrackListProps {
  tracks: TrackItem[];
  currentTrackId?: string | null;
  isPlaying: boolean;
  favourites: Set<string>;
  onPlayTrack: (track: TrackItem) => void;
  onTogglePlay: () => void;
  onToggleFavourite: (trackId: string) => void;
}

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  currentTrackId,
  isPlaying,
  favourites,
  onPlayTrack,
  onTogglePlay,
  onToggleFavourite,
}) => {
  if (tracks.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">No tracks found matching your selection.</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Table Header */}
      <div className="grid grid-cols-[48px_minmax(200px,2fr)_minmax(120px,1.5fr)_72px_44px] gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-300/80 dark:border-white/[0.06] select-none">
        <div className="text-center">#</div>
        <div>Title</div>
        <div>Album</div>
        <div className="text-right flex items-center justify-end gap-1">
          <Clock className="w-3.5 h-3.5" />
        </div>
        <div className="text-center"></div>
      </div>

      {/* Track Rows */}
      <div className="divide-y divide-slate-200/60 dark:divide-white/[0.02]">
        {tracks.map((track, idx) => {
          const isCurrent = currentTrackId === track.id;
          const isFav = favourites.has(track.id);
          const extension = track.name.split('.').pop()?.toUpperCase() || '';
          const isUnavailable = track.availability === 'unavailable' || track.size === 0;

          return (
            <div
              key={track.id}
              onDoubleClick={() => onPlayTrack(track)}
              className={`group grid grid-cols-[48px_minmax(200px,2fr)_minmax(120px,1.5fr)_72px_44px] gap-3 px-4 py-2.5 items-center rounded-xl transition-all cursor-pointer select-none text-xs ${
                isCurrent
                  ? 'bg-indigo-600/15 border border-indigo-500/25 shadow-sm'
                  : 'hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
              } ${isUnavailable ? 'opacity-85' : ''}`}
            >
              {/* Col 1: Number or Animated Equalizer or Play Button */}
              <div className="flex items-center justify-center">
                {isCurrent && isPlaying ? (
                  <div className="w-4 h-4 flex items-end justify-center gap-[2px]">
                    <span className="w-[3px] bg-indigo-500 dark:bg-indigo-400 rounded-full animate-bar-1" />
                    <span className="w-[3px] bg-indigo-500 dark:bg-indigo-400 rounded-full animate-bar-2" />
                    <span className="w-[3px] bg-indigo-500 dark:bg-indigo-400 rounded-full animate-bar-3" />
                  </div>
                ) : (
                  <>
                    <span
                      className={`group-hover:hidden ${
                        isCurrent ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCurrent) {
                          onTogglePlay();
                        } else {
                          onPlayTrack(track);
                        }
                      }}
                      className="hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 text-white dark:bg-white dark:text-black hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer"
                    >
                      {isCurrent && isPlaying ? (
                        <Pause className="w-3 h-3 fill-current" />
                      ) : (
                        <Play className="w-3 h-3 fill-current ml-0.5" />
                      )}
                    </button>
                  </>
                )}
              </div>

              {/* Col 2: Thumbnail Artwork + Title + Artist + Format Badge */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center overflow-hidden shadow-sm"
                  style={{
                    background: track.metadata.placeholderGradient || 'linear-gradient(135deg, #3730a3, #1e1b4b)',
                  }}
                >
                  {track.metadata.artworkUrl ? (
                    <img
                      src={track.metadata.artworkUrl}
                      alt={track.metadata.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-white/70 uppercase">
                      {track.metadata.title.substring(0, 2)}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-medium truncate ${
                        isCurrent
                          ? 'text-indigo-700 dark:text-indigo-300 font-semibold'
                          : 'text-slate-900 dark:text-slate-100 group-hover:text-black dark:group-hover:text-white'
                      }`}
                    >
                      {track.metadata.title}
                    </span>
                    {extension && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-white/[0.08] text-slate-600 dark:text-slate-400 uppercase tracking-wider font-mono shrink-0">
                        {extension}
                      </span>
                    )}
                    {isUnavailable && (
                      <span
                        className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 font-medium shrink-0"
                        title="Not available locally"
                      >
                        <CloudOff className="w-2.5 h-2.5" />
                        <span>Not available locally</span>
                      </span>
                    )}
                    {track.lrcHandle || track.lrcFile || track.lrcContent ? (
                      <span
                        className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold shrink-0"
                        title="Synchronized LRC Lyrics Available"
                      >
                        LRC
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {track.metadata.artist || 'Unknown Artist'}
                  </p>
                </div>
              </div>

              {/* Col 3: Album */}
              <div className="text-slate-600 dark:text-slate-400 truncate text-[11px]">
                {track.metadata.album || 'Unknown Album'}
              </div>

              {/* Col 4: Duration */}
              <div className="text-right text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {formatDuration(track.metadata.duration)}
              </div>

              {/* Col 5: Favourite Button */}
              <div className="flex items-center justify-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavourite(track.id);
                  }}
                  className={`p-1.5 rounded-full transition-all cursor-pointer ${
                    isFav
                      ? 'text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white opacity-0 group-hover:opacity-100'
                  }`}
                  title={isFav ? 'Remove from favourites' : 'Add to favourites'}
                >
                  <Heart
                    className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 dark:fill-rose-400' : ''}`}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
