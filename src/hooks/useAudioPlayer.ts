import { useState, useEffect, useRef, useCallback } from 'react';
import { TrackItem, RepeatMode, FileStatus } from '../types/music';
import { isSameTrack } from '../utils/musicTree';
import { isTrackPlayable } from '../utils/audioFileTypes';
import { resolveInitialQueue, resolveInitialTrack } from '../utils/playbackSession';
import {
  storePlaybackState,
  getStoredPlaybackStateSync,
} from '../services/idbStorage';
import { useArtworkColors } from './useArtworkColors';
import { useTrackLyrics } from './useTrackLyrics';
import { usePlaybackQueue } from './usePlaybackQueue';
import { useAudioEngine } from './useAudioEngine';
import { usePlaybackPreferences } from './usePlaybackPreferences';

export interface UseAudioPlayerProps {
  playlist?: TrackItem[];
  initialQueue?: TrackItem[];
  libraryTracks?: TrackItem[];
  initialVolume?: number;
  initialMuted?: boolean;
  initialRepeatMode?: RepeatMode;
  initialShuffle?: boolean;
  initialTrackId?: string | null;
  initialPosition?: number;
  onTrackStatusChanged?: (
    trackId: string,
    status: FileStatus,
    size?: number,
    metadata?: Partial<TrackItem['metadata']>
  ) => void;
}

/**
 * Luna Music Audio Player Hook
 * Coordinates the audio engine, playback queue, preferences, lyrics,
 * ambient colors, and playback state persistence.
 */
export function useAudioPlayer({
  playlist,
  initialQueue,
  libraryTracks,
  initialVolume,
  initialMuted,
  initialRepeatMode,
  initialShuffle,
  initialTrackId = null,
  initialPosition = 0,
  onTrackStatusChanged,
}: UseAudioPlayerProps = {}) {
  // Synchronous restoration from localStorage cache for instant hydration
  const syncState = getStoredPlaybackStateSync();
  const effectiveInitialVolume =
    initialVolume !== undefined ? initialVolume : (syncState.volume ?? 0.8);
  const effectiveInitialMuted =
    initialMuted !== undefined ? initialMuted : (syncState.isMuted ?? false);
  const effectiveInitialRepeat =
    initialRepeatMode !== undefined ? initialRepeatMode : (syncState.repeatMode ?? 'off');
  const effectiveInitialShuffle =
    initialShuffle !== undefined ? initialShuffle : (syncState.shuffle ?? false);
  const effectiveInitialTrackId =
    initialTrackId !== null ? initialTrackId : (syncState.lastTrackId ?? null);
  const effectiveInitialPosition =
    initialPosition !== 0 ? initialPosition : (syncState.lastPosition ?? 0);

  // Synchronously resolve initial queue and track from props or stored state
  const resolvedInitialQueue = resolveInitialQueue({
    initialQueue,
    playlist,
    storedQueueIds: syncState.queueTrackIds,
    effectiveInitialTrackId,
    libraryTracks,
  });

  const resolvedInitialTrack = resolveInitialTrack({
    effectiveInitialTrackId,
    libraryTracks,
    queue: resolvedInitialQueue,
  });

  const [currentTrack, setCurrentTrack] = useState<TrackItem | null>(() => resolvedInitialTrack);
  const lastPlayRequestRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });
  const currentTrackRef = useRef<TrackItem | null>(currentTrack);
  currentTrackRef.current = currentTrack;

  // Queue state and algorithms
  const queueControls = usePlaybackQueue({ initialQueue: resolvedInitialQueue, playlist });
  const { queue, clearPlayNextOverride, setQueueImmediate } = queueControls;

  // Forward declarations for circular references in ended handler
  const nextTrackRef = useRef<() => void>(() => {});

  // Audio element and engine controls
  const audioEngine = useAudioEngine({
    initialVolume: effectiveInitialVolume,
    initialMuted: effectiveInitialMuted,
    initialPosition: effectiveInitialPosition,
    currentTrack,
    onTrackStatusChanged,
    onTrackUpdated: setCurrentTrack,
    onEnded: () => {
      if (prefs.repeatModeRef.current === 'one') {
        audioEngine.seekTo(0);
        audioEngine.audioRef.current?.play().catch(() => {});
      } else {
        nextTrackRef.current();
      }
    },
  });

  const { loadAudioSource } = audioEngine;

  // Playback preferences hook (volume, mute, repeat, shuffle)
  const prefs = usePlaybackPreferences({
    initialRepeatMode: effectiveInitialRepeat,
    initialShuffle: effectiveInitialShuffle,
    audioEngine,
  });

  // Lyrics and ambient artwork colors
  const lyrics = useTrackLyrics(currentTrack);
  const ambientColors = useArtworkColors(currentTrack?.metadata.artworkUrl);

  // Restore initial track and queue on first load without auto-initiating playback
  const hasHydratedSessionRef = useRef<boolean>(false);

  useEffect(() => {
    if (hasHydratedSessionRef.current) return;
    const availableTracks = libraryTracks && libraryTracks.length > 0 ? libraryTracks : queue;
    if (availableTracks.length === 0) return;

    const restoredQueue = resolveInitialQueue({
      storedQueueIds: syncState.queueTrackIds,
      effectiveInitialTrackId,
      libraryTracks: availableTracks,
    });

    if (restoredQueue.length > 0) {
      hasHydratedSessionRef.current = true;
      setQueueImmediate(restoredQueue);

      const targetTrack =
        resolveInitialTrack({
          effectiveInitialTrackId,
          libraryTracks: availableTracks,
          queue: restoredQueue,
        }) || restoredQueue[0];

      if (targetTrack) {
        setCurrentTrack(targetTrack);
        loadAudioSource(targetTrack, false);
      }
    }
  }, [libraryTracks, queue, effectiveInitialTrackId, setQueueImmediate, loadAudioSource, syncState.queueTrackIds]);

  // Navigate to track without reordering or mutating the queue
  const navigateToTrack = useCallback(
    (track: TrackItem, autoPlay = true) => {
      clearPlayNextOverride();
      setCurrentTrack(track);
      loadAudioSource(track, autoPlay);
    },
    [clearPlayNextOverride, loadAudioSource]
  );

  // Direct click on a Queue row: jump to its existing position without reordering
  const playQueueTrack = useCallback(
    (track: TrackItem) => {
      const now = Date.now();
      if (
        lastPlayRequestRef.current.id === `queue-row:${track.id}` &&
        now - lastPlayRequestRef.current.time < 350
      ) {
        return;
      }
      lastPlayRequestRef.current = { id: `queue-row:${track.id}`, time: now };

      if (!isTrackPlayable(track)) {
        audioEngine.setPlaybackError(`Cannot play unplayable track: ${track.name}`);
        return;
      }

      if (currentTrackRef.current && isSameTrack(currentTrackRef.current, track)) {
        if (!audioEngine.isPlaying) {
          audioEngine.togglePlay(() => navigateToTrack(track, true));
        }
        return;
      }

      navigateToTrack(track, true);
    },
    [audioEngine, navigateToTrack]
  );

  // Play a specific track (Play Now) across all library views
  const playTrack = useCallback(
    (track: TrackItem, newQueue?: TrackItem[], autoPlay = true) => {
      // Rapid duplicate play protection (e.g. from rapid double-clicks)
      const now = Date.now();
      if (
        !newQueue &&
        lastPlayRequestRef.current.id === track.id &&
        now - lastPlayRequestRef.current.time < 350
      ) {
        return;
      }
      lastPlayRequestRef.current = { id: track.id, time: now };

      if (!isTrackPlayable(track)) {
        audioEngine.setPlaybackError(`Cannot play unplayable track: ${track.name}`);
        return;
      }

      clearPlayNextOverride();

      if (newQueue && newQueue.length > 0) {
        setQueueImmediate(newQueue);
        setCurrentTrack(track);
        loadAudioSource(track, autoPlay);
        return;
      }

      // Play Now contract: insert/move to current position without destroying queue
      const result = queueControls.playNow(track, currentTrackRef.current, audioEngine.isPlaying);
      if (result.action === 'noop') {
        return;
      }
      if (result.action === 'resume') {
        audioEngine.togglePlay(() => {});
        return;
      }

      // action === 'play'
      setCurrentTrack(result.nextTrack);
      loadAudioSource(result.nextTrack, autoPlay);
    },
    [clearPlayNextOverride, queueControls, audioEngine, loadAudioSource, setQueueImmediate]
  );

  // Play an entire queue starting from startIndex or 0 (Play All)
  const playQueue = useCallback(
    (
      tracks: TrackItem[],
      startIndex = 0,
      optionsOrShuffle: boolean | { shuffle?: boolean; autoPlay?: boolean } = false
    ) => {
      // Rapid repeated clicks duplicate protection
      const now = Date.now();
      const firstTarget = tracks[startIndex] || tracks[0];
      if (
        firstTarget &&
        lastPlayRequestRef.current.id === `queue:${firstTarget.id}` &&
        now - lastPlayRequestRef.current.time < 350
      ) {
        return;
      }
      if (firstTarget) {
        lastPlayRequestRef.current = { id: `queue:${firstTarget.id}`, time: now };
      }

      clearPlayNextOverride();
      if (tracks.length === 0) return;

      const shuffle =
        typeof optionsOrShuffle === 'boolean'
          ? optionsOrShuffle
          : Boolean(optionsOrShuffle?.shuffle);
      const autoPlay =
        typeof optionsOrShuffle === 'object' && typeof optionsOrShuffle.autoPlay === 'boolean'
          ? optionsOrShuffle.autoPlay
          : true;

      // Filter playable tracks
      const playable = tracks.filter(isTrackPlayable);
      if (playable.length === 0) return;

      // Deduplicate using canonical Track Identity
      const uniqueTracks: TrackItem[] = [];
      for (const track of playable) {
        if (!uniqueTracks.some((existing) => isSameTrack(existing, track))) {
          uniqueTracks.push(track);
        }
      }
      if (uniqueTracks.length === 0) return;

      let queueTracks = [...uniqueTracks];
      let targetIndex = Math.min(Math.max(0, startIndex), queueTracks.length - 1);

      if (shuffle) {
        const startTrack = queueTracks[targetIndex] || queueTracks[0];
        const remaining = queueTracks.filter((_, idx) => idx !== targetIndex);
        for (let i = remaining.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
        }
        queueTracks = [startTrack, ...remaining];
        targetIndex = 0;
      }

      setQueueImmediate(queueTracks);
      const target = queueTracks[targetIndex] || queueTracks[0];
      setCurrentTrack(target);
      loadAudioSource(target, autoPlay);
    },
    [clearPlayNextOverride, setQueueImmediate, loadAudioSource]
  );

  // Advance to next track in queue
  const nextTrack = useCallback(() => {
    const targetTrack = queueControls.getNextTrack(
      currentTrackRef.current,
      prefs.shuffleRef.current,
      prefs.repeatModeRef.current
    );

    if (targetTrack) {
      navigateToTrack(targetTrack);
    } else {
      audioEngine.setIsPlaying(false);
    }
  }, [queueControls, navigateToTrack, audioEngine, prefs.shuffleRef, prefs.repeatModeRef]);

  nextTrackRef.current = nextTrack;

  // Return to previous track in queue
  const prevTrack = useCallback(() => {
    const audio = audioEngine.audioRef.current;
    if (audio && audio.currentTime > 3) {
      audioEngine.seekTo(0);
      return;
    }

    const { targetTrack, shouldRestartCurrent } = queueControls.getPrevTrack(
      currentTrackRef.current,
      prefs.repeatModeRef.current
    );

    if (targetTrack) {
      navigateToTrack(targetTrack);
    } else if (shouldRestartCurrent) {
      audioEngine.seekTo(0);
    }
  }, [audioEngine, queueControls, navigateToTrack, prefs.repeatModeRef]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    audioEngine.togglePlay(() => {
      if (currentTrackRef.current) {
        navigateToTrack(currentTrackRef.current);
      } else if (queueControls.queueRef.current.length > 0) {
        navigateToTrack(queueControls.queueRef.current[0]);
      }
    });
  }, [audioEngine, navigateToTrack, queueControls.queueRef]);

  // Queue manipulation actions bound with fallback playback
  const playNext = useCallback(
    (track: TrackItem) => queueControls.playNext(track, currentTrackRef.current, (t, q) => playTrack(t, q, true)),
    [queueControls, playTrack]
  );

  const playNextBulk = useCallback(
    (tracks: TrackItem[]) => queueControls.playNextBulk(tracks, currentTrackRef.current, (t, q) => playTrack(t, q, true)),
    [queueControls, playTrack]
  );

  const addToQueue = useCallback(
    (trackOrTracks: TrackItem | TrackItem[]) => queueControls.addToQueue(trackOrTracks, currentTrackRef.current, (t, q) => playTrack(t, q, true)),
    [queueControls, playTrack]
  );

  const clearQueue = useCallback(() => {
    queueControls.clearQueue(currentTrackRef.current);
  }, [queueControls]);

  // Persist queue updates
  useEffect(() => {
    if (queue.length > 0) {
      const qIds = queue.map((t) => t.id);
      const currIdx = currentTrack ? queue.findIndex((t) => isSameTrack(t, currentTrack)) : -1;
      storePlaybackState({
        queueTrackIds: qIds,
        queueIndex: currIdx >= 0 ? currIdx : 0,
      });
    }
  }, [queue, currentTrack]);

  // Persist playback position throttled and on beforeunload / pause
  useEffect(() => {
    if (!currentTrack) return;
    const saveCurrent = () => {
      const audio = audioEngine.audioRef.current;
      if (audio) {
        storePlaybackState({
          lastTrackId: currentTrack.id,
          lastPosition: audio.currentTime,
        });
      }
    };

    const interval = setInterval(() => {
      if (audioEngine.isPlaying) {
        saveCurrent();
      }
    }, 1000);

    const handleBeforeUnload = () => {
      saveCurrent();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentTrack, audioEngine.isPlaying, audioEngine.audioRef]);

  return {
    currentTrack,
    isPlaying: audioEngine.isPlaying,
    currentTime: audioEngine.currentTime,
    duration: audioEngine.duration,
    volume: audioEngine.volume,
    isMuted: audioEngine.isMuted,
    repeatMode: prefs.repeatMode,
    shuffle: prefs.shuffle,
    playbackError: audioEngine.playbackError,
    clearPlaybackError: audioEngine.clearPlaybackError,
    lyrics,
    ambientColors,
    queue,
    playTrack,
    playQueueTrack,
    playQueue,
    playNext,
    playNextBulk,
    addToQueue,
    removeFromQueue: queueControls.removeFromQueue,
    clearQueue,
    reorderQueue: queueControls.reorderQueue,
    togglePlay,
    nextTrack,
    prevTrack,
    seekTo: audioEngine.seekTo,
    seekRelative: audioEngine.seekRelative,
    changeVolume: prefs.changeVolume,
    adjustVolume: prefs.adjustVolume,
    toggleMute: prefs.toggleMute,
    cycleRepeatMode: prefs.cycleRepeatMode,
    toggleShuffle: prefs.toggleShuffle,
  };
}
