import { useState, useEffect, useRef, useCallback } from 'react';
import { TrackItem, RepeatMode, LrcLine, FileStatus } from '../types/music';
import { parseLrc } from '../utils/lrcParser';
import { extractDominantColor } from '../utils/colorExtractor';
import { extractAudioMetadata } from '../utils/metadata';
import { isFormatSupportedByBrowser } from '../utils/musicTree';
import { storePlaybackState } from '../services/idbStorage';

interface UseAudioPlayerProps {
  playlist: TrackItem[];
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

export function useAudioPlayer({
  playlist,
  initialVolume = 0.8,
  initialMuted = false,
  initialRepeatMode = 'off',
  initialShuffle = false,
  initialTrackId = null,
  initialPosition = 0,
  onTrackStatusChanged,
}: UseAudioPlayerProps) {
  const [currentTrack, setCurrentTrack] = useState<TrackItem | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(initialVolume);
  const [isMuted, setIsMuted] = useState<boolean>(initialMuted);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(initialRepeatMode);
  const [shuffle, setShuffle] = useState<boolean>(initialShuffle);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<LrcLine[]>([]);
  const [ambientColors, setAmbientColors] = useState<{ primary: string; glow: string }>({
    primary: 'rgba(56, 189, 248, 0.15)',
    glow: 'rgba(99, 102, 241, 0.12)',
  });
  const [queue, setQueue] = useState<TrackItem[]>(() => playlist || []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeUrlRef = useRef<string | null>(null);
  const currentTrackRef = useRef<TrackItem | null>(null);
  currentTrackRef.current = currentTrack;
  const pendingSeekRef = useRef<number | null>(initialPosition > 0 ? initialPosition : null);
  const queueRef = useRef<TrackItem[]>(queue);
  queueRef.current = queue;
  const onTrackStatusChangedRef = useRef(onTrackStatusChanged);
  onTrackStatusChangedRef.current = onTrackStatusChanged;
  const loadRequestIdRef = useRef<number>(0);

  // Initialize native HTMLAudioElement without assigning invalid empty src
  if (!audioRef.current && typeof Audio !== 'undefined') {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = initialMuted ? 0 : initialVolume;
    audioRef.current = audio;
  }

  // Populate queue on first load if queue is empty and playlist is supplied
  useEffect(() => {
    if (queue.length === 0 && playlist.length > 0) {
      setQueue(playlist);
      queueRef.current = playlist;
    }
  }, [playlist, queue.length]);

  // Restore initial track on first load without auto-initiating playback
  useEffect(() => {
    if (!currentTrack && queue.length > 0) {
      const match = initialTrackId ? queue.find((t) => t.id === initialTrackId) : null;
      if (match) {
        setCurrentTrack(match);
      }
    }
  }, [queue, initialTrackId, currentTrack]);

  // Handle ambient color updates when track artwork changes
  useEffect(() => {
    if (!currentTrack?.metadata.artworkUrl) {
      setAmbientColors({
        primary: 'rgba(56, 189, 248, 0.15)',
        glow: 'rgba(99, 102, 241, 0.12)',
      });
      return;
    }

    let isMounted = true;
    extractDominantColor(currentTrack.metadata.artworkUrl).then((colors) => {
      if (isMounted && colors) {
        setAmbientColors(colors);
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty('--ambient-color', colors.primary);
          document.documentElement.style.setProperty('--ambient-glow', colors.glow);
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [currentTrack?.metadata.artworkUrl]);

  // Load and parse lyrics whenever currentTrack changes
  useEffect(() => {
    let isCancelled = false;
    setLyrics([]);

    async function loadLyrics() {
      if (!currentTrack) return;

      try {
        let text: string | null = null;
        if (currentTrack.lrcContent) {
          text = currentTrack.lrcContent;
        } else if (currentTrack.lrcHandle) {
          const file = await currentTrack.lrcHandle.getFile();
          text = await file.text();
        } else if (currentTrack.lrcFile) {
          text = await currentTrack.lrcFile.text();
        }

        if (text && !isCancelled) {
          const parsed = parseLrc(text);
          setLyrics(parsed);
        }
      } catch {
        if (!isCancelled) setLyrics([]);
      }
    }

    loadLyrics();

    return () => {
      isCancelled = true;
    };
  }, [currentTrack]);

  // Audio source loader
  const loadAudioSource = useCallback(async (track: TrackItem, autoPlay = true) => {
    const audio = audioRef.current;
    if (!audio) return;

    const requestId = ++loadRequestIdRef.current;
    setPlaybackError(null);

    // Revoke previous blob object URL to free memory safely
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
    }

    try {
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
            // Revoke previous artwork if new artwork was generated
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
            setCurrentTrack({ ...track });
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

  // Play a specific track, optionally providing a new playback queue
  const playTrack = useCallback(
    (track: TrackItem, newQueue?: TrackItem[], autoPlay = true) => {
      if (newQueue && newQueue.length > 0) {
        setQueue(newQueue);
        queueRef.current = newQueue;
      } else if (!queueRef.current.some((t) => t.id === track.id)) {
        const nextQ = [...queueRef.current, track];
        setQueue(nextQ);
        queueRef.current = nextQ;
      }
      setCurrentTrack(track);
      loadAudioSource(track, autoPlay);
    },
    [loadAudioSource]
  );

  // Play an entire queue starting from startIndex or 0
  const playQueue = useCallback(
    (tracks: TrackItem[], startIndex = 0, autoPlay = true) => {
      if (tracks.length === 0) return;
      setQueue(tracks);
      queueRef.current = tracks;
      const target = tracks[startIndex] || tracks[0];
      setCurrentTrack(target);
      loadAudioSource(target, autoPlay);
    },
    [loadAudioSource]
  );

  // Insert track immediately after currentTrack in queue (Play Next)
  const playNext = useCallback(
    (track: TrackItem) => {
      if (!currentTrackRef.current) {
        playTrack(track, [track], true);
        return;
      }
      setQueue((prevQueue) => {
        const curIdx = prevQueue.findIndex((t) => t.id === currentTrackRef.current?.id);
        const nextQueue = [...prevQueue];
        if (curIdx >= 0) {
          nextQueue.splice(curIdx + 1, 0, track);
        } else {
          nextQueue.push(track);
        }
        queueRef.current = nextQueue;
        return nextQueue;
      });
    },
    [playTrack]
  );

  // Append track(s) to end of queue (Add to Queue)
  const addToQueue = useCallback(
    (trackOrTracks: TrackItem | TrackItem[]) => {
      const incoming = Array.isArray(trackOrTracks) ? trackOrTracks : [trackOrTracks];
      if (incoming.length === 0) return;

      if (!currentTrackRef.current && queueRef.current.length === 0) {
        playTrack(incoming[0], incoming, true);
        return;
      }

      setQueue((prevQueue) => {
        const nextQueue = [...prevQueue, ...incoming];
        queueRef.current = nextQueue;
        return nextQueue;
      });
    },
    [playTrack]
  );

  // Remove track at index from queue
  const removeFromQueue = useCallback((index: number) => {
    setQueue((prevQueue) => {
      if (index < 0 || index >= prevQueue.length) return prevQueue;
      const nextQueue = prevQueue.filter((_, idx) => idx !== index);
      queueRef.current = nextQueue;
      return nextQueue;
    });
  }, []);

  // Clear upcoming items in queue (preserving current track)
  const clearQueue = useCallback(() => {
    if (currentTrackRef.current) {
      setQueue([currentTrackRef.current]);
      queueRef.current = [currentTrackRef.current];
    } else {
      setQueue([]);
      queueRef.current = [];
    }
  }, []);

  // Reorder queue items
  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    setQueue((prevQueue) => {
      if (
        fromIndex < 0 ||
        fromIndex >= prevQueue.length ||
        toIndex < 0 ||
        toIndex >= prevQueue.length ||
        fromIndex === toIndex
      ) {
        return prevQueue;
      }
      const nextQueue = [...prevQueue];
      const [moved] = nextQueue.splice(fromIndex, 1);
      nextQueue.splice(toIndex, 0, moved);
      queueRef.current = nextQueue;
      return nextQueue;
    });
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack) {
      if (queueRef.current.length > 0) {
        playTrack(queueRef.current[0], undefined, true);
      }
      return;
    }

    // If track is selected but audio source hasn't loaded yet
    if (!activeUrlRef.current && currentTrack) {
      playTrack(currentTrack, undefined, true);
      return;
    }

    if (audio.paused) {
      audio.play().catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setPlaybackError(`Playback failed: ${err.message}`);
        }
      });
    } else {
      audio.pause();
    }
  }, [currentTrack, playTrack]);

  // Advance to next track in queue
  const nextTrack = useCallback(() => {
    const currentList = queueRef.current;
    if (currentList.length === 0) return;

    if (!currentTrack) {
      playTrack(currentList[0], undefined, true);
      return;
    }

    if (shuffle) {
      const otherIndices = currentList
        .map((_, i) => i)
        .filter((i) => currentList[i].id !== currentTrack.id);
      const nextIndex =
        otherIndices.length > 0
          ? otherIndices[Math.floor(Math.random() * otherIndices.length)]
          : 0;
      playTrack(currentList[nextIndex], undefined, true);
      return;
    }

    const currentIndex = currentList.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex === -1 || currentIndex === currentList.length - 1) {
      if (repeatMode === 'all') {
        playTrack(currentList[0], undefined, true);
      } else {
        setIsPlaying(false);
      }
    } else {
      playTrack(currentList[currentIndex + 1], undefined, true);
    }
  }, [currentTrack, shuffle, repeatMode, playTrack]);

  // Return to previous track in queue
  const prevTrack = useCallback(() => {
    const currentList = queueRef.current;
    if (currentList.length === 0) return;

    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    if (!currentTrack) {
      playTrack(currentList[0], undefined, true);
      return;
    }

    const currentIndex = currentList.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex > 0) {
      playTrack(currentList[currentIndex - 1], undefined, true);
    } else if (repeatMode === 'all') {
      playTrack(currentList[currentList.length - 1], undefined, true);
    } else {
      if (audio) audio.currentTime = 0;
    }
  }, [currentTrack, repeatMode, playTrack]);

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
        pendingSeekRef.current = null;
      }
    };

    const onEnded = () => {
      if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        nextTrack();
      }
    };

    const onError = () => {
      const err = audio.error;

      // Ignore errors when no track is actively assigned, no src attribute is set, or during cleanup
      if (!activeUrlRef.current || !currentTrackRef.current || !audio.hasAttribute('src')) {
        return;
      }

      // Ignore aborted errors from switching tracks
      if (!err || (typeof MediaError !== 'undefined' && err.code === MediaError.MEDIA_ERR_ABORTED)) {
        return;
      }

      // Ignore empty src errors
      if (err.message && /empty src/i.test(err.message)) {
        return;
      }

      let message = 'An error occurred while playing this audio file.';
      if (typeof MediaError !== 'undefined') {
        switch (err.code) {
          case MediaError.MEDIA_ERR_NETWORK:
            message = 'A network or file read error occurred.';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            message = 'Audio decode failed. The audio codec or file may be corrupted.';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: {
            const trackName = currentTrackRef.current?.name || '';
            const isConfirmedUnsupported =
              Boolean(err.message && /unsupported_codec|no decoder|codec not supported/i.test(err.message)) ||
              Boolean(trackName && !isFormatSupportedByBrowser(trackName));

            if (isConfirmedUnsupported) {
              message = 'This audio format or codec may not be supported by your browser.';
              if (currentTrackRef.current) {
                currentTrackRef.current.status = 'unsupported';
                if (onTrackStatusChangedRef.current) {
                  onTrackStatusChangedRef.current(currentTrackRef.current.id, 'unsupported');
                }
              }
            } else {
              // Ambiguous Code 4 / demuxer / corrupted stream errors default to decode failure, not unsupported
              message = 'Audio decode failed. The audio codec or file may be corrupted.';
            }
            break;
          }
          default:
            message = err.message || 'Unable to play this audio file.';
            break;
        }
      }

      console.error('[Luna Music] Audio playback error:', {
        code: err.code,
        message: err.message,
        track: currentTrackRef.current?.name,
      });

      setPlaybackError(message);
      setIsPlaying(false);
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [repeatMode, nextTrack]);

  // Persist playback position throttled
  useEffect(() => {
    if (!currentTrack) return;
    const interval = setInterval(() => {
      if (audioRef.current && isPlaying) {
        storePlaybackState({
          lastTrackId: currentTrack.id,
          lastPosition: audioRef.current.currentTime,
        });
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [currentTrack, isPlaying]);

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
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    repeatMode,
    shuffle,
    playbackError,
    clearPlaybackError,
    lyrics,
    ambientColors,
    queue,
    playTrack,
    playQueue,
    playNext,
    addToQueue,
    removeFromQueue,
    clearQueue,
    reorderQueue,
    togglePlay,
    nextTrack,
    prevTrack,
    seekTo,
    seekRelative,
    changeVolume,
    adjustVolume,
    toggleMute,
    cycleRepeatMode,
    toggleShuffle,
  };
}
