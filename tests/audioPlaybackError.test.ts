import { describe, it, expect, vi } from 'vitest';

// Simulates audio error evaluation logic from useAudioPlayer
function evaluateAudioError(
  audio: {
    hasAttribute: (attr: string) => boolean;
    error: { code: number; message?: string } | null;
  },
  activeUrl: string | null,
  hasCurrentTrack: boolean
): string | null {
  // If no track is actively assigned, no src attribute is set, or during cleanup
  if (!activeUrl || !hasCurrentTrack || !audio.hasAttribute('src')) {
    return null;
  }

  const err = audio.error;
  if (!err || err.code === 1 /* MEDIA_ERR_ABORTED */) {
    return null;
  }

  // Ignore empty src errors
  if (err.message && /empty src/i.test(err.message)) {
    return null;
  }

  switch (err.code) {
    case 2 /* MEDIA_ERR_NETWORK */:
      return 'A network or file read error occurred.';
    case 3 /* MEDIA_ERR_DECODE */:
      return 'Audio decode failed. The audio codec or file may be corrupted.';
    case 4 /* MEDIA_ERR_SRC_NOT_SUPPORTED */:
      if (err.message && /open context failed|DEMUXER_ERROR/i.test(err.message)) {
        return 'Unable to read audio data. The file may be empty, incomplete, or corrupted.';
      }
      return 'This audio format or codec is not supported by your browser.';
    default:
      return err.message || 'Unable to play this audio file.';
  }
}

describe('Audio playback error suppression and genuine error handling', () => {
  it('suppresses errors when no track is selected', () => {
    const mockAudio = {
      hasAttribute: vi.fn().mockReturnValue(false),
      error: { code: 4, message: 'MEDIA_ELEMENT_ERROR: Empty src attribute' },
    };

    const error = evaluateAudioError(mockAudio, null, false);
    expect(error).toBeNull();
  });

  it('suppresses empty src attribute errors during cleanup or unmounting', () => {
    const mockAudio = {
      hasAttribute: vi.fn().mockReturnValue(false),
      error: { code: 4, message: 'Empty src attribute' },
    };

    const error = evaluateAudioError(mockAudio, null, true);
    expect(error).toBeNull();
  });

  it('suppresses MEDIA_ERR_ABORTED (code 1) during track switching', () => {
    const mockAudio = {
      hasAttribute: vi.fn().mockReturnValue(true),
      error: { code: 1, message: 'The user aborted playback' },
    };

    const error = evaluateAudioError(mockAudio, 'blob:http://localhost/audio-1', true);
    expect(error).toBeNull();
  });

  it('correctly reports genuine playback errors for unsupported formats', () => {
    const mockAudio = {
      hasAttribute: vi.fn().mockReturnValue(true),
      error: { code: 4, message: 'Format error' },
    };

    const error = evaluateAudioError(mockAudio, 'blob:http://localhost/unsupported-codec', true);
    expect(error).toBe('This audio format or codec is not supported by your browser.');
  });

  it('correctly reports genuine decode failures for corrupted audio files', () => {
    const mockAudio = {
      hasAttribute: vi.fn().mockReturnValue(true),
      error: { code: 3, message: 'Corrupt stream' },
    };

    const error = evaluateAudioError(mockAudio, 'blob:http://localhost/corrupted.flac', true);
    expect(error).toBe('Audio decode failed. The audio codec or file may be corrupted.');
  });

  it('correctly reports demuxer / open context failure when stream cannot be opened', () => {
    const mockAudio = {
      hasAttribute: vi.fn().mockReturnValue(true),
      error: { code: 4, message: 'PipelineStatus::DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed' },
    };

    const error = evaluateAudioError(mockAudio, 'blob:http://localhost/empty.flac', true);
    expect(error).toBe('Unable to read audio data. The file may be empty, incomplete, or corrupted.');
  });
});
