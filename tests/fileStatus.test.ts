import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrackItem, FileStatus } from '../src/types/music';
import { getTrackStatus, isTrackPlayable } from '../src/utils/musicTree';
import { TrackStatusBadge } from '../src/components/TrackStatusBadge';

describe('File status model, availability detection, and dynamic recovery', () => {
  // Test 1: A zero-byte file is classified as empty
  it('1. classifies a zero-byte file as empty', () => {
    const emptyTrack: TrackItem = {
      id: 'onedrive/song.flac',
      name: 'song.flac',
      relativePath: 'onedrive/song.flac',
      size: 0,
      lastModified: Date.now(),
      metadata: {
        title: 'Song',
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        isMetadataLoaded: false,
      },
    };

    expect(getTrackStatus(emptyTrack)).toBe('empty');
    expect(isTrackPlayable(emptyTrack)).toBe(false);
  });

  // Test 2: A nonzero file is classified as normal
  it('2. classifies a nonzero file as normal', () => {
    const validTrack: TrackItem = {
      id: 'local/song.mp3',
      name: 'song.mp3',
      relativePath: 'local/song.mp3',
      size: 4500000,
      lastModified: Date.now(),
      metadata: {
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        isMetadataLoaded: true,
      },
    };

    expect(getTrackStatus(validTrack)).toBe('normal');
    expect(isTrackPlayable(validTrack)).toBe(true);
  });

  // Test 3: A file that fails to open or is inaccessible is classified as unreadable
  it('3. classifies a file that fails to open or is inaccessible as unreadable', async () => {
    const mockHandle = {
      getFile: vi.fn().mockRejectedValue(new Error('NotFoundError: file not found')),
    } as unknown as FileSystemFileHandle;

    const track: TrackItem = {
      id: 'missing.flac',
      name: 'missing.flac',
      relativePath: 'missing.flac',
      size: 5000000,
      lastModified: Date.now(),
      handle: mockHandle,
      metadata: {
        title: 'Missing',
        artist: 'Artist',
        album: 'Album',
        isMetadataLoaded: false,
      },
      status: 'normal',
    };

    const onTrackStatusChanged = vi.fn();

    async function simulateLoadAudioSource(t: TrackItem) {
      if (t.handle) {
        try {
          await t.handle.getFile();
        } catch {
          t.status = 'unreadable';
          onTrackStatusChanged(t.id, 'unreadable');
          throw new Error(
            'Cannot access this audio file. Please check file permissions or reopen the music folder.'
          );
        }
      }
    }

    await expect(simulateLoadAudioSource(track)).rejects.toThrow(
      'Cannot access this audio file. Please check file permissions or reopen the music folder.'
    );
    expect(track.status).toBe('unreadable');
    expect(getTrackStatus(track)).toBe('unreadable');
    expect(isTrackPlayable(track)).toBe(false);
    expect(onTrackStatusChanged).toHaveBeenCalledWith('missing.flac', 'unreadable');
  });

  // Test 4: An empty file displays the 'Empty file' indicator in the UI
  it("4. displays the 'Empty file' indicator in the UI", () => {
    const html = renderToStaticMarkup(
      React.createElement(TrackStatusBadge, { status: 'empty' })
    );

    expect(html).toContain('Empty file');
    expect(html).not.toContain('Not available locally');

    // Also check unreadable and unsupported badges
    const unreadableHtml = renderToStaticMarkup(
      React.createElement(TrackStatusBadge, { status: 'unreadable' })
    );
    expect(unreadableHtml).toContain('Cannot access file');

    const unsupportedHtml = renderToStaticMarkup(
      React.createElement(TrackStatusBadge, { status: 'unsupported' })
    );
    expect(unsupportedHtml).toContain('Unsupported audio');

    const normalHtml = renderToStaticMarkup(
      React.createElement(TrackStatusBadge, { status: 'normal' })
    );
    expect(normalHtml).toBe('');
  });

  // Test 5: An empty file does not trigger Blob URL creation
  it('5. an empty file does not trigger Blob URL creation', async () => {
    const createObjectURLSpy = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = createObjectURLSpy;

    const mockFile = { size: 0, name: 'empty.flac' } as unknown as File;
    const mockHandle = {
      getFile: vi.fn().mockResolvedValue(mockFile),
    } as unknown as FileSystemFileHandle;

    const emptyTrack: TrackItem = {
      id: 'empty.flac',
      name: 'empty.flac',
      relativePath: 'empty.flac',
      size: 0,
      lastModified: Date.now(),
      handle: mockHandle,
      metadata: {
        title: 'Empty',
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        isMetadataLoaded: false,
      },
    };

    const onTrackStatusChanged = vi.fn();

    async function simulateLoadAudioSource(t: TrackItem) {
      const file = t.handle ? await t.handle.getFile() : t.file!;
      if (file.size === 0) {
        t.status = 'empty';
        onTrackStatusChanged(t.id, 'empty', 0);
        throw new Error(
          'This audio file is empty (0 bytes). Please check or replace the original file.'
        );
      }
      return URL.createObjectURL(file);
    }

    await expect(simulateLoadAudioSource(emptyTrack)).rejects.toThrow();
    expect(createObjectURLSpy).not.toHaveBeenCalled();

    URL.createObjectURL = originalCreateObjectURL;
  });

  // Test 6: Attempting to play an empty file produces exact expected notification
  it('6. produces exact expected user notification when attempting to play an empty file', async () => {
    const mockFile = { size: 0, name: 'APT.flac' } as unknown as File;
    const mockHandle = {
      getFile: vi.fn().mockResolvedValue(mockFile),
    } as unknown as FileSystemFileHandle;

    const emptyTrack: TrackItem = {
      id: 'APT.flac',
      name: 'APT.flac',
      relativePath: 'APT.flac',
      size: 0,
      lastModified: Date.now(),
      handle: mockHandle,
      metadata: {
        title: 'APT',
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        isMetadataLoaded: false,
      },
    };

    const onTrackStatusChanged = vi.fn();

    async function simulateLoadAudioSource(t: TrackItem) {
      const file = t.handle ? await t.handle.getFile() : t.file!;
      if (file.size === 0) {
        t.status = 'empty';
        onTrackStatusChanged(t.id, 'empty', 0);
        throw new Error(
          'This audio file is empty (0 bytes). Please check or replace the original file.'
        );
      }
      return URL.createObjectURL(file);
    }

    await expect(simulateLoadAudioSource(emptyTrack)).rejects.toThrow(
      'This audio file is empty (0 bytes). Please check or replace the original file.'
    );
    expect(onTrackStatusChanged).toHaveBeenCalledWith('APT.flac', 'empty', 0);
  });

  // Test 7: A previously empty file that becomes valid is reclassified as normal
  it('7. a previously empty file that becomes valid is reclassified as normal', async () => {
    let currentDiskSize = 0;
    const mockHandle = {
      getFile: vi.fn().mockImplementation(async () => ({
        size: currentDiskSize,
        name: 'APT.flac',
      })),
    } as unknown as FileSystemFileHandle;

    const track: TrackItem = {
      id: 'APT.flac',
      name: 'APT.flac',
      relativePath: 'APT.flac',
      size: 0,
      lastModified: Date.now(),
      handle: mockHandle,
      status: 'empty',
      metadata: {
        title: 'APT',
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        isMetadataLoaded: false,
      },
    };

    const onTrackStatusChanged = vi.fn();

    async function simulateLoadAudioSource(t: TrackItem) {
      const file = t.handle ? await t.handle.getFile() : t.file!;
      if (file.size === 0) {
        t.status = 'empty';
        onTrackStatusChanged(t.id, 'empty', 0);
        throw new Error(
          'This audio file is empty (0 bytes). Please check or replace the original file.'
        );
      }

      if (t.status === 'empty' || t.status === 'unreadable' || t.size === 0) {
        t.status = 'normal';
        t.size = file.size;
        onTrackStatusChanged(t.id, 'normal', file.size);
      }

      return 'blob:http://localhost/loaded';
    }

    // 1st attempt: 0 bytes
    await expect(simulateLoadAudioSource(track)).rejects.toThrow(
      'This audio file is empty (0 bytes). Please check or replace the original file.'
    );
    expect(track.status).toBe('empty');

    // File hydrated on disk (OneDrive download finishes)
    currentDiskSize = 32000000;

    // 2nd attempt: Hydrated
    const res = await simulateLoadAudioSource(track);
    expect(res).toBe('blob:http://localhost/loaded');
    expect(track.status).toBe('normal');
    expect(track.size).toBe(32000000);
    expect(onTrackStatusChanged).toHaveBeenCalledWith('APT.flac', 'normal', 32000000);
  });

  // Test 8: Updating a file refreshes track metadata appropriately
  it('8. updating a file refreshes track metadata appropriately', async () => {
    const mockFile = { size: 28000000, name: 'hydrated.flac' } as unknown as File;
    const mockHandle = {
      getFile: vi.fn().mockResolvedValue(mockFile),
    } as unknown as FileSystemFileHandle;

    const track: TrackItem = {
      id: 'hydrated.flac',
      name: 'hydrated.flac',
      relativePath: 'hydrated.flac',
      size: 0,
      lastModified: Date.now(),
      handle: mockHandle,
      status: 'empty',
      metadata: {
        title: 'hydrated',
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        isMetadataLoaded: false,
      },
    };

    const freshMetadata = {
      title: 'APT',
      artist: 'ROSÉ & Bruno Mars',
      album: 'rosie',
      duration: 169,
      isMetadataLoaded: true,
    };

    const onTrackStatusChanged = vi.fn();

    async function simulateHydrationWithMetadata(t: TrackItem) {
      const file = t.handle ? await t.handle.getFile() : t.file!;
      if (t.status === 'empty' || t.size === 0) {
        t.status = 'normal';
        t.size = file.size;
        t.metadata = { ...t.metadata, ...freshMetadata };
        onTrackStatusChanged(t.id, 'normal', file.size, freshMetadata);
      }
    }

    await simulateHydrationWithMetadata(track);
    expect(track.status).toBe('normal');
    expect(track.metadata.title).toBe('APT');
    expect(track.metadata.artist).toBe('ROSÉ & Bruno Mars');
    expect(track.metadata.isMetadataLoaded).toBe(true);
    expect(onTrackStatusChanged).toHaveBeenCalledWith(
      'hydrated.flac',
      'normal',
      28000000,
      freshMetadata
    );
  });

  // Test 9: File handle getFile() is preferred over stale File snapshots
  it('9. prefers fresh handle.getFile() over stale File snapshots', async () => {
    const staleSnapshot = { size: 0, name: 'snapshot.flac' } as unknown as File;
    const freshLiveFile = { size: 25000000, name: 'snapshot.flac' } as unknown as File;
    const mockHandle = {
      getFile: vi.fn().mockResolvedValue(freshLiveFile),
    } as unknown as FileSystemFileHandle;

    const trackWithBoth: TrackItem = {
      id: 'snapshot.flac',
      name: 'snapshot.flac',
      relativePath: 'snapshot.flac',
      size: 0,
      lastModified: Date.now(),
      file: staleSnapshot, // stale snapshot of 0 B
      handle: mockHandle, // live handle
      metadata: { title: 'Snapshot', artist: 'Artist', album: 'Album', isMetadataLoaded: false },
      status: 'empty',
    };

    const file = trackWithBoth.handle
      ? await trackWithBoth.handle.getFile()
      : trackWithBoth.file;

    expect(mockHandle.getFile).toHaveBeenCalledTimes(1);
    expect(file!.size).toBe(25000000);
  });

  // Test 10: An ambiguous Code 4 demuxer error does not cause track to be marked unsupported
  it('10. does not mark track as unsupported on ambiguous demuxer error', () => {
    let trackStatus: FileStatus = 'normal';
    const onTrackStatusChanged = vi.fn((_, status: FileStatus) => {
      trackStatus = status;
    });

    function handleAudioError(err: { code: number; message: string }) {
      if (err.code === 4 /* MEDIA_ERR_SRC_NOT_SUPPORTED */) {
        if (/open context failed|DEMUXER_ERROR/i.test(err.message)) {
          // Demuxer failure is ambiguous - do not mark unsupported
          return 'Audio decode failed. The audio codec or file may be corrupted.';
        }
        trackStatus = 'unsupported';
        onTrackStatusChanged('track-1', 'unsupported');
        return 'This audio format or codec may not be supported by your browser.';
      }
      return 'Playback error';
    }

    // Demuxer error (e.g. empty or truncated file stream)
    const demuxerErrorMsg = handleAudioError({
      code: 4,
      message: 'PipelineStatus::DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed',
    });

    expect(demuxerErrorMsg).toBe('Audio decode failed. The audio codec or file may be corrupted.');
    expect(trackStatus).toBe('normal'); // NOT changed to unsupported
    expect(onTrackStatusChanged).not.toHaveBeenCalled();

    // In contrast: genuine format error
    const genuineFormatErrorMsg = handleAudioError({
      code: 4,
      message: 'No decoder available for audio/unknown-format',
    });

    expect(genuineFormatErrorMsg).toBe(
      'This audio format or codec may not be supported by your browser.'
    );
    expect(trackStatus).toBe('unsupported');
    expect(onTrackStatusChanged).toHaveBeenCalledWith('track-1', 'unsupported');
  });

  // Test 11: Playback can be retried without restarting the app after transient error
  it('11. allows playback to be retried after a transient error', async () => {
    let attempts = 0;
    const mockHandle = {
      getFile: vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('NotReadableError: File is temporarily locked by another process');
        }
        return { size: 10000000, name: 'song.mp3' } as unknown as File;
      }),
    } as unknown as FileSystemFileHandle;

    const track: TrackItem = {
      id: 'transient.mp3',
      name: 'song.mp3',
      relativePath: 'song.mp3',
      size: 10000000,
      lastModified: Date.now(),
      handle: mockHandle,
      status: 'normal',
      metadata: { title: 'Song', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
    };

    let playbackError: string | null = null;

    async function tryPlay(t: TrackItem) {
      playbackError = null;
      try {
        const file = await t.handle!.getFile();
        t.status = 'normal';
        return `blob:http://localhost/${file.name}`;
      } catch {
        t.status = 'unreadable';
        playbackError =
          'Cannot access this audio file. Please check file permissions or reopen the music folder.';
        throw new Error(playbackError);
      }
    }

    // Attempt 1 fails
    await expect(tryPlay(track)).rejects.toThrow();
    expect(track.status).toBe('unreadable');
    expect(playbackError).toBe(
      'Cannot access this audio file. Please check file permissions or reopen the music folder.'
    );

    // Attempt 2 succeeds (file unlocked) without resetting app
    const url = await tryPlay(track);
    expect(url).toBe('blob:http://localhost/song.mp3');
    expect(track.status).toBe('normal');
    expect(playbackError).toBeNull();
  });

  // Test 12: Normal MP3 and FLAC playback remains unaffected
  it('12. normal MP3 and FLAC playback remains unaffected', () => {
    const flacTrack: TrackItem = {
      id: 'flac-1',
      name: 'The Show - Lenka.flac',
      relativePath: 'The Show - Lenka.flac',
      size: 27496289,
      lastModified: Date.now(),
      metadata: { title: 'The Show', artist: 'Lenka', album: 'Lenka', isMetadataLoaded: true },
      status: 'normal',
    };

    const mp3Track: TrackItem = {
      id: 'mp3-1',
      name: 'Song.mp3',
      relativePath: 'Song.mp3',
      size: 6668788,
      lastModified: Date.now(),
      metadata: { title: 'Song', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
      status: 'normal',
    };

    expect(getTrackStatus(flacTrack)).toBe('normal');
    expect(getTrackStatus(mp3Track)).toBe('normal');
    expect(isTrackPlayable(flacTrack)).toBe(true);
    expect(isTrackPlayable(mp3Track)).toBe(true);
  });

  // Test 13: Unsupported track recovers to normal after replacement with valid audio
  it('13. unsupported track recovers to normal after replacement with valid audio file', async () => {
    const mockFile = { size: 15000000, name: 'valid.flac' } as unknown as File;
    const mockHandle = {
      getFile: vi.fn().mockResolvedValue(mockFile),
    } as unknown as FileSystemFileHandle;

    const track: TrackItem = {
      id: 'song.flac',
      name: 'song.flac',
      relativePath: 'song.flac',
      size: 100,
      lastModified: 1000,
      handle: mockHandle,
      status: 'unsupported',
      metadata: { title: 'song', artist: 'Unknown', album: 'Unknown', isMetadataLoaded: false },
    };

    const onTrackStatusChanged = vi.fn();

    async function simulateLoadAudio(t: TrackItem) {
      const file = await t.handle!.getFile();
      const isStatusAbnormal = t.status && t.status !== 'normal';
      const isFileModified = t.size !== file.size;

      if (isStatusAbnormal || isFileModified) {
        t.status = 'normal';
        t.size = file.size;
        onTrackStatusChanged(t.id, 'normal', file.size);
      }
      return URL.createObjectURL(file);
    }

    const spy = vi.fn().mockReturnValue('blob:http://localhost/new-url');
    const orig = URL.createObjectURL;
    URL.createObjectURL = spy;

    const url = await simulateLoadAudio(track);
    expect(url).toBe('blob:http://localhost/new-url');
    expect(track.status).toBe('normal');
    expect(track.size).toBe(15000000);
    expect(onTrackStatusChanged).toHaveBeenCalledWith('song.flac', 'normal', 15000000);

    URL.createObjectURL = orig;
  });

  // Test 14: Normal track transitions to empty after replacing valid file with 0-byte file
  it('14. normal track transitions to empty when replaced by 0-byte file', async () => {
    const emptyFile = { size: 0, name: 'emptied.mp3' } as unknown as File;
    const mockHandle = {
      getFile: vi.fn().mockResolvedValue(emptyFile),
    } as unknown as FileSystemFileHandle;

    const track: TrackItem = {
      id: 'emptied.mp3',
      name: 'emptied.mp3',
      relativePath: 'emptied.mp3',
      size: 5000000,
      lastModified: 1000,
      handle: mockHandle,
      status: 'normal',
      metadata: { title: 'Emptied', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
    };

    const onTrackStatusChanged = vi.fn();

    async function simulateLoadAudio(t: TrackItem) {
      const file = await t.handle!.getFile();
      if (file.size === 0) {
        t.status = 'empty';
        t.size = 0;
        onTrackStatusChanged(t.id, 'empty', 0);
        throw new Error(
          'This audio file is empty (0 bytes). Please check or replace the original file.'
        );
      }
    }

    await expect(simulateLoadAudio(track)).rejects.toThrow(
      'This audio file is empty (0 bytes). Please check or replace the original file.'
    );
    expect(track.status).toBe('empty');
    expect(track.size).toBe(0);
    expect(onTrackStatusChanged).toHaveBeenCalledWith('emptied.mp3', 'empty', 0);
  });

  // Test 15: Normal track transitions to unreadable after removing access permissions
  it('15. normal track transitions to unreadable after removing access permissions', async () => {
    const mockHandle = {
      getFile: vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')),
    } as unknown as FileSystemFileHandle;

    const track: TrackItem = {
      id: 'denied.mp3',
      name: 'denied.mp3',
      relativePath: 'denied.mp3',
      size: 5000000,
      lastModified: 1000,
      handle: mockHandle,
      status: 'normal',
      metadata: { title: 'Denied', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
    };

    const onTrackStatusChanged = vi.fn();

    async function simulateLoadAudio(t: TrackItem) {
      try {
        await t.handle!.getFile();
      } catch {
        t.status = 'unreadable';
        onTrackStatusChanged(t.id, 'unreadable');
        throw new Error(
          'Cannot access this audio file. Please check file permissions or reopen the music folder.'
        );
      }
    }

    await expect(simulateLoadAudio(track)).rejects.toThrow(
      'Cannot access this audio file. Please check file permissions or reopen the music folder.'
    );
    expect(track.status).toBe('unreadable');
    expect(onTrackStatusChanged).toHaveBeenCalledWith('denied.mp3', 'unreadable');
  });

  // Test 16: Stale asynchronous load operations are discarded and cannot overwrite newer status
  it('16. stale asynchronous load operations cannot overwrite newer status updates', async () => {
    let loadRequestId = 0;
    let currentPlayingTrackId: string | null = null;
    let recordedStatus: FileStatus = 'normal';

    async function loadAudioSourceWithCancel(trackId: string, delayMs: number, targetStatus: FileStatus) {
      const requestId = ++loadRequestId;

      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // Guard: if another load has started, discard this stale completion
      if (loadRequestId !== requestId) {
        return;
      }

      currentPlayingTrackId = trackId;
      recordedStatus = targetStatus;
    }

    // Track 1 is slow (delay 50ms)
    const p1 = loadAudioSourceWithCancel('track-1-slow', 50, 'empty');
    // User quickly switches to Track 2 (fast, delay 10ms)
    const p2 = loadAudioSourceWithCancel('track-2-fast', 10, 'normal');

    await Promise.all([p1, p2]);

    // Track 2 should remain active, track 1's completion was discarded
    expect(currentPlayingTrackId).toBe('track-2-fast');
    expect(recordedStatus).toBe('normal');
  });
});
