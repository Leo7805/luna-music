import { TrackItem, TrackMetadata } from '../types/music';
import { useLazyArtwork } from '../hooks/useLazyArtwork';

export interface TrackThumbnailProps {
  metadata: TrackMetadata;
  track?: TrackItem;
}

export function TrackThumbnail({ metadata, track }: TrackThumbnailProps) {
  const artworkRef = useLazyArtwork<HTMLDivElement>(track);

  return (
    <div
      ref={artworkRef}
      className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center overflow-hidden shadow-sm"
      style={{
        background:
          metadata.placeholderGradient ||
          'linear-gradient(135deg, #3730a3, #1e1b4b)',
      }}
    >
      {metadata.artworkUrl ? (
        <img
          src={metadata.artworkUrl}
          alt={metadata.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="text-[10px] font-bold text-white/70 uppercase">
          {metadata.title ? metadata.title.substring(0, 2) : 'TR'}
        </span>
      )}
    </div>
  );
}
