import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SUPPORTED_AUDIO_EXTENSIONS,
  SUPPORTED_AUDIO_PICKER_EXTENSIONS,
  AUDIO_FILE_INPUT_ACCEPT,
  isSupportedAudioFile,
  getMimeTypeForFilename,
  isFormatSupportedByBrowser,
  evaluatePlaybackMediaError,
} from '../src/utils/audioFileTypes';
import { parseFileList, parseSelectedFiles } from '../src/services/fallbackAccess';
import { promptOpenFiles, scanRootFolderHandle } from '../src/services/directoryAccess';
import { createFallbackMetadata, extractAudioMetadata } from '../src/utils/metadata';
import { applyAddToQueue, applyPlayNext, getNextTrackToPlay } from '../src/utils/queueAlgorithms';
import { TrackItem } from '../src/types/music';

function makeFile(name: string, relativePath?: string, size = 1024): File {
  const bytes = new Uint8Array(size);
  const file = new File([bytes], name, {
    type: name.toLowerCase().endsWith('.webm') ? 'audio/webm' : 'audio/mpeg',
    lastModified: 1700000000000,
  });
  if (relativePath) {
    Object.defineProperty(file, 'webkitRelativePath', {
      value: relativePath,
      configurable: true,
    });
  }
  return file;
}

function makeMockFileHandle(name: string, size = 1024): FileSystemFileHandle {
  const file = makeFile(name, undefined, size);
  return {
    kind: 'file',
    name,
    getFile: vi.fn().mockResolvedValue(file),
    queryPermission: vi.fn().mockResolvedValue('granted'),
    requestPermission: vi.fn().mockResolvedValue('granted'),
    isSameEntry: vi.fn().mockResolvedValue(false),
  } as unknown as FileSystemFileHandle;
}

function makeMockDirHandle(
  name: string,
  entries: (FileSystemFileHandle | FileSystemDirectoryHandle)[]
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    values: async function* () {
      for (const entry of entries) {
        yield entry;
      }
    },
    queryPermission: vi.fn().mockResolvedValue('granted'),
    requestPermission: vi.fn().mockResolvedValue('granted'),
    isSameEntry: vi.fn().mockResolvedValue(false),
  } as unknown as FileSystemDirectoryHandle;
}

describe('WebM Audio Format Support', () => {
  const originalAudio = globalThis.Audio;

  afterEach(() => {
    globalThis.Audio = originalAudio;
    vi.restoreAllMocks();
  });

  it('recognises .webm, .WEBM (case-insensitive), and keeps .weba intact', () => {
    expect(SUPPORTED_AUDIO_EXTENSIONS.has('webm')).toBe(true);
    expect(SUPPORTED_AUDIO_EXTENSIONS.has('weba')).toBe(true);
    expect(isSupportedAudioFile('track.webm')).toBe(true);
    expect(isSupportedAudioFile('TRACK.WEBM')).toBe(true);
    expect(isSupportedAudioFile('Mix.WeBm')).toBe(true);
    expect(isSupportedAudioFile('audio.weba')).toBe(true);
    expect(isSupportedAudioFile('AUDIO.WEBA')).toBe(true);
  });

  it('maps both .webm and .weba to audio/webm and preserves existing MIME mappings', () => {
    expect(getMimeTypeForFilename('music.webm')).toBe('audio/webm');
    expect(getMimeTypeForFilename('MUSIC.WEBM')).toBe('audio/webm');
    expect(getMimeTypeForFilename('music.weba')).toBe('audio/webm');

    // Existing formats remain unchanged
    expect(getMimeTypeForFilename('song.mp3')).toBe('audio/mpeg');
    expect(getMimeTypeForFilename('song.flac')).toBe('audio/flac');
    expect(getMimeTypeForFilename('song.wav')).toBe('audio/wav');
    expect(getMimeTypeForFilename('song.ogg')).toBe('audio/ogg');
    expect(getMimeTypeForFilename('song.opus')).toBe('audio/ogg; codecs="opus"');
    expect(isSupportedAudioFile('song.mp3')).toBe(true);
    expect(isSupportedAudioFile('song.flac')).toBe(true);
    expect(isSupportedAudioFile('song.wav')).toBe(true);
    expect(isSupportedAudioFile('song.ogg')).toBe(true);
    expect(isSupportedAudioFile('song.opus')).toBe(true);
  });

  it('excludes unsupported extensions', () => {
    expect(isSupportedAudioFile('video.mp4')).toBe(false);
    expect(isSupportedAudioFile('movie.mkv')).toBe(false);
    expect(isSupportedAudioFile('notes.txt')).toBe(false);
    expect(isSupportedAudioFile('cover.jpg')).toBe(false);
    expect(isSupportedAudioFile('document.pdf')).toBe(false);
    expect(getMimeTypeForFilename('video.mp4')).toBeNull();
  });

  it('detects browser support for .webm via canPlayType() and handles codec errors accurately', () => {
    const canPlayTypeSpy = vi.fn((mime: string) => (mime === 'audio/webm' ? 'probably' : ''));
    globalThis.Audio = vi.fn(function () {
      return { canPlayType: canPlayTypeSpy };
    }) as unknown as typeof Audio;

    expect(isFormatSupportedByBrowser('track.webm')).toBe(true);
    expect(canPlayTypeSpy).toHaveBeenCalledWith('audio/webm');

    // Ambiguous Code 4 error on a browser-supported WebM should NOT mark as unsupported format
    const ambiguous = evaluatePlaybackMediaError(
      { code: 4, message: 'DEMUXER_ERROR_COULD_NOT_OPEN' },
      'track.webm'
    );
    expect(ambiguous?.isUnsupported).toBe(false);
    expect(ambiguous?.message).toContain('Audio decode failed');

    // Explicit unsupported codec error inside a WebM file reports user-friendly unsupported message
    const badCodec = evaluatePlaybackMediaError(
      { code: 4, message: 'No decoder available for unsupported_codec' },
      'track.webm'
    );
    expect(badCodec?.isUnsupported).toBe(true);
    expect(badCodec?.message).toBe('This audio format or codec may not be supported by your browser.');

    // When browser reports no support for audio/webm
    canPlayTypeSpy.mockReturnValue('');
    expect(isFormatSupportedByBrowser('track.webm')).toBe(false);
    const unsupportedBrowser = evaluatePlaybackMediaError({ code: 4, message: '' }, 'track.webm');
    expect(unsupportedBrowser?.isUnsupported).toBe(true);
  });

  it('includes .webm in File System Access picker and fallback file input accept lists', async () => {
    expect(SUPPORTED_AUDIO_PICKER_EXTENSIONS).toContain('.webm');
    expect(SUPPORTED_AUDIO_PICKER_EXTENSIONS).toContain('.weba');
    expect(AUDIO_FILE_INPUT_ACCEPT).toContain('.webm');
    expect(AUDIO_FILE_INPUT_ACCEPT).toContain('audio/*');
    expect(AUDIO_FILE_INPUT_ACCEPT).toContain('.lrc');

    const mockPicker = vi.fn().mockResolvedValue([]);
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      value: { showOpenFilePicker: mockPicker },
      configurable: true,
    });

    try {
      await promptOpenFiles();
      expect(mockPicker).toHaveBeenCalledTimes(1);
      const options = mockPicker.mock.calls[0][0];
      expect(options.types[0].accept['audio/*']).toContain('.webm');
      expect(options.types[0].accept['audio/*']).toContain('.weba');
    } finally {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
      });
    }
  });

  it('imports single and multiple .webm files via fallback file selection', () => {
    const single = parseSelectedFiles([makeFile('solo.webm')]);
    expect(single).not.toBeNull();
    expect(single!.flatPlaylist.map((t) => t.name)).toEqual(['solo.webm']);

    const multi = parseSelectedFiles([
      makeFile('01 - Opening.webm'),
      makeFile('02 - Theme.WEBM'),
      makeFile('03 - Finale.mp3'),
      makeFile('readme.txt'),
    ]);
    expect(multi).not.toBeNull();
    expect(multi!.flatPlaylist.map((t) => t.name)).toEqual([
      '01 - Opening.webm',
      '02 - Theme.WEBM',
      '03 - Finale.mp3',
    ]);
  });

  it('scans mixed audio folders recursively and includes .webm while excluding unsupported files', async () => {
    // 1. File System Access API recursive scan
    const subDir = makeMockDirHandle('Album', [
      makeMockFileHandle('02 - Nested.webm'),
      makeMockFileHandle('02 - Nested.lrc'),
      makeMockFileHandle('03 - Lossless.flac'),
      makeMockFileHandle('cover.png'),
    ]);
    const rootDir = makeMockDirHandle('Music', [
      makeMockFileHandle('01 - Root.WEBM'),
      makeMockFileHandle('04 - Classic.mp3'),
      makeMockFileHandle('05 - Legacy.weba'),
      makeMockFileHandle('notes.md'),
      subDir,
    ]);

    const scanned = await scanRootFolderHandle(rootDir, 'folder-1');
    const names = scanned.tracks.map((t) => t.name).sort();
    expect(names).toEqual([
      '01 - Root.WEBM',
      '02 - Nested.webm',
      '03 - Lossless.flac',
      '04 - Classic.mp3',
      '05 - Legacy.weba',
    ]);
    const nestedWebm = scanned.tracks.find((t) => t.name === '02 - Nested.webm');
    expect(nestedWebm?.lrcHandle?.name).toBe('02 - Nested.lrc');

    // 2. Fallback folder input scan
    const fallbackLib = parseFileList([
      makeFile('01 - Intro.webm', 'Mix/01 - Intro.webm'),
      makeFile('02 - Track.ogg', 'Mix/Sub/02 - Track.ogg'),
      makeFile('03 - Track.opus', 'Mix/Sub/03 - Track.opus'),
      makeFile('04 - Track.wav', 'Mix/Sub/04 - Track.wav'),
      makeFile('clip.mp4', 'Mix/clip.mp4'),
    ]);
    expect(fallbackLib).not.toBeNull();
    expect(fallbackLib!.flatPlaylist.map((t) => t.name)).toEqual([
      '01 - Intro.webm',
      '02 - Track.ogg',
      '03 - Track.opus',
      '04 - Track.wav',
    ]);
  });

  it('falls back gracefully when WebM metadata extraction fails', async () => {
    const fallback = createFallbackMetadata('01 - Ambient_Track.webm', 'Ambient/01 - Ambient_Track.webm');
    expect(fallback.title).toBe('Ambient Track');
    expect(fallback.artist).toBe('Unknown Artist');
    expect(fallback.album).toBe('Unknown Album');

    const invalidWebmBlob = new Blob([new Uint8Array([0x01, 0x02, 0x03, 0x04])], {
      type: 'audio/webm',
    });
    const extracted = await extractAudioMetadata(invalidWebmBlob, fallback.title);
    expect(extracted.isMetadataLoaded).toBe(false);
  });

  it('allows WebM tracks to enter and advance through the playback queue', () => {
    const mp3Track: TrackItem = {
      id: 'f1:01.mp3',
      name: '01.mp3',
      relativePath: '01.mp3',
      size: 1000,
      lastModified: 1000,
      status: 'normal',
      metadata: createFallbackMetadata('01.mp3'),
    };
    const webmTrack: TrackItem = {
      id: 'f1:02.webm',
      name: '02.webm',
      relativePath: '02.webm',
      size: 2000,
      lastModified: 2000,
      status: 'normal',
      metadata: createFallbackMetadata('02.webm'),
    };
    const flacTrack: TrackItem = {
      id: 'f1:03.flac',
      name: '03.flac',
      relativePath: '03.flac',
      size: 3000,
      lastModified: 3000,
      status: 'normal',
      metadata: createFallbackMetadata('03.flac'),
    };

    const { nextQueue, outcome } = applyPlayNext([mp3Track, flacTrack], mp3Track, webmTrack);
    expect(outcome).toBe('added');
    expect(nextQueue.map((t) => t.id)).toEqual(['f1:01.mp3', 'f1:02.webm', 'f1:03.flac']);

    const next = getNextTrackToPlay(nextQueue, mp3Track, false, 'off', null);
    expect(next.nextTrack?.id).toBe('f1:02.webm');

    const added = applyAddToQueue([mp3Track], mp3Track, webmTrack);
    expect(added.addedCount).toBe(1);
    expect(added.nextQueue.map((t) => t.id)).toEqual(['f1:01.mp3', 'f1:02.webm']);
  });
});
