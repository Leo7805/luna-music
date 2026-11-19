import { useState, useEffect, useRef, useCallback } from 'react';
import { TrackItem, RepeatMode, FileStatus } from '../types/music';
import { storePlaybackState } from '../services/idbStorage';
import { useArtworkColors } from './useArtworkColors';
import { useTrackLyrics } from './useTrackLyrics';
import { usePlaybackQueue } from './usePlaybackQueue';
import { useAudioEngine } from './useAudioEngine';

export interface UseAudioPlayerProps {
  playlist?: TrackItem[];
  initialQueue?: TrackItem[];
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
 * Coordinates the audio engine, playback queue, lyrics, ambient colors,
 * and playback state persistence.
 */
export function useAudioPlayer({
  playlist,
  initialQueue,
  initialVolume = 0.8,
  initialMuted = false,
  initialRepeatMode = 'off',
  initialShuffle = false,
  initialTrackId = null,
  initialPosition = 0,
  onTrackStatusChanged,
}: UseAudioPlayerProps = {}) {
  const [currentTrack, setCurrentTrack] = useState<TrackItem | null>(null);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(initialRepeatMode);
  const [shuffle, setShuffle] = useState<boolean>(initialShuffle);

  const currentTrackRef = useRef<TrackItem | null>(null);
  currentTrackRef.current = currentTrack;

  const repeatModeRef = useRef<RepeatMode>(repeatMode);
  repeatModeRef.current = repeatMode;

  const shuffleRef = useRef<boolean>(shuffle);
  shuffleRef.current = shuffle;

  // Queue state and algorithms
  const queueControls = usePlaybackQueue({ initialQueue, playlist });
  const {
    queue,
    clearPlayNextOverride,
    setQueueImmediate,
    appendTrackIfMissing,
  } = queueControls;

  // Forward declarations for circular references in ended handler
  const nextTrackRef = useRef<() => void>(() => {});

  const handleEnded = useCallback(() => {
    if (repeatModeRef.current === 'one') {
      audioEngine.seekTo(0);
      const audio = audioEngine.audioRef.current;
      if (audio) {
        audio.play().catch(() => {});
      }
    } else {
      nextTrackRef.current();
    }
  }, []);

  // Audio element and engine controls
  const audioEngine = useAudioEngine({
    initialVolume,
    initialMuted,
    initialPosition,
    currentTrack,
    onTrackStatusChanged,
    onTrackUpdated: setCurrentTrack,
    onEnded: handleEnded,
  });

  const { loadAudioSource } = audioEngine;

  // Lyrics and ambient artwork colors
  const lyrics = useTrackLyrics(currentTrack);
  const ambientColors = useArtworkColors(currentTrack?.metadata.artworkUrl);

  // Restore initial track on first load without auto-initiating playback
  useEffect(() => {
    if (!currentTrack && queue.length > 0) {
      const match = initialTrackId ? queue.find((t) => t.id === initialTrackId) : null;
      if (match) {
        setCurrentTrack(match);
      }
    }
  }, [queue, initialTrackId, currentTrack]);

  // Play a specific track, optionally providing a new playback queue
  const playTrack = useCallback(
    (track: TrackItem, newQueue?: TrackItem[], autoPlay = true) => {
      clearPlayNextOverride();
      if (newQueue && newQueue.length > 0) {
        setQueueImmediate(newQueue);
      } else {
        appendTrackIfMissing(track);
      }
      setCurrentTrack(track);
      loadAudioSource(track, autoPlay);
    },
    [clearPlayNextOverride, setQueueImmediate, appendTrackIfMissing, loadAudioSource]
  );

  // Play an entire queue starting from startIndex or 0
  const playQueue = useCallback(
    (tracks: TrackItem[], startIndex = 0, autoPlay = true) => {
      clearPlayNextOverride();
      if (tracks.length === 0) return;
      setQueueImmediate(tracks);
      const target = tracks[startIndex] || tracks[0];
      setCurrentTrack(target);
      loadAudioSource(target, autoPlay);
    },
    [clearPlayNextOverride, setQueueImmediate, loadAudioSource]
  );

  // Advance to next track in queue
  const nextTrack = useCallback(() => {
    const targetTrack = queueControls.getNextTrack(
      currentTrackRef.current,
      shuffleRef.current,
      repeatModeRef.current
    );

    if (targetTrack) {
      playTrack(targetTrack, undefined, true);
    } else {
      audioEngine.setIsPlaying(false);
    }
  }, [queueControls, playTrack, audioEngine]);

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
      repeatModeRef.current
    );

    if (targetTrack) {
      playTrack(targetTrack, undefined, true);
    } else if (shouldRestartCurrent) {
      audioEngine.seekTo(0);
    }
  }, [audioEngine, queueControls, playTrack]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    audioEngine.togglePlay(() => {
      if (currentTrackRef.current) {
        playTrack(currentTrackRef.current, undefined, true);
      } else if (queueControls.queueRef.current.length > 0) {
        playTrack(queueControls.queueRef.current[0], undefined, true);
      }
    });
  }, [audioEngine, playTrack, queueControls.queueRef]);

  // Queue manipulation actions bound with fallback playback
  const playNext = useCallback(
    (track: TrackItem) => {
      return queueControls.playNext(track, currentTrackRef.current, (t, q) =>
        playTrack(t, q, true)
      );
    },
    [queueControls, playTrack]
  );

  const playNextBulk = useCallback(
    (tracks: TrackItem[]) => {
      return queueControls.playNextBulk(tracks, currentTrackRef.current, (t, q) =>
        playTrack(t, q, true)
      );
    },
    [queueControls, playTrack]
  );

  const addToQueue = useCallback(
    (trackOrTracks: TrackItem | TrackItem[]) => {
      return queueControls.addToQueue(trackOrTracks, currentTrackRef.current, (t, q) =>
        playTrack(t, q, true)
      );
    },
    [queueControls, playTrack]
  );

  const clearQueue = useCallback(() => {
    queueControls.clearQueue(currentTrackRef.current);
  }, [queueControls]);

  // Cycle repeat modes: off -> all -> one -> off
  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((prev) => {
      const next: RepeatMode = prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off';
      storePlaybackState({ repeatMode: next });
      return next;
    });
  }, []);

  // Toggle shuffle
  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => {
      const next = !prev;
      storePlaybackState({ shuffle: next });
      return next;
    });
  }, []);

  // Persist playback position throttled
  useEffect(() => {
    if (!currentTrack) return;
    const interval = setInterval(() => {
      const audio = audioEngine.audioRef.current;
      if (audio && audioEngine.isPlaying) {
        storePlaybackState({
          lastTrackId: currentTrack.id,
          lastPosition: audio.currentTime,
        });
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [currentTrack, audioEngine.isPlaying, audioEngine.audioRef]);

  return {
    currentTrack,
    isPlaying: audioEngine.isPlaying,
    currentTime: audioEngine.currentTime,
    duration: audioEngine.duration,
    volume: audioEngine.volume,
    isMuted: audioEngine.isMuted,
    repeatMode,
    shuffle,
    playbackError: audioEngine.playbackError,
    clearPlaybackError: audioEngine.clearPlaybackError,
    lyrics,
    ambientColors,
    queue,
    playTrack,
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
    changeVolume: audioEngine.changeVolume,
    adjustVolume: audioEngine.adjustVolume,
    toggleMute: audioEngine.toggleMute,
    cycleRepeatMode,
    toggleShuffle,
  };
}
