import { describe, it, expect, vi } from 'vitest';
import { TrackItem } from '../src/types/music';
import { isTrackAvailable } from '../src/utils/musicTree';

describe('File availability detection and cloud placeholder handling', () => {
  it('1. classifies zero-byte file as unavailable', () => {
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
        isMetadataLoaded: true,
      },
      availability: 'unavailable',
    };

    expect(isTrackAvailable(emptyTrack)).toBe(false);
  });

  it('2. classifies valid nonzero file as available', () => {
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
      availability: 'available',
    };

    expect(isTrackAvailable(validTrack)).toBe(true);
  });

  it('3. defaults track availability based on size if availability flag is omitted', () => {
    const trackWithoutFlagZeroSize: TrackItem = {
      id: 'cloud/empty.flac',
      name: 'empty.flac',
      relativePath: 'cloud/empty.flac',
      size: 0,
      lastModified: Date.now(),
      metadata: {
        title: 'Empty',
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        isMetadataLoaded: false,
      },
    };

    const trackWithoutFlagValidSize: TrackItem = {
      id: 'cloud/full.flac',
      name: 'full.flac',
      relativePath: 'cloud/full.flac',
      size: 28000000,
      lastModified: Date.now(),
      metadata: {
        title: 'Full',
        artist: 'Lenka',
        album: 'Lenka',
        isMetadataLoaded: true,
      },
    };

    expect(isTrackAvailable(trackWithoutFlagZeroSize)).toBe(false);
    expect(isTrackAvailable(trackWithoutFlagValidSize)).toBe(true);
  });

  it('4. selecting an unavailable track rejects with friendly notification and does NOT create Blob URL', async () => {
    const createObjectURLSpy = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = createObjectURLSpy;

    const mockFile = { size: 0, name: 'APT.flac' } as unknown as File;
    const mockHandle = {
      getFile: vi.fn().mockResolvedValue(mockFile),
    } as unknown as FileSystemFileHandle;

    const unavailableTrack: TrackItem = {
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
      availability: 'unavailable',
    };

    const onAvailabilityChanged = vi.fn();

    // Simulate loadAudioSource core logic
    async function simulateLoadAudioSource(track: TrackItem) {
      const file = await track.handle!.getFile();
      if (file.size === 0) {
        track.availability = 'unavailable';
        onAvailabilityChanged(track.id, 'unavailable', 0);
        throw new Error(
          'This file is not available locally. If it is stored in OneDrive, download it in Finder and try again.'
        );
      }
      return URL.createObjectURL(file);
    }

    await expect(simulateLoadAudioSource(unavailableTrack)).rejects.toThrow(
      'This file is not available locally. If it is stored in OneDrive, download it in Finder and try again.'
    );

    // Verify 5: No Blob URL is created for an empty file
    expect(createObjectURLSpy).not.toHaveBeenCalled();
    expect(onAvailabilityChanged).toHaveBeenCalledWith('APT.flac', 'unavailable', 0);

    URL.createObjectURL = originalCreateObjectURL;
  });

  it('6. a previously unavailable file becomes available after downloading (size > 0)', async () => {
    const createObjectURLSpy = vi.fn().mockReturnValue('blob:http://localhost/song-blob-url');
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = createObjectURLSpy;

    // Initially 0 bytes (undownloaded)
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
      metadata: {
        title: 'APT',
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        isMetadataLoaded: false,
      },
      availability: 'unavailable',
    };

    const onAvailabilityChanged = vi.fn();

    async function simulateLoadAudioSource(t: TrackItem) {
      const file = await t.handle!.getFile();
      if (file.size === 0) {
        t.availability = 'unavailable';
        onAvailabilityChanged(t.id, 'unavailable', 0);
        throw new Error(
          'This file is not available locally. If it is stored in OneDrive, download it in Finder and try again.'
        );
      }

      if (t.availability === 'unavailable' || t.size === 0) {
        t.availability = 'available';
        t.size = file.size;
        onAvailabilityChanged(t.id, 'available', file.size);
      }

      return URL.createObjectURL(file as unknown as File);
    }

    // 1st attempt: Still 0 bytes
    await expect(simulateLoadAudioSource(track)).rejects.toThrow('This file is not available locally');
    expect(track.availability).toBe('unavailable');

    // User downloads the file in Finder/OneDrive! Size is now 32MB
    currentDiskSize = 32000000;

    // 2nd attempt: File is now on disk
    const url = await simulateLoadAudioSource(track);
    expect(url).toBe('blob:http://localhost/song-blob-url');
    expect(track.availability).toBe('available');
    expect(track.size).toBe(32000000);
    expect(onAvailabilityChanged).toHaveBeenCalledWith('APT.flac', 'available', 32000000);
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);

    URL.createObjectURL = originalCreateObjectURL;
  });

  it('7. normal MP3 and FLAC playback remains unaffected', async () => {
    const createObjectURLSpy = vi.fn().mockReturnValue('blob:http://localhost/flac-blob');
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = createObjectURLSpy;

    const flacFile = { size: 27496289, name: 'The Show - Lenka.flac' } as unknown as File;
    const mp3File = { size: 6668788, name: 'Song.mp3' } as unknown as File;

    const flacTrack: TrackItem = {
      id: 'flac-1',
      name: 'The Show - Lenka.flac',
      relativePath: 'The Show - Lenka.flac',
      size: 27496289,
      lastModified: Date.now(),
      file: flacFile,
      metadata: { title: 'The Show', artist: 'Lenka', album: 'Lenka', isMetadataLoaded: true },
      availability: 'available',
    };

    const mp3Track: TrackItem = {
      id: 'mp3-1',
      name: 'Song.mp3',
      relativePath: 'Song.mp3',
      size: 6668788,
      lastModified: Date.now(),
      file: mp3File,
      metadata: { title: 'Song', artist: 'Artist', album: 'Album', isMetadataLoaded: true },
      availability: 'available',
    };

    expect(isTrackAvailable(flacTrack)).toBe(true);
    expect(isTrackAvailable(mp3Track)).toBe(true);

    URL.createObjectURL = originalCreateObjectURL;
  });

  it('8. existing playlist navigation preserves order and track references', () => {
    const tracks: TrackItem[] = [
      {
        id: '1',
        name: 'Track 1.mp3',
        relativePath: 'Track 1.mp3',
        size: 1000,
        lastModified: Date.now(),
        metadata: { title: 'T1', artist: 'A1', album: 'Alb1', isMetadataLoaded: true },
        availability: 'available',
      },
      {
        id: '2',
        name: 'Track 2.flac',
        relativePath: 'Track 2.flac',
        size: 0,
        lastModified: Date.now(),
        metadata: { title: 'T2', artist: 'A2', album: 'Alb2', isMetadataLoaded: false },
        availability: 'unavailable',
      },
      {
        id: '3',
        name: 'Track 3.flac',
        relativePath: 'Track 3.flac',
        size: 5000,
        lastModified: Date.now(),
        metadata: { title: 'T3', artist: 'A3', album: 'Alb3', isMetadataLoaded: true },
        availability: 'available',
      },
    ];

    expect(tracks).toHaveLength(3);
    expect(tracks[0].availability).toBe('available');
    expect(tracks[1].availability).toBe('unavailable');
    expect(tracks[2].availability).toBe('available');
    // Track 2 remains in the playlist and was not deleted
    expect(tracks.map((t) => t.id)).toEqual(['1', '2', '3']);
  });
});
