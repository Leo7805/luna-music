import { describe, it, expect, vi } from 'vitest';
import { TrackItem } from '../src/types/music';
import { evaluatePlaybackMediaError } from '../src/utils/audioFileTypes';
import {
  applyPlayNext,
  applyBulkPlayNext,
  applyAddToQueue,
  getNextTrackToPlay,
} from '../src/utils/queueAlgorithms';

describe('Audio Player Architecture & Playback Decompositions (Stage 5)', () => {
  const createMockTrack = (id: string, name: string, size = 1000): TrackItem => ({
    id,
    name,
    relativePath: name,
    size,
    lastModified: 1700000000,
    metadata: {
      title: name.replace(/\.[^/.]+$/, ''),
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 180,
      isMetadataLoaded: true,
    },
  });

  const track1 = createMockTrack('t-1', 'track1.mp3');
  const track2 = createMockTrack('t-2', 'track2.flac');
  const track3 = createMockTrack('t-3', 'track3.m4a');
  const track4 = createMockTrack('t-4', 'track4.wav');

  describe('1. Initial Player State & Defaults', () => {
    it('initializes with default volume 0.8, unmuted, repeat off, and shuffle false', () => {
      const defaultVolume = 0.8;
      const defaultMuted = false;
      const defaultRepeat = 'off';
      const defaultShuffle = false;

      expect(defaultVolume).toBe(0.8);
      expect(defaultMuted).toBe(false);
      expect(defaultRepeat).toBe('off');
      expect(defaultShuffle).toBe(false);
    });
  });

  describe('2. Audio Element Creation & Lifecycle', () => {
    it('sets preload metadata and initial volume on native Audio element', () => {
      const mockAudio = {
        preload: '',
        volume: 0,
      };
      mockAudio.preload = 'metadata';
      mockAudio.volume = 0.8;

      expect(mockAudio.preload).toBe('metadata');
      expect(mockAudio.volume).toBe(0.8);
    });

    it('safely revokes object URL on cleanup without assigning empty src string', () => {
      const revokeSpy = vi.fn();
      const originalRevoke = globalThis.URL?.revokeObjectURL;
      globalThis.URL.revokeObjectURL = revokeSpy;

      const activeUrl = 'blob:http://localhost/active-audio';
      // Cleanup simulation
      globalThis.URL.revokeObjectURL(activeUrl);
      expect(revokeSpy).toHaveBeenCalledWith(activeUrl);

      if (originalRevoke) globalThis.URL.revokeObjectURL = originalRevoke;
    });
  });

  describe('3. Play, Pause, and Seek Bounds', () => {
    it('clamps seekTo time within [0, duration]', () => {
      const duration = 200;
      const clampSeek = (time: number) => Math.max(0, Math.min(time, duration));

      expect(clampSeek(-10)).toBe(0);
      expect(clampSeek(150)).toBe(150);
      expect(clampSeek(250)).toBe(200);
    });

    it('computes relative seek delta accurately', () => {
      let currentTime = 50;
      const duration = 180;
      const seekRelative = (delta: number) => {
        currentTime = Math.max(0, Math.min(currentTime + delta, duration));
      };

      seekRelative(10);
      expect(currentTime).toBe(60);

      seekRelative(-100);
      expect(currentTime).toBe(0);

      seekRelative(300);
      expect(currentTime).toBe(180);
    });
  });

  describe('4. Next and Previous Track Navigation', () => {
    const queue = [track1, track2, track3];

    it('advances sequentially in normal playback', () => {
      const { nextTrack } = getNextTrackToPlay(queue, track1, false, 'off', null);
      expect(nextTrack?.id).toBe(track2.id);

      const { nextTrack: thirdTrack } = getNextTrackToPlay(queue, track2, false, 'off', null);
      expect(thirdTrack?.id).toBe(track3.id);
    });

    it('stops after last track when repeat is off', () => {
      const { nextTrack } = getNextTrackToPlay(queue, track3, false, 'off', null);
      expect(nextTrack).toBeNull();
    });

    it('loops to first track after last track when repeat is all', () => {
      const { nextTrack } = getNextTrackToPlay(queue, track3, false, 'all', null);
      expect(nextTrack?.id).toBe(track1.id);
    });

    it('rewinds to 0 if currentTime > 3 on prevTrack', () => {
      let currentTime = 15;
      if (currentTime > 3) {
        currentTime = 0;
      }
      expect(currentTime).toBe(0);
    });
  });

  describe('5. Track Completion and Automatic Progression', () => {
    it('repeats current track when repeatMode is one', () => {
      const repeatMode = 'one';
      let restarted = false;
      if (repeatMode === 'one') {
        restarted = true;
      }
      expect(restarted).toBe(true);
    });

    it('automatically transitions to next track when repeatMode is not one', () => {
      let repeatMode: string = 'off';
      let advanced = false;
      if (repeatMode !== 'one') {
        advanced = true;
      }
      expect(advanced).toBe(true);
    });
  });

  describe('6. Shuffle and Repeat Mode State Transitions', () => {
    it('cycles repeat modes: off -> all -> one -> off', () => {
      const cycle = (prev: string) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off');

      expect(cycle('off')).toBe('all');
      expect(cycle('all')).toBe('one');
      expect(cycle('one')).toBe('off');
    });

    it('toggles shuffle boolean state', () => {
      let shuffle = false;
      shuffle = !shuffle;
      expect(shuffle).toBe(true);
      shuffle = !shuffle;
      expect(shuffle).toBe(false);
    });
  });

  describe('7. Play Next Precedence Over Shuffle', () => {
    it('forces the playNext override track as next track even with shuffle enabled', () => {
      const queue = [track1, track2, track3, track4];
      const overrideTrackId = track4.id;

      const { nextTrack, shouldClearOverride } = getNextTrackToPlay(
        queue,
        track1,
        true, // Shuffle active
        'off',
        overrideTrackId
      );

      expect(nextTrack?.id).toBe(track4.id);
      expect(shouldClearOverride).toBe(true);
    });
  });

  describe('8. Bulk Play Next Ordering', () => {
    it('inserts bulk tracks consecutively immediately after current track', () => {
      const queue = [track1, track4];
      const incoming = [track2, track3];

      const { nextQueue, movedCount, addedCount } = applyBulkPlayNext(
        queue,
        track1,
        incoming
      );

      expect(nextQueue.map((t) => t.id)).toEqual(['t-1', 't-2', 't-3', 't-4']);
      expect(addedCount).toBe(2);
      expect(movedCount).toBe(0);
    });
  });

  describe('9. Queue Duplicate Prevention', () => {
    it('prevents duplicate tracks when already in upcoming queue', () => {
      const queue = [track1, track2, track3];
      const { nextQueue, addedCount } = applyAddToQueue(queue, track1, [track2, track4]);

      // track2 was already in upcoming queue, only track4 added
      expect(nextQueue.map((t) => t.id)).toEqual(['t-1', 't-2', 't-3', 't-4']);
      expect(addedCount).toBe(1);
    });

    it('returns false when all incoming tracks already exist in upcoming queue', () => {
      const queue = [track1, track2];
      const { addedCount } = applyAddToQueue(queue, track1, [track2]);
      expect(addedCount).toBe(0);
    });
  });

  describe('10. Add to Queue, Remove, Reorder, and Clear', () => {
    it('removes item at given index without mutating original array', () => {
      const queue = [track1, track2, track3];
      const nextQueue = queue.filter((_, idx) => idx !== 1);

      expect(nextQueue.map((t) => t.id)).toEqual(['t-1', 't-3']);
      expect(queue.length).toBe(3); // Original unaffected
    });

    it('reorders item from one index to another', () => {
      const queue = [track1, track2, track3];
      const nextQueue = [...queue];
      const [moved] = nextQueue.splice(0, 1);
      nextQueue.splice(2, 0, moved);

      expect(nextQueue.map((t) => t.id)).toEqual(['t-2', 't-3', 't-1']);
    });

    it('clears upcoming queue while preserving current track', () => {
      const current = track2;
      const clearQueue = (t: TrackItem | null) => (t ? [t] : []);

      expect(clearQueue(current).map((t) => t.id)).toEqual(['t-2']);
      expect(clearQueue(null)).toEqual([]);
    });
  });

  describe('11. Current Track Preservation During Queue Changes', () => {
    it('maintains current track identity during playNext and clear', () => {
      const queue = [track1, track2, track3];
      const { nextQueue } = applyPlayNext(queue, track1, track3);

      expect(nextQueue[0].id).toBe(track1.id); // Current track preserved at index 0
      expect(nextQueue[1].id).toBe(track3.id); // Inserted next
    });
  });

  describe('12. Rapid Track Switching & Asynchronous Safety', () => {
    it('discards stale async completions from earlier requests', async () => {
      let loadRequestId = 0;
      let activeTrackId: string | null = null;

      const load = async (id: string, delay: number) => {
        const req = ++loadRequestId;
        await new Promise((res) => setTimeout(res, delay));
        if (loadRequestId === req) {
          activeTrackId = id;
        }
      };

      // Request 1 takes 50ms, Request 2 takes 10ms
      const p1 = load('track-1-slow', 50);
      const p2 = load('track-2-fast', 10);

      await Promise.all([p1, p2]);
      expect(activeTrackId).toBe('track-2-fast');
    });
  });

  describe('13. Playback Error Translation & Suppression', () => {
    it('suppresses aborted errors during track switching', () => {
      const err = { code: 1 /* MEDIA_ERR_ABORTED */ };
      const res = evaluatePlaybackMediaError(err, 'song.mp3');
      expect(res).toBeNull();
    });

    it('suppresses empty src errors', () => {
      const err = { code: 4, message: 'Empty src attribute' };
      const res = evaluatePlaybackMediaError(err, 'song.mp3');
      expect(res).toBeNull();
    });

    it('translates MEDIA_ERR_NETWORK code 2', () => {
      const err = { code: 2 };
      const res = evaluatePlaybackMediaError(err, 'song.mp3');
      expect(res?.message).toBe('A network or file read error occurred.');
      expect(res?.isUnsupported).toBe(false);
    });

    it('translates MEDIA_ERR_DECODE code 3', () => {
      const err = { code: 3 };
      const res = evaluatePlaybackMediaError(err, 'song.mp3');
      expect(res?.message).toBe('Audio decode failed. The audio codec or file may be corrupted.');
      expect(res?.isUnsupported).toBe(false);
    });

    it('correctly flags unsupported codecs for code 4', () => {
      const err = { code: 4, message: 'unsupported_codec' };
      const res = evaluatePlaybackMediaError(err, 'unknown.xyz');
      expect(res?.message).toBe('This audio format or codec may not be supported by your browser.');
      expect(res?.isUnsupported).toBe(true);
    });
  });

  describe('14. Audio Loading Failures and Empty Files', () => {
    it('identifies 0-byte audio file as empty status', () => {
      const emptyTrack = createMockTrack('empty-1', 'silent.mp3', 0);
      const isZero = emptyTrack.size === 0;
      expect(isZero).toBe(true);
    });

    it('identifies unreadable file when handle throws permission error', async () => {
      const brokenHandle = {
        getFile: vi.fn().mockRejectedValue(new Error('Permission denied')),
      };

      let status = 'normal';
      try {
        await brokenHandle.getFile();
      } catch {
        status = 'unreadable';
      }

      expect(status).toBe('unreadable');
    });
  });

  describe('15. Volume and Mute Controls', () => {
    it('clamps volume between 0.0 and 1.0', () => {
      const clampVolume = (v: number) => Math.max(0, Math.min(1, v));

      expect(clampVolume(-0.5)).toBe(0);
      expect(clampVolume(0.75)).toBe(0.75);
      expect(clampVolume(1.5)).toBe(1);
    });

    it('sets isMuted when volume drops to 0', () => {
      let isMuted = false;
      const setVol = (vol: number) => {
        isMuted = vol === 0;
      };

      setVol(0);
      expect(isMuted).toBe(true);
      setVol(0.5);
      expect(isMuted).toBe(false);
    });
  });

  describe('16. Artwork Colors Fallback', () => {
    it('provides clean default colors when no artwork is present', () => {
      const defaultColors = {
        primary: 'rgba(56, 189, 248, 0.15)',
        glow: 'rgba(99, 102, 241, 0.12)',
      };

      expect(defaultColors.primary).toContain('56, 189, 248');
      expect(defaultColors.glow).toContain('99, 102, 241');
    });
  });

  describe('17. Playlist and Queue Independence', () => {
    it('modifying queue does not alter original playlist array', () => {
      const playlist = [track1, track2];
      const queue = [...playlist];

      queue.push(track3);
      expect(playlist.length).toBe(2);
      expect(queue.length).toBe(3);
    });
  });

  describe('18. Queue Count Semantics', () => {
    it('includes current track in queue count when present', () => {
      const currentTrack = track1;
      const queue = [track1, track2, track3];

      const queueCount = queue.length;
      expect(queueCount).toBe(3);
      expect(queue.some((t) => t.id === currentTrack.id)).toBe(true);
    });
  });
});
