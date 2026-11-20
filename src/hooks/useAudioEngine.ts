import { useState, useEffect, useRef, useCallback } from 'react';
import { TrackItem, FileStatus } from '../types/music';
import { extractAudioMetadata } from '../utils/metadata';
import { evaluatePlaybackMediaError } from '../utils/audioFileTypes';
import { storePlaybackState } from '../services/idbStorage';

export interface UseAudioEngineProps {
  initialVolume?: number;
  initialMuted?: boolean;
  initialPosition?: number;
  currentTrack: TrackItem | null;
  onTrackStatusChanged?: (
    trackId: string,
    status: FileStatus,
    size?: number,
    metadata?: Partial<TrackItem['metadata']>
  ) => void;
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
  loadAudioSource: (track: TrackItem, autoPlay?: boolean) => Promise<void>;
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
  const loadRequestIdRef = useRef<number>(0);

  const currentTrackRef = useRef<TrackItem | null>(currentTrack);
  currentTrackRef.current = currentTrack;

  const onTrackStatusChangedRef = useRef(onTrackStatusChanged);
  onTrackStatusChangedRef.current = onTrackStatusChanged;

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

  // Audio source loader with race-condition safety
  const loadAudioSource = useCallback(async (track: TrackItem, autoPlay = true) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (autoPlay) {
      pendingSeekRef.current = null;
      setCurrentTime(0);
    }

    const requestId = ++loadRequestIdRef.current;
    setPlaybackError(null);

    // Revoke previous blob object URL to free memory safely
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
    }

    try {
      if (track.status === 'unreadable') {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        setIsPlaying(false);
        throw new Error(
          'Cannot access this audio file. Please check file permissions or reopen the music folder.'
        );
      }

      let file: File | Blob | null = null;
      if (track.handle) {
        try {
          file = await track.handle.getFile();
        } catch {
          if (loadRequestIdRef.current !== requestId) return;
          track.status = 'unreadable';
          if (onTrackStatusChangedRef.current) {
            onTrackStatusChangedRef.current(track.id, 'unreadable');
          }
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
          setIsPlaying(false);
          throw new Error(
            'Cannot access this audio file. Please check file permissions or reopen the music folder.'
          );
        }
      } else if (track.file) {
        file = track.file;
      }

      if (loadRequestIdRef.current !== requestId) return;

      if (!file) {
        track.status = 'unreadable';
        if (onTrackStatusChangedRef.current) {
          onTrackStatusChangedRef.current(track.id, 'unreadable');
        }
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        setIsPlaying(false);
        throw new Error(
          'Cannot access this audio file. Please check file permissions or reopen the music folder.'
        );
      }

      if (file.size === 0) {
        track.status = 'empty';
        track.size = 0;
        if (onTrackStatusChangedRef.current) {
          onTrackStatusChangedRef.current(track.id, 'empty', 0);
        }
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        setIsPlaying(false);
        throw new Error(
          'This audio file is empty (0 bytes). Please check or replace the original file.'
        );
      }

      // If the file was previously abnormal, or modified/replaced on disk, refresh status and metadata
      const isStatusAbnormal = track.status && track.status !== 'normal';
      const isFileModified =
        (track.lastModified && 'lastModified' in file && track.lastModified !== (file as File).lastModified) ||
        track.size !== file.size;

      if (isStatusAbnormal || isFileModified) {
        track.status = 'normal';
        track.size = file.size;
        if ('lastModified' in file) {
          track.lastModified = (file as File).lastModified;
        }

        let freshMetadata: Partial<TrackItem['metadata']> | undefined;
        try {
          const extracted = await extractAudioMetadata(file, track.name);
          if (extracted && loadRequestIdRef.current === requestId) {
            if (
              track.metadata.artworkUrl &&
              extracted.artworkUrl &&
              track.metadata.artworkUrl !== extracted.artworkUrl
            ) {
              URL.revokeObjectURL(track.metadata.artworkUrl);
            }

            freshMetadata = extracted;
            track.metadata = {
              ...track.metadata,
              ...extracted,
              isMetadataLoaded: true,
            };
            if (onTrackUpdatedRef.current) {
              onTrackUpdatedRef.current({ ...track });
            }
          }
        } catch {
          // Ignore metadata parse error on raw audio
        }

        if (loadRequestIdRef.current !== requestId) return;

        if (onTrackStatusChangedRef.current) {
          onTrackStatusChangedRef.current(track.id, 'normal', file.size, freshMetadata);
        }
      }

      if (loadRequestIdRef.current !== requestId) return;

      const objectUrl = URL.createObjectURL(file);
      activeUrlRef.current = objectUrl;
      audio.src = objectUrl;
      audio.load();

      if (autoPlay) {
        audio.play().catch((err: Error) => {
          if (err.name !== 'AbortError') {
            console.warn('[Luna Music] Autoplay blocked or interrupted:', err);
            setPlaybackError(`Playback failed: ${err.message}`);
            setIsPlaying(false);
          }
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load audio';
      console.error('[Luna Music] Load audio error:', err);
      setPlaybackError(msg);
      setIsPlaying(false);
    }
  }, []);

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
        if (pendingSeekRef.current !== null) {
          audio.currentTime = pendingSeekRef.current;
          setCurrentTime(pendingSeekRef.current);
          pendingSeekRef.current = null;
        }
        audio.play().catch((err: Error) => {
          if (err.name !== 'AbortError') {
            setPlaybackError(`Playback failed: ${err.message}`);
          }
        });
      } else {
        audio.pause();
      }
    },
    []
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

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);

    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      if (pendingSeekRef.current !== null) {
        audio.currentTime = pendingSeekRef.current;
        setCurrentTime(pendingSeekRef.current);
        pendingSeekRef.current = null;
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
