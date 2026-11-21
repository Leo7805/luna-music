import { useRef, useCallback, useEffect } from 'react';
import { MusicLibrary, TrackItem } from '../types/music';
import { updateTracksMetadataInLibrary } from '../utils/libraryAggregation';
import { MetadataExtractionQueue } from '../utils/metadataExtractionQueue';
import { MetadataUpdateBatcher } from '../utils/metadataUpdateBatcher';
import { naturalSort } from '../utils/naturalSort';
import {
  queueMetadataCacheUpsert,
  flushMetadataCacheWrites,
} from '../services/metadataCacheWriter';

export interface UseMetadataExtractionPipelineProps {
  libraryRef: React.MutableRefObject<MusicLibrary | null>;
  onLibraryUpdated: (updater: (prev: MusicLibrary | null) => MusicLibrary | null) => void;
}

/**
 * Coordinates visible-first background metadata extraction, batched Library updates,
 * stale-result discarding, and debounced IndexedDB cache persistence.
 */
export function useMetadataExtractionPipeline({
  libraryRef,
  onLibraryUpdated,
}: UseMetadataExtractionPipelineProps) {
  const isTrackLiveAndFresh = (track: TrackItem, sourceId: string): boolean => {
    const curLib = libraryRef.current;
    if (!curLib) return false;
    if (sourceId && sourceId !== 'global' && !curLib.folders.some((f) => f.id === sourceId)) {
      return false;
    }
    const live = curLib.flatPlaylist.find(
      (t) => t.id === track.id || Boolean(t.aliases?.includes(track.id))
    );
    return Boolean(live && live.size === track.size && live.lastModified === track.lastModified);
  };

  const extractionQueueRef = useRef<MetadataExtractionQueue | null>(null);
  const metadataBatcherRef = useRef<MetadataUpdateBatcher | null>(null);

  if (!metadataBatcherRef.current) {
    metadataBatcherRef.current = new MetadataUpdateBatcher({
      flushIntervalMs: 120,
      maxBatchSize: 20,
      isEntryStillValid: (entry) =>
        Boolean(extractionQueueRef.current?.isSourceGenerationCurrent(entry.sourceId, entry.generation)) &&
        isTrackLiveAndFresh(entry.track, entry.sourceId),
      onFlushBatch: (validEntries) => {
        const updatesMap = new Map(validEntries.map((e) => [e.track.id, e.metadata]));
        onLibraryUpdated((prevLib) =>
          prevLib ? updateTracksMetadataInLibrary(prevLib, updatesMap) : null
        );
        for (const entry of validEntries) {
          queueMetadataCacheUpsert(entry.track, entry.metadata, { tagsParsed: true });
        }
      },
    });
  }

  if (!extractionQueueRef.current) {
    extractionQueueRef.current = new MetadataExtractionQueue({
      concurrency: 3,
      isTrackStillValid: isTrackLiveAndFresh,
      onTrackExtracted: (track, meta, sourceId, generation) => {
        metadataBatcherRef.current?.enqueue(track, meta, sourceId, generation);
      },
      onDrained: () => {
        metadataBatcherRef.current?.flush();
        void flushMetadataCacheWrites();
      },
    });
  }

  useEffect(() => () => metadataBatcherRef.current?.dispose(), []);

  const startIncrementalMetadataExtraction = useCallback(
    (
      tracks: TrackItem[],
      sourceId = 'global',
      options?: { invalidatePreviousForSource?: boolean }
    ) => {
      if (options?.invalidatePreviousForSource) {
        metadataBatcherRef.current?.invalidateSource(sourceId);
      }
      const ordered = naturalSort(tracks, (t) => t.relativePath || t.name);
      extractionQueueRef.current?.enqueueBatch(sourceId, ordered, options);
    },
    []
  );

  const invalidateMetadataSource = useCallback((sourceId: string) => {
    extractionQueueRef.current?.invalidateSource(sourceId);
    metadataBatcherRef.current?.invalidateSource(sourceId);
  }, []);

  const invalidateMetadataTracks = useCallback((trackIds: string[]) => {
    extractionQueueRef.current?.invalidateTracks(trackIds);
    metadataBatcherRef.current?.invalidateTracks(trackIds);
  }, []);

  return {
    startIncrementalMetadataExtraction,
    invalidateMetadataSource,
    invalidateMetadataTracks,
  };
}
