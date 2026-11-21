import { RepeatMode, TrackItem } from '../types/music';
import { isSameTrack } from './trackIdentity';
import { isTrackPlayable } from './audioFileTypes';

export interface SourceRemovalEvent {
  seq: number;
  remainingTracks: TrackItem[];
  removedIds: string[];
  idMigrations: Map<string, string>;
}

export interface SourceRemovalQueueTransition {
  nextQueue: TrackItem[];
  nextTrack: TrackItem | null;
  currentTrackRemoved: boolean;
  currentTrackMigrated: boolean;
  shouldStop: boolean;
  queueChanged: boolean;
}

function buildSurvivingMap(remainingTracks: TrackItem[]): Map<string, TrackItem> {
  const map = new Map<string, TrackItem>();
  for (const track of remainingTracks) {
    map.set(track.id, track);
    if (track.aliases) {
      for (const alias of track.aliases) {
        if (!map.has(alias)) {
          map.set(alias, track);
        }
      }
    }
  }
  return map;
}

function resolveSurvivingTrack(
  track: TrackItem,
  survivingMap: Map<string, TrackItem>,
  idMigrations?: Map<string, string>
): TrackItem | null {
  if (idMigrations) {
    const migratedId = idMigrations.get(track.id);
    if (migratedId) {
      const migrated = survivingMap.get(migratedId);
      if (migrated) return migrated;
    }
  }

  const direct = survivingMap.get(track.id);
  if (direct) return direct;

  if (track.aliases) {
    for (const alias of track.aliases) {
      const migratedAlias = idMigrations?.get(alias);
      if (migratedAlias) {
        const migrated = survivingMap.get(migratedAlias);
        if (migrated) return migrated;
      }
      const aliased = survivingMap.get(alias);
      if (aliased) return aliased;
    }
  }

  return null;
}

/**
 * Reconciles the playback Queue and current track in a single logical transition
 * after an explicit source removal (folder removal or imported files removal).
 * - Removes orphaned entries with no surviving verified source.
 * - Preserves relative order and tracks surviving via verified overlapping sources.
 * - Applies canonical ID migrations seamlessly without interrupting surviving playback.
 * - Selects the next playable surviving successor if currentTrack was removed,
 *   or signals shouldStop when no playable surviving track remains.
 */
export function reconcileQueueAfterSourceRemoval(
  queue: TrackItem[],
  currentTrack: TrackItem | null,
  remainingTracks: TrackItem[],
  idMigrations: Map<string, string>,
  repeatMode: RepeatMode
): SourceRemovalQueueTransition {
  const survivingMap = buildSurvivingMap(remainingTracks);
  const nextQueue: TrackItem[] = [];
  const seenCanonicalIds = new Set<string>();

  const oldCurrentIndex = currentTrack
    ? queue.findIndex((t) => isSameTrack(t, currentTrack))
    : -1;

  // Map each surviving entry to its original index so we can find the natural successor
  const survivingWithOldIdx: Array<{ track: TrackItem; oldIndex: number }> = [];

  for (let i = 0; i < queue.length; i++) {
    const qTrack = queue[i];
    const surviving = resolveSurvivingTrack(qTrack, survivingMap, idMigrations);
    if (!surviving) continue;
    if (seenCanonicalIds.has(surviving.id)) continue;
    seenCanonicalIds.add(surviving.id);
    nextQueue.push(surviving);
    survivingWithOldIdx.push({ track: surviving, oldIndex: i });
  }

  const queueChanged =
    nextQueue.length !== queue.length ||
    nextQueue.some((t, idx) => t.id !== queue[idx]?.id);

  if (!currentTrack) {
    return {
      nextQueue,
      nextTrack: null,
      currentTrackRemoved: false,
      currentTrackMigrated: false,
      shouldStop: nextQueue.length === 0,
      queueChanged,
    };
  }

  const survivingCurrent = resolveSurvivingTrack(currentTrack, survivingMap, idMigrations);
  if (survivingCurrent) {
    const currentTrackMigrated =
      survivingCurrent.id !== currentTrack.id ||
      survivingCurrent.handle !== currentTrack.handle ||
      survivingCurrent.file !== currentTrack.file;
    return {
      nextQueue,
      nextTrack: survivingCurrent,
      currentTrackRemoved: false,
      currentTrackMigrated,
      shouldStop: false,
      queueChanged,
    };
  }

  // Current track lost its last registered source -> pick next playable surviving successor
  if (nextQueue.length === 0) {
    return {
      nextQueue: [],
      nextTrack: null,
      currentTrackRemoved: true,
      currentTrackMigrated: false,
      shouldStop: true,
      queueChanged: queue.length > 0,
    };
  }

  // Prefer the first playable surviving track that appeared after oldCurrentIndex
  let successor: TrackItem | null = null;
  if (oldCurrentIndex >= 0) {
    const after = survivingWithOldIdx.find(
      (entry) => entry.oldIndex > oldCurrentIndex && isTrackPlayable(entry.track)
    );
    if (after) successor = after.track;
  }

  // If none appeared after, wrap to the first playable surviving track when Repeat All
  if (!successor && (repeatMode === 'all' || oldCurrentIndex < 0)) {
    successor = nextQueue.find(isTrackPlayable) || null;
  }

  return {
    nextQueue,
    nextTrack: successor,
    currentTrackRemoved: true,
    currentTrackMigrated: false,
    shouldStop: !successor,
    queueChanged: true,
  };
}

/**
 * Determines whether a pre-existing persisted Queue should be cleaned up after
 * library initialization completes with zero registered sources.
 * Never returns true while initialization is pending or while any source is registered
 * (including sources temporarily awaiting file-access permission).
 */
export function shouldClearOrphanedQueueOnInit(params: {
  isLibraryInitialized: boolean;
  hasRegisteredSources: boolean;
  needsPermission: boolean;
  liveQueueLength: number;
  hasCurrentTrack: boolean;
  storedQueueIdsCount: number;
  hasStoredLastTrackId: boolean;
}): boolean {
  if (!params.isLibraryInitialized) return false;
  if (params.hasRegisteredSources || params.needsPermission) return false;
  return (
    params.liveQueueLength > 0 ||
    params.hasCurrentTrack ||
    params.storedQueueIdsCount > 0 ||
    params.hasStoredLastTrackId
  );
}
