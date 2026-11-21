import { createContext, useContext } from 'react';
import { TrackItem } from '../types/music';
import { ArtworkPriority } from '../utils/artworkLoader';

export type RequestTrackArtworkFn = (
  track: TrackItem | null | undefined,
  priority?: ArtworkPriority
) => void;

const noopRequest: RequestTrackArtworkFn = () => {};

const ArtworkRequestContext = createContext<RequestTrackArtworkFn>(noopRequest);

export const ArtworkRequestProvider = ArtworkRequestContext.Provider;

export function useArtworkRequester(): RequestTrackArtworkFn {
  return useContext(ArtworkRequestContext);
}
