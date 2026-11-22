import { useState, useEffect, useRef, useCallback } from 'react';
import { TrackItem, FileStatus } from '../types/music';
import { evaluatePlaybackMediaError } from '../utils/audioFileTypes';
import { clampSeekPosition, classifyPlayRejection } from '../utils/playbackSession';
import { resolvePlayableAudioFile } from '../utils/audioSourceLoader';
import { storePlaybackState } from '../services/idbStorage';

export interface LoadAudioSourceOptions {
  preservePendingSeek?: boolean;
  initialSeekPosition?: number;
  isAutoResume?: boolean;
}

export interface UseAudioEngineProps {
  initialVolume?: number;
  initialMuted?: boolean;
  initialPosition?: number;
  currentTrack: TrackItem | null;
  onTrackStatusChanged?: (trackId: string, status: FileStatus, size?: number, metadata?: Partial<TrackItem['metadata']>) => void;
  onTrackMetadataUpdated?: (trackId: string, metadata: Partial<TrackItem['metadata']>) => void;
  onTrackUpdated?: (track: TrackItem) => void;
  onEnded: () => void;
}

export interface UseAudioEngineReturn {
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  activeUrlRef: React.MutableRefObject<string | null>;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackError: string | null;
  setPlaybackError: (err: string | null) => void;
  loadAudioSource: (track: TrackItem, autoPlay?: boolean, options?: LoadAudioSourceOptions) => Promise<void>;
  stopPlayback: () => void;
  togglePlay: (onPlayFallback: () => void) => void;
  seekTo: (timeInSeconds: number) => void;
  seekRelative: (deltaSeconds: number) => void;
  changeVolume: (newVol: number) => void;
  adjustVolume: (delta: number) => void;
  toggleMute: () => void;
  applyHydratedSettings: (settings: { volume?: number; isMuted?: boolean }) => void;
  clearPlaybackError: () => void;
}

/**
 * Hook to manage the HTMLAudioElement lifecycle, audio source loading,
 * event listeners, playback errors, volume, and seeking.
 */
export function useAudioEngine({
  initialVolume = 0.8,
  initialMuted = false,
  initialPosition = 0,
  currentTrack,
  onTrackStatusChanged,
  onTrackMetadataUpdated,
  onTrackUpdated,
  onEnded,
}: UseAudioEngineProps): UseAudioEngineReturn {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(initialPosition > 0 ? initialPosition : 0);
  const [duration, setDuration] = useState<number>(currentTrack?.metadata.duration || 0);
  const [volume, setVolume] = useState<number>(initialVolume);
  const [isMuted, setIsMuted] = useState<boolean>(initialMuted);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeUrlRef = useRef<string | null>(null);
  const pendingSeekRef = useRef<number | null>(initialPosition > 0 ? initialPosition : null);
  const pendingAutoPlayRef = useRef<{ requestId: number; isAutoResume: boolean } | null>(null);
  const loadRequestIdRef = useRef<number>(0);
  const loadedAudioTrackIdRef = useRef<string | null>(null);

  const currentTrackRef = useRef<TrackItem | null>(currentTrack);
  currentTrackRef.current = currentTrack;

  const onTrackStatusChangedRef = useRef(onTrackStatusChanged);
  onTrackStatusChangedRef.current = onTrackStatusChanged;

  const onTrackMetadataUpdatedRef = useRef(onTrackMetadataUpdated);
  onTrackMetadataUpdatedRef.current = onTrackMetadataUpdated;

  const onTrackUpdatedRef = useRef(onTrackUpdated);
  onTrackUpdatedRef.current = onTrackUpdated;

  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  // Initialize native HTMLAudioElement without assigning invalid empty src
  if (!audioRef.current && typeof Audio !== 'undefined') {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = initialMuted ? 0 : initialVolume;
    audioRef.current = audio;
  }

  const attemptAudioPlay = useCallback((audio: HTMLAudioElement, requestId: number, isAutoResume: boolean) => {
    audio.play().catch((err: unknown) => {
      if (loadRequestIdRef.current !== requestId) return;
      const result = classifyPlayRejection(err, isAutoResume);
      if (result.ignore) return;
      setIsPlaying(false);
      if (result.isAutoplayBlocked && !result.message) {
        setPlaybackError(null);
        return;
      }
      console.warn('[Luna Music] Playback play() rejected:', err);
      if (result.message) setPlaybackError(result.message);
    });
  }, []);

  // Audio source loader with race-condition safety
  const loadAudioSource = useCallback(async (track: TrackItem, autoPlay = true, options?: LoadAudioSourceOptions) => {
    const audio = audioRef.current;
    if (!audio) return;

    pendingAutoPlayRef.current = null;
    if (options?.preservePendingSeek) {
      if (typeof options.initialSeekPosition === 'number' && options.initialSeekPosition > 0) {
        pendingSeekRef.current = options.initialSeekPosition;
        setCurrentTime(options.initialSeekPosition);
      }
    } else if (autoPlay) {
      pendingSeekRef.current = null;
      setCurrentTime(0);
    }

    const requestId = ++loadRequestIdRef.current;
    loadedAudioTrackIdRef.current = null;
    setPlaybackError(null);

    // Revoke previous blob object URL to free memory safely
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
    }

    try {
      const resolved = await resolvePlayableAudioFile(
        track,
        () => loadRequestIdRef.current === requestId,
        {
          onTrackStatusChanged: onTrackStatusChangedRef.current,
          onTrackUpdated: onTrackUpdatedRef.current,
        }
      );

      if (resolved.aborted || loadRequestIdRef.current !== requestId) return;

      if (!resolved.file) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        setIsPlaying(false);
        throw new Error(
          resolved.errorMessage ||
            'Cannot access this audio file. Please check file permissions or reopen the music folder.'
        );
      }

      const objectUrl = URL.createObjectURL(resolved.file);
      activeUrlRef.current = objectUrl;
      loadedAudioTrackIdRef.current = track.id;
      audio.src = objectUrl;
      audio.load();

      if (autoPlay) {
        const isAutoResume = Boolean(options?.isAutoResume);
        if (pendingSeekRef.current !== null) {
          if (audio.readyState >= 1) {
            const targetPos = clampSeekPosition(pendingSeekRef.current, audio.duration);
            audio.currentTime = targetPos;
            setCurrentTime(targetPos);
            pendingSeekRef.current = null;
            attemptAudioPlay(audio, requestId, isAutoResume);
          } else {
            pendingAutoPlayRef.current = { requestId, isAutoResume };
          }
        } else {
          attemptAudioPlay(audio, requestId, isAutoResume);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load audio';
      console.error('[Luna Music] Load audio error:', err);
      setPlaybackError(msg);
      setIsPlaying(false);
    }
  }, [attemptAudioPlay]);

  // Toggle play/pause
  const togglePlay = useCallback(
    (onPlayFallback: () => void) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (!currentTrackRef.current) {
        onPlayFallback();
        return;
      }

      // If track is selected but audio source hasn't loaded yet
      if (!activeUrlRef.current && currentTrackRef.current) {
        onPlayFallback();
        return;
      }

      if (audio.paused) {
        pendingAutoPlayRef.current = null;
        if (pendingSeekRef.current !== null) {
          const targetPos = clampSeekPosition(pendingSeekRef.current, audio.duration);
          audio.currentTime = targetPos;
          setCurrentTime(targetPos);
          pendingSeekRef.current = null;
        }
        attemptAudioPlay(audio, loadRequestIdRef.current, false);
      } else {
        audio.pause();
      }
    },
    [attemptAudioPlay]
  );

  // Seek absolute time
  const seekTo = useCallback((timeInSeconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0, Math.min(timeInSeconds, audio.duration || 0));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  }, []);

  // Seek relative delta seconds
  const seekRelative = useCallback(
    (deltaSeconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      seekTo((audio.currentTime || 0) + deltaSeconds);
    },
    [seekTo]
  );

  // Set volume
  const changeVolume = useCallback((newVol: number) => {
    const clamped = Math.max(0, Math.min(1, newVol));
    setVolume(clamped);
    setIsMuted(clamped === 0);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
    storePlaybackState({ volume: clamped, isMuted: clamped === 0 });
  }, []);

  // Adjust volume relative
  const adjustVolume = useCallback(
    (delta: number) => {
      changeVolume(volume + delta);
    },
    [volume, changeVolume]
  );

  // Toggle mute
  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.volume = nextMuted ? 0 : volume;
    }
    storePlaybackState({ isMuted: nextMuted });
  }, [isMuted, volume]);

  // Apply hydrated settings from storage without re-persisting
  const applyHydratedSettings = useCallback(
    (settings: { volume?: number; isMuted?: boolean }) => {
      let effVol = volume;
      if (typeof settings.volume === 'number') {
        effVol = Math.max(0, Math.min(1, settings.volume));
        setVolume(effVol);
      }
      let effMuted = isMuted;
      if (typeof settings.isMuted === 'boolean') {
        effMuted = settings.isMuted;
        setIsMuted(effMuted);
      }
      if (audioRef.current) {
        audioRef.current.volume = effMuted ? 0 : effVol;
      }
    },
    [isMuted, volume]
  );

  const clearPlaybackError = useCallback(() => {
    setPlaybackError(null);
  }, []);

  // Attach audio element event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => {
      setIsPlaying(true);
      setPlaybackError(null);
    };
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const syncMeasuredDuration = (measured: number) => {
      if (!Number.isFinite(measured) || measured <= 0) return;
      setDuration(measured);
      const activeTrack = currentTrackRef.current;
      if (!activeTrack || loadedAudioTrackIdRef.current !== activeTrack.id) return;
      const existing = activeTrack.metadata.duration;
      if (typeof existing === 'number' && Number.isFinite(existing) && existing > 0 && Math.abs(existing - measured) < 0.5) return;
      onTrackMetadataUpdatedRef.current?.(activeTrack.id, { duration: measured });
    };
    const onDurationChange = () => syncMeasuredDuration(audio.duration);
    const onLoadedMetadata = () => {
      syncMeasuredDuration(audio.duration);
      if (pendingSeekRef.current !== null) {
        const targetPos = clampSeekPosition(pendingSeekRef.current, audio.duration);
        audio.currentTime = targetPos;
        setCurrentTime(targetPos);
        pendingSeekRef.current = null;
      }
      if (pendingAutoPlayRef.current && pendingAutoPlayRef.current.requestId === loadRequestIdRef.current) {
        const { requestId, isAutoResume } = pendingAutoPlayRef.current;
        pendingAutoPlayRef.current = null;
        attemptAudioPlay(audio, requestId, isAutoResume);
      }
    };

    const handleEnded = () => {
      if (onEndedRef.current) {
        onEndedRef.current();
      }
    };

    const onError = () => {
      const err = audio.error;

      // Ignore errors when no track is actively assigned, no src attribute is set, or during cleanup
      if (!activeUrlRef.current || !currentTrackRef.current || !audio.hasAttribute('src')) {
        return;
      }

      const trackName = currentTrackRef.current?.name || '';
      const errorInfo = evaluatePlaybackMediaError(err, trackName);
      if (!errorInfo) return;

      if (errorInfo.isUnsupported && currentTrackRef.current) {
        currentTrackRef.current.status = 'unsupported';
        if (onTrackStatusChangedRef.current) {
          onTrackStatusChangedRef.current(currentTrackRef.current.id, 'unsupported');
        }
      }

      console.error('[Luna Music] Audio playback error:', {
        code: err?.code,
        message: err?.message,
        track: trackName,
      });

      setPlaybackError(errorInfo.message);
      setIsPlaying(false);
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('playing', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('playing', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  // Cleanly stop playback and reset audio element without leaving stale source/state
  const stopPlayback = useCallback(() => {
    loadRequestIdRef.current++;
    loadedAudioTrackIdRef.current = null;
    pendingSeekRef.current = null;
    pendingAutoPlayRef.current = null;
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
    }
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setPlaybackError(null);
  }, []);

  // Clean up on component unmount safely without setting audio.src = ''
  useEffect(() => {
    return () => {
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
    };
  }, []);

  return {
    audioRef,
    activeUrlRef,
    isPlaying,
    setIsPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackError,
    setPlaybackError,
    loadAudioSource,
    stopPlayback,
    togglePlay,
    seekTo,
    seekRelative,
    changeVolume,
    adjustVolume,
    toggleMute,
    applyHydratedSettings,
    clearPlaybackError,
  };
}
