import { useState, useEffect, useRef, useCallback } from 'react';
import { RepeatMode } from '../types/music';
import {
  storePlaybackState,
  getStoredPlaybackState,
} from '../services/idbStorage';

interface UsePlaybackPreferencesProps {
  initialRepeatMode: RepeatMode;
  initialShuffle: boolean;
  audioEngine: {
    volume: number;
    isMuted: boolean;
    changeVolume: (v: number) => void;
    adjustVolume: (d: number) => void;
    toggleMute: () => void;
    applyHydratedSettings: (settings: { volume?: number; isMuted?: boolean }) => void;
  };
}

export function usePlaybackPreferences({
  initialRepeatMode,
  initialShuffle,
  audioEngine,
}: UsePlaybackPreferencesProps) {
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(initialRepeatMode);
  const [shuffle, setShuffle] = useState<boolean>(initialShuffle);

  const repeatModeRef = useRef<RepeatMode>(repeatMode);
  repeatModeRef.current = repeatMode;

  const shuffleRef = useRef<boolean>(shuffle);
  shuffleRef.current = shuffle;

  const userInteractedRef = useRef<{
    volume: boolean;
    repeatMode: boolean;
    shuffle: boolean;
    isMuted: boolean;
  }>({
    volume: false,
    repeatMode: false,
    shuffle: false,
    isMuted: false,
  });

  // Asynchronously hydrate persistent settings from IndexedDB (fallback / verification)
  useEffect(() => {
    let isCancelled = false;
    getStoredPlaybackState()
      .then((stored) => {
        if (isCancelled || !stored) return;

        if (!userInteractedRef.current.volume && typeof stored.volume === 'number') {
          audioEngine.applyHydratedSettings({
            volume: stored.volume,
            isMuted:
              !userInteractedRef.current.isMuted && typeof stored.isMuted === 'boolean'
                ? stored.isMuted
                : undefined,
          });
        } else if (!userInteractedRef.current.isMuted && typeof stored.isMuted === 'boolean') {
          audioEngine.applyHydratedSettings({ isMuted: stored.isMuted });
        }

        if (!userInteractedRef.current.repeatMode && stored.repeatMode) {
          setRepeatMode(stored.repeatMode);
        }
        if (!userInteractedRef.current.shuffle && typeof stored.shuffle === 'boolean') {
          setShuffle(stored.shuffle);
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [audioEngine]);

  const changeVolume = useCallback(
    (newVol: number) => {
      userInteractedRef.current.volume = true;
      userInteractedRef.current.isMuted = true;
      audioEngine.changeVolume(newVol);
    },
    [audioEngine]
  );

  const adjustVolume = useCallback(
    (delta: number) => {
      userInteractedRef.current.volume = true;
      userInteractedRef.current.isMuted = true;
      audioEngine.adjustVolume(delta);
    },
    [audioEngine]
  );

  const toggleMute = useCallback(() => {
    userInteractedRef.current.isMuted = true;
    audioEngine.toggleMute();
  }, [audioEngine]);

  const cycleRepeatMode = useCallback(() => {
    userInteractedRef.current.repeatMode = true;
    setRepeatMode((prev) => {
      const next: RepeatMode = prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off';
      storePlaybackState({ repeatMode: next });
      return next;
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    userInteractedRef.current.shuffle = true;
    setShuffle((prev) => {
      const next = !prev;
      storePlaybackState({ shuffle: next });
      return next;
    });
  }, []);

  return {
    repeatMode,
    shuffle,
    repeatModeRef,
    shuffleRef,
    changeVolume,
    adjustVolume,
    toggleMute,
    cycleRepeatMode,
    toggleShuffle,
  };
}
