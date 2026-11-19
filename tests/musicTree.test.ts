import { describe, it, expect } from 'vitest';
import {
  isSupportedAudioFile,
  isLrcFile,
  stripExtension,
  buildFolderTree,
  flattenTreeToDfsPlaylist,
  findFolderNodeByPath,
  getBreadcrumbs,
} from '../src/utils/musicTree';
import { TrackItem } from '../src/types/music';

function makeTrack(relativePath: string, name: string): TrackItem {
  return {
    id: relativePath,
    name,
    relativePath,
    size: 1000,
    lastModified: 1000,
    metadata: {
      title: name,
      artist: 'Artist',
      album: 'Album',
      isMetadataLoaded: false,
    },
  };
}

describe('musicTree', () => {
  it('correctly identifies supported audio file extensions and rejects others', () => {
    expect(isSupportedAudioFile('song.mp3')).toBe(true);
    expect(isSupportedAudioFile('track.FLAC')).toBe(true);
    expect(isSupportedAudioFile('audio.m4a')).toBe(true);
    expect(isSupportedAudioFile('sound.wav')).toBe(true);
    expect(isSupportedAudioFile('clip.ogg')).toBe(true);
    expect(isSupportedAudioFile('stream.opus')).toBe(true);
    expect(isSupportedAudioFile('song.aac')).toBe(true);

    // Unsupported or non-audio
    expect(isSupportedAudioFile('movie.mp4')).toBe(false);
    expect(isSupportedAudioFile('video.mkv')).toBe(false);
    expect(isSupportedAudioFile('lyrics.lrc')).toBe(false);
    expect(isSupportedAudioFile('notes.txt')).toBe(false);
    expect(isSupportedAudioFile('.DS_Store')).toBe(false);
  });

  it('identifies .lrc companion lyric files', () => {
    expect(isLrcFile('song.lrc')).toBe(true);
    expect(isLrcFile('SONG.LRC')).toBe(true);
    expect(isLrcFile('song.mp3')).toBe(false);
  });

  it('strips file extensions properly', () => {
    expect(stripExtension('01 - Song.mp3')).toBe('01 - Song');
    expect(stripExtension('Track.flac')).toBe('Track');
    expect(stripExtension('noext')).toBe('noext');
  });

  it('builds a naturally sorted folder tree with deterministic DFS ordering', () => {
    const rawTracks: TrackItem[] = [
      makeTrack('Pink Floyd/02 - Time.flac', '02 - Time.flac'),
      makeTrack('Pink Floyd/10 - Eclipse.flac', '10 - Eclipse.flac'),
      makeTrack('Pink Floyd/01 - Speak to Me.flac', '01 - Speak to Me.flac'),
      makeTrack('Queen/Bohemian Rhapsody.mp3', 'Bohemian Rhapsody.mp3'),
      makeTrack('Intro.wav', 'Intro.wav'),
    ];

    const tree = buildFolderTree('Music Library', rawTracks);

    expect(tree.name).toBe('Music Library');
    expect(tree.totalTrackCount).toBe(5);
    expect(tree.tracks.map((t) => t.name)).toEqual(['Intro.wav']);
    expect(tree.subfolders.map((f) => f.name)).toEqual(['Pink Floyd', 'Queen']);

    // Pink Floyd natural sorting
    const pfFolder = tree.subfolders[0];
    expect(pfFolder.tracks.map((t) => t.name)).toEqual([
      '01 - Speak to Me.flac',
      '02 - Time.flac',
      '10 - Eclipse.flac',
    ]);

    // Flattening to DFS order
    const dfs = flattenTreeToDfsPlaylist(tree);
    expect(dfs.map((t) => t.relativePath)).toEqual([
      'Intro.wav',
      'Pink Floyd/01 - Speak to Me.flac',
      'Pink Floyd/02 - Time.flac',
      'Pink Floyd/10 - Eclipse.flac',
      'Queen/Bohemian Rhapsody.mp3',
    ]);
  });

  it('finds folder nodes by path and constructs breadcrumbs', () => {
    const rawTracks: TrackItem[] = [
      makeTrack('Rock/Classic/Queen/Bohemian Rhapsody.mp3', 'Bohemian Rhapsody.mp3'),
    ];

    const tree = buildFolderTree('Library', rawTracks);
    const found = findFolderNodeByPath(tree, 'Rock/Classic');
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Classic');
    expect(found?.subfolders[0].name).toBe('Queen');

    const crumbs = getBreadcrumbs('Library', 'Rock/Classic/Queen');
    expect(crumbs).toEqual([
      { name: 'Library', path: '' },
      { name: 'Rock', path: 'Rock' },
      { name: 'Classic', path: 'Rock/Classic' },
      { name: 'Queen', path: 'Rock/Classic/Queen' },
    ]);
  });
});
