import { Heart } from 'lucide-react';

export interface TrackFavouriteButtonProps {
  isFavourite: boolean;
  onToggle: () => void;
  disabled?: boolean;
  testId?: string;
}

export function TrackFavouriteButton({
  isFavourite,
  onToggle,
  disabled = false,
  testId,
}: TrackFavouriteButtonProps) {
  const label = isFavourite ? 'Remove from favourites' : 'Add to favourites';

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
        }
      }}
      aria-label={label}
      aria-pressed={isFavourite}
      title={label}
      data-testid={testId}
      className={`p-1.5 rounded-full transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
        isFavourite
          ? 'text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300'
          : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100'
      }`}
    >
      <Heart
        className={`w-3.5 h-3.5 ${isFavourite ? 'fill-rose-500 dark:fill-rose-400' : ''}`}
      />
    </button>
  );
}
