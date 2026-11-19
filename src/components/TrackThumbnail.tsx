import { TrackMetadata } from '../types/music';

export interface TrackThumbnailProps {
  metadata: TrackMetadata;
}

export function TrackThumbnail({ metadata }: TrackThumbnailProps) {
  return (
    <div
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
